// Helpers compartilhados extraídos de routers.ts — AUDIT FIX (split do monólito)
import { debugLog } from "../_core/logger";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import { organizations, students, contracts, schoolIntegrations } from "../../drizzle/schema";
import { ENV } from "../_core/env";

// ─── Datas e status "atrasado" (fonte única — AUDIT F5) ─────────────────────
// Data de hoje no fuso do Brasil no formato ISO (yyyy-mm-dd).
export function getTodayBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Converte Date/string/outro em yyyy-mm-dd para comparação de vencimento.
export function toISODate(d: any): string {
  if (!d) return "";
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

// Marca mensalidades 'pendente' com vencimento < hoje como 'atrasado' (mesma regra
// usada em paymentDues.list/overdue/listByStudent — antes copiada em cada procedura).
export function markOverdueRows<T extends { status: string; dueDate: any }>(rows: T[], today: string = getTodayBR()): T[] {
  return rows.map(r => {
    if (r.status === 'pendente' && toISODate(r.dueDate) < today) {
      return { ...r, status: 'atrasado' as const };
    }
    return r;
  });
}

export interface DueDateSeries {
  year: number;
  month: number;
  dueDateISO: string;
}

// Série de vencimentos conforme periodicidade da cobrança, com ajuste para o último
// dia válido do mês (ex.: dia 31 em fevereiro → 28/29). Mesmo cálculo usado em
// paymentDues.generateMonthly e generateBulkAll (antes duplicado nos dois).
export function buildDueDateSeries(
  startMonth: number,
  startYear: number,
  monthsCount: number,
  dueDay: number | null,
  periodicity: string
): DueDateSeries[] {
  const step = periodicity === "bimestral" ? 2 : periodicity === "trimestral" ? 3 : periodicity === "semestral" ? 6 : periodicity === "anual" ? 12 : 1;
  const out: DueDateSeries[] = [];
  for (let i = 0; i < monthsCount; i += step) {
    let m = startMonth - 1 + i; // 0-based
    const y = startYear + Math.floor(m / 12);
    m = m % 12;
    // Ajusta o dia para o último dia válido do mês (ex: dia 31 em fevereiro -> 28/29)
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dueDay as number, lastDay);
    // BUG FIX (TZ): montar a ISO diretamente dos componentes. Antes era
    // new Date(y, m, day).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) —
    // em servidor com TZ=UTC isso deslocava -1 dia (meia-noite UTC = 21:00 do dia
    // anterior em Brasília), gerando cobranças com vencimento 1 dia a menos.
    const pad = (n: number) => String(n).padStart(2, "0");
    const dueDateISO = `${y}-${pad(m + 1)}-${pad(day)}`;
    out.push({ year: y, month: m + 1, dueDateISO });
  }
  return out;
}

// MH-004: Rate limiting — controle de tentativas de login por IP+email
export const loginAttempts: Map<string, { count: number; resetAt: number }> = new Map();

// SEGURANÇA: comparação de strings em tempo constante (evita timing attack)
export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // consome tempo equivalente antes de falhar
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// SEGURANÇA: e-mails de super admin são reservados e não podem ser criados
// por fluxos públicos de cadastro (quebra a cadeia de takeover via registerWithPlan)
export function isReservedSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ENV.superAdminEmails.includes(email.trim().toLowerCase());
}

// AUDIT-04 FIX: validação de CNPJ com dígitos verificadores (aceita formatado ou só dígitos)
export function isValidCNPJ(value: string | null | undefined): boolean {
  if (!value) return false;
  const cnpj = value.replace(/\D/g, "");
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // sequência repetida
  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return String(d1) === cnpj[12] && String(d2) === cnpj[13];
}

// ─── Helper: busca limites do plano da organização no banco ──────────────────
export async function getOrgPlanLimits(db: any, orgId: number) {
  const { systemPlans } = await import("../../drizzle/schema");
  const [org] = await db.select({ planId: organizations.planId })
    .from(organizations).where(eq(organizations.id, orgId)).limit(1);
  
  if (!org) return { maxStudents: 999999, allowExtraStudents: false, extraStudentPrice: 0, planId: '', planName: '' };
  
  const [plan] = await db.select().from(systemPlans)
    .where(eq(systemPlans.id, org.planId)).limit(1);
  
  return {
    maxStudents: plan?.maxStudents ?? 999999,
    // Consistência: plataformaRouters e superadmin tratam ausência como permitido
    // (coluna é NOT NULL default true; só difere quando o plano não existe — e
    // nesse caso maxStudents é ilimitado, tornando a flag irrelevante).
    allowExtraStudents: plan?.allowExtraStudents ?? true,
    extraStudentPrice: Number(plan?.extraStudentPrice ?? 0),
    planId: org.planId,
    planName: plan?.name ?? org.planId,
  };
}

// ─── Helper: Sincroniza valor da assinatura no Asaas considerando Alunos Excedentes ──────
export async function syncOrgAsaasSubscription(db: any, orgId: number) {
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org || !org.asaasSubscriptionId) return;

    const { systemPlans } = await import("../../drizzle/schema");
    const [planInfo] = await db.select().from(systemPlans).where(eq(systemPlans.id, org.planId)).limit(1);
    if (!planInfo) return;

    const [{ count: activeCountRaw }] = await db.select({ count: sql<number>`count(*)` })
      .from(students)
      .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));

    const activeStudentsCount = Number(activeCountRaw ?? 0);

    const maxStudents = planInfo.maxStudents ?? 999999;
    const allowExtra = planInfo.allowExtraStudents ?? true;
    const extraPrice = Number(planInfo.extraStudentPrice ?? 1.49);
    const excessCount = Math.max(0, activeStudentsCount - maxStudents);
    const excessFee = (allowExtra && excessCount > 0) ? excessCount * extraPrice : 0;

    const { getAsaasSubscription, updateAsaasSubscription } = await import('../utils/asaas');
    const asaasSub = await getAsaasSubscription(org.asaasSubscriptionId).catch(() => null);
    if (!asaasSub) return;
    
    const cycle = asaasSub.cycle || "MONTHLY";
    const baseValue = cycle === "YEARLY" ? Number(planInfo.priceYearly) : Number(planInfo.priceMonthly);
    const totalValue = baseValue + excessFee;

    const description = excessCount > 0
      ? `Assinatura MusicPro - Plano ${planInfo.name} (${cycle}) + ${excessCount} alunos excedentes`
      : `Assinatura MusicPro - Plano ${planInfo.name} (${cycle})`;

    if (Math.abs(Number(asaasSub.value) - totalValue) > 0.01) {
      await updateAsaasSubscription(org.asaasSubscriptionId, {
        value: totalValue,
        description,
        cycle
      });
      debugLog(`[AsaasSync] Org #${orgId} atualizada no Asaas. Ativos: ${activeStudentsCount}, Excedentes: ${excessCount}, Novo valor: R$ ${totalValue.toFixed(2)}`);
    }

    // BUG FIX: cobranças já emitidas mantêm o valor antigo no Asaas — cancelar as
    // divergentes e gerar nova cobrança com o valor atualizado para o período vigente
    if (org.asaasCustomerId) {
      await reconcileOrgAsaasCharges(
        db,
        orgId,
        org.asaasSubscriptionId,
        org.asaasCustomerId,
        totalValue,
        description
      );
    }
  } catch (err) {
    console.error(`[AsaasSync] Erro ao sincronizar assinatura da Org #${orgId}:`, err);
  }
}

// ─── Helper: Cancela cobranças emitidas com valor divergente e gera nova com o valor correto ──────
// BUG FIX: Ao atualizar o valor de uma assinatura, o Asaas só aplica o novo valor nas cobranças
// FUTURAS — as cobranças já emitidas (PENDING/OVERDUE) mantêm o valor antigo. Este helper
// cancela essas cobranças divergentes e cria uma nova no valor correto para o período vigente.
export async function reconcileOrgAsaasCharges(db: any, orgId: number, subId: string, customerId: string, totalValue: number, description: string) {
  try {
    const { getAsaasSubscriptionPayments, deleteAsaasCharge, createAsaasCharge } = await import('../utils/asaas');
    const payments = await getAsaasSubscriptionPayments(subId).catch(() => []);
    if (!Array.isArray(payments) || payments.length === 0) return { deleted: 0, created: 0 };

    let deleted = 0;
    let created = 0;
    for (const pay of payments) {
      const status = String(pay.status || "").toUpperCase();
      if (status !== "PENDING" && status !== "OVERDUE") continue;
      if (Math.abs(Number(pay.value) - totalValue) <= 0.01) continue;

      try {
        await deleteAsaasCharge(pay.id);
        deleted++;
        debugLog(`[AsaasSync] Cobrança ${pay.id} (R$ ${pay.value}) cancelada — novo valor R$ ${totalValue.toFixed(2)} (Org #${orgId})`);
      } catch (e) {
        console.error(`[AsaasSync] Falha ao cancelar cobrança ${pay.id} (Org #${orgId}):`, e);
        continue;
      }

      try {
        const charge = await createAsaasCharge({
          asaasCustomerId: customerId,
          billingType: pay.billingType || "UNDEFINED",
          value: totalValue,
          dueDate: String(pay.dueDate || "").slice(0, 10),
          description,
        });
        created++;
        debugLog(`[AsaasSync] Nova cobrança gerada ${charge.id} — R$ ${totalValue.toFixed(2)} vencimento ${charge.dueDate} (Org #${orgId})`);
      } catch (e) {
        console.error(`[AsaasSync] Falha ao gerar nova cobrança no valor correto (Org #${orgId}):`, e);
      }
    }
    return { deleted, created };
  } catch (err) {
    console.error(`[AsaasSync] Erro na reconciliação de cobranças da Org #${orgId}:`, err);
    return { deleted: 0, created: 0 };
  }
}

// ─── Contratos Assinafy: fluxo compartilhado (criar / renovar) ─────────────
export async function runCreateAssinafyContract(
  db: any,
  user: { id: number },
  orgId: number,
  input: { studentId: number; templateId: number; startDate?: string; endDate?: string; monthlyFeeOverride?: string }
) {
  const [integration] = await db.select()
    .from(schoolIntegrations)
    .where(and(
      eq(schoolIntegrations.organizationId, orgId),
      eq(schoolIntegrations.provider, "assinafy"),
      eq(schoolIntegrations.active, true),
    ))
    .limit(1);
  if (!integration) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Assinatura digital não configurada. Conecte sua conta da Assinafy em Configurações > Integrações.",
    });
  }

  // AUDIT-CONTRACTS FIX: a tabela settings é POR USUÁRIO (userId UNIQUE) — cada
  // usuário da org que abre Configurações ganha uma linha própria (auto-criada
  // vazia por getSettingsByUserId). O LIMIT 1 antigo podia pegar a linha de
  // qualquer usuário SEM CNPJ e bloquear o contrato mesmo com o CNPJ salvo por
  // outro admin. Agora: coleta o CNPJ de TODAS as linhas de settings da org e
  // cai para organizations.cnpj (espelho do updateSchool) antes de falhar.
  const { settings: settingsTable } = await import("../../drizzle/schema");
  const cnpjRows = await db.select({ schoolCnpj: settingsTable.schoolCnpj })
    .from(settingsTable)
    .where(and(eq(settingsTable.organizationId, orgId), isNotNull(settingsTable.schoolCnpj)));
  const [orgCnpjRow] = await db.select({ cnpj: organizations.cnpj })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const cnpjCandidates: Array<string | null> = [
    ...cnpjRows.map((r: { schoolCnpj: string | null }) => r.schoolCnpj),
    orgCnpjRow?.cnpj ?? null,
  ];
  if (!cnpjCandidates.some(c => isValidCNPJ(c))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cadastre o CNPJ válido da escola em Configurações > Dados da Escola antes de emitir contratos.",
    });
  }

  const { prepareContractRender, getNextContractNumber, addContractEvent, buildDefaultTemplateContent } = await import("../services/contractService");
  const { providerFromIntegration } = await import("../services/signature");

  const prepared = await prepareContractRender(db, orgId, input.studentId, input.templateId, {
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    monthlyFeeOverride: input.monthlyFeeOverride ?? null,
  });

  const student = prepared.student;
  const template = prepared.template;
  const contractNumber = await getNextContractNumber(db, orgId);
  const title = prepared.title;

  const provider = providerFromIntegration(integration);
  
  // ─── Se o aluno for menor ou tiver responsável cadastrado, o signatário legal é o responsável
  const hasGuardian = Boolean(student.guardianName?.trim() || student.guardianEmail?.trim());
  const signerFullName = hasGuardian && student.guardianName?.trim() ? student.guardianName.trim() : student.name;
  const signerEmail = hasGuardian && student.guardianEmail?.trim() ? student.guardianEmail.trim() : student.email;
  const signerPhone = hasGuardian && student.guardianPhone?.trim() ? student.guardianPhone.trim() : (student.phone || null);

  const signMessage = hasGuardian
    ? `Olá ${signerFullName}! Sua escola enviou o contrato "${title}" (#${contractNumber}) referente ao(à) aluno(a) ${student.name} para assinatura digital.`
    : `Olá ${student.name}! Sua escola enviou o contrato "${title}" (#${contractNumber}) para assinatura digital.`;

  // ─── Sanitização segura de datas para colunas DATE e TIMESTAMP do Postgres
  const parseSafeDate = (val?: string | null): string | null => {
    if (!val || typeof val !== "string" || !val.trim()) return null;
    const match = val.trim().match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const parseSafeTimestamp = (val?: string | null): Date | null => {
    if (!val || typeof val !== "string" || !val.trim()) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const safeStartDate = parseSafeDate(input.startDate);
  const safeEndDate = parseSafeDate(input.endDate);
  const safeExpiresAt = parseSafeTimestamp(input.endDate);

  const result = await provider.createSignProcess({
    documentName: `${title}.pdf`,
    pdfBuffer: prepared.pdfBuffer,
    signer: {
      fullName: signerFullName,
      email: signerEmail,
      phone: signerPhone,
    },
    message: signMessage,
    expiresAt: safeExpiresAt,
  });

  const monthlyFeeRaw = prepared.variables.monthly_fee;
  const storedFee = monthlyFeeRaw && monthlyFeeRaw !== "__________" ? monthlyFeeRaw : null;

  const [newContract] = await db.insert(contracts).values({
    organizationId: orgId,
    userId: user.id,
    studentId: student.id,
    contractNumber,
    templateId: template.id,
    templateContentSnapshot: template.content || buildDefaultTemplateContent(),
    monthlyFee: storedFee,
    dueDay: student.dueDay ? Number(student.dueDay) : null,
    startDate: safeStartDate,
    endDate: safeEndDate,
    title,
    status: "aguardando_assinatura",
    provider: "assinafy",
    assinafyDocId: result.providerDocumentId,
    assinafySignUrl: result.signUrl,
    sentAt: result.sentAt ? new Date(result.sentAt) : new Date(),
    expiresAt: safeExpiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await addContractEvent(db as any, newContract.id, "contrato_criado", `Contrato ${contractNumber} criado`, null, { template: template.name });
  await addContractEvent(db as any, newContract.id, "contrato_enviado", "Contrato enviado para assinatura", null, { signUrl: result.signUrl });

  try {
    const origin = ENV.appUrl;
    if (origin) {
      await provider.configureWebhook(`${origin.replace(/\/$/, "")}/api/webhooks/assinafy`);
    }
  } catch (e: any) {
    console.warn(`[Contracts] Falha ao configurar webhook da conta Assinafy (org ${orgId}):`, e?.message || e);
  }

  return { contract: newContract, signUrl: result.signUrl };
}

// ─── Rate Limiter Persistente WhatsApp (Anti-Ban) ──────────────────────────
export async function checkAndIncrementWhatsAppRateLimit(
  db: any,
  organizationId: number,
  userId?: number,
  maxPerHour: number = 30
): Promise<boolean> {
  if (!db || !organizationId) return true;
  const now = new Date();
  // Janela horária truncada (ex: 2026-08-22 16:00:00)
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);

  try {
    const { whatsappRateLimits } = await import("../../drizzle/schema");
    const [existing] = await db
      .select()
      .from(whatsappRateLimits)
      .where(
        and(
          eq(whatsappRateLimits.organizationId, organizationId),
          eq(whatsappRateLimits.windowStart, windowStart)
        )
      )
      .limit(1);

    if (existing) {
      if (existing.messageCount >= maxPerHour) {
        return false;
      }
      await db
        .update(whatsappRateLimits)
        .set({
          messageCount: sql`${whatsappRateLimits.messageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(whatsappRateLimits.id, existing.id));
      return true;
    } else {
      await db.insert(whatsappRateLimits).values({
        organizationId,
        userId: userId || null,
        windowStart,
        messageCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return true;
    }
  } catch (err) {
    debugLog("[RateLimit] Falha ao verificar/persistir rate limit de WhatsApp, fallback para permissivo:", err);
    return true;
  }
}

// ─── Idempotência de Webhooks ───────────────────────────────────────────────
export async function registerWebhookEventOnce(
  db: any,
  gateway: string,
  gatewayEventId: string,
  eventType: string,
  organizationId?: number,
  payload?: any
): Promise<{ isDuplicate: boolean; eventId?: number }> {
  if (!db || !gatewayEventId) return { isDuplicate: false };

  try {
    const { webhookEvents } = await import("../../drizzle/schema");
    const [existing] = await db
      .select({ id: webhookEvents.id, status: webhookEvents.status })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.gateway, gateway),
          eq(webhookEvents.gatewayEventId, gatewayEventId)
        )
      )
      .limit(1);

    if (existing) {
      return { isDuplicate: true, eventId: existing.id };
    }

    const [inserted] = await db
      .insert(webhookEvents)
      .values({
        gateway,
        gatewayEventId,
        eventType,
        organizationId: organizationId || null,
        payload: payload || {},
        status: "received",
        createdAt: new Date(),
      })
      .returning({ id: webhookEvents.id });

    return { isDuplicate: false, eventId: inserted?.id };
  } catch (err) {
    debugLog("[WebhookIdempotency] Erro ao registrar evento único:", err);
    return { isDuplicate: false };
  }
}

// ─── Resolução do gateway de pagamento ativo da escola (RN-001 do PRD InfinitePay) ──
// Fonte única da regra "qual gateway está ativo": selecionado E configurado.
// Fallback (selecionado sem credencial): asaas > mercadopago > infinitepay (paridade
// do comportamento anterior do enrollmentRouter, com InfinitePay por último).
export type PaymentGatewayName = "asaas" | "mercadopago" | "infinitepay";
export function resolveActivePaymentGateway(
  s:
    | {
        paymentGateway?: string | null;
        asaasApiKey?: string | null;
        asaasEnabled?: number | boolean | null;
        mpAccessToken?: string | null;
        infinitepayHandle?: string | null;
        infinitepayEnabled?: number | boolean | null;
      }
    | null
    | undefined
): PaymentGatewayName | "none" {
  const hasAsaas = !!(s?.asaasApiKey && (s?.asaasEnabled === 1 || (s?.asaasEnabled as unknown) === true));
  const hasMercadoPago = !!s?.mpAccessToken;
  const hasInfinitePay = !!(
    s?.infinitepayHandle &&
    (s?.infinitepayEnabled === 1 || (s?.infinitepayEnabled as unknown) === true)
  );

  const selected = (s?.paymentGateway || "asaas") as PaymentGatewayName;
  if (selected === "mercadopago" && hasMercadoPago) return "mercadopago";
  if (selected === "infinitepay" && hasInfinitePay) return "infinitepay";
  if (selected === "asaas" && hasAsaas) return "asaas";

  if (hasAsaas) return "asaas";
  if (hasMercadoPago) return "mercadopago";
  if (hasInfinitePay) return "infinitepay";
  return "none";
}