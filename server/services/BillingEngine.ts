import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { paymentDues, settings, billingAuditLogs } from "../../drizzle/schema";

export interface SchoolBillingSettings {
  lateFeeEnabled: boolean;
  lateFeeType: "fixed" | "percentage";
  lateFeeValue: number;
  interestEnabled: boolean;
  interestType: "daily" | "monthly";
  interestRate: number;
  graceDays: number;
  autoUpdateInvoice: boolean;
  showFeeBreakdown: boolean;
  earlyDiscountEnabled: boolean;
  earlyDiscountType: "fixed" | "percentage";
  earlyDiscountValue: number;
  earlyDiscountDays: number;
}

export interface CalculationResult {
  invoiceId: number;
  originalAmount: number;
  updatedAmount: number;
  lateFeeAmount: number;
  interestAmount: number;
  earlyDiscountAmount: number;
  daysOverdue: number;
  graceDays: number;
  totalDiscount: number;
  calculationDate: Date;
  schoolSettingsUsed: SchoolBillingSettings;
}

export interface CalculateInvoiceOptions {
  origin?: "Financeiro" | "WhatsApp" | "Área do Aluno" | "API" | "PIX" | "System";
  userId?: number;
  forceRecalculate?: boolean;
  targetDate?: Date;
}

// Memory Cache (5 minutes TTL)
interface CacheEntry {
  result: CalculationResult;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export class BillingEngine {
  /**
   * Extrai e normaliza as configurações financeiras do objeto de settings da escola
   */
  public static extractSchoolSettings(schoolSettingsObj: any): SchoolBillingSettings {
    if (!schoolSettingsObj) {
      return {
        lateFeeEnabled: true,
        lateFeeType: "percentage",
        lateFeeValue: 2.0,
        interestEnabled: true,
        interestType: "daily",
        interestRate: 0.33,
        graceDays: 3,
        autoUpdateInvoice: true,
        showFeeBreakdown: true,
        earlyDiscountEnabled: false,
        earlyDiscountType: "percentage",
        earlyDiscountValue: 5.0,
        earlyDiscountDays: 0,
      };
    }

    return {
      lateFeeEnabled: Number(schoolSettingsObj.lateFeeEnabled ?? 1) === 1,
      lateFeeType: (schoolSettingsObj.lateFeeType === "fixed" ? "fixed" : "percentage") as "fixed" | "percentage",
      lateFeeValue: Number(schoolSettingsObj.lateFeeValue ?? 2.0),
      interestEnabled: Number(schoolSettingsObj.interestEnabled ?? 1) === 1,
      interestType: (schoolSettingsObj.interestType === "monthly" ? "monthly" : "daily") as "daily" | "monthly",
      interestRate: Number(schoolSettingsObj.interestRate ?? 0.33),
      graceDays: Number(schoolSettingsObj.graceDays ?? 3),
      autoUpdateInvoice: Number(schoolSettingsObj.autoUpdateInvoice ?? 1) === 1,
      showFeeBreakdown: Number(schoolSettingsObj.showFeeBreakdown ?? 1) === 1,
      earlyDiscountEnabled: Number(schoolSettingsObj.earlyDiscountEnabled ?? 0) === 1,
      earlyDiscountType: (schoolSettingsObj.earlyDiscountType === "fixed" ? "fixed" : "percentage") as "fixed" | "percentage",
      earlyDiscountValue: Number(schoolSettingsObj.earlyDiscountValue ?? 5.0),
      earlyDiscountDays: Number(schoolSettingsObj.earlyDiscountDays ?? 0),
    };
  }

  /**
   * Função pura de cálculo de mensalidade.
   * Não altera o banco nem realiza I/O.
   */
  public static computeInvoiceAmounts(
    invoice: {
      id: number;
      amount: string | number;
      originalAmount?: string | number | null;
      dueDate: string | Date;
      status: string;
      paidAt?: string | Date | null;
    },
    schoolSettings: SchoolBillingSettings,
    targetDate: Date = new Date()
  ): CalculationResult {
    const rawOriginal = invoice.originalAmount ?? invoice.amount;
    const originalAmount = Math.round(Number(rawOriginal) * 100) / 100;

    // Se já estiver pago, mantém o valor registrado e zerados juros/multa futuros
    if (invoice.status === "pago") {
      const finalPaidAmount = Math.round(Number(invoice.amount) * 100) / 100;
      // Desconto efetivamente aplicado no pagamento (valor original − valor pago)
      const paidDiscount = Math.max(0, Math.round((originalAmount - finalPaidAmount) * 100) / 100);
      return {
        invoiceId: invoice.id,
        originalAmount,
        updatedAmount: finalPaidAmount,
        lateFeeAmount: 0,
        interestAmount: 0,
        earlyDiscountAmount: paidDiscount,
        daysOverdue: 0,
        graceDays: schoolSettings.graceDays,
        totalDiscount: paidDiscount,
        calculationDate: targetDate,
        schoolSettingsUsed: schoolSettings,
      };
    }

    // Normaliza datas para comparar início do dia local sem interferência de fuso horário
    const parseLocalDate = (d: string | Date): Date => {
      if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dateStr = String(d).slice(0, 10);
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
      const parsed = new Date(d);
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };

    const dueZero = parseLocalDate(invoice.dueDate);
    const nowZero = parseLocalDate(targetDate);

    const diffTime = nowZero.getTime() - dueZero.getTime();
    const elapsedDays = Math.floor(diffTime / (1000 * 3600 * 24));

    let daysOverdue = 0;
    let lateFeeAmount = 0;
    let interestAmount = 0;
    let earlyDiscountAmount = 0;

    // Se estiver vencido e além da carência
    if (elapsedDays > 0) {
      if (elapsedDays > schoolSettings.graceDays) {
        daysOverdue = elapsedDays;

        // Multa
        if (schoolSettings.lateFeeEnabled) {
          if (schoolSettings.lateFeeType === "percentage") {
            lateFeeAmount = (originalAmount * schoolSettings.lateFeeValue) / 100;
          } else {
            lateFeeAmount = schoolSettings.lateFeeValue;
          }
        }

        // Juros
        if (schoolSettings.interestEnabled) {
          if (schoolSettings.interestType === "daily") {
            interestAmount = (originalAmount * (schoolSettings.interestRate / 100)) * daysOverdue;
          } else if (schoolSettings.interestType === "monthly") {
            interestAmount = (originalAmount * (schoolSettings.interestRate / 100)) * (daysOverdue / 30);
          }
        }
      }
    } else if (schoolSettings.earlyDiscountEnabled) {
      // Se estiver em dia (pagamento antecipado ou no próprio vencimento)
      const daysBeforeDueDate = Math.abs(elapsedDays);
      if (daysBeforeDueDate >= schoolSettings.earlyDiscountDays) {
        if (schoolSettings.earlyDiscountType === "percentage") {
          earlyDiscountAmount = (originalAmount * schoolSettings.earlyDiscountValue) / 100;
        } else {
          earlyDiscountAmount = schoolSettings.earlyDiscountValue;
        }
      }
    }

    // Arredondamento monetário para 2 casas
    lateFeeAmount = Math.round(lateFeeAmount * 100) / 100;
    interestAmount = Math.round(interestAmount * 100) / 100;
    earlyDiscountAmount = Math.round(earlyDiscountAmount * 100) / 100;
    const totalDiscount = earlyDiscountAmount;

    const updatedAmount = Math.max(0, Math.round((originalAmount + lateFeeAmount + interestAmount - totalDiscount) * 100) / 100);

    return {
      invoiceId: invoice.id,
      originalAmount,
      updatedAmount,
      lateFeeAmount,
      interestAmount,
      earlyDiscountAmount,
      daysOverdue,
      graceDays: schoolSettings.graceDays,
      totalDiscount,
      calculationDate: targetDate,
      schoolSettingsUsed: schoolSettings,
    };
  }

  /**
   * Calcula o valor da cobrança buscando no banco de dados e aplicando regras da escola
   */
  public static async calculateInvoice(
    invoiceId: number,
    options: CalculateInvoiceOptions = {}
  ): Promise<CalculationResult> {
    const cacheKey = `${invoiceId}_${options.targetDate ? options.targetDate.toISOString().slice(0, 10) : "today"}`;

    if (!options.forceRecalculate) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.result;
      }
    }

    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    // 1. Buscar cobrança
    const [invoice] = await db
      .select()
      .from(paymentDues)
      .where(eq(paymentDues.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Cobrança com ID ${invoiceId} não encontrada.`);
    }

    // 2. Buscar configurações da escola (por organizationId ou userId)
    let schoolSettingsObj: any = null;
    if (invoice.organizationId) {
      const [setting] = await db
        .select()
        .from(settings)
        .where(eq(settings.organizationId, invoice.organizationId))
        .limit(1);
      schoolSettingsObj = setting;
    }

    if (!schoolSettingsObj && invoice.userId) {
      const [setting] = await db
        .select()
        .from(settings)
        .where(eq(settings.userId, invoice.userId))
        .limit(1);
      schoolSettingsObj = setting;
    }

    const schoolSettings = this.extractSchoolSettings(schoolSettingsObj);
    const result = this.computeInvoiceAmounts(invoice, schoolSettings, options.targetDate);

    // Salvar cache em memória
    cache.set(cacheKey, { result, timestamp: Date.now() });

    // Salvar Log de Auditoria se informado a origem
    if (options.origin) {
      try {
        await db.insert(billingAuditLogs).values({
          organizationId: invoice.organizationId ?? null,
          invoiceId: invoice.id,
          originalAmount: result.originalAmount.toFixed(2),
          lateFeeAmount: result.lateFeeAmount.toFixed(2),
          interestAmount: result.interestAmount.toFixed(2),
          daysOverdue: result.daysOverdue,
          updatedAmount: result.updatedAmount.toFixed(2),
          userId: options.userId ?? null,
          origin: options.origin,
        });
      } catch (err) {
        console.error("[BillingEngine] Erro ao registrar log de auditoria:", err);
      }
    }

    return result;
  }

  /**
   * Persiste o valor REAL (com desconto por pagamento antecipado / juros vigentes)
   * da fatura, preservando o valor original da mensalidade em `originalAmount`.
   * Deve ser chamado com a fatura ainda NÃO paga, para o desconto ser considerado.
   * Usado na baixa/pagamento e na geração de cobrança (para o link cobrar o valor correto).
   */
  public static async persistPaymentAmount(
    invoiceId: number,
    targetDate: Date = new Date()
  ): Promise<{ paid: number; original: number } | null> {
    const db = await getDb();
    if (!db) return null;

    const [current] = await db
      .select({ amount: paymentDues.amount, notes: paymentDues.notes })
      .from(paymentDues)
      .where(eq(paymentDues.id, invoiceId))
      .limit(1);

    const calc = await this.calculateInvoice(invoiceId, { targetDate });
    let paid = Math.round(calc.updatedAmount * 100) / 100;
    // AUDITORIA (DP-025): fatura com "Valor cheio aplicado" (bolsa em atraso) não pode
    // ser sobrescrita para baixo ao gerar link/baixa — senão a escola subcobra para sempre.
    if ((current?.notes || "").includes("Valor cheio aplicado") && Number(current?.amount || 0) > paid) {
      paid = Math.round(Number(current!.amount) * 100) / 100;
    }
    const original = Math.round(calc.originalAmount * 100) / 100;

    await db
      .update(paymentDues)
      .set({
        amount: paid.toFixed(2),
        originalAmount: original.toFixed(2),
        updatedAmountCache: paid.toFixed(2),
        lastCalculation: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentDues.id, invoiceId));

    this.clearCache();
    return { paid, original };
  }

  /**
   * Enriquece uma lista de cobranças em lote com os cálculos do BillingEngine
   */
  public static async enrichInvoicesList(
    invoicesList: any[],
    schoolSettingsObj?: any
  ): Promise<Array<any & { calculation: CalculationResult }>> {
    if (!invoicesList || invoicesList.length === 0) return [];

    const db = await getDb();
    const schoolSettings = this.extractSchoolSettings(schoolSettingsObj);

    return invoicesList.map((inv) => {
      const calculation = this.computeInvoiceAmounts(inv, schoolSettings);
      return {
        ...inv,
        amount: calculation.updatedAmount.toFixed(2), // Garante que a propriedade amount do objeto retornado seja atualizada
        calculation,
      };
    });
  }

  /**
   * Limpa o cache interno do BillingEngine
   */
  public static clearCache(): void {
    cache.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANOS & BOLSAS — regra comercial "atrasou → cobra valor cheio"
//
// Faturas em aberto de alunos com plano bolsista (isBolsa + valorCheio) que
// cruzarem o dia limite do plano passam a valer o valor cheio:
//  • Fatura SEM emissão em gateway (Asaas/MP) → o valor da própria fatura é
//    ajustado para o valor cheio (originalAmount preserva o valor da bolsa);
//  • Fatura JÁ EMITIDA em gateway → criada uma fatura COMPLEMENTAR da
//    diferença (o link do gateway continua válido).
// Idempotente: nada re-aplica enquanto `amount >= valorCheio` e o complemento
// é dedup por (aluno, mês/ano, notes).
// ═══════════════════════════════════════════════════════════════════════════════

import { and as _and, ne as _ne, inArray as _inArray, isNotNull as _isNotNull, sql as _sql, eq as _eq } from "drizzle-orm";
import { schoolPlans, students as _students } from "../../drizzle/schema";

export interface ScholarshipLateResult {
  adjusted: number;
  complements: number;
}

const SCHOLARSHIP_RUN_INTERVAL_MS = 10 * 60 * 1000; // guard: job roda a cada 1 min
let _scholarshipLastRunAt = 0;

export async function applyScholarshipLateFullValue(): Promise<ScholarshipLateResult> {
  const result: ScholarshipLateResult = { adjusted: 0, complements: 0 };
  const now = Date.now();
  if (now - _scholarshipLastRunAt < SCHOLARSHIP_RUN_INTERVAL_MS) return result;
  _scholarshipLastRunAt = now;

  const db = await getDb();
  if (!db) return result;

  // 1. Planos bolsistas ativos com valor cheio definido
  const plans = await db.select().from(schoolPlans)
    .where(_and(_eq(schoolPlans.isBolsa, true), _eq(schoolPlans.ativo, true), _isNotNull(schoolPlans.valorCheio)));
  const planById = new Map<number, (typeof plans)[number]>();
  for (const p of plans) {
    if (Number(p.valorCheio) > 0) planById.set(p.id, p);
  }
  const planIds = Array.from(planById.keys());
  if (planIds.length === 0) return result;

  // 2. Faturas em aberto de alunos vinculados a esses planos
  const rows = await db.select({
    id: paymentDues.id,
    organizationId: paymentDues.organizationId,
    userId: paymentDues.userId,
    studentId: paymentDues.studentId,
    amount: paymentDues.amount,
    dueDate: paymentDues.dueDate,
    month: paymentDues.month,
    year: paymentDues.year,
    notes: paymentDues.notes,
    originalAmount: paymentDues.originalAmount,
    asaasId: paymentDues.asaasId,
    mpPaymentId: paymentDues.mpPaymentId,
    schoolPlanId: _students.schoolPlanId,
  }).from(paymentDues)
    .innerJoin(_students, _eq(_students.id, paymentDues.studentId))
    .where(_and(
      _ne(paymentDues.status, 'pago'),
      _isNotNull(paymentDues.organizationId),
      _inArray(_students.schoolPlanId, planIds),
    ));

  // Hoje no fuso de Brasília (YYYY-MM-DD) — comparação de data como string
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  for (const row of rows) {
    const plan = row.schoolPlanId != null ? planById.get(row.schoolPlanId) : undefined;
    if (!plan || row.organizationId == null) continue;

    const valorCheio = Number(plan.valorCheio);
    const amountAtual = Number(row.amount);
    if (!(valorCheio > amountAtual)) continue; // nada a aplicar (ou já aplicado)

    // Dia limite aplicável: menor dia do plano >= dia de vencimento; senão o maior
    const dueStr = String(row.dueDate).slice(0, 10);
    const dueDay = parseInt(dueStr.slice(8, 10), 10);
    const limites = (plan.diasLimite || "").split(",")
      .map((d) => parseInt(d, 10))
      .filter((d) => Number.isFinite(d) && d >= 1 && d <= 31);
    if (limites.length === 0) continue;
    const futuros = limites.filter((d) => d >= dueDay).sort((a, b) => a - b);
    const limiteDia = futuros[0] ?? limites[limites.length - 1];
    const limiteStr = `${dueStr.slice(0, 7)}-${String(limiteDia).padStart(2, "0")}`;

    // Ainda no prazo → não aplica
    if (todayStr <= limiteStr) continue;

    if (row.asaasId || row.mpPaymentId) {
      // ── Fatura já emitida em gateway: COMPLEMENTO da diferença (dedup POR FATURA de origem) ──
      // AUDITORIA (DP-025): dedup antigo por aluno+mês+ano impedia complemento de uma 2ª fatura.
      const [dup] = await db.select({ id: paymentDues.id }).from(paymentDues)
        .where(_and(
          _eq(paymentDues.organizationId, row.organizationId),
          _eq(paymentDues.studentId, row.studentId),
          _eq(paymentDues.month, row.month),
          _eq(paymentDues.year, row.year),
          _sql`${paymentDues.notes} LIKE ${"%ref #" + row.id + "%"}`,
        ))
        .limit(1);
      if (dup) continue;
      await db.insert(paymentDues).values({
        organizationId: row.organizationId,
        userId: row.userId,
        studentId: row.studentId,
        amount: (valorCheio - amountAtual).toFixed(2),
        dueDate: row.dueDate,
        month: row.month,
        year: row.year,
        status: 'pendente' as const,
        notes: `Complemento valor cheio — Plano ${plan.nome} (ref #${row.id}, atraso após dia ${limiteDia})`,
        billingPeriodicity: 'mensal',
      });
      result.complements++;
    } else {
      // ── Fatura apenas interna: ajusta o valor na própria fatura ──
      if ((row.notes || "").includes("Valor cheio aplicado")) continue;
      await db.update(paymentDues).set({
        amount: valorCheio.toFixed(2),
        originalAmount: row.originalAmount ?? amountAtual.toFixed(2),
        notes: [row.notes, `Valor cheio aplicado (atraso após dia ${limiteDia})`].filter(Boolean).join(" • "),
        updatedAt: new Date(),
      }).where(_eq(paymentDues.id, row.id));
      result.adjusted++;
    }
  }

  return result;
}
