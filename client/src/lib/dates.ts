// Formatação de datas centralizada — AUDIT FIX (elimina safeFormat duplicado entre páginas)
import { format, isValid } from "date-fns";

export { format };

/** Formata data de forma segura (nunca lança erro; retorna "Inválido" se a data não puder ser interpretada). */
export function safeFormat(date: unknown, formatStr: string, options?: Parameters<typeof format>[2]): string {
  try {
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : (date as Date);
    if (!isValid(d)) return "Inválido";
    return format(d, formatStr, options);
  } catch {
    return "Inválido";
  }
}

/**
 * Formata datas "puras" (YYYY-MM-DD, colunas `date` do banco) sem sofrer
 * deslocamento de timezone. `new Date("2026-09-15")` é meia-noite UTC e no
 * Brasil (UTC−3) exibiria 14/09 — este helper interpreta como data local.
 */
export function formatDateOnly(value: unknown, formatStr = "dd/MM/yyyy"): string {
  if (value === null || value === undefined || value === "") return "Inválido";
  if (value instanceof Date) return safeFormat(value, formatStr);
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00)/);
  if (match) {
    const [, year, month, day] = match;
    return safeFormat(new Date(Number(year), Number(month) - 1, Number(day)), formatStr);
  }
  return safeFormat(value, formatStr);
}

/** Situação CALCULADA pelas datas (distinta do status manual do evento). */
export function eventSituation(startsAt: unknown, endsAt: unknown): { label: string; className: string } {
  const start = startsAt ? new Date(String(startsAt)) : null;
  const end = endsAt ? new Date(String(endsAt)) : null;
  const now = new Date();
  if (!start || !isValidSafe(start)) return { label: "Sem data", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30" };
  if (start > now) return { label: "Futuro", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" };
  if (end && isValidSafe(end) && end >= now) return { label: "Em andamento", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" };
  return { label: "Datas encerradas", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30" };
}

function isValidSafe(d: Date): boolean {
  try {
    return isValid(d);
  } catch {
    return false;
  }
}

/**
 * O evento ocupa MAIS DE UM DIA? Compara as DATAS (ano-mês-dia) no fuso local
 * do navegador — não basta existir término nem horários diferentes no mesmo dia.
 * Sem término válido → false (nunca inventa duração).
 */
export function isMultiDay(startsAt: unknown, endsAt: unknown): boolean {
  if (!startsAt || !endsAt) return false;
  const start = new Date(String(startsAt));
  const end = new Date(String(endsAt));
  if (!isValidSafe(start) || !isValidSafe(end)) return false;
  return format(start, "yyyy-MM-dd") !== format(end, "yyyy-MM-dd");
}

/**
 * Período do evento para cartão e detalhe — MESMA fonte nas duas telas.
 * Mesmo dia: "02/10/2026 · 09:00–22:00". Vários dias: "02/10/2026 09:00 → 05/10/2026 22:00".
 */
export function formatEventPeriod(startsAt: unknown, endsAt: unknown): string {
  const start = startsAt ? new Date(String(startsAt)) : null;
  const end = endsAt ? new Date(String(endsAt)) : null;
  const validEnd = end && isValidSafe(end) ? end : null;
  if (!start || !isValidSafe(start)) return "—";
  if (validEnd && !isMultiDay(start, validEnd)) {
    return `${format(start, "dd/MM/yyyy")} · ${format(start, "HH:mm")}–${format(validEnd, "HH:mm")}`;
  }
  if (validEnd) {
    return `${format(start, "dd/MM/yyyy")} ${format(start, "HH:mm")} → ${format(validEnd, "dd/MM/yyyy")} ${format(validEnd, "HH:mm")}`;
  }
  return `${format(start, "dd/MM/yyyy")} · ${format(start, "HH:mm")}`;
}