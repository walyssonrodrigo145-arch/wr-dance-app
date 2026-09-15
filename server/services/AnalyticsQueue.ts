/**
 * AnalyticsQueue — Fila assíncrona para processamento de eventos do analytics.
 * 
 * Arquitetura:
 * - Eventos chegam via POST /api/analytics/track ou /batch
 * - São colocados numa fila em memória (circular buffer)
 * - Um worker drena a fila a cada 2s em lotes de até 100 eventos
 * - Garante que o Analytics nunca impacte a latência da API principal
 */

import { debugLog } from "../_core/logger";
import type { InsertAnalyticsEvent, InsertAnalyticsSession, InsertAnalyticsVisitor } from "../../drizzle/schema";

type QueuedEvent = InsertAnalyticsEvent;

interface QueueStats {
  processed: number;
  dropped: number;
  inQueue: number;
  lastDrainAt: Date | null;
}

const MAX_QUEUE_SIZE = 10_000;
const DRAIN_INTERVAL_MS = 2_000;
const BATCH_SIZE = 100;

class AnalyticsQueue {
  private queue: QueuedEvent[] = [];
  private stats: QueueStats = {
    processed: 0,
    dropped: 0,
    inQueue: 0,
    lastDrainAt: null,
  };
  private drainTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.drainTimer = setInterval(() => this.drain(), DRAIN_INTERVAL_MS);
    debugLog("[AnalyticsQueue] Worker iniciado. Intervalo:", DRAIN_INTERVAL_MS, "ms");
  }

  stop() {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    this.isRunning = false;
  }

  push(event: QueuedEvent): boolean {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.stats.dropped++;
      console.warn("[AnalyticsQueue] Fila cheia! Evento descartado. Total descartados:", this.stats.dropped);
      return false;
    }
    this.queue.push(event);
    this.stats.inQueue = this.queue.length;
    return true;
  }

  pushMany(events: QueuedEvent[]): number {
    let pushed = 0;
    for (const event of events) {
      if (this.push(event)) pushed++;
    }
    return pushed;
  }

  private async drain() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, BATCH_SIZE);
    this.stats.inQueue = this.queue.length;

    try {
      const { getDb } = await import("../db");
      const { analyticsEvents } = await import("../../drizzle/schema");
      
      const db = await getDb();
      if (!db) {
        // Devolve os eventos à fila se o DB não estiver disponível
        this.queue.unshift(...batch);
        this.stats.inQueue = this.queue.length;
        return;
      }

      await db.insert(analyticsEvents).values(batch).onConflictDoNothing();

      // Upsert automático das sessões e visitantes para os cartões de métricas do Analytics
      const sessionMap = new Map<string, any>();
      const visitorSet = new Set<string>();

      for (const ev of batch) {
        if (ev.visitorId) visitorSet.add(ev.visitorId);
        if (ev.sessionId && !sessionMap.has(ev.sessionId)) {
          sessionMap.set(ev.sessionId, {
            sessionId: ev.sessionId,
            visitorId: ev.visitorId,
            userId: ev.userId,
            startedAt: ev.createdAt || new Date(),
            deviceType: ev.deviceType || "unknown",
            os: ev.os,
            browser: ev.browser,
            screenRes: ev.screenRes,
            referrer: ev.referrer,
            utmSource: ev.utmSource,
            utmMedium: ev.utmMedium,
            utmCampaign: ev.utmCampaign,
            utmContent: ev.utmContent,
            utmTerm: ev.utmTerm,
            country: ev.country,
            state: ev.state,
            city: ev.city,
          });
        }
      }

      Array.from(visitorSet).forEach((vId) => {
        upsertAnalyticsVisitor({ visitorId: vId }).catch(() => {});
      });

      Array.from(sessionMap.values()).forEach((sess) => {
        upsertAnalyticsSession(sess).catch(() => {});
      });
      
      this.stats.processed += batch.length;
      this.stats.lastDrainAt = new Date();
    } catch (err) {
      console.error("[AnalyticsQueue] Erro ao persistir lote:", err);
      // Devolve à fila para retry
      if (this.queue.length < MAX_QUEUE_SIZE - batch.length) {
        this.queue.unshift(...batch);
        this.stats.inQueue = this.queue.length;
      } else {
        this.stats.dropped += batch.length;
      }
    }
  }

  getStats(): QueueStats {
    return { ...this.stats, inQueue: this.queue.length };
  }
}

// Singleton global
export const analyticsQueue = new AnalyticsQueue();

// ── Helpers para upsert de sessões e visitantes ───────────────────────────────

export async function upsertAnalyticsVisitor(data: InsertAnalyticsVisitor) {
  try {
    const { getDb } = await import("../db");
    const { analyticsVisitors } = await import("../../drizzle/schema");
    const { sql } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    await db.insert(analyticsVisitors)
      .values(data)
      .onConflictDoUpdate({
        target: analyticsVisitors.visitorId,
        set: {
          lastSeenAt: new Date(),
          totalSessions: sql`${analyticsVisitors.totalSessions} + 1`,
        },
      });
  } catch (err) {
    console.error("[AnalyticsQueue] Erro ao upsert visitante:", err);
  }
}

export async function upsertAnalyticsSession(data: InsertAnalyticsSession) {
  try {
    const { getDb } = await import("../db");
    const { analyticsSessions } = await import("../../drizzle/schema");

    const db = await getDb();
    if (!db) return;

    await db.insert(analyticsSessions)
      .values(data)
      .onConflictDoUpdate({
        target: analyticsSessions.sessionId,
        set: {
          endedAt: data.endedAt ?? undefined,
          durationSec: data.durationSec ?? undefined,
          pageCount: data.pageCount ?? 1,
          isBounce: data.isBounce ?? true,
        },
      });
  } catch (err) {
    console.error("[AnalyticsQueue] Erro ao upsert sessão:", err);
  }
}

export async function upsertOnlineUser(data: {
  sessionId: string;
  visitorId: string;
  userId?: number | null;
  userName?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  deviceType?: "desktop" | "tablet" | "mobile" | "tv" | "unknown" | null;
  browser?: string | null;
  os?: string | null;
  screenRes?: string | null;
  utmSource?: string | null;
  referrer?: string | null;
  ipMasked?: string | null;
}) {
  try {
    const { getDb } = await import("../db");
    const { analyticsOnline } = await import("../../drizzle/schema");
    const { sql } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    await db.insert(analyticsOnline)
      .values({ ...data, lastPingAt: new Date(), enteredAt: new Date() })
      .onConflictDoUpdate({
        target: analyticsOnline.sessionId,
        set: {
          userId: data.userId ?? null,
          userName: data.userName ?? null,
          pageUrl: data.pageUrl,
          pageTitle: data.pageTitle,
          lastPingAt: sql`NOW()`,
        },
      });

    // Remove usuários offline (sem ping há mais de 2 minutos)
    await db.delete(analyticsOnline).where(
      sql`${analyticsOnline.lastPingAt} < NOW() - INTERVAL '2 minutes'`
    );
  } catch (err) {
    console.error("[AnalyticsQueue] Erro ao upsert online:", err);
  }
}

export async function recordAnalyticsRevenue(data: {
  organizationId?: number | null;
  sessionId?: string | null;
  visitorId?: string | null;
  userId?: number | null;
  amount: string | number;
  planName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  createdAt?: Date;
}) {
  try {
    const { getDb } = await import("../db");
    const { analyticsRevenue, analyticsConversions } = await import("../../drizzle/schema");

    const db = await getDb();
    if (!db) return;

    const created = data.createdAt || new Date();
    const strAmount = String(data.amount);

    await db.insert(analyticsRevenue).values({
      organizationId: data.organizationId || 1,
      sessionId: data.sessionId ?? null,
      visitorId: data.visitorId ?? null,
      userId: data.userId ?? null,
      amount: strAmount,
      planName: data.planName || "Mensalidade",
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      country: data.country ?? "Brasil",
      state: data.state ?? null,
      city: data.city ?? null,
      createdAt: created,
    });

    if (data.sessionId) {
      await db.insert(analyticsConversions).values({
        sessionId: data.sessionId,
        visitorId: data.visitorId || data.sessionId,
        userId: data.userId ?? null,
        reachedPayment: true,
        utmSource: data.utmSource ?? null,
        utmCampaign: data.utmCampaign ?? null,
        createdAt: created,
      }).onConflictDoNothing();
    }

    analyticsQueue.push({
      sessionId: data.sessionId || "server_event",
      visitorId: data.visitorId || "server_visitor",
      userId: data.userId ?? null,
      eventName: "payment_success",
      value: strAmount,
      createdAt: created,
    });
  } catch (err) {
    console.error("[AnalyticsQueue] Erro ao registrar receita no analytics:", err);
  }
}

export async function syncHistoricalRevenueToAnalytics() {
  // DESATIVADO: Esta função sincronizava paymentDues (mensalidades de alunos das escolas)
  // para analyticsRevenue (receita SaaS da plataforma MusicPro), misturando dados incorretos.
  // A tabela analyticsRevenue deve conter APENAS cobranças de planos das escolas que usam o MusicPro,
  // não mensalidades internas dos alunos.
  debugLog("[AnalyticsQueue] syncHistoricalRevenueToAnalytics DESATIVADO — dados de paymentDues não pertencem ao analytics SaaS.");
}

