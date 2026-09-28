// ─── Regras do simulador de preços (client + testes) ─────────────────────────
// Puro e determinístico: recebe os planos (do banco) e o nº de alunos e devolve
// o total mensal, excedentes, recomendação e quando precisa de proposta sob medida.

export const UNLIMITED_STUDENTS = 999999;
export const MAX_SLIDER_STUDENTS = 5000;
export const NEGOTIATION_STUDENTS_THRESHOLD = 1000;
export const NEGOTIATION_MAX_EXCESS = 200;

export interface SimPlan {
  id: string;
  name: string;
  priceMonthly: number;
  maxStudents: number;
  allowExtraStudents: boolean;
  extraStudentPrice: number;
  isPopular?: boolean;
  order?: number;
}

export interface PlanRange {
  min: number;
  max: number;
  initial: number;
  step: number;
}

export interface Simulation {
  students: number;
  basePrice: number;
  excessCount: number;
  excessSubtotal: number;
  total: number;
  isUnlimited: boolean;
  exceedsLimit: boolean;
  isExcessAllowed: boolean;
  maxAllowedStudents: number;
  needsNegotiation: boolean;
}

export interface Recommendation {
  plan: SimPlan | null;
  needsCustomQuote: boolean;
}

function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isUnlimitedPlan(plan: SimPlan): boolean {
  return plan.maxStudents >= UNLIMITED_STUDENTS;
}

export function planExcessCap(plan: SimPlan): number | null {
  return Math.floor(plan.maxStudents) === NEGOTIATION_STUDENTS_THRESHOLD ? NEGOTIATION_MAX_EXCESS : null;
}

export function planMaxAllowedStudents(plan: SimPlan): number {
  if (isUnlimitedPlan(plan)) return Number.POSITIVE_INFINITY;
  const max = Math.floor(plan.maxStudents);
  if (!plan.allowExtraStudents) return max;
  const cap = planExcessCap(plan);
  return cap === null ? Number.POSITIVE_INFINITY : max + cap;
}

export function sortPlans(plans: SimPlan[]): SimPlan[] {
  return [...plans].sort((a, b) => {
    if (a.maxStudents !== b.maxStudents) return a.maxStudents - b.maxStudents;
    const extraPreference = Number(b.allowExtraStudents) - Number(a.allowExtraStudents);
    if (extraPreference !== 0) return extraPreference;
    return toCents(a.priceMonthly) - toCents(b.priceMonthly);
  });
}

export function computePlanRange(plans: SimPlan[]): PlanRange {
  const finiteLimits = plans
    .filter((plan) => !isUnlimitedPlan(plan))
    .map((plan) => Math.floor(plan.maxStudents))
    .filter((limit) => Number.isFinite(limit) && limit > 0);

  const min = finiteLimits.length > 0 ? Math.max(1, Math.min(...finiteLimits)) : 10;
  const largest = finiteLimits.length > 0 ? Math.max(...finiteLimits) : 500;
  const max = clamp(Math.ceil(Math.max(largest * 1.5, 500) / 50) * 50, 50, MAX_SLIDER_STUDENTS);

  return { min, max, initial: min, step: 1 };
}

export function normalizeStudentCount(value: number, range: PlanRange): number {
  if (!Number.isFinite(value)) return range.initial;
  return clamp(Math.round(value), range.min, range.max);
}

export function simulateMonthly(plan: SimPlan, students: number): Simulation {
  const unlimited = isUnlimitedPlan(plan);
  const safeStudents = Math.max(0, Math.floor(Number.isFinite(students) ? students : 0));
  const excessCount = unlimited ? 0 : Math.max(0, safeStudents - Math.floor(plan.maxStudents));
  const exceedsLimit = excessCount > 0;
  const isExcessAllowed = exceedsLimit && plan.allowExtraStudents === true;
  const excessCents = isExcessAllowed ? excessCount * toCents(plan.extraStudentPrice) : 0;
  const baseCents = toCents(plan.priceMonthly);
  const cap = planExcessCap(plan);
  const maxAllowedStudents = planMaxAllowedStudents(plan);
  const needsNegotiation =
    cap !== null &&
    plan.allowExtraStudents === true &&
    !unlimited &&
    safeStudents > maxAllowedStudents;

  return {
    students: safeStudents,
    basePrice: baseCents / 100,
    excessCount,
    excessSubtotal: excessCents / 100,
    total: (baseCents + excessCents) / 100,
    isUnlimited: unlimited,
    exceedsLimit,
    isExcessAllowed,
    maxAllowedStudents,
    needsNegotiation,
  };
}

export function recommendPlan(plans: SimPlan[], students: number): Recommendation {
  const sorted = sortPlans(plans);
  if (sorted.length === 0) return { plan: null, needsCustomQuote: true };

  const safeStudents = Math.max(0, Math.floor(Number.isFinite(students) ? students : 0));
  const fitting = sorted.find((plan) => plan.maxStudents >= safeStudents);
  if (fitting) return { plan: fitting, needsCustomQuote: false };

  const largest = sorted[sorted.length - 1];
  const largestIsCapped =
    planExcessCap(largest) !== null && largest.allowExtraStudents && !isUnlimitedPlan(largest);
  if (largestIsCapped && safeStudents > planMaxAllowedStudents(largest)) {
    return { plan: largest, needsCustomQuote: true };
  }

  const excessCandidates = sorted.filter(
    (plan) => plan.allowExtraStudents && planMaxAllowedStudents(plan) >= safeStudents
  );
  if (excessCandidates.length > 0) {
    return { plan: excessCandidates[excessCandidates.length - 1], needsCustomQuote: false };
  }

  return { plan: largest, needsCustomQuote: true };
}
