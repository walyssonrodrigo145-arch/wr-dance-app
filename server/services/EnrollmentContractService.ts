// ─── EnrollmentContractService ────────────────────────────────────────────────
// Gera o contrato + assinatura digital (Assinafy) para um aluno matriculado via
// link público. Best-effort: se a escola não tiver a integração Assinafy ativa,
// CNPJ válido ou modelo de contrato, retorna null e a matrícula NÃO é bloqueada.
import { and, eq } from "drizzle-orm";
import { schoolIntegrations, contractTemplates, students, organizations, users } from "../../drizzle/schema";

/** Idade em anos a partir de uma data (YYYY-MM-DD). */
function ageFrom(birthDate?: string | Date | null): number | null {
  if (!birthDate) return null;
  const d = new Date(typeof birthDate === "string" ? `${String(birthDate).slice(0, 10)}T12:00:00` : birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Gera o contrato do aluno recém-matriculado e retorna o link de assinatura.
 * `templateId` (opcional): modelo escolhido no link. Se null, resolve
 * automaticamente (modelo "menor" se o aluno tiver < 18 anos, senão o padrão).
 */
export async function generateEnrollmentContract(
  db: any,
  orgId: number,
  studentId: number,
  opts: { templateId?: number | null; monthlyFee?: string | null; startDate?: string | null; endDate?: string | null } = {}
): Promise<{ signUrl: string; contractId: number; contractNumber: string | null } | null> {
  try {
    // 0. "Nenhum contrato" (sentinel 0) — a escola optou explicitamente por não gerar
    if (opts.templateId === 0) return null;

    // 1. Integração Assinafy ativa?
    const [integration] = await db.select()
      .from(schoolIntegrations)
      .where(and(
        eq(schoolIntegrations.organizationId, orgId),
        eq(schoolIntegrations.provider, "assinafy"),
        eq(schoolIntegrations.active, true),
      ))
      .limit(1);
    if (!integration) return null;

    // 2. Resolve o modelo de contrato
    const templates = await db.select()
      .from(contractTemplates)
      .where(and(eq(contractTemplates.organizationId, orgId), eq(contractTemplates.active, true)));
    if (templates.length === 0) return null;

    let templateId: number | null = opts.templateId ?? null;
    if (templateId && !templates.some((t: any) => t.id === templateId)) {
      templateId = null; // template do link não existe mais → cai no automático
    }
    if (!templateId) {
      const [student] = await db.select({ birthDate: students.birthDate })
        .from(students).where(eq(students.id, studentId)).limit(1);
      const age = ageFrom(student?.birthDate);
      const isMinor = age !== null && age < 18;
      const minorTpl = templates.find((t: any) => String(t.name || "").toLowerCase().includes("menor"));
      const standardTpl = templates.find((t: any) => !String(t.name || "").toLowerCase().includes("menor"));
      templateId = (isMinor ? (minorTpl || standardTpl) : (standardTpl || minorTpl))?.id ?? templates[0].id;
    }
    if (!templateId) return null;

    // 3. Usuário criador (dono da org ou primeiro admin)
    const [org] = await db.select({ ownerId: organizations.ownerId })
      .from(organizations).where(eq(organizations.id, orgId)).limit(1);
    let userId: number | null = org?.ownerId ?? null;
    if (!userId) {
      const [admin] = await db.select({ id: users.id })
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")))
        .limit(1);
      userId = admin?.id ?? null;
    }
    if (!userId) return null;

    // 4. Gera o contrato + processo de assinatura (com timeout para não travar o cadastro)
    const { runCreateAssinafyContract } = await import("../routers/helpers");
    const result = await Promise.race([
      runCreateAssinafyContract(db, { id: userId }, orgId, {
        studentId,
        templateId,
        startDate: opts.startDate ?? undefined,
        endDate: opts.endDate ?? undefined,
        monthlyFeeOverride: opts.monthlyFee ?? undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tempo esgotado ao gerar o contrato.")), 25_000)
      ),
    ]);

    return {
      signUrl: result.signUrl,
      contractId: result.contract.id,
      contractNumber: result.contract.contractNumber ?? null,
    };
  } catch (err: any) {
    console.warn(`[EnrollmentContract] Não foi possível gerar contrato do aluno #${studentId} (org #${orgId}):`, err?.message || err);
    return null;
  }
}
