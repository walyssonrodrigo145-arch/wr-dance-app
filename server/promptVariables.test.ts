import { describe, expect, it } from "vitest";
import { renderPromptVariables, defaultPromptVariables } from "./services/PromptVariables";
import { PROMPT_VARIABLE_LIST } from "@shared/promptVariables";

describe("renderPromptVariables (PRD 02 §37)", () => {
  it("substitui todas as variáveis do contexto do aluno", () => {
    const content = "Aluno {{aluno.nome}} estuda {{aluno.instrumento}} no nível {{aluno.nivel}} com objetivo {{aluno.objetivo}}. Data: {{data}}.";
    const out = renderPromptVariables(content, {
      alunoNome: "Bruno",
      alunoInstrumento: "Teclado",
      alunoNivel: "iniciante",
      alunoObjetivo: "tocar Mary had a little lamb",
      data: "05/09/2026",
    });
    expect(out).toContain("Aluno Bruno estuda Teclado no nível iniciante");
    expect(out).toContain("Data: 05/09/2026");
    expect(out).not.toContain("{{aluno.nome}}");
  });

  it("mantém variáveis desconhecidas intactas", () => {
    const content = "Use {{variavel.desconhecida}} e {{aluno.nome}}.";
    const out = renderPromptVariables(content, { alunoNome: "Ana" });
    expect(out).toContain("{{variavel.desconhecida}}");
    expect(out).toContain("Ana");
  });

  it("mantém a variável quando o valor não foi informado", () => {
    const out = renderPromptVariables("Meta: {{aluno.objetivo}}", { alunoNome: "Ana" });
    expect(out).toContain("{{aluno.objetivo}}");
  });

  it("aceita espaços dentro das chaves e remove chaves injetadas no valor", () => {
    expect(renderPromptVariables("{{ aluno.nome }}", { alunoNome: "Lu" })).toBe("Lu");
    expect(renderPromptVariables("{{escola.nome}}", { escolaNome: "Es{{cola}}" } as any)).toBe("Escola");
  });

  it("defaultPromptVariables preenche a data atual", () => {
    const v = defaultPromptVariables();
    expect(v.data).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("a lista compartilhada de variáveis está documentada com token e descrição", () => {
    expect(PROMPT_VARIABLE_LIST.length).toBeGreaterThanOrEqual(10);
    for (const v of PROMPT_VARIABLE_LIST) {
      expect(v.token).toMatch(/^\{\{[a-zA-Z0-9_.]+\}\}$/);
      expect(v.description.length).toBeGreaterThan(3);
    }
  });
});
