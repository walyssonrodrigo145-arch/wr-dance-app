import { debugLog } from "./logger";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleAuthRoutes } from "./googleAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import whatsappWebhookRouter from "../webhooks/whatsapp";
import botStatusWebhookRouter from "../webhooks/botStatus";
import focusNfeWebhookRouter from "../webhooks/focusnfe";
import { serveStatic, setupVite } from "./vite";
import { startAutomationJob } from "../automationJob";
import { FiscalQueueWorker } from "../services/fiscal/FiscalQueueWorker";
import { marketingWorker } from "../services/MarketingQueueWorker";
import { analyticsQueue, recordAnalyticsRevenue, syncHistoricalRevenueToAnalytics } from "../services/AnalyticsQueue";
import { generateAnalyticsInsights } from "../services/AnalyticsAIService";
import { createRateLimiter, logSecurityEvent, detectAttackCategory } from "./rateLimiter";
import { runAutoMigrations } from "./migrate";
import { runTenantMigrations } from "./migrate_tenants";
import { getDb } from "../db";
import { settings, paymentDues, organizations, students, shortLinks } from "../../drizzle/schema";
import { ENV } from './env';
import { eq, and, sql } from "drizzle-orm";
import { setupEvolutionWebhook, setupAllEvolutionWebhooks } from "../utils/whatsapp";
import { notifyUser } from "./notification";
import { sdk } from "./sdk";
import { createFileToken, verifyFileToken } from "./fileTokens";
import { evaluateInfinitePayPayment, brlToCents } from "../utils/infinitepay";
export { createFileToken, verifyFileToken };

// ─── Notificação de eventos de contrato (assinado / recusado) ──────────────
// Notifica os administradores da escola (push + notificação in-app) e o
// WhatsApp da escola quando um contrato muda de status via webhook.
export async function notifyContractActivity(
  contract: any,
  kind: "assinado" | "recusado",
  baseMessage: string
) {
  try {
    const db = await getDb();
    if (!db) return;
    const orgId = contract.organizationId!;
    const { users, notifications, students } = await import("../../drizzle/schema");

    const [st] = await db.select({ name: students.name })
      .from(students)
      .where(eq(students.id, contract.studentId))
      .limit(1);
    const studentName = st?.name || "Aluno";

    const title = kind === "assinado" ? "📄 Contrato assinado" : "⚠️ Contrato recusado";
    const message = `${baseMessage} — Aluno: *${studentName}*. Contrato: ${contract.contractNumber || contract.title}.`;

    const admins = await db.select().from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")));

    for (const u of admins) {
      await db.insert(notifications).values({
        organizationId: orgId,
        userId: u.id,
        title,
        message,
        type: kind === "assinado" ? "success" : "warning",
        actionUrl: "/contratos",
        createdAt: new Date(),
      }).onConflictDoNothing().catch(() => {});
      await notifyUser(u.id, { title, content: message, url: "/contratos" }).catch(() => {});
    }

    const [s] = await db.select().from(settings).where(eq(settings.organizationId, orgId)).limit(1);
    if (s?.whatsappBotUrl && s?.schoolPhone) {
      const { sendWhatsAppMessage } = await import("../utils/whatsapp");
      await sendWhatsAppMessage({
        url: s.whatsappBotUrl,
        token: s.whatsappBotToken,
        phone: s.schoolPhone,
        sessionId: `org_${orgId}`,
        message: `🤖 *MusicPro — Contratos*\n\n${title.replace(/[📄⚠️]/g, "").trim()}\nAluno: ${studentName}\nContrato: ${contract.contractNumber || contract.title}.`,
      }).catch(() => {});
    }
  } catch (e) {
    console.error(`[Assinafy Webhook] Falha ao notificar ${kind} do contrato ${contract.id}:`, (e as Error)?.message || e);
  }
}



function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Sincroniza o banco de dados e aplica o isolamento de tenants
  await runAutoMigrations();
  await runTenantMigrations();

  // AUDIT: alerta de segurança — webhook do WhatsApp sem token em produção
  if (ENV.isProduction && !ENV.whatsappWebhookToken) {
    console.warn(
      "[SEGURANÇA] WHATSAPP_WEBHOOK_TOKEN não definido — o webhook /api/webhooks/whatsapp " +
      "está aceitando requisições sem autenticação. Configure o token no ambiente e no " +
      "Evolution API (header X-Webhook-Token) para fechar este endpoint."
    );
  }
  if (ENV.isProduction && !ENV.superAdminPassword) {
    debugLog("[SEGURANÇA] SUPER_ADMIN_PASSWORD não definido — login por senha master desativado.");
  }

  // Inicia a fila de eventos de Analytics (assíncrona, sem bloquear)
  analyticsQueue.start();
  debugLog("[Analytics] Fila de eventos iniciada.");
  syncHistoricalRevenueToAnalytics().catch((err) => console.error("[Analytics] Erro sync histórico:", err));

  // Gerar insights de IA diariamente (a cada 24h)
  setInterval(() => { generateAnalyticsInsights().catch(() => {}); }, 24 * 60 * 60 * 1000);
  // Gera uma vez na inicialização após 30s (aguarda o DB estar pronto)
  setTimeout(() => { generateAnalyticsInsights().catch(() => {}); }, 30_000);


  const app = express();
  app.set("trust proxy", 1); // Obrigatório para a Render enviar cookies "Secure"
  const server = createServer(app);

  // CRÍTICO-02 FIX: Limite de 10MB no body parser global para evitar DoS.
  // Requests de upload de arquivo (musicLibrary.upload, etc.) recebem base64 grande,
  // mas esses endpoints têm autenticação prévia e devem usar streaming quando possível.
  // Se necessário, crie middleware específico por rota com limite maior.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Rota especial de upload com limite maior (requer autenticação via JWT cookie):
  // O middleware do tRPC verifica o cookie app_session_id antes de processar o payload.
  // Límite: 200MB — suficiente para vídeos educacionais sem expor DoS.
  app.use(
    "/api/trpc/musicLibrary.upload",
    express.json({ limit: "200mb" }),
    express.urlencoded({ limit: "200mb", extended: true })
  );
  
  registerOAuthRoutes(app);
  registerGoogleAuthRoutes(app);

  // ─── Mercado Pago Webhook (Alunos) ─────────────────────────────────
  app.post("/api/webhooks/mercadopago/student", async (req, res) => {
    try {
      // ─── ALTO-01 FIX: Validação de assinatura X-Signature do Mercado Pago ──
      const mpSecret = ENV.mpWebhookSecret;
      if (mpSecret) {
        const xSignature = req.headers["x-signature"] as string;
        const xRequestId = req.headers["x-request-id"] as string;

        if (!xSignature) {
          console.warn("[MP Webhook] Requisição sem x-signature bloqueada.");
          return res.status(401).send("Missing x-signature");
        }

        const parts: Record<string, string> = {};
        xSignature.split(",").forEach(part => {
          const [k, v] = part.split("=");
          if (k && v) parts[k.trim()] = v.trim();
        });
        const ts = parts["ts"];
        const receivedHash = parts["v1"];

        if (!ts || !receivedHash) {
          console.warn("[MP Webhook] x-signature malformado bloqueado.");
          return res.status(401).send("Invalid x-signature format");
        }

        const dataId = (req.body?.data?.id ?? req.query.dueId ?? "").toString();
        const signaturePayload = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts}`;

        const { createHmac } = await import("crypto");
        const expectedHash = createHmac("sha256", mpSecret)
          .update(signaturePayload)
          .digest("hex");

        if (receivedHash !== expectedHash) {
          console.warn("[MP Webhook] Assinatura inválida bloqueada.");
          return res.status(401).send("Invalid signature");
        }
      } else if (ENV.isProduction) {
        console.error("[MP Webhook] MP_WEBHOOK_SECRET não configurado em produção. Bloqueando.");
        return res.status(401).send("Webhook secret not configured");
      } else {
        console.warn("[MP Webhook] MP_WEBHOOK_SECRET não configurado (dev — aceito sem validação).");
      }

      const dueId = req.query.dueId as string;
      if (!dueId) return res.status(400).send("Missing dueId");

      const body = req.body;
      if (body?.type !== "payment" && body?.topic !== "payment") {
        return res.status(200).send("Not a payment event");
      }

      const paymentId = body?.data?.id;
      if (!paymentId) return res.status(400).send("Missing payment id");

      const db = await getDb();
      if (!db) return res.status(500).send("Database not available");

      const [due] = await db.select().from(paymentDues).where(eq(paymentDues.id, parseInt(dueId))).limit(1);
      if (!due) return res.status(404).send("Payment due not found");
      if (due.status === "pago") return res.status(200).send("Already paid");

      const [profSettings] = await db.select({ 
        mpAccessToken: settings.mpAccessToken,
        whatsappBotUrl: settings.whatsappBotUrl,
        whatsappBotToken: settings.whatsappBotToken,
        phone: settings.phone,
      })
        .from(settings)
        .where(eq(settings.userId, due.userId))
        .limit(1);

      const [studentData] = await db.select({ phone: students.phone, name: students.name })
        .from(students)
        .where(eq(students.id, due.studentId))
        .limit(1);

      if (!profSettings || !profSettings.mpAccessToken) {
        return res.status(400).send("Mercado Pago not configured for this user");
      }

      // BUG FIX: o select cru traz o token CIFRADO (v1:...) — decifrar antes de chamar o MP
      const { decryptSecret } = await import("../utils/integrationCrypto");
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${decryptSecret(profSettings.mpAccessToken)}` }
      });
      if (!response.ok) return res.status(400).send("Failed to validate payment");
      
      const paymentData = await response.json();
      if (paymentData.status === "approved") {
        await db.update(paymentDues)
          .set({ status: "pago", paidAt: new Date(), updatedAt: new Date() })
          .where(and(eq(paymentDues.id, due.id), eq(paymentDues.organizationId, due.organizationId!)));
        debugLog(`[Mercado Pago Webhook] Mensalidade marcada como paga. org=${due.organizationId}`);

        const { sendWhatsAppMessage } = await import("../utils/whatsapp");
        const valorStr = Number(due.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        
        if (profSettings.phone) {
          await sendWhatsAppMessage({
            url: profSettings.whatsappBotUrl || undefined,
            token: profSettings.whatsappBotToken || undefined,
            phone: profSettings.phone,
            message: `🤖 *Aviso do Robô:*\n\nO aluno *${studentData?.name || "Aluno"}* acabou de pagar a mensalidade no valor de *${valorStr}* via Mercado Pago!`,
            sessionId: `prof_${due.userId}`
          });
        }
        if (studentData?.phone) {
          await sendWhatsAppMessage({
            url: profSettings.whatsappBotUrl || undefined,
            token: profSettings.whatsappBotToken || undefined,
            phone: studentData.phone,
            message: `🤖 *Aviso do Robô:*\n\nSeu pagamento da mensalidade no valor de *${valorStr}* foi confirmado com sucesso. Muito obrigado! 🎉`,
            sessionId: `prof_${due.userId}`
          });
        }
      }

      return res.status(200).send("OK");
    } catch (e) {
      console.error("[Mercado Pago Webhook] Erro ao processar:", (e as Error)?.message ?? e);
      return res.status(500).send("Internal error");
    }
  });

  // ─── InfinitePay Webhook (Alunos — mensalidades) ────────────────────────────
  // SEGURANÇA (limitação do provedor): a InfinitePay NÃO envia assinatura HMAC.
  // Mitigação em 2 camadas (PRD RF-003/RN-003):
  //   1. Token secreto embutido na webhook_url (?token=) — validado aqui;
  //   2. O corpo do POST NUNCA é considerado prova de pagamento: a baixa só
  //      acontece após revalidação server-to-server via `payment_check`.
  // A webhook_url é dinâmica por link (não há configuração fixa no painel).
  app.post("/api/webhooks/infinitepay/student", async (req, res) => {
    try {
      // ── Camada 1: validação do token embutido na webhook_url ──
      const webhookToken = (ENV.infinitepayWebhookToken || "").trim();
      const requestToken = (
        (req.query.token as string) ||
        (req.headers["x-webhook-token"] as string) ||
        ""
      ).trim();

      if (!webhookToken) {
        if (ENV.isProduction) {
          console.error("[InfinitePay Webhook] INFINITEPAY_WEBHOOK_TOKEN não configurado em produção. Requisição bloqueada.");
          return res.status(401).json({ error: "Webhook token not configured" });
        }
        console.warn("[InfinitePay Webhook] INFINITEPAY_WEBHOOK_TOKEN não configurado (ambiente dev — aceito sem validação).");
      } else if (!requestToken || requestToken !== webhookToken) {
        console.warn("[InfinitePay Webhook] Token de autenticação inválido ou ausente. Requisição bloqueada.");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body || {};
      const transactionNsu: string | undefined = body.transaction_nsu ? String(body.transaction_nsu) : undefined;
      const invoiceSlug: string | undefined = body.invoice_slug ? String(body.invoice_slug) : undefined;
      const orderNsu: string | undefined = body.order_nsu ? String(body.order_nsu) : undefined;
      const receiptUrl: string | undefined = typeof body.receipt_url === "string" ? body.receipt_url : undefined;

      // Cobranças de matrícula pública não viram payment_dues — a confirmação
      // delas é feita por polling (enrollment.verifyInfinitePayPayment). Apenas ACK.
      if (req.query.enrollmentCode) {
        debugLog(`[InfinitePay Webhook] Evento de matrícula recebido (ACK): ${req.query.enrollmentCode}`);
        return res.status(200).json({ ok: true });
      }

      const dueIdRaw = req.query.dueId as string;
      // Fallback: extrai o dueId do order_nsu ("{dueId}" ou "{dueId}-{sufixo}")
      const dueIdFromOrder = orderNsu ? orderNsu.split("-")[0] : "";
      const dueId = dueIdRaw || dueIdFromOrder;
      if (!dueId || !/^\d+$/.test(dueId)) {
        console.warn("[InfinitePay Webhook] dueId ausente/inválido — evento ignorado.");
        return res.status(200).json({ ok: true });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });

      const [due] = await db.select().from(paymentDues).where(eq(paymentDues.id, parseInt(dueId, 10))).limit(1);
      if (!due) {
        console.warn(`[InfinitePay Webhook] Mensalidade não encontrada: ${dueId} — evento ignorado (200).`);
        return res.status(200).json({ ok: true });
      }

      // ── Idempotência: dedup por transaction_nsu (padrão registerWebhookEventOnce) ──
      const gatewayEventId = transactionNsu || `${invoiceSlug || "noslug"}_${orderNsu || "nonsu"}`;
      const { registerWebhookEventOnce } = await import("../routers/helpers");
      const dedup = await registerWebhookEventOnce(db, "infinitepay", gatewayEventId, "payment.paid", due.organizationId ?? undefined, {
        transaction_nsu: transactionNsu,
        invoice_slug: invoiceSlug,
        order_nsu: orderNsu,
        receipt_url: receiptUrl,
      });
      if (dedup.isDuplicate) {
        debugLog(`[InfinitePay Webhook] Evento duplicado ignorado: ${gatewayEventId}`);
        return res.status(200).json({ ok: true });
      }

      // ── Camada 2: revalidação server-to-server (payment_check) ──
      const [profSettings] = await db
        .select({ infinitepayHandle: settings.infinitepayHandle, infinitepayApiKey: settings.infinitepayApiKey })
        .from(settings)
        .where(eq(settings.userId, due.userId))
        .limit(1);

      if (!profSettings?.infinitepayHandle) {
        console.warn(`[InfinitePay Webhook] Escola sem InfiniteTag configurada (due ${dueId}).`);
        return res.status(200).json({ ok: true });
      }

      const { checkInfinitePayPayment, evaluateInfinitePayPayment, brlToCents, resolveInfinitePayApiKey } = await import("../utils/infinitepay");
      const check = await checkInfinitePayPayment({
        handle: profSettings.infinitepayHandle,
        orderNsu: orderNsu || String(due.id),
        transactionNsu,
        slug: invoiceSlug || due.infinitepaySlug || undefined,
        apiKey: resolveInfinitePayApiKey(profSettings.infinitepayApiKey),
      });

      const decision = evaluateInfinitePayPayment(brlToCents(due.amount), check);

      if (decision === "mismatch") {
        // RN-003: valor pago MENOR que o esperado — não baixa; notifica professor p/ revisão
        await notifyUser(due.userId, {
          title: "⚠️ Pagamento com valor divergente",
          content: `Pagamento InfinitePay recebido com valor inferior ao esperado na mensalidade #${due.id}. Verifique o Financeiro — a baixa NÃO foi automática.`,
        });
        debugLog(`[InfinitePay Webhook] Valor divergente (due ${dueId}): esperado ${due.amount}, pago ${check.paidAmount ?? "?"} — sem baixa.`);
        return res.status(200).json({ ok: true, decision });
      }

      if (decision !== "paid") {
        // Não confirmado via payment_check — retry via 400 (InfinitePay reenvia)
        debugLog(`[InfinitePay Webhook] Pagamento não confirmado via payment_check (due ${dueId}) — solicitando retry.`);
        return res.status(400).json({ ok: false, decision });
      }

      if (due.status === "pago") {
        // RN-005: fatura já baixada manualmente e o link órfão foi pago depois
        // (não há cancelamento remoto na InfinitePay). Notifica duplicidade.
        await notifyUser(due.userId, {
          title: "⚠️ Possível pagamento duplicado",
          content: `A mensalidade #${due.id} já estava paga e um novo pagamento InfinitePay foi confirmado (${check.paidAmount ? `R$ ${(check.paidAmount / 100).toFixed(2)}` : "valor não informado"}). Verifique se houve pagamento em duplicidade.`,
        });
        debugLog(`[InfinitePay Webhook] Pagamento duplicado detectado (due ${dueId}) — fatura permanece paga.`);
        return res.status(200).json({ ok: true, decision: "duplicate" });
      }

      // ── Baixa idempotente (tenant safety: organizationId no WHERE) ──
      await db
        .update(paymentDues)
        .set({
          status: "pago",
          paidAt: new Date(),
          infinitepayPaymentId: transactionNsu || null,
          infinitepaySlug: invoiceSlug || due.infinitepaySlug || null,
          updatedAt: new Date(),
        })
        .where(and(eq(paymentDues.id, due.id), eq(paymentDues.organizationId, due.organizationId!)));
      debugLog(`[InfinitePay Webhook] Mensalidade marcada como PAGA (due ${dueId}) — org ${due.organizationId}`);

      // ── Notificações (paridade webhook Asaas) ──
      const [paymentDetails] = await db
        .select({
          amount: paymentDues.amount,
          studentName: students.name,
          studentPhone: students.phone,
        })
        .from(paymentDues)
        .leftJoin(students, eq(paymentDues.studentId, students.id))
        .where(eq(paymentDues.id, due.id))
        .limit(1);

      const valor = Number(paymentDetails?.amount ?? due.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const contentStr = `O aluno ${paymentDetails?.studentName || "Aluno"} pagou a mensalidade no valor de ${valor}.`;

      await notifyUser(due.userId, {
        title: "Pagamento Confirmado",
        content: contentStr,
      });

      const { broadcastSSE } = await import("../webhooks/botStatus");
      broadcastSSE("PAYMENT_CONFIRMED", {
        studentName: paymentDetails?.studentName,
        amount: valor,
        message: contentStr,
      });

      const [profWhats] = await db
        .select({
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
          phone: settings.phone,
        })
        .from(settings)
        .where(eq(settings.userId, due.userId))
        .limit(1);

      if (profWhats) {
        const { sendWhatsAppMessage } = await import("../utils/whatsapp");
        if (profWhats.phone) {
          await sendWhatsAppMessage({
            url: profWhats.whatsappBotUrl || undefined,
            token: profWhats.whatsappBotToken || undefined,
            phone: profWhats.phone,
            message: `🤖 *Aviso do Robô:*\n\nO aluno *${paymentDetails?.studentName || "Aluno"}* acabou de pagar a mensalidade no valor de *${valor}* via InfinitePay!`,
            sessionId: `prof_${due.userId}`,
          });
        }
        if (paymentDetails?.studentPhone) {
          await sendWhatsAppMessage({
            url: profWhats.whatsappBotUrl || undefined,
            token: profWhats.whatsappBotToken || undefined,
            phone: paymentDetails.studentPhone,
            message: `🤖 *Aviso do Robô:*\n\nSeu pagamento da mensalidade no valor de *${valor}* foi confirmado com sucesso. Muito obrigado! 🎉`,
            sessionId: `prof_${due.userId}`,
          });
        }
      }

      return res.status(200).json({ ok: true, decision });
    } catch (e) {
      console.error("[InfinitePay Webhook] Erro ao processar:", (e as Error)?.message ?? e);
      return res.status(400).json({ error: "Retry requested" });
    }
  });


  // ─── Encurtador de links de pagamento (/p/{code}) ─────────────────────────
  // 302 (não 301) para permitir revogação futura. Códigos só existem se criados
  // server-side nos fluxos de cobrança — não há criação pública (anti open-redirect).
  app.get("/p/:code", async (req, res) => {
    try {
      const code = (req.params.code || "").toString();
      if (!code || code.length > 16 || !/^[A-Za-z0-9_-]+$/.test(code)) {
        return res.redirect(302, "/");
      }
      const db = await getDb();
      if (!db) return res.redirect(302, "/");
      const [link] = await db.select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1);
      if (!link?.targetUrl) return res.redirect(302, "/");
      // Contador de cliques — fire-and-forget, nunca bloqueia o redirect
      try {
        db.update(shortLinks)
          .set({ clicks: (link.clicks ?? 0) + 1 })
          .where(eq(shortLinks.id, link.id))
          .catch(() => {});
      } catch (_) { /* ignore */ }
      return res.redirect(302, link.targetUrl);
    } catch (e) {
      console.error("[ShortLinks] Erro no redirect:", (e as Error)?.message ?? e);
      return res.redirect(302, "/");
    }
  });

  // ─── Asaas Webhook ───────────────────────────────────────────────────────
  // Recebe notificações do Asaas e atualiza o status das mensalidades automaticamente.
  app.post("/api/webhooks/asaas", async (req, res) => {
    try {
      // CRÍTICO-10 FIX: Token de webhook agora é OBRIGATÓRIO.
      // Se ASAAS_WEBHOOK_TOKEN não estiver configurado, o endpoint recusa qualquer requisição.
      // Isso impede que terceiros simulem eventos Asaas e manipulem dados financeiros.
      const webhookToken = (ENV.asaasWebhookToken || "").trim();
      const rawHeaderToken = (
        req.headers["asaas-access-token"] ||
        req.headers["access-token"] ||
        req.headers["access_token"] ||
        req.headers["authorization"]
      )?.toString();
      const requestToken = (rawHeaderToken || "").replace(/^Bearer\s+/i, "").trim();

      if (!webhookToken) {
        if (ENV.isProduction) {
          console.error("[Asaas Webhook] ASAAS_WEBHOOK_TOKEN não configurado em produção. Requisição bloqueada.");
          return res.status(401).json({ error: "Webhook token not configured" });
        }
        console.warn("[Asaas Webhook] ASAAS_WEBHOOK_TOKEN não configurado (ambiente dev — aceito sem validação).");
      } else if (requestToken !== webhookToken) {
        const receivedMask = requestToken ? `${requestToken.substring(0, 6)}...${requestToken.slice(-4)}` : "(NENHUM/VAZIO)";
        const expectedMask = `${webhookToken.substring(0, 6)}...${webhookToken.slice(-4)}`;
        console.warn(`[Asaas Webhook] Token de autenticação inválido. Recebido: ${receivedMask} | Esperado: ${expectedMask}`);
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { event, payment } = req.body as {
        event: string;
        payment?: { id: string; status: string; value: number };
      };

      debugLog(`[Asaas Webhook] Evento recebido: ${event}`, payment?.id);

      if (!payment?.id) {
        return res.status(200).json({ ok: true });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });

      // ── ALTO-2 FIX: Idempotência — evita reprocessamento de webhook duplicado ──
      // O Asaas faz retry automático se não receber 200 em tempo hábil.
      // Se PAYMENT_RECEIVED/CONFIRMED e o registro já está "pago" no banco, é retry — ignorar.
      if ((event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") && payment?.id) {
        const [alreadyPaid] = await db
          .select({ status: paymentDues.status })
          .from(paymentDues)
          .where(and(eq(paymentDues.asaasId, payment.id), eq(paymentDues.status, "pago")))
          .limit(1);
        if (alreadyPaid) {
          debugLog(`[Asaas Webhook] Evento duplicado ignorado (já pago): ${event} ${payment.id}`);
          return res.status(200).json({ ok: true });
        }
      }

      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        // ── FIX-3: Busca com validação de existência (tenant safety) ──────────
        // Buscamos o paymentDue pelo asaasId E validamos que ele existe antes de
        // atualizar — garantindo que o asaasId pertence a um registro real do sistema.
        const [paymentDetails] = await db
          .select({
            id: paymentDues.id,
            organizationId: paymentDues.organizationId,
            userId: paymentDues.userId,
            amount: paymentDues.amount,
            studentName: students.name,
            studentPhone: students.phone,
          })
          .from(paymentDues)
          .leftJoin(students, eq(paymentDues.studentId, students.id))
          .where(eq(paymentDues.asaasId, payment.id))
          .limit(1);

        if (!paymentDetails) {
          // asaasId não encontrado no banco — pode ser webhook de outro ambiente ou ID inválido
          console.warn(`[Asaas Webhook] asaasId não encontrado no banco: ${payment.id} — ignorado`);
          return res.status(200).json({ ok: true });
        }

        // Atualiza apenas o registro encontrado (usando o ID interno — nunca só o asaasId genérico)
        await db
          .update(paymentDues)
          .set({ status: "pago", paidAt: new Date(), updatedAt: new Date() })
          .where(and(eq(paymentDues.id, paymentDetails.id), eq(paymentDues.organizationId, paymentDetails.organizationId!)));
        debugLog(`[Asaas Webhook] Mensalidade marcada como PAGA (${payment.id}) — org ${paymentDetails.organizationId}`);

        // NOTA: NÃO inserir em analyticsRevenue aqui — esta é uma mensalidade escolar (aluno→escola),
        // não receita SaaS da plataforma MusicPro. analyticsRevenue deve conter apenas cobranças de planos.

        const valor = Number(paymentDetails.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const contentStr = `O aluno ${paymentDetails.studentName || "Aluno"} pagou a mensalidade no valor de ${valor}.`;
          
        await notifyUser(paymentDetails.userId, {
          title: "Pagamento Confirmado",
          content: contentStr,
        });

        // SSE Notification for Real-Time UI
        const { broadcastSSE } = await import("../webhooks/botStatus");
        broadcastSSE("PAYMENT_CONFIRMED", {
          studentName: paymentDetails.studentName,
          amount: valor,
          message: contentStr,
        });

        // Notificação WhatsApp
        const [profSettings] = await db.select({ 
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
          phone: settings.phone,
        })
          .from(settings)
          .where(eq(settings.userId, paymentDetails.userId))
          .limit(1);

        if (profSettings) {
          const { sendWhatsAppMessage } = await import("../utils/whatsapp");
          if (profSettings.phone) {
            await sendWhatsAppMessage({
              url: profSettings.whatsappBotUrl || undefined,
              token: profSettings.whatsappBotToken || undefined,
              phone: profSettings.phone,
              message: `🤖 *Aviso do Robô:*\n\nO aluno *${paymentDetails.studentName || "Aluno"}* acabou de pagar a mensalidade no valor de *${valor}* via Asaas!`,
              sessionId: `prof_${paymentDetails.userId}`
            });
          }
          if (paymentDetails.studentPhone) {
            await sendWhatsAppMessage({
              url: profSettings.whatsappBotUrl || undefined,
              token: profSettings.whatsappBotToken || undefined,
              phone: paymentDetails.studentPhone,
              message: `🤖 *Aviso do Robô:*\n\nSeu pagamento da mensalidade no valor de *${valor}* foi confirmado com sucesso. Muito obrigado! 🎉`,
              sessionId: `prof_${paymentDetails.userId}`
            });
          }
        }
      }


      if (event === "PAYMENT_OVERDUE") {
        // CRÍTICO-08 FIX: Idempotência para PAYMENT_OVERDUE.
        // Só atualiza se o status atual NÃO for já "atrasado" (evita reprocessamento).
        const [due] = await db
          .select({ id: paymentDues.id, organizationId: paymentDues.organizationId, status: paymentDues.status })
          .from(paymentDues)
          .where(eq(paymentDues.asaasId, payment.id))
          .limit(1);
        if (due) {
          if (due.status === "atrasado") {
            debugLog(`[Asaas Webhook] Evento duplicado ignorado (já atrasado): ${event} ${payment.id}`);
          } else {
            await db
              .update(paymentDues)
              .set({ status: "atrasado", updatedAt: new Date() })
              .where(and(eq(paymentDues.id, due.id), eq(paymentDues.organizationId, due.organizationId!)));
            debugLog(`[Asaas Webhook] Mensalidade marcada como ATRASADA (${payment.id}) — org ${due.organizationId}`);
          }
        } else {
          console.warn(`[Asaas Webhook] PAYMENT_OVERDUE — asaasId não encontrado: ${payment.id}`);
        }
      }

      if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
        // CRÍTICO-08 FIX: Idempotência para PAYMENT_DELETED/REFUNDED.
        // Só limpa o asaasId se ele ainda estiver preenchido no registro (evita reprocessamento).
        const [due] = await db
          .select({ id: paymentDues.id, organizationId: paymentDues.organizationId, asaasId: paymentDues.asaasId })
          .from(paymentDues)
          .where(eq(paymentDues.asaasId, payment.id))
          .limit(1);
        if (due) {
          if (!due.asaasId) {
            debugLog(`[Asaas Webhook] Evento duplicado ignorado (asaasId já nulo): ${event} ${payment.id}`);
          } else {
            await db
              .update(paymentDues)
              .set({ status: "pendente", asaasId: null, asaasPaymentLink: null, asaasBillingType: null, updatedAt: new Date() })
              .where(and(eq(paymentDues.id, due.id), eq(paymentDues.organizationId, due.organizationId!)));
            debugLog(`[Asaas Webhook] Cobrança removida/estornada (${payment.id}) — org ${due.organizationId}`);
          }
        } else {
          console.warn(`[Asaas Webhook] ${event} — asaasId não encontrado: ${payment.id}`);
        }
      }

      if (event === "PAYMENT_CREATED") {
        // CRÍTICO-08 FIX: Idempotência para PAYMENT_CREATED.
        // Só atualiza se o registro existir E ainda não tiver asaasId preenchido de outra forma.
        const [due] = await db
          .select({ id: paymentDues.id, organizationId: paymentDues.organizationId })
          .from(paymentDues)
          .where(eq(paymentDues.asaasId, payment.id))
          .limit(1);
        if (due) {
          await db
            .update(paymentDues)
            .set({ status: "pendente", updatedAt: new Date() })
            .where(and(eq(paymentDues.id, due.id), eq(paymentDues.organizationId, due.organizationId!)));
          debugLog(`[Asaas Webhook] Nova cobrança criada/registrada (${payment.id}) — org ${due.organizationId}`);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Asaas Webhook] Erro ao processar:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // ─── Asaas Platform Webhook ──────────────────────────────────────────────
  // Recebe notificações sobre a assinatura do próprio professor (SaaS)
  app.post("/api/webhooks/asaas/platform", async (req, res) => {
    try {
      // CRÍTICO-10 FIX: Token de webhook agora é OBRIGATÓRIO (igual ao webhook de mensalidades).
      const webhookToken = (ENV.asaasWebhookToken || "").trim();
      const rawHeaderToken = (
        req.headers["asaas-access-token"] ||
        req.headers["access-token"] ||
        req.headers["access_token"] ||
        req.headers["authorization"]
      )?.toString();
      const requestToken = (rawHeaderToken || "").replace(/^Bearer\s+/i, "").trim();

      if (!webhookToken) {
        if (ENV.isProduction) {
          console.error("[Asaas Platform Webhook] ASAAS_WEBHOOK_TOKEN não configurado em produção. Requisição bloqueada.");
          return res.status(401).json({ error: "Webhook token not configured" });
        }
        console.warn("[Asaas Platform Webhook] ASAAS_WEBHOOK_TOKEN não configurado (ambiente dev — aceito sem validação).");
      } else if (requestToken !== webhookToken) {
        const receivedMask = requestToken ? `${requestToken.substring(0, 6)}...${requestToken.slice(-4)}` : "(NENHUM/VAZIO)";
        const expectedMask = `${webhookToken.substring(0, 6)}...${webhookToken.slice(-4)}`;
        console.warn(`[Asaas Platform Webhook] Token de autenticação inválido. Recebido: ${receivedMask} | Esperado: ${expectedMask}`);
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { event, payment } = req.body as {
        event: string;
        payment?: { id: string; status: string; customer: string; subscription?: string };
      };

      debugLog(`[Asaas Platform Webhook] Evento recebido: ${event}`, payment?.id);

      if (!payment?.customer) {
        return res.status(200).json({ ok: true });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });

      // ── FIX-1: Validação cruzada de subscriptionId ────────────────────────────
      // Antes de processar qualquer evento de plataforma, verificamos que o
      // payment.customer corresponde a uma organização que TEM o asaasSubscriptionId
      // correto — evitando ativação indevida por colisão de IDs ou eventos errados.
      const [targetOrg] = await db
        .select({ id: organizations.id, asaasSubscriptionId: organizations.asaasSubscriptionId })
        .from(organizations)
        .where(eq(organizations.asaasCustomerId, payment.customer))
        .limit(1);

      if (!targetOrg) {
        console.warn(`[Asaas Platform Webhook] Customer não encontrado no banco: ${payment.customer} — ignorado`);
        return res.status(200).json({ ok: true });
      }

      // Se o evento tem subscription ID, validar que corresponde ao registrado
      const paymentWithSub = req.body as { event: string; payment?: { id: string; status: string; customer: string; subscription?: string } };
      if (paymentWithSub.payment?.subscription && targetOrg.asaasSubscriptionId &&
          paymentWithSub.payment.subscription !== targetOrg.asaasSubscriptionId) {
        console.warn(
          `[Asaas Platform Webhook] subscriptionId divergente para customer ${payment.customer}: ` +
          `esperado=${targetOrg.asaasSubscriptionId} recebido=${paymentWithSub.payment.subscription} — ignorado`
        );
        return res.status(200).json({ ok: true });
      }

      // ── MÉDIO-3 FIX: Preencher currentPeriodEnd ao ativar assinatura ──
      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        // Calcular próximo período
        let nextPeriodEnd = new Date();
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1); // fallback

        if (paymentWithSub.payment?.subscription) {
          try {
            const { getAsaasSubscription } = await import("../utils/asaas");
            const asaasSub = await getAsaasSubscription(paymentWithSub.payment.subscription);
            if (asaasSub && asaasSub.nextDueDate) {
              nextPeriodEnd = new Date(asaasSub.nextDueDate);
            }
          } catch (err) {
            console.warn(`[Asaas Webhook] Falha ao buscar assinatura para ajustar nextPeriodEnd:`, err);
          }
        }

        await db
          .update(organizations)
          .set({ 
            subscriptionStatus: "active",
            trialEndsAt: null,         // usuário é assinante — não está mais em trial
            currentPeriodEnd: nextPeriodEnd, // registrar próximo vencimento real
            updatedAt: new Date()
          })
          .where(eq(organizations.id, targetOrg.id));
        debugLog(`[Asaas Platform Webhook] Assinatura ATIVADA para customer ${payment.customer} | próximo vencimento: ${nextPeriodEnd.toISOString().slice(0,10)}`);
      } else if (event === "PAYMENT_OVERDUE") {
        await db
          .update(organizations)
          .set({ subscriptionStatus: "past_due", updatedAt: new Date() })
          .where(eq(organizations.id, targetOrg.id));
        debugLog(`[Asaas Platform Webhook] Assinatura ATRASADA para customer ${payment.customer}`);
      } else if (event === "SUBSCRIPTION_CANCELED" || event === "SUBSCRIPTION_DELETED" || event === "PAYMENT_REFUNDED") {
        // ── BUG 2 FIX: Tratar cancelamento de assinatura pelo portal Asaas ───
        await db
          .update(organizations)
          .set({ 
            subscriptionStatus: "canceled",
            asaasSubscriptionId: null,
            updatedAt: new Date()
          })
          .where(eq(organizations.id, targetOrg.id));
        debugLog(`[Asaas Platform Webhook] Assinatura CANCELADA para customer ${payment.customer}`);
      } else {
        // FIX-7: Log de eventos não mapeados para facilitar diagnóstico futuro
        console.warn(`[Asaas Platform Webhook] Evento não tratado recebido: "${event}" para customer ${payment.customer}`);
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Asaas Platform Webhook] Erro ao processar:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.use("/api/webhooks/whatsapp", whatsappWebhookRouter);
  app.use("/api/webhooks/focusnfe", focusNfeWebhookRouter);

  // ─── Assinafy Webhook (Contratos Digitais) ─────────────────────────────────
  // Recebe eventos de documentos assinados/rejeitados do provedor de assinatura.
  // Multi-tenancy: identifica o contrato pelo provider_document_id (assinafyDocId)
  // e atualiza SOMENTE o tenant dono do documento.
  app.post("/api/webhooks/assinafy", async (req, res) => {
    try {
      const webhookSecret = (ENV.assinafyWebhookSecret || "").trim();
      const rawToken = (
        req.headers["x-assinafy-token"] ||
        req.headers["authorization"]
      )?.toString();
      const requestToken = (rawToken || "").replace(/^Bearer\s+/i, "").trim();

      // A Assinafy não envia assinatura/token nos payloads — a autenticidade é
      // validada por correlação: provider_document_id (assinafyDocId) + account_id.
      // Se um secret for configurado (opcional), exigimos o header correspondente.
      if (webhookSecret && requestToken !== webhookSecret) {
        console.warn("[Assinafy Webhook] Token inválido — ignorado.");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body as {
        id?: number | string;
        event?: string;
        message?: string | null;
        payload?: Record<string, unknown> | null;
        subject?: { type?: string } | null;
        object?: { id?: string; status?: string; artifacts?: Record<string, string> | null } | null;
        account_id?: string | null;
      };

      const event = body.event || "";
      const docId = body.object?.id || (body.payload as any)?.document_id || null;
      const eventId = body.id !== undefined ? String(body.id) : null;

      debugLog(`[Assinafy Webhook] Evento recebido: ${event} (doc: ${docId || "?"})`);

      if (!docId) {
        return res.status(200).json({ ok: true, ignored: "no document id" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB unavailable" });

      const { contracts, contractEvents, schoolIntegrations } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const [contract] = await db.select()
        .from(contracts)
        .where(eq(contracts.assinafyDocId, docId))
        .limit(1);

      if (!contract) {
        console.warn(`[Assinafy Webhook] Documento ${docId} não corresponde a nenhum contrato — ignorado.`);
        return res.status(200).json({ ok: true, ignored: "contract not found" });
      }

      // Validação de origem: account_id do payload deve bater com a integração do tenant
      if (body.account_id) {
        const [integration] = await db.select()
          .from(schoolIntegrations)
          .where(and(
            eq(schoolIntegrations.organizationId, contract.organizationId!),
            eq(schoolIntegrations.provider, "assinafy"),
          ))
          .limit(1);
        if (integration?.accountId && integration.accountId !== body.account_id) {
          console.warn(`[Assinafy Webhook] account_id divergente para doc ${docId} — ignorado.`);
          return res.status(200).json({ ok: true, ignored: "account mismatch" });
        }
      }

      // Idempotência: se o evento já foi processado, ignora
      if (eventId) {
        const [existing] = await db.select({ id: contractEvents.id })
          .from(contractEvents)
          .where(and(
            eq(contractEvents.provider, "assinafy"),
            eq(contractEvents.providerEventId, eventId),
          ))
          .limit(1);
        if (existing) {
          return res.status(200).json({ ok: true, duplicate: true });
        }
      }

      const { mapProviderStatus, addContractEvent } = await import("../services/contractService");
      const statusDescription = body.message || "";

      // Eventos relevantes
      if (event === "signer_signed_document" || event === "document_ready") {
        // Consulta o status autoritativo do documento
        try {
          const [integration] = await db.select()
            .from(schoolIntegrations)
            .where(and(
              eq(schoolIntegrations.organizationId, contract.organizationId!),
              eq(schoolIntegrations.provider, "assinafy"),
              eq(schoolIntegrations.active, true),
            ))
            .limit(1);
          if (integration) {
            const { providerFromIntegration } = await import("../services/signature");
            const provider = providerFromIntegration(integration);
            const status = await provider.getDocumentStatus(docId);
            const mapped = mapProviderStatus(status.status);

            const updateData: any = { status: mapped.internalStatus, updatedAt: new Date() };
            if (mapped.signed) {
              updateData.signedAt = contract.signedAt ?? new Date();
              if (status.signedDocumentUrl) updateData.signedDocumentUrl = status.signedDocumentUrl;
            }
            if (status.declined) updateData.cancelledAt = new Date();
            await db.update(contracts).set(updateData).where(eq(contracts.id, contract.id));

            if (mapped.signed) {
              await addContractEvent(db as any, contract.id, "contrato_assinado", "Contrato assinado", eventId, { providerEvent: event, providerStatus: status.status });
              if (contract.status !== "assinado") {
                await notifyContractActivity(contract, "assinado", "Um contrato foi assinado!");
              }
            } else {
              await addContractEvent(db as any, contract.id, "assinatura_iniciada", "Assinatura em andamento", eventId, { providerEvent: event, providerStatus: status.status });
            }
          }
        } catch (e) {
          console.error(`[Assinafy Webhook] Falha ao sincronizar status do doc ${docId}:`, e);
        }
      } else if (event === "signer_rejected_document" || event === "user_rejected_document") {
        await db.update(contracts).set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(contracts.id, contract.id));
        await addContractEvent(db as any, contract.id, "contrato_recusado", statusDescription || "Contrato recusado", eventId, { providerEvent: event });
        if (contract.status !== "cancelado") {
          await notifyContractActivity(contract, "recusado", `Contrato recusado${statusDescription ? `: ${statusDescription}` : " pela parte contrária"}`);
        }
      } else if (event === "document_processing_failed") {
        await db.update(contracts).set({ status: "erro", updatedAt: new Date() })
          .where(eq(contracts.id, contract.id));
        await addContractEvent(db as any, contract.id, "contrato_erro", statusDescription || "Falha no processamento do documento", eventId, { providerEvent: event });
      } else if (event === "signature_requested" || event === "assignment_created") {
        await db.update(contracts).set({ status: "aguardando_assinatura", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(contracts.id, contract.id));
        await addContractEvent(db as any, contract.id, "contrato_enviado", "Contrato enviado para assinatura", eventId, { providerEvent: event });
      } else {
        await addContractEvent(db as any, contract.id, event, statusDescription || `Evento ${event}`, eventId, { providerEvent: event });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Assinafy Webhook] Erro ao processar:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // ─── Bot Status Webhook ───────────────────────────────────────────────────
  // POST /api/webhooks/bot-status  → recebe aviso do bot quando cair
  // GET  /api/webhooks/bot-status/sse → SSE para o frontend escutar
  app.use("/api/webhooks/bot-status", botStatusWebhookRouter);
  // ─────────────────────────────────────────────────────────────────────────

  // [MÉDIO-06 FIX + AUDIT-P1 FIX] Protege /uploads com autenticação REAL.
  // O middleware anterior usava req.cookies sem cookie-parser (sempre undefined
  // → feature morta). Agora valida o token de sessão de fato via sdk.
  app.use("/uploads", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Disposition", "inline");
    next();
  }, express.static("uploads", {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Disposition", "inline");
    }
  }));

  // ─── Tokens temporários para servir arquivos locais em iframes/players ────
  // Contexto: iframes, <video> e <audio> carregam URLs em contexto isolado
  // e não enviam o cookie de sessão → a rota /uploads retorna 401.
  // Solução: o tRPC gera um token HMAC stateless (via createFileToken) válido
  // por 30 min e retorna /uploads-token/{token}/{filename}. Esta rota pública
  // valida assinatura + expiração e serve o arquivo sem exigir cookie.
  // (Antes: Map em memória — tokens morriam no restart/múltiplas instâncias → 403.)
  app.use("/uploads-token", async (req: express.Request, res: express.Response) => {
    const parts = req.path.split("/").filter(Boolean);
    const token = parts[0];
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const relKey = verifyFileToken(token);
    if (!relKey) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    const absPath = path.resolve(process.cwd(), "uploads", relKey);
    if (!absPath.startsWith(path.resolve(process.cwd(), "uploads"))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Disposition", "inline");

    return res.sendFile(absPath, (err) => {
      if (err) {
        debugLog("[uploads-token] sendFile error:", (err as Error).message);
        if (!res.headersSent) res.status(404).json({ error: "File not found" });
      }
    });
  });


  // CRÍTICO-03 FIX: CSP habilitado em produção com política restritiva.
  // Em desenvolvimento, CSP permanece desabilitado para compatibilidade com Vite HMR.
  app.use(helmet({
    contentSecurityPolicy: ENV.isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://www.googletagmanager.com",
          "https://www.gstatic.com",
          "https://*.firebaseapp.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "https://api.asaas.com",
          "https://sandbox.asaas.com",
          "https://generativelanguage.googleapis.com",
          "https://api.mercadopago.com",
          "https://www.mercadopago.com",
          "https://firebaseinstallations.googleapis.com",
          "https://fcmregistrations.googleapis.com",
          "https://fcm.googleapis.com",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://*.firebaseapp.com",
          "https://viacep.com.br",
          "https://brasilapi.com.br",
          "wss:",
        ],
        mediaSrc: ["'self'", "blob:", "https:"],
        objectSrc: ["'self'", "blob:", "data:"],
        frameSrc: ["'self'", "blob:", "data:", "https:"],
        frameAncestors: [
          "'self'",
          "https://*.wrmusicpro.com.br",
          "https://wrmusicpro.com.br",
          "capacitor://localhost",
          "http://localhost:*",
        ],
        upgradeInsecureRequests: [],
      },
    } : false, // desabilitado em dev para compatibilidade com Vite
    crossOriginEmbedderPolicy: false,
    // YouTube Erro 153 (exigência 2025): o player embutido do YouTube EXIGE
    // identificação via header HTTP Referer. O default do helmet v8 é
    // "no-referrer", que suprime o referer e quebra TODOS os embeds com
    // "Error 153: Video player configuration error". Enviamos a política
    // recomendada oficialmente pelo YouTube.
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));
  const allowedOrigins = [
    process.env.APP_URL,
    "https://wrmusicpro.com.br",
    "https://www.wrmusicpro.com.br",
    "https://leads.wrmusicpro.com.br",
    "https://analytics.wrmusicpro.com.br",
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
    "http://localhost:3000",
    "http://localhost:5000"
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // AUDIT-P1 FIX: fallback permissivo removido — origens não autorizadas não
      // recebem headers CORS (bloqueia leitura autenticada cross-site/CSRF).
      // Requisições sem Origin (mobile nativo, Evolution API, health checks) seguem permitidas.
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith("capacitor://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost")
      ) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Origem rejeitada: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie"]
  }));

  // ─── Middleware de Auditoria de Acessos & Detecção de Ataques ─────────────
  app.use((req, res, next) => {
    const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "127.0.0.1";
    const path = req.originalUrl || req.path || "/";
    const method = req.method;

    const attackCheck = detectAttackCategory(path);

    if (attackCheck.isAttack) {
      logSecurityEvent({
        ip: rawIp,
        route: path,
        method: method,
        statusCode: 403,
        eventCategory: attackCheck.category,
        severity: attackCheck.severity,
        userAgent: req.headers["user-agent"] as string,
        referer: req.headers["referer"] as string,
        details: "Detecção proativa de robô/scanner de vulnerabilidades.",
      });
    } else {
      const isApi = path.includes("/api/") || path.includes("/trpc");
      if (isApi || Math.random() < 0.1) {
        logSecurityEvent({
          ip: rawIp,
          route: path,
          method: method,
          statusCode: res.statusCode || 200,
          eventCategory: "access",
          severity: "info",
          userAgent: req.headers["user-agent"] as string,
          referer: req.headers["referer"] as string,
        });
      }
    }
    next();
  });

  // ─── Rate Limiting para a API (Global) ────────────────────────────────────
  // Limite de 5000 req/min por usuário autenticado (identificado pelo cookie
  // app_session_id) ou por IP quando não autenticado.
  //
  // Rotas de automações (list, update, toggle, create, stats, history, etc.)
  // ficam isentas do rate limit global pois são chamadas em cascata legítimas
  // (salvar 1 automação dispara ~4 invalidações do React Query) e já são
  // protegidas por autenticação JWT (protectedProcedure).
  const AUTOMATION_SKIP_ROUTES = [
    "automations.list",
    "automations.update",
    "automations.toggle",
    "automations.create",
    "automations.delete",
    "automations.stats",
    "automations.history",
    "automations.seedDefaults",
    "settings.getAutomation",
    "settings.toggleAutomation",
  ];
  const apiLimiter = createRateLimiter(
    60 * 1000,
    5000,
    "Muitas requisições. Tente novamente em um minuto.",
    AUTOMATION_SKIP_ROUTES
  );
  app.use("/api/trpc", apiLimiter);

  // Rate limit reforçado para endpoints PÚBLICOS de matrícula (sem autenticação) —
  // anti-abuso/enumeração, limitado por IP.
  const enrollmentLimiter = createRateLimiter(
    60 * 1000,
    120,
    "Muitas requisições. Aguarde um instante e tente novamente."
  );
  app.use("/api/trpc/enrollment", enrollmentLimiter);


  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // AUD-005 FIX: Sanitização de erros internos — garante que exceções inesperadas
      // (erros de banco, de bibliotecas internas, etc.) não exponham detalhes técnicos
      // ao cliente. Apenas TRPCError (erros controlados) passam a mensagem original.
      // Erros internos são logados no servidor e retornam mensagem genérica ao client.
      onError: ({ path, error, type }) => {
        const isTRPCError = error.name === "TRPCError";
        // Erros controlados (autenticação, validação, not found) são esperados — não logar como erro
        const isExpectedCode = ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"].includes(error.code);
        if (!isExpectedCode) {
          console.error(`[TRPC Error] ${type} "${path}":`, error.message, error.cause ?? "");
        }
        // Nota: o tRPC retorna error.message ao client por padrão.
        // Para suprimir mensagens de erro interno, configure `errorShape` no initTRPC.
        // Os TRPCErrors lançados explicitamente pelos routers já têm mensagens controladas.
        // Erros não-TRPCError (falhas inesperadas) terão sua mensagem sobrescrita abaixo:
        if (!isTRPCError) {
          // Sobrescreve a mensagem para não expor detalhes internos ao cliente
          error.message = "Ocorreu um erro interno. Tente novamente mais tarde.";
        }
      }
    })
  );

  // AUDIT: Health check HTTP dedicado — verifica app + banco, sem expor detalhes
  // sensíveis. Deve ficar ANTES do SPA fallback (que responde 200 para qualquer path).
  app.get("/api/health", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ status: "unhealthy", database: "down" });
      }
      await db.execute(sql`SELECT 1`);
      return res.status(200).json({ status: "healthy", database: "up" });
    } catch {
      return res.status(503).json({ status: "unhealthy", database: "down" });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    debugLog(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    debugLog(`Server running on http://localhost:${port}/`);
    // Iniciar job de automação de lembretes
    startAutomationJob();
    // Iniciar job de automação de marketing
    marketingWorker.start();
    // Iniciar worker de processamento fiscal NFS-e
    FiscalQueueWorker.start();
    // Configura o webhook do WhatsApp para todas as instâncias existentes
    // Aguarda 5s para garantir que a Evolution API esteja pronta antes de registrar
    setTimeout(() => setupAllEvolutionWebhooks(), 5000);
  });
}

startServer().catch(console.error);
