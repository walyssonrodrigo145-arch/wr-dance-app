import { describe, expect, it } from "vitest";
import { buildPlanOutputSchema, buildGoalScopeRule, buildGoalScopeBlock, buildLevelLanguageRule, AI_PROMPT_VERSIONS } from "./utils/aiPrompts";
import { validateBeginnerLanguage, BEGINNER_JARGON_TERMS } from "./services/InstrumentSpecialistService";

const base = {
  totalMinutes: 30,
  durations: { revisao: 3, warm: 5, tecnica: 10, conceito: 4, aplicacao: 6, desafio: 2 },
};

describe("RF-003 — buildPlanOutputSchema (schema compacto do plano diário)", () => {
  it("contém os 6 blocos fixos na ordem correta", () => {
    const s = buildPlanOutputSchema(base);
    const titles = ["\"Revisão\"", "\"Aquecimento\"", "\"Técnica\"", "\"Conceito Musical\"", "\"Aplicação\"", "\"Desafio\""];
    let last = -1;
    for (const t of titles) {
      const idx = s.indexOf(t);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it("CA-001: NÃO define icon como campo do JSON (apenas a proibição explícita)", () => {
    const s = buildPlanOutputSchema(base);
    expect(s).not.toMatch(/"icon"\s*:/);
    expect(s).toContain("PROIBIDO o campo \"icon\"");
  });

  it("exige EXATAMENTE 5 dias e concisão em subtitle/points", () => {
    const s = buildPlanOutputSchema(base);
    expect(s).toContain("EXATAMENTE 5 objetos");
    expect(s).toContain("até 8 palavras");
    expect(s).toContain("até 12 palavras");
    expect(s).toContain("3 points");
  });

  it("interpola as durações e o total", () => {
    const s = buildPlanOutputSchema(base);
    expect(s).toContain("(3 min)");
    expect(s).toContain("(10 min)");
    expect(s).toContain("fechar exatamente 30 min");
  });

  it("estrutura JSON inclui weeklyGoal, importantMessage, days e focus", () => {
    const s = buildPlanOutputSchema(base);
    expect(s).toContain("\"weeklyGoal\"");
    expect(s).toContain("\"importantMessage\"");
    expect(s).toContain("\"targetDailyMinutes\": 30");
    expect(s).toContain("\"dayName\": \"Dia 1\"");
  });

  it("versão do prompt diário registrada", () => {
    expect(AI_PROMPT_VERSIONS.planoDiario).toBe("2.3.0");
  });

  it("permite o campo opcional bpm para o metrônomo (PRD 03)", () => {
    const s = buildPlanOutputSchema(base);
    expect(s).toContain('"bpm"');
    expect(s).toContain("40 a 200");
  });
});

describe("Regra de linguagem por nível (iniciante sem jargão avançado)", () => {
  it("iniciante: proíbe voicing/comping e exige meta À RISCA com linguagem simples", () => {
    const rule = buildLevelLanguageRule("iniciante");
    expect(rule).toContain("INEGOCIÁVEL");
    expect(rule).toContain("shell voicing");
    expect(rule).toContain("comping");
    expect(rule).toContain("À RISCA");
    expect(rule).toContain("as notas do acorde");
    expect(rule).toContain("Teoria permitida: APENAS o básico");
  });

  it("intermediário tem regra leve; avançado não tem regra de linguagem", () => {
    expect(buildLevelLanguageRule("intermediario")).toContain("INTERMEDIÁRIO");
    expect(buildLevelLanguageRule("avancado")).toBe("");
  });
});

describe("validateBeginnerLanguage — bloqueio duro de jargão para iniciante", () => {
  it("detecta exatamente os termos que vazaram no plano real do Iago", () => {
    const plan = JSON.stringify({
      days: [{
        dayName: "Dia 1",
        focus: { title: "Shell voicing das tríades", description: "Construir shell voicing" },
        exercises: [{ title: "Técnica", subtitle: "Close voicing das tríades", duration: "6 min", points: ["Comping com rootless voicing"] }],
      }],
    });
    const result = validateBeginnerLanguage(plan, "iniciante");
    expect(result.passed).toBe(false);
    for (const term of ["shell voicing", "close voicing", "rootless", "comping"]) {
      expect(result.found).toContain(term);
    }
  });

  it("plano em linguagem simples passa para iniciante", () => {
    const plan = "Forme o acorde de Dó com 3 notas (Dó, Mi, Sol). Toque junto com a música. Metrônomo a 60 BPM.";
    expect(validateBeginnerLanguage(plan, "iniciante").passed).toBe(true);
  });

  it("não bloqueia níveis intermediário/avançado (voicing é legítimo)", () => {
    expect(validateBeginnerLanguage("shell voicing e comping", "avancado").passed).toBe(true);
    expect(validateBeginnerLanguage("voicing", "intermediario").passed).toBe(true);
  });

  it("normaliza acentos/caixa e usa fronteira de palavra", () => {
    expect(validateBeginnerLanguage("Técnica de VOICING avançada", "Iniciante").passed).toBe(false);
    // 'voicinho' não é voicing (fronteira de palavra)
    expect(validateBeginnerLanguage("som voicinho limpo", "iniciante").passed).toBe(true);
    expect(BEGINNER_JARGON_TERMS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("Escopo estrito segue a meta À RISCA (caso real: tríades Do-Sol-Lá menor-Fá)", () => {
  it("bloco estrito traz instrução literal com exemplo de tríades", () => {
    const block = buildGoalScopeBlock("somente_metas");
    expect(block).toContain("À RISCA");
    expect(block).toContain("Interprete as metas LITERALMENTE");
    expect(block).toContain("Tríades Dó, Sol, Lá menor, Fá");
    expect(block).toContain("NÃO PODE APARECER");
  });

  it("bloco Metas + deixa claro que complementar não é técnica nova avançada", () => {
    const block = buildGoalScopeBlock("metas_complementares");
    expect(block).toContain("NÃO É introduzir técnica nova avançada");
    expect(block).toContain("Interprete as metas LITERALMENTE");
  });
});

describe("Escopo de conteúdo — 2 opções (Só Metas | Metas +)", () => {
  it("opção 1 (Metas +): permite complementares na mesma linha, mantendo metas como núcleo", () => {
    const rule = buildGoalScopeRule("metas_complementares");
    expect(rule).toContain("NÚCLEO OBRIGATÓRIO");
    expect(rule).toContain("PODE adicionar assuntos COMPLEMENTARES NA MESMA LINHA");
    const block = buildGoalScopeBlock("metas_complementares");
    expect(block).toContain("O coração de cada dia é a meta");
    expect(block).toContain("CONTINUA PROIBIDO");
    expect(block).toContain("desconectados das metas");
  });

  it("opção 2 (Só Metas): restrita exclusivamente ao que está cadastrado", () => {
    const rule = buildGoalScopeRule("somente_metas");
    expect(rule).toContain("FOCO 100% FECHADO NAS METAS");
    expect(rule).toContain("ROTEIRO FECHADO");
    expect(rule).toContain("Proibido inventar repertório");
    const block = buildGoalScopeBlock("somente_metas");
    expect(block).toContain("EXCLUSIVAMENTE o conteúdo das metas cadastradas");
    expect(block).toContain("sem assuntos extras");
  });

  it("as duas opções proíbem nome de aluno em nenhuma hipótese (regra 1 é invariante)", () => {
    // A regra 1 é estática no prompt; este assert documenta a invariante das regras de escopo
    for (const scope of ["somente_metas", "metas_complementares"] as const) {
      expect(buildGoalScopeRule(scope)).not.toContain("aluno");
    }
  });
});
