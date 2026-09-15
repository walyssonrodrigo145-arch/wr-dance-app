import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callAiJson, AiJsonError } from "./utils/aiJson";

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const baseOpts = {
  prompt: "Retorne JSON {name, age}",
  schema,
  credentials: { provider: "gemini" as const, apiKey: "test-key", model: "test-model", apiUrl: null },
  feature: "teste_unitario",
};

describe("RF-003 — callAiJson (contrato JSON padronizado)", () => {
  it("retorna o objeto validado na primeira tentativa", async () => {
    const invoke = vi.fn().mockResolvedValue('```json\n{"name":"Ana","age":30}\n```');
    const result = await callAiJson({ ...baseOpts, invoke });
    expect(result).toEqual({ name: "Ana", age: 30 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("faz retry quando a resposta não é JSON parseável e prospera na 2ª tentativa", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce("desculpe, não entendi")
      .mockResolvedValueOnce('{"name":"Bruno","age":25}');
    const result = await callAiJson({ ...baseOpts, invoke });
    expect(result).toEqual({ name: "Bruno", age: 25 });
    expect(invoke).toHaveBeenCalledTimes(2);
    // 2ª tentativa inclui aviso de formato no prompt
    const secondPrompt = invoke.mock.calls[1][0] as string;
    expect(secondPrompt).toContain("JSON inválido ou fora do schema");
  });

  it("faz retry quando o JSON está fora do schema e lança erro orientativo ao persistir", async () => {
    const invoke = vi.fn().mockResolvedValue('{"name":123}');
    await expect(callAiJson({ ...baseOpts, invoke, maxAttempts: 2 })).rejects.toBeInstanceOf(AiJsonError);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("erro orientativo menciona a feature e não vaza detalhes técnicos", async () => {
    const invoke = vi.fn().mockResolvedValue("lixo");
    await expect(callAiJson({ ...baseOpts, invoke, maxAttempts: 1 })).rejects.toThrow("teste_unitario");
  });

  it("CA-001/RNF-005: orçamento de tempo interrompe retries antecipadamente", async () => {
    const invoke = vi.fn().mockResolvedValue("sempre inválido");
    await callAiJson({ ...baseOpts, invoke, maxAttempts: 5, budgetMs: 1 }).catch(() => {});
    // Com budgetMs=1, nenhuma nova tentativa tem folga (25s de estimativa) — só 1 chamada
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("extrai JSON cercado de texto (parsing defensivo)", async () => {
    const invoke = vi.fn().mockResolvedValue('Aqui está: {"name":"Carla","age":40} — espero que ajude!');
    const result = await callAiJson({ ...baseOpts, invoke });
    expect(result).toEqual({ name: "Carla", age: 40 });
  });
});
