/**
 * Job de automação de lembretes e notificações do WhatsApp
 * Roda periodicamente (a cada 1 minuto) e gerencia o ciclo completo de cobranças e aulas
 * de acordo com as regras de negócio de automação avançada.
 */

import { debugLog } from "./_core/logger";
import { eq, and, gte, lte, lt, desc, sql, or, like, inArray, isNotNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "./_core/notification";
import { getDb } from "./db";
import { settings, lessons, students, instruments, reminders, reminderTemplates, paymentDues, users, notifications, contracts, schoolPlans } from "../drizzle/schema";
import { sendWhatsAppMessage, getWhatsAppSessionStatus, reconnectWhatsAppSession } from "./utils/whatsapp";
import { sendSmartWhatsAppNotification } from "./utils/whatsappRouting";
import { decryptSecret } from "./utils/integrationCrypto";
import { BillingEngine } from "./services/BillingEngine";
import { computeDaysRemaining, computeMonthsRemaining, computeTotalLessons, computeLessonsRemaining, isContractExpiryTriggered } from "./services/ContractExpiryEngine";

// Guard de concorrência: impede que duas execuções do robô rodem ao mesmo tempo
let isAutomationRunning = false;

// Rastreia a data do último cleanup semanal por usuário.
const lastCleanupByUser = new Map<string, string>();

// Rastreia o último timestamp de keep-alive executado por sessão para garantir ping real
const lastKeepAliveBySession = new Map<string, number>(); // chave: sessionId, valor: timestamp ms
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos (antes: 15 min impreciso)

// Rastreia tentativas de reconexão automática para evitar flood
const autoReconnectAttempts = new Map<string, { count: number; lastAt: number }>();
const MAX_AUTO_RECONNECT = 3;
const AUTO_RECONNECT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min entre tentativas

// ─── ANTI-BAN: Rate Limiter por professor ────────────────────────────────────
// Controla quantas mensagens de WhatsApp cada organização/usuário pode enviar por hora.
// Limite padrão: 30 mensagens/hora. Isso evita comportamento de spam detectado pelo WA.
const whatsappSentByUser = new Map<number, { count: number; windowStart: number }>();
const MAX_WA_PER_HOUR = 30;

async function canSendWhatsApp(userId: number, organizationId?: number): Promise<boolean> {
  // 1. Tenta checagem persistente atômica no banco caso organizationId esteja disponível
  if (organizationId) {
    try {
      const db = await getDb();
      if (db) {
        const { checkAndIncrementWhatsAppRateLimit } = await import("./routers/helpers");
        return await checkAndIncrementWhatsAppRateLimit(db, organizationId, userId, MAX_WA_PER_HOUR);
      }
    } catch (e) {
      debugLog("[AntiBan] Falha no rate limit persistente, utilizando memória:", e);
    }
  }

  // 2. Fallback de proteção em memória (por processo)
  const now = Date.now();
  const entry = whatsappSentByUser.get(userId);
  if (!entry || (now - entry.windowStart) > 60 * 60 * 1000) {
    whatsappSentByUser.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_WA_PER_HOUR) {
    console.warn(`[ANTI-BAN] Usuário ${userId} atingiu o limite de ${MAX_WA_PER_HOUR} msgs/hora no WhatsApp. Envio bloqueado.`);
    return false;
  }
  entry.count++;
  return true;
}


/**
 * Sessões atualmente em processo de PAREAMENTO (QR Code ou Código Numérico).
 * Enquanto uma sessão está neste mapa, o Keep-Alive NÃO tenta reconectar,
 * pois isso destruiria o QR Code/Pairing Code que o usuário está tentando usar.
 * A sessão é removida quando: conecta com sucesso, usuário cancela, ou timeout de 3 minutos.
 */
export const pairingActiveSessions = new Map<string, number>(); // sessionId → timestamp de início
const PAIRING_SESSION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

async function runAutomation() {
  if (isAutomationRunning) {
    debugLog("[Automation] Skipping — execução anterior ainda em andamento.");
    return;
  }
  isAutomationRunning = true;

  // BUG-012 FIX: Guard adicional via DB para ambientes multi-process.
  // O campo automationLastRun por usuário serve como lock pragmático:
  // se foi atualizado há menos de 50s, provavelmente outro processo já está processando.
  // Não requer migration de schema pois o campo já existe.

  try {
    const db = await getDb();
    if (!db) return;

    // RANKINGS (PRD_SISTEMA_RANKINGS §48/§49): encerramento automático de rankings
    // vencidos + persistência horária de posições. Independente da automação de
    // WhatsApp — roda antes do early-return de settings.
    try {
      const { runRankingsMaintenance } = await import("./services/RankingEngine");
      await runRankingsMaintenance();
    } catch (e) {
      debugLog("[Automation] Erro na manutenção de rankings:", e);
    }

    // DESPESAS FIXAS: geração automática no virar do mês — o usuário não precisa
    // mais clicar em "Gerar despesas do mês". Idempotente (dedup por descrição).
    try {
      const { runRecurringExpensesMaintenance } = await import("./services/RecurringExpenseEngine");
      await runRecurringExpensesMaintenance();
    } catch (e) {
      debugLog("[Automation] Erro na geração automática de despesas fixas:", e);
    }

    // PLANOS & BOLSAS (regra comercial): fatura de bolsa em atraso após o dia
    // limite → aplica o VALOR CHEIO (ajuste direto na fatura, ou fatura
    // complementar da diferença se já emitida em gateway). Idempotente.
    try {
      const { applyScholarshipLateFullValue } = await import("./services/BillingEngine");
      const scholarship = await applyScholarshipLateFullValue();
      if (scholarship.adjusted || scholarship.complements) {
        debugLog(`[Automation] Valor cheio aplicado: ${scholarship.adjusted} fatura(s) ajustada(s), ${scholarship.complements} complemento(s).`);
      }
    } catch (e) {
      debugLog("[Automation] Erro na regra de valor cheio das bolsas:", e);
    }

    // TRIAL: garante que os 7 dias grátis NÃO gerem cobrança automática — cancela
    // assinaturas pré-criadas de organizações ainda em "trialing" (sem consentimento).
    try {
      const { runTrialBillingGuard } = await import("./services/TrialBillingGuard");
      const guard = await runTrialBillingGuard();
      if (guard.processed > 0) {
        debugLog(`[Automation] TrialBillingGuard: ${guard.processed} assinatura(s) de trial cancelada(s).`);
      }
    } catch (e) {
      debugLog("[Automation] Erro no TrialBillingGuard:", e);
    }

  const activeSettings = await db
    .select({
      id: settings.id,
      userId: settings.userId,
      organizationId: settings.organizationId,
      automationEnabled: settings.automationEnabled,
      automationLastRun: settings.automationLastRun,
      whatsappBotUrl: settings.whatsappBotUrl,
      whatsappBotToken: settings.whatsappBotToken,
      whatsappAutoSend: settings.whatsappAutoSend,
      pixKey: settings.pixKey,
      notifyLessonReminder: settings.notifyLessonReminder,
      notifyPaymentDue: settings.notifyPaymentDue,
      logoUrl: settings.logoUrl,
    })
    .from(settings)
    .where(eq(settings.automationEnabled, 1));

  if (activeSettings.length === 0) return;

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD no fuso BRT
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  // BUG-AUTO-004 FIX: `startOfDay` deve respeitar o timezone de Brasília.
  // O servidor VPS roda em UTC — sem correção, o anti-spam resetava às 21h BRT
  // (meia-noite UTC), podendo reenviar lembretes no período 21h-00h BRT.
  const brazilNowStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const brazilNow = new Date(brazilNowStr);
  const startOfDayBRT = new Date(brazilNow.getFullYear(), brazilNow.getMonth(), brazilNow.getDate(), 0, 0, 0);
  // Converte de volta para UTC para comparar com timestamps UTC do banco
  const brtOffsetMs = brazilNow.getTime() - now.getTime();
  const startOfDayUTC = new Date(startOfDayBRT.getTime() - brtOffsetMs);

  for (const userSettings of activeSettings) {
    const userId = userSettings.userId;
    const orgId = userSettings.organizationId;

    // BUG-012: Se automationLastRun foi atualizado há menos de 50s por outro processo, pula este usuário
    if (userSettings.automationLastRun) {
      const msSinceLastRun = now.getTime() - new Date(userSettings.automationLastRun).getTime();
      if (msSinceLastRun < 50 * 1000) {
        debugLog(`[Automation] Skipping userId=${userId} — outro processo executou há ${Math.round(msSinceLastRun / 1000)}s (DB lock).`);
        continue;
      }
    }

    // Sem organizationId não conseguimos isolar os dados — pula
    if (!orgId) {
      console.warn(`[Automation] Skipping userId=${userId}: no organizationId found.`);
      continue;
    }

    // --- KEEP-ALIVE PARA O WHATSAPP (baseado em timestamp — confiável) ---
    // Usa timestamp real em vez de now.getMinutes() % 15 para evitar ciclos perdidos
    if (userSettings.whatsappAutoSend === 1 && userSettings.whatsappBotUrl) {
      const sessionId = `prof_${userId}`;
      const lastPing = lastKeepAliveBySession.get(sessionId) ?? 0;
      const timeSinceLastPing = now.getTime() - lastPing;

      if (timeSinceLastPing >= KEEP_ALIVE_INTERVAL_MS) {
        // ── PROTEÇÃO DE PAREAMENTO ──────────────────────────────────────────────
        // Se a sessão está em processo de pareamento ativo, NÃO interrompemos.
        const pairingStartedAt = pairingActiveSessions.get(sessionId);
        if (pairingStartedAt) {
          const elapsed = now.getTime() - pairingStartedAt;
          if (elapsed < PAIRING_SESSION_TIMEOUT_MS) {
            // Ainda dentro do tempo de pareamento → pula o keep-alive
            debugLog(`[Keep-Alive] Sessão ${sessionId} em pareamento ativo — ignorando reconexão automática.`);
            lastKeepAliveBySession.set(sessionId, now.getTime());
            continue; // ← pula para o próximo usuário
          } else {
            // Timeout expirado → limpa o flag de pareamento
            pairingActiveSessions.delete(sessionId);
          }
        }
        // ───────────────────────────────────────────────────────────────────────

        try {
          debugLog('[Trace] Calling getWhatsAppSessionStatus'); const statusResult = await getWhatsAppSessionStatus({
            url: userSettings.whatsappBotUrl || undefined,
            token: userSettings.whatsappBotToken || undefined,
            sessionId,
          });
          lastKeepAliveBySession.set(sessionId, now.getTime());
          debugLog(`[Keep-Alive] Ping OK para sessão ${sessionId} — status: ${statusResult.status}`);

          // Se detectou que a sessão caiu, tenta reconectar automaticamente
          if (statusResult.status === 'DISCONNECTED') {
            const reconnectInfo = autoReconnectAttempts.get(sessionId);
            const canRetry = !reconnectInfo ||
              (reconnectInfo.count < MAX_AUTO_RECONNECT && now.getTime() - reconnectInfo.lastAt >= AUTO_RECONNECT_COOLDOWN_MS);

            if (canRetry) {
              debugLog(`[Keep-Alive] Sessão ${sessionId} DESCONECTADA — tentando reconexão automática...`);
              try {
                await reconnectWhatsAppSession({
                  url: userSettings.whatsappBotUrl || undefined,
                  token: userSettings.whatsappBotToken || undefined,
                  sessionId,
                });
                autoReconnectAttempts.set(sessionId, {
                  count: (reconnectInfo?.count ?? 0) + 1,
                  lastAt: now.getTime(),
                });
                debugLog(`[Keep-Alive] Reconexão automática solicitada para ${sessionId}`);
              } catch (reconErr) {
                console.error(`[Keep-Alive] Falha na reconexão automática para ${sessionId}:`, reconErr);
              }
            } else {
              console.warn(`[Keep-Alive] Sessão ${sessionId} desconectada — limite de reconexões automáticas atingido. Admin deve reconectar manualmente.`);
            }
          } else {
            // Sessão OK: reseta contadores de reconexão
            if (autoReconnectAttempts.has(sessionId)) {
              autoReconnectAttempts.delete(sessionId);
            }
          }
        } catch (e) {
          console.error(`[Keep-Alive] Erro ao fazer ping para ${sessionId}:`, e);
        }
      }
    }

    let remindersCreated = 0;
    const generatedLogs: string[] = [];

    try {
      // ─── CANCELAMENTO AUTOMÁTICO DE LEMBRETES OBSOLETOS ─────────────────────
      // Cancela lembretes pendentes de alunos inativos/pausados/cancelados, mensalidades pagas ou aulas canceladas/concluídas
      await db.execute(sql`
        UPDATE reminders 
        SET status = 'cancelado', "updatedAt" = now()
        WHERE "organizationId" = ${orgId} 
          AND "userId" = ${userId}
          AND status = 'pendente'
          AND (
            ("studentId" IN (SELECT id FROM students WHERE "organizationId" = ${orgId} AND status IN ('inativo', 'pausado')))
            OR ("paymentDueId" IN (SELECT id FROM payment_dues WHERE "organizationId" = ${orgId} AND status = 'pago'))
            OR ("lessonId" IN (SELECT id FROM lessons WHERE "organizationId" = ${orgId} AND status IN ('cancelada', 'remarcada', 'falta', 'concluida')))
          )
      `);

      // ─── LIMPEZA SEMANAL AUTOMÁTICA (Domingo 00:00 Horário de Brasília) ───────────────
      // Apaga lembretes antigos (enviados e cancelados) para manter a tela limpa.
      // Mantém os lembretes de aulas futuras (recentes dos últimos 2 dias ou futuros)
      // para servirem como travas e evitar que a automação os recrie e envie de novo.
      const brazilDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const brazilDay = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay(); // 0 = domingo
      const cleanupKey = `${orgId}-${userId}`;
      let ranCleanupThisCycle = false;

      if (brazilDay === 0 && lastCleanupByUser.get(cleanupKey) !== brazilDateStr) {
        // [MODIFIED] Não deletar mais os lembretes do banco.
        // Manter o histórico no banco é essencial para as travas anti-duplicação funcionarem.
        // O limite de visualização já é gerenciado pelo tRPC limit(200) na tela.
        lastCleanupByUser.set(cleanupKey, brazilDateStr);
        ranCleanupThisCycle = true;
        debugLog(`[Automation] ✅ Limpeza semanal (pular deleção para manter histórico) — domingo ${brazilDateStr} (userId=${userId})`);
      }


      // ─── 3.5 ALERTA DE PAGAMENTO PENDENTE (HOJE) ─────────────────────────
      if (userSettings.notifyPaymentDue === 1) {
        // Busca pagamentos com vencimento hoje
        const duesToday = await db.select({
          id: paymentDues.id,
          amount: paymentDues.amount,
          studentName: students.name
        })
        .from(paymentDues)
        .innerJoin(students, eq(paymentDues.studentId, students.id))
        .where(and(
          eq(paymentDues.organizationId, orgId),
          eq(paymentDues.userId, userId),
          eq(paymentDues.status, 'pendente'),
          eq(paymentDues.dueDate, todayStr)
        ));

        for (const due of duesToday) {
          const actionUrl = `/financeiro?paymentId=${due.id}`;
          
          // Verifica se já enviou notificação interna para este pagamento hoje
          const existingNotifs = await db.select({ id: notifications.id })
            .from(notifications)
            .where(and(
              eq(notifications.organizationId, orgId),
              eq(notifications.userId, userId),
              eq(notifications.actionUrl, actionUrl)
            ))
            .limit(1);

          if (existingNotifs.length === 0) {
            const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(due.amount));
            const content = `A mensalidade de ${due.studentName || 'Desconhecido'} no valor de ${formattedAmount} vence hoje.`;
            
            await db.insert(notifications).values({
              organizationId: orgId,
              userId: userId,
              title: "⚠️ Mensalidade Vencendo Hoje",
              message: content,
              type: "warning",
              actionUrl: actionUrl,
            });

            try {
              await notifyUser(userId, { title: "⚠️ Mensalidade Vencendo Hoje", content });
            } catch (e) {
              console.error("[Automation] Erro ao enviar push de pagamento:", e);
            }
          }
        }
      }

      // ─── 4. ALERTA DE AULA (1 HORA OU 30 MINUTOS ANTES) ─────────────────────
      // Busca aulas agendadas nas próximas 1h15m (75 minutos)
      const maxAlertTime = new Date(now.getTime() + 75 * 60 * 1000);
      const upcomingLessons = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          scheduledAt: lessons.scheduledAt,
          alertSent1h: lessons.alertSent1h,
          alertSent30m: lessons.alertSent30m,
          studentName: students.name,
          studentPhone: students.phone,
          allowAutoReminders: students.allowAutoReminders,
        })
        .from(lessons)
        .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
        .where(
          and(
            eq(lessons.organizationId, orgId),
            eq(lessons.userId, userId),
            eq(lessons.status, "agendada"),
            gte(lessons.scheduledAt, now),
            lte(lessons.scheduledAt, maxAlertTime)
          )
        );

      for (const lesson of upcomingLessons) {
                if (lesson.allowAutoReminders === false) continue;
        const diffMinutes = Math.round((new Date(lesson.scheduledAt).getTime() - now.getTime()) / (60 * 1000));
        
        // Alerta de 1 hora (entre 50 e 70 minutos para tolerância)
        if (diffMinutes >= 50 && diffMinutes <= 70 && !lesson.alertSent1h) {
          const timeStr = new Date(lesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const dateStr = new Date(lesson.scheduledAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
          
          if (userSettings.notifyLessonReminder === 1) {
            await notifyUser(userId, {
              title: `🎸 Lembrete de Aula: ${lesson.title}`,
              content: `👤 Aluno: ${lesson.studentName || "Aluno"}\n📱 Número: ${lesson.studentPhone || "Não cadastrado"}\n📅 Data: ${dateStr}\n⏰ Horário: ${timeStr}`
            });
          }
          
          await db
            .update(lessons)
            .set({ alertSent1h: true, updatedAt: new Date() })
            .where(eq(lessons.id, lesson.id));
        }
        
        // Alerta de 30 minutos (entre 20 e 40 minutos para tolerância)
        if (diffMinutes >= 20 && diffMinutes <= 40 && !lesson.alertSent30m) {
          const timeStr = new Date(lesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const dateStr = new Date(lesson.scheduledAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
          
          if (userSettings.notifyLessonReminder === 1) {
            await notifyUser(userId, {
              title: `🎸 Lembrete de Aula: ${lesson.title}`,
              content: `👤 Aluno: ${lesson.studentName || "Aluno"}\n📱 Número: ${lesson.studentPhone || "Não cadastrado"}\n📅 Data: ${dateStr}\n⏰ Horário: ${timeStr}`
            });
          }
          
          await db
            .update(lessons)
            .set({ alertSent30m: true, updatedAt: new Date() })
            .where(eq(lessons.id, lesson.id));
        }
      }
      
      // ─── 4.1 LEMBRETE DE AULA EXPERIMENTAL (24h e 1h) ─────────────────────────
      if (userSettings.whatsappAutoSend === 1 && userSettings.whatsappBotUrl) {
        const maxExperimentalTime = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);
        const expLessons = await db
          .select({
            id: lessons.id,
            title: lessons.title,
            scheduledAt: lessons.scheduledAt,
            experimentalName: lessons.experimentalName,
            experimentalPhone: (lessons as any).experimentalPhone,
          })
          .from(lessons)
          .where(
            and(
              eq(lessons.organizationId, orgId),
              eq(lessons.userId, userId),
              eq(lessons.status, "agendada"),
              eq(lessons.isExperimental, true),
              gte(lessons.scheduledAt, now),
              lte(lessons.scheduledAt, maxExperimentalTime)
            )
          );

        for (const lesson of expLessons) {
          if (!lesson.experimentalPhone) continue;

          const diffHours = (new Date(lesson.scheduledAt).getTime() - now.getTime()) / (1000 * 60 * 60);
          
          let refType: string | null = null;
          let msgText = "";

          // 24 horas (entre 23.5 e 24.5 horas)
          if (diffHours >= 23.5 && diffHours <= 24.5) {
            refType = "lesson-exp-24h-" + lesson.id;
            const hora = new Date(lesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            msgText = `Olá ${lesson.experimentalName || "Aluno"}! Tudo bem? Passando para lembrar da sua aula experimental de música agendada para amanhã às ${hora}. Te esperamos lá! 🎸`;
          }
          // 1 hora (entre 0.8 e 1.2 horas = 48 a 72 min)
          else if (diffHours >= 0.8 && diffHours <= 1.2) {
            refType = "lesson-exp-1h-" + lesson.id;
            const hora = new Date(lesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            msgText = `Olá ${lesson.experimentalName || "Aluno"}! Falta apenas 1 horinha para a nossa aula experimental (às ${hora}). Até logo! 🎶`;
          }

          if (refType) {
            debugLog('[Trace] Calling db.select for existingExp');
            // BUG-009 FIX: Inclui userId na query de dedup para isolar professores da mesma org
            const existingExp = await db.select({ id: reminders.id }).from(reminders)
              .where(and(
                eq(reminders.organizationId, orgId),
                eq(reminders.userId, userId),
                eq(reminders.refId, refType)
              )).limit(1);

            if (existingExp.length === 0) {
              await db.insert(reminders).values({
                organizationId: orgId,
                userId,
                type: "aula" as any,
                message: msgText,
                scheduledAt: now,
                status: "pendente",
                autoGenerated: 1,
                refId: refType,
                targetPhone: lesson.experimentalPhone,
              });
              remindersCreated++;
              generatedLogs.push(`Aula Experimental para ${lesson.experimentalName || "Aluno"}`);
            }
          }
        }
      }

      await db.update(settings).set({ automationLastRun: now }).where(eq(settings.userId, userId));

      for (const log of generatedLogs) {
        await notifyUser(userId, {
          title: "⏳ Lembrete Gerado",
          content: log
        });
      }

      // ─── 3. DISPARO AUTOMÁTICO COM CONTROLE DE FILA E PRIORIDADE ────────────
      if (userSettings.whatsappAutoSend === 1 && userSettings.whatsappBotUrl) {
        const pendingReminders = await db
          .select({
            id: reminders.id,
            studentId: reminders.studentId,
            type: reminders.type,
            message: reminders.message,
            scheduledAt: reminders.scheduledAt,
            refId: reminders.refId,
            targetPhone: (reminders as any).targetPhone,
            studentPhone: students.phone,
            guardianPhone: students.guardianPhone,
            birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
            studentName: students.name,
          })
          .from(reminders)
          .leftJoin(students, and(eq(reminders.studentId, students.id), eq(reminders.organizationId, orgId)))
          .where(
            and(
              eq(reminders.organizationId, orgId),
              eq(reminders.userId, userId),
              eq(reminders.status, "pendente"),
              lte(reminders.scheduledAt, now),
              // ── BUG-001 FIX: Excluir lembretes do Rules Loop do Loop Principal ──
              // Lembretes gerados por regras de automação (auto-rule-*) são enviados
              // e marcados como 'enviado' imediatamente dentro do Rules Loop.
              // O Loop Principal nunca deve processá-los para evitar duplicação.
              sql`(${reminders.refId} IS NULL OR ${reminders.refId} NOT LIKE 'auto-rule-%')`
            )
          );

        if (pendingReminders.length === 0) continue;

        const getPriorityWeight = (rem: typeof pendingReminders[0]) => {
          if (rem.refId?.startsWith("lesson-1h-")) return 1;
          if (rem.refId?.startsWith("lesson-24h-")) return 2;
          if (rem.refId?.startsWith("pay-prev-")) return 3;
          if (rem.refId?.startsWith("pay-hoje-")) return 4;
          if (rem.type === "inadimplencia") return 5;
          return 6;
        };

        pendingReminders.sort((a, b) => getPriorityWeight(a) - getPriorityWeight(b));

        const sentToday = await db
          .select({ studentId: reminders.studentId, type: reminders.type, refId: reminders.refId })
          .from(reminders)
          .where(
            and(
              eq(reminders.organizationId, orgId),
              eq(reminders.userId, userId),
              eq(reminders.status, "enviado"),
              gte(reminders.sentAt, startOfDayUTC)
            )
          );

        const getRemKey = (studentId: number | null, type: string, refId: string | null) => {
          // ── BUG-003 FIX: Reconhece lembretes gerados pelo Rules Loop (auto-rule-*) ──
          // Sem esse match, o Anti-Spam do Loop Principal nunca bloqueava lembretes
          // gerados por regras de automação, causando reenvios.
          const autoRuleLessonMatch = refId?.match(/^auto-rule-\d+-lesson-(\d+)/);
          if (autoRuleLessonMatch) return `${studentId}-auto-aula-${autoRuleLessonMatch[1]}`;

          const autoRulePayMatch = refId?.match(/^auto-rule-\d+-payment-(\d+)/);
          if (autoRulePayMatch) return `${studentId}-auto-cobranca-${autoRulePayMatch[1]}`;

          const autoRuleExpMatch = refId?.match(/^auto-rule-\d+-/);
          if (autoRuleExpMatch) return `${studentId}-auto-${refId}`;

          // Extrai lessonId do refId para identificar cada aula individualmente e evitar falsos positivos
          const lessonMatch = refId?.match(/^lesson-(?:exp-[^-]+-)?(\d+)/);
          if (lessonMatch) return `${studentId}-aula-${lessonMatch[1]}`;

          // Extrai paymentDueId para diferenciar cobranças do mesmo aluno em meses diferentes
          const payMatch = refId?.match(/(?:payment-|overdue-|pay-prev-|pay-hoje-)(\d+)/);
          if (payMatch) return `${studentId}-cobranca-${payMatch[1]}`;

          let subType = type;
          if (type === "aula") {
            if (refId?.startsWith("lesson-24h-")) subType = "aula-24h";
            else if (refId?.startsWith("lesson-1h-")) subType = "aula-1h";
          }
          return `${studentId}-${subType}`;
        };

        const sentMap = new Set(sentToday.map(s => getRemKey(s.studentId, s.type, s.refId)));

        let messagesSentThisCycle = 0; // LIMITE GERAL POR CICLO
        const MAX_MESSAGES_PER_MINUTE = 10;

        for (const rem of pendingReminders) {
                if (rem.allowAutoReminders === false) continue;
          if (messagesSentThisCycle >= MAX_MESSAGES_PER_MINUTE) {
            debugLog(`[Automation] Limite de ${MAX_MESSAGES_PER_MINUTE} mensagem/min atingido. Fila continua no próximo ciclo.`);
            break;
          }

          let targetPhone = rem.targetPhone || rem.studentPhone;
          if (rem.birthDate) {
            const birthDate = new Date(rem.birthDate);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
            if (age < 18 && rem.guardianPhone && rem.guardianPhone.trim()) {
              targetPhone = rem.guardianPhone;
            }
          }

          if (!targetPhone) {
            await db.update(reminders).set({ errorMessage: "Aluno/Responsável sem telefone cadastrado.", updatedAt: new Date() }).where(eq(reminders.id, rem.id));
            continue;
          }

          const remKey = getRemKey(rem.studentId, rem.type, rem.refId);
          if (sentMap.has(remKey)) {
            await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: "Bloqueio Anti-Spam: Lembrete do mesmo tipo já enviado hoje.", updatedAt: new Date() }).where(eq(reminders.id, rem.id));
            continue;
          }

          const schoolLogo = (userSettings.logoUrl && String(userSettings.logoUrl).trim().startsWith("http"))
            ? String(userSettings.logoUrl).trim()
            : null;

          debugLog('[Trace] Calling sendWhatsAppMessage for ', targetPhone);
          const sendRes = await sendWhatsAppMessage({
            url: userSettings.whatsappBotUrl,
            token: userSettings.whatsappBotToken,
            phone: targetPhone,
            message: rem.message,
            mediaUrl: schoolLogo,
            sessionId: `prof_${userId}`,
          });

          if (sendRes.success) {
            await db.update(reminders)
              .set({
                status: "enviado",
                sentAt: new Date(),
                externalMessageId: sendRes.messageId,
                errorMessage: null,
                updatedAt: new Date(),
              })
              .where(eq(reminders.id, rem.id));
            sentMap.add(remKey);
            messagesSentThisCycle++;

            const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            const remType = (rem.type as string) === "aula" ? "Aula" : (rem.type as string) === "cobranca" ? "Cobrança" : (rem.type as string) === "aniversario" ? "Aniversário" : (rem.type as string) === "aula_experimental" ? "Aula Experimental" : "Estudo";
            await notifyUser(userId, {
              title: `✅ Enviado: ${remType}`,
              content: `👤 Aluno: ${rem.studentName || "Aluno"}\n📱 Número: ${targetPhone}\n⏰ Horário: ${timeStr}`
            });
          } else {
            await db.update(reminders)
              .set({
                errorMessage: sendRes.error,
                updatedAt: new Date(),
              })
              .where(eq(reminders.id, rem.id));
          }
        }
      }
    } catch (err) {
      console.error(`[Automation] Error processing userId=${userId} orgId=${orgId}:`, err);
    }
  }

  // ─── PROCESSAMENTO DE REGRAS DE AUTOMAÇÃO PERSONALIZADAS ─────────────────
  try {
    const db = await getDb();
    if (db) {
      const { messageAutomationRules } = await import("../drizzle/schema");
      const { settings: settingsTable } = await import("../drizzle/schema");

      // Re-fetch all active user settings that have automation enabled
      const activeSettingsForRules = await db
        .select({
          userId: settings.userId,
          organizationId: settings.organizationId,
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
          whatsappAutoSend: settings.whatsappAutoSend,
          pixKey: settings.pixKey,
          paymentGateway: settings.paymentGateway,
          asaasApiKey: settings.asaasApiKey,
          asaasEnabled: settings.asaasEnabled,
          mpAccessToken: settings.mpAccessToken,
          infinitepayHandle: settings.infinitepayHandle,
          infinitepayApiKey: settings.infinitepayApiKey,
          infinitepayEnabled: settings.infinitepayEnabled,
          notifyWeeklyReport: settings.notifyWeeklyReport,
        })
        .from(settings)
        .where(eq(settings.automationEnabled, 1));

      for (const userSet of activeSettingsForRules) {
        // Nota: o controle de allowAutoReminders é POR ALUNO (students.allowAutoReminders),
        // verificado dentro de cada loop de aluno mais abaixo. Não existe allowAutoReminders na tabela settings.
        const userId = userSet.userId;
        const orgId = userSet.organizationId;
        if (!orgId) continue;

        // Load all active custom/system rules for this user
        const activeRules = await db
          .select()
          .from(messageAutomationRules)
          .where(
            and(
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId),
              eq(messageAutomationRules.isActive, 1)
            )
          );

        if (activeRules.length === 0) continue;

        // Fetch school name from settings
        const [userSettings2] = await db.select({ schoolName: settings.schoolName }).from(settings).where(eq(settings.userId, userId)).limit(1);
        const [userInfo] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
        const schoolName = userSettings2?.schoolName ?? "nossa escola";
        const professorName = userInfo?.name ?? "Professor";
        const now2 = new Date();
        const todayStr2 = now2.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

        for (const rule of activeRules) {
          try {
            if (rule.trigger === "payment_due" || rule.trigger === "payment_overdue") {
              // ── MENSALIDADES ──────────────────────────────────────────────────
              const pendingDues = await db
                .select({
                  id: paymentDues.id,
                  studentId: paymentDues.studentId,
                  amount: paymentDues.amount,
                  dueDate: paymentDues.dueDate,
                  status: paymentDues.status,
                  month: paymentDues.month,
                  year: paymentDues.year,
                  studentName: students.name,
                  studentPhone: students.phone,
                  studentEmail: students.email,
                  studentCpf: students.cpf,
                  guardianPhone: students.guardianPhone,
                  birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
                  instrumentName: instruments.name,
                  asaasPaymentLink: paymentDues.asaasPaymentLink,
                  mpPaymentLink: paymentDues.mpPaymentLink,
                  infinitepayPaymentLink: paymentDues.infinitepayPaymentLink,
                })
                .from(paymentDues)
                .leftJoin(students, and(eq(paymentDues.studentId, students.id), eq(students.organizationId, orgId)))
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
                .where(
                  and(
                    eq(paymentDues.organizationId, orgId),
                    eq(paymentDues.userId, userId),
                    // BUG-AUTO-006 FIX: O status 'atrasado' NUNCA é salvo no banco — ele é calculado
                    // apenas em memória no frontend (routers.ts). Por isso, a query anterior que
                    // filtrava por `status = 'atrasado'` para o trigger `payment_overdue` nunca
                    // encontrava nenhum pagamento, e o robô nunca disparava.
                    // Solução: buscar pagamentos 'pendente' cujo dueDate já passou (lógica idêntica
                    // ao frontend), pois esses são os realmente "atrasados" no banco.
                    rule.trigger === "payment_overdue"
                      ? and(
                          eq(paymentDues.status, "pendente"),
                          lt(paymentDues.dueDate, todayStr2) // dueDate < hoje = realmente atrasado
                        )
                      : or(eq(paymentDues.status, "pendente"), eq(paymentDues.status, "atrasado")),
                    eq(students.status, "ativo")
                  )
                );

              for (const due of pendingDues) {
                if (due.allowAutoReminders === false) continue;
                const dueDate = new Date(due.dueDate + "T08:00:00-03:00");
                const dueDateStr = String(due.dueDate).slice(0, 10);
                const isOverdue = dueDateStr < todayStr2;

                // Check trigger date for both payment_due and payment_overdue
                const triggerDate = new Date(dueDate);
                if (rule.trigger === "payment_due") {
                  if (isOverdue) continue; // Already overdue, skip
                  triggerDate.setDate(triggerDate.getDate() + (rule.offsetDays ?? 0));
                } else if (rule.trigger === "payment_overdue") {
                  triggerDate.setDate(triggerDate.getDate() + (rule.offsetDays ?? 0));
                }
                
                if (triggerDate > now2) {
                  // Not yet time
                  continue; 
                }

                const refId = `auto-rule-${rule.id}-payment-${due.id}`;
                const existingReminder = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                
                if (existingReminder.length > 0) {
                  continue;
                }

                const valor = Number(due.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const vencimento = dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

                // Tenta recuperar ou gerar link de pagamento caso não exista
                const pGateway = userSet.paymentGateway ?? "asaas";
                let paymentLink = pGateway === "mercadopago"
                  ? (due.mpPaymentLink ?? null)
                  : pGateway === "infinitepay"
                    ? (due.infinitepayPaymentLink ?? null)
                    : (due.asaasPaymentLink ?? null);

                if (!paymentLink) {
                  if (pGateway === "infinitepay" && userSet.infinitepayHandle && (userSet.infinitepayEnabled === 1 || userSet.infinitepayEnabled === undefined || userSet.infinitepayEnabled === null)) {
                    // ── INFINITEPAY: gera link de pagamento on-the-fly ──────────
                    try {
                      const { createInfinitePayLink, buildInfinitePayWebhookUrl, brlToCents, resolveInfinitePayApiKey } = await import("./utils/infinitepay");
                      const { createPaymentShortLink } = await import("./utils/shortlinks");
                      const ipLink = await createInfinitePayLink({
                        handle: userSet.infinitepayHandle,
                        orderNsu: String(due.id),
                        items: [{
                          quantity: 1,
                          price: brlToCents(due.amount),
                          description: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                        }],
                        redirectUrl: `https://wrmusicpro.com.br/painel/mensalidades`,
                        webhookUrl: buildInfinitePayWebhookUrl(due.id),
                        apiKey: resolveInfinitePayApiKey(userSet.infinitepayApiKey),
                        customer: {
                          name: due.studentName || "Aluno",
                          email: due.studentEmail || undefined,
                          phone: due.studentPhone || undefined,
                        },
                      });

                      const shareUrl = await createPaymentShortLink(db, {
                        targetUrl: ipLink.url,
                        organizationId: orgId,
                        userId: userId,
                        paymentDueId: due.id,
                      });

                      await db.update(paymentDues)
                        .set({ infinitepayPaymentLink: shareUrl, infinitepaySlug: ipLink.slug })
                        .where(eq(paymentDues.id, due.id));
                      paymentLink = shareUrl;
                    } catch (err) {
                      console.error("[AutomationJob] Erro ao gerar cobrança InfinitePay on-the-fly:", err);
                    }
                  } else if (pGateway === "asaas" && userSet.asaasApiKey && (userSet.asaasEnabled === 1 || userSet.asaasEnabled === undefined || userSet.asaasEnabled === null)) {
                    try {
                      const { createAsaasCustomer, createAsaasCharge } = await import("./utils/asaas");
                      const { asaasCustomers } = await import("../drizzle/schema");
                      let asaasCustomerId: string | null = null;
                      const [existingCust] = await db.select().from(asaasCustomers)
                        .where(and(eq(asaasCustomers.studentId, due.studentId), eq(asaasCustomers.organizationId, orgId)))
                        .limit(1);

                      if (existingCust) {
                        asaasCustomerId = existingCust.asaasCustomerId;
                      } else {
                        asaasCustomerId = await createAsaasCustomer({
                          name: due.studentName || "Aluno",
                          email: due.studentEmail ?? undefined,
                          phone: due.studentPhone ?? undefined,
                          cpfCnpj: due.studentCpf ?? undefined,
                        }, decryptSecret(userSet.asaasApiKey));
                        if (asaasCustomerId) {
                          await db.insert(asaasCustomers).values({ organizationId: orgId, studentId: due.studentId, asaasCustomerId });
                        }
                      }

                      if (asaasCustomerId) {
                        const charge = await createAsaasCharge({
                          asaasCustomerId,
                          billingType: "UNDEFINED",
                          value: Number(due.amount),
                          dueDate: String(due.dueDate).slice(0, 10),
                          description: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                        }, decryptSecret(userSet.asaasApiKey));

                        await db.update(paymentDues).set({
                          asaasId: charge.id,
                          asaasPaymentLink: charge.invoiceUrl,
                          asaasBillingType: charge.billingType
                        }).where(eq(paymentDues.id, due.id));
                        paymentLink = charge.invoiceUrl;
                      }
                    } catch (err) {
                      console.error("[AutomationJob] Erro ao gerar cobrança Asaas on-the-fly:", err);
                    }
                  } else if (pGateway === "mercadopago" && userSet.mpAccessToken) {
                    // ── MERCADO PAGO: gera link de pagamento on-the-fly ──────────
                    try {
                      const { createMPPreference } = await import("./utils/mercadopago");
                      const pref = await createMPPreference({
                        items: [{
                          title: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                          quantity: 1,
                          currency_id: "BRL",
                          unit_price: Number(due.amount),
                        }],
                        payer: {
                          name: due.studentName || "Aluno",
                          email: due.studentEmail || "aluno@musicpro.com.br",
                        },
                        external_reference: due.id.toString(),
                        successUrl: `https://wrmusicpro.com.br/painel/mensalidades`,
                      }, decryptSecret(userSet.mpAccessToken));

                      await db.update(paymentDues)
                        .set({ mpPaymentId: pref.id, mpPaymentLink: pref.init_point })
                        .where(eq(paymentDues.id, due.id));
                      paymentLink = pref.init_point;
                    } catch (err) {
                      console.error("[AutomationJob] Erro ao gerar cobrança Mercado Pago on-the-fly:", err);
                    }
                  }
                }

                const schoolSet = BillingEngine.extractSchoolSettings(userSet);
                const calcResult = BillingEngine.computeInvoiceAmounts(due, schoolSet);

                const valorOriginalFmt = `R$ ${calcResult.originalAmount.toFixed(2).replace('.', ',')}`;
                const multaFmt = `R$ ${calcResult.lateFeeAmount.toFixed(2).replace('.', ',')}`;
                const jurosFmt = `R$ ${calcResult.interestAmount.toFixed(2).replace('.', ',')}`;
                const valorAtualizadoFmt = `R$ ${calcResult.updatedAmount.toFixed(2).replace('.', ',')}`;
                const pixReplacement = paymentLink ?? (userSet.pixKey ? `PIX: ${userSet.pixKey}` : "");

                let message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, due.studentName ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, due.instrumentName ?? "música")
                  .replace(/\{instrumento\}/g, due.instrumentName ?? "música")
                  .replace(/\{valor_original\}/g, valorOriginalFmt)
                  .replace(/\{multa\}/g, multaFmt)
                  .replace(/\{juros\}/g, jurosFmt)
                  .replace(/\{dias_atraso\}/g, String(calcResult.daysOverdue))
                  .replace(/\{valor_atualizado\}/g, valorAtualizadoFmt)
                  .replace(/\{valor_mensalidade\}/g, valorAtualizadoFmt)
                  .replace(/\{valor\}/g, valorAtualizadoFmt)
                  .replace(/\{data_vencimento\}/g, vencimento)
                  .replace(/\{pix\}/g, pixReplacement);

                const hasLinkTag = /\{link_pagamento\}|\{link_cobranca\}|\{link\}|\{payment_link\}|\{pix\}/.test(rule.messageTemplate ?? "");
                if (hasLinkTag) {
                  message = message
                    .replace(/\{link_pagamento\}/g, pixReplacement)
                    .replace(/\{link_cobranca\}/g, pixReplacement)
                    .replace(/\{link\}/g, pixReplacement)
                    .replace(/\{payment_link\}/g, pixReplacement);
                } else if (paymentLink) {
                  const gatewayName = pGateway === "mercadopago" ? "Mercado Pago" : pGateway === "infinitepay" ? "InfinitePay" : "Asaas";
                  message += `\n\n💳 *Link de pagamento (${gatewayName}):*\n${paymentLink}`;
                } else if (userSet.pixKey) {
                  message += `\n\n💳 *PIX:* ${userSet.pixKey}`;
                }
                
                message = message.replace(/\{[^}]+\}/g, '');

                // ✅ FIX: INSERT PRIMEIRO — garante registro no banco antes do envio.
                // Se o INSERT falhar após o envio, o próximo ciclo não teria como saber que já foi enviado.
                if (!due.studentPhone && !due.guardianPhone) continue; // sem telefone, não insere

                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: due.studentId, paymentDueId: due.id,
                  type: "cobranca", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                // Envia e marca como "enviado" imediatamente — impede que o main dispatch loop reenvie no próximo ciclo
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const routingRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: due.studentPhone || (due as any).phone, guardianPhone: due.guardianPhone, birthDate: due.birthDate },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });

                  const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newRem) {
                    if (routingRes.success) {
                      await db.update(reminders).set({
                        status: "enviado",
                        sentAt: new Date(),
                        errorMessage: null,
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else if (routingRes.errors?.[0] === "Nenhum telefone válido encontrado para envio.") {
                      await db.update(reminders).set({
                        status: "cancelado",
                        errorMessage: "Sem telefone válido para envio.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else {
                      await db.update(reminders).set({
                        errorMessage: routingRes.errors?.join(", ") ?? "Erro ao enviar mensagem.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    }
                  }
                }

              }

            } else if (rule.trigger === "lesson_scheduled") {
              // ── AULAS ─────────────────────────────────────────────────────────
              const offsetMs = (rule.offsetHours ?? 0) * 60 * 60 * 1000;
              const monday = new Date(now2);
              monday.setDate(monday.getDate() - monday.getDay());
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 14); // Look 2 weeks ahead

              const upcomingLessons2 = await db
                .select({
                  id: lessons.id,
                  studentId: lessons.studentId,
                  title: lessons.title,
                  scheduledAt: lessons.scheduledAt,
                  studentName: students.name,
                  studentPhone: students.phone,
                  guardianPhone: students.guardianPhone,
                  birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
                  instrumentName: instruments.name,
                })
                .from(lessons)
                .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
                .where(
                  and(
                    eq(lessons.organizationId, orgId),
                    eq(lessons.userId, userId),
                    eq(lessons.status, "agendada"),
                    gte(lessons.scheduledAt, now2),
                    lte(lessons.scheduledAt, sunday),
                    eq(students.status, "ativo")
                  )
                );

              for (const lesson of upcomingLessons2) {
                if (lesson.allowAutoReminders === false) continue;
                const lessonTime = new Date(lesson.scheduledAt);
                const triggerTime = new Date(lessonTime.getTime() + offsetMs); // offsetHours=-24 → 24h before
                
                // Só dispara se o tempo já passou...
                if (triggerTime > now2) continue;
                
                // E só dispara se AINDA for o mesmo dia calendário (BRT) planejado para o disparo.
                // Se virar a meia-noite, a mensagem perderia o contexto (ex: falaria 'amanhã' no dia da aula).
                // CORREÇÃO: Removida a verificação triggerDayStr !== nowDayStr que impedia o envio de lembretes na virada da meia-noite.

                const lessonDateStr = lessonTime.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
                // ✅ FIX: Lock exclusivo por Regra. Permite que o usuário tenha múltiplas automações para a mesma aula (ex: 24h antes E 1h antes).
                const refId = `auto-rule-${rule.id}-lesson-${lesson.id}-${lessonDateStr}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(
                    eq(reminders.organizationId, orgId),
                    eq(reminders.refId, refId)
                  )).limit(1);
                if (existing.length > 0) continue;

                const dataAula = lessonTime.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
                const horaAula = lessonTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

                let message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, lesson.studentName ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, lesson.instrumentName ?? "m\u00fasica")
                  .replace(/\{instrumento\}/g, lesson.instrumentName ?? "m\u00fasica")
                  .replace(/\{data_aula\}/g, dataAula)
                  .replace(/\{hora_aula\}/g, horaAula)
                  .replace(/\{[^}]+\}/g, '');

                // ✅ FIX: INSERT PRIMEIRO — garante registro no banco antes do envio
                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: lesson.studentId, lessonId: lesson.id,
                  type: "aula", message, scheduledAt: triggerTime, status: "pendente", autoGenerated: 1, refId,
                });

                // Envia e marca como "enviado" imediatamente — impede que o main dispatch loop reenvie no próximo ciclo
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const routingRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: lesson.studentPhone || (lesson as any).phone, guardianPhone: lesson.guardianPhone, birthDate: lesson.birthDate },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });

                  const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newRem) {
                    if (routingRes.success) {
                      await db.update(reminders).set({
                        status: "enviado",
                        sentAt: new Date(),
                        errorMessage: null,
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else if (routingRes.errors?.[0] === "Nenhum telefone v\u00e1lido encontrado para envio.") {
                      await db.update(reminders).set({
                        status: "cancelado",
                        errorMessage: "Sem telefone v\u00e1lido para envio.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else {
                      await db.update(reminders).set({
                        errorMessage: routingRes.errors?.join(", ") ?? "Erro ao enviar mensagem.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    }
                  }
                }

              }

            } else if (rule.trigger === "birthday") {
              // ── ANIVERSÁRIOS ─────────────────────────────────────────────────
              const allStudents = await db
                .select({ id: students.id, name: students.name, phone: students.phone, guardianPhone: students.guardianPhone, birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders, instrumentName: instruments.name })
                .from(students)
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
                .where(and(eq(students.organizationId, orgId), eq(students.userId, userId), eq(students.status, "ativo")));

              for (const student of allStudents) {
                if (!student.allowAutoReminders) continue;
                if (!student.birthDate) continue;
                const bd = new Date(student.birthDate);
                if (bd.getMonth() !== now2.getMonth() || bd.getDate() !== now2.getDate()) continue;

                const refId = `auto-rule-${rule.id}-bday-${student.id}-${todayStr2}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                if (existing.length > 0) continue;

                const message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, student.name ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, student.instrumentName ?? "música")
                  .replace(/\{instrumento\}/g, student.instrumentName ?? "música");

                const targetPhone = student.phone || student.guardianPhone;
                if (!targetPhone) continue;

                // ✅ FIX: INSERT PRIMEIRO, depois envia e marca como enviado
                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: student.id,
                  type: "manual", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const sendRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: student.phone, guardianPhone: student.guardianPhone },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });
                  const [newBdRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newBdRem) {
                    if (sendRes.success) {
                      await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(reminders.id, newBdRem.id));
                    } else {
                      await db.update(reminders).set({ errorMessage: sendRes.errors?.join(", ") ?? "Erro ao enviar.", updatedAt: new Date() }).where(eq(reminders.id, newBdRem.id));
                    }
                  }
                }
              }

            } else if (rule.trigger === "student_inactive") {
              // ── ALUNOS INATIVOS ──────────────────────────────────────────────
              const inactiveDays = rule.offsetDays ?? 30;
              const thresholdDate = new Date(now2);
              thresholdDate.setDate(thresholdDate.getDate() - inactiveDays);

              // Find students whose last lesson was before threshold
              const studentsWithLastLesson = await db
                .select({
                  studentId: lessons.studentId,
                  lastLesson: sql<string>`max(${lessons.scheduledAt})`,
                  studentName: students.name,
                  studentPhone: students.phone,
                  guardianPhone: students.guardianPhone,
                  instrumentName: instruments.name,
                })
                .from(lessons)
                .leftJoin(students, and(eq(lessons.studentId, students.id), eq(lessons.organizationId, orgId)))
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
                .where(
                  and(
                    eq(lessons.organizationId, orgId),
                    eq(lessons.userId, userId),
                    eq(students.status, "ativo")
                  )
                )
                .groupBy(lessons.studentId, students.name, students.phone, students.guardianPhone, instruments.name);

              for (const row of studentsWithLastLesson) {
                
                if (!row.studentId || !row.lastLesson) continue;
                const lastLessonDate = new Date(row.lastLesson);
                if (lastLessonDate > thresholdDate) continue; // Still active

                const daysSince = Math.floor((now2.getTime() - lastLessonDate.getTime()) / (1000 * 60 * 60 * 24));
                const refId = `auto-rule-${rule.id}-inactive-${row.studentId}-${todayStr2}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                if (existing.length > 0) continue;

                const message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, row.studentName ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, row.instrumentName ?? "música")
                  .replace(/\{instrumento\}/g, row.instrumentName ?? "música")
                  .replace(/\{dias_sem_estudo\}/g, String(daysSince));

                const targetPhone = row.studentPhone || row.guardianPhone;
                if (!targetPhone) continue;

                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: row.studentId,
                  type: "manual", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                // ✅ FIX: INSERT PRIMEIRO, depois envia e marca como enviado
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const sendRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: row.studentPhone, guardianPhone: row.guardianPhone },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });
                  const [newInactRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newInactRem) {
                    if (sendRes.success) {
                      await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(reminders.id, newInactRem.id));
                    } else {
                      await db.update(reminders).set({ errorMessage: sendRes.errors?.join(", ") ?? "Erro ao enviar.", updatedAt: new Date() }).where(eq(reminders.id, newInactRem.id));
                    }
                  }
                }

              }

            } else if (rule.trigger === "new_student") {
              // ── NOVOS ALUNOS ─────────────────────────────────────────────────
              const offsetMs2 = (rule.offsetDays ?? 0) * 24 * 60 * 60 * 1000;
              const newStudents2 = await db
                .select({
                  id: students.id,
                  name: students.name,
                  phone: students.phone,
                  guardianPhone: students.guardianPhone,
                  birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
                  createdAt: students.createdAt,
                  instrumentName: instruments.name,
                })
                .from(students)
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
                .where(
                  and(
                    eq(students.organizationId, orgId),
                    eq(students.userId, userId),
                    eq(students.status, "ativo"),
                    gte(students.createdAt, new Date(now2.getTime() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
                  )
                );

              for (const student of newStudents2) {
                if (!student.allowAutoReminders) continue;
                const triggerDate = new Date(student.createdAt.getTime() + offsetMs2);
                if (triggerDate > now2) continue;

                const refId = `auto-rule-${rule.id}-newstudent-${student.id}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                if (existing.length > 0) continue;

                const message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, student.name ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, student.instrumentName ?? "música")
                  .replace(/\{instrumento\}/g, student.instrumentName ?? "música");

                // ✅ FIX: INSERT PRIMEIRO — garante registro no banco antes do envio
                if (!student.phone && !student.guardianPhone) continue;

                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: student.id,
                  type: "manual", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                // Envia e marca como "enviado" imediatamente — impede que o main dispatch loop reenvie no próximo ciclo
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const routingRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: student.phone, guardianPhone: student.guardianPhone },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });
                  const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newRem) {
                    if (routingRes.success) {
                      await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    } else if (routingRes.errors?.[0] === "Nenhum telefone válido encontrado para envio.") {
                      await db.update(reminders).set({ status: "cancelado", errorMessage: "Sem telefone válido para envio.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    } else {
                      await db.update(reminders).set({ errorMessage: routingRes.errors?.join(", ") ?? "Erro ao enviar mensagem.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    }
                  }
                }

              }

            } else if (rule.trigger === "payment_confirmed") {
              // ── PAGAMENTO CONFIRMADO ─────────────────────────────────────────
              // Find payments confirmed today (paidAt >= start of today)
              const startOfToday = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), 0, 0, 0);
              const confirmedToday = await db
                .select({
                  id: paymentDues.id,
                  studentId: paymentDues.studentId,
                  amount: paymentDues.amount,
                  paidAt: paymentDues.paidAt,
                  studentName: students.name,
                  studentPhone: students.phone,
                  guardianPhone: students.guardianPhone,
                  birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
                  instrumentName: instruments.name,
                })
                .from(paymentDues)
                .leftJoin(students, and(eq(paymentDues.studentId, students.id), eq(paymentDues.organizationId, orgId)))
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
                .where(
                  and(
                    eq(paymentDues.organizationId, orgId),
                    eq(paymentDues.userId, userId),
                    eq(paymentDues.status, "pago"),
                    gte(paymentDues.paidAt, startOfToday)
                  )
                );

              for (const payment of confirmedToday) {
                if (!payment.allowAutoReminders) continue;
                const refId = `auto-rule-${rule.id}-paid-${payment.id}-${todayStr2}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                if (existing.length > 0) continue;

                const valor = Number(payment.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, payment.studentName ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, payment.instrumentName ?? "m\u00fasica")
                  .replace(/\{valor_mensalidade\}/g, valor)
                  .replace(/\{[^}]+\}/g, '');

                // ✅ FIX: INSERT PRIMEIRO — garante registro no banco antes do envio
                if (!payment.studentPhone && !payment.guardianPhone) continue;

                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: payment.studentId, paymentDueId: payment.id,
                  type: "cobranca", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                // Envia e marca como "enviado" imediatamente — impede que o main dispatch loop reenvie no próximo ciclo
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const routingRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: payment.studentPhone || (payment as any).phone, guardianPhone: payment.guardianPhone },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });

                  const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newRem) {
                    if (routingRes.success) {
                      await db.update(reminders).set({
                        status: "enviado",
                        sentAt: new Date(),
                        errorMessage: null,
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else if (routingRes.errors?.[0] === "Nenhum telefone v\u00e1lido encontrado para envio.") {
                      await db.update(reminders).set({
                        status: "cancelado",
                        errorMessage: "Sem telefone v\u00e1lido para envio.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    } else {
                      await db.update(reminders).set({
                        errorMessage: routingRes.errors?.join(", ") ?? "Erro ao enviar mensagem.",
                        updatedAt: new Date(),
                      }).where(eq(reminders.id, newRem.id));
                    }
                  }
                }

              }
            } else if (rule.trigger === "daily_study") {
              // ── LEMBRETE DE ESTUDO DIÁRIO ─────────────────────────────────────
              // Configuração armazenada no campo `conditions` como JSON:
              // { "daysOfWeek": [0,1,2,3,4,5,6], "sendTime": "08:00" }
              // daysOfWeek: 0=Domingo, 1=Segunda, ..., 6=Sábado
              let daysOfWeek: number[] = [1, 2, 3, 4, 5]; // padrão: seg a sex
              let sendTime = "08:00";
              try {
                if (rule.conditions) {
                  const cond = JSON.parse(rule.conditions);
                  if (Array.isArray(cond.daysOfWeek)) daysOfWeek = cond.daysOfWeek;
                  if (typeof cond.sendTime === "string") sendTime = cond.sendTime;
                }
              } catch { /* mantém defaults */ }

              // BUG#1+#2 FIX: usar horário e dia de semana do timezone de Brasília
              // now2.getDay() e getHours() retornam UTC — no horário de Brasília isso pode ser um dia/hora diferente
              const brazilLocale = now2.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
              const brazilDate = new Date(brazilLocale);
              const currentDayOfWeek = brazilDate.getDay(); // 0=Dom, 1=Seg... em horário BRT
              if (!daysOfWeek.includes(currentDayOfWeek)) continue;

              // Verificar se o horário atual já passou do horário configurado (com tolerância de até 30 minutos).
              // Isso é robusto contra ciclos lentos ou reinícios do servidor.
              // BUG-008 FIX: O refId usa `todayStr2` (data do dia) — não a hora — garantindo que
              // dispara UMA VEZ POR DIA independentemente de reinícios dentro da janela de 30min.
              const [sendHour, sendMin] = sendTime.split(":").map(Number);
              const nowTotalMin = brazilDate.getHours() * 60 + brazilDate.getMinutes(); // hora BRT
              const targetTotalMin = sendHour * 60 + sendMin;
              // Só dispara depois do horário configurado (0 a +30 min de tolerância)
              if (nowTotalMin < targetTotalMin || nowTotalMin > targetTotalMin + 30) continue;

              // Buscar todos os alunos ativos do professor
              const activeStudentsList = await db
                .select({
                  id: students.id,
                  name: students.name,
                  phone: students.phone,
                  guardianPhone: students.guardianPhone,
                  birthDate: students.birthDate,
                  allowAutoReminders: students.allowAutoReminders,
                  instrumentName: instruments.name,
                })
                .from(students)
                .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
                .where(
                  and(
                    eq(students.organizationId, orgId),
                    eq(students.userId, userId),
                    eq(students.status, "ativo")
                  )
                );

              for (const student of activeStudentsList) {
                if (!student.allowAutoReminders) continue;
                if (!student.phone && !student.guardianPhone) continue;

                // Deduplicação: 1 lembrete por aluno por dia por regra
                const refId = `auto-rule-${rule.id}-dailystudy-${student.id}-${todayStr2}`;
                const existing = await db.select({ id: reminders.id }).from(reminders)
                  .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                if (existing.length > 0) continue;

                const message = (rule.messageTemplate ?? "")
                  .replace(/\{nome_aluno\}/g, student.name ?? "Aluno")
                  .replace(/\{nome_professor\}/g, professorName)
                  .replace(/\{nome_escola\}/g, schoolName)
                  .replace(/\{curso\}/g, student.instrumentName ?? "música")
                  .replace(/\{instrumento\}/g, student.instrumentName ?? "música");

                // INSERT PRIMEIRO — garante registro no banco antes do envio
                await db.insert(reminders).values({
                  organizationId: orgId, userId, studentId: student.id,
                  type: "manual", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                });

                // Envia imediatamente e marca como enviado
                if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                  const sendRes = await sendSmartWhatsAppNotification({
                    sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                    sendToGuardian: (rule as any).sendToGuardian === 1,
                    student: { phone: student.phone, guardianPhone: student.guardianPhone, birthDate: student.birthDate },
                    message,
                    sessionId: `prof_${userId}`,
                    whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                  });
                  const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                  if (newRem) {
                    if (sendRes.success) {
                      await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    } else if (sendRes.errors?.[0] === "Nenhum telefone válido encontrado para envio.") {
                      await db.update(reminders).set({ status: "cancelado", errorMessage: "Sem telefone válido para envio.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    } else {
                      await db.update(reminders).set({ errorMessage: sendRes.errors?.join(", ") ?? "Erro ao enviar mensagem.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                    }
                  }
                }
              }
            } else if (rule.trigger === "daily_report") {
              // ── RELATÓRIO DIÁRIO DE TREINOS CUSTOMIZADO ──────────────────────────────────
              let daysOfWeek: number[] = [1, 2, 3, 4, 5]; 
              let sendTime = "20:00";
              try {
                if (rule.conditions) {
                  const cond = JSON.parse(rule.conditions);
                  if (Array.isArray(cond.daysOfWeek)) daysOfWeek = cond.daysOfWeek;
                  if (typeof cond.sendTime === "string") sendTime = cond.sendTime;
                }
              } catch { /* mantém defaults */ }

              const brazilLocale = now2.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
              const brazilDate = new Date(brazilLocale);
              const currentDayOfWeek = brazilDate.getDay(); 
              if (!daysOfWeek.includes(currentDayOfWeek)) continue;

              const [sendHour2, sendMin2] = sendTime.split(":").map(Number);
              const nowTotalMin2 = brazilDate.getHours() * 60 + brazilDate.getMinutes(); 
              const targetTotalMin2 = sendHour2 * 60 + sendMin2;
              if (nowTotalMin2 < targetTotalMin2 || nowTotalMin2 > targetTotalMin2 + 30) continue;

              const { dailyStudyPlans, notifications } = await import("../drizzle/schema");
              
              const existingReport = await db.select({ id: notifications.id }).from(notifications)
                .where(and(eq(notifications.organizationId, orgId), eq(notifications.title, "Relatório Diário de Treinos 📊"), gte(notifications.createdAt, startOfDayUTC))).limit(1);
              
              if (existingReport.length === 0) {
                const plans = await db.select({ studentName: students.name, updatedAt: dailyStudyPlans.updatedAt })
                  .from(dailyStudyPlans)
                  .leftJoin(students, eq(dailyStudyPlans.studentId, students.id))
                  .where(and(eq(dailyStudyPlans.organizationId, orgId), eq(dailyStudyPlans.status, 'ativo'), eq(dailyStudyPlans.publishedStatus, 'publicado')));

                if (plans.length > 0) {
                  let resumo = "";
                  let anyStudent = false;

                  for (const p of plans) {
                    if (!p.studentName) continue;
                    anyStudent = true;
                    const updatedToday = p.updatedAt && new Date(p.updatedAt).getTime() >= startOfDayUTC.getTime();
                    resumo += `\n${updatedToday ? '✅' : '❌'} ${p.studentName.split(' ')[0]}`;
                  }

                  if (anyStudent) {
                    const message = (rule.messageTemplate ?? "")
                      .replace(/\{nome_professor\}/g, professorName)
                      .replace(/\{nome_escola\}/g, schoolName)
                      .replace(/\{resumo_treinos\}/g, resumo);

                    if (userSet.notifyWeeklyReport === 1) {
                      await db.insert(notifications).values({
                        organizationId: orgId, userId, title: "Relatório Diário de Treinos 📊", message: message, type: "info", actionUrl: "/progresso",
                      });

                      try {
                        await notifyUser(userId, { title: "Relatório Diário de Treinos 📊", content: message });
                      } catch (e) {
                        console.error("[Automation] Erro ao enviar push de relatório:", e);
                      }
                    }
                  }
                }
              }
            } else if (rule.trigger === "contract_expiring") {
              // ── FIM DE CONTRATO ───────────────────────────────────────────────
              // Avisa o aluno quando o contrato está próximo do fim, em 2 modos:
              // 'meses' (faltando X meses) ou 'aulas' (faltando X aulas), definidos
              // na regra via triggerUnit. Segue o mesmo padrão das outras automações
              // (insert reminder com dedup refId + WhatsApp + alerta no dashboard).
              const triggerUnit = (((rule as any).triggerUnit) || "meses") as "meses" | "aulas";
              const triggerValue = Math.max(1, Number(rule.offsetDays) || 1);

              const orgContracts = await db
                .select({
                  id: contracts.id,
                  studentId: contracts.studentId,
                  status: contracts.status,
                  startDate: contracts.startDate,
                  endDate: contracts.endDate,
                  title: contracts.title,
                })
                .from(contracts)
                .where(and(
                  eq(contracts.organizationId, orgId),
                  inArray(contracts.status, ["assinado", "aguardando_assinatura"] as const),
                  isNotNull(contracts.endDate),
                ))
                .orderBy(desc(contracts.endDate));

              for (const contract of orgContracts) {
                try {
                  if (!contract.endDate) continue;
                  const daysRemaining = computeDaysRemaining(contract.endDate, now2);
                  const monthsRemaining = computeMonthsRemaining(contract.endDate, now2);
                  if (daysRemaining <= 0) continue; // já encerrado

                  const [student] = await db
                    .select({
                      id: students.id,
                      name: students.name,
                      phone: students.phone,
                      guardianPhone: students.guardianPhone,
                      birthDate: students.birthDate,
                      schoolPlanId: students.schoolPlanId,
                      studentUserId: students.studentUserId,
                      status: students.status,
                      allowAutoReminders: students.allowAutoReminders,
                      instrumentName: instruments.name,
                    })
                    .from(students)
                    .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
                    .where(and(eq(students.id, contract.studentId), eq(students.organizationId, orgId)))
                    .limit(1);
                  if (!student) continue;
                  if (student.allowAutoReminders === false) continue;
                  if (student.status !== "ativo") continue;

                  // Cálculo do critério
                  let lessonsRemaining = 0;
                  if (triggerUnit === "aulas") {
                    const [plan] = await db
                      .select({ aulasPorSemana: schoolPlans.aulasPorSemana, duracaoMeses: schoolPlans.duracaoMeses })
                      .from(schoolPlans)
                      .where(and(eq(schoolPlans.id, student.schoolPlanId ?? -1), eq(schoolPlans.organizationId, orgId)))
                      .limit(1);
                    const aulasPorSemana = plan?.aulasPorSemana ?? null;
                    const duracaoMeses = plan?.duracaoMeses ?? null;
                    if (!aulasPorSemana || !duracaoMeses) {
                      debugLog(`[Automation] Contract ${contract.id}: aluno sem plano (schoolPlanId=${student.schoolPlanId}) — pulando modo aulas.`);
                      continue;
                    }
                    const total = computeTotalLessons(aulasPorSemana, duracaoMeses);
                    const [countRow] = await db
                      .select({ c: sql<number>`CAST(count(*) AS INT)` })
                      .from(lessons)
                      .where(and(
                        eq(lessons.organizationId, orgId),
                        eq(lessons.studentId, contract.studentId),
                        eq(lessons.status, "concluida"),
                        contract.startDate ? gte(lessons.scheduledAt, new Date(`${String(contract.startDate).slice(0, 10)}T00:00:00`)) : undefined,
                        contract.endDate ? lt(lessons.scheduledAt, new Date(`${String(contract.endDate).slice(0, 10)}T23:59:59`)) : undefined,
                      ));
                    lessonsRemaining = computeLessonsRemaining(total, Number(countRow?.c ?? 0));
                  }

                  const met = isContractExpiryTriggered(triggerUnit, triggerValue, daysRemaining, monthsRemaining, lessonsRemaining);
                  if (!met) continue;

                  // Dedup por contrato + regra (uma notificação por contrato por regra)
                  const refId = `auto-rule-${rule.id}-contract-${contract.id}`;
                  const existing = await db.select({ id: reminders.id }).from(reminders)
                    .where(and(eq(reminders.organizationId, orgId), eq(reminders.refId, refId))).limit(1);
                  if (existing.length > 0) continue;

                  const dataFim = new Date(`${String(contract.endDate).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
                  let message = (rule.messageTemplate ?? "")
                    .replace(/\{nome_aluno\}/g, student.name ?? "Aluno")
                    .replace(/\{nome_professor\}/g, professorName)
                    .replace(/\{nome_escola\}/g, schoolName)
                    .replace(/\{curso\}/g, student.instrumentName ?? "música")
                    .replace(/\{instrumento\}/g, student.instrumentName ?? "música")
                    .replace(/\{data_fim_contrato\}/g, dataFim)
                    .replace(/\{meses_restantes\}/g, String(Math.max(0, monthsRemaining)))
                    .replace(/\{aulas_restantes\}/g, String(lessonsRemaining))
                    .replace(/\{[^}]+\}/g, '');

                  // INSERT PRIMEIRO — garante registro no banco antes do envio
                  await db.insert(reminders).values({
                    organizationId: orgId, userId, studentId: contract.studentId,
                    type: "manual", message, scheduledAt: now2, status: "pendente", autoGenerated: 1, refId,
                  });

                  // Alerta no dashboard do aluno (notifications → userId do login do aluno)
                  if (student.studentUserId) {
                    await db.insert(notifications).values({
                      organizationId: orgId,
                      userId: student.studentUserId,
                      title: "📄 Contrato próximo do fim",
                      message,
                      type: "warning",
                      actionUrl: "/aluno/contratos",
                    });
                    debugLog(`[Automation] Contrato ${contract.id}: alerta no dashboard do aluno (userId=${student.studentUserId}).`);
                  }

                  // Envia WhatsApp imediatamente (se habilitado) e marca como enviado
                  if (userSet.whatsappAutoSend === 1 && userSet.whatsappBotUrl && await canSendWhatsApp(userId, orgId)) {
                    const routingRes = await sendSmartWhatsAppNotification({
                      sendToStudent: (rule as any).sendToStudent === 1 || (rule as any).sendToStudent === undefined,
                      sendToGuardian: (rule as any).sendToGuardian === 1,
                      student: { phone: student.phone, guardianPhone: student.guardianPhone, birthDate: student.birthDate },
                      message,
                      sessionId: `prof_${userId}`,
                      whatsappConfig: { url: userSet.whatsappBotUrl, token: userSet.whatsappBotToken }
                    });

                    const [newRem] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.refId, refId)).limit(1);
                    if (newRem) {
                      if (routingRes.success) {
                        await db.update(reminders).set({ status: "enviado", sentAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                      } else if (routingRes.errors?.[0] === "Nenhum telefone válido encontrado para envio.") {
                        await db.update(reminders).set({ status: "cancelado", errorMessage: "Sem telefone válido para envio.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                      } else {
                        await db.update(reminders).set({ errorMessage: routingRes.errors?.join(", ") ?? "Erro ao enviar mensagem.", updatedAt: new Date() }).where(eq(reminders.id, newRem.id));
                      }
                    }
                  }
                } catch (contractErr) {
                  console.error(`[Automation] Erro processando contrato ${contract.id} (regra ${rule.id}):`, contractErr);
                }
              }
            }
          } catch (ruleErr) {
            console.error(`[Automation] Error processing rule ID ${rule.id} (${rule.name}):`, ruleErr);
          }
        }
      }
    }
  } catch (automationRulesErr) {
    console.error("[Automation] Error in automation rules processing:", automationRulesErr);
  }

  // ── ⭐ Ciclos de Avaliação de Professores (PRD módulo 2) ──
  // Independente das regras: abre novo ciclo quando a frequência configurada venceu.
  try {
    const db2 = await getDb();
    if (db2) {
      const { processEvaluationCycleOpenings } = await import("./routers/avaliacoesRouters");
      await processEvaluationCycleOpenings(db2);
    }
  } catch (evalCycleErr) {
    console.error("[Automation] Error in evaluation cycle processing:", evalCycleErr);
  }

  } finally {
    isAutomationRunning = false;
  }
}

export function startAutomationJob() {
  // Executa imediatamente na subida do servidor e agenda repetições a cada 1 minuto
  runAutomation().catch(err => console.error("[Automation] Initial run error:", err));
  setInterval(() => {
    runAutomation().catch(err => console.error("[Automation] Scheduled run error:", err));
  }, 60 * 1000);

  debugLog("[Automation] Job scheduler started — runs every 1 minute");
}

