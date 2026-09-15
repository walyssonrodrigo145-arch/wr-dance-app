// ─── Variáveis de prompts de IA (PRD 02 §37) ─────────────────────────────────
// Fonte única compartilhada entre server (substituição) e client (chips na UI).

export interface PromptVariableDoc {
  token: string;
  description: string;
}

export const PROMPT_VARIABLE_LIST: PromptVariableDoc[] = [
  { token: "{{aluno.nome}}", description: "Nome do aluno" },
  { token: "{{aluno.instrumento}}", description: "Instrumento do aluno" },
  { token: "{{aluno.nivel}}", description: "Nível do aluno (iniciante/intermediário/avançado)" },
  { token: "{{aluno.objetivo}}", description: "Objetivo/meta atual do aluno" },
  { token: "{{aluno.historico}}", description: "Histórico resumido de conteúdos estudados" },
  { token: "{{aluno.dificuldades}}", description: "Dificuldades observadas pelo professor" },
  { token: "{{professor.nome}}", description: "Nome do professor" },
  { token: "{{escola.nome}}", description: "Nome da escola" },
  { token: "{{plano.anterior}}", description: "Resumo do plano anterior" },
  { token: "{{data}}", description: "Data atual (pt-BR)" },
];
