// ─── CustomSpecialistService ─────────────────────────────────────────────────
// Bloco de prompt para especialistas de IA personalizados (tabela ai_specialists).
// Mantém o mesmo formato do bloco dos especialistas padrão (InstrumentSpecialistService).

import type { AiSpecialist } from "../../drizzle/schema";

export function buildCustomSpecialistPromptBlock(s: AiSpecialist): string {
  const system = (s.systemPrompt || "").trim();
  const pedagogical = (s.pedagogicalInstructions || "").trim();
  const technical = (s.technicalKnowledge || "").trim();
  const description = (s.description || "").trim();

  return `
## IDENTIDADE DO ESPECIALISTA: ${(s.name || "ESPECIALISTA").toUpperCase()} (personalizado — área: ${s.area || "geral"})
${description ? `Descrição: ${description}` : ""}
${system || "Você é um professor especialista neste instrumento/área. Use apenas terminologia correta deste instrumento e NUNCA termos de outros instrumentos."}

## INSTRUÇÕES PEDAGÓGICAS
${pedagogical || "- Ensine de forma progressiva, do simples ao avançado, respeitando o nível do aluno."}

## CONHECIMENTOS TÉCNICOS DO INSTRUMENTO
${technical || "- Use a terminologia técnica real do instrumento (técnicas, exercícios e vocabulário próprios)."}`.trim();
}

/** Normaliza o texto do especialista personalizado para validação (usado como "geral" — sem termos proibidos). */
export function sanitizeCustomSpecialistText(text: string): string {
  return String(text || "").slice(0, 8000);
}
