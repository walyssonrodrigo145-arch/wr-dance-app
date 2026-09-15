/**
 * Testes das regras financeiras puras extraídas para server/routers/helpers.ts (AUDIT F5).
 * Protege buildDueDateSeries (série de vencimentos por periodicidade + ajuste fim de mês)
 * e markOverdueRows (classificação atrasado) — lógica que antes era copiada em 2+ proceduras.
 */
import { describe, expect, it } from "vitest";
import { buildDueDateSeries, markOverdueRows } from "./routers/helpers";

describe("buildDueDateSeries", () => {
  it("gera série mensal correta (3 meses, vencimento dia 10)", () => {
    const r = buildDueDateSeries(1, 2026, 3, 10, "mensal");
    expect(r).toEqual([
      { year: 2026, month: 1, dueDateISO: "2026-01-10" },
      { year: 2026, month: 2, dueDateISO: "2026-02-10" },
      { year: 2026, month: 3, dueDateISO: "2026-03-10" },
    ]);
  });

  it("ajusta dia 31 em fevereiro para o último dia válido (28 em 2026)", () => {
    const r = buildDueDateSeries(2, 2026, 1, 31, "mensal");
    expect(r[0]).toEqual({ year: 2026, month: 2, dueDateISO: "2026-02-28" });
  });

  it("respeita a periodicidade (bimestral pula 1 mês a cada iteração)", () => {
    const r = buildDueDateSeries(1, 2026, 6, 15, "bimestral");
    expect(r.map(d => `${d.year}-${d.month}`)).toEqual(["2026-1", "2026-3", "2026-5"]);
  });

  it("cruza o ano corretamente (dezembro → janeiro do ano seguinte)", () => {
    const r = buildDueDateSeries(12, 2026, 2, 5, "mensal");
    expect(r).toEqual([
      { year: 2026, month: 12, dueDateISO: "2026-12-05" },
      { year: 2027, month: 1, dueDateISO: "2027-01-05" },
    ]);
  });
});

describe("markOverdueRows", () => {
  it("marca como atrasado apenas pendentes com vencimento antes de hoje", () => {
    const rows = [
      { status: "pendente", dueDate: "2025-01-01" as any },
      { status: "pago", dueDate: "2025-01-01" as any },
      { status: "pendente", dueDate: "2030-01-01" as any },
    ];
    const out = markOverdueRows(rows as any, "2026-08-18");
    expect(out.map(r => r.status)).toEqual(["atrasado", "pago", "pendente"]);
  });

  it("não altera status de mensalidade atrasada já persistida", () => {
    const rows = [{ status: "atrasado", dueDate: "2025-01-01" as any }];
    const out = markOverdueRows(rows as any, "2026-08-18");
    expect(out[0].status).toBe("atrasado");
  });
});