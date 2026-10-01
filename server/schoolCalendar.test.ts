import { describe, expect, it } from "vitest";
import {
  SCHOOL_HOLIDAY_TYPES,
  SCHOOL_HOLIDAY_TYPE_IDS,
  buildHolidayMap,
  easterSunday,
  holidayTypeLabel,
  monthGrid,
  nationalHolidays,
} from "../shared/schoolCalendar";

describe("schoolCalendar (Calendário Escolar)", () => {
  it("tipos de marcação têm ids únicos e todos com label", () => {
    const ids = SCHOOL_HOLIDAY_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of SCHOOL_HOLIDAY_TYPES) expect(t.label.length).toBeGreaterThan(0);
    expect(SCHOOL_HOLIDAY_TYPE_IDS).toEqual(ids);
  });

  it("mapeia label com fallback", () => {
    expect(holidayTypeLabel("recesso")).toBe("Recesso");
    expect(holidayTypeLabel("feriado_municipal")).toBe("Feriado Municipal");
    expect(holidayTypeLabel(null)).toBe("Feriado");
    expect(holidayTypeLabel("x")).toBe("x");
  });

  it("calcula a Páscoa corretamente em anos conhecidos", () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });

  it("gera feriados nacionais com carnaval e sexta-feira santa em 2026", () => {
    const hs = nationalHolidays(2026);
    const porData = new Map(hs.map((h) => [h.date, h.name]));
    expect(porData.get("2026-01-01")).toBe("Confraternização Universal");
    expect(porData.get("2026-02-15")).toBe("Domingo de Carnaval");
    expect(porData.get("2026-02-16")).toBe("Segunda-feira de Carnaval");
    expect(porData.get("2026-02-17")).toBe("Carnaval");
    expect(porData.get("2026-04-03")).toBe("Sexta-feira Santa");
    expect(porData.get("2026-09-07")).toBe("Independência do Brasil");
    expect(porData.get("2026-12-25")).toBe("Natal");
    expect(hs).toHaveLength(13);
  });

  it("feriados do ano ficam todos dentro do ano", () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      for (const h of nationalHolidays(year)) {
        expect(h.date.startsWith(String(year))).toBe(true);
        expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("grade do mês começa no domingo e tem todos os dias", () => {
    const fev2026 = monthGrid(2026, 2);
    // 01/02/2026 é domingo -> sem células vazias no começo
    expect(fev2026[0]).toEqual({ day: 1, date: "2026-02-01" });
    expect(fev2026.filter(Boolean)).toHaveLength(28);

    const out2026 = monthGrid(2026, 10);
    // 01/10/2026 é quinta -> 4 células vazias
    expect(out2026.slice(0, 4).every((c) => c === null)).toBe(true);
    expect(out2026[4]).toEqual({ day: 1, date: "2026-10-01" });
    expect(out2026.filter(Boolean)).toHaveLength(31);
  });

  it("agrupa marcações por data para a agenda", () => {
    const map = buildHolidayMap([
      { date: "2026-07-01", name: "Recesso de julho", type: "recesso" },
      { date: "2026-07-01", name: "Ensaio geral", type: "evento" },
      { date: "2026-12-25", name: "Natal", type: "feriado_nacional" },
    ]);
    expect(map.get("2026-07-01")).toHaveLength(2);
    expect(map.get("2026-12-25")?.[0].name).toBe("Natal");
    expect(map.size).toBe(2);
  });
});
