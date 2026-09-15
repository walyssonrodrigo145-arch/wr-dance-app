// ─── ContractExpiryEngine (Automação: fim de contrato) ─────────────────────────
// Cálculo puro e testável da condição de disparo da automação "contract_expiring".
// Dois modos configuráveis (por regra, via messageAutomationRules.triggerUnit):
//   - 'meses': dispara quando faltam <= X meses para o endDate do contrato.
//   - 'aulas': dispara quando restam <= X aulas no período do contrato.
// A condição NÃO depende de banco — recebe os valores já medidos, facilitando
// testes unitários.

export type ContractTriggerUnit = "meses" | "aulas";

/** Converte entrada (date do Postgres "YYYY-MM-DD" | Date) em Date local. */
function toDate(v: string | Date): Date {
  if (v instanceof Date) return new Date(v.getTime());
  return new Date(`${v}T12:00:00`); // meio-dia evita problemas de virada de fuso na data pura
}

/** Dias (arredondado para cima) entre `now` e `endDate`. Negativo se já passou. */
export function computeDaysRemaining(endDate: string | Date, now: Date = new Date()): number {
  const diff = toDate(endDate).getTime() - now.getTime();
  return Math.ceil(diff / 86_400_000);
}

/** Meses completos restantes entre `now` e `endDate` (baseado em calendário). */
export function computeMonthsRemaining(endDate: string | Date, now: Date = new Date()): number {
  const e = toDate(endDate);
  const n = now;
  let months = (e.getFullYear() - n.getFullYear()) * 12 + (e.getMonth() - n.getMonth());
  if (e.getDate() < n.getDate()) months -= 1; // ainda não completou o mês inteiro
  return months;
}

/** Total de aulas de um contrato derivado do plano (aulasPorSemana × duracaoMeses). */
export function computeTotalLessons(aulasPorSemana: number | null | undefined, duracaoMeses: number | null | undefined): number {
  const perWeek = Number(aulasPorSemana ?? 0);
  const months = Number(duracaoMeses ?? 0);
  if (perWeek <= 0 || months <= 0) return 0;
  return Math.round(perWeek * 4.333 * months);
}

/** Aulas restantes = total − aulas já dadas (nunca negativo). */
export function computeLessonsRemaining(totalLessons: number, lessonsGiven: number): number {
  return Math.max(0, Math.round(totalLessons) - Math.round(lessonsGiven));
}

/**
 * Avalia se a condição de disparo foi atingida.
 * - Meses: ainda restam dias (contrato não venceu) E mesesRestantes <= X.
 * - Aulas: aulasRestantes <= X (e o contrato ainda não venceu).
 */
export function isContractExpiryTriggered(
  unit: ContractTriggerUnit,
  value: number,
  daysRemaining: number,
  monthsRemaining: number,
  lessonsRemaining: number
): boolean {
  if (unit === "meses") {
    return daysRemaining > 0 && monthsRemaining <= value;
  }
  return daysRemaining > 0 && lessonsRemaining <= value;
}
