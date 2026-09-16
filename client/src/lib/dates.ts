// Formatação de datas centralizada — AUDIT FIX (elimina safeFormat duplicado entre páginas)
import { format, isValid } from "date-fns";

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