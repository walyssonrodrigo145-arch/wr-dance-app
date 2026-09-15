import { describe, it, expect } from "vitest";
import {
  generateDaySlots,
  parseHHMM,
  minutesToHHMM,
  parseSchoolHours,
} from "./services/ScheduleAvailabilityService";
import { resolveVisibleWidgets, parseWidgetList, ALL_WIDGET_IDS } from "@shared/dashboardWidgets";

describe("ScheduleAvailabilityService — geração de slots (RF-001 / RN-002)", () => {
  it("gera slots de 60 min em 08:00-18:00 (10 slots)", () => {
    const slots = generateDaySlots({ active: true, start: "08:00", end: "18:00" }, 60);
    expect(slots.map((s) => s.time)).toEqual([
      "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
    ]);
  });

  it("gera slots de 30 min em 08:00-12:00 (8 slots)", () => {
    const slots = generateDaySlots({ active: true, start: "08:00", end: "12:00" }, 30);
    expect(slots).toHaveLength(8);
    expect(slots[0].time).toBe("08:00");
    expect(slots[7].time).toBe("11:30");
  });

  it("não gera slot quando a duração não cabe no expediente", () => {
    const slots = generateDaySlots({ active: true, start: "08:00", end: "08:30" }, 60);
    expect(slots).toHaveLength(0);
  });

  it("ignora a sobra que não completa uma aula (RN-002)", () => {
    // 08:00-09:20 com 60min => apenas 08:00 (08:00-09:00); sobra de 20min é ignorada
    const slots = generateDaySlots({ active: true, start: "08:00", end: "09:20" }, 60);
    expect(slots.map((s) => s.time)).toEqual(["08:00"]);
  });

  it("duração 0/ausente cai para o default de 60 min", () => {
    // 08:00-08:30 não comporta uma aula de 60 min => 0 slots
    const slots = generateDaySlots({ active: true, start: "08:00", end: "08:30" }, 0);
    expect(slots).toHaveLength(0);
  });

  it("duração pequena é elevada ao mínimo de 5 min", () => {
    const slots = generateDaySlots({ active: true, start: "08:00", end: "08:30" }, 3);
    expect(slots.length).toBe(6); // 08:00,08:05,...,08:25
  });
});

describe("ScheduleAvailabilityService — helpers de horário", () => {
  it("parseHHMM converte HH:MM em minutos", () => {
    expect(parseHHMM("08:30")).toBe(510);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("18:00")).toBe(1080);
    expect(parseHHMM(undefined)).toBe(0);
  });

  it("minutesToHHMM converte minutos em HH:MM", () => {
    expect(minutesToHHMM(510)).toBe("08:30");
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(1080)).toBe("18:00");
  });

  it("parseSchoolHours tolera JSON inválido e vazio", () => {
    expect(parseSchoolHours(null)).toEqual({});
    expect(parseSchoolHours("nao-json")).toEqual({});
    expect(parseSchoolHours('{"monday":{"active":true,"start":"08:00","end":"18:00"}}')).toHaveProperty("monday");
  });
});

describe("dashboardWidgets — trava do admin (RN-016)", () => {
  it("allowed vazio = todos os cards permitidos", () => {
    const visible = resolveVisibleWidgets("", "");
    expect(visible).toEqual(ALL_WIDGET_IDS);
  });

  it("respeita o subconjunto permitido pelo admin", () => {
    const allowed = JSON.stringify(["kpi_students", "upcoming_lessons"]);
    const visible = resolveVisibleWidgets(allowed, "");
    expect(visible).toEqual(["kpi_students", "upcoming_lessons"]);
  });

  it("usuário só pode ocultar (nunca habilitar além do permitido)", () => {
    const allowed = JSON.stringify(["kpi_students", "upcoming_lessons"]);
    // ocultos inclui um card NÃO permitido -> deve ser ignorado
    const visible = resolveVisibleWidgets(allowed, JSON.stringify(["kpi_students", "kpi_revenue"]));
    expect(visible).toEqual(["upcoming_lessons"]);
    expect(visible).not.toContain("kpi_revenue");
  });

  it("ignora IDs desconhecidos", () => {
    const visible = resolveVisibleWidgets(JSON.stringify(["kpi_students", "widget_fantasma"]), "");
    expect(visible).toEqual(["kpi_students"]);
  });

  it("parseWidgetList aceita JSON array e CSV legado", () => {
    expect(parseWidgetList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseWidgetList("a,b")).toEqual(["a", "b"]);
    expect(parseWidgetList("")).toEqual([]);
  });
});
