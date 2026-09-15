import { debugLog } from "../_core/logger";
import { Router } from "express";
import type { Response } from "express";
import { getDb } from "../db";
import { fcmTokens, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendPushNotification } from "../firebaseAdmin";
import { ENV } from "../_core/env";

const router = Router();

// ─── SSE (Server-Sent Events) para notificações em tempo real no browser ─────
// Armazena todos os clientes SSE conectados (abas abertas no navegador)
const sseClients = new Set<Response>();

/**
 * GET /api/webhooks/bot-status/sse
 * O frontend se conecta aqui para receber eventos em tempo real via SSE.
 */
router.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Impede buffer do Nginx/Render
  res.flushHeaders();

  // Envia um comentário de "keep-alive" a cada 25s para evitar timeout
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25_000);

  sseClients.add(res);
  debugLog(`[BotStatusSSE] Cliente conectado. Total: ${sseClients.size}`);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
    debugLog(`[BotStatusSSE] Cliente desconectado. Total: ${sseClients.size}`);
  });
});

/**
 * Envia um evento SSE para TODOS os clientes conectados.
 */
function broadcastSSE(eventName: string, data: object) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  });
}

// ─── Webhook: recebe aviso do bot quando a sessão cair ───────────────────────
/**
 * POST /api/webhooks/bot-status
 * Recebido pelo bot quando a sessão WhatsApp desconectar.
 * Body: { sessionId, status, reason, timestamp, secret }
 */
router.post("/", async (req, res) => {
  try {
    const { sessionId, status, reason, timestamp, secret } = req.body as {
      sessionId?: string;
      status?: string;
      reason?: string;
      timestamp?: string;
      secret?: string;
    };

    // Valida o segredo compartilhado entre o bot e o site
    // AUDIT-P1 FIX: default hardcoded removido. Sem BOT_WEBHOOK_SECRET no ambiente,
    // o endpoint é rejeitado (em vez de aceitar um segredo público do código-fonte).
    const expectedSecret = (process.env.BOT_WEBHOOK_SECRET || "").trim();
    if (!expectedSecret || !secret || secret !== expectedSecret) {
      console.warn("[BotWebhook] Requisição recusada: secret inválido ou não configurado (defina BOT_WEBHOOK_SECRET).");
      return res.status(401).json({ error: "Unauthorized" });
    }

    debugLog(`[BotWebhook] Sessão [${sessionId}] reportou status: ${status} — motivo: ${reason}`);

    // 1. Notifica via SSE todos os navegadores abertos imediatamente
    broadcastSSE("BOT_DISCONNECTED", {
      sessionId,
      status,
      reason: reason || "Sessão desconectada",
      timestamp: timestamp || new Date().toISOString(),
    });

    // 2. Dispara notificação push FCM para os dispositivos cadastrados do admin
    const db = await getDb();
    if (db) {
      // Busca o usuário admin/owner para notificar
      const adminUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));

      for (const adminUser of adminUsers) {
        const tokens = await db
          .select({ token: fcmTokens.token })
          .from(fcmTokens)
          .where(eq(fcmTokens.userId, adminUser.id));

        for (const { token } of tokens) {
          await sendPushNotification(
            token,
            "⚠️ WhatsApp Desconectado",
            `A sessão "${sessionId}" caiu. Acesse o site para reconectar.`,
            {
              sessionId: sessionId || "",
              url: "/configuracoes",
            }
          );
        }
      }
    }

    return res.status(200).json({ ok: true, message: "Notificações enviadas." });
  } catch (error) {
    console.error("[BotWebhook] Erro ao processar notificação:", error);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export { broadcastSSE };
