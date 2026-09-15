/**
 * analyticsRouter.ts — Router principal do módulo MusicPro Analytics
 * 
 * Contém 3 sub-routers:
 * 1. event — endpoints públicos de coleta (track, batch, heartbeat)
 * 2. query — queries do dashboard (Super Admin apenas)
 * 3. realtime — SSE de usuários online
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  analyticsEvents,
  analyticsSessions,
  analyticsVisitors,
  analyticsHeatmap,
  analyticsOnline,
  analyticsConversions,
  analyticsRevenue,
  analyticsCampaigns,
  analyticsPages,
  analyticsAiInsights,
  analyticsSecurityLogs,
  paymentDues,
  users,
  organizations,
  settings,
  students,
  systemPlans,
} from "../drizzle/schema";
import {
  analyticsQueue,
  upsertAnalyticsVisitor,
  upsertAnalyticsSession,
  upsertOnlineUser,
} from "./services/AnalyticsQueue";
import { getAsaasNextMonthRevenue } from "./utils/asaas";
import { resolveGeoFromIp } from "./utils/geoIp";
import { eq, sql, desc, asc, gte, lte, and, count, sum, avg, lt, or, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { ENV } from "./_core/env";

// ── Middleware Super Admin ────────────────────────────────────────────────────
import { protectedProcedure } from "./_core/trpc";

const isSuperAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const superAdminEmail = ENV.superAdminEmail?.toLowerCase() || "walyssonrodrigo145@gmail.com";
  const userEmail = ctx.user.email?.toLowerCase();

  const isMaster =
    ENV.superAdminEmails.includes(userEmail || "") ||
    userEmail === superAdminEmail ||
    userEmail === "walyssonrodrigo145@gmail.com" ||
    userEmail === "ddwvitor@gmail.com" ||
    (ENV.ownerOpenId && ctx.user.openId === ENV.ownerOpenId);

  if (!isMaster) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Acesso restrito ao Super Admin.",
    });
  }
  return next({ ctx });
});

function extractPathname(urlStr: string): string {
  if (!urlStr) return "/";
  try {
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      const parsed = new URL(urlStr);
      return parsed.pathname || "/";
    }
  } catch {}
  return urlStr.split("?")[0].substring(0, 255) || "/";
}

// ── Schemas de validação ─────────────────────────────────────────────────────
const EventSchema = z.object({
  sessionId: z.string().max(64),
  visitorId: z.string().max(64),
  userId: z.number().optional().nullable(),
  eventName: z.enum([
    "page_view", "session_start", "session_end", "button_click", "link_click",
    "signup_started", "signup_completed", "trial_started", "trial_finished",
    "login", "logout", "plan_selected", "checkout_started", "pix_generated",
    "payment_success", "payment_failed", "subscription_created", "subscription_cancelled",
    "email_open", "email_click", "whatsapp_click", "video_play", "video_finish",
    "download", "upload", "form_submit", "search", "feature_used", "error", "api_error",
    "scroll_depth", "heatmap_click", "heatmap_move", "web_vital",
  ]),
  pageUrl: z.string().max(2000).optional().nullable(),
  pageTitle: z.string().max(255).optional().nullable(),
  referrer: z.string().max(2000).optional().nullable(),
  elementId: z.string().max(100).optional().nullable(),
  elementText: z.string().max(255).optional().nullable(),
  elementTag: z.string().max(30).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  utmContent: z.string().max(100).optional().nullable(),
  utmTerm: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  deviceType: z.enum(["desktop", "tablet", "mobile", "tv", "unknown"]).optional().nullable(),
  os: z.string().max(80).optional().nullable(),
  browser: z.string().max(80).optional().nullable(),
  screenRes: z.string().max(20).optional().nullable(),
  value: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  timeOnPageSec: z.number().optional().nullable(),
  scrollDepth: z.number().min(0).max(100).optional().nullable(),
});

const SessionSchema = z.object({
  sessionId: z.string().max(64),
  visitorId: z.string().max(64),
  userId: z.number().optional().nullable(),
  ipMasked: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  language: z.string().max(20).optional().nullable(),
  timezone: z.string().max(60).optional().nullable(),
  deviceType: z.enum(["desktop", "tablet", "mobile", "tv", "unknown"]).optional().nullable(),
  os: z.string().max(80).optional().nullable(),
  browser: z.string().max(80).optional().nullable(),
  screenRes: z.string().max(20).optional().nullable(),
  userAgent: z.string().max(500).optional().nullable(),
  referrer: z.string().max(2000).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  utmContent: z.string().max(100).optional().nullable(),
  utmTerm: z.string().max(100).optional().nullable(),
});

const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  preset: z.enum(["today", "yesterday", "7d", "30d", "90d", "month", "year", "custom"]).default("30d"),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function getDateRange(preset: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = to ? new Date(to) : new Date();

  switch (preset) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case "yesterday": {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);

      const endDay = new Date(now);
      endDay.setDate(endDay.getDate() - 1);
      endDay.setHours(23, 59, 59, 999);
      return { start, end: endDay };
    }
    case "7d":
      return { start: new Date(Date.now() - 7 * 86400000), end };
    case "30d":
      return { start: new Date(Date.now() - 30 * 86400000), end };
    case "90d":
      return { start: new Date(Date.now() - 90 * 86400000), end };
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { start, end };
    }
    case "custom":
      return { start: from ? new Date(from) : new Date(Date.now() - 30 * 86400000), end };
    default:
      return { start: new Date(Date.now() - 30 * 86400000), end };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER DE EVENTOS (público — sem autenticação)
// ─────────────────────────────────────────────────────────────────────────────
const analyticsEventRouter = router({
  // Inicia ou atualiza uma sessão
  sessionStart: publicProcedure
    .input(z.object({ session: SessionSchema, visitor: z.object({ visitorId: z.string().max(64) }) }))
    .mutation(async ({ ctx, input }) => {
      const rawIp = (ctx.req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (ctx.req?.headers?.["x-real-ip"] as string) || ctx.req?.ip || "127.0.0.1";
      const geo = await resolveGeoFromIp(rawIp);

      const country = input.session.country || geo.country;
      const state = input.session.state || geo.state;
      const city = input.session.city || geo.city;

      // Upsert visitante e sessão de forma assíncrona
      upsertAnalyticsVisitor({
        visitorId: input.visitor.visitorId,
        country,
        state,
        city,
        deviceType: input.session.deviceType ?? "unknown",
      }).catch(() => {}); // Fire and forget

      upsertAnalyticsSession({
        sessionId: input.session.sessionId,
        visitorId: input.session.visitorId,
        userId: input.session.userId,
        ipMasked: input.session.ipMasked,
        country,
        state,
        city,
        language: input.session.language,
        timezone: input.session.timezone,
        deviceType: input.session.deviceType ?? "unknown",
        os: input.session.os,
        browser: input.session.browser,
        screenRes: input.session.screenRes,
        userAgent: input.session.userAgent,
        referrer: input.session.referrer,
        utmSource: input.session.utmSource,
        utmMedium: input.session.utmMedium,
        utmCampaign: input.session.utmCampaign,
        utmContent: input.session.utmContent,
        utmTerm: input.session.utmTerm,
        startedAt: new Date(),
        isBounce: true,
        pageCount: 1,
      }).catch(() => {});

      return { ok: true };
    }),

  // Rastreia um único evento
  track: publicProcedure
    .input(EventSchema)
    .mutation(async ({ ctx, input }) => {
      const rawIp = (ctx.req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (ctx.req?.headers?.["x-real-ip"] as string) || ctx.req?.ip || "127.0.0.1";
      const geo = await resolveGeoFromIp(rawIp);

      analyticsQueue.push({
        sessionId: input.sessionId,
        visitorId: input.visitorId,
        userId: input.userId,
        eventName: input.eventName,
        pageUrl: input.pageUrl,
        pageTitle: input.pageTitle,
        referrer: input.referrer,
        elementId: input.elementId,
        elementText: input.elementText,
        elementTag: input.elementTag,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
        country: input.country || geo.country,
        state: input.state || geo.state,
        city: input.city || geo.city,
        deviceType: input.deviceType ?? "unknown",
        os: input.os,
        browser: input.browser,
        screenRes: input.screenRes,
        value: input.value,
        metadata: input.metadata as Record<string, unknown>,
        timeOnPageSec: input.timeOnPageSec,
        scrollDepth: input.scrollDepth,
        createdAt: new Date(),
      });
      return { ok: true };
    }),

  // Rastreia lote de eventos (enviado pelo debounce do front-end)
  trackBatch: publicProcedure
    .input(z.object({ events: z.array(EventSchema).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const rawIp = (ctx.req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (ctx.req?.headers?.["x-real-ip"] as string) || ctx.req?.ip || "127.0.0.1";
      const geo = await resolveGeoFromIp(rawIp);

      const pushed = analyticsQueue.pushMany(
        input.events.map((e) => ({
          sessionId: e.sessionId,
          visitorId: e.visitorId,
          userId: e.userId,
          eventName: e.eventName,
          pageUrl: e.pageUrl,
          pageTitle: e.pageTitle,
          referrer: e.referrer,
          elementId: e.elementId,
          elementText: e.elementText,
          elementTag: e.elementTag,
          utmSource: e.utmSource,
          utmMedium: e.utmMedium,
          utmCampaign: e.utmCampaign,
          utmContent: e.utmContent,
          utmTerm: e.utmTerm,
          country: e.country || geo.country,
          state: e.state || geo.state,
          city: e.city || geo.city,
          deviceType: e.deviceType ?? "unknown",
          os: e.os,
          browser: e.browser,
          screenRes: e.screenRes,
          value: e.value,
          metadata: e.metadata as Record<string, unknown>,
          timeOnPageSec: e.timeOnPageSec,
          scrollDepth: e.scrollDepth,
          createdAt: new Date(),
        }))
      );

      // FIX: se a sessão foi encerrada (aba fechada), remover o usuário da lista de online
      const endedSessions = new Set(
        input.events.filter((e) => e.eventName === "session_end").map((e) => e.sessionId)
      );
      if (endedSessions.size > 0) {
        try {
          const db = await getDb();
          if (db) {
            endedSessions.forEach(async (sid) => {
              await db.delete(analyticsOnline).where(eq(analyticsOnline.sessionId, sid));
            });
          }
        } catch (e) {
          console.error("[Analytics] Falha ao remover sessão encerrada do online:", e);
        }
      }

      return { ok: true, pushed };
    }),

  // Heartbeat de usuário online (chamado a cada 30s)
  heartbeat: publicProcedure
    .input(z.object({
      sessionId: z.string().max(64),
      visitorId: z.string().max(64),
      userId: z.number().optional().nullable(),
      userName: z.string().max(255).optional().nullable(),
      pageUrl: z.string().max(2000).optional().nullable(),
      pageTitle: z.string().max(255).optional().nullable(),
      country: z.string().max(100).optional().nullable(),
      state: z.string().max(100).optional().nullable(),
      city: z.string().max(100).optional().nullable(),
      deviceType: z.enum(["desktop", "tablet", "mobile", "tv", "unknown"]).optional().nullable(),
      browser: z.string().max(80).optional().nullable(),
      os: z.string().max(80).optional().nullable(),
      screenRes: z.string().max(20).optional().nullable(),
      utmSource: z.string().max(100).optional().nullable(),
      referrer: z.string().max(2000).optional().nullable(),
      ipMasked: z.string().max(20).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rawIp = (ctx.req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || (ctx.req?.headers?.["x-real-ip"] as string) || ctx.req?.ip || "127.0.0.1";
      const geo = await resolveGeoFromIp(rawIp);

      upsertOnlineUser({
        ...input,
        country: input.country || geo.country,
        state: input.state || geo.state,
        city: input.city || geo.city,
      }).catch(() => {});
      return { ok: true };
    }),

  // Registrar dados de heatmap
  heatmap: publicProcedure
    .input(z.object({
      sessionId: z.string().max(64),
      pageUrl: z.string().max(2000),
      points: z.array(z.object({
        xPercent: z.number().min(0).max(100),
        yPercent: z.number().min(0).max(100),
        eventType: z.enum(["click", "move", "scroll"]),
        viewportW: z.number().optional(),
        viewportH: z.number().optional(),
      })).max(100),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return { ok: false };

        const pageUrlNormalized = extractPathname(input.pageUrl);

        await db.insert(analyticsHeatmap).values(
          input.points.map((p) => ({
            sessionId: input.sessionId,
            pageUrl: input.pageUrl,
            pageUrlNormalized,
            xPercent: String(p.xPercent),
            yPercent: String(p.yPercent),
            eventType: p.eventType,
            viewportW: p.viewportW,
            viewportH: p.viewportH,
          }))
        );
      } catch {}
      return { ok: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER DE QUERIES (Super Admin)
// ─────────────────────────────────────────────────────────────────────────────
const analyticsQueryRouter = router({

  // ── Cards KPI do Dashboard ────────────────────────────────────────────────
  getDashboardCards: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    // 1. Online Agora (mesma janela de 5 min da aba de escolas)
    let onlineNowCount = 0;
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineUsersList = await db.select()
        .from(analyticsOnline)
        .where(gte(analyticsOnline.lastPingAt, fiveMinAgo));
      onlineNowCount = onlineUsersList.length;
    } catch (e) {}

    // 2. Visitantes no Período e Únicos
    let visitorsCount = 0;
    let uniqueVisitorsCount = 0;
    try {
      const [vRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(analyticsSessions)
        .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)));
      visitorsCount = vRes?.count || 0;

      const [uRes] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)` })
        .from(analyticsSessions)
        .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)));
      uniqueVisitorsCount = uRes?.count || 0;

      if (visitorsCount === 0) {
        const [evVisitors] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)` })
          .from(analyticsEvents)
          .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)));
        const [evUniqueVisitors] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.visitorId}) AS INT)` })
          .from(analyticsEvents)
          .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)));
        visitorsCount = evVisitors?.count || 0;
        uniqueVisitorsCount = evUniqueVisitors?.count || 0;
      }

      if (input.preset === "today") {
        const [onlineTodayRes] = await db.select({
          count: sql<number>`CAST(COUNT(*) AS INT)`,
          uniqueCount: sql<number>`CAST(COUNT(DISTINCT ${analyticsOnline.visitorId}) AS INT)`,
        })
          .from(analyticsOnline)
          .where(gte(analyticsOnline.lastPingAt, todayStart));

        visitorsCount = Math.max(visitorsCount, onlineTodayRes?.count || 0, onlineNowCount);
        uniqueVisitorsCount = Math.max(uniqueVisitorsCount, onlineTodayRes?.uniqueCount || 0, onlineNowCount);
      }
    } catch (e) {}

    // 3. Novos Cadastros de Clientes/Escolas no MusicPro SaaS no Período
    let signupsCount = 0;
    try {
      const [signupEvRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(analyticsEvents)
        .where(and(
          eq(analyticsEvents.eventName, "signup_completed"),
          gte(analyticsEvents.createdAt, start),
          lte(analyticsEvents.createdAt, end)
        ));
      signupsCount = signupEvRes?.count || 0;

      if (signupsCount === 0) {
        const [orgsRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(organizations)
          .where(and(gte(organizations.createdAt, start), lte(organizations.createdAt, end)));
        signupsCount = orgsRes?.count || 0;
      }
    } catch (e) {}

    // 4. Testes Gratuitos do MusicPro SaaS (Trials no Período)
    let trialsCount = 0;
    try {
      const [trialEvRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(analyticsEvents)
        .where(and(
          eq(analyticsEvents.eventName, "trial_started"),
          gte(analyticsEvents.createdAt, start),
          lte(analyticsEvents.createdAt, end)
        ));
      trialsCount = trialEvRes?.count || 0;

      if (trialsCount === 0) {
        const [orgsTrialRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(organizations)
          .where(and(
            eq(organizations.subscriptionStatus, "trialing"),
            gte(organizations.createdAt, start),
            lte(organizations.createdAt, end)
          ));
        trialsCount = orgsTrialRes?.count || 0;
      }
    } catch (e) {}

    // 5. Assinaturas do MusicPro SaaS no Período
    let subscriptionsCount = 0;
    try {
      const [subEvRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(analyticsEvents)
        .where(and(
          eq(analyticsEvents.eventName, "subscription_created"),
          gte(analyticsEvents.createdAt, start),
          lte(analyticsEvents.createdAt, end)
        ));
      subscriptionsCount = subEvRes?.count || 0;

      if (subscriptionsCount === 0) {
        const [orgsActiveRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(organizations)
          .where(and(
            eq(organizations.subscriptionStatus, "active"),
            gte(organizations.updatedAt, start),
            lte(organizations.updatedAt, end)
          ));
        subscriptionsCount = orgsActiveRes?.count || 0;
      }
    } catch (e) {}

    // 6. Receita da Plataforma SaaS MusicPro (analyticsRevenue — cobranças dos planos das escolas)
    let revPeriod = 0;
    let revMonth = 0;
    let revTotal = 0;

    try {
      const [revPeriodRes] = await db.select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
        .from(analyticsRevenue)
        .where(and(gte(analyticsRevenue.createdAt, start), lte(analyticsRevenue.createdAt, end)));

      const [revMonthRes] = await db.select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
        .from(analyticsRevenue)
        .where(gte(analyticsRevenue.createdAt, monthStart));

      const [revTotalRes] = await db.select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
        .from(analyticsRevenue);

      revPeriod = parseFloat(revPeriodRes?.total || "0");
      revMonth = parseFloat(revMonthRes?.total || "0");
      revTotal = parseFloat(revTotalRes?.total || "0");
    } catch (e) {}

    // 7. Receita Prevista Próximo Mês (nextMonthForecast)
    let nextMonthForecast = 0;
    try {
      // 0. Busca todas as chaves de API do Asaas salvas na tabela settings + ENV
      const activeSettings = await db.select({
        asaasApiKey: settings.asaasApiKey,
        asaasEnabled: settings.asaasEnabled,
      })
      .from(settings)
      .where(and(isNotNull(settings.asaasApiKey), ne(settings.asaasApiKey, "")));

      const apiKeys = new Set<string>();
      if (ENV.asaasApiKey && ENV.asaasApiKey.trim().length > 5) {
        apiKeys.add(ENV.asaasApiKey.trim());
      }
      for (const s of activeSettings) {
        if (s.asaasApiKey && s.asaasApiKey.trim().length > 5) {
          // BUG FIX: chave BYOK vem cifrada (v1:...) no select cru — decifrar antes de consultar a API
          const { decryptSecret } = await import("./utils/integrationCrypto");
          apiKeys.add(decryptSecret(s.asaasApiKey).trim());
        }
      }

      let asaasNextMonth = 0;
      // AUD-004 FIX: Array.from para compatibilidade com o target TS (Set<string> não iterável diretamente)
      for (const key of Array.from(apiKeys)) {
        try {
          const rev = await getAsaasNextMonthRevenue(key);
          asaasNextMonth += rev;
        } catch (errKey) {
          console.error("[analyticsRouter] Erro ao consultar Asaas para chave:", errKey);
        }
      }

      // 1. Estimar Receita Prevista SaaS consultando os preços reais dos planos na tabela systemPlans
      // Seleciona organizações cadastradas ativas/teste, EXCLUINDO contas internas de donos e demonstração (IDs 1, 19, 21)
      const activeOrgs = await db.select({
        planId: organizations.planId,
        subscriptionStatus: organizations.subscriptionStatus,
      })
      .from(organizations)
      .where(and(
        notInArray(organizations.id, [1, 19, 21]),
        or(
          isNull(organizations.subscriptionStatus),
          and(
            ne(organizations.subscriptionStatus, "canceled"),
            ne(organizations.subscriptionStatus, "inactive")
          )
        )
      ));

      // Busca a tabela de preços cadastrada no sistema (systemPlans)
      const plansList = await db.select({
        id: systemPlans.id,
        priceMonthly: systemPlans.priceMonthly,
      }).from(systemPlans);

      const planPricesMap = new Map<string, number>();
      for (const p of plansList) {
        const val = parseFloat(String(p.priceMonthly).replace(/[^0-9.,]/g, "").replace(",", "."));
        if (!isNaN(val) && val > 0) {
          planPricesMap.set(p.id, val);
        }
      }

      // Descobre o menor preço cadastrado em systemPlans para usar de fallback padrão se planId não bater
      let minPlanPrice = 49;
      if (planPricesMap.size > 0) {
        minPlanPrice = Math.min(...Array.from(planPricesMap.values()));
      }

      let saasForecast = 0;
      for (const org of activeOrgs) {
        if (org.planId && planPricesMap.has(org.planId)) {
          saasForecast += planPricesMap.get(org.planId)!;
        } else {
          // Se o id do plano for padrão/personalizado ou nulo, aplica o preço base mínimo do plano
          saasForecast += minPlanPrice;
        }
      }

      // Combina fontes SaaS: se a API do Asaas do dono (ENV.asaasApiKey) tiver assinaturas ativas SaaS (ou cobranças SaaS agendadas), usa Asaas. 
      // Caso contrário, calcula a estimativa real com a soma dos preços dos planos (systemPlans) de todas as escolas cadastradas.
      nextMonthForecast = saasForecast > 0 
        ? saasForecast 
        : (asaasNextMonth > 0 ? asaasNextMonth : (revMonth > 0 ? revMonth : 0));
    } catch (e) {
      console.error("[analyticsRouter] Erro ao calcular receita prevista:", e);
      nextMonthForecast = revMonth > 0 ? revMonth : 0;
    }

    // 8. Conversão (baseada exclusivamente em analyticsRevenue — planos SaaS)
    let conversionRate = 0;
    try {
      const [uInPeriodRes] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)` })
        .from(analyticsSessions)
        .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)));

      const [pInPeriodRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(analyticsRevenue)
        .where(and(gte(analyticsRevenue.createdAt, start), lte(analyticsRevenue.createdAt, end)));

      const uniqueVisitorsPeriod = uInPeriodRes?.count || 0;
      const paymentsPeriod = pInPeriodRes?.count || 0;

      conversionRate = uniqueVisitorsPeriod > 0
        ? parseFloat(((paymentsPeriod / uniqueVisitorsPeriod) * 100).toFixed(2))
        : 0;
    } catch (e) {}

    return {
      visitorsToday: visitorsCount,
      uniqueVisitorsToday: uniqueVisitorsCount,
      onlineNow: onlineNowCount,
      signupsToday: signupsCount,
      trialsToday: trialsCount,
      subscriptionsToday: subscriptionsCount,
      revenueToday: revPeriod,
      revenueMonth: revMonth,
      revenueTotal: revTotal,
      nextMonthForecast,
      conversionRate,
    };
  }),

  // ── 9. Procedure de Evolução do Sistema (Financeiro e Usuários Mês a Mês) ────────
  getEvolutionStats: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Histórico dos últimos 6 meses
    const now = new Date();
    const months: { label: string; year: number; month: number; start: Date; end: Date }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).toUpperCase();
      months.push({ label, year: d.getFullYear(), month: d.getMonth(), start, end });
    }

    const monthlyData = [];

    for (const m of months) {
      // Receita no mês (analyticsRevenue ou fallback em paymentDues)
      const [revRes] = await db.select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
        .from(analyticsRevenue)
        .where(and(gte(analyticsRevenue.createdAt, m.start), lte(analyticsRevenue.createdAt, m.end)));

      let revVal = parseFloat(revRes?.total || "0");
      if (revVal === 0) {
        const [duesRevRes] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(${paymentDues.amount} AS NUMERIC)), 0)` })
          .from(paymentDues)
          .where(and(
            or(eq(paymentDues.status, "pago"), sql`${paymentDues.paidAt} IS NOT NULL`),
            gte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.dueDate})`, m.start.toISOString()),
            lte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.dueDate})`, m.end.toISOString())
          ));
        revVal = parseFloat(duesRevRes?.total || "0");
      }

      // Novos alunos no mês
      const [studentsRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(students)
        .where(and(gte(students.createdAt, m.start), lte(students.createdAt, m.end)));

      // Total acumulado de alunos ativos no final daquele mês
      const [activeStudentsRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(students)
        .where(and(lte(students.createdAt, m.end), eq(students.status, "ativo")));

      // Novas organizações no mês
      const [orgsRes] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(organizations)
        .where(and(gte(organizations.createdAt, m.start), lte(organizations.createdAt, m.end)));

      monthlyData.push({
        month: m.label,
        revenue: revVal,
        newStudents: studentsRes?.count || 0,
        activeStudents: activeStudentsRes?.count || 0,
        newOrganizations: orgsRes?.count || 0,
      });
    }

    // Calcula taxas de variação comparando o último mês com o penúltimo
    const curr = monthlyData[monthlyData.length - 1];
    const prev = monthlyData[monthlyData.length - 2] || curr;

    const revenueGrowth = prev.revenue > 0
      ? parseFloat((((curr.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1))
      : (curr.revenue > 0 ? 100 : 0);

    const userGrowth = prev.activeStudents > 0
      ? parseFloat((((curr.activeStudents - prev.activeStudents) / prev.activeStudents) * 100).toFixed(1))
      : (curr.activeStudents > 0 ? 100 : 0);

    return {
      monthlyHistory: monthlyData,
      revenueGrowthPercent: revenueGrowth,
      userGrowthPercent: userGrowth,
      isRevenueIncreasing: revenueGrowth >= 0,
      isUserBaseIncreasing: userGrowth >= 0,
    };
  }),

  // ── Visitantes por período ────────────────────────────────────────────────
  getVisitorStats: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    let byDay = await db.select({
      date: sql<string>`DATE(${analyticsSessions.startedAt})`,
      sessions: sql<number>`CAST(COUNT(*) AS INT)`,
      unique: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(sql`DATE(${analyticsSessions.startedAt})`)
      .orderBy(sql`DATE(${analyticsSessions.startedAt})`);

    if (byDay.length === 0) {
      byDay = await db.select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        sessions: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
        unique: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.visitorId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
        .orderBy(sql`DATE(${analyticsEvents.createdAt})`);
    }

    let byHour = await db.select({
      hour: sql<number>`CAST(EXTRACT(HOUR FROM ${analyticsSessions.startedAt}) AS INT)`,
      sessions: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(sql`EXTRACT(HOUR FROM ${analyticsSessions.startedAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${analyticsSessions.startedAt})`);

    if (byHour.length === 0) {
      byHour = await db.select({
        hour: sql<number>`CAST(EXTRACT(HOUR FROM ${analyticsEvents.createdAt}) AS INT)`,
        sessions: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(sql`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})`);
    }

    return { byDay, byHour };
  }),

  // ── Origem do tráfego ─────────────────────────────────────────────────────
  getTrafficSources: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    let sources = await db.select({
      source: sql<string>`COALESCE(${analyticsSessions.utmSource}, 
        CASE 
          WHEN ${analyticsSessions.referrer} ILIKE '%google%' THEN 'google'
          WHEN ${analyticsSessions.referrer} ILIKE '%instagram%' THEN 'instagram'
          WHEN ${analyticsSessions.referrer} ILIKE '%facebook%' THEN 'facebook'
          WHEN ${analyticsSessions.referrer} ILIKE '%whatsapp%' THEN 'whatsapp'
          WHEN ${analyticsSessions.referrer} ILIKE '%tiktok%' THEN 'tiktok'
          WHEN ${analyticsSessions.referrer} ILIKE '%youtube%' THEN 'youtube'
          WHEN ${analyticsSessions.referrer} ILIKE '%linkedin%' THEN 'linkedin'
          WHEN ${analyticsSessions.referrer} IS NOT NULL AND ${analyticsSessions.referrer} != '' THEN 'referencia'
          ELSE 'direto'
        END)`,
      sessions: sql<number>`CAST(COUNT(*) AS INT)`,
      uniqueVisitors: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(sql`1`)
      .orderBy(sql`COUNT(*) DESC`);

    if (sources.length === 0) {
      sources = await db.select({
        source: sql<string>`COALESCE(${analyticsEvents.utmSource}, 
          CASE 
            WHEN ${analyticsEvents.referrer} ILIKE '%google%' THEN 'google'
            WHEN ${analyticsEvents.referrer} ILIKE '%instagram%' THEN 'instagram'
            WHEN ${analyticsEvents.referrer} ILIKE '%facebook%' THEN 'facebook'
            WHEN ${analyticsEvents.referrer} ILIKE '%whatsapp%' THEN 'whatsapp'
            WHEN ${analyticsEvents.referrer} ILIKE '%tiktok%' THEN 'tiktok'
            WHEN ${analyticsEvents.referrer} ILIKE '%youtube%' THEN 'youtube'
            WHEN ${analyticsEvents.referrer} ILIKE '%linkedin%' THEN 'linkedin'
            WHEN ${analyticsEvents.referrer} IS NOT NULL AND ${analyticsEvents.referrer} != '' THEN 'referencia'
            ELSE 'direto'
          END)`,
        sessions: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
        uniqueVisitors: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.visitorId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(sql`1`)
        .orderBy(sql`COUNT(*) DESC`);
    }

    // Receita por source
    const revenueBySource = await db.select({
      source: sql<string>`COALESCE(${analyticsRevenue.utmSource}, 'direto')`,
      revenue: sql<string>`COALESCE(SUM(${analyticsRevenue.amount}), 0)`,
      conversions: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsRevenue)
      .where(and(gte(analyticsRevenue.createdAt, start), lte(analyticsRevenue.createdAt, end)))
      .groupBy(sql`1`);

    const revenueMap = Object.fromEntries(
      revenueBySource.map((r) => [r.source, { revenue: parseFloat(r.revenue), conversions: r.conversions }])
    );

    const totalSessions = sources.reduce((acc, s) => acc + s.sessions, 0);

    return sources.map((s) => ({
      source: s.source,
      sessions: s.sessions,
      uniqueVisitors: s.uniqueVisitors,
      percentage: totalSessions > 0 ? ((s.sessions / totalSessions) * 100).toFixed(1) : "0",
      conversions: revenueMap[s.source]?.conversions ?? 0,
      revenue: revenueMap[s.source]?.revenue ?? 0,
    }));
  }),

  // ── Páginas mais visitadas ────────────────────────────────────────────────
  getLandingPages: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    const pages = await db.select({
      pageUrl: analyticsEvents.pageUrl,
      pageTitle: analyticsEvents.pageTitle,
      totalViews: sql<number>`CAST(COUNT(*) AS INT)`,
      uniqueVisitors: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.visitorId}) AS INT)`,
      avgTimeSec: sql<number>`CAST(COALESCE(AVG(${analyticsEvents.timeOnPageSec}), 0) AS INT)`,
    })
      .from(analyticsEvents)
      .where(and(
        eq(analyticsEvents.eventName, "page_view"),
        gte(analyticsEvents.createdAt, start),
        lte(analyticsEvents.createdAt, end),
        sql`${analyticsEvents.pageUrl} IS NOT NULL`,
      ))
      .groupBy(analyticsEvents.pageUrl, analyticsEvents.pageTitle)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50);

    return pages;
  }),

  // ── Funil de conversão ────────────────────────────────────────────────────
  getConversionFunnel: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    const countEvent = async (eventName: string) => {
      const [result] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)` })
        .from(analyticsEvents)
        .where(and(
          sql`${analyticsEvents.eventName} = ${eventName}`,
          gte(analyticsEvents.createdAt, start),
          lte(analyticsEvents.createdAt, end),
        ));
      return result.count;
    };

    const [visitors] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)));

    const landing = await countEvent("page_view");
    const signupStarted = await countEvent("signup_started");
    const signupCompleted = await countEvent("signup_completed");
    const trialStarted = await countEvent("trial_started");
    const planSelected = await countEvent("plan_selected");
    const checkoutStarted = await countEvent("checkout_started");
    const pixGenerated = await countEvent("pix_generated");
    const paymentSuccess = await countEvent("payment_success");

    const steps = [
      { label: "Visitante", count: visitors.count },
      { label: "Landing Page", count: landing },
      { label: "Início Cadastro", count: signupStarted },
      { label: "Conta Criada", count: signupCompleted },
      { label: "Trial Iniciado", count: trialStarted },
      { label: "Plano Escolhido", count: planSelected },
      { label: "Checkout Iniciado", count: checkoutStarted },
      { label: "PIX Gerado", count: pixGenerated },
      { label: "Pagamento", count: paymentSuccess },
    ];

    return steps.map((step, i) => {
      const prev = i > 0 ? steps[i - 1].count : step.count;
      const loss = Math.max(0, prev - step.count);
      const convRate = prev > 0 ? ((step.count / prev) * 100).toFixed(1) : "100";
      return { ...step, loss, conversionRate: parseFloat(convRate) };
    });
  }),

  // ── Checkout Analytics ────────────────────────────────────────────────────
  getCheckoutAnalytics: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    const countEvent = async (eventName: string) => {
      const [r] = await db.select({ count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)` })
        .from(analyticsEvents)
        .where(and(
          sql`${analyticsEvents.eventName} = ${eventName}`,
          gte(analyticsEvents.createdAt, start),
          lte(analyticsEvents.createdAt, end),
        ));
      return r.count;
    };

    const checkoutStarted = await countEvent("checkout_started");
    const pixGenerated = await countEvent("pix_generated");
    const paymentSuccess = await countEvent("payment_success");
    const paymentFailed = await countEvent("payment_failed");
    const firstLogin = await countEvent("login");

    return {
      checkoutStarted,
      pixGenerated,
      paymentSuccess,
      paymentFailed,
      firstLogin,
      abandonRate: checkoutStarted > 0
        ? (((checkoutStarted - paymentSuccess) / checkoutStarted) * 100).toFixed(1)
        : "0",
    };
  }),

  // ── Receita ───────────────────────────────────────────────────────────────
  getRevenueStats: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [mrr] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(analyticsRevenue)
      .where(gte(analyticsRevenue.createdAt, monthStart));

    const [periodRevenue] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(analyticsRevenue)
      .where(and(gte(analyticsRevenue.createdAt, start), lte(analyticsRevenue.createdAt, end)));

    const [ticket] = await db.select({ avg: sql<string>`COALESCE(AVG(amount), 0)` })
      .from(analyticsRevenue);

    let mrrVal = parseFloat(mrr?.total || "0");
    let pRevVal = parseFloat(periodRevenue?.total || "0");
    let avgTicketVal = parseFloat(ticket?.avg || "0");

    if (mrrVal === 0 && pRevVal === 0) {
      const [duesMrr] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
        .from(paymentDues)
        .where(and(or(eq(paymentDues.status, "pago"), sql`${paymentDues.paidAt} IS NOT NULL`), gte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.createdAt})`, monthStart.toISOString())));
      const [duesPeriod] = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
        .from(paymentDues)
        .where(and(
          or(eq(paymentDues.status, "pago"), sql`${paymentDues.paidAt} IS NOT NULL`),
          gte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.createdAt})`, start.toISOString()),
          lte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.createdAt})`, end.toISOString())
        ));
      const [duesAvg] = await db.select({ avg: sql<string>`COALESCE(AVG(amount), 0)` })
        .from(paymentDues)
        .where(and(
          or(eq(paymentDues.status, "pago"), sql`${paymentDues.paidAt} IS NOT NULL`),
          gte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.createdAt})`, start.toISOString()),
          lte(sql`COALESCE(${paymentDues.paidAt}, ${paymentDues.createdAt})`, end.toISOString())
        ));
      mrrVal = parseFloat(duesMrr.total);
      pRevVal = parseFloat(duesPeriod.total);
      avgTicketVal = parseFloat(duesAvg.avg);
    }

    return {
      mrr: mrrVal,
      arr: mrrVal * 12,
      periodRevenue: pRevVal,
      avgTicket: avgTicketVal,
      byPlan: [],
    };
  }),

  // ── Dispositivos e Browsers ───────────────────────────────────────────────
  getDeviceStats: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    let devices = await db.select({
      device: sql<string>`COALESCE(${analyticsSessions.deviceType}, 'unknown')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.deviceType)
      .orderBy(sql`COUNT(*) DESC`);

    if (devices.length === 0) {
      devices = await db.select({
        device: sql<string>`COALESCE(${analyticsEvents.deviceType}, 'unknown')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.deviceType)
        .orderBy(sql`COUNT(*) DESC`);
    }

    let browsers = await db.select({
      browser: sql<string>`COALESCE(${analyticsSessions.browser}, 'Outros')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.browser)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10);

    if (browsers.length === 0) {
      browsers = await db.select({
        browser: sql<string>`COALESCE(${analyticsEvents.browser}, 'Outros')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.browser)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(10);
    }

    let oses = await db.select({
      os: sql<string>`COALESCE(${analyticsSessions.os}, 'Outros')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.os)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10);

    if (oses.length === 0) {
      oses = await db.select({
        os: sql<string>`COALESCE(${analyticsEvents.os}, 'Outros')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.os)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(10);
    }

    const resolutions = await db.select({
      res: sql<string>`COALESCE(${analyticsSessions.screenRes}, 'Outros')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.screenRes)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10);

    return { devices, browsers, oses, resolutions };
  }),

  // ── Mapa Geográfico ───────────────────────────────────────────────────────
  getGeoStats: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    let byState = await db.select({
      state: sql<string>`COALESCE(${analyticsSessions.state}, 'Desconhecido')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
      unique: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.state)
      .orderBy(sql`COUNT(*) DESC`);

    if (byState.length === 0) {
      byState = await db.select({
        state: sql<string>`COALESCE(${analyticsEvents.state}, 'Desconhecido')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
        unique: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.visitorId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.state)
        .orderBy(sql`COUNT(*) DESC`);
    }

    let byCity = await db.select({
      city: sql<string>`COALESCE(${analyticsSessions.city}, 'Desconhecida')`,
      state: sql<string>`COALESCE(${analyticsSessions.state}, '')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.city, analyticsSessions.state)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(30);

    if (byCity.length === 0) {
      byCity = await db.select({
        city: sql<string>`COALESCE(${analyticsEvents.city}, 'Desconhecida')`,
        state: sql<string>`COALESCE(${analyticsEvents.state}, '')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.city, analyticsEvents.state)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(30);
    }

    let byCountry = await db.select({
      country: sql<string>`COALESCE(${analyticsSessions.country}, 'Brasil')`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.country)
      .orderBy(sql`COUNT(*) DESC`);

    if (byCountry.length === 0) {
      byCountry = await db.select({
        country: sql<string>`COALESCE(${analyticsEvents.country}, 'Brasil')`,
        count: sql<number>`CAST(COUNT(DISTINCT ${analyticsEvents.sessionId}) AS INT)`,
      })
        .from(analyticsEvents)
        .where(and(gte(analyticsEvents.createdAt, start), lte(analyticsEvents.createdAt, end)))
        .groupBy(analyticsEvents.country)
        .orderBy(sql`COUNT(*) DESC`);
    }

    // Mapeamento sem forçar dados fictícios no painel
    byState = byState.map(s => ({
      ...s,
      state: (!s.state || s.state === 'Desconhecido') ? 'Outros' : s.state
    }));

    byCity = byCity.map(c => ({
      ...c,
      city: (!c.city || c.city === 'Desconhecida') ? 'Outras' : c.city,
      state: (!c.state || c.state === 'Desconhecido') ? 'Outros' : c.state
    }));

    byCountry = byCountry.map(co => ({
      ...co,
      country: (!co.country || co.country === 'Desconhecido') ? 'Brasil' : co.country
    }));

    return { byState, byCity, byCountry };
  }),

  // ── Heatmap ───────────────────────────────────────────────────────────────
  getHeatmapPages: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return await db.select({
      pageUrlNormalized: analyticsHeatmap.pageUrlNormalized,
      totalPoints: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsHeatmap)
      .groupBy(analyticsHeatmap.pageUrlNormalized)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50);
  }),

  getHeatmapData: isSuperAdmin
    .input(z.object({ pageUrl: z.string(), eventType: z.enum(["click", "move", "scroll"]).default("click"), limit: z.number().default(2000) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const targetPath = extractPathname(input.pageUrl);

      return await db.select({
        xPercent: analyticsHeatmap.xPercent,
        yPercent: analyticsHeatmap.yPercent,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      })
        .from(analyticsHeatmap)
        .where(and(
          or(
            eq(analyticsHeatmap.pageUrlNormalized, targetPath),
            eq(analyticsHeatmap.pageUrlNormalized, input.pageUrl),
            eq(analyticsHeatmap.pageUrl, input.pageUrl)
          ),
          eq(analyticsHeatmap.eventType, input.eventType),
        ))
        .groupBy(
          sql`ROUND(${analyticsHeatmap.xPercent}::numeric, 0)`,
          sql`ROUND(${analyticsHeatmap.yPercent}::numeric, 0)`,
          analyticsHeatmap.xPercent,
          analyticsHeatmap.yPercent,
        )
        .limit(input.limit);
    }),

  // ── AI Insights ───────────────────────────────────────────────────────────
  getAIInsights: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    return await db.select()
      .from(analyticsAiInsights)
      .where(sql`${analyticsAiInsights.expiresAt} IS NULL OR ${analyticsAiInsights.expiresAt} > NOW()`)
      .orderBy(desc(analyticsAiInsights.generatedAt))
      .limit(20);
  }),

  // ── Campanhas UTM ─────────────────────────────────────────────────────────
  getCampaignStats: isSuperAdmin.input(DateRangeSchema).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { start, end } = getDateRange(input.preset, input.from, input.to);

    const campaigns = await db.select({
      campaign: sql<string>`COALESCE(${analyticsSessions.utmCampaign}, 'sem-campanha')`,
      source: sql<string>`COALESCE(${analyticsSessions.utmSource}, 'direto')`,
      medium: sql<string>`COALESCE(${analyticsSessions.utmMedium}, '')`,
      sessions: sql<number>`CAST(COUNT(*) AS INT)`,
      uniqueVisitors: sql<number>`CAST(COUNT(DISTINCT ${analyticsSessions.visitorId}) AS INT)`,
    })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.startedAt, start), lte(analyticsSessions.startedAt, end)))
      .groupBy(analyticsSessions.utmCampaign, analyticsSessions.utmSource, analyticsSessions.utmMedium)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50);

    const revenueData = await db.select({
      campaign: sql<string>`COALESCE(${analyticsRevenue.utmCampaign}, 'sem-campanha')`,
      revenue: sql<string>`COALESCE(SUM(amount), 0)`,
      conversions: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(analyticsRevenue)
      .where(and(gte(analyticsRevenue.createdAt, start), lte(analyticsRevenue.createdAt, end)))
      .groupBy(analyticsRevenue.utmCampaign);

    const revenueMap = Object.fromEntries(
      revenueData.map((r) => [r.campaign, { revenue: parseFloat(r.revenue), conversions: r.conversions }])
    );

    // Investimento das campanhas
    const investmentData = await db.select().from(analyticsCampaigns);
    const investMap = Object.fromEntries(
      investmentData.map((c) => [c.utmCampaign, parseFloat(String(c.investment ?? 0))])
    );

    return campaigns.map((c) => {
      const revenue = revenueMap[c.campaign]?.revenue ?? 0;
      const conversions = revenueMap[c.campaign]?.conversions ?? 0;
      const investment = investMap[c.campaign] ?? 0;
      const roi = investment > 0 ? (((revenue - investment) / investment) * 100).toFixed(1) : null;
      const cac = conversions > 0 && investment > 0 ? (investment / conversions).toFixed(2) : null;
      return { ...c, revenue, conversions, investment, roi, cac };
    });
  }),

  // ── Usuários online agora ─────────────────────────────────────────────────
  getOnlineUsers: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const twoMinAgo = new Date(Date.now() - 120_000);

    return await db.select()
      .from(analyticsOnline)
      .where(gte(analyticsOnline.lastPingAt, twoMinAgo))
      .orderBy(desc(analyticsOnline.lastPingAt))
      .limit(200);
  }),

  // Marcar insight como lido
  markInsightRead: isSuperAdmin
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(analyticsAiInsights).set({ isRead: true }).where(eq(analyticsAiInsights.id, input.id));
      return { ok: true };
    }),

  // Atualizar investimento de campanha
  updateCampaignInvestment: isSuperAdmin
    .input(z.object({ utmCampaign: z.string(), investment: z.number().min(0) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(analyticsCampaigns)
        .values({ utmSource: "manual", utmCampaign: input.utmCampaign, investment: String(input.investment) })
        .onConflictDoUpdate({ target: analyticsCampaigns.utmCampaign, set: { investment: String(input.investment) } });
      return { ok: true };
    }),

  // Auditoria de Segurança & Ataques - Visão Geral
  getSecurityOverview: isSuperAdmin
    .input(z.object({
      dateRange: z.enum(["7d", "30d", "90d", "all"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let days = 30;
      if (input?.dateRange === "7d") days = 7;
      if (input?.dateRange === "90d") days = 90;
      const startDate = input?.dateRange === "all" ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [reqStats] = await db
        .select({
          totalRequests: count(analyticsSecurityLogs.id),
          rateLimitBlocked: count(sql`CASE WHEN ${analyticsSecurityLogs.eventCategory} = 'blocked_rate_limit' THEN 1 END`),
          attacksDetected: count(sql`CASE WHEN ${analyticsSecurityLogs.eventCategory} = 'bot_scanner' OR ${analyticsSecurityLogs.severity} IN ('high', 'critical') THEN 1 END`),
        })
        .from(analyticsSecurityLogs)
        .where(gte(analyticsSecurityLogs.createdAt, startDate));

      const [uniqueIpStats] = await db
        .select({
          uniqueIps: count(sql`DISTINCT ${analyticsSecurityLogs.ip}`),
        })
        .from(analyticsSecurityLogs)
        .where(gte(analyticsSecurityLogs.createdAt, startDate));

      const topAttackedRoutes = await db
        .select({
          route: analyticsSecurityLogs.route,
          count: count(analyticsSecurityLogs.id),
        })
        .from(analyticsSecurityLogs)
        .where(and(
          gte(analyticsSecurityLogs.createdAt, startDate),
          or(
            eq(analyticsSecurityLogs.eventCategory, "bot_scanner"),
            eq(analyticsSecurityLogs.eventCategory, "blocked_rate_limit"),
            eq(analyticsSecurityLogs.severity, "high"),
            eq(analyticsSecurityLogs.severity, "critical")
          )
        ))
        .groupBy(analyticsSecurityLogs.route)
        .orderBy(desc(count(analyticsSecurityLogs.id)))
        .limit(5);

      const topSuspiciousIps = await db
        .select({
          ip: analyticsSecurityLogs.ip,
          count: count(analyticsSecurityLogs.id),
          highRiskCount: count(sql`CASE WHEN ${analyticsSecurityLogs.severity} IN ('high', 'critical') OR ${analyticsSecurityLogs.eventCategory} = 'blocked_rate_limit' THEN 1 END`),
        })
        .from(analyticsSecurityLogs)
        .where(gte(analyticsSecurityLogs.createdAt, startDate))
        .groupBy(analyticsSecurityLogs.ip)
        .orderBy(desc(count(analyticsSecurityLogs.id)))
        .limit(5);

      return {
        totalRequests: Number(reqStats?.totalRequests || 0),
        uniqueIps: Number(uniqueIpStats?.uniqueIps || 0),
        rateLimitBlocked: Number(reqStats?.rateLimitBlocked || 0),
        attacksDetected: Number(reqStats?.attacksDetected || 0),
        topAttackedRoutes,
        topSuspiciousIps,
      };
    }),

  // Tabela Paginada de Logs de Segurança e Rotas
  getSecurityLogs: isSuperAdmin
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      search: z.string().optional(),
      category: z.string().optional(),
      severity: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const offset = (input.page - 1) * input.limit;
      const conditions = [];

      if (input.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(
          sql`${analyticsSecurityLogs.ip} ILIKE ${term}`,
          sql`${analyticsSecurityLogs.route} ILIKE ${term}`,
          sql`${analyticsSecurityLogs.details} ILIKE ${term}`
        ));
      }

      if (input.category && input.category !== "all") {
        conditions.push(eq(analyticsSecurityLogs.eventCategory, input.category));
      }

      if (input.severity && input.severity !== "all") {
        conditions.push(eq(analyticsSecurityLogs.severity, input.severity));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ total: count(analyticsSecurityLogs.id) })
        .from(analyticsSecurityLogs)
        .where(whereClause);

      const logs = await db
        .select()
        .from(analyticsSecurityLogs)
        .where(whereClause)
        .orderBy(desc(analyticsSecurityLogs.createdAt))
        .limit(input.limit)
        .offset(offset);

      const total = Number(countResult?.total || 0);

      return {
        logs,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit) || 1,
      };
    }),

  // ── Escolas cadastradas (visão completa para o Super Admin) ─────────────
  getSchoolsOverview: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Organizações + nome do plano
    const orgs = await db.select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      planId: organizations.planId,
      planName: systemPlans.name,
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
      .from(organizations)
      .leftJoin(systemPlans, eq(systemPlans.id, organizations.planId))
      .orderBy(desc(organizations.createdAt));

    // 2. Alunos por escola (total e ativos)
    const studentCounts = await db.select({
      organizationId: students.organizationId,
      total: sql<number>`CAST(COUNT(*) AS INT)`,
      active: sql<number>`CAST(COUNT(*) FILTER (WHERE ${students.status} = 'ativo') AS INT)`,
    })
      .from(students)
      .where(isNotNull(students.organizationId))
      .groupBy(students.organizationId);

    // 3. Professores por escola (usuários com role='professor')
    const professorCounts = await db.select({
      organizationId: users.organizationId,
      total: sql<number>`CAST(COUNT(*) AS INT)`,
    })
      .from(users)
      .where(and(eq(users.role, "professor"), isNotNull(users.organizationId)))
      .groupBy(users.organizationId);

    // 4. Último login por escola (users.lastSignedIn)
    const lastSignedInByOrg = await db.select({
      organizationId: users.organizationId,
      lastSeen: sql<Date>`MAX(${users.lastSignedIn})`,
    })
      .from(users)
      .where(isNotNull(users.organizationId))
      .groupBy(users.organizationId);

    // 5. Heartbeat (analytics_online) por escola — último ping e quantos usuários online agora
    const pingByOrg = await db.select({
      organizationId: users.organizationId,
      lastPing: sql<Date>`MAX(${analyticsOnline.lastPingAt})`,
      onlineCount: sql<number>`CAST(COUNT(DISTINCT ${analyticsOnline.userId}) FILTER (WHERE ${analyticsOnline.lastPingAt} >= ${fiveMinAgo.toISOString()}) AS INT)`,
    })
      .from(analyticsOnline)
      .innerJoin(users, eq(users.id, analyticsOnline.userId))
      .where(and(isNotNull(users.organizationId), gte(analyticsOnline.lastPingAt, sevenDaysAgo)))
      .groupBy(users.organizationId);

    // 6. Donos das escolas (role='admin')
    const admins = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      organizationId: users.organizationId,
    })
      .from(users)
      .where(and(eq(users.role, "admin"), isNotNull(users.organizationId)))
      .orderBy(asc(users.id));

    const studentMap = new Map(studentCounts.map(r => [r.organizationId, r]));
    const professorMap = new Map(professorCounts.map(r => [r.organizationId, r.total]));
    const loginMap = new Map(lastSignedInByOrg.map(r => [r.organizationId, r.lastSeen]));
    const pingMap = new Map(pingByOrg.map(r => [r.organizationId, r]));
    const ownerMap = new Map<number | null, (typeof admins)[number]>();

    for (const a of admins) {
      if (!ownerMap.has(a.organizationId)) ownerMap.set(a.organizationId, a);
    }

    const schools = orgs.map(org => {
      const studentData = studentMap.get(org.id) ?? { total: 0, active: 0 };
      const lastPing = pingMap.get(org.id)?.lastPing ?? null;
      const lastLogin = loginMap.get(org.id) ?? null;

      let lastSeenAt: Date | null = null;
      if (lastPing && lastLogin) lastSeenAt = new Date(lastPing) > new Date(lastLogin) ? new Date(lastPing) : new Date(lastLogin);
      else if (lastPing) lastSeenAt = new Date(lastPing);
      else if (lastLogin) lastSeenAt = new Date(lastLogin);

      const onlineCount = pingMap.get(org.id)?.onlineCount ?? 0;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo: org.logo,
        planId: org.planId,
        planName: org.planName ?? org.planId,
        subscriptionStatus: org.subscriptionStatus,
        trialEndsAt: org.trialEndsAt,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        owner: ownerMap.get(org.id) ?? null,
        activeStudents: studentData.active,
        totalStudents: studentData.total,
        activeProfessors: professorMap.get(org.id) ?? 0,
        online: onlineCount > 0,
        onlineUsersCount: onlineCount,
        lastSeenAt,
      };
    });

    // Ordena por último acesso (mais recente primeiro)
    schools.sort((a, b) =>
      (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0)
    );

    return schools;
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL DO ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
export const analyticsRouter = router({
  event: analyticsEventRouter,
  query: analyticsQueryRouter,
});
