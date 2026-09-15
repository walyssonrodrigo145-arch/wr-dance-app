// ═══════════════════════════════════════════════════════════════════════════════
// RecurringExpenseEngine — Despesas Fixas automáticas no virar do mês
//
// Antes: as despesas recorrentes ('mensal') só eram geradas quando o usuário
// clicava em "Gerar despesas do mês" (tRPC expenses.generateRecurring) — quem
// esquecia, perdia o lançamento do mês.
//
// Agora: o job de automação chama runRecurringExpensesMaintenance() e, ao detectar
// troca de mês (fuso America/Sao_Paulo), clona as despesas fixas para o mês
// corrente. Idempotente: nunca duplica (dedup por descrição, case-insensitive,
// dentro do mês) — seguro contra restart e múltiplos processos.
// ═══════════════════════════════════════════════════════════════════════════════

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { debugLog } from "../_core/logger";
import { expenses } from "../../drizzle/schema";

// Guard por processo: roda a verificação no máximo 1×/mês (o job chama a cada minuto)
let lastAutoMonth = "";

/** Mês corrente no fuso de Brasília no formato YYYY-MM (padrão do sistema). */
export function getBRTMonthKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/** Clamp de dia do mês: dia 31 em mês de 30 dias → último dia válido. */
export function clampDayToMonth(year: number, month1Based: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

/** Reset do guard mensal (uso em testes). */
export function resetRecurringExpensesGuardForTests(): void {
  lastAutoMonth = "";
}

/**
 * Gera as despesas fixas do mês corrente (se ainda não rodou neste mês/processo).
 * Retorna quantas despesas foram criadas.
 */
export async function runRecurringExpensesMaintenance(now: Date = new Date()): Promise<number> {
  const monthKey = getBRTMonthKey(now);
  if (monthKey === lastAutoMonth) return 0;

  const db = await getDb();
  if (!db) return 0;

  // Templates: despesas recorrentes mensais (por organização/usuário criador)
  const templates = await db.select({
    organizationId: expenses.organizationId,
    userId: expenses.userId,
    description: expenses.description,
    supplier: expenses.supplier,
    account: expenses.account,
    recurrence: expenses.recurrence,
    amount: expenses.amount,
    date: expenses.date,
    category: expenses.category,
    notes: expenses.notes,
  }).from(expenses).where(eq(expenses.recurrence, "mensal"));

  lastAutoMonth = monthKey;
  if (templates.length === 0) return 0;

  // Agrupa por organizationId:userId (mesma semântica do gerador manual)
  interface RecurringTemplateRow {
    organizationId: number | null;
    userId: number;
    description: string;
    supplier: string | null;
    account: string | null;
    recurrence: string;
    amount: string;
    date: string;
    category: string;
    notes: string | null;
  }
  const groups = new Map<string, RecurringTemplateRow[]>();
  for (const t of templates) {
    const key = `${t.organizationId ?? "null"}:${t.userId}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const [yearStr, monthStr] = monthKey.split("-");
  const y = Number(yearStr);
  const m = Number(monthStr); // 1-based

  let count = 0;
  const groupEntries = Array.from(groups.entries());
  for (const [key, list] of groupEntries) {
    const [orgIdStr, userIdStr] = key.split(":");
    const orgId = orgIdStr === "null" ? null : Number(orgIdStr);
    const userId = Number(userIdStr);

    // Dedup: descrição (case-insensitive) já lançada neste mês — qualquer status
    const existing = await db.select({ description: expenses.description })
      .from(expenses)
      .where(and(
        orgId != null ? eq(expenses.organizationId, orgId) : undefined,
        eq(expenses.userId, userId),
        sql`EXTRACT(MONTH FROM ${expenses.date}) = ${m}`,
        sql`EXTRACT(YEAR FROM ${expenses.date}) = ${y}`
      ));
    const existingSet = new Set(existing.map((e) => e.description.toLowerCase()));

    const toInsert = list.filter((t) => !existingSet.has(t.description.toLowerCase()));
    for (const t of toInsert) {
      const oldDate = new Date(t.date + "T12:00:00");
      const day = clampDayToMonth(y, m, oldDate.getDate());
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      await db.insert(expenses).values({
        organizationId: t.organizationId,
        userId: t.userId,
        description: t.description,
        supplier: t.supplier,
        account: t.account,
        recurrence: t.recurrence,
        amount: t.amount,
        date: dateStr,
        category: t.category,
        status: "pendente",
        notes: t.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      count++;
    }
  }

  if (count > 0) {
    debugLog(`[DespesasFixas] ${count} despesa(s) recorrente(s) gerada(s) automaticamente para ${monthKey}.`);
  }
  return count;
}
