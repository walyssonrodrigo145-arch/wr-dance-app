import { debugLog } from "./_core/logger";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { fcmTokens } from "../drizzle/schema";
import { and, eq, notLike } from "drizzle-orm";
import { sendPushNotification, messaging as firebaseMessaging } from "./firebaseAdmin";
import { isVapidSubscription, parseSubscription, isVapidConfigured } from "./pushService";
import { ENV } from "./_core/env";

export const fcmRouter = router({
  registerToken: protectedProcedure.input(z.object({
    token: z.string(),
    deviceInfo: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Subscrição VAPID deve ser um JSON válido {endpoint, keys}
    if (isVapidSubscription(input.token) && !parseSubscription(input.token)) {
      throw new Error("Subscrição de push inválida. Tente reativar as notificações.");
    }

    const orgId = ctx.user.organizationId!;
    const isVapid = isVapidSubscription(input.token);

    // RF-005 (dedup de migração): ao registrar uma subscrição VAPID deste usuário,
    // remove tokens FCM legados (dispositivos migram no próximo acesso).
    if (isVapid) {
      await db.delete(fcmTokens)
        .where(and(eq(fcmTokens.userId, ctx.user.id), notLike(fcmTokens.token, "{%")));
    }

    const [existing] = await db.select().from(fcmTokens).where(eq(fcmTokens.token, input.token));

    if (existing) {
      if (existing.userId !== ctx.user.id) {
         await db.update(fcmTokens)
           .set({ userId: ctx.user.id, updatedAt: new Date() })
           .where(eq(fcmTokens.token, input.token));
      }
      return { success: true, message: "Dispositivo já cadastrado!" };
    }

    await db.insert(fcmTokens).values({
      organizationId: orgId,
      userId: ctx.user.id,
      token: input.token,
      deviceInfo: input.deviceInfo || (isVapid ? "Navegador Web (VAPID)" : "Navegador Web"),
    });

    return { success: true, message: "Novo dispositivo registrado com sucesso!" };
  }),

  // RF-004/RN-001: SEM delete-all — cada dispositivo mantém sua própria subscrição.
  // Upsert idempotente do dispositivo atual com ON CONFLICT no token único.
  cleanAndRegisterToken: protectedProcedure.input(z.object({
    token: z.string(),
    deviceInfo: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    if (isVapidSubscription(input.token) && !parseSubscription(input.token)) {
      throw new Error("Subscrição de push inválida. Tente reativar as notificações.");
    }

    const orgId = ctx.user.organizationId!;
    const isVapid = isVapidSubscription(input.token);

    if (isVapid) {
      await db.delete(fcmTokens)
        .where(and(eq(fcmTokens.userId, ctx.user.id), notLike(fcmTokens.token, "{%")));
    }

    await db.insert(fcmTokens)
      .values({
        organizationId: orgId,
        userId: ctx.user.id,
        token: input.token,
        deviceInfo: input.deviceInfo || "Navegador Web",
      })
      .onConflictDoUpdate({
        target: fcmTokens.token,
        set: {
          userId: ctx.user.id,
          deviceInfo: input.deviceInfo || "Navegador Web",
          updatedAt: new Date(),
        }
      });

    return { success: true, message: "Dispositivo registrado para receber notificações!" };
  }),

  // Diagnóstico: status dos providers de push (VAPID + legado FCM)
  getFirebaseStatus: protectedProcedure.query(async () => {
    const isConfigured = isVapidConfigured() || !!firebaseMessaging;
    const hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
    const hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
    const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;

    return {
      isConfigured,
      hasProjectId,
      hasClientEmail,
      hasPrivateKey,
      provider: isVapidConfigured() ? "vapid" : (firebaseMessaging ? "fcm" : "none"),
      vapidConfigured: isVapidConfigured(),
      message: isConfigured
        ? `Push configurado via ${isVapidConfigured() ? "Web Push VAPID" : "Firebase (legado)"}.`
        : "Push NÃO configurado. Verifique VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (ou as variáveis legadas do Firebase) na VPS.",
    };
  }),

  testNotification: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Verificação crítica: algum provider de push configurado?
    if (!isVapidConfigured() && !firebaseMessaging) {
      throw new Error(
        "Serviço de push não configurado no servidor. " +
        "Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na VPS (ou as variáveis legadas FIREBASE_*)."
      );
    }
    
    const tokens = await db.select().from(fcmTokens).where(eq(fcmTokens.userId, ctx.user.id));
    if (tokens.length === 0) {
      throw new Error("Nenhum dispositivo registrado. Clique em 'Resetar / Definir Principal' para registrar este aparelho.");
    }
    
    let sentCount = 0;
    const deadTokens: string[] = [];
    const failedErrors: string[] = [];

    for (const device of tokens) {
      debugLog(`[Push Test] Tentando enviar para device: ${device.deviceInfo} | token: ${device.token.substring(0, 30)}...`);
      const res = await sendPushNotification(
        device.token,
        "Teste de Notificação 🎉",
        `Olá! Notificação de teste do WR MusicPro enviada às ${new Date().toLocaleTimeString('pt-BR')}. Tudo funcionando!`
      );
      if (res.success) {
        sentCount++;
        debugLog(`[Push Test] ✅ Sucesso para device: ${device.deviceInfo}`);
      } else {
        console.warn(`[Push Test] ❌ Falha para device: ${device.deviceInfo} — erro: ${res.error}`);
        failedErrors.push(res.error || "UNKNOWN");
        if (
          res.gone ||
          res.error === "messaging/registration-token-not-registered" ||
          res.error === "messaging/invalid-registration-token" ||
          res.error?.includes("registration-token-not-registered") ||
          res.error?.includes("invalid-registration-token") ||
          res.error?.startsWith("GONE_")
        ) {
          deadTokens.push(device.token);
        }
      }
    }
    
    // Auto-clean tokens mortos/expirados do banco
    if (deadTokens.length > 0) {
      for (const deadToken of deadTokens) {
        await db.delete(fcmTokens).where(eq(fcmTokens.token, deadToken));
      }
      debugLog(`[Push Clean] Removidos ${deadTokens.length} tokens mortos para userId ${ctx.user.id}`);
    }

    if (sentCount === 0 && tokens.length > 0) {
      const errorSummary = Array.from(new Set(failedErrors)).join(", ");
      throw new Error(
        `Envio falhou para todos os ${tokens.length} dispositivo(s). ` +
        `Erro: ${errorSummary || "desconhecido"}. ` +
        `O token foi removido automaticamente. Clique em 'Resetar / Definir Principal' uma vez mais para gerar o novo token atualizado!`
      );
    }
    
    return { success: true, sentCount, totalTokens: tokens.length, cleanedCount: deadTokens.length };
  }),
});
