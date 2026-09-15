import { describe, it, expect } from "vitest";
import {
  computeDaysRemaining,
  computeMonthsRemaining,
  computeTotalLessons,
  computeLessonsRemaining,
  isContractExpiryTriggered,
} from "./services/ContractExpiryEngine";

describe("ContractExpiryEngine — computeDaysRemaining", () => {
  it("retorna dias positivos quando o contrato ainda não venceu", () => {
    const end = new Date("2026-10-09T12:00:00");
    const now = new Date("2026-09-09T12:00:00");
    expect(computeDaysRemaining(end, now)).toBe(30);
  });
  it("retorna negativo quando o contrato já venceu", () => {
    const end = new Date("2026-08-09T12:00:00");
    const now = new Date("2026-09-09T12:00:00");
    expect(computeDaysRemaining(end, now)).toBeLessThan(0);
  });
  it("aceita data como string YYYY-MM-DD", () => {
    expect(computeDaysRemaining("2026-10-09", new Date("2026-09-09T12:00:00"))).toBe(30);
  });
});

describe("ContractExpiryEngine — computeMonthsRemaining", () => {
  it("1 mês completo restante", () => {
    expect(computeMonthsRemaining("2026-10-09", new Date("2026-09-09T12:00:00"))).toBe(1);
  });
  it("mesmo mês (0 meses, termina no mês corrente)", () => {
    expect(computeMonthsRemaining("2026-09-30", new Date("2026-09-09T12:00:00"))).toBe(0);
  });
  it("não completa o mês se o dia do fim for menor que o dia atual", () => {
    // endDate dia 01 < hoje dia 09 → ainda 0 meses
    expect(computeMonthsRemaining("2026-10-01", new Date("2026-09-09T12:00:00"))).toBe(0);
  });
  it("virada de ano", () => {
    expect(computeMonthsRemaining("2027-02-09", new Date("2026-09-09T12:00:00"))).toBe(5);
  });
});

describe("ContractExpiryEngine — computeTotalLessons / computeLessonsRemaining", () => {
  it("total de aulas do plano (2/semana, 6 meses ≈ 52)", () => {
    expect(computeTotalLessons(2, 6)).toBe(52);
  });
  it("zero quando sem plano", () => {
    expect(computeTotalLessons(0, 0)).toBe(0);
    expect(computeTotalLessons(null, null)).toBe(0);
  });
  it("aulas restantes nunca negativas", () => {
    expect(computeLessonsRemaining(52, 48)).toBe(4);
    expect(computeLessonsRemaining(52, 60)).toBe(0);
  });
});

describe("ContractExpiryEngine — isContractExpiryTriggered", () => {
  it("modo meses: dispara quando faltam <= X meses", () => {
    expect(isContractExpiryTriggered("meses", 1, 30, 1, 0)).toBe(true);
    expect(isContractExpiryTriggered("meses", 1, 45, 2, 0)).toBe(false);
  });
  it("modo meses: não dispara contrato já encerrado", () => {
    expect(isContractExpiryTriggered("meses", 1, -5, -1, 0)).toBe(false);
  });
  it("modo aulas: dispara quando faltam <= X aulas", () => {
    expect(isContractExpiryTriggered("aulas", 4, 20, 1, 4)).toBe(true);
    expect(isContractExpiryTriggered("aulas", 4, 20, 1, 5)).toBe(false);
  });
  it("modo aulas: não dispara contrato já encerrado", () => {
    expect(isContractExpiryTriggered("aulas", 4, -1, -1, 0)).toBe(false);
  });
});
