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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs, schoolPlans } from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lt, lte, asc, ne, or, inArray, aliasedTable, ilike, isNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "../_core/notification";
import { handleDbError } from "../utils/error_handler";
import { TRPCError } from "@trpc/server";

import crypto from "crypto";
import { createAsaasCustomer, createAsaasCharge, deleteAsaasCharge, getAsaasPixQrCode } from "../utils/asaas";
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
import { loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract } from "./helpers";
export const contratosRouters = {
  contracts: router({
    list: protectedProcedure
      .input(z.object({
        studentId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;

        let filters = eq(contracts.organizationId, orgId);
        if (input.studentId) {
          filters = and(filters, eq(contracts.studentId, input.studentId)) as any;
        }

        const list = await db.select({
          contract: contracts,
          studentName: students.name,
        })
          .from(contracts)
          .innerJoin(students, eq(students.id, contracts.studentId))
          .where(filters)
          .orderBy(desc(contracts.createdAt));

        return list.map(l => ({
          ...l.contract,
          studentName: l.studentName,
        }));
      }),

    // ── contracts.create foi migrado para contracts.createAssinafy (Assinafy BYOK) ──
    // Este endpoint é mantido apenas para compatibilidade com clientes desatualizados.
    create: protectedProcedure
      .input(z.object({ studentId: z.number() }))
      .mutation(async () => {
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message: "Este endpoint foi substituído pela integração Assinafy. Use 'Criar contrato' na seção de contratos do aluno.",
        });
      }),

    // ─── CONTRATOS DIGITAIS (Assinafy — BYOK) ────────────────────────────────

    details: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

        const events = await db.select()
          .from(contractEvents)
          .where(eq(contractEvents.contractId, contract.id))
          .orderBy(asc(contractEvents.createdAt));

        return { contract, events };
      }),

    createAssinafy: protectedProcedure
      .input(z.object({
        studentId: z.number(),
        templateId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        monthlyFeeOverride: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const result = await runCreateAssinafyContract(db, ctx.user, orgId, input);

        return { success: true, contract: result.contract, signUrl: result.signUrl };
      }),

    // 🔍 Gera o PDF do contrato SEM enviar para assinatura (pré-visualização)
    previewPdf: protectedProcedure
      .input(z.object({
        studentId: z.number(),
        templateId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        monthlyFeeOverride: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const { prepareContractRender } = await import("../services/contractService");
        const prepared = await prepareContractRender(db, orgId, input.studentId, input.templateId, {
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          monthlyFeeOverride: input.monthlyFeeOverride ?? null,
        });

        return {
          base64: prepared.pdfBuffer.toString("base64"),
          fileName: `preview-${prepared.title}.pdf`,
        };
      }),

    // 🔄 Renovação/reemissão: novo contrato a partir de um existente (mesmo aluno/modelo/valores)
    renew: protectedProcedure
      .input(z.object({
        contractId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [original] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.contractId), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (!original.templateId) throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato sem modelo associado para renovação." });

        const { addContractEvent } = await import("../services/contractService");

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const oneYear = new Date(now);
        oneYear.setFullYear(now.getFullYear() + 1);
        const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const defaultEnd = `${oneYear.getFullYear()}-${pad(oneYear.getMonth() + 1)}-${pad(oneYear.getDate())}`;

        const result = await runCreateAssinafyContract(db, ctx.user, orgId, {
          studentId: original.studentId,
          templateId: original.templateId,
          startDate: input.startDate || defaultStart,
          endDate: input.endDate || defaultEnd,
          monthlyFeeOverride: original.monthlyFee ?? undefined,
        });

        await addContractEvent(db as any, result.contract.id, "contrato_renovado",
          `Contrato renovado a partir do contrato #${original.contractNumber || original.id}`, null,
          { originalContractId: original.id });

        return { success: true, contract: result.contract, signUrl: result.signUrl };
      }),

    // 🔄 Renovação SELF-SERVICE pelo portal do aluno (PRD módulo 1)
    // Vigência pela duração do plano do aluno (schoolPlans.duracaoMeses); fallback:
    // mesma duração do contrato anterior; valor: plano atual quando > 0.
    renewByStudent: studentProcedure
      .input(z.object({ contractId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;
        const studentId = ctx.user.studentId;
        if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil de aluno não vinculado." });

        const [original] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.contractId), eq(contracts.organizationId, orgId), eq(contracts.studentId, studentId)))
          .limit(1);
        if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (!["assinado", "expirado"].includes(original.status ?? "")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este contrato não pode ser renovado." });
        }
        if (!original.templateId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Fale com a escola para renovar seu contrato." });
        }

        // RN-001: uma renovação pendente por aluno (protege duplo clique e corrida com o admin)
        const [pendingRenewal] = await db.select({ id: contracts.id }).from(contracts)
          .where(and(
            eq(contracts.organizationId, orgId),
            eq(contracts.studentId, studentId),
            eq(contracts.status, "aguardando_assinatura"),
          ))
          .limit(1);
        if (pendingRenewal) {
          throw new TRPCError({ code: "CONFLICT", message: "Você já tem uma renovação aguardando assinatura." });
        }

        // Vigência (RN-002/RN-003): plano ativo → duracaoMeses; senão duração do contrato anterior; senão 12 meses
        const [student] = await db.select({ schoolPlanId: students.schoolPlanId }).from(students)
          .where(and(eq(students.id, studentId), eq(students.organizationId, orgId))).limit(1);
        const [plan] = student?.schoolPlanId
          ? await db.select({ duracaoMeses: schoolPlans.duracaoMeses, valorMensal: schoolPlans.valorMensal, ativo: schoolPlans.ativo })
              .from(schoolPlans)
              .where(and(eq(schoolPlans.id, student.schoolPlanId), eq(schoolPlans.organizationId, orgId))).limit(1)
          : [];

        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const origStart = original.startDate ? String(original.startDate).slice(0, 10) : null;
        const origEnd = original.endDate ? String(original.endDate).slice(0, 10) : null;

        // Início: dia seguinte ao fim do contrato atual (ou hoje, se já vencido)
        let startDate = today;
        if (origEnd && origEnd >= today) {
          const d = new Date(`${origEnd}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          startDate = d.toISOString().slice(0, 10);
        }

        let durationMonths = 12;
        if (plan && plan.ativo && plan.duracaoMeses && plan.duracaoMeses >= 1 && plan.duracaoMeses <= 60) {
          durationMonths = plan.duracaoMeses;
        } else if (origStart && origEnd) {
          const s = new Date(`${origStart}T12:00:00Z`);
          const e = new Date(`${origEnd}T12:00:00Z`);
          const months = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
          if (months >= 1 && months <= 60) durationMonths = months;
        }

        // Fim: início + duração, clampado ao último dia do mês (padrão buildDueDateSeries)
        const pad = (n: number) => String(n).padStart(2, "0");
        const [sy, sm, sd] = startDate.split("-").map(Number);
        const base = new Date(Date.UTC(sy, sm - 1 + durationMonths, 1));
        const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
        const endDate = `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(sd, lastDay))}`;

        // Valor: plano atual quando > 0, senão o do contrato anterior
        const planFee = plan && plan.ativo && Number(plan.valorMensal) > 0 ? String(plan.valorMensal) : undefined;
        const monthlyFeeOverride = planFee ?? (original.monthlyFee ?? undefined);

        const result = await runCreateAssinafyContract(db, ctx.user, orgId, {
          studentId,
          templateId: original.templateId,
          startDate,
          endDate,
          monthlyFeeOverride: monthlyFeeOverride ?? undefined,
        });

        const { addContractEvent } = await import("../services/contractService");
        await addContractEvent(db as any, result.contract.id, "contrato_renovado",
          `Contrato renovado pelo portal do aluno a partir do contrato #${original.contractNumber || original.id}`, null,
          { originalContractId: original.id, origem: "portal_aluno" });

        // Notifica o admin/professor dono do contrato original (RF-004)
        if (original.userId) {
          notifyUser(original.userId, {
            title: "🔄 Contrato renovado pelo aluno",
            content: `Uma renovação do contrato ${original.contractNumber || original.id} foi gerada via portal do aluno e está aguardando assinatura.`,
            url: "/contratos",
          }).catch(() => {});
        }

        return { success: true, contract: result.contract, signUrl: result.signUrl };
      }),

    refreshStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (contract.provider !== "assinafy" || !contract.assinafyDocId) {
          return { success: false, contract, message: "Contrato sem integração Assinafy" };
        }

        const [integration] = await db.select()
          .from(schoolIntegrations)
          .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
          .limit(1);
        if (!integration) return { success: false, contract, message: "Integração Assinafy não encontrada" };

        const { providerFromIntegration } = await import("../services/signature");
        const { mapProviderStatus, addContractEvent } = await import("../services/contractService");

        try {
          const provider = providerFromIntegration(integration);
          const status = await provider.getDocumentStatus(contract.assinafyDocId);
          const mapped = mapProviderStatus(status.status);

          const updateData: any = { status: mapped.internalStatus, updatedAt: new Date() };
          if (mapped.signed) {
            updateData.signedAt = contract.signedAt ?? new Date();
            if (status.signedDocumentUrl) updateData.signedDocumentUrl = status.signedDocumentUrl;
          }
          if (status.declined) updateData.cancelledAt = new Date();
          if (mapped.internalStatus === "expirado") updateData.expiresAt = new Date();

          await db.update(contracts).set(updateData).where(eq(contracts.id, contract.id));

          if (mapped.internalStatus === "assinado" && contract.status !== "assinado") {
            await addContractEvent(db as any, contract.id, "contrato_assinado", "Contrato assinado", null, { providerStatus: status.status });
          }

          const [updated] = await db.select().from(contracts).where(eq(contracts.id, contract.id)).limit(1);
          return { success: true, contract: updated };
        } catch (err: any) {
          console.error(`[Contracts] Falha ao sincronizar status do contrato ${contract.id}:`, err?.message);
          await db.update(schoolIntegrations)
            .set({ connectionStatus: "error", lastConnectionTest: new Date() })
            .where(eq(schoolIntegrations.id, integration.id));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar o status na Assinafy." });
        }
      }),

    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (contract.status === "assinado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contratos assinados não podem ser cancelados." });
        }

        if (contract.provider === "assinafy" && contract.assinafyDocId) {
          const [integration] = await db.select()
            .from(schoolIntegrations)
            .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
            .limit(1);
          if (integration) {
            try {
              const { providerFromIntegration } = await import("../services/signature");
              const provider = providerFromIntegration(integration);
              await provider.cancel(contract.assinafyDocId);
            } catch (e) {
              console.error(`[Contracts] Falha ao cancelar documento na Assinafy (${contract.assinafyDocId}):`, e);
            }
          }
        }

        await db.update(contracts).set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(contracts.id, contract.id));

        const { addContractEvent } = await import("../services/contractService");
        await addContractEvent(db as any, contract.id, "contrato_cancelado", "Contrato cancelado");

        return { success: true };
      }),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

        await db.delete(contractEvents).where(eq(contractEvents.contractId, contract.id));
        await db.delete(contracts).where(eq(contracts.id, contract.id));

        return { success: true };
      }),

    resend: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (!contract.assinafyDocId) throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato sem documento na Assinafy" });

        const [integration] = await db.select()
          .from(schoolIntegrations)
          .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
          .limit(1);
        if (!integration) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Integração Assinafy não encontrada" });

        const { providerFromIntegration } = await import("../services/signature");
        const provider = providerFromIntegration(integration);
        const ok = await provider.resend(contract.assinafyDocId);
        if (!ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível reenviar o contrato." });

        await db.update(contracts).set({ status: "aguardando_assinatura", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(contracts.id, contract.id));

        const { addContractEvent } = await import("../services/contractService");
        await addContractEvent(db as any, contract.id, "contrato_reenviado", "Contrato reenviado para assinatura");

        return { success: true };
      }),

    downloadSigned: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [contract] = await db.select()
          .from(contracts)
          .where(and(eq(contracts.id, input.id), eq(contracts.organizationId, orgId)))
          .limit(1);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (ctx.user.role === "aluno" && ctx.user.studentId && contract.studentId !== ctx.user.studentId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar este contrato." });
        }
        if (!contract.assinafyDocId || contract.status !== "assinado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato ainda não assinado." });
        }

        const [integration] = await db.select()
          .from(schoolIntegrations)
          .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
          .limit(1);
        if (!integration) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Integração Assinafy não encontrada" });

        const { providerFromIntegration } = await import("../services/signature");
        const provider = providerFromIntegration(integration);
        const pdf = await provider.downloadSignedDocument(contract.assinafyDocId);
        if (!pdf) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível baixar o documento assinado." });

        return { base64: pdf.toString("base64"), fileName: `${contract.title}.pdf` };
      }),

    my: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) return [];
        if (ctx.user.role !== "aluno" || !ctx.user.studentId) return [];
        const orgId = ctx.user.organizationId!;

        const list = await db.select({
          contract: contracts,
          studentName: students.name,
        })
          .from(contracts)
          .innerJoin(students, eq(students.id, contracts.studentId))
          .where(and(
            eq(contracts.studentId, ctx.user.studentId),
            eq(contracts.provider, "assinafy"),
            eq(contracts.organizationId, orgId),
          ))
          .orderBy(desc(contracts.createdAt));

        // Flags da renovação self-service (RF-003)
        const [integration] = await db.select({ id: schoolIntegrations.id }).from(schoolIntegrations)
          .where(and(
            eq(schoolIntegrations.organizationId, orgId),
            eq(schoolIntegrations.provider, "assinafy"),
            eq(schoolIntegrations.active, true),
          )).limit(1);
        const assinafyAvailable = !!integration;
        const pendingRenewal = list.some((l: any) => l.contract.status === "aguardando_assinatura");
        // Plano do aluno (preview de vigência/valor da renovação)
        const [studentRow] = await db.select({ schoolPlanId: students.schoolPlanId }).from(students)
          .where(and(eq(students.id, ctx.user.studentId), eq(students.organizationId, orgId))).limit(1);
        const planForStudent = studentRow?.schoolPlanId
          ? (await db.select({ duracaoMeses: schoolPlans.duracaoMeses, valorMensal: schoolPlans.valorMensal, ativo: schoolPlans.ativo })
              .from(schoolPlans)
              .where(and(eq(schoolPlans.id, studentRow.schoolPlanId), eq(schoolPlans.organizationId, orgId))).limit(1))[0]
          : null;
        // Elegível: assinado/expirado com fim a ≤ 60 dias (ou já vencido)
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const limit = new Date();
        limit.setDate(limit.getDate() + 60);
        const limitStr = limit.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

        return list.map((l: any) => {
          const c = l.contract;
          const endStr = c.endDate ? String(c.endDate).slice(0, 10) : null;
          const endEligible = !!endStr && (endStr <= limitStr || endStr < todayStr);
          const canRenew = assinafyAvailable && !pendingRenewal
            && ["assinado", "expirado"].includes(c.status ?? "")
            && endEligible;

          // Preview da renovação (mesma conta do renewByStudent) — modal mostra antes de confirmar
          let renewPreview: { startDate: string; endDate: string; monthlyFee: number } | null = null;
          if (canRenew) {
            let startDate = todayStr;
            if (endStr && endStr >= todayStr) {
              const d = new Date(`${endStr}T12:00:00Z`);
              d.setUTCDate(d.getUTCDate() + 1);
              startDate = d.toISOString().slice(0, 10);
            }
            let durationMonths = 12;
            if (planForStudent && planForStudent.ativo && planForStudent.duracaoMeses && planForStudent.duracaoMeses >= 1 && planForStudent.duracaoMeses <= 60) {
              durationMonths = planForStudent.duracaoMeses;
            } else if (c.startDate && endStr) {
              const s = new Date(`${String(c.startDate).slice(0, 10)}T12:00:00Z`);
              const e = new Date(`${endStr}T12:00:00Z`);
              const months = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
              if (months >= 1 && months <= 60) durationMonths = months;
            }
            const pad = (n: number) => String(n).padStart(2, "0");
            const [sy, sm, sd] = startDate.split("-").map(Number);
            const base = new Date(Date.UTC(sy, sm - 1 + durationMonths, 1));
            const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
            const endDate = `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(sd, lastDay))}`;
            const planFee = planForStudent && planForStudent.ativo && Number(planForStudent.valorMensal) > 0
              ? Number(planForStudent.valorMensal)
              : (c.monthlyFee != null ? Number(c.monthlyFee) : null);
            renewPreview = { startDate, endDate, monthlyFee: planFee ?? 0 };
          }

          return { ...c, studentName: l.studentName, canRenew, renewalPending: pendingRenewal, renewPreview };
        });
      }),
  }),

  signatureIntegrations: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;

      const [integration] = await db.select()
        .from(schoolIntegrations)
        .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
        .limit(1);

      if (!integration) return null;

      const { maskSecret, decryptSecret } = await import("../utils/integrationCrypto");
      return {
        provider: integration.provider,
        environment: integration.environment,
        active: integration.active,
        connectionStatus: integration.connectionStatus,
        lastConnectionTest: integration.lastConnectionTest,
        apiKeyMasked: maskSecret(decryptSecret(integration.apiKeyEncrypted)),
      };
    }),

    connect: adminProcedure
      .input(z.object({
        apiKey: z.string().min(10),
        environment: z.enum(["sandbox", "production"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const { AssinafyProvider } = await import("../services/signature/AssinafyProvider");
        const { encryptSecret } = await import("../utils/integrationCrypto");

        const provider = new AssinafyProvider(input.apiKey, input.environment);
        let accountId: string | null = null;
        try {
          const conn = await provider.testConnection();
          accountId = conn.accountId ?? null;
        } catch (err: any) {
          console.error(`[Assinafy] Falha no teste de conexão da org ${orgId}:`, err?.status, err?.message);
          const isInvalid = err?.status === 401 || err?.status === 403 || err?.status === 400;
          await db.insert(schoolIntegrations).values({
            organizationId: orgId,
            provider: "assinafy",
            apiKeyEncrypted: encryptSecret(input.apiKey),
            environment: input.environment,
            accountId: null,
            active: true,
            lastConnectionTest: new Date(),
            connectionStatus: isInvalid ? "invalid_credentials" : "error",
          }).onConflictDoUpdate({
            target: [schoolIntegrations.organizationId, schoolIntegrations.provider],
            set: {
              apiKeyEncrypted: encryptSecret(input.apiKey),
              environment: input.environment,
              accountId: null,
              active: true,
              lastConnectionTest: new Date(),
              connectionStatus: isInvalid ? "invalid_credentials" : "error",
              updatedAt: new Date(),
            },
          });
          throw new TRPCError({
            code: isInvalid ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
            message: isInvalid
              ? "API Key inválida. Verifique sua chave da Assinafy e tente novamente."
              : "Não foi possível conectar à Assinafy. Verifique sua API Key e tente novamente.",
          });
        }

        await db.insert(schoolIntegrations).values({
          organizationId: orgId,
          provider: "assinafy",
          apiKeyEncrypted: encryptSecret(input.apiKey),
          environment: input.environment,
          accountId,
          active: true,
          lastConnectionTest: new Date(),
          connectionStatus: "connected",
        }).onConflictDoUpdate({
          target: [schoolIntegrations.organizationId, schoolIntegrations.provider],
          set: {
            apiKeyEncrypted: encryptSecret(input.apiKey),
            environment: input.environment,
            accountId,
            active: true,
            lastConnectionTest: new Date(),
            connectionStatus: "connected",
            updatedAt: new Date(),
          },
        });

        return { success: true, message: "Conexão realizada com sucesso." };
      }),

    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const orgId = ctx.user.organizationId!;

      const [integration] = await db.select()
        .from(schoolIntegrations)
        .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
        .limit(1);
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Assinafy não configurada" });

      const { providerFromIntegration } = await import("../services/signature");
      try {
        const provider = providerFromIntegration(integration);
        const conn = await provider.testConnection();
        await db.update(schoolIntegrations).set({
          connectionStatus: "connected",
          lastConnectionTest: new Date(),
          accountId: conn.accountId ?? integration.accountId,
          updatedAt: new Date(),
        }).where(eq(schoolIntegrations.id, integration.id));
        return { success: true, message: "Conexão realizada com sucesso." };
      } catch (err: any) {
        const isInvalid = err?.status === 401 || err?.status === 403;
        await db.update(schoolIntegrations).set({
          connectionStatus: isInvalid ? "invalid_credentials" : "error",
          lastConnectionTest: new Date(),
          updatedAt: new Date(),
        }).where(eq(schoolIntegrations.id, integration.id));
        throw new TRPCError({
          code: isInvalid ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: isInvalid
            ? "API Key inválida. Verifique sua chave da Assinafy e conecte novamente."
            : "Não foi possível conectar à Assinafy. Verifique sua API Key e tente novamente.",
        });
      }
    }),

    updateApiKey: adminProcedure
      .input(z.object({ apiKey: z.string().min(10) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [integration] = await db.select()
          .from(schoolIntegrations)
          .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")))
          .limit(1);
        if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Assinafy não configurada" });

        const { AssinafyProvider } = await import("../services/signature/AssinafyProvider");
        const { encryptSecret } = await import("../utils/integrationCrypto");

        const provider = new AssinafyProvider(input.apiKey, integration.environment);
        try {
          const conn = await provider.testConnection();
          await db.update(schoolIntegrations).set({
            apiKeyEncrypted: encryptSecret(input.apiKey),
            accountId: conn.accountId ?? integration.accountId,
            connectionStatus: "connected",
            lastConnectionTest: new Date(),
            updatedAt: new Date(),
          }).where(eq(schoolIntegrations.id, integration.id));
          return { success: true, message: "API Key atualizada com sucesso." };
        } catch (err: any) {
          const isInvalid = err?.status === 401 || err?.status === 403;
          await db.update(schoolIntegrations).set({
            connectionStatus: isInvalid ? "invalid_credentials" : "error",
            lastConnectionTest: new Date(),
            updatedAt: new Date(),
          }).where(eq(schoolIntegrations.id, integration.id));
          throw new TRPCError({
            code: isInvalid ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
            message: isInvalid
              ? "API Key inválida. Verifique sua chave da Assinafy e conecte novamente."
              : "Não foi possível validar a nova API Key na Assinafy.",
          });
        }
      }),

    disconnect: adminProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const orgId = ctx.user.organizationId!;

      await db.update(schoolIntegrations)
        .set({ active: false, connectionStatus: "disconnected", updatedAt: new Date() })
        .where(and(eq(schoolIntegrations.organizationId, orgId), eq(schoolIntegrations.provider, "assinafy")));

      return { success: true, message: "Assinafy desconectada." };
    }),
  }),

  contractTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      let templates = await db.select()
        .from(contractTemplates)
        .where(and(eq(contractTemplates.organizationId, orgId), eq(contractTemplates.active, true)))
        .orderBy(desc(contractTemplates.createdAt));

      if (templates.length === 0) {
        const { buildDefaultTemplateContent, buildMinorTemplateContent } = await import("../services/contractService");
        const [standardCreated] = await db.insert(contractTemplates).values({
          organizationId: orgId,
          name: "Contrato de Prestação de Serviços Educacionais (Padrão)",
          description: "Modelo padrão para alunos maiores de idade.",
          content: buildDefaultTemplateContent(),
          active: true,
        }).returning();

        const [minorCreated] = await db.insert(contractTemplates).values({
          organizationId: orgId,
          name: "Contrato de Prestação de Serviços (Aluno Menor de Idade)",
          description: "Modelo para alunos menores de idade representados por responsável legal.",
          content: buildMinorTemplateContent(),
          active: true,
        }).returning();

        templates = [standardCreated, minorCreated];
      } else {
        // Se a escola já tiver templates mas ainda não tiver o de menor de idade, auto-cria
        const hasMinor = templates.some(t => t.name.toLowerCase().includes("menor"));
        if (!hasMinor) {
          const { buildMinorTemplateContent } = await import("../services/contractService");
          const [minorCreated] = await db.insert(contractTemplates).values({
            organizationId: orgId,
            name: "Contrato de Prestação de Serviços (Aluno Menor de Idade)",
            description: "Modelo para alunos menores de idade representados por responsável legal.",
            content: buildMinorTemplateContent(),
            active: true,
          }).returning();
          templates = [...templates, minorCreated];
        }
      }

      return templates;
    }),

    listAssinafyTemplates: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const [integration] = await db.select()
        .from(schoolIntegrations)
        .where(and(
          eq(schoolIntegrations.organizationId, orgId),
          eq(schoolIntegrations.provider, "assinafy"),
          eq(schoolIntegrations.active, true)
        ))
        .limit(1);

      if (!integration) return [];

      try {
        const { providerFromIntegration } = await import("../services/signature");
        const provider = providerFromIntegration(integration) as any;
        if (typeof provider.listTemplates === "function") {
          return await provider.listTemplates();
        }
      } catch (e) {
        console.error("[contractTemplates] Erro ao buscar templates da Assinafy:", e);
      }
      return [];
    }),

    autoInsertVariables: protectedProcedure
      .input(z.object({ content: z.string() }))
      .mutation(async ({ input }) => {
        let text = input.content;

        // AUD-004 FIX: Tipo correto para replacements que aceitam string ou callback
        const replacements: [RegExp, string | ((...args: any[]) => string)][] = [
          [/(?:nome do aluno|aluno\(a\)|contratante|aluno):\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/gi, (match) => match.replace(/:.*/, ": {{student_name}}")],
          [/(?:denominado\(a\)|chamado\(a\))\s+CONTRATANTE,?\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,30})/gi, "denominado(a) CONTRATANTE, {{student_name}}"],
          [/(?:cpf|inscrito\(a\) no cpf)(?: nº|:)?\s*[\d\.\-\s]{11,14}/gi, "CPF nº {{student_cpf}}"],
          [/\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/g, "{{student_cpf}}"],
          [/(?:residente e domiciliado\(a\) em|endereço:)\s*[^,\n]+/gi, "residente em {{student_address}}"],
          [/(?:telefone|celular|whatsapp)(?: nº|:)?\s*\+?[\d\s\(\)\-]{8,15}/gi, "Telefone: {{student_phone}}"],
          [/(?:e-mail|email)(?:|:)?\s*[\w\.\-]+@[\w\.\-]+\.\w+/gi, "E-mail: {{student_email}}"],
          [/(?:valor de|valor mensal de|mensalidade de)\s*R\$\s*[\d\.\,]+/gi, "valor mensal de R$ {{monthly_fee}}"],
          [/R\$\s*\d+(?:[\.\,]\d{2})?/gi, "R$ {{monthly_fee}}"],
          [/(?:aulas de|curso de|serviços de)\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,20})/gi, (match, g1) => match.replace(g1, "{{instrument}}")],
          [/(?:vencimento todo dia|vencendo no dia|dia)\s*\d{1,2}/gi, "vencimento todo dia {{due_date}}"],
          [/(?:escola|instituição|contratada):\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/gi, (match) => match.replace(/:.*/, ": {{school_name}}")],
          [/(?:cnpj)(?: nº|:)?\s*[\d\.\/\-\s]{14,18}/gi, "CNPJ nº {{school_cnpj}}"],
        ];

        for (const [pattern, replacement] of replacements) {
          text = text.replace(pattern, replacement as any);
        }

        return { content: text };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [tpl] = await db.select()
          .from(contractTemplates)
          .where(and(eq(contractTemplates.id, input.id), eq(contractTemplates.organizationId, orgId)))
          .limit(1);

        if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
        return tpl;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "O nome do modelo é obrigatório"),
        description: z.string().optional(),
        content: z.string().min(10, "O conteúdo do modelo deve ser preenchido"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [created] = await db.insert(contractTemplates).values({
          organizationId: orgId,
          name: input.name,
          description: input.description || null,
          content: input.content,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        return created;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "O nome do modelo é obrigatório"),
        description: z.string().optional(),
        content: z.string().min(10, "O conteúdo do modelo deve ser preenchido"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        const [updated] = await db.update(contractTemplates)
          .set({
            name: input.name,
            description: input.description || null,
            content: input.content,
            updatedAt: new Date(),
          })
          .where(and(eq(contractTemplates.id, input.id), eq(contractTemplates.organizationId, orgId)))
          .returning();

        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
        return updated;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
        const orgId = ctx.user.organizationId!;

        await db.update(contractTemplates)
          .set({ active: false, updatedAt: new Date() })
          .where(and(eq(contractTemplates.id, input.id), eq(contractTemplates.organizationId, orgId)));

        return { success: true };
      }),
  }),

};
