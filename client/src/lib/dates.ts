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