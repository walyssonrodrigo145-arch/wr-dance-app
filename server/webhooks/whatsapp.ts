import { debugLog } from "../_core/logger";
import { Router } from "express";
import crypto from "crypto";
import { getDb } from "../db";
import { students, chatbotSessions, lessons, settings, paymentDues, notifications, fcmTokens, chatbotFlows, schoolKnowledgeBase, instruments, chatbotLogs } from "../../drizzle/schema";
import { eq, and, gte, ilike } from "drizzle-orm";
import { sendWhatsAppMessage, isRecentBotMessage, canonicalizeWaPhone } from "../utils/whatsapp";
import { parseToolActions, stripToolMarkers, executeChatbotTool, generateAvailableSlots, isSlotFree } from "../utils/chatbotTools";
import { buildUserContext } from "../utils/aiContext";
import { getSystemPrompt, getAttendancePrompt, buildSchoolKnowledgePrompt, buildKnowledgeContext, AI_PROMPT_VERSIONS } from "../utils/aiPrompts";
import { resolveAiCredentials } from "../utils/aiProvider";
import { callGemini } from "../utils/gemini";
import { sendPushNotification } from "../firebaseAdmin";
import { getDefaultFlow, ChatbotFlowData } from "../chatbotFlowRouter";
import { ENV } from "../_core/env";

const router = Router();

// SEGURANÇA: comparação de strings em tempo constante
function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Tomada humana: pausa automática quando o professor responde manualmente ──
// RN-003 (PRD): resfriamento de 24h antes de o robô aceitar voltar via "MENU".
const HUMAN_TAKEOVER_RESUME_MS = 24 * 60 * 60 * 1000;
// Pausa antiga sem tomada humana (ex.: aluno pediu atendimento e sumiu) expira
// após 24h — evita sessões órfãs em silêncio eterno.
const STALE_PAUSE_RESUME_MS = 24 * 60 * 60 * 1000;
// RN-005 (PRD): notificação de pausa limitada a 1 por contato a cada 30 min.
const TAKEOVER_NOTIFY_THROTTLE_MS = 30 * 60 * 1000;
const manualTakeoverNotifiedAt = new Map<string, number>(); // key: `${professorUserId}|${phone}`

/**
 * Indica se a sessão está sob tomada humana ativa (professor respondeu
 * manualmente há menos de HUMAN_TAKEOVER_RESUME_MS).
 */
export function humanTakeoverActive(sessionData: any): boolean {
  try {
    if (!sessionData || sessionData.pausedBy !== "professor_manual") return false;
    const t = new Date(sessionData.lastHumanReplyAt).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < HUMAN_TAKEOVER_RESUME_MS;
  } catch (_) {
    return false;
  }
}

/**
 * Pausa (ou renova a pausa de) a sessão do contato porque o professor respondeu
 * manualmente. Preserva activeProfessorId e demais metadados existentes.
 * Adota sessão legada criada sob o JID antigo (sem 9º dígito), se existir.
 */
async function pauseSessionForManualReply(db: any, phone: string, rawPhone: string, professorUserId: number): Promise<void> {
  const nowIso = new Date().toISOString();
  const [session] = await db.select().from(chatbotSessions).where(eq(chatbotSessions.phone, phone)).limit(1);
  let target = session;
  if (!target && phone !== rawPhone) {
    const [legacy] = await db.select().from(chatbotSessions).where(eq(chatbotSessions.phone, rawPhone)).limit(1);
    if (legacy) {
      await db.update(chatbotSessions).set({ phone }).where(eq(chatbotSessions.id, legacy.id));
      legacy.phone = phone;
      target = legacy;
    }
  }
  const sd: any = target?.data ? (() => { try { return JSON.parse(target.data); } catch (_) { return {}; } })() : {};
  const merged = { ...sd, activeProfessorId: professorUserId, pausedBy: "professor_manual", lastHumanReplyAt: nowIso };
  if (target) {
    await db.update(chatbotSessions).set({
      state: "PAUSED_HUMAN",
      data: JSON.stringify(merged),
      updatedAt: new Date(),
    }).where(eq(chatbotSessions.id, target.id));
  } else {
    await db.insert(chatbotSessions).values({
      phone,
      state: "PAUSED_HUMAN",
      data: JSON.stringify(merged),
    });
  }
}

// ─── Menus do bot (AUDIT FIX: eram chamados mas não definidos → 500 no webhook)
const menuPrincipalMsg = (schoolName: string, primeiroNome: string) =>
  `Olá, *${primeiroNome}*! Bem-vindo(a) à *${schoolName}*!\n\nO que você deseja fazer?\n\n1️⃣  Minhas Aulas\n2️⃣  Financeiro\n3️⃣  Agendar uma Aula\n4️⃣  Reagendar Aula\n5️⃣  Falar com o Professor\n6️⃣  Indicar um amigo\n\n_Digite o número da opção_ 💬`;

const menuPrincipalNovoMsg = (schoolName: string) =>
  `Olá! Bem-vindo(a) à *${schoolName}*!\n\nComo posso ajudar?\n\n1️⃣  Quero me matricular\n2️⃣  Quero falar com a escola\n\n_Digite o número da opção_ 💬`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrai o texto da mensagem do payload do Baileys/Evolution */
function extractMessageText(messageObj: any): string {
  if (!messageObj) return "";
  if (messageObj.conversation) return messageObj.conversation;
  if (messageObj.extendedTextMessage?.text) return messageObj.extendedTextMessage.text;
  if (messageObj.imageMessage?.caption) return messageObj.imageMessage.caption;
  return "";
}

/** Compara opção digitada */
function isOption(text: string, option: string): boolean {
  return text.trim() === option;
}

// generateAvailableSlots e isSlotFree foram movidos para server/utils/chatbotTools.ts
// (fonte única compartilhada com as ferramentas de consulta da IA).

// ─── Menu Principal Dinâmico & Configurável ──────────────────────────────────

async function getDynamicFlow(db: any, orgId: number, flowType: "aluno" | "lead"): Promise<ChatbotFlowData> {
  try {
    const [flow] = await db
      .select()
      .from(chatbotFlows)
      .where(
        and(
          eq(chatbotFlows.organizationId, orgId),
          eq(chatbotFlows.flowType, flowType),
          eq(chatbotFlows.isActive, 1)
        )
      )
      .limit(1);

    if (flow && flow.options) {
      try {
        const parsedOptions = JSON.parse(flow.options);
        return {
          id: flow.id,
          flowType: flow.flowType as any,
          name: flow.name || undefined,
          welcomeMessage: flow.welcomeMessage || getDefaultFlow(flowType).welcomeMessage,
          fallbackMessage: flow.fallbackMessage || getDefaultFlow(flowType).fallbackMessage,
          humanMessage: flow.humanMessage || getDefaultFlow(flowType).humanMessage,
          exitMessage: flow.exitMessage || getDefaultFlow(flowType).exitMessage,
          options: parsedOptions,
          isActive: flow.isActive,
        };
      } catch {
        /* fallback */
      }
    }
  } catch (err) {
    console.error("[Chatbot] Erro ao buscar fluxo dinâmico:", err);
  }
  return getDefaultFlow(flowType);
}

function renderDynamicMenu(flow: ChatbotFlowData, schoolName: string, studentName?: string): string {
  const primeiroNome = studentName ? studentName.split(" ")[0] : "Aluno";
  let msg = (flow.welcomeMessage || "")
    .replace(/\{nome_aluno\}/g, studentName || "Aluno")
    .replace(/\{primeiro_nome\}/g, primeiroNome)
    .replace(/\{nome_escola\}/g, schoolName)
    .replace(/\{link_matricula\}/g, `https://wrmusicpro.com.br/matricula/${schoolName.toLowerCase().replace(/\s+/g, '-')}`)
    .replace(/\{link_portal\}/g, "https://wrmusicpro.com.br/aluno");

  msg += "\n\n";
  const activeOpts = (flow.options || []).filter((o) => o.isActive);
  activeOpts.sort((a, b) => a.order - b.order);

  for (const opt of activeOpts) {
    const digitEmoji = opt.digit === "0" ? "0️⃣" : opt.digit === "99" ? "9️⃣9️⃣" : `${opt.digit}️⃣`;
    msg += `${digitEmoji}  ${opt.title}\n`;
  }
  msg += "\n_Digite o número da opção desejada_ 👇";
  return msg;
}

function interpolateText(text: string, schoolName: string, studentName?: string, extra?: Record<string, string>): string {
  const primeiroNome = studentName ? studentName.split(" ")[0] : "Aluno";
  let res = (text || "")
    .replace(/\{nome_aluno\}/g, studentName || "Aluno")
    .replace(/\{primeiro_nome\}/g, primeiroNome)
    .replace(/\{nome_escola\}/g, schoolName)
    .replace(/\{link_matricula\}/g, `https://wrmusicpro.com.br/matricula/${schoolName.toLowerCase().replace(/\s+/g, '-')}`)
    .replace(/\{link_portal\}/g, "https://wrmusicpro.com.br/aluno");

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      res = res.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return res;
}

async function answerWithSchoolKnowledge(
  db: any,
  orgId: number,
  schoolName: string,
  userQuestion: string,
  profSettings: any,
  studentName?: string
): Promise<string | null> {
  try {
    // RF-002 (PRD): resolução unificada com fallback entre providers
    const primaryCreds = resolveAiCredentials(profSettings);
    let apiKey = primaryCreds.apiKey;
    let model = primaryCreds.model;
    if (!apiKey) {
      const alt = resolveAiCredentials({ ...profSettings, aiProvider: profSettings?.aiProvider === "groq" ? "gemini" : "groq" });
      apiKey = alt.apiKey;
      model = alt.model;
    }
    if (!apiKey) return null;

    const activeTopics = await db
      .select()
      .from(schoolKnowledgeBase)
      .where(and(eq(schoolKnowledgeBase.organizationId, orgId), eq(schoolKnowledgeBase.isActive, 1)));

    if (activeTopics.length === 0) return null;

    // RF-008: caps (20 tópicos × 4.000 chars) via helper único
    const knowledgeContext = buildKnowledgeContext(
      activeTopics.map((t: any) => ({ title: t.title, content: t.content })),
      20,
      4000
    );

    const enrollmentLink = `https://wrmusicpro.com.br/matricula/${schoolName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

    // RF-004: mesma personalidade/tom do atendimento completo (fonte única)
    const systemPrompt = buildSchoolKnowledgePrompt({
      schoolName,
      personaName: profSettings?.attendancePersonaName,
      tone: profSettings?.attendanceTone,
      studentName,
      knowledgeContext,
      enrollmentLink,
    });

    const reply = await callGemini([{ role: "user", content: userQuestion }], systemPrompt, false, apiKey, model, 0.4, {
      organizationId: orgId,
      feature: "atendente_rag",
      promptVersion: AI_PROMPT_VERSIONS.atendenteRAG,
    });
    return reply && reply.trim() ? reply.trim() : null;
  } catch (err) {
    console.error("[Chatbot AI RAG] Erro ao consultar IA da escola:", err);
    return null;
  }
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    // AUDIT-P0 FIX: autenticação do webhook.
    // Se WHATSAPP_WEBHOOK_TOKEN estiver definido no ambiente, TODA requisição deve
    // apresentá-lo (header X-Webhook-Token ou query ?token=). Sem o env configurado
    // o endpoint continua aberto (compatibilidade) — um alerta é logado no boot.
    if (ENV.whatsappWebhookToken) {
      const provided =
        (req.headers["x-webhook-token"] as string) ||
        ((req.query as any)?.token as string) ||
        "";
      if (!provided || !safeEqualStr(provided, ENV.whatsappWebhookToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body;
    debugLog("[Webhook Debug] Payload recebido:", JSON.stringify(payload).substring(0, 300));

    // O Evolution API às vezes envia "messages.upsert" (v1) e outras vezes "MESSAGES_UPSERT" (v2)
    const eventName = payload?.event || "";
    if (eventName !== "messages.upsert" && eventName !== "MESSAGES_UPSERT") {
      return res.status(200).json({ ok: true });
    }

    const messageData = payload.data?.message;
    if (!messageData) return res.status(200).json({ ok: true });

    // O bloqueio de fromMe será feito mais abaixo, após descobrirmos se é o professor

    const remoteJid = payload.data.key?.remoteJid || "";
    if (!remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
      return res.status(200).json({ ok: true }); // ignora grupos e status/broadcast
    }

    // RF-005 (PRD): chave canônica da sessão — o mesmo contato pode chegar por
    // dois JIDs (com/sem 9º dígito). Sem isso, histórico e contexto se dividem.
    const rawPhone = remoteJid.split("@")[0];
    const phone = canonicalizeWaPhone(rawPhone);
    const textMsg = extractMessageText(messageData);
    const pushName = payload.data.pushName || "Aluno";

    // Mensagens sem texto são processadas apenas se vierem do próprio número
    // conectado (fromMe) — podem ser resposta manual do professor com mídia.
    // De alunos/leads seguem sendo ignoradas (comportamento original).
    if (!textMsg && !payload.data.key?.fromMe) return res.status(200).json({ ok: true });

    debugLog(`[Chatbot] Mensagem de ${phone}: ${textMsg}`);

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB offline" });

    // ── Identificar professor pela instância Evolution API ──
    let professorUserId = 1;
    const instanceName = payload.instance || "";
    if (instanceName.startsWith("prof_")) {
      const parsedId = parseInt(instanceName.split("_")[1], 10);
      if (!isNaN(parsedId)) professorUserId = parsedId;
    }

    // ── Verificar se o chatbot está habilitado ──
    const [profSettings] = await db
      .select({
        chatbotEnabled: settings.chatbotEnabled,
        schoolName: settings.schoolName,
        whatsappBotUrl: settings.whatsappBotUrl,
        whatsappBotToken: settings.whatsappBotToken,
        schoolHours: settings.schoolHours,
        conversationalMode: settings.conversationalMode,
        attendancePersonaName: settings.attendancePersonaName,
        attendanceTone: settings.attendanceTone,
        phone: settings.phone,
        organizationId: settings.organizationId,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        groqApiKey: settings.groqApiKey,
        groqModel: settings.groqModel,
        aiProvider: settings.aiProvider,
        pixKey: settings.pixKey,
        lessonDuration: settings.lessonDuration,
      })
      .from(settings)
      .where(eq(settings.userId, professorUserId))
      .limit(1);

    if (!profSettings || !profSettings.chatbotEnabled) {
      // Robô desativado — ignora silenciosamente
      return res.status(200).json({ ok: true });
    }

    // AUDIT FIX: as chaves de IA são armazenadas criptografadas (v1:...) pelo
    // upsertSettings. Este webhook lê a settings diretamente (sem passar pelo
    // getSettingsByUserId, que já descriptografa) — então descriptografa aqui.
    try {
      if (profSettings.geminiApiKey || profSettings.groqApiKey) {
        const { decryptSecret } = await import("../utils/integrationCrypto");
        if (profSettings.geminiApiKey?.startsWith("v1:")) {
          profSettings.geminiApiKey = decryptSecret(profSettings.geminiApiKey);
        }
        if (profSettings.groqApiKey?.startsWith("v1:")) {
          profSettings.groqApiKey = decryptSecret(profSettings.groqApiKey);
        }
      }
    } catch (decErr) {
      console.error("[Chatbot] Erro ao descriptografar chaves de IA:", decErr);
    }

    const schoolName = profSettings.schoolName || "nossa Escola de Música";

    const cleanProfPhone = profSettings.phone ? profSettings.phone.replace(/\D/g, "") : "";
    const cleanMsgPhone = phone.replace(/\D/g, "");
    
    // É o próprio professor mandando mensagem para o seu próprio número?
    const isProfessorChat = (cleanProfPhone.length > 8 && cleanMsgPhone.endsWith(cleanProfPhone.slice(-8)));

    // Mensagens fromMe em chats de terceiros são classificadas mais abaixo
    // (eco do bot × resposta manual do professor) após identificar o contato.

    // Se for o bot respondendo no chat do professor, ignoramos para não gerar loop infinito
    if (isProfessorChat && textMsg.startsWith("🤖")) {
      return res.status(200).json({ ok: true });
    }

    // ── Função auxiliar de resposta ──
    const sendReply = async (msg: string) => {
      // RF-007 (PRD): revalida o estado da sessão imediatamente antes do envio.
      // Evita corrida em que o professor respondeu manualmente enquanto a IA
      // ainda estava processando/"digitando" — nesse caso o bot aborta o envio.
      // Pausas solicitadas PELO ALUNO (opção 0) não bloqueiam a confirmação.
      if (!isProfessorChat) {
        try {
          const [fresh] = await db
            .select({ state: chatbotSessions.state, data: chatbotSessions.data })
            .from(chatbotSessions)
            .where(eq(chatbotSessions.phone, phone))
            .limit(1);
          let freshData: any = {};
          try { freshData = JSON.parse(fresh?.data || "{}"); } catch (_) {}
          if (fresh?.state === "PAUSED_HUMAN" && humanTakeoverActive(freshData)) {
            debugLog(`[Chatbot] Resposta para ${phone} abortada: conversa assumida pelo professor.`);
            return;
          }
        } catch (_) {
          // falha na checagem não deve bloquear o envio
        }
      }
      const result = await sendWhatsAppMessage({
        url: profSettings.whatsappBotUrl || undefined,
        token: profSettings.whatsappBotToken || undefined,
        phone,
        message: msg,
        sessionId: instanceName || "prof_1",
      });
      debugLog(`[Chatbot] Resposta para ${phone} via ${instanceName || "prof_1"}: success=${result.success}`, result.error ? `Erro: ${result.error}` : "");
    };

    // ── Função auxiliar para notificar o professor (Push FCM + Sistema + WhatsApp) ──
    const notifyProfessor = async (msg: string, title?: string, opts?: { whatsapp?: boolean }) => {
      const notifTitle = title || "🤖 Aviso do Robô WhatsApp";

      // 1. Inserir no painel do sistema (banco de dados)
      try {
        await db.insert(notifications).values({
          organizationId: profSettings.organizationId,
          userId: professorUserId,
          title: notifTitle,
          message: msg,
          type: "info",
          read: false,
          actionUrl: "/automacoes",
          createdAt: new Date(),
        });
      } catch (nErr) {
        console.error("[notifyProfessor] Erro ao salvar notificação no banco:", nErr);
      }

      // 2. Disparar notificação PUSH para o aparelho do professor (FCM)
      try {
        const tokens = await db
          .select({ token: fcmTokens.token })
          .from(fcmTokens)
          .where(eq(fcmTokens.userId, professorUserId));

        for (const { token } of tokens) {
          await sendPushNotification(
            token,
            notifTitle,
            msg.replace(/\*/g, ""),
            { url: "/automacoes" }
          );
        }
      } catch (fcmErr) {
        console.error("[notifyProfessor] Erro ao enviar Push FCM:", fcmErr);
      }

      // 3. Notificar via mensagem do WhatsApp (opcional — desativada na pausa
      // por resposta manual, pois o professor acabou de falar com o contato)
      if (opts?.whatsapp === false) return;
      if (!profSettings.phone) return;
      const result = await sendWhatsAppMessage({
        url: profSettings.whatsappBotUrl || undefined,
        token: profSettings.whatsappBotToken || undefined,
        phone: profSettings.phone,
        message: `🤖 *${notifTitle}:*\n\n${msg}`,
        sessionId: instanceName || "prof_1",
      });
      debugLog(`[Chatbot] Notificação enviada ao professor (${profSettings.phone}): success=${result.success}`);
    };

    // ── Identificar aluno cadastrado (pelo telefone do aluno OU do responsável) ──
    const allStudents = await db
      .select()
      .from(students)
      .where(eq(students.professorId, professorUserId));

    const student = allStudents.find((s) => {
      const cleanMsg = phone.replace(/\D/g, "");
      if (!cleanMsg) return false;

      // 1. Telefone do aluno
      const cleanStudentPhone = s.phone ? s.phone.replace(/\D/g, "") : "";
      if (cleanStudentPhone) {
        // Compara com os últimos 8 e 9 dígitos (cobre variações com/sem DDD e com/sem 9º dígito)
        if (cleanStudentPhone.slice(-8) === cleanMsg.slice(-8)) return true;
        if (cleanStudentPhone.length >= 10 && cleanMsg.length >= 10 && cleanStudentPhone.slice(-10) === cleanMsg.slice(-10)) return true;
      }

      // 2. Telefone do responsável (pai / mãe)
      const cleanGuardianPhone = s.guardianPhone ? s.guardianPhone.replace(/\D/g, "") : "";
      if (cleanGuardianPhone) {
        if (cleanGuardianPhone.slice(-8) === cleanMsg.slice(-8)) return true;
        if (cleanGuardianPhone.length >= 10 && cleanMsg.length >= 10 && cleanGuardianPhone.slice(-10) === cleanMsg.slice(-10)) return true;
      }

      return false;
    });

    // ─────────────────────────────────────────────────────
    // TOMADA HUMANA (RN-001 a RN-005 do PRD): mensagens fromMe em chats de
    // terceiros são eco do bot OU resposta manual do professor. Eco → ignorar.
    // Manual → pausar o atendimento automático (menu E IA) para esse contato.
    // ─────────────────────────────────────────────────────
    if (payload.data.key?.fromMe && !isProfessorChat) {
      const msgId = payload.data.key?.id || "";
      if (isRecentBotMessage(instanceName, phone, msgId, textMsg)) {
        // Eco de mensagem enviada pelo próprio robô — ignora sem pausar
        return res.status(200).json({ ok: true });
      }

      // Resposta manual do professor → silencia o robô nesta conversa
      debugLog(`[Chatbot] Resposta MANUAL do professor detectada para ${phone} — pausando atendimento automático.`);
      try {
        await pauseSessionForManualReply(db, phone, rawPhone, professorUserId);
      } catch (pauseErr) {
        console.error("[Chatbot] Erro ao pausar sessão após resposta manual:", pauseErr);
        return res.status(200).json({ ok: true });
      }

      // Notifica o professor no painel/push (sem WhatsApp; throttle 30 min)
      const notifyKey = `${professorUserId}|${phone}`;
      const lastNotified = manualTakeoverNotifiedAt.get(notifyKey) || 0;
      if (Date.now() - lastNotified > TAKEOVER_NOTIFY_THROTTLE_MS) {
        manualTakeoverNotifiedAt.set(notifyKey, Date.now());
        try {
          await notifyProfessor(
            `🤖 *Robô pausado automaticamente*\n\nVocê respondeu manualmente o contato *${student?.name || pushName}* (${phone}). O atendimento automático (menu e IA) ficou em silêncio nessa conversa para não brigar com você.\n\n_O contato volta ao atendimento automático digitando *MENU* após 24h._`,
            "🤖 Robô pausado — você assumiu a conversa",
            { whatsapp: false }
          );
        } catch (notifErr) {
          console.error("[Chatbot] Erro ao notificar tomada humana:", notifErr);
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Mensagens de alunos/leads sem texto (ex.: mídia sem legenda) continuam
    // sendo ignoradas — comportamento original preservado.
    if (!textMsg) return res.status(200).json({ ok: true });

    // ── Recuperar ou criar sessão ──
    let [session] = await db
      .select()
      .from(chatbotSessions)
      .where(eq(chatbotSessions.phone, phone));

    // Migração automática: sessão legada criada com o JID antigo (sem 9º dígito)
    // é adotada e regravada sob a chave canônica — histórico preservado.
    if (!session && phone !== rawPhone) {
      try {
        const [legacy] = await db
          .select()
          .from(chatbotSessions)
          .where(eq(chatbotSessions.phone, rawPhone));
        if (legacy) {
          await db.update(chatbotSessions).set({ phone }).where(eq(chatbotSessions.id, legacy.id));
          legacy.phone = phone;
          session = legacy as typeof session;
          debugLog(`[Chatbot] Sessão legada migrada ${rawPhone} → ${phone}`);
        }
      } catch (migErr) {
        console.error("[Chatbot] Erro na migração de sessão legada:", migErr);
      }
    }

    let sessionData: any = {};
    if (session?.data) {
      try { sessionData = JSON.parse(session.data); } catch (_) {}
    }

    // Reset de sessão se mudou de professor (preserva pausa por tomada humana)
    if (session && sessionData.activeProfessorId && sessionData.activeProfessorId !== professorUserId) {
      const carriedPause = humanTakeoverActive(sessionData)
        ? { pausedBy: sessionData.pausedBy, lastHumanReplyAt: sessionData.lastHumanReplyAt }
        : {};
      sessionData = { activeProfessorId: professorUserId, ...carriedPause };
      await db.update(chatbotSessions).set({
        state: carriedPause.pausedBy ? "PAUSED_HUMAN" : "START",
        data: JSON.stringify(sessionData),
        updatedAt: new Date(),
      }).where(eq(chatbotSessions.id, session.id));
      session.state = carriedPause.pausedBy ? "PAUSED_HUMAN" : "START";
      session.data = JSON.stringify(sessionData);
    }

    if (!session) {
      sessionData = { activeProfessorId: professorUserId };
      [session] = await db.insert(chatbotSessions).values({
        phone,
        state: "START",
        data: JSON.stringify(sessionData),
      }).returning();
    }

    const updateState = async (state: string, data?: any) => {
      // RF-007/RN-002 (PRD): se o professor assumiu a conversa manualmente
      // enquanto este fluxo processava, NÃO sobrescreve a pausa — preserva o
      // silêncio do robô e os metadados de tomada humana.
      if (session.state !== "PAUSED_HUMAN") {
        try {
          const [fresh] = await db
            .select({ state: chatbotSessions.state, data: chatbotSessions.data })
            .from(chatbotSessions)
            .where(eq(chatbotSessions.phone, phone))
            .limit(1);
          let fd: any = {};
          try { fd = JSON.parse(fresh?.data || "{}"); } catch (_) {}
          if (fresh?.state === "PAUSED_HUMAN" && humanTakeoverActive(fd)) {
            session.state = "PAUSED_HUMAN";
            sessionData = fd;
            return;
          }
        } catch (_) {
          // falha na checagem não deve interromper o fluxo
        }
      }
      const mergedData = { ...sessionData, ...(data || {}), activeProfessorId: professorUserId };
      await db.update(chatbotSessions).set({
        state,
        data: JSON.stringify(mergedData),
        updatedAt: new Date(),
      }).where(eq(chatbotSessions.id, session.id));
      session.state = state;
      sessionData = mergedData;
    };

    const input = textMsg.trim();
    const inputUpper = input.toUpperCase();

    // ─────────────────────────────────────────────────────
    // COMANDOS GLOBAIS: Falar com Professor (0) e Encerrar (99 / SAIR)
    // ─────────────────────────────────────────────────────
    if (session.state !== "PAUSED_HUMAN" && !isProfessorChat) {
      if (input === "0") {
        await updateState("PAUSED_HUMAN");
        await notifyProfessor(`👤 *Solicitação de Atendimento Humano!*\n\nContato *${student?.name || pushName}* (${phone}) solicitou falar com o professor pelo robô (opção 0).`);
        await sendReply("Claro! Chamei o professor para te atender. Aguarde um instante! 🎸👤\n\n_Quando quiser voltar ao robô automático no futuro, é só digitar *MENU*._");
        return res.status(200).json({ ok: true });
      }

      if (input === "99" || inputUpper === "SAIR" || inputUpper === "ENCERRAR" || inputUpper === "TCHAU") {
        await updateState("AGUARDANDO_MENU");
        await sendReply("Atendimento encerrado! 😊\n\nFoi um prazer falar com você. Se precisar de algo no futuro, é só mandar uma mensagem ou digitar *MENU*! 🎵👋");
        return res.status(200).json({ ok: true });
      }
    }

    // ─────────────────────────────────────────────────────
    // ESTADO: PAUSED_HUMAN — robô em silêncio
    // ─────────────────────────────────────────────────────
    if (session.state === "PAUSED_HUMAN") {
      // RN-003/RN-004 (PRD): durante o resfriamento de 24h após resposta manual
      // do professor, o robô fica em silêncio ABSOLUTO — nem "MENU" o reativa.
      const pauseAgeMs = session.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : 0;
      const stalePause = !humanTakeoverActive(sessionData) && pauseAgeMs > STALE_PAUSE_RESUME_MS;

      if (!stalePause) {
        if (inputUpper === "MENU" && !humanTakeoverActive(sessionData)) {
          await updateState("START");
          await sendReply("Estou de volta! 🤖✨\nPode falar comigo normalmente, estou aqui pra te ajudar!");
        }
        return res.status(200).json({ ok: true });
      }
      // Pausa antiga (>24h) sem tomada humana ativa expira automaticamente:
      // a sessão volta ao START e ESTA mensagem segue o fluxo normal do bot.
      await updateState("START", {});
    }

    // ─────────────────────────────────────────────────────
    // RECEPCIONISTA VIRTUAL — IA conversacional em linguagem natural.
    // Intercepta mensagens livres nos estados de conversa. Entradas numéricas,
    // a palavra MENU e comprovantes seguem para os fluxos tradicionais.
    // ─────────────────────────────────────────────────────
    const CONVERSATIONAL_STATES = ["START", "MENU_ALUNO", "MENU_NOVO", "AGUARDANDO_MENU"];
    const isNumericInput = /^\d{1,2}$/.test(input);
    const isReceiptMsg =
      !!messageData.imageMessage ||
      !!messageData.documentMessage ||
      /comprovante|paguei|pix|transferencia|transferência|pagamento|deposito|depósito/i.test(textMsg);

    // Resolve chaves de IA (RF-002): usa o provedor configurado (inclui opencode);
    // se vazio, tenta o outro provider (fallback de compatibilidade)
    const primaryCreds = resolveAiCredentials(profSettings);
    let aiKey = primaryCreds.apiKey;
    let aiModel = primaryCreds.model;
    if (!aiKey) {
      const altCreds = resolveAiCredentials({ ...profSettings, aiProvider: profSettings.aiProvider === "groq" ? "gemini" : "groq" });
      aiKey = altCreds.apiKey;
      aiModel = altCreds.model;
    }
    const hasAIKey = !!aiKey;

    if (
      profSettings.conversationalMode !== 0 &&
      hasAIKey &&
      !isProfessorChat &&
      CONVERSATIONAL_STATES.includes(session.state) &&
      !isNumericInput &&
      inputUpper !== "MENU" &&
      !isReceiptMsg &&
      input.trim().length >= 2
    ) {
      try {
        // ── Contexto do aluno (próxima aula, mensalidades, instrumento) ──
        let studentContext = "";
        if (student) {
          const [nextLesson] = await db
            .select()
            .from(lessons)
            .where(and(eq(lessons.studentId, student.id), gte(lessons.scheduledAt, new Date()), eq(lessons.status, "agendada")))
            .orderBy(lessons.scheduledAt)
            .limit(1);

          const pendDues = await db
            .select()
            .from(paymentDues)
            .where(and(eq(paymentDues.studentId, student.id), eq(paymentDues.status, "pendente")));

          let instrumentName: string | null = null;
          if ((student as any).instrumentId) {
            const [inst] = await db
              .select({ name: instruments.name })
              .from(instruments)
              .where(eq(instruments.id, (student as any).instrumentId))
              .limit(1);
            instrumentName = inst?.name || null;
          }

          const fmtD = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
          const fmtH = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

          studentContext += `- Nome: ${student.name}\n`;
          if (instrumentName) studentContext += `- Instrumento: ${instrumentName}\n`;
          if (nextLesson) studentContext += `- Próxima aula: ${fmtD(nextLesson.scheduledAt)} às ${fmtH(nextLesson.scheduledAt)} (${nextLesson.duration} min)\n`;
          else studentContext += `- Próxima aula: nenhuma aula futura agendada\n`;
          if (pendDues.length === 0) studentContext += `- Financeiro: em dia ✅\n`;
          else {
            const p = pendDues[0];
            const valor = parseFloat(String(p.amount)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            studentContext += `- Financeiro: ${pendDues.length} mensalidade(s) em aberto, a mais antiga de ${valor} vencida em ${new Date(p.dueDate + "T12:00:00").toLocaleDateString("pt-BR")}\n`;
          }
        }

        // ── Base de conhecimento da escola (FAQ) — RF-008: caps via helper único ──
        let knowledgeContext = "";
        try {
          const topics = await db
            .select()
            .from(schoolKnowledgeBase)
            .where(and(eq(schoolKnowledgeBase.organizationId, profSettings.organizationId || 1), eq(schoolKnowledgeBase.isActive, 1)));
          knowledgeContext = buildKnowledgeContext(
            topics.map(t => ({ title: t.title, content: t.content })),
            20,
            4000
          );
        } catch (kbErr) {
          console.error("[AI Atendimento] Erro ao carregar base de conhecimento:", kbErr);
        }

        // ── Histórico da conversa (últimas 20 mensagens) ──
        const historyObj: any[] = Array.isArray(sessionData.aiHistory) ? sessionData.aiHistory : [];
        historyObj.push({ role: "user", content: input });
        if (historyObj.length > 20) historyObj.splice(0, historyObj.length - 20);

        const nowInfo = new Date().toLocaleString("pt-BR", {
          weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });
        const enrollmentLink = `https://wrmusicpro.com.br/matricula/${schoolName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

        const systemPrompt = getAttendancePrompt({
          schoolName,
          personaName: profSettings.attendancePersonaName,
          tone: profSettings.attendanceTone,
          studentName: student?.name || pushName,
          isStudent: !!student,
          studentContext,
          knowledgeContext,
          enrollmentLink,
          pixKey: profSettings.pixKey,
          nowInfo,
        });

        const aiStartTs = Date.now();
        const toolCtx = {
          organizationId: profSettings.organizationId || 1,
          professorUserId,
          contactStudentId: student?.id ?? null,
          schoolHours: profSettings.schoolHours || "",
          lessonDuration: profSettings.lessonDuration || 60,
        };

        // ── RF-001/RF-002 (PRD): loop de ferramentas — a IA pode emitir ACTIONs
        // de consulta; o sistema executa com dados reais e devolve o resultado
        // para a IA redigir a resposta final. Máx. 2 rodadas (latência/custo).
        let aiRaw = await callGemini(historyObj, systemPrompt, false, aiKey, aiModel, 0.4, {
          organizationId: profSettings.organizationId || null,
          feature: "atendimento_completo",
          promptVersion: AI_PROMPT_VERSIONS.atendimentoCompleto,
        });
        const usedActions = new Set<string>();
        let escalated = false;
        let toolRounds = 0;
        while (aiRaw && aiRaw.trim() && toolRounds < 2) {
          const tools = parseToolActions(aiRaw);
          if (tools.some((t) => t.name === "ESCALATE_HUMAN")) escalated = true;
          const queries = tools.filter((t) => t.name !== "ESCALATE_HUMAN");
          if (queries.length === 0) break;
          toolRounds++;

          const results: string[] = [];
          for (const t of queries.slice(0, 3)) {
            usedActions.add(t.name);
            try {
              results.push(`[${t.name}]\n${await executeChatbotTool(db, toolCtx, t.name, t.args)}`);
            } catch (toolErr) {
              console.error(`[AI Atendimento] Falha na ferramenta ${t.name}:`, toolErr);
              results.push(`[${t.name}]\nA consulta falhou no sistema. NÃO invente dados.`);
            }
          }

          historyObj.push({ role: "assistant", content: aiRaw });
          historyObj.push({ role: "user", content: `[RESULTADO DAS CONSULTAS NO SISTEMA — dados reais]\n${results.join("\n\n")}\n\nResponda agora à pessoa de forma natural usando EXCLUSIVAMENTE estes dados reais.` });
          if (historyObj.length > 20) historyObj.splice(0, historyObj.length - 20);
          aiRaw = await callGemini(historyObj, systemPrompt, false, aiKey, aiModel, 0.4, {
            organizationId: profSettings.organizationId || null,
            feature: "atendimento_completo_rodada",
            promptVersion: AI_PROMPT_VERSIONS.atendimentoCompleto,
          });
        }

        if (aiRaw && aiRaw.trim()) {
          // ── Executar agendamentos solicitados via ACTION (com validação de slot) ──
          const SCHEDULE_ACTION_REGEX = /<!--ACTION:SCHEDULE_LESSON\s+(\{[\s\S]*?\})-->/g;
          const confirmedSlots: Date[] = [];
          let actionMatch;
          while ((actionMatch = SCHEDULE_ACTION_REGEX.exec(aiRaw)) !== null) {
            try {
              const lessonData = JSON.parse(actionMatch[1]);
              const scheduledDate = new Date(lessonData.scheduledAt);
              if (isNaN(scheduledDate.getTime()) || scheduledDate < new Date()) continue;

              const ocupadas = await db
                .select()
                .from(lessons)
                .where(and(eq(lessons.userId, professorUserId), gte(lessons.scheduledAt, new Date()), eq(lessons.status, "agendada")));

              if (!isSlotFree(scheduledDate, ocupadas, profSettings.lessonDuration || 60)) continue;

              await db.insert(lessons).values({
                organizationId: profSettings.organizationId || 1,
                userId: professorUserId,
                studentId: student?.id || null,
                title: lessonData.title || `Aula - ${student?.name || pushName}`,
                scheduledAt: scheduledDate,
                duration: lessonData.duration || profSettings.lessonDuration || 60,
                status: "agendada",
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              confirmedSlots.push(scheduledDate);
            } catch (actErr) {
              console.error("[AI Atendimento] ACTION:SCHEDULE_LESSON inválido:", actErr);
            }
          }

          // ── Resposta visível (sem blocos técnicos) ──
          let visible = stripToolMarkers(aiRaw);
          for (const d of confirmedSlots) {
            const dataStr = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            visible += `\n\n📅 Aula agendada: *${dataStr}* às *${horaStr}*. Até lá! 🎵`;
          }

          // ── RF-003/RF-005 (PRD): escala humana automática com resumo ──
          if (escalated) {
            await updateState("PAUSED_HUMAN");
            const summary = historyObj.slice(-8)
              .map((m) => `${m.role === "user" ? "👤" : "🤖"}: ${String(m.content || "").replace(/<!--[\s\S]*?-->/g, "").trim().slice(0, 160)}`)
              .join("\n")
              .slice(-1200);
            await notifyProfessor(
              `🙋 *Encaminhado pela recepcionista virtual*\n\nContato *${student?.name || pushName}* (${phone}) precisa de atendimento humano — a IA não conseguiu resolver.\n\n*Últimas mensagens:*\n${summary}`,
              "🙋 Atendimento encaminhado pela IA"
            );
            visible += "\n\nJá avisei o professor pra te atender por aqui em instantes! 👤";
          }

          // ── Humanização: simula tempo de digitação proporcional ──
          const typingMs = Math.min(4000, 600 + visible.length * 10);
          await new Promise((r) => setTimeout(r, typingMs));

          historyObj.push({ role: "assistant", content: visible });
          await updateState(escalated ? "PAUSED_HUMAN" : "AGUARDANDO_MENU", { aiHistory: historyObj });

          // RF-007 (PRD): log de auditoria best-effort do turno da IA
          try {
            await db.insert(chatbotLogs).values({
              organizationId: profSettings.organizationId || 1,
              userId: professorUserId,
              phone,
              userMessage: input.slice(0, 500),
              actionUsed: usedActions.size ? Array.from(usedActions).join(",").slice(0, 80) : null,
              escalated: escalated ? 1 : 0,
              durationMs: Date.now() - aiStartTs,
            });
          } catch (logErr) {
            console.error("[AI Atendimento] Falha ao gravar chatbot_logs:", logErr);
          }

          await sendReply(visible);
          return res.status(200).json({ ok: true });
        }
        // Resposta vazia da IA → cai no fluxo tradicional (menus/fallback)
      } catch (aiErr) {
        console.error("[AI Atendimento] Falha na IA, usando fluxo tradicional:", aiErr);
        // Fallback: continua para os menus numéricos (sistema nunca fica mudo)
      }
    }

    // ─────────────────────────────────────────────────────
    // ESTADO: START / MENU — exibir menu conforme perfil do usuário
    // ─────────────────────────────────────────────────────
    if (session.state === "START" || inputUpper === "MENU") {
      if (student) {
        await updateState("MENU_ALUNO");
        const flow = await getDynamicFlow(db, profSettings.organizationId || 1, "aluno");
        await sendReply(renderDynamicMenu(flow, schoolName, student.name));
      } else {
        await updateState("MENU_NOVO");
        const flow = await getDynamicFlow(db, profSettings.organizationId || 1, "lead");
        await sendReply(renderDynamicMenu(flow, schoolName));
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // PROCESSAMENTO AUTOMÁTICO DE COMPROVANTES DE PAGAMENTO (PIX/FOTO/PDF)
    // ─────────────────────────────────────────────────────
    const isReceiptContext =
      messageData.imageMessage ||
      messageData.documentMessage ||
      /comprovante|paguei|pix|transferencia|transferência|pagamento|deposito|depósito/i.test(textMsg);

    if (student && isReceiptContext && !payload.data.key?.fromMe) {
      const pendingDues = await db
        .select()
        .from(paymentDues)
        .where(
          and(
            eq(paymentDues.studentId, student.id),
            eq(paymentDues.status, "pendente")
          )
        );

      if (pendingDues.length > 0) {
        let targetDue = pendingDues[0];
        let extractedAmount: number | null = null;
        let isReceiptValid = false;

        const priceMatch = textMsg.match(/R\$\s?(\d+(?:[.,]\d{2})?)/i) || textMsg.match(/(\d+(?:[.,]\d{2})?)\s?(reais|brl)/i);
        if (priceMatch) {
          extractedAmount = parseFloat(priceMatch[1].replace(",", "."));
        }

        try {
          const receiptCreds = resolveAiCredentials(profSettings);
          const aiAnalysis = await callGemini(
            [{ role: "user", content: `Mensagem com comprovante: "${textMsg}". O aluno tem mensalidade pendente de R$ ${targetDue.amount}.` }],
            "Você é um analisador financeiro. Determine se a mensagem indica um comprovante de pagamento de mensalidade. Responda APENAS em JSON: {\"isReceipt\": true, \"amount\": 150.00}",
            true,
            receiptCreds.apiKey,
            receiptCreds.model,
            0.2,
            {
              organizationId: profSettings.organizationId || null,
              feature: "comprovante_analise",
              promptVersion: AI_PROMPT_VERSIONS.comprovanteAnalise,
              isJson: true,
            }
          );
          const cleanJsonStr = aiAnalysis.replace(/```json/gi, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleanJsonStr);
          if (parsed.isReceipt) {
            isReceiptValid = true;
            if (parsed.amount) extractedAmount = parsed.amount;
          }
        } catch (_) {
          if (messageData.imageMessage || messageData.documentMessage || /comprovante/i.test(textMsg)) {
            isReceiptValid = true;
          }
        }

        if (isReceiptValid) {
          if (extractedAmount) {
            const matched = pendingDues.find(d => Math.abs(parseFloat(String(d.amount)) - extractedAmount!) < 1.0);
            if (matched) targetDue = matched;
          }

          // AUDIT-P0 FIX: NUNCA marcar mensalidade como paga com base em mensagem
          // não autenticada (um POST forjado com "paguei" dava baixa financeira).
          // Fluxo correto: avisar a escola para CONFIRMAR manualmente no Financeiro.
          const formattedValue = parseFloat(String(targetDue.amount)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const formattedDueDate = new Date(targetDue.dueDate + "T12:00:00").toLocaleDateString("pt-BR");

          await notifyProfessor(
            `🧾 *Comprovante recebido — confirmação necessária!*\n\n👤 *Aluno:* ${student.name}\n💰 *Valor declarado:* ${formattedValue}\n📅 *Vencimento:* ${formattedDueDate}\n\nO aluno enviou um comprovante via WhatsApp. *Nada foi baixado automaticamente* — revise e confirme em Financeiro › Mensalidades.`,
            "🧾 Comprovante recebido — confirme no Financeiro"
          );

          await updateState("AGUARDANDO_MENU");
          await sendReply(
            `📋 *Comprovante recebido com sucesso!*\n\nNossa equipe vai *confirmar o pagamento* e sua mensalidade ficará regularizada em instantes. Se houver qualquer problema, entraremos em contato por aqui. 🎵\n\nDigite *MENU* se precisar de mais alguma coisa. 😊`
          );
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: IA ASSISTENTE DO PROFESSOR (Chat Próprio)
    // ─────────────────────────────────────────────────────
    if (isProfessorChat) {
      try {
        debugLog(`[Chatbot] IA Assistente acionada pelo Professor ${phone}`);
        // Indica que está "digitando..." ou manda um status de espera (opcional)
        
        // Monta o contexto da escola (planilhas virtuais, dados, etc.)
        const userDataContext = await buildUserContext(db, professorUserId, profSettings.organizationId || 1, true);
        const systemPrompt = getSystemPrompt(userDataContext) + 
          "\n\nIMPORTANTE: Você está respondendo ao Professor diretamente pelo WhatsApp. Responda de forma clara, amigável e concisa. Você pode usar blocos ACTION como ACTION:CREATE_LESSON e ACTION:CREATE_STUDENT para realizar agendamentos de aulas e cadastros de alunos diretamente pelo WhatsApp! Não use o bloco SPREADSHEET no WhatsApp.";

        const historyObj = sessionData.aiHistory || [];
        historyObj.push({ role: "user", content: input });
        
        // Limita o histórico para não estourar tokens
        if (historyObj.length > 10) historyObj.splice(0, historyObj.length - 10);

        // RF-002: resolução unificada (suporta gemini|groq|opencode)
        const professorChatCreds = resolveAiCredentials(profSettings);

        const aiResponseRaw = await callGemini(
          historyObj,
          systemPrompt,
          false,
          professorChatCreds.apiKey,
          professorChatCreds.model,
          0.4,
          {
            organizationId: profSettings.organizationId || null,
            userId: professorUserId,
            feature: "chat_professor",
            promptVersion: AI_PROMPT_VERSIONS.chatProfessor,
          }
        );

        let finalResponseContent = aiResponseRaw;

        // ── Executar ações de agendamento enviadas via WhatsApp ──
        const LESSON_ACTION_REGEX = /<!--ACTION:CREATE_LESSON\s+(\{[\s\S]*?\})-->/g;
        let lessonMatch;
        while ((lessonMatch = LESSON_ACTION_REGEX.exec(aiResponseRaw)) !== null) {
          const blockStr = lessonMatch[0];
          const jsonStr = lessonMatch[1];
          try {
            const lessonData = JSON.parse(jsonStr);
            let targetStudentId: number | null = null;
            if (lessonData.studentName) {
              const whereConds = [ilike(students.name, `%${lessonData.studentName}%`)];
              if (profSettings.organizationId) whereConds.push(eq(students.organizationId, profSettings.organizationId));
              const [foundStudent] = await db.select({ id: students.id })
                .from(students)
                .where(and(...whereConds))
                .limit(1);
              if (foundStudent) targetStudentId = foundStudent.id;
            }

            const scheduledDate = lessonData.scheduledAt ? new Date(lessonData.scheduledAt) : new Date();

            await db.insert(lessons).values({
              organizationId: profSettings.organizationId,
              userId: professorUserId,
              studentId: targetStudentId,
              title: lessonData.title || `Aula - ${lessonData.studentName || 'Aluno'}`,
              scheduledAt: scheduledDate,
              duration: lessonData.duration || 60,
              isExperimental: !!lessonData.isExperimental,
              experimentalName: lessonData.experimentalName || null,
              lessonType: lessonData.lessonType || (lessonData.isExperimental ? "experimental" : "individual"),
              status: "agendada",
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            const formattedScheduled = scheduledDate.toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo'
            });

            const confirmMsg = `\n\n✅ *Aula agendada com sucesso!*\n📌 *Título:* ${lessonData.title}\n📅 *Data/Hora:* ${formattedScheduled}\n⏱️ *Duração:* ${lessonData.duration || 60} min`;
            finalResponseContent = finalResponseContent.replace(blockStr, confirmMsg);
          } catch (parseErr) {
            console.error("[WhatsApp AI ACTION:CREATE_LESSON] Erro:", parseErr);
            finalResponseContent = finalResponseContent.replace(blockStr, "\n\n⚠️ Erro ao registrar o agendamento da aula.");
          }
        }

        // ── Executar ações de cadastro enviadas via WhatsApp ──
        const STUDENT_ACTION_REGEX = /<!--ACTION:CREATE_STUDENT\s+(\{[\s\S]*?\})-->/g;
        let studentMatch;
        while ((studentMatch = STUDENT_ACTION_REGEX.exec(aiResponseRaw)) !== null) {
          const blockStr = studentMatch[0];
          const jsonStr = studentMatch[1];
          try {
            const actionData = JSON.parse(jsonStr);
            await db.insert(students).values({
              organizationId: profSettings.organizationId,
              professorId: professorUserId,
              userId: professorUserId,
              name: actionData.name,
              phone: actionData.phone || "",
              email: actionData.email || null,
              birthDate: actionData.birthDate || null,
              guardianName: actionData.guardianName || null,
              guardianPhone: actionData.guardianPhone || null,
              guardianEmail: null,
              level: actionData.level || "iniciante",
              monthlyFee: String(actionData.monthlyFee ?? 0),
              dueDay: actionData.dueDay ?? 15,
              lessonType: "individual",
              status: "ativo",
              startDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
              notes: actionData.notes || null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            const confirmMsg = `\n\n✅ *Aluno cadastrado com sucesso:* ${actionData.name}`;
            finalResponseContent = finalResponseContent.replace(blockStr, confirmMsg);
          } catch (parseErr) {
            console.error("[WhatsApp AI ACTION:CREATE_STUDENT] Erro:", parseErr);
            finalResponseContent = finalResponseContent.replace(blockStr, "\n\n⚠️ Erro ao cadastrar o aluno.");
          }
        }

        historyObj.push({ role: "assistant", content: finalResponseContent });
        
        // Atualiza estado com histórico
        await updateState("PROFESSOR_AI", { aiHistory: historyObj });

        // Envia resposta (com prefixo do robô para evitar loop no webhook)
        await sendReply(`🤖 ${finalResponseContent}`);
        
      } catch (error: any) {
        console.error("[WhatsApp AI Error]:", error);
        await sendReply("🤖 *Erro na IA:* Não consegui processar sua solicitação no momento. Verifique sua chave de API do Groq/Gemini nas configurações do site.");
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // COMANDOS GLOBAIS: Falar com Professor (0) e Encerrar (99 / SAIR)
    // ─────────────────────────────────────────────────────
    if (session.state !== "PAUSED_HUMAN" && !isProfessorChat) {
      if (input === "0") {
        await updateState("PAUSED_HUMAN");
        await notifyProfessor(`👤 *Solicitação de Atendimento Humano!*\n\nContato *${student?.name || pushName}* (${phone}) solicitou falar com o professor pelo robô (opção 0).`);
        await sendReply("Claro! Chamei o professor para te atender. Aguarde um instante! 🎸👤\n\n_Quando quiser voltar ao robô automático no futuro, é só digitar *MENU*._");
        return res.status(200).json({ ok: true });
      }

      if (input === "99" || inputUpper === "SAIR" || inputUpper === "ENCERRAR" || inputUpper === "TCHAU") {
        await updateState("AGUARDANDO_MENU");
        await sendReply("Atendimento encerrado! 😊\n\nFoi um prazer falar com você. Se precisar de algo no futuro, é só mandar uma mensagem ou digitar *MENU*! 🎵👋");
        return res.status(200).json({ ok: true });
      }
    }

    // ─────────────────────────────────────────────────────
    // ESTADO: PAUSED_HUMAN — robô em silêncio
    // ─────────────────────────────────────────────────────
    if (session.state === "PAUSED_HUMAN") {
      // RN-003/RN-004 (PRD): durante o resfriamento de 24h após resposta manual
      // do professor, o robô fica em silêncio ABSOLUTO — nem "MENU" o reativa.
      const pauseAgeMs = session.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : 0;
      const stalePause = !humanTakeoverActive(sessionData) && pauseAgeMs > STALE_PAUSE_RESUME_MS;

      if (!stalePause) {
        if (inputUpper === "MENU" && !humanTakeoverActive(sessionData)) {
          await updateState("START");
          await sendReply("Estou de volta! 🤖✨\nPode falar comigo normalmente, estou aqui pra te ajudar!");
        }
        return res.status(200).json({ ok: true });
      }
      // Pausa antiga (>24h) sem tomada humana ativa expira automaticamente:
      // a sessão volta ao START e ESTA mensagem segue o fluxo normal do bot.
      await updateState("START", {});
    }

    // ─────────────────────────────────────────────────────
    // ESTADO: START — exibir menu conforme perfil do usuário
    // ─────────────────────────────────────────────────────
    if (session.state === "START") {
      if (student) {
        await updateState("MENU_ALUNO");
        await sendReply(
          `Oi, *${student.name.split(" ")[0]}*! Que alegria te ver por aqui! 🎵😊\n\nO que posso fazer por você hoje?\n\n1️⃣  📅  Minhas Aulas\n2️⃣  💰  Financeiro\n3️⃣  📆  Agendar uma Aula\n4️⃣  🔄  Reagendar Aula\n5️⃣  🎸  Falar com o Professor\n6️⃣  ⭐  Indicar um amigo\n\n_Digite o número da opção_ 👇`
        );
      } else {
        await updateState("MENU_NOVO");
        await sendReply(menuPrincipalNovoMsg(schoolName));
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // MENU: ALUNO CADASTRADO (DINÂMICO)
    // ─────────────────────────────────────────────────────
    if (session.state === "MENU_ALUNO") {
      if (!student) {
        await updateState("START");
        return res.status(200).json({ ok: true });
      }

      const flow = await getDynamicFlow(db, profSettings.organizationId || 1, "aluno");
      const matchedOpt = flow.options.find(
        (o) => o.isActive && (isOption(input, o.digit) || o.title.toLowerCase() === input.toLowerCase())
      );

      if (matchedOpt) {
        if (matchedOpt.actionType === "text_reply") {
          const reply = interpolateText(matchedOpt.customReply || "Opção selecionada! Digite *MENU* para voltar.", schoolName, student.name);
          await sendReply(reply);
          await updateState("AGUARDANDO_MENU");
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "human_transfer") {
          await updateState("PAUSED_HUMAN");
          await notifyProfessor(`👤 *Solicitação de Atendimento Humano!*\n\nO aluno *${student?.name || pushName}* (${phone}) solicitou falar com você no WhatsApp.`);
          await sendReply(interpolateText(flow.humanMessage, schoolName, student.name));
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "close_chat") {
          await updateState("AGUARDANDO_MENU");
          await sendReply(interpolateText(flow.exitMessage, schoolName, student.name));
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "system_action") {
          const act = matchedOpt.systemAction;

          if (act === "minhas_aulas") {
            const nextLessons = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.studentId, student.id),
                  gte(lessons.scheduledAt, new Date()),
                  eq(lessons.status, "agendada")
                )
              );

            if (nextLessons.length === 0) {
              await sendReply("Hmm, parece que você não tem nenhuma aula agendada por enquanto. 📅\n\nSe quiser marcar uma, é só digitar *MENU* e escolher a opção de agendamento! 😊");
            } else {
              let msg = `📅 *Suas próximas aulas:*\n━━━━━━━━━━━━━━━━━━\n`;
              nextLessons.slice(0, 5).forEach((l) => {
                const data = l.scheduledAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                const hora = l.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                msg += `🎵 *${data}* às *${hora}* — ${l.duration} min\n`;
              });
              msg += `━━━━━━━━━━━━━━━━━━\n\nTe esperamos! 😊 Digite *MENU* para voltar.`;
              await sendReply(msg);
            }
            await updateState("AGUARDANDO_MENU");
            return res.status(200).json({ ok: true });
          }

          if (act === "financeiro") {
            const pendingDues = await db
              .select()
              .from(paymentDues)
              .where(
                and(
                  eq(paymentDues.studentId, student.id),
                  eq(paymentDues.status, "pendente")
                )
              );

            if (pendingDues.length === 0) {
              await sendReply("✅ *Que ótima notícia!*\nVocê está em dia com seus pagamentos. Continue assim! 🌟\n\nDigite *MENU* para voltar.");
            } else {
              let msg = `💰 *Mensalidades em aberto:*\n━━━━━━━━━━━━━━━━━━\n`;
              pendingDues.slice(0, 5).forEach((p) => {
                const valor = parseFloat(String(p.amount)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const venc = new Date(p.dueDate + "T12:00:00").toLocaleDateString("pt-BR");
                msg += `🔸 *${valor}* — vence em ${venc}\n`;
                if (p.asaasPaymentLink) {
                  msg += `   💳 Pague aqui: ${p.asaasPaymentLink}\n`;
                } else if (p.mpPaymentLink) {
                  msg += `   💳 Pague aqui: ${p.mpPaymentLink}\n`;
                }
              });
              if (profSettings.pixKey) {
                msg += `\n🔑 *Chave PIX:* ${profSettings.pixKey}\n`;
              }
              msg += `━━━━━━━━━━━━━━━━━━\n\nApós realizar o pagamento, você pode enviar o *comprovante aqui mesmo* que damos baixa automática! 📸✨\n\nDigite *MENU* para voltar.`;
              await sendReply(msg);
            }
            await updateState("AGUARDANDO_MENU");
            return res.status(200).json({ ok: true });
          }

          if (act === "agendar_aula") {
            const slots = generateAvailableSlots(profSettings.schoolHours || "");
            const ocupadas = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.userId, professorUserId),
                  gte(lessons.scheduledAt, new Date()),
                  eq(lessons.status, "agendada")
                )
              );

            const freeSlots = slots
              .filter((s) => isSlotFree(s.date, ocupadas, profSettings.lessonDuration || 60))
              .slice(0, 5);

            if (freeSlots.length === 0) {
              await sendReply("Poxa, não encontrei horários livres para os próximos dias na agenda. 😕\n\nVou avisar o professor para ele verificar um horário especial para você! Digite *0* se quiser falar agora.");
              await updateState("AGUARDANDO_MENU");
              return res.status(200).json({ ok: true });
            }

            await updateState("AGENDAR_AULA_SLOT", { freeSlots });
            let msg = `📅 *Escolha o melhor dia e horário:*\n━━━━━━━━━━━━━━━━━━\n`;
            freeSlots.forEach((s, i) => {
              msg += `${i + 1}️⃣  ${s.label}\n`;
            });
            msg += `━━━━━━━━━━━━━━━━━━\n\nDigita o *número* da opção desejada ou *MENU* para cancelar.`;
            await sendReply(msg);
            return res.status(200).json({ ok: true });
          }

          if (act === "reagendar_aula") {
            const nextLessons = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.studentId, student.id),
                  gte(lessons.scheduledAt, new Date()),
                  eq(lessons.status, "agendada")
                )
              );

            if (nextLessons.length === 0) {
              await sendReply("Você não tem nenhuma aula futura agendada para reagendar. 📅 Digite *MENU* para marcar uma aula nova!");
              await updateState("AGUARDANDO_MENU");
            } else {
              let msg = `🔄 *Qual aula você deseja remarcar?*\n━━━━━━━━━━━━━━━━━━\n`;
              nextLessons.slice(0, 5).forEach((l, i) => {
                const data = l.scheduledAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                const hora = l.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                msg += `${i + 1}️⃣  *${data}* às *${hora}*\n`;
              });
              msg += `━━━━━━━━━━━━━━━━━━\n\nDigita o *número* da aula ou *MENU* para voltar.`;
              await updateState("REAGENDAR_SELECIONAR_AULA", { nextLessons });
              await sendReply(msg);
            }
            return res.status(200).json({ ok: true });
          }

          if (act === "indicar_amigo") {
            await updateState("INDICAR_NOME");
            await sendReply("Que demais! Sua indicação é muito especial pra gente! 🌟🎶\n\nMe diz o *nome completo* do seu amigo que quer indicar:");
            return res.status(200).json({ ok: true });
          }

          if (act === "matricula_link") {
            const reply = interpolateText(matchedOpt.customReply || "Acesse nosso link oficial de matrículas:\n👉 {link_matricula}", schoolName, student.name);
            await sendReply(reply);
            await updateState("AGUARDANDO_MENU");
            return res.status(200).json({ ok: true });
          }
        }
      }

      // Se não correspondeu a uma opção numérica e o texto for uma dúvida/pergunta -> Responde com a IA da Escola (RAG)
      if (input.trim().length >= 3) {
        const aiReply = await answerWithSchoolKnowledge(
          db,
          profSettings.organizationId || 1,
          schoolName,
          input,
          profSettings,
          student?.name
        );
        if (aiReply) {
          await sendReply(aiReply);
          await updateState("AGUARDANDO_MENU");
          return res.status(200).json({ ok: true });
        }
      }

      // Opção inválida
      await sendReply(interpolateText(flow.fallbackMessage, schoolName, student.name));
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // MENU: NOVO USUÁRIO / LEAD (DINÂMICO)
    // ─────────────────────────────────────────────────────
    if (session.state === "MENU_NOVO") {
      const flow = await getDynamicFlow(db, profSettings.organizationId || 1, "lead");
      const matchedOpt = flow.options.find(
        (o) => o.isActive && (isOption(input, o.digit) || o.title.toLowerCase() === input.toLowerCase())
      );

      if (matchedOpt) {
        if (matchedOpt.actionType === "text_reply") {
          const reply = interpolateText(matchedOpt.customReply || "Obrigado pelo contato! Digite *MENU* para voltar.", schoolName);
          await sendReply(reply);
          await updateState("AGUARDANDO_MENU");
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "human_transfer") {
          await updateState("PAUSED_HUMAN");
          await notifyProfessor(`👤 *Novo Contato Aguardando Atendimento!*\n\nContato (${phone}) solicitou falar com a equipe no WhatsApp.`);
          await sendReply(interpolateText(flow.humanMessage, schoolName));
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "close_chat") {
          await updateState("AGUARDANDO_MENU");
          await sendReply(interpolateText(flow.exitMessage, schoolName));
          return res.status(200).json({ ok: true });
        }

        if (matchedOpt.actionType === "system_action") {
          if (matchedOpt.systemAction === "matricula_link") {
            if (matchedOpt.customReply && matchedOpt.customReply.trim()) {
              await sendReply(interpolateText(matchedOpt.customReply, schoolName));
              await updateState("AGUARDANDO_MENU");
              return res.status(200).json({ ok: true });
            }
            // Inicia fluxo de coleta de dados para matrícula
            await updateState("MATRICULA_NOME");
            await sendReply("Que notícia incrível! Fico feliz que você quer aprender música com a gente! 🎉🎵\n\nPra começar, me conta: qual é o seu *nome completo*?");
            return res.status(200).json({ ok: true });
          }
        }
      }

      // Se for novo contato e mandar uma pergunta aberta -> Responde com a IA da Escola (RAG)
      if (input.trim().length >= 3) {
        const aiReply = await answerWithSchoolKnowledge(
          db,
          profSettings.organizationId || 1,
          schoolName,
          input,
          profSettings
        );
        if (aiReply) {
          await sendReply(aiReply);
          await updateState("AGUARDANDO_MENU");
          return res.status(200).json({ ok: true });
        }
      }

      await sendReply(interpolateText(flow.fallbackMessage, schoolName));
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: MATRÍCULA — Nome
    // ─────────────────────────────────────────────────────
    if (session.state === "MATRICULA_NOME") {
      const nome = input;
      if (nome.length < 3) {
        await sendReply("Pode me dizer seu nome completo? Preciso dele para fazer seu cadastro! 😊");
        return res.status(200).json({ ok: true });
      }

      const slots = generateAvailableSlots(profSettings.schoolHours || "");
      const ocupadas = await db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.userId, professorUserId),
            gte(lessons.scheduledAt, new Date()),
            eq(lessons.status, "agendada")
          )
        );

      const freeSlots = slots
        .filter((s) => isSlotFree(s.date, ocupadas, profSettings.lessonDuration || 60))
        .slice(0, 5);

      await updateState("MATRICULA_SLOT", { matriculaNome: nome, freeSlots });

      if (freeSlots.length === 0) {
        await sendReply(`Prazer, *${nome}*! 😊\n\nInfelizmente não temos horários disponíveis nos próximos dias.\nMas não se preocupe! Nossa equipe vai te ajudar a encontrar o horário ideal. Digite *0* pra falar com a gente!`);
        return res.status(200).json({ ok: true });
      }

      let msg = `Prazer, *${nome}*! 😄🎶\n\nQue ótimo que você quer fazer uma aula experimental! Confere os horários disponíveis:\n\n━━━━━━━━━━━━━━━━━━\n`;
      freeSlots.forEach((s, i) => {
        msg += `${i + 1}️⃣  ${s.label}\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━\n\nDigita o *número* do horário que ficou melhor pra você, ou *0* se preferir falar com a nossa equipe. 😊`;
      await sendReply(msg);
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: MATRÍCULA — Escolher horário
    // ─────────────────────────────────────────────────────
    if (session.state === "MATRICULA_SLOT") {
      if (isOption(input, "0")) {
        await updateState("PAUSED_HUMAN");
        await sendReply("Sem problema! Vou chamar alguém da nossa equipe pra te ajudar a encontrar o melhor horário. Aguarda! 👤😊\n\n_Para reativar o menu automático, é só digitar *MENU*._");
        return res.status(200).json({ ok: true });
      }

      const currentData: any = {};
      try { Object.assign(currentData, JSON.parse(session.data || "{}")); } catch (_) {}

      const idx = parseInt(input) - 1;
      if (!isNaN(idx) && currentData.freeSlots && currentData.freeSlots[idx]) {
        const slot = currentData.freeSlots[idx];
        const nome = currentData.matriculaNome || "Novo Aluno";

        // Buscar orgId do professor
        const orgResult = await db
          .select({ organizationId: settings.organizationId })
          .from(settings)
          .where(eq(settings.userId, professorUserId))
          .limit(1);
        const orgId = orgResult[0]?.organizationId;

        await db.insert(lessons).values({
          organizationId: orgId,
          userId: professorUserId,
          isExperimental: true,
          experimentalName: nome,
          experimentalPhone: phone,
          title: `Aula Experimental - ${nome}`,
          scheduledAt: new Date(slot.date),
          duration: 60,
          status: "agendada",
          lessonType: "individual",
        });

        await notifyProfessor(`🎉 *Novo Agendamento Experimental!*\n\n👤 *${nome}*\n📱 ${phone}\n📅 *${slot.label}*\n\nEle(a) agendou pelo robô e está esperando por você! 🎵`);

        await updateState("START", {});
        await sendReply(
          `Tudo certo, *${nome}*! 🎉🎶\n\nSua *aula experimental* está confirmada para *${slot.label}*.\n\nEstamos ansiosos pra te conhecer pessoalmente! Se tiver qualquer dúvida antes da aula, pode mandar mensagem aqui mesmo. 😊\n\nAté lá! 👋`
        );
        return res.status(200).json({ ok: true });
      }

      await sendReply("Hmm, não reconheci essa opção. 😅 Digita o *número* do horário ou *0* pra falar com a equipe.");
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: INDICAÇÃO — Nome do amigo
    // ─────────────────────────────────────────────────────
    if (session.state === "INDICAR_NOME") {
      const nomeAmigo = input;
      if (nomeAmigo.length < 3) {
        await sendReply("Pode me dizer o nome completo do seu amigo? 😊");
        return res.status(200).json({ ok: true });
      }

      await updateState("INDICAR_PHONE", { indicacaoNome: nomeAmigo });
      await sendReply(`Ótimo! E qual é o número de *WhatsApp* de *${nomeAmigo}*? 📱\n\n_Ex: 33999998888 (com DDD)_`);
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: AGENDAR AULA (Aluno)
    // ─────────────────────────────────────────────────────
    if (session.state === "AGENDAR_AULA_SLOT") {
      if (!student) {
        await updateState("START");
        return res.status(200).json({ ok: true });
      }

      if (inputUpper === "MENU") {
        await updateState("START");
        await sendReply("Voltando ao menu! 🎵 Pode escolher uma opção abaixo...");
        return res.status(200).json({ ok: true });
      }

      const currentData: any = {};
      try { Object.assign(currentData, JSON.parse(session.data || "{}")); } catch (_) {}

      const idx = parseInt(input) - 1;
      if (!isNaN(idx) && currentData.freeSlots && currentData.freeSlots[idx]) {
        const slot = currentData.freeSlots[idx];

        const orgResult = await db.select({ organizationId: settings.organizationId }).from(settings).where(eq(settings.userId, professorUserId)).limit(1);
        const orgId = orgResult[0]?.organizationId;

        await db.insert(lessons).values({
          organizationId: orgId,
          userId: professorUserId,
          studentId: student!.id,
          title: `Aula Avulsa - ${student!.name.split(" ")[0]}`,
          scheduledAt: new Date(slot.date),
          duration: 60,
          status: "agendada",
          lessonType: "individual",
        });

        await notifyProfessor(`📅 *Novo Agendamento!*\n\n👤 *${student!.name}* acabou de marcar uma aula para *${slot.label}*. Tudo certo no sistema! 🎵`);
        
        await updateState("START", {});
        await sendReply(`Aula marcada com sucesso! 🎉\n\n📅 *${slot.label}*\n\nTe esperamos! Se precisar de algo, é só chamar. 😊 Digite *MENU* para voltar ao início.`);
        return res.status(200).json({ ok: true });
      }

      await sendReply("Hmm, não reconheci essa opção. 😅 Digita o *número* do horário ou *MENU* para voltar.");
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // FLUXO: REAGENDAR AULA (Aluno)
    // ─────────────────────────────────────────────────────
    if (session.state === "REAGENDAR_SELECIONAR_AULA") {
      if (!student) {
        await updateState("START");
        return res.status(200).json({ ok: true });
      }

      if (inputUpper === "MENU") {
        await updateState("START");
        await sendReply("Voltando ao menu! 🎵 Pode escolher uma opção abaixo...");
        return res.status(200).json({ ok: true });
      }

      const currentData: any = {};
      try { Object.assign(currentData, JSON.parse(session.data || "{}")); } catch (_) {}

      const idx = parseInt(input) - 1;
      if (!isNaN(idx) && currentData.nextLessons && currentData.nextLessons[idx]) {
        const selectedLesson = currentData.nextLessons[idx];
        
        const slots = generateAvailableSlots(profSettings.schoolHours || "");
        const ocupadas = await db
          .select()
          .from(lessons)
          .where(
            and(
              eq(lessons.userId, professorUserId),
              gte(lessons.scheduledAt, new Date()),
              eq(lessons.status, "agendada")
            )
          );

        const freeSlots = slots
          .filter((s) => isSlotFree(s.date, ocupadas, profSettings.lessonDuration || 60))
          .slice(0, 5);

        await updateState("REAGENDAR_SLOT", { selectedLesson, freeSlots });

        let msg = `📆 *Para quando você quer reagendar?*\n━━━━━━━━━━━━━━━━━━\n`;
        freeSlots.forEach((s, i) => {
          msg += `${i + 1}️⃣  ${s.label}\n`;
        });
        msg += `━━━━━━━━━━━━━━━━━━\n\nDigita o *número* do novo horário ou *MENU* pra cancelar.`;
        await sendReply(msg);
        return res.status(200).json({ ok: true });
      }

      await sendReply("Não entendi a opção. 😅 Digita o número da aula que quer reagendar ou *MENU* para voltar.");
      return res.status(200).json({ ok: true });
    }

    if (session.state === "REAGENDAR_SLOT") {
      if (!student) {
        await updateState("START");
        return res.status(200).json({ ok: true });
      }

      if (inputUpper === "MENU") {
        await updateState("START");
        await sendReply("Voltando ao menu! 🎵 Pode escolher uma opção abaixo...");
        return res.status(200).json({ ok: true });
      }

      const currentData: any = {};
      try { Object.assign(currentData, JSON.parse(session.data || "{}")); } catch (_) {}

      const idx = parseInt(input) - 1;
      if (!isNaN(idx) && currentData.freeSlots && currentData.freeSlots[idx] && currentData.selectedLesson) {
        const slot = currentData.freeSlots[idx];
        const oldLesson = currentData.selectedLesson;

        await db.update(lessons)
          .set({
            scheduledAt: new Date(slot.date),
            updatedAt: new Date()
          })
          .where(eq(lessons.id, oldLesson.id));

        const oldData = new Date(oldLesson.scheduledAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const oldHora = new Date(oldLesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

        await notifyProfessor(`🔄 *Reagendamento!*\n\n👤 *${student!.name}* reagendou a aula de ${oldData} às ${oldHora} para *${slot.label}*. 📅`);
        
        await updateState("START", {});
        await sendReply(`Prontinho! Aula reagendada com sucesso! 🔄🎉\n\n📅 *Novo horário: ${slot.label}*\n\nQualquer dúvida é só chamar. Digite *MENU* para voltar ao início.`);
        return res.status(200).json({ ok: true });
      }

      await sendReply("Hmm, não reconheci essa opção. 😅 Digita o *número* do horário ou *MENU* para cancelar.");
      return res.status(200).json({ ok: true });
    }

    if (session.state === "INDICAR_PHONE") {
      const currentData: any = {};
      try { Object.assign(currentData, JSON.parse(session.data || "{}")); } catch (_) {}

      const nomeAmigo = currentData.indicacaoNome || "Amigo";
      const telAmigo = input.replace(/\D/g, "");
      const indicadorNome = student?.name || pushName;

      debugLog(`[Chatbot] Indicação registrada: ${nomeAmigo} (${telAmigo}) indicado por ${indicadorNome} (${phone})`);

      await notifyProfessor(`⭐ *Nova Indicação de Amigo Recebida!*\n\n👤 *Indicado por:* ${indicadorNome} (${phone})\n🌟 *Nome do amigo:* ${nomeAmigo}\n📱 *WhatsApp do amigo:* ${telAmigo || input}\n\nEntre em contato para oferecer uma aula experimental! 🎵`);

      await updateState("START", {});
      await sendReply(
        `Registrado! Muito obrigado pela indicação! 🌟🎵\n\nVamos entrar em contato com *${nomeAmigo}* em breve e contar que foi você quem nos indicou. Você é demais! 🙌\n\nDigite *MENU* para voltar ao início.`
      );
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // ESTADO: AGUARDANDO_MENU — espera o usuário digitar MENU
    // ─────────────────────────────────────────────────────
    if (session.state === "AGUARDANDO_MENU") {
      if (inputUpper === "MENU") {
        if (student) {
          await updateState("MENU_ALUNO");
          const primeiroNome = student.name.split(" ")[0];
          await sendReply(menuPrincipalMsg(schoolName, primeiroNome));
        } else {
          await updateState("MENU_NOVO");
          await sendReply(menuPrincipalNovoMsg(schoolName));
        }
      } else {
        await sendReply("Quando quiser, é só digitar *MENU* pra voltar ao início. 😊");
      }
      return res.status(200).json({ ok: true });
    }

    // ─────────────────────────────────────────────────────
    // Fallback — qualquer estado desconhecido volta ao START
    // ─────────────────────────────────────────────────────
    await updateState("START");
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("[WhatsApp Webhook] Erro:", error);
    return res.status(500).json({ error: "Internal Error" });
  }
});

export default router;
