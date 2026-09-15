// Utilitários monetários compartilhados — AUDIT FIX (integridade financeira no client)
// Padrão correto já usado em NovoAluno.tsx; centralizado aqui para eliminar os
// parsers frágeis (`replace(',', '.')` e `Number(form.amount)`) que geravam
// perda de magnitude ("1.234,56" → 1.234) ou NaN.

/**
 * Converte valores de entrada do usuário (ou strings decimais do banco)
 * em número. Aceita "R$ 1.234,56", "1.234,56", "1234.56", 1234.56.
 * Retorna 0 para valores inválidos/vazios.
 */
export function parseBRL(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const clean = String(val).replace(/R\$\s*/g, "").replace(/\s/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formata número como moeda pt-BR (R$ 1.234,56) */
export function formatBRL(val: number | string | null | undefined): string {
  const num = parseBRL(val);
  return brlFormatter.format(num);
}

/** Texto usado quando o botão "olhinho" está ativo (ocultar valores financeiros). */
export const HIDDEN_MONEY = "R$ ••••";

/**
 * Formata moeda respeitando o "olhinho": quando `hidden` é true, retorna o
 * placeholder mascarado em vez do valor real (RN-013).
 */
export function formatBRLMasked(val: number | string | null | undefined, hidden: boolean): string {
  return hidden ? HIDDEN_MONEY : formatBRL(val);
}
