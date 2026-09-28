import { describe, it, expect } from "vitest";
import {
  computePlanRange,
  normalizeStudentCount,
  planExcessCap,
  planMaxAllowedStudents,
  recommendPlan,
  simulateMonthly,
  sortPlans,
  type SimPlan,
} from "../shared/planPricing";

const plan = (over: Partial<SimPlan>): SimPlan => ({
  id: over.id ?? "p",
  name: over.name ?? "Plano",
  priceMonthly: over.priceMonthly ?? 100,
  maxStudents: over.maxStudents ?? 50,
  allowExtraStudents: over.allowExtraStudents ?? true,
  extraStudentPrice: over.extraStudentPrice ?? 1.49,
  isPopular: over.isPopular,
  order: over.order,
});

const PLANOS_DANCE: SimPlan[] = [
  plan({ id: "dancepro_start", name: "Dance Start", priceMonthly: 99.9, maxStudents: 30, order: 1 }),
  plan({ id: "dancepro_standard", name: "Dance Standard", priceMonthly: 149.9, maxStudents: 50, order: 2 }),
  plan({ id: "dancepro_master", name: "Dance Master", priceMonthly: 209.9, maxStudents: 100, order: 3, isPopular: true }),
  plan({ id: "dancepro_pro150", name: "Dance Pro 150", priceMonthly: 279.9, maxStudents: 150, order: 4 }),
  plan({ id: "dancepro_pro1000", name: "Dance Pro 1000", priceMonthly: 1199.9, maxStudents: 1000, order: 9 }),
];

describe("Simulador de preços — regras", () => {
  it("recomenda o menor plano que cobre a quantidade de alunas", () => {
    expect(recommendPlan(PLANOS_DANCE, 25).plan?.id).toBe("dancepro_start");
    expect(recommendPlan(PLANOS_DANCE, 30).plan?.id).toBe("dancepro_start");
    expect(recommendPlan(PLANOS_DANCE, 31).plan?.id).toBe("dancepro_standard");
    expect(recommendPlan(PLANOS_DANCE, 120).plan?.id).toBe("dancepro_pro150");
    expect(recommendPlan(PLANOS_DANCE, 900).plan?.id).toBe("dancepro_pro1000");
  });

  it("cobra excedente quando passa do limite de um plano", () => {
    const standard = PLANOS_DANCE[1];
    const sim = simulateMonthly(standard, 55);
    expect(sim.excessCount).toBe(5);
    expect(sim.excessSubtotal).toBeCloseTo(7.45, 2);
    expect(sim.total).toBeCloseTo(157.35, 2);
    expect(sim.isExcessAllowed).toBe(true);
  });

  it("plano de 1000 tem teto de 200 excedentes e pede proposta sob medida", () => {
    const pro1000 = PLANOS_DANCE[4];
    expect(planExcessCap(pro1000)).toBe(200);
    expect(planMaxAllowedStudents(pro1000)).toBe(1200);

    const dentro = simulateMonthly(pro1000, 1150);
    expect(dentro.excessCount).toBe(150);
    expect(dentro.needsNegotiation).toBe(false);

    const acima = simulateMonthly(pro1000, 1250);
    expect(acima.needsNegotiation).toBe(true);

    const rec = recommendPlan(PLANOS_DANCE, 1250);
    expect(rec.needsCustomQuote).toBe(true);
  });

  it("plano sem excedentes não cobre acima do limite e não é recomendado", () => {
    const semExcedente = plan({ id: "fixo", name: "Fixo", maxStudents: 20, allowExtraStudents: false });
    const sim = simulateMonthly(semExcedente, 25);
    expect(sim.exceedsLimit).toBe(true);
    expect(sim.isExcessAllowed).toBe(false);
    expect(sim.total).toBe(semExcedente.priceMonthly);
    const rec = recommendPlan([...PLANOS_DANCE, semExcedente], 25);
    expect(rec.plan?.id).toBe("dancepro_start");
  });

  it("range do slider acompanha os limites dos planos e normaliza o valor", () => {
    const range = computePlanRange(PLANOS_DANCE);
    expect(range.min).toBe(30);
    expect(range.max).toBeGreaterThanOrEqual(1500);
    expect(normalizeStudentCount(-10, range)).toBe(30);
    expect(normalizeStudentCount(99999, range)).toBe(range.max);
    expect(normalizeStudentCount(77.6, range)).toBe(78);
  });

  it("ordena planos por limite e desempata por preço", () => {
    const sorted = sortPlans(PLANOS_DANCE);
    expect(sorted[0].id).toBe("dancepro_start");
    expect(sorted[sorted.length - 1].id).toBe("dancepro_pro1000");
  });
});
