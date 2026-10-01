import { describe, it, expect } from "vitest";
import {
  aggregateDay,
  buildMonthGrid,
  buildWeekStrip,
  countActiveAgendaFilters,
  filterAgendaLessons,
  isLessonInProgress,
  isSameDayLocal,
} from "@shared/agenda";

function at(year: number, month: number, day: number, hour = 19): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function lesson(day: number, status: string, overrides: Record<string, unknown> = {}) {
  return { scheduledAt: at(2026, 9, day), status, ...overrides };
}

describe("Agenda mobile (shared/agenda)", () => {
  it("monta a grade do mês com 6 semanas começando no domingo", () => {
    const grid = buildMonthGrid(at(2026, 9, 22));

    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(0);
    expect(grid[0].getDate()).toBe(30);
    expect(grid[0].getMonth()).toBe(7);
    expect(grid.some((day) => isSameDayLocal(day, at(2026, 9, 22)))).toBe(true);
    expect(grid[41].getDay()).toBe(6);
  });

  it("monta a faixa da semana com 7 dias", () => {
    const week = buildWeekStrip(at(2026, 9, 22));
    expect(week).toHaveLength(7);
    expect(week[0].getDay()).toBe(0);
    expect(week.some((day) => isSameDayLocal(day, at(2026, 9, 22)))).toBe(true);
  });

  it("agrega pontinhos por status (máx. 4) e contador quando passa de 4 aulas", () => {
    const lessons = [
      lesson(22, "agendada"),
      lesson(22, "agendada"),
      lesson(22, "concluida"),
      lesson(22, "falta"),
      lesson(22, "agendada"),
      lesson(22, "concluida"),
    ];
    const agg = aggregateDay(lessons, at(2026, 9, 22));

    expect(agg.total).toBe(6);
    expect(agg.dots).toEqual(["agendada", "concluida", "falta"]);
    expect(agg.extra).toBe(6);
  });

  it("não mostra contador com 4 aulas ou menos e mantém ordem fixa dos status", () => {
    const agg = aggregateDay(
      [lesson(22, "cancelada"), lesson(22, "agendada"), lesson(22, "concluida"), lesson(22, "falta")],
      at(2026, 9, 22)
    );

    expect(agg.dots).toEqual(["agendada", "concluida", "falta", "cancelada"]);
    expect(agg.extra).toBe(0);
  });

  it("retorna vazio quando não há aulas no dia", () => {
    expect(aggregateDay([lesson(21, "agendada")], at(2026, 9, 22))).toEqual({ total: 0, dots: [], extra: 0 });
  });

  it("filtra por status desabilitado, professor, sala, modalidade e tipo", () => {
    const lessons = [
      lesson(22, "agendada", { teacherId: 1, studioRoomId: 10, instrumentId: 100, lessonType: "individual" }),
      lesson(22, "cancelada", { teacherId: 2, studioRoomId: 10, instrumentId: 100, lessonType: "turma" }),
      lesson(22, "agendada", { teacherId: 2, studioRoomId: 11, instrumentId: 101, lessonType: "turma" }),
    ];

    expect(filterAgendaLessons(lessons, { disabledStatuses: ["cancelada"] })).toHaveLength(2);
    expect(filterAgendaLessons(lessons, { teacherId: 2 })).toHaveLength(2);
    expect(filterAgendaLessons(lessons, { roomId: 10, teacherId: 1 })).toHaveLength(1);
    expect(filterAgendaLessons(lessons, { instrumentId: 101 })).toHaveLength(1);
    expect(filterAgendaLessons(lessons, { lessonType: "turma" })).toHaveLength(2);
    expect(filterAgendaLessons(lessons, { lessonType: "todos" })).toHaveLength(3);
  });

  it("conta filtros ativos", () => {
    expect(countActiveAgendaFilters({})).toBe(0);
    expect(countActiveAgendaFilters({ disabledStatuses: ["falta"], teacherId: 3 })).toBe(2);
    expect(
      countActiveAgendaFilters({ teacherId: 3, roomId: 1, instrumentId: 2, lessonType: "turma", disabledStatuses: ["falta"] })
    ).toBe(5);
  });

  it("marca como em andamento a aula de 60min que começou 10min atrás", () => {
    const now = at(2026, 9, 22, 20);
    const start = new Date(now.getTime() - 10 * 60000);

    expect(isLessonInProgress({ scheduledAt: start, duration: 60, status: "agendada" }, now)).toBe(true);
  });

  it("não marca aula encerrada (2h atrás) nem aula concluída como em andamento", () => {
    const now = at(2026, 9, 22, 20);
    const start = new Date(now.getTime() - 2 * 60 * 60000);

    expect(isLessonInProgress({ scheduledAt: start, duration: 60, status: "agendada" }, now)).toBe(false);
    expect(isLessonInProgress({ scheduledAt: new Date(now.getTime() - 10 * 60000), duration: 60, status: "concluida" }, now)).toBe(false);
  });
});
