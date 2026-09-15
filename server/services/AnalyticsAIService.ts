/**
 * AnalyticsAIService — Gera insights automáticos usando IA (Groq/Gemini)
 * Roda em background, uma vez por dia.
 */

import { debugLog } from "../_core/logger";
import type { InsertAnalyticsAiInsight } from "../../drizzle/schema";

export async function generateAnalyticsInsights(): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const {
      analyticsEvents,
      analyticsSessions,
      analyticsRevenue,
      analyticsAiInsights,
    } = await import("../../drizzle/schema");
    const { sql, gte, desc } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return;

    const yesterday = new Date(Date.now() - 86400000);
    const lastWeek = new Date(Date.now() - 7 * 86400000);

    // Coleta métricas básicas
    const [sessionsToday] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(analyticsSessions).where(gte(analyticsSessions.startedAt, yesterday));

    const [revenueWeek] = await db.select({ total: sql<string>`COALESCE(SUM(amount), '0')` })
      .from(analyticsRevenue).where(gte(analyticsRevenue.createdAt, lastWeek));

    const [paymentSuccessCount] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(analyticsEvents)
      .where(sql`event_name = 'payment_success' AND created_at >= ${lastWeek.toISOString()}`);

    const [checkoutStartedCount] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(analyticsEvents)
      .where(sql`event_name = 'checkout_started' AND created_at >= ${lastWeek.toISOString()}`);

    const checkoutAbandon = checkoutStartedCount.count > 0
      ? (((checkoutStartedCount.count - paymentSuccessCount.count) / checkoutStartedCount.count) * 100).toFixed(1)
      : "0";

    // Prepara dados para a IA
    const metrics = {
      sessionsToday: sessionsToday.count,
      revenueWeek: parseFloat(revenueWeek.total),
      checkoutAbandonRate: parseFloat(checkoutAbandon),
      checkoutStarted: checkoutStartedCount.count,
      paymentSuccess: paymentSuccessCount.count,
    };

    // Gera insights com base nas métricas
    const insights: InsertAnalyticsAiInsight[] = [];

    // Insight de abandono de checkout
    if (metrics.checkoutAbandonRate > 60) {
      insights.push({
        insightType: "behavior",
        title: "Alta taxa de abandono no checkout",
        description: `${metrics.checkoutAbandonRate}% dos usuários que iniciaram o checkout não completaram o pagamento nos últimos 7 dias. ${metrics.checkoutStarted} iniciaram, ${metrics.paymentSuccess} converteram.`,
        severity: "critical",
        recommendation: "Verifique se o QR Code PIX está sendo exibido corretamente. Considere adicionar um temporizador visível e um botão de copiar chave PIX mais proeminente.",
        metricRef: "checkout_abandon_rate",
        metricValue: String(metrics.checkoutAbandonRate),
        expiresAt: new Date(Date.now() + 3 * 86400000),
      });
    } else if (metrics.checkoutAbandonRate > 40) {
      insights.push({
        insightType: "behavior",
        title: "Taxa de abandono no checkout acima da média",
        description: `${metrics.checkoutAbandonRate}% dos usuários abandonaram o checkout esta semana.`,
        severity: "warning",
        recommendation: "Considere adicionar gatilhos de urgência ou suporte via WhatsApp no momento do checkout.",
        metricRef: "checkout_abandon_rate",
        metricValue: String(metrics.checkoutAbandonRate),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
    }

    // Insight de receita
    if (metrics.revenueWeek > 0) {
      insights.push({
        insightType: "revenue",
        title: "Receita da semana registrada",
        description: `R$ ${metrics.revenueWeek.toFixed(2)} em receita confirmada nos últimos 7 dias com ${metrics.paymentSuccess} conversões.`,
        severity: "success",
        recommendation: "Continue monitorando campanhas ativas para identificar quais estão gerando mais receita.",
        metricRef: "revenue_week",
        metricValue: String(metrics.revenueWeek),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
    }

    // Insight de tráfego baixo
    if (metrics.sessionsToday < 10) {
      insights.push({
        insightType: "drop",
        title: "Tráfego abaixo do normal hoje",
        description: `Apenas ${metrics.sessionsToday} sessões registradas nas últimas 24 horas. Isso pode indicar problema com campanhas ou indexação.`,
        severity: "warning",
        recommendation: "Verifique o status das campanhas ativas no Instagram e Google. Confirme que o sistema de rastreamento está funcionando corretamente.",
        metricRef: "sessions_today",
        metricValue: String(metrics.sessionsToday),
        expiresAt: new Date(Date.now() + 86400000),
      });
    }

    // Persistir os novos insights
    if (insights.length > 0) {
      await db.insert(analyticsAiInsights).values(insights);
    }

    debugLog(`[AnalyticsAI] ${insights.length} insights gerados.`);
  } catch (err) {
    console.error("[AnalyticsAI] Erro ao gerar insights:", err);
  }
}
