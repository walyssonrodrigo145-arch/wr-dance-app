import { describe, expect, it } from "vitest";
import { addMonthsClamped, generateOccurrences, MAX_OCCURRENCES } from "../shared/recurrence";

// 2026-09-05 é SÁBADO (dayOfWeek 6)
const base = new Date(2026, 8, 5); // 05/09/2026
const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

describe("PRD_AGENDA_RECORRENCIA_002 — geração de ocorrências", () => {
  it("CA-001 quinzenal: 4 aulas de 15/15 dias, mesmo horário (05/09 → 17/10/2026)", () => {
    const occ = generateOccurrences("quinzenal", 4, base, [{ dayOfWeek: 6, time: "14:00" }], "14:00");
    expect(occ.map(o => fmt(o.date))).toEqual(["05/09/2026", "19/09/2026", "03/10/2026", "17/10/2026"]);
    expect(occ.every(o => o.date.getHours() === 14 && o.date.getMinutes() === 0)).toBe(true);
  });

  it("CA-002 mensal dia fixo com clamp: 31/jan → 28/fev (2027) → 31/mar", () => {
    const occ = generateOccurrences("mensal_fixo", 3, new Date(2027, 0, 31), [], "10:00");
    expect(occ.map(o => fmt(o.date))).toEqual(["31/01/2027", "28/02/2027", "31/03/2027"]);
  });

  it("CA-003 mensal 30 dias corridos: 05/09 → 05/10 → 04/11", () => {
    const occ = generateOccurrences("mensal30", 3, base, [{ dayOfWeek: 6, time: "09:00" }], "09:00");
    expect(occ.map(o => fmt(o.date))).toEqual(["05/09/2026", "05/10/2026", "04/11/2026"]);
  });

  it("mensal dia fixo ignora slots (usa data base + fallbackTime)", () => {
    const occ = generateOccurrences("mensal_fixo", 3, new Date(2027, 0, 10), [{ dayOfWeek: 1, time: "08:00" }], "15:30");
    expect(occ.every(o => o.slot === null)).toBe(true);
    expect(occ.every(o => o.date.getHours() === 15 && o.date.getMinutes() === 30)).toBe(true);
  });

  it("semanal mantém paridade: passo de 7 dias com 2 slots (sexta e sábado)", () => {
    const occ = generateOccurrences("semanal", 2, base, [
      { dayOfWeek: 5, time: "09:00" },
      { dayOfWeek: 6, time: "10:00" },
    ], "09:00");
    // base sábado: slot sexta alinha para 04/09 (dia seguinte... não: diaDiff = 5-6 = -1 → +7 = 6 dias → 11/09? não, 04/09 é ANTERIOR)
    // 05/09 é sábado: sexta=04/09 (dayDiff -1 → +7 = 6) → 11/09; sábado=05/09 (dayDiff 0)
    expect(occ.map(o => fmt(o.date))).toEqual(["11/09/2026", "05/09/2026", "18/09/2026", "12/09/2026"]);
  });

  it("slot em dia da semana ainda não ocorrido alinha para frente (base quinta, slot segunda)", () => {
    // 2026-09-03 é QUINTA (dayOfWeek 4); slot segunda (1) → dayDiff 4 → 07/09
    const occ = generateOccurrences("semanal", 2, new Date(2026, 8, 3), [{ dayOfWeek: 1, time: "09:00" }], "09:00");
    expect(occ.map(o => fmt(o.date))).toEqual(["07/09/2026", "14/09/2026"]);
  });

  it("29/fev (bissexto) + 12 meses → clamp para 28/fev (2029 não bissexto)", () => {
    expect(fmt(addMonthsClamped(new Date(2028, 1, 29), 12))).toBe("28/02/2029");
  });

  it("addMonthsClamped mantém dia normal (15/mai + 3 → 15/ago)", () => {
    expect(fmt(addMonthsClamped(new Date(2026, 4, 15), 3))).toBe("15/08/2026");
  });

  it("mensal_fixo: primeiro dia da série é a própria data base (k=0)", () => {
    const occ = generateOccurrences("mensal_fixo", 6, new Date(2026, 8, 20), [], "09:00");
    expect(fmt(occ[0].date)).toBe("20/09/2026");
    expect(occ.length).toBe(6);
  });

  it("sem slots informados, usa o dia da base (fallback)", () => {
    const occ = generateOccurrences("semanal", 2, base, [], "08:00");
    expect(occ.map(o => fmt(o.date))).toEqual(["05/09/2026", "12/09/2026"]);
    expect(occ.every(o => o.date.getHours() === 8)).toBe(true);
  });

  it("RN-004: limite de 200 ocorrências por geração é constante exportada", () => {
    expect(MAX_OCCURRENCES).toBe(200);
  });
});
