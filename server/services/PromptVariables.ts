// ─── PromptVariables ─────────────────────────────────────────────────────────
// Substituição de variáveis {{...}} nos prompts gerenciados (PRD 02 §37).
// Puro e testável. Variáveis desconhecidas permanecem intactas no texto.
// A lista de variáveis documentadas vive em shared/promptVariables.ts (fonte única).

import { PROMPT_VARIABLE_LIST } from "@shared/promptVariables";
export { PROMPT_VARIABLE_LIST };

export interface PromptVariableValues {
  alunoNome?: string;
  alunoInstrumento?: string;
  alunoNivel?: string;
  alunoObjetivo?: string;
  alunoHistorico?: string;
  alunoDificuldades?: string;
  professorNome?: string;
  escolaNome?: string;
  planoAnterior?: string;
  data?: string;
}

const VARIABLE_KEY_MAP: Record<string, keyof PromptVariableValues> = {
  "aluno.nome": "alunoNome",
  "aluno.instrumento": "alunoInstrumento",
  "aluno.nivel": "alunoNivel",
  "aluno.objetivo": "alunoObjetivo",
  "aluno.historico": "alunoHistorico",
  "aluno.dificuldades": "alunoDificuldades",
  "professor.nome": "professorNome",
  "escola.nome": "escolaNome",
  "plano.anterior": "planoAnterior",
  data: "data",
};

export const PROMPT_VARIABLE_DOCS = PROMPT_VARIABLE_LIST;

/** Substitui todas as {{variáveis}} suportadas; desconhecidas ficam intactas. */
export function renderPromptVariables(content: string, values: PromptVariableValues): string {
  if (!content) return "";
  return content.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    const mapped = VARIABLE_KEY_MAP[key];
    if (!mapped) return match;
    const value = values[mapped];
    if (value === undefined || value === null || String(value).trim() === "") return match;
    // Remove chaves internas para não quebrar o template
    return String(value).replace(/[{}]/g, "").trim();
  });
}

/** Preenche automaticamente {{data}} quando não informada. */
export function defaultPromptVariables(extra: Partial<PromptVariableValues> = {}): PromptVariableValues {
  return {
    data: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    ...extra,
  };
}
