import { debugLog } from "../_core/logger";
import { calculateAndSaveProfessorPayment } from "../services/ProfessorPaymentService";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { fcmRouter } from "../fcmRouter";
import { publicProcedure, protectedProcedure, professorProcedure, studentProcedure, adminProcedure, router } from "../_core/trpc";
import { slotAdvanceRouter } from "../slotAdvanceRouter";
import {
  getDashboardStats,
  getMonthlyStats,
  getStudentsWithInstrument,
  getRecentLessons,
  getInstrumentsWithCount,
  getLessonsByDayOfWeek,
  getDb,
  getSettingsByUserId,
  upsertSettings,
  updateUserProfile,
  getExperimentalStats,
} from "../db";
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs } from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lt, lte, asc, ne, or, inArray, aliasedTable, ilike, isNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "../_core/notification";
import { handleDbError } from "../utils/error_handler";
import { TRPCError } from "@trpc/server";

import crypto from "crypto";
import { decryptSecret } from "../utils/integrationCrypto";
import { createAsaasCustomer, createAsaasCharge, deleteAsaasCharge, getAsaasPixQrCode, getAsaasBalance } from "../utils/asaas";
import { getMPBalance } from "../utils/mercadopago";
import { resolveOrgAsaasApiKey, resolveOrgMpAccessToken } from "./helpers";
import { buildUserContext } from "../utils/aiContext";
import { getSystemPrompt } from "../utils/aiPrompts";
import { callGemini, genAI } from "../utils/gemini";
import { BillingEngine } from "../services/BillingEngine";
import { sendWhatsAppMessage, startWhatsAppSession, getWhatsAppSessionStatus, logoutWhatsAppSession } from "../utils/whatsapp";
import { nanoid } from "nanoid";
import { sdk } from "../_core/sdk";
import { sendVerificationEmail, sendSimpleEmail } from "../_core/email";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import { superAdminRouter } from "../superAdminRouter";
import { pairingActiveSessions } from "../automationJob";
import { checkFileMagicBytes } from "../utils/fileSecurity";
import { reportEngineRouter } from "../reportEngineRouter";
import { marketingRouter } from "../marketingRouter";
import { analyticsRouter } from "../analyticsRouter";
import { crmRouter } from "../crmRouter";
import { studioRoomsRouter } from "../studioRoomsRouter";
import { enrollmentRouter } from "../enrollmentRouter";
import { advancedAiRouter } from "../advancedAiRouter";
import { chatbotFlowRouter } from "../chatbotFlowRouter";
import { schoolAiRouter } from "../schoolAiRouter";
import { fiscalRouter } from "../fiscalRouter";
import { FiscalService } from "../services/fiscal/FiscalService";
import { loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract, getTodayBR, markOverdueRows, buildDueDateSeries } from "./helpers";
/**
 * AUDITORIA (pré-lançamento): trava anti-duplicação de cobrança por mensalidade.
 * Janela curta (15s) que absorve duplo clique / duas abas sem impedir novas
 * tentativas legítimas depois de uma falha. Não substitui índice único, mas
 * elimina a corrida mais comum (mesmo processo).
 */
const gatewayChargeAttempts = new Map<number, number>();
function acquireGatewayChargeLock(paymentDueId: number) {
  const now = Date.now();
  const last = gatewayChargeAttempts.get(paymentDueId) || 0;
  if (now - last < 15000) {
    throw new TRPCError({ code: "CONFLICT", message: "Esta cobrança já está sendo gerada. Aguarde alguns segundos e tente novamente." });
  }
  gatewayChargeAttempts.set(paymentDueId, now);
  if (gatewayChargeAttempts.size > 500) {
    gatewayChargeAttempts.forEach((v, k) => { if (now - v > 60000) gatewayChargeAttempts.delete(k); });
  }
}

export const financeiroRouters = {
  billingEngine: router({
    calculateInvoice: protectedProcedure
      .input(z.object({
        invoiceId: z.number(),
        origin: z.enum(["Financeiro", "WhatsApp", "Área do Aluno", "API", "PIX", "System"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        // Isolamento multi-tenant: só calcula fatura da própria escola
        const db = await getDb();
        if (db) {
          const [owns] = await db.select({ id: paymentDues.id }).from(paymentDues)
            .where(and(eq(paymentDues.id, input.invoiceId), eq(paymentDues.organizationId, ctx.user.organizationId!)))
            .limit(1);
          if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada." });
        }
        return await BillingEngine.calculateInvoice(input.invoiceId, {
          origin: input.origin ?? "Financeiro",
          userId: ctx.user.id,
        });
      }),
  }),

  paymentDues: router({
    list: protectedProcedure
      .input(z.object({
        month: z.number().optional(),
        year: z.number().optional(),
        status: z.enum(["pendente", "pago", "atrasado"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;
        const now = new Date();
        const m = input?.month ?? new Date().getMonth() + 1;
        const y = input?.year ?? new Date().getFullYear();
        const rows = await db.select({
          id: paymentDues.id,
          studentId: paymentDues.studentId,
          amount: paymentDues.amount,
          originalAmount: paymentDues.originalAmount,
          dueDate: paymentDues.dueDate,
          paidAt: paymentDues.paidAt,
          status: paymentDues.status,
          month: paymentDues.month,
          year: paymentDues.year,
          notes: paymentDues.notes,
          asaasId: paymentDues.asaasId,
          asaasPaymentLink: paymentDues.asaasPaymentLink,
          asaasBillingType: paymentDues.asaasBillingType,
          mpPaymentId: paymentDues.mpPaymentId,
          mpPaymentLink: paymentDues.mpPaymentLink,
          infinitepayPaymentLink: paymentDues.infinitepayPaymentLink,
          receiptUrl: paymentDues.receiptUrl,
          studentName: students.name,
          studentPhone: students.phone,
          email: students.email,
          lessonType: students.lessonType,
          studentStatus: students.status,
        })
          .from(paymentDues)
          .leftJoin(students, eq(paymentDues.studentId, students.id))
          .where(and(
            eq(paymentDues.organizationId, orgId),
            eq(paymentDues.month, m), 
            eq(paymentDues.year, y), 
            (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : eq(paymentDues.userId, ctx.user.id)
          ))
          .orderBy(asc(paymentDues.dueDate));

        const schoolSettingsObj = await getSettingsByUserId(orgId, ctx.user.id);

        const enrichedRows = await BillingEngine.enrichInvoicesList(rows, schoolSettingsObj);

        const today = getTodayBR();
        const mappedRows = markOverdueRows(enrichedRows, today);

        if (input?.status) return mappedRows.filter(r => r.status === input.status);
        return mappedRows;
      }),

    create: protectedProcedure
      .input(z.object({
        studentId: z.number(),
        amount: z.number(),
        dueDate: z.string(),
        month: z.number(),
        year: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
   
          const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          // Security: verify student ownership
          const [ownedStudent] = await db.select({ id: students.id, name: students.name, email: students.email, phone: students.phone, cpf: students.cpf }).from(students)
              .where(and(
                eq(students.id, input.studentId as number), 
                eq(students.organizationId, orgId), 
                isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
              ))
              .limit(1);
          
          if (!ownedStudent) {
              throw new TRPCError({ code: "FORBIDDEN", message: "O aluno selecionado não existe ou não pertence ao seu perfil." });
          }

          // AUDIT-P1 FIX (duplicidade financeira): impedir criar 2 mensalidades para o
          // mesmo aluno no mesmo mês/ano — protege contra duplo clique/requisição repetida.
          // Consistente com generateMonthly, que já pula (studentId, month, year) existentes.
          const [duplicateDue] = await db.select({ id: paymentDues.id, status: paymentDues.status })
            .from(paymentDues)
            .where(and(
              eq(paymentDues.organizationId, orgId),
              eq(paymentDues.studentId, input.studentId),
              eq(paymentDues.month, input.month),
              eq(paymentDues.year, input.year),
            ))
            .limit(1);
          if (duplicateDue) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Já existe uma mensalidade cadastrada para este aluno em ${String(input.month).padStart(2, "0")}/${input.year} (status: ${duplicateDue.status}). Edite o registro existente em vez de criar outro.`,
            });
          }

          const paymentData: any = {
            organizationId: orgId,
            userId: ctx.user.id,
            studentId: input.studentId,
            amount: input.amount.toFixed(2),
            dueDate: input.dueDate.slice(0, 10),
            month: input.month,
            year: input.year,
            status: "pendente",
            notes: input.notes ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const { createAsaasCustomer, createAsaasCharge } = await import('../utils/asaas');
          const [settingsData] = await db.select({ asaasEnabled: settings.asaasEnabled, asaasApiKey: settings.asaasApiKey }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);
          
          if (settingsData && settingsData.asaasEnabled === 1 && settingsData.asaasApiKey) {
            // BUG FIX: o select cru traz a chave CIFRADA (v1:...) — decifrar antes de usar na API
            const apiKey = decryptSecret(settingsData.asaasApiKey);
            // Get or create Asaas customer
            let asaasCustomerId: string | null = null;
            const [existingCustomer] = await db.select().from(asaasCustomers)
              .where(and(eq(asaasCustomers.studentId, input.studentId), eq(asaasCustomers.organizationId, orgId)))
              .limit(1);

            if (existingCustomer) {
              asaasCustomerId = existingCustomer.asaasCustomerId;
            } else {
              asaasCustomerId = await createAsaasCustomer({
                name: ownedStudent.name || 'Aluno',
                email: ownedStudent.email ?? undefined,
                phone: ownedStudent.phone ?? undefined,
                cpfCnpj: ownedStudent.cpf ?? undefined,
              }, apiKey);
              
              if (asaasCustomerId) {
                await db.insert(asaasCustomers).values({
                  organizationId: orgId,
                  studentId: input.studentId,
                  asaasCustomerId,
                });
              }
            }

            if (asaasCustomerId) {
              const dueDateObj = new Date(input.dueDate);
              const todayObj = new Date();
              todayObj.setHours(0, 0, 0, 0);
              const finalDueDate = dueDateObj < todayObj ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : input.dueDate.slice(0, 10);

              const charge = await createAsaasCharge({
                asaasCustomerId,
                billingType: 'UNDEFINED', // Let Asaas decide/offer multiple
                value: Number(input.amount.toFixed(2)),
                dueDate: finalDueDate,
                description: `Mensalidade ${input.month}/${input.year} - ${ownedStudent.name}`,
              }, apiKey);

              if (charge) {
                paymentData.asaasId = charge.id;
                paymentData.asaasPaymentLink = charge.invoiceUrl;
                paymentData.asaasBillingType = charge.billingType;
              }
            }
          }

          await db.insert(paymentDues).values(paymentData);
          return { success: true };
        } catch (error) {
          return handleDbError(error, "gerar a cobrança");
        }
      }),

    markPaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          
          // Buscar a mensalidade completa (incluindo asaasId e status)
          const [due] = await db.select()
            .from(paymentDues)
            .where(and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId)))
            .limit(1);

          // AUDIT-P1 FIX (idempotência): se a mensalidade JÁ está paga, retornar sucesso
          // sem reexecutar efeitos colaterais (cancelar cobrança Asaas, disparar NFS-e,
          // notificações). Evita duplicidade quando botão é clicado 2x ou quando o webhook
          // do gateway concorre com a baixa manual.
          if (due?.status === "pago") {
            return { success: true, alreadyPaid: true };
          }

          const [paymentDetails] = await db
            .select({
              studentName: students.name,
              amount: paymentDues.amount,
            })
            .from(paymentDues)
            .leftJoin(students, eq(paymentDues.studentId, students.id))
            .where(and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId)))
            .limit(1);

          // ── CRÍTICO-2 FIX: Cancelar cobrança aberta no Asaas ao dar baixa manual ──
          // Evita que o aluno pague novamente pelo link que ficou ativo
          // (AUDIT: o early-return acima já garante status !== 'pago' aqui)
          if (due?.asaasId) {
            try {
              const [settingsData] = await db
                .select({ asaasApiKey: settings.asaasApiKey })
                .from(settings)
                .where(eq(settings.userId, ctx.user.id))
                .limit(1);
              const { deleteAsaasCharge } = await import('../utils/asaas');
              await deleteAsaasCharge(due.asaasId, settingsData?.asaasApiKey ? decryptSecret(settingsData.asaasApiKey) : undefined);
              debugLog(`[MarkPaid] Cobrança Asaas cancelada (${due.asaasId}) — pagamento manual registrado`);
            } catch (e) {
              // Não bloqueia a baixa manual se o cancelamento falhar
              console.error(`[MarkPaid] Falha ao cancelar cobrança Asaas ${due?.asaasId}:`, e);
            }
            // Limpar referências Asaas — não espera mais webhook desta cobrança
            await db.update(paymentDues)
              .set({ asaasId: null, asaasPaymentLink: null, asaasBillingType: null })
              .where(eq(paymentDues.id, input.id));
          }

          // ── InfinitePay: não há endpoint de cancelamento remoto do link —
          // limpar as refs locais (o webhook tardio é tratado como duplicidade, RN-005)
          if (due?.infinitepayPaymentLink || due?.infinitepaySlug || due?.infinitepayPaymentId) {
            await db.update(paymentDues)
              .set({ infinitepayPaymentLink: null, infinitepaySlug: null, infinitepayPaymentId: null })
              .where(eq(paymentDues.id, input.id));
            debugLog(`[MarkPaid] Referências InfinitePay limpas — pagamento manual registrado`);
          }

          // BUG#3 FIX: Admin bypass — admin pode dar baixa em mensalidades de qualquer professor
          const isAdminMarkPaid = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const markPaidWhere = isAdminMarkPaid
            ? and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId))
            : and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId), eq(paymentDues.userId, ctx.user.id));

          // ── DESCONTO PRECISA SER PERSISTIDO (PRD Regras de Cobrança / fix mensalidade) ──
          // O BillingEngine calcula (juros/multa/desconto antecipado) mas NÃO gravava o
          // valor final — o registro pago ficava com o valor CHEIO. Ao dar baixa, aplica
          // o cálculo do dia e persiste o valor real (com desconto) em amount.
          try {
            const { BillingEngine } = await import("../services/BillingEngine");
            const calc = await BillingEngine.calculateInvoice(input.id, { targetDate: new Date() });
            const valorReal = Math.round(calc.updatedAmount * 100) / 100;
            const valorAtual = Number(due?.amount || 0);
            if (valorReal !== valorAtual) {
              await db.update(paymentDues)
                .set({
                  amount: valorReal.toFixed(2),
                  originalAmount: due?.originalAmount ?? (due?.amount ? Number(due.amount).toFixed(2) : null),
                  updatedAmountCache: valorReal.toFixed(2),
                  lastCalculation: new Date(),
                })
                .where(and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId)));
              debugLog(`[MarkPaid] Desconto/juros aplicado na baixa: ${valorAtual.toFixed(2)} → ${valorReal.toFixed(2)} (due ${input.id})`);
            }
          } catch (billingErr) {
            console.warn(`[MarkPaid] Não foi possível recalcular valor da baixa (due ${input.id}):`, billingErr);
          }

          await db.update(paymentDues)
            .set({ status: "pago", paidAt: new Date(), updatedAt: new Date() })
            .where(markPaidWhere);
          
          // Cancelar lembretes pendentes desta mensalidade
          await db.update(reminders)
            .set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
            .where(and(eq(reminders.paymentDueId, input.id), eq(reminders.organizationId, orgId), eq(reminders.userId, ctx.user.id), eq(reminders.status, "pendente")));
          
          if (paymentDetails) {
            const [freshDue] = await db
              .select({ amount: paymentDues.amount })
              .from(paymentDues)
              .where(eq(paymentDues.id, input.id))
              .limit(1);
            const valor = Number(freshDue?.amount ?? paymentDetails.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            await notifyUser(ctx.user.id, {
              title: "Pagamento Confirmado",
              content: `O aluno ${paymentDetails.studentName || "Aluno"} teve o pagamento confirmado no valor de ${valor}.`,
            });
          }

          // ── Disparo assíncrono de NFS-e automática se ativado na escola ──
          (async () => {
            try {
              const [fComp] = await db.select({ autoEmit: fiscalCompanies.autoEmitOnPayment })
                .from(fiscalCompanies).where(eq(fiscalCompanies.organizationId, orgId)).limit(1);
              if (fComp && fComp.autoEmit) {
                await FiscalService.createInvoiceForPayment(orgId, input.id, {
                  userId: ctx.user.id,
                  userName: ctx.user.name || "Sistema",
                  autoQueue: true,
                });
              }
            } catch (fErr: any) {
              console.warn(`[AutoNFS-e] Não foi possível enfileirar NFS-e para pagamento #${input.id}:`, fErr.message);
            }
          })().catch(() => {});

          return { success: true };
        } catch (error) {
          return handleDbError(error, "marcar mensalidade como paga");
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        amount: z.number().optional(),
        dueDate: z.string().optional(),
        paidAt: z.string().nullable().optional(),
        status: z.enum(["pendente", "pago", "atrasado"]).optional(),
        notes: z.string().nullable().optional(),
        updateFutureDues: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const { id, updateFutureDues, ...data } = input;
          
          // BUG#4 FIX: Admin bypass — admin pode editar mensalidades de qualquer professor
          const isAdminUpdate = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const updateWhere = isAdminUpdate
            ? and(eq(paymentDues.id, id), eq(paymentDues.organizationId, orgId))
            : and(eq(paymentDues.id, id), eq(paymentDues.organizationId, orgId), eq(paymentDues.userId, ctx.user.id));

          // Buscar registro atual para obter o studentId se necessário
          const currentPayment = await db.select()
            .from(paymentDues)
            .where(updateWhere)
            .limit(1)
            .then(res => res[0]);

          if (!currentPayment) throw new Error("Mensalidade não encontrada");

          // BUG-001 FIX: ao dar baixa (status pago) sem valor explícito, aplica o desconto
          // por pagamento antecipado e grava o VALOR PAGO (com desconto) + o valor original.
          if (data.status === "pago" && data.amount === undefined && currentPayment.status !== "pago") {
            try {
              const { BillingEngine } = await import("../services/BillingEngine");
              await BillingEngine.persistPaymentAmount(id, new Date());
            } catch (e) {
              console.warn("[paymentDues.update] Falha ao aplicar valor pago com desconto:", e);
            }
          }

          const updateData: any = {
            ...data,
            updatedAt: new Date(),
          };

          if (data.dueDate) updateData.dueDate = data.dueDate.slice(0, 10);
          if (data.paidAt !== undefined) {
             updateData.paidAt = data.paidAt ? new Date(data.paidAt) : null;
          } else if (data.status === 'pago' && !currentPayment.paidAt) {
             updateData.paidAt = new Date();
          }
          if (data.amount !== undefined) updateData.amount = data.amount.toFixed(2);

          const becomingPaid = data.status === "pago" && currentPayment.status !== "pago";

          await db.update(paymentDues)
            .set(updateData)
            .where(updateWhere);

          // AUDITORIA: baixa via edição aplica os MESMOS efeitos da baixa oficial
          // (cancela links de gateway ainda pagáveis, lembretes e dispara NFS-e automática).
          if (becomingPaid) {
            if (currentPayment.asaasId) {
              try {
                const { deleteAsaasCharge } = await import("../utils/asaas");
                const [s] = await db.select({ asaasApiKey: settings.asaasApiKey }).from(settings)
                  .where(eq(settings.userId, ctx.user.id)).limit(1);
                await deleteAsaasCharge(currentPayment.asaasId, s?.asaasApiKey ? decryptSecret(s.asaasApiKey) : undefined);
              } catch (e) {
                console.error(`[paymentDues.update] Falha ao cancelar cobrança Asaas ${currentPayment.asaasId}:`, e);
              }
              await db.update(paymentDues)
                .set({ asaasId: null, asaasPaymentLink: null, asaasBillingType: null })
                .where(and(eq(paymentDues.id, id), eq(paymentDues.organizationId, orgId)));
            }
            if (currentPayment.mpPaymentId || currentPayment.mpPaymentLink) {
              await db.update(paymentDues)
                .set({ mpPaymentId: null, mpPaymentLink: null })
                .where(and(eq(paymentDues.id, id), eq(paymentDues.organizationId, orgId)));
            }
            if (currentPayment.infinitepayPaymentLink || currentPayment.infinitepaySlug || currentPayment.infinitepayPaymentId) {
              await db.update(paymentDues)
                .set({ infinitepayPaymentLink: null, infinitepaySlug: null, infinitepayPaymentId: null })
                .where(and(eq(paymentDues.id, id), eq(paymentDues.organizationId, orgId)));
            }
            await db.update(reminders)
              .set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
              .where(and(eq(reminders.paymentDueId, id), eq(reminders.organizationId, orgId), eq(reminders.status, "pendente")));
            (async () => {
              try {
                const [fComp] = await db.select({ autoEmit: fiscalCompanies.autoEmitOnPayment })
                  .from(fiscalCompanies).where(eq(fiscalCompanies.organizationId, orgId)).limit(1);
                if (fComp && fComp.autoEmit) {
                  await FiscalService.createInvoiceForPayment(orgId, id, {
                    userId: ctx.user.id,
                    userName: ctx.user.name || "Sistema",
                    autoQueue: true,
                  });
                }
              } catch (fErr: any) {
                console.warn(`[AutoNFS-e] Não foi possível enfileirar NFS-e para pagamento #${id}:`, fErr.message);
              }
            })().catch(() => {});
          }

          // Sincronizar vencimentos futuros se solicitado
          if (updateFutureDues && data.dueDate) {
            const newDay = new Date(data.dueDate).getUTCDate();
            
            // Atualizar cadastro do aluno
            await db.update(students)
              .set({ dueDay: newDay, updatedAt: new Date() })
              .where(and(eq(students.id, currentPayment.studentId), eq(students.organizationId, orgId), eq(students.professorId, ctx.user.id)));

            // Atualizar futuras cobranças pendentes
            const unpaidPayments = await db.select()
              .from(paymentDues)
              .where(and(
                eq(paymentDues.organizationId, orgId),
                eq(paymentDues.studentId, currentPayment.studentId),
                eq(paymentDues.userId, ctx.user.id),
                ne(paymentDues.status, "pago"),
                ne(paymentDues.id, id) // não mexer na que acabamos de atualizar
              ));

            // FIX-4: Buscar API key do professor para sincronizar com Asaas
            const [profSettings] = await db
              .select({ asaasApiKey: settings.asaasApiKey, asaasEnabled: settings.asaasEnabled })
              .from(settings)
              .where(eq(settings.userId, ctx.user.id))
              .limit(1);

            for (const pay of unpaidPayments) {
              const currentDueDate = new Date(pay.dueDate);
              const newDueDate = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth(), newDay);
              const formattedDate = newDueDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

              await db.update(paymentDues)
                .set({ dueDate: formattedDate, updatedAt: new Date() })
                .where(and(eq(paymentDues.id, pay.id), eq(paymentDues.organizationId, orgId)));

              // FIX-4: Se houver cobrança aberta no Asaas, cancelar para evitar divergência de data
              // O aluno precisará gerar uma nova cobrança com a data atualizada
              if (pay.asaasId && pay.status !== 'pago' && profSettings?.asaasEnabled === 1 && profSettings.asaasApiKey) {
                try {
                  const { deleteAsaasCharge } = await import('../utils/asaas');
                  await deleteAsaasCharge(pay.asaasId, decryptSecret(profSettings.asaasApiKey));
                  // Limpar referências Asaas no banco — nova cobrança com data correta será gerada quando necessário
                  await db.update(paymentDues)
                    .set({ asaasId: null, asaasPaymentLink: null, asaasBillingType: null, updatedAt: new Date() })
                    .where(and(eq(paymentDues.id, pay.id), eq(paymentDues.organizationId, orgId)));
                  debugLog(`[UpdateFutureDues] Cobrança Asaas cancelada (${pay.asaasId}) — data atualizada para ${formattedDate}`);
                } catch (e) {
                  // Não bloqueia a atualização se o cancelamento Asaas falhar
                  console.error(`[UpdateFutureDues] Falha ao cancelar cobrança Asaas ${pay.asaasId}:`, e);
                }
              }

              // InfinitePay: limpar refs locais da cobrança pendente (link fica desatualizado)
              if (pay.status !== 'pago' && (pay.infinitepayPaymentLink || pay.infinitepaySlug || pay.infinitepayPaymentId)) {
                await db.update(paymentDues)
                  .set({ infinitepayPaymentLink: null, infinitepaySlug: null, infinitepayPaymentId: null, updatedAt: new Date() })
                  .where(and(eq(paymentDues.id, pay.id), eq(paymentDues.organizationId, orgId)));
                debugLog(`[UpdateFutureDues] Referências InfinitePay limpas (${pay.id}) — data atualizada para ${formattedDate}`);
              }
            }
          }
            
          return { success: true };
        } catch (error) {
          return handleDbError(error, "atualizar a mensalidade");
        }
      }),

    getRevenueByDueDay: protectedProcedure
      .input(z.object({
        month: z.number(),
        year: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          
          const payments = await db.select()
            .from(paymentDues)
            .where(and(
              eq(paymentDues.organizationId, orgId),
              eq(paymentDues.userId, ctx.user.id),
              eq(paymentDues.month, input.month),
              eq(paymentDues.year, input.year)
            ));

          const stats = {
            5: 0,
            10: 0,
            15: 0,
            20: 0,
            others: 0,
            total: 0
          };

          for (const p of payments) {
            const dueDate = new Date(p.dueDate);
            const day = dueDate.getUTCDate();
            const amount = Number(p.amount);
            
            if ([5, 10, 15, 20].includes(day)) {
              stats[day as 5|10|15|20] += amount;
            } else {
              stats.others += amount;
            }
            stats.total += amount;
          }

          return stats;
        } catch (error) {
          return handleDbError(error, "obter relatório de vencimentos");
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const whereClause = isAdmin
            ? and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId))
            : and(eq(paymentDues.id, input.id), eq(paymentDues.organizationId, orgId), eq(paymentDues.userId, ctx.user.id));

          // ── CRÍTICO-1 FIX: Cancelar cobrança no Asaas ANTES de deletar do banco ──
          // Sem isso, o link continua ativo e o aluno pode pagar uma cobrança que
          // não existe mais no sistema (webhook chega mas não encontra o asaasId)
          const [due] = await db.select({ asaasId: paymentDues.asaasId, status: paymentDues.status, userId: paymentDues.userId })
            .from(paymentDues).where(whereClause).limit(1);

          if (due?.asaasId && due.status !== 'pago') {
            try {
              const [settingsData] = await db
                .select({ asaasApiKey: settings.asaasApiKey })
                .from(settings)
                .where(eq(settings.userId, due.userId ?? ctx.user.id))
                .limit(1);
              const { deleteAsaasCharge } = await import('../utils/asaas');
              await deleteAsaasCharge(due.asaasId, settingsData?.asaasApiKey ? decryptSecret(settingsData.asaasApiKey) : undefined);
              debugLog(`[DeletePayment] Cobrança Asaas cancelada (${due.asaasId}) antes da exclusão`);
            } catch (e) {
              console.error(`[DeletePayment] Falha ao cancelar cobrança Asaas ${due?.asaasId}:`, e);
              // Não bloqueia a exclusão se o cancelamento falhar
            }
          }

          // AUDIT-P1 FIX: cancelar lembretes de cobrança ligados à mensalidade antes
          // de deletá-la — antes ficavam órfãos e o automationJob continuava disparando
          await db.update(reminders)
            .set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
            .where(and(
              eq(reminders.paymentDueId, input.id),
              eq(reminders.organizationId, orgId),
              eq(reminders.status, "pendente")
            ));

          await db.delete(paymentDues).where(whereClause);
          return { success: true };
        } catch (error) {
          return handleDbError(error, "remover a mensalidade");
        }
      }),

    uploadReceipt: protectedProcedure
      .input(z.object({
        paymentDueId: z.number(),
        fileData: z.string(), // Base64
        fileName: z.string(),
        fileType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Banco de dados não disponível");
          const orgId = ctx.user.organizationId!;

          // Extrair buffer do base64
          const base64Content = input.fileData.split(';base64,').pop() || input.fileData;
          const buffer = Buffer.from(base64Content, 'base64');
          
          // Gerar nome de arquivo único
          const ext = input.fileName.split('.').pop() || 'dat';
          const storageKey = `receipts/org_${orgId}/user_${ctx.user.id}/pay_${input.paymentDueId}_${nanoid(6)}.${ext}`;
          
          // Salvar no storage
          const { url } = await storagePut(storageKey, buffer, input.fileType);
          
          // Atualizar mensalidade
          await db.update(paymentDues)
            .set({ 
              receiptUrl: url,
              updatedAt: new Date()
            })
            .where(and(
              eq(paymentDues.id, input.paymentDueId), 
              eq(paymentDues.organizationId, orgId), 
              eq(paymentDues.userId, ctx.user.id)
            ));
            
          return { success: true, url };
        } catch (error) {
          return handleDbError(error, "enviar o comprovante");
        }
      }),

    // ─ Gerar mensalidades dos próximos 3 meses (travado) ──────────────
    generateMonthly: protectedProcedure
      .input(z.object({
        studentId: z.number(),
        amount: z.number(),
        dueDay: z.number().min(1).max(31), // dia do vencimento (1-31)
        startMonth: z.number().min(1).max(12),
        startYear: z.number(),
        monthsCount: z.number().min(1).max(12),
        notes: z.string().optional(),
        // PLANOS & BOLSAS: valor extra (ex.: taxa de inscrição) somado SOMENTE à
        // 1ª fatura (regra de negócio: taxa paga junto com a 1ª mensalidade).
        firstMonthExtraAmount: z.number().min(0).optional(),
        firstMonthExtraNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const orgId = ctx.user.organizationId!;
        const [student] = await db.select({ billingPeriodicity: students.billingPeriodicity })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
          .limit(1);

        const periodicity = student?.billingPeriodicity || "mensal";

        const rows: any[] = [];
        for (const d of buildDueDateSeries(input.startMonth, input.startYear, input.monthsCount, input.dueDay, periodicity)) {
          const y = d.year;
          const month = d.month;

          // Verificar duplicidade (mesmo aluno, mesmo mês/ano)
          const existing = await db.select({ id: paymentDues.id }).from(paymentDues)
            .where(and(
              eq(paymentDues.organizationId, orgId),
              eq(paymentDues.studentId, input.studentId),
              eq(paymentDues.month, month),
              eq(paymentDues.year, y),
              eq(paymentDues.userId, ctx.user.id),
            )).limit(1);
          if (existing.length > 0) continue; // pular duplicados

          const isFirstMonth = month === input.startMonth && y === input.startYear;
          const extra = isFirstMonth && input.firstMonthExtraAmount ? input.firstMonthExtraAmount : 0;
          const totalAmount = input.amount + extra;
          const notes = isFirstMonth && extra > 0 && input.firstMonthExtraNotes
            ? [input.notes, input.firstMonthExtraNotes].filter(Boolean).join(" • ")
            : (input.notes ?? null);

          rows.push({
            organizationId: orgId,
            userId: ctx.user.id,
            studentId: input.studentId,
            amount: totalAmount.toFixed(2),
            dueDate: d.dueDateISO,
            month,
            year: y,
            status: 'pendente' as const,
            notes,
            billingPeriodicity: periodicity,
          });
        }

        if (rows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db.insert(paymentDues) as any).values(rows);
        }
        return { success: true, count: rows.length };
      }),

    generateBulkAll: protectedProcedure
      .input(z.object({
        startMonth: z.number().min(1).max(12),
        startYear: z.number(),
        monthsCount: z.number().min(1).max(12),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        const activeStudents = await db.select({
          id: students.id,
          monthlyFee: students.monthlyFee,
          dueDay: students.dueDay,
          billingPeriodicity: students.billingPeriodicity,
        }).from(students).where(and(
          eq(students.organizationId, orgId),
          eq(students.professorId, ctx.user.id),
          eq(students.status, 'ativo')
        ));

        const existingPayments = await db.select({
          studentId: paymentDues.studentId,
          month: paymentDues.month,
          year: paymentDues.year,
        }).from(paymentDues).where(and(
          eq(paymentDues.organizationId, orgId),
          eq(paymentDues.userId, ctx.user.id),
        ));
        const existingSet = new Set(
          existingPayments.map(p => `${p.studentId}_${p.month}_${p.year}`)
        );

        const rows: any[] = [];
        
        for (const student of activeStudents) {
          const fee = Number(student.monthlyFee);
          if (fee <= 0) continue;

          const periodicity = student.billingPeriodicity || "mensal";

          for (const d of buildDueDateSeries(input.startMonth, input.startYear, input.monthsCount, student.dueDay, periodicity)) {
            const month = d.month;
            const y = d.year;

            if (existingSet.has(`${student.id}_${month}_${y}`)) continue;

            rows.push({
              organizationId: orgId,
              userId: ctx.user.id,
              studentId: student.id,
              amount: fee.toFixed(2),
              dueDate: d.dueDateISO,
              month,
              year: y,
              status: 'pendente' as const,
              billingPeriodicity: periodicity,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }

        if (rows.length > 0) {
          await (db.insert(paymentDues) as any).values(rows);
        }
        
        return { success: true, count: rows.length };
      }),

    // ─ Mensalidades vencidas (não pagas, data já passou) ────────────
    overdue: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const rows = await db.select({
        id: paymentDues.id,
        studentId: paymentDues.studentId,
        amount: paymentDues.amount,
        dueDate: paymentDues.dueDate,
        status: paymentDues.status,
        month: paymentDues.month,
        year: paymentDues.year,
        studentName: students.name,
        studentPhone: students.phone,
      })
        .from(paymentDues)
        .leftJoin(students, and(eq(paymentDues.studentId, students.id), eq(paymentDues.organizationId, orgId)))
        .where(and(
          eq(paymentDues.organizationId, orgId),
          eq(paymentDues.userId, ctx.user.id),
          sql`${paymentDues.dueDate} < ${today}`,
          sql`${paymentDues.status} != 'pago'`
        ))
        .orderBy(asc(paymentDues.dueDate));

      const mappedRows = markOverdueRows(rows, today);
      return mappedRows;
    }),

    // ─ Listar mensalidades por aluno (todos os meses) ──────────────
    listByStudent: protectedProcedure
      .input(z.object({ studentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;
        const rows = await db.select({
          id: paymentDues.id,
          amount: paymentDues.amount,
          dueDate: paymentDues.dueDate,
          paidAt: paymentDues.paidAt,
          status: paymentDues.status,
          month: paymentDues.month,
          year: paymentDues.year,
          notes: paymentDues.notes,
        }).from(paymentDues)
          .where(and(eq(paymentDues.studentId, input.studentId), eq(paymentDues.organizationId, orgId), eq(paymentDues.userId, ctx.user.id)))
          .orderBy(asc(paymentDues.year), asc(paymentDues.month));

        const today = getTodayBR();
        const mappedRows = markOverdueRows(rows, today);
        return mappedRows;
      }),

    generateAsaasCharge: protectedProcedure
      .input(z.object({
        paymentDueId: z.number(),
        billingType: z.enum(["PIX", "CREDIT_CARD"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const orgId = ctx.user.organizationId!;
        const professorId = ctx.user.id;
        acquireGatewayChargeLock(input.paymentDueId);

        // Security Lock
        const { createAsaasCustomer, createAsaasCharge, getAsaasPixQrCode } = await import('../utils/asaas');
        const [settingsData] = await db.select({ asaasEnabled: settings.asaasEnabled, asaasApiKey: settings.asaasApiKey }).from(settings).where(eq(settings.userId, professorId)).limit(1);
        if (!settingsData || settingsData.asaasEnabled !== 1 || !settingsData.asaasApiKey) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Geração via Asaas não está disponível para esta conta. Configure a Chave da API." });
        }
        // BUG FIX: decifrar a chave (select cru traz v1:...) antes de usar na API do Asaas
        const apiKey = decryptSecret(settingsData.asaasApiKey);

        // Fetch payment due
        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, professorId), eq(paymentDues.organizationId, orgId)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
        if (due.asaasId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade já possui uma cobrança gerada no Asaas" });

        // Fetch student
        const [student] = await db.select().from(students)
          .where(and(eq(students.id, due.studentId), eq(students.organizationId, orgId)))
          .limit(1);

        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

        // Get or create Asaas customer
        let asaasCustomerId: string;
        const [existingCustomer] = await db.select().from(asaasCustomers)
          .where(and(eq(asaasCustomers.studentId, student.id), eq(asaasCustomers.organizationId, orgId)))
          .limit(1);

        if (existingCustomer) {
          asaasCustomerId = existingCustomer.asaasCustomerId;
        } else {
          asaasCustomerId = await createAsaasCustomer({
            name: student.name,
            email: student.email ?? undefined,
            phone: student.phone ?? undefined,
            cpfCnpj: student.cpf ?? undefined,
          }, apiKey);
          await db.insert(asaasCustomers).values({
            organizationId: orgId,
            studentId: student.id,
            asaasCustomerId,
          });
        }

        const dueDateObj = new Date(due.dueDate);
        const todayObj = new Date();
        todayObj.setHours(0, 0, 0, 0);
        const finalDueDate = dueDateObj < todayObj ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : due.dueDate;

        // BUG-002 FIX: cobra o valor ATUAL (com desconto antecipado / juros vigentes)
        // e persiste valor pago + original para o registro refletir o desconto.
        let chargeValue = Number(due.amount);
        try {
          const persisted = await BillingEngine.persistPaymentAmount(due.id, new Date());
          if (persisted) chargeValue = persisted.paid;
        } catch (e) {
          console.warn("[generateAsaasCharge] Falha ao calcular valor com desconto:", e);
        }

        // Create charge on Asaas
        const charge = await createAsaasCharge({
          asaasCustomerId,
          billingType: input.billingType,
          value: chargeValue,
          dueDate: finalDueDate,
          description: `Mensalidade ${due.month}/${due.year} - ${student.name}`,
        }, apiKey);

        // Fetch PIX QR code if PIX
        let pixPayload: string | null = null;
        let pixQrCode: string | null = null;
        if (input.billingType === "PIX") {
          try {
            const pix = await getAsaasPixQrCode(charge.id, apiKey);
            pixPayload = pix.payload;
            pixQrCode = pix.encodedImage;
          } catch (e) {
            console.error("[Asaas] Erro ao buscar QR code PIX:", e);
          }
        }

        // Persist Asaas charge data
        const paymentLink = input.billingType === "PIX" ? (pixPayload ?? charge.invoiceUrl) : charge.invoiceUrl;
        await db.update(paymentDues)
          .set({
            asaasId: charge.id,
            asaasPaymentLink: paymentLink,
            asaasBillingType: input.billingType,
            updatedAt: new Date(),
          })
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.organizationId, orgId)));

        return {
          asaasId: charge.id,
          paymentLink,
          pixQrCode,
          billingType: input.billingType,
        };
      }),

    generateMPCharge: protectedProcedure
      .input(z.object({
        paymentDueId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const orgId = ctx.user.organizationId!;
        const professorId = ctx.user.id;
        acquireGatewayChargeLock(input.paymentDueId);

        const { createMPPreference } = await import('../utils/mercadopago');
        const [settingsData] = await db.select({ 
          mpAccessToken: settings.mpAccessToken,
          paymentGateway: settings.paymentGateway
        }).from(settings).where(eq(settings.userId, professorId)).limit(1);
        
        if (!settingsData || settingsData.paymentGateway !== 'mercadopago' || !settingsData.mpAccessToken) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Geração via Mercado Pago não está configurada para esta conta." });
        }

        // BUG FIX ("sessão expirada" do MP): o select cru traz o token CIFRADO (v1:...)
        // e ele era enviado cru como Bearer — o MP rejeita com 403 PolicyAgent.
        // Decifrar antes de usar (decryptSecret é idempotente para texto puro legado).
        const accessToken = decryptSecret(settingsData.mpAccessToken);

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, professorId)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
        if (due.mpPaymentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade já possui uma cobrança gerada no Mercado Pago" });

        const [student] = await db.select().from(students)
          .where(and(eq(students.id, due.studentId), eq(students.organizationId, orgId)))
          .limit(1);

        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

        // BUG-002 FIX: cobra o valor ATUAL (com desconto/juros) e persiste valor pago + original
        let chargeValue = Number(due.amount);
        try {
          const persisted = await BillingEngine.persistPaymentAmount(due.id, new Date());
          if (persisted) chargeValue = persisted.paid;
        } catch (e) {
          console.warn("[generateMPCharge] Falha ao calcular valor com desconto:", e);
        }

        const pref = await createMPPreference({
          items: [{
            title: `Mensalidade ${due.month}/${due.year} - ${student.name}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: chargeValue
          }],
          payer: {
            name: student.name,
            email: student.email || "aluno@musicpro.com.br"
          },
          external_reference: due.id.toString(),
          successUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/painel/mensalidades`
        }, accessToken);

        await db.update(paymentDues)
          .set({
            mpPaymentId: pref.id,
            mpPaymentLink: pref.init_point,
            updatedAt: new Date(),
          })
          .where(eq(paymentDues.id, input.paymentDueId));

        return {
          mpPaymentId: pref.id,
          paymentLink: pref.init_point,
        };
      }),

    cancelAsaasCharge: protectedProcedure
      .input(z.object({ paymentDueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, ctx.user.id), eq(paymentDues.organizationId, orgId)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
        if (!due.asaasId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade não possui cobrança no Asaas" });

        const [settingsData] = await db
          .select({ asaasApiKey: settings.asaasApiKey })
          .from(settings)
          .where(eq(settings.userId, ctx.user.id))
          .limit(1);
        await deleteAsaasCharge(due.asaasId, settingsData?.asaasApiKey ? decryptSecret(settingsData.asaasApiKey) : undefined);

        await db.update(paymentDues)
          .set({ asaasId: null, asaasPaymentLink: null, asaasBillingType: null, updatedAt: new Date() })
          .where(eq(paymentDues.id, input.paymentDueId));

        return { success: true };
      }),

    cancelMPCharge: protectedProcedure
      .input(z.object({ paymentDueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, ctx.user.id)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });

        await db.update(paymentDues)
          .set({ mpPaymentId: null, mpPaymentLink: null, updatedAt: new Date() })
          .where(eq(paymentDues.id, input.paymentDueId));

        return { success: true };
      }),

    generateInfinitePayCharge: protectedProcedure
      .input(z.object({
        paymentDueId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const orgId = ctx.user.organizationId!;
        const professorId = ctx.user.id;
        acquireGatewayChargeLock(input.paymentDueId);

        const { createInfinitePayLink, buildInfinitePayWebhookUrl, brlToCents, resolveInfinitePayApiKey } = await import('../utils/infinitepay');
        const { createPaymentShortLink } = await import('../utils/shortlinks');
        const [settingsData] = await db.select({
          infinitepayHandle: settings.infinitepayHandle,
          infinitepayApiKey: settings.infinitepayApiKey,
          infinitepayEnabled: settings.infinitepayEnabled,
          paymentGateway: settings.paymentGateway,
        }).from(settings).where(eq(settings.userId, professorId)).limit(1);

        if (!settingsData || settingsData.paymentGateway !== 'infinitepay' || settingsData.infinitepayEnabled !== 1 || !settingsData.infinitepayHandle) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Geração via InfinitePay não está configurada para esta conta. Configure a InfiniteTag nas integrações." });
        }
        const handle = settingsData.infinitepayHandle;
        const apiKey = resolveInfinitePayApiKey(settingsData.infinitepayApiKey);

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, professorId)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
        if (due.status === "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade já está paga" });
        if (due.infinitepayPaymentLink) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade já possui uma cobrança gerada no InfinitePay" });

        const [student] = await db.select().from(students)
          .where(and(eq(students.id, due.studentId), eq(students.organizationId, orgId)))
          .limit(1);

        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

        // BUG-002 FIX: cobra o valor ATUAL (com desconto/juros) e persiste valor pago + original
        let chargeValue = Number(due.amount);
        try {
          const persisted = await BillingEngine.persistPaymentAmount(due.id, new Date());
          if (persisted) chargeValue = persisted.paid;
        } catch (e) {
          console.warn("[generateInfinitePayCharge] Falha ao calcular valor com desconto:", e);
        }

        const link = await createInfinitePayLink({
          handle,
          orderNsu: String(due.id),
          items: [{
            quantity: 1,
            price: brlToCents(chargeValue.toFixed(2)), // RN-002: sempre centavos inteiros
            description: `Mensalidade ${due.month}/${due.year} - ${student.name}`,
          }],
          redirectUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/painel/mensalidades`,
          webhookUrl: buildInfinitePayWebhookUrl(due.id),
          apiKey,
          customer: {
            name: student.name,
            email: student.email || undefined,
            phone: student.phone || undefined,
          },
        });

        // Link curto compartilhável (/p/{code}) — fallback transparente para a URL original
        const shareUrl = await createPaymentShortLink(db, {
          targetUrl: link.url,
          organizationId: orgId,
          userId: professorId,
          paymentDueId: due.id,
        });

        await db.update(paymentDues)
          .set({
            infinitepayPaymentLink: shareUrl,
            infinitepaySlug: link.slug,
            updatedAt: new Date(),
          })
          .where(eq(paymentDues.id, input.paymentDueId));

        return {
          paymentLink: shareUrl,
          slug: link.slug,
        };
      }),

    cancelInfinitePayCharge: protectedProcedure
      .input(z.object({ paymentDueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.userId, ctx.user.id)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });
        if (!due.infinitepayPaymentLink) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta mensalidade não possui cobrança no InfinitePay" });

        // A API da InfinitePay não expõe cancelamento do link — limpeza local
        // (webhook tardio é tratado como duplicidade, RN-005)
        await db.update(paymentDues)
          .set({ infinitepayPaymentLink: null, infinitepaySlug: null, infinitepayPaymentId: null, updatedAt: new Date() })
          .where(eq(paymentDues.id, input.paymentDueId));

        return { success: true };
      }),
  }),

  expenses: router({
    list: protectedProcedure
      .input(z.object({
        // BUG#2 FIX: month:-1 era passado para EXTRACT(MONTH) = -1, retornando sempre 0 linhas
        // Agora: undefined = sem filtro de mês (retorna todos); número válido = filtra pelo mês
        month: z.number().optional(),
        year: z.number().optional(),
        all: z.boolean().optional(), // true = sem filtro de data (para cálculo de comparativo)
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;
        const m = input?.month ?? new Date().getMonth() + 1;
        const y = input?.year ?? new Date().getFullYear();
        
        // Se all=true ou month não informado, não aplica filtro de data
        const dateFilter = (input?.all || input?.month === undefined)
          ? undefined
          : sql`EXTRACT(MONTH FROM ${expenses.date}) = ${m} AND EXTRACT(YEAR FROM ${expenses.date}) = ${y}`;
        
        return db.select()
          .from(expenses)
          .where(and(
            eq(expenses.organizationId, orgId),
            (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : eq(expenses.userId, ctx.user.id),
            dateFilter
          ))
          .orderBy(desc(expenses.date));
      }),
      
    create: protectedProcedure
      .input(z.object({
        description: z.string(),
        supplier: z.string().optional(),
        account: z.string().optional(),
        recurrence: z.string().optional(),
        amount: z.number(),
        date: z.string(),
        category: z.string(),
        status: z.enum(["pendente", "pago", "atrasado"]).optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          
          await db.insert(expenses).values({
            organizationId: orgId,
            userId: ctx.user.id,
            description: input.description,
            supplier: input.supplier || null,
            account: input.account || null,
            recurrence: input.recurrence || "unica",
            amount: input.amount.toFixed(2),
            date: input.date.slice(0, 10),
            category: input.category,
            status: input.status || "pendente",
            notes: input.notes,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          return { success: true };
        } catch (error) {
          return handleDbError(error, "criar despesa");
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        supplier: z.string().nullable().optional(),
        account: z.string().nullable().optional(),
        recurrence: z.string().optional(),
        amount: z.number().optional(),
        date: z.string().optional(),
        category: z.string().optional(),
        status: z.enum(["pendente", "pago", "atrasado"]).optional(),
        notes: z.string().nullable().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const { id, ...data } = input;
          
          const updateData: any = { ...data, updatedAt: new Date() };
          if (data.date) updateData.date = data.date.slice(0, 10);
          if (data.amount !== undefined) updateData.amount = data.amount.toFixed(2);
          
          const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const whereClause = isAdmin
            ? and(eq(expenses.id, id), eq(expenses.organizationId, orgId))
            : and(eq(expenses.id, id), eq(expenses.organizationId, orgId), eq(expenses.userId, ctx.user.id));
            
          await db.update(expenses)
            .set(updateData)
            .where(whereClause);
          return { success: true };
        } catch (error) {
          return handleDbError(error, "atualizar despesa");
        }
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const whereClause = isAdmin
            ? and(eq(expenses.id, input.id), eq(expenses.organizationId, orgId))
            : and(eq(expenses.id, input.id), eq(expenses.organizationId, orgId), eq(expenses.userId, ctx.user.id));
            
          await db.delete(expenses).where(whereClause);
          return { success: true };
        } catch (error) {
          return handleDbError(error, "remover despesa");
        }
      }),
      
    markPaid: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const whereClause = isAdmin
            ? and(eq(expenses.id, input.id), eq(expenses.organizationId, orgId))
            : and(eq(expenses.id, input.id), eq(expenses.organizationId, orgId), eq(expenses.userId, ctx.user.id));
            
          await db.update(expenses)
            .set({ status: "pago", updatedAt: new Date() })
            .where(whereClause);
          return { success: true };
        } catch (error) {
          return handleDbError(error, "marcar despesa como paga");
        }
      }),

    generateRecurring: protectedProcedure
      .input(z.object({
        startMonth: z.number(),
        startYear: z.number(),
        monthsCount: z.number().default(1)
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          
          const recurringList = await db.select()
            .from(expenses)
            .where(and(
              eq(expenses.organizationId, orgId),
              eq(expenses.userId, ctx.user.id),
              eq(expenses.recurrence, "mensal")
            ));

          const templatesMap = new Map<string, typeof recurringList[0]>();
          recurringList.forEach(e => {
            const existing = templatesMap.get(e.description.toLowerCase());
            if (!existing || new Date(e.date) > new Date(existing.date)) {
              templatesMap.set(e.description.toLowerCase(), e);
            }
          });

          const templates = Array.from(templatesMap.values());
          if (templates.length === 0) return { success: true, count: 0 };

          let count = 0;
          for (let i = 0; i < input.monthsCount; i++) {
            let m = input.startMonth + i;
            let y = input.startYear;
            while (m > 12) { m -= 12; y += 1; }

            const existingThisMonth = await db.select({ description: expenses.description })
              .from(expenses)
              .where(and(
                eq(expenses.organizationId, orgId),
                eq(expenses.userId, ctx.user.id),
                sql`EXTRACT(MONTH FROM ${expenses.date}) = ${m}`,
                sql`EXTRACT(YEAR FROM ${expenses.date}) = ${y}`
              ));
            const existingSet = new Set(existingThisMonth.map(e => e.description.toLowerCase()));

            for (const t of templates) {
              if (!existingSet.has(t.description.toLowerCase())) {
                const oldDate = new Date(t.date + "T12:00:00");
                // BUG FIX: dia 29/30/31 em mês mais curto gerava data inválida
                // (ex.: "2026-04-31" → rejeitada pelo Postgres). Clamp para o
                // último dia do mês alvo.
                const { clampDayToMonth } = await import("../services/RecurringExpenseEngine");
                const day = clampDayToMonth(y, m, oldDate.getDate());
                const newDateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                await db.insert(expenses).values({
                  organizationId: orgId,
                  userId: ctx.user.id,
                  description: t.description,
                  supplier: t.supplier,
                  account: t.account,
                  recurrence: t.recurrence,
                  amount: t.amount,
                  date: newDateStr,
                  category: t.category,
                  status: "pendente",
                  notes: t.notes,
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
                count++;
              }
            }
          }

          return { success: true, count };
        } catch (error) {
          return handleDbError(error, "gerar despesas recorrentes");
        }
      }),

    uploadReceipt: protectedProcedure
      .input(z.object({
        expenseId: z.number(),
        fileData: z.string(),
        fileName: z.string(),
        fileType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          const base64Content = input.fileData.split(';base64,').pop() || input.fileData;
          const buffer = Buffer.from(base64Content, 'base64');
          const fileExt = input.fileName.split(".").pop() || 'dat';
          const storageKey = `receipts/exp_${orgId}_${input.expenseId}_${nanoid(6)}.${fileExt}`;

          const { url } = await storagePut(storageKey, buffer, input.fileType);

          await db.update(expenses)
            .set({ receiptUrl: url, updatedAt: new Date() })
            .where(and(eq(expenses.id, input.expenseId), eq(expenses.organizationId, orgId), eq(expenses.userId, ctx.user.id)));

          return { success: true, receiptUrl: url };
        } catch (error) {
          return handleDbError(error, "enviar comprovante de despesa");
        }
      }),
  }),

  professorPayments: router({
    list: adminProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;

        const payments = await db.select({
          payment: professorPayments,
          professorName: users.name,
          specialty: professores.especialidade,
        })
          .from(professorPayments)
          .innerJoin(professores, eq(professores.id, professorPayments.professorId))
          .innerJoin(users, eq(users.id, professores.userId))
          .where(and(
            eq(professorPayments.organizationId, orgId),
            eq(professorPayments.month, input.month),
            eq(professorPayments.year, input.year),
          ))
          .orderBy(asc(users.name));

        return payments.map(p => ({
          ...p.payment,
          professorName: p.professorName,
          specialty: p.specialty,
        }));
      }),

    getHistory: protectedProcedure
      .input(z.object({
        year: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;
        const targetYear = input.year || new Date().getFullYear();

        const payments = await db.select()
          .from(professorPayments)
          .where(and(
            eq(professorPayments.organizationId, orgId),
            eq(professorPayments.year, targetYear),
          ));

        // Group totals by month (1..12)
        const monthMap: Record<number, { bruto: number; liquido: number; descontos: number }> = {};
        for (let m = 1; m <= 12; m++) {
          monthMap[m] = { bruto: 0, liquido: 0, descontos: 0 };
        }

        payments.forEach(p => {
          if (monthMap[p.month]) {
            monthMap[p.month].bruto += parseFloat(p.totalCredits || "0");
            monthMap[p.month].descontos += parseFloat(p.totalDebits || "0");
            monthMap[p.month].liquido += parseFloat(p.totalAmount || "0");
          }
        });

        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return monthNames.map((name, idx) => ({
          month: idx + 1,
          monthName: name,
          bruto: monthMap[idx + 1].bruto,
          descontos: monthMap[idx + 1].descontos,
          liquido: monthMap[idx + 1].liquido,
        }));
      }),

    createManual: adminProcedure
      .input(z.object({
        professorId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
        totalCredits: z.number(),
        totalDebits: z.number().default(0),
        totalAmount: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        // AUDIT-P1 FIX (IDOR): validar que o professor pertence à organização do usuário
        const [ownedProfessor] = await db.select({ id: professores.id })
          .from(professores)
          .where(and(
            eq(professores.id, input.professorId),
            eq(professores.organizationId, orgId),
          ))
          .limit(1);
        if (!ownedProfessor) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Professor não encontrado nesta escola." });
        }

        const [newPayment] = await db.insert(professorPayments).values({
          organizationId: orgId,
          professorId: input.professorId,
          month: input.month,
          year: input.year,
          totalClasses: 0,
          totalMinutes: 0,
          totalCredits: input.totalCredits.toFixed(2),
          totalDebits: input.totalDebits.toFixed(2),
          totalAmount: input.totalAmount.toFixed(2),
          status: "aberto",
          notes: input.notes || "Lançamento Manual Extraordinário",
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        return newPayment;
      }),

    calculate: adminProcedure
      .input(z.object({
        professorId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          // Get professor data
          const [prof] = await db.select()
            .from(professores)
            .where(and(
              eq(professores.id, input.professorId),
              eq(professores.organizationId, orgId),
            ))
            .limit(1);

          if (!prof) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Professor não encontrado" });
          }

          const result = await calculateAndSaveProfessorPayment(db, orgId, prof, input.month, input.year);

          return { success: true, paymentId: result.paymentId, totalClasses: result.totalClasses, totalMinutes: result.totalMinutes, totalCredits: result.totalCredits, totalAmount: result.totalAmount };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return handleDbError(error, "calcular pagamento do professor");
        }
      }),
    calculateAll: adminProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2100),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          // Get all professors in the organization
          const allProfessors = await db.select()
            .from(professores)
            .where(eq(professores.organizationId, orgId));

          const results: Array<{ professorId: number; totalClasses: number; totalMinutes: number; totalCredits: number; totalAmount: number; warnings: string[] }> = [];

          for (const prof of allProfessors) {
            const result = await calculateAndSaveProfessorPayment(db, orgId, prof, input.month, input.year);
            results.push({ professorId: result.professorId, totalClasses: result.totalClasses, totalMinutes: result.totalMinutes, totalCredits: result.totalCredits, totalAmount: result.totalAmount, warnings: result.warnings });
          }

          return { success: true, count: results.length, results };
        } catch (error) {
          return handleDbError(error, "calcular pagamentos de todos os professores");
        }
      }),
    approve: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          const [payment] = await db.select()
            .from(professorPayments)
            .where(and(
              eq(professorPayments.id, input.id),
              eq(professorPayments.organizationId, orgId),
            ))
            .limit(1);

          if (!payment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });
          }

          if (payment.status !== "aberto") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Somente pagamentos em aberto podem ser aprovados" });
          }

          await db.update(professorPayments)
            .set({
              status: "aprovado",
              approvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(professorPayments.id, input.id));

          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return handleDbError(error, "aprovar pagamento do professor");
        }
      }),

    markPaid: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          const [payment] = await db.select()
            .from(professorPayments)
            .where(and(
              eq(professorPayments.id, input.id),
              eq(professorPayments.organizationId, orgId),
            ))
            .limit(1);

          if (!payment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });
          }

          if (payment.status !== "aprovado") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Somente pagamentos aprovados podem ser marcados como pagos" });
          }

          await db.update(professorPayments)
            .set({
              status: "pago",
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(professorPayments.id, input.id));

          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return handleDbError(error, "marcar pagamento como pago");
        }
      }),

    getDetails: protectedProcedure
      .input(z.object({ paymentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { lessons: [] };
        const orgId = ctx.user.organizationId!;
        
        const [payment] = await db.select()
          .from(professorPayments)
          .where(and(
            eq(professorPayments.id, input.paymentId),
            eq(professorPayments.organizationId, orgId)
          ))
          .limit(1);
          
        if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });

        const startDate = new Date(payment.year, payment.month - 1, 1);
        const endDate = new Date(payment.year, payment.month, 1);

        const [prof] = await db.select().from(professores).where(eq(professores.id, payment.professorId)).limit(1);
        if (!prof) throw new TRPCError({ code: "NOT_FOUND", message: "Professor não encontrado" });

        const profStudents = await db.select({ id: students.id }).from(students).where(and(
          eq(students.organizationId, orgId),
          eq(students.professorId, prof.userId)
        ));
        const professorStudentIds = profStudents.map(s => s.id);

        const lessonCondition = professorStudentIds.length > 0
          ? or(eq(lessons.userId, prof.userId), inArray(lessons.studentId, professorStudentIds))
          : eq(lessons.userId, prof.userId);

        const profLessons = await db.select({
          lesson: lessons,
          studentName: students.name,
        })
          .from(lessons)
          .leftJoin(students, eq(students.id, lessons.studentId))
          .where(and(
            eq(lessons.organizationId, orgId),
            lessonCondition,
            eq(lessons.status, "concluida"),
            gte(lessons.scheduledAt, startDate),
            lt(lessons.scheduledAt, endDate)
          ))
          .orderBy(asc(lessons.scheduledAt));

        let percentageDetails: Array<{ studentName: string; monthlyFee: number; commission: number }> = [];

        if (prof?.paymentType === "porcentagem") {
          const uniqueStudentIds = Array.from(new Set(profLessons.map(l => l.lesson.studentId).filter(Boolean))) as number[];
          if (uniqueStudentIds.length > 0) {
            const studentList = await db.select({
              id: students.id,
              name: students.name,
              monthlyFee: students.monthlyFee,
            })
              .from(students)
              .where(and(
                eq(students.organizationId, orgId),
                inArray(students.id, uniqueStudentIds)
              ));
              
            const percentage = parseFloat(prof.paymentPercentage || "0");
            percentageDetails = studentList.map(s => {
              const fee = parseFloat(s.monthlyFee || "0");
              return {
                studentName: s.name,
                monthlyFee: fee,
                commission: parseFloat(((fee * percentage) / 100).toFixed(2))
              };
            });
          }
        }

        return { 
          lessons: profLessons.map(p => ({ ...p.lesson, studentName: p.studentName })),
          paymentType: prof?.paymentType || "fixo",
          paymentPercentage: parseFloat(prof?.paymentPercentage || "0"),
          percentageDetails 
        };
      }),

    updateAdjustments: adminProcedure
      .input(z.object({
        paymentId: z.number(),
        adjustments: z.string(), // JSON string
        totalAmount: z.number(),
        totalCredits: z.number(),
        totalDebits: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          const [payment] = await db.select()
            .from(professorPayments)
            .where(and(
              eq(professorPayments.id, input.paymentId),
              eq(professorPayments.organizationId, orgId)
            ))
            .limit(1);

          if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });
          if (payment.status !== "aberto") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas pagamentos em aberto podem ser editados" });
          }

          await db.update(professorPayments)
            .set({
              adjustments: input.adjustments,
              totalAmount: input.totalAmount.toFixed(2),
              totalCredits: input.totalCredits.toFixed(2),
              totalDebits: input.totalDebits.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(professorPayments.id, input.paymentId));

          return { success: true };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return handleDbError(error, "atualizar ajustes do pagamento");
        }
      }),
  }),

  // ─── Saldo nas contas de pagamento (checkout) — Asaas + Mercado Pago ────────
  // Mostra quanto há na conta onde o checkout recebe. A InfinitePay não expõe
  // API pública de saldo (apenas conciliação de pagamentos).
  gatewayBalances: router({
    get: adminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const orgId = ctx.user.organizationId!;
      const checkedAt = new Date().toISOString();
      if (!db) {
        return { checkedAt, asaas: { configured: false, balance: null }, mercadopago: { configured: false, balance: null, unavailable: null }, infinitepay: { configured: false, supported: false } };
      }

      const [asaasKey, mpToken, infiniteRow] = await Promise.all([
        resolveOrgAsaasApiKey(db, orgId),
        resolveOrgMpAccessToken(db, orgId),
        db.select({ handle: settings.infinitepayHandle }).from(settings)
          .where(eq(settings.organizationId, orgId)).then((rows: any[]) => rows.find((row) => row.handle && String(row.handle).trim() !== "")),
      ]);

      const [asaasResult, mpResult] = await Promise.all([
        asaasKey ? getAsaasBalance(asaasKey) : Promise.resolve({ balance: null as number | null, error: undefined as string | undefined }),
        mpToken ? getMPBalance(mpToken) : Promise.resolve({ balance: null as number | null, unavailable: null as number | null, error: undefined as string | undefined }),
      ]);

      return {
        checkedAt,
        asaas: { configured: Boolean(asaasKey), balance: asaasResult.balance, error: asaasResult.error },
        mercadopago: { configured: Boolean(mpToken), balance: mpResult.balance, unavailable: mpResult.unavailable, error: mpResult.error },
        infinitepay: { configured: Boolean(infiniteRow), supported: false },
      };
    }),
  }),

};
