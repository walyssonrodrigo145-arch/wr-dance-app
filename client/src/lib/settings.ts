// Configurações de escola / vencimentos — AUDIT FIX (elimina dueDaysOptions duplicado entre NovoAluno e Alunos)

export const DEFAULT_DUE_DAYS = [5, 10, 15, 20];

/** Interpreta a string de dias de vencimento configurada na escola ("5,10,15,20").
 *  Retorna lista ordenada e sem duplicatas de dias válidos (1-31); usa o padrão se nada for configurado. */
export function parseDueDaysOptions(raw: string | null | undefined): number[] {
  const parsed = (raw ?? DEFAULT_DUE_DAYS.join(","))
    .split(",")
    .map(d => Number(d.trim()))
    .filter(n => !isNaN(n) && n >= 1 && n <= 31);
  return parsed.length > 0 ? Array.from(new Set(parsed)).sort((a, b) => a - b) : [...DEFAULT_DUE_DAYS];
}