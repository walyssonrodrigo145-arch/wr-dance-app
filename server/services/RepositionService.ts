// ─── RepositionService ───────────────────────────────────────────────────────
// Regras puras da Reposição de Aulas (PRD 01). Sem acesso a banco — funções
// testáveis. Persistência/fluxos tRPC ficam em server/routers/repositionsRouters.ts.
// Fonte única para: prazo de validade do crédito e transições de status.

export type ExpirationUnit = "dias" | "semanas" | "meses";
export type CreditReleaseMode = "imediata" | "fim_contrato";

export interface RepositionPolicyConfig {
  expirationDays: number;
  expirationUnit: ExpirationUnit | string;
  creditRelease: CreditReleaseMode | string;
}

export const DEFAULT_REPOSITION_POLICY: RepositionPolicyConfig = {
  expirationDays: 30,
  expirationUnit: "dias",
  creditRelease: "imediata",
};

/**
 * Normaliza a política vinda do banco/INPUT — valores inválidos caem no padrão.
 * Prazo mínimo 1; máximo 365 dias (convertido).
 */
export function normalizePolicy(raw: Partial<RepositionPolicyConfig> | null | undefined): RepositionPolicyConfig {
  const days = Number(raw?.expirationDays);
  const unit = raw?.expirationUnit;
  const release = raw?.creditRelease;
  return {
    expirationDays: Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 3650) : DEFAULT_REPOSITION_POLICY.expirationDays,
    expirationUnit: unit === "semanas" || unit === "meses" ? unit : "dias",
    creditRelease: release === "fim_contrato" ? "fim_contrato" : "imediata",
  };
}

/**
 * Data de expiração do crédito = base + prazo configurado.
 * Base: liberação do crédito (imediata → data de geração; fim_contrato → data da liberação).
 */
export function computeExpirationDate(base: Date, policy: RepositionPolicyConfig): Date {
  const p = normalizePolicy(policy);
  const d = new Date(base.getTime());
  const n = Math.max(1, Math.floor(p.expirationDays));
  if (p.expirationUnit === "semanas") d.setDate(d.getDate() + n * 7);
  else if (p.expirationUnit === "meses") d.setMonth(d.getMonth() + n);
  else d.setDate(d.getDate() + n);
  return d;
}

/** Status inicial do crédito conforme a política de liberação. */
export function resolveInitialCreditStatus(
  policy: RepositionPolicyConfig,
  now: Date = new Date()
): { status: "disponivel" | "aguardando_liberacao"; releasedAt: Date | null; expiresAt: Date | null } {
  const p = normalizePolicy(policy);
  if (p.creditRelease === "fim_contrato") {
    return { status: "aguardando_liberacao", releasedAt: null, expiresAt: null };
  }
  return { status: "disponivel", releasedAt: now, expiresAt: computeExpirationDate(now, p) };
}

/** Crédito está expirado? (null expiresAt = sem validade — nunca expira) */
export function isCreditExpired(reposition: { status: string; expiresAt: Date | null }, now: Date = new Date()): boolean {
  if (reposition.status !== "disponivel") return false;
  if (!reposition.expiresAt) return false;
  return new Date(reposition.expiresAt).getTime() < now.getTime();
}

/**
 * O crédito pode ser agendado?
 * Regras: apenas status "disponivel"; expirado nunca; aguardando_liberacao nunca.
 */
export function canScheduleCredit(
  reposition: { status: string; expiresAt: Date | null },
  now: Date = new Date()
): { ok: boolean; reason?: "aguardando_liberacao" | "expirado" | "status_invalido" } {
  if (reposition.status === "aguardando_liberacao") {
    return { ok: false, reason: "aguardando_liberacao" };
  }
  if (reposition.status !== "disponivel") {
    return { ok: false, reason: "status_invalido" };
  }
  if (isCreditExpired(reposition, now)) {
    return { ok: false, reason: "expirado" };
  }
  return { ok: true };
}

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  aguardando_liberacao: "Aguardando Liberação",
  disponivel: "Disponível para Reposição",
  agendada: "Reposição Agendada",
  realizada: "Reposição Realizada",
  expirada: "Reposição Expirada",
  cancelada: "Cancelada",
};
