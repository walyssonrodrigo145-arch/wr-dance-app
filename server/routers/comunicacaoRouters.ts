import { debugLog } from "../_core/logger";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { fcmRouter } from "../fcmRouter";
import { publicProcedure, protectedProcedure, professorProcedure, studentProcedure, router } from "../_core/trpc";
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
import { decryptSecret } from "../utils/integrationCrypto";
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
export const comunicacaoRouters = {
  reminders: router({

    // ─ Listar com filtros ─────────────────────────────────────────────────────────────
    list: protectedProcedure
      .input(z.object({
        studentId: z.number().nullable().optional(),
        type: z.enum(["aula", "cobranca", "inadimplencia", "manual"]).optional(),
        status: z.enum(["pendente", "enviado", "cancelado"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId!;
        const db = await getDb();
        if (!db) return [];

        // Monta filtros diretamente no SQL para evitar fetch completo
        // ⚠️ Filtra APENAS por organizationId (não por userId) para que lembretes
        // criados pelo automationJob (que usa seu próprio userId) também apareçam
        // e permaneçam como 'enviado' após o markSent. Filtrar por userId causava
        // um revert visual: o lembrete sumia da lista após ser marcado como enviado.
        const conditions: any[] = [
          eq(reminders.organizationId, orgId),
        ];
        if (input?.studentId) conditions.push(eq(reminders.studentId, input.studentId));
        if (input?.type)      conditions.push(eq(reminders.type, input.type));
        if (input?.status)    conditions.push(eq(reminders.status, input.status));
        if (input?.dateFrom)  {
          conditions.push(gte(reminders.scheduledAt, new Date(input.dateFrom)));
        } else {
          const fourDaysAgo = new Date();
          fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
          conditions.push(
            or(
              eq(reminders.status, "pendente"),
              gte(reminders.createdAt, fourDaysAgo)
            )
          );
        }
        if (input?.dateTo)    conditions.push(lte(reminders.scheduledAt, new Date(input.dateTo)));

        const rows = await db
          .select({
            id: reminders.id,
            type: reminders.type,
            message: reminders.message,
            scheduledAt: reminders.scheduledAt,
            status: reminders.status,
            autoGenerated: reminders.autoGenerated,
            sentAt: reminders.sentAt,
            cancelledAt: reminders.cancelledAt,
            refId: reminders.refId,
            studentId: reminders.studentId,
            lessonId: reminders.lessonId,
            paymentDueId: reminders.paymentDueId,
            createdAt: reminders.createdAt,
            studentName: students.name,
            studentPhone: students.phone,
            externalMessageId: reminders.externalMessageId,
            errorMessage: reminders.errorMessage,
          })
          .from(reminders)
          .leftJoin(students, and(eq(reminders.studentId, students.id), eq(students.organizationId, orgId)))
          .where(and(...conditions))
          .orderBy(desc(reminders.scheduledAt))
          .limit(200); // máximo de 200 registros por vez

        return rows;
      }),

    // ─ Contadores para dashboard ──────────────────────────────────────────────────
    pendingCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return 0;
      const orgId = ctx.user.organizationId!;
      // Conta todos os pendentes da organização (não só do userId logado)
      const rows = await db.select({ id: reminders.id }).from(reminders)
        .where(and(eq(reminders.organizationId, orgId), eq(reminders.status, "pendente")));
      return rows.length;
    }),

    // ─ Geração automática de lembretes de AULA (24h antes, semana atual) ───────────────
    generateLessonReminders: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orgId = ctx.user.organizationId!;
      const now = new Date();
      // Semana atual: segunda a domingo
      const dayOfWeek = now.getDay(); // 0=dom, 1=seg...
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      // Buscar aulas da semana atual que não foram canceladas
      const weekLessons = await db.select({
        id: lessons.id,
        studentId: lessons.studentId,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        status: lessons.status,
        studentName: students.name,
        studentPhone: students.phone,
        instrumentName: instruments.name,
      })
        .from(lessons)
        .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
        .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
        .where(
          and(
            eq(lessons.organizationId, orgId),
            eq(lessons.userId, ctx.user.id),
            gte(lessons.scheduledAt, monday),
            lte(lessons.scheduledAt, sunday)
          )
        );

      let created = 0;
      let skipped = 0;

      for (const lesson of weekLessons) {
        // Não gerar para aulas canceladas
        if (lesson.status === "cancelada") { skipped++; continue; }

        const lessonDate = new Date(lesson.scheduledAt);
        // Não gerar se a aula já passou
        if (lessonDate <= now) { skipped++; continue; }

        // Lembrete programado para 24h antes da aula
        const reminderTime = new Date(lessonDate.getTime() - 24 * 60 * 60 * 1000);
        // Só gera se a janela de 24h já chegou (1 dia antes da aula)
        if (reminderTime > now) { skipped++; continue; }

        // ✅ TRAVA PRINCIPAL: Se já existe QUALQUER lembrete 'enviado' ou 'cancelado' para esta aula
        // (independente do refId), não criar novo. Isso impede regeneração após "Concluir" ou "Cancelar".
        const alreadySent = await db.select({ id: reminders.id }).from(reminders)
          .where(and(
            eq(reminders.organizationId, orgId),
            eq(reminders.lessonId, lesson.id),
            or(eq(reminders.status, "enviado"), eq(reminders.status, "cancelado"))
          )).limit(1);
        if (alreadySent.length > 0) { skipped++; continue; }

        // Chave de deduplicação
        const dateStr = lessonDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const refId = `lesson-${lesson.id}-${dateStr}`;

        // Verificar duplicidade por refId (qualquer status: pendente, cancelado)
        const existing = await db.select({ id: reminders.id }).from(reminders)
          .where(
            and(
              eq(reminders.organizationId, orgId),
              or(
                eq(reminders.refId, refId),
                eq(reminders.refId, `lesson-24h-${lesson.id}-${dateStr}`),
                and(
                  eq(reminders.refId, `lesson-24h-${lesson.id}`),
                  sql`abs(extract(epoch from (${reminders.scheduledAt} - ${reminderTime.toISOString()}::timestamp))) < 43200`
                )
              )
            )
          ).limit(1);
        if (existing.length > 0) { skipped++; continue; }

        // Buscar template de aula (prioriza padrão, depois qualquer um do tipo aula cadastrado)
        let [tpl] = await db.select().from(reminderTemplates)
          .where(and(eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id), eq(reminderTemplates.type, "aula"), eq(reminderTemplates.isDefault, 1)))
          .limit(1);

        if (!tpl) {
          const anyTpl = await db.select().from(reminderTemplates)
            .where(
              and(
                eq(reminderTemplates.organizationId, orgId),
                eq(reminderTemplates.userId, ctx.user.id),
                eq(reminderTemplates.type, "aula")
              )
            )
            .limit(1);
          if (anyTpl.length > 0) {
            tpl = anyTpl[0];
          }
        }

        const dataAula = lessonDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
        const horaAula = lessonDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const bodyTemplate = tpl?.body ?? "Olá {nome}, lembrete: sua aula de {instrumento} será dia {data_aula} às {hora_aula}.";
        const message = bodyTemplate
          .replace(/\{nome\}/g, lesson.studentName ?? "Aluno")
          .replace(/\{instrumento\}/g, lesson.instrumentName ?? "música")
          .replace(/\{data_aula\}/g, dataAula)
          .replace(/\{hora_aula\}/g, horaAula);

        await db.insert(reminders).values({
          organizationId: orgId,
          userId: ctx.user.id,
          studentId: lesson.studentId,
          lessonId: lesson.id,
          type: "aula",
          message,
          scheduledAt: reminderTime,
          status: "pendente",
          autoGenerated: 1,
          refId,
        });
        created++;
      }

      if (created > 0) {
        await notifyUser(ctx.user.id, {
          title: "Lembretes Gerados",
          content: `Foram gerados ${created} novos lembretes de aula manualmente.`
        });
      }

      return { created, skipped };
    }),

    // ─ Geração automática de lembretes de MENSALIDADE (3 dias antes, mês atual) ───────
    generatePaymentReminders: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orgId = ctx.user.organizationId!;
      const now = new Date();
      const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

      // Buscar chave PIX e gateway de pagamento do professor
      const [userSettings] = await db.select({ 
        pixKey: settings.pixKey, 
        paymentGateway: settings.paymentGateway, 
        asaasEnabled: settings.asaasEnabled,
        asaasApiKey: settings.asaasApiKey,
        mpAccessToken: settings.mpAccessToken,
        infinitepayHandle: settings.infinitepayHandle,
        infinitepayApiKey: settings.infinitepayApiKey,
        infinitepayEnabled: settings.infinitepayEnabled,
      })
        .from(settings)
        .where(eq(settings.userId, ctx.user.id))
        .limit(1);
      const pixKey = userSettings?.pixKey ?? null;
      const paymentGateway = userSettings?.paymentGateway ?? "asaas";

      // Buscar TODAS as mensalidades pendentes (qualquer mês/ano)
      const dues = await db.select({
        id: paymentDues.id,
        studentId: paymentDues.studentId,
        amount: paymentDues.amount,
        dueDate: paymentDues.dueDate,
        status: paymentDues.status,
        month: paymentDues.month,
        year: paymentDues.year,
        studentName: students.name,
        studentPhone: students.phone,
        studentEmail: students.email,
        studentCpf: students.cpf,
        instrumentName: instruments.name,
        asaasPaymentLink: paymentDues.asaasPaymentLink,
        mpPaymentLink: paymentDues.mpPaymentLink,
        infinitepayPaymentLink: paymentDues.infinitepayPaymentLink,
      })
        .from(paymentDues)
        .leftJoin(students, and(eq(paymentDues.studentId, students.id), eq(students.organizationId, orgId)))
        .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
        .where(and(
          eq(paymentDues.organizationId, orgId),
          or(eq(paymentDues.status, "pendente"), eq(paymentDues.status, "atrasado")),
          eq(paymentDues.userId, ctx.user.id)
        ));

      let created = 0;
      let skipped = 0;

      for (const due of dues) {
        const dueDate = new Date(String(due.dueDate) + "T12:00:00");
        const dueDateStr = String(due.dueDate).slice(0, 10);
        const isOverdue = dueDateStr < today;

        let reminderTime: Date;
        let type: "cobranca" | "inadimplencia";
        let refId: string;
        let defaultBody: string;

        if (isOverdue) {
          // Mensalidade vencida → lembrete de inadimplência imediato
          type = "inadimplencia";
          refId = `overdue-${due.id}-${today}`;
          reminderTime = new Date(now);
          defaultBody = "Olá {nome}, sua mensalidade de {valor} venceu em {vencimento} e ainda não foi paga. Por favor, entre em contato para regularizar.";
        } else {
          // Mensalidade futura → lembrete 3 dias antes às 9h
          type = "cobranca";
          const reminderDate = new Date(dueDate);
          reminderDate.setDate(dueDate.getDate() - 3);
          reminderDate.setHours(9, 0, 0, 0);
          // Só gera se a janela de 3 dias já chegou
          if (reminderDate > now) { skipped++; continue; }
          reminderTime = reminderDate;
          refId = `payment-${due.id}-${due.year}-${due.month}`;
          defaultBody = "Olá {nome}, sua mensalidade de {valor} vence em {vencimento}. Por favor, efetue o pagamento.";
        }

        // ✅ TRAVA PRINCIPAL: Se já existe QUALQUER lembrete 'enviado' ou 'cancelado' para esta cobrança
        // (independente do refId), não criar novo. Isso impede regeneração após "Concluir" ou "Cancelar".
        const alreadySentPayment = await db.select({ id: reminders.id }).from(reminders)
          .where(and(
            eq(reminders.organizationId, orgId),
            eq(reminders.paymentDueId, due.id),
            or(eq(reminders.status, "enviado"), eq(reminders.status, "cancelado"))
          )).limit(1);
        if (alreadySentPayment.length > 0) { skipped++; continue; }

        // Verificar duplicidade por refId (qualquer status: pendente, cancelado)
        const existing = await db.select({ id: reminders.id }).from(reminders)
          .where(
            and(
              eq(reminders.organizationId, orgId),
              isOverdue
                ? eq(reminders.refId, refId)
                : or(
                    eq(reminders.refId, refId),
                    eq(reminders.refId, `pay-prev-${due.id}`),
                    eq(reminders.refId, `pay-hoje-${due.id}`)
                  )
            )
          ).limit(1);
        if (existing.length > 0) { skipped++; continue; }

        // Buscar template do tipo (prioriza padrão, depois qualquer um do tipo cadastrado)
        let [tpl] = await db.select().from(reminderTemplates)
          .where(and(eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id), eq(reminderTemplates.type, type), eq(reminderTemplates.isDefault, 1)))
          .limit(1);

        if (!tpl) {
          const anyTpl = await db.select().from(reminderTemplates)
            .where(
              and(
                eq(reminderTemplates.organizationId, orgId),
                eq(reminderTemplates.userId, ctx.user.id),
                eq(reminderTemplates.type, type)
              )
            )
            .limit(1);
          if (anyTpl.length > 0) {
            tpl = anyTpl[0];
          }
        }

        const vencimento = dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
        const valor = Number(due.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const bodyTemplate = tpl?.body ?? defaultBody;
        let message = bodyTemplate
          .replace(/\{nome\}/g, due.studentName ?? "Aluno")
          .replace(/\{valor\}/g, valor)
          .replace(/\{vencimento\}/g, vencimento)
          .replace(/\{instrumento\}/g, due.instrumentName ?? "música")
          .replace(/\{chave_pix\}/g, pixKey ?? "");

        // Adiciona link de pagamento do gateway ativo, gerando se não existir
        let paymentLink = paymentGateway === "mercadopago"
          ? (due.mpPaymentLink ?? null)
          : paymentGateway === "infinitepay"
            ? (due.infinitepayPaymentLink ?? null)
            : (due.asaasPaymentLink ?? null);

        if (!paymentLink) {
          if (paymentGateway === "infinitepay" && userSettings.infinitepayHandle && (userSettings.infinitepayEnabled === 1 || userSettings.infinitepayEnabled === undefined || userSettings.infinitepayEnabled === null)) {
            try {
              const { createInfinitePayLink, buildInfinitePayWebhookUrl, brlToCents, resolveInfinitePayApiKey } = await import('../utils/infinitepay');
              const { createPaymentShortLink } = await import('../utils/shortlinks');
              const ipLink = await createInfinitePayLink({
                handle: userSettings.infinitepayHandle,
                orderNsu: String(due.id),
                items: [{
                  quantity: 1,
                  price: brlToCents(due.amount),
                  description: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                }],
                redirectUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/painel/mensalidades`,
                webhookUrl: buildInfinitePayWebhookUrl(due.id),
                apiKey: resolveInfinitePayApiKey(userSettings.infinitepayApiKey),
                customer: {
                  name: due.studentName || 'Aluno',
                  email: due.studentEmail || undefined,
                  phone: due.studentPhone || undefined,
                },
              });

              const shareUrl = await createPaymentShortLink(db, {
                targetUrl: ipLink.url,
                organizationId: orgId,
                userId: ctx.user.id,
                paymentDueId: due.id,
              });

              await db.update(paymentDues).set({ infinitepayPaymentLink: shareUrl, infinitepaySlug: ipLink.slug }).where(eq(paymentDues.id, due.id));
              paymentLink = shareUrl;
            } catch (err) {
              console.error("[InfinitePay Auto-Generate Error]", err);
            }
          } else if (paymentGateway === "mercadopago" && userSettings.mpAccessToken) {
            try {
              const { createMPPreference } = await import('../utils/mercadopago');
              const pref = await createMPPreference({
                items: [{
                  title: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                  quantity: 1,
                  currency_id: "BRL",
                  unit_price: Number(due.amount)
                }],
                payer: {
                  name: due.studentName || 'Aluno',
                  email: due.studentEmail || "aluno@musicpro.com.br"
                },
                external_reference: due.id.toString(),
                successUrl: `https://wrmusicpro.com.br/painel/mensalidades`
              }, decryptSecret(userSettings.mpAccessToken));
              
              await db.update(paymentDues).set({ mpPaymentId: pref.id, mpPaymentLink: pref.init_point }).where(eq(paymentDues.id, due.id));
              paymentLink = pref.init_point;
            } catch (err) {
              console.error("[MP Auto-Generate Error]", err);
            }
          } else if (paymentGateway === "asaas" && (userSettings.asaasEnabled === 1 || userSettings.asaasEnabled === undefined || userSettings.asaasEnabled === null) && userSettings.asaasApiKey) {
            try {
              const { createAsaasCustomer, createAsaasCharge } = await import('../utils/asaas');
              let asaasCustomerId: string | null = null;
              
              const [existingCustomer] = await db.select().from(asaasCustomers)
                .where(and(eq(asaasCustomers.studentId, due.studentId), eq(asaasCustomers.organizationId, orgId)))
                .limit(1);

              if (existingCustomer) {
                asaasCustomerId = existingCustomer.asaasCustomerId;
              } else {
                asaasCustomerId = await createAsaasCustomer({
                  name: due.studentName || 'Aluno',
                  email: due.studentEmail ?? undefined,
                  phone: due.studentPhone ?? undefined,
                  cpfCnpj: due.studentCpf ?? undefined,
                }, decryptSecret(userSettings.asaasApiKey));
                
                if (asaasCustomerId) {
                  await db.insert(asaasCustomers).values({ organizationId: orgId, studentId: due.studentId, asaasCustomerId });
                }
              }

              if (asaasCustomerId) {
                const charge = await createAsaasCharge({
                  asaasCustomerId,
                  billingType: 'UNDEFINED',
                  value: Number(due.amount),
                  dueDate: String(due.dueDate).slice(0, 10),
                  description: `Mensalidade ${due.month}/${due.year} - ${due.studentName}`,
                }, decryptSecret(userSettings.asaasApiKey));

                await db.update(paymentDues).set({ asaasId: charge.id, asaasPaymentLink: charge.invoiceUrl, asaasBillingType: charge.billingType }).where(eq(paymentDues.id, due.id));
                paymentLink = charge.invoiceUrl;
              }
            } catch (err) {
              console.error("[Asaas Auto-Generate Error]", err);
            }
          }
        }

        const hasLinkTag = /\{link_pagamento\}|\{link_cobranca\}|\{link\}|\{payment_link\}/.test(message);
        if (hasLinkTag) {
          const replacement = paymentLink ?? (pixKey ? `PIX: ${pixKey}` : "");
          message = message
            .replace(/\{link_pagamento\}/g, replacement)
            .replace(/\{link_cobranca\}/g, replacement)
            .replace(/\{link\}/g, replacement)
            .replace(/\{payment_link\}/g, replacement);
        } else if (paymentLink) {
          const gatewayName = paymentGateway === "mercadopago" ? "Mercado Pago" : paymentGateway === "infinitepay" ? "InfinitePay" : "Asaas";
          message += `\n\n💳 *Pague agora via ${gatewayName}:*\n${paymentLink}`;
        } else if (pixKey) {
          message += `\n\n💳 *Pagamento via PIX:*\n🔑 Chave: ${pixKey}`;
        }

        await db.insert(reminders).values({
          organizationId: orgId,
          userId: ctx.user.id,
          studentId: due.studentId,
          paymentDueId: due.id,
          type,
          message,
          scheduledAt: reminderTime,
          status: "pendente",
          autoGenerated: 1,
          refId,
        });
        created++;
      }

      if (created > 0) {
        await notifyUser(ctx.user.id, {
          title: "Lembretes Gerados",
          content: `Foram gerados ${created} novos lembretes de cobrança manualmente.`
        });
      }

      return { created, skipped };
    }),

    // ─ Criar lembrete manual ────────────────────────────────────────────────────────────
    create: protectedProcedure
      .input(z.object({
        studentId: z.number().nullable().optional(),
        type: z.enum(["aula", "cobranca", "inadimplencia", "manual"]),
        message: z.string().min(1),
        scheduledAt: z.string(), // ISO
        templateId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.insert(reminders).values({
          organizationId: orgId,
          userId: ctx.user.id,
          studentId: input.studentId ?? null,
          type: input.type,
          message: input.message,
          scheduledAt: new Date(input.scheduledAt),
          status: "pendente",
          autoGenerated: 0,
          templateId: input.templateId ?? null,
        });
        return { success: true };
      }),

    // ─ Marcar como enviado ───────────────────────────────────────────────────────────
    markSent: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.update(reminders)
          .set({ status: "enviado", sentAt: new Date() })
          .where(and(eq(reminders.id, input.id), eq(reminders.organizationId, orgId)));
        return { success: true };
      }),

    // ─ Disparar via Robô Fly.io ─────────────────────────────────────────────────────
    sendViaBot: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        
        const [rem] = await db.select({
          id: reminders.id,
          message: reminders.message,
          studentName: students.name,
          studentPhone: students.phone,
          guardianPhone: students.guardianPhone,
          birthDate: students.birthDate,
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
          logoUrl: settings.logoUrl,
        })
        .from(reminders)
        .leftJoin(students, and(eq(reminders.studentId, students.id), eq(students.organizationId, orgId)))
        .leftJoin(settings, eq(settings.userId, ctx.user.id))
        .where(and(eq(reminders.id, input.id), eq(reminders.organizationId, orgId)))
        .limit(1);

        if (!rem) throw new Error("Lembrete não encontrado.");
        const botUrl = rem.whatsappBotUrl || process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
        const botToken = rem.whatsappBotToken || process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";

        let targetPhone = rem.studentPhone;
        if (rem.birthDate) {
          const birthDate = new Date(rem.birthDate);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age < 18 && rem.guardianPhone && rem.guardianPhone.trim()) {
            targetPhone = rem.guardianPhone;
          }
        }

        if (!targetPhone) throw new Error("Aluno/Responsável sem telefone cadastrado.");

        const schoolLogo = (rem.logoUrl && String(rem.logoUrl).trim().startsWith("http"))
          ? String(rem.logoUrl).trim()
          : null;

        const sendRes = await sendWhatsAppMessage({
          url: botUrl,
          token: botToken,
          phone: targetPhone,
          message: rem.message,
          mediaUrl: schoolLogo,
          sessionId: `prof_${ctx.user.id}`,
        });

        if (sendRes.success) {
          await db.update(reminders)
            .set({ status: "enviado", sentAt: new Date(), externalMessageId: sendRes.messageId, errorMessage: null })
            .where(eq(reminders.id, input.id));
          
          await notifyUser(ctx.user.id, {
            title: "Mensagem Enviada",
            content: `Mensagem enviada com sucesso para ${rem.studentName || "Aluno"} (${targetPhone}).`,
          });

          return { success: true, messageId: sendRes.messageId };
        } else {
          await db.update(reminders)
            .set({ errorMessage: sendRes.error })
            .where(eq(reminders.id, input.id));
          throw new Error(sendRes.error);
        }
      }),

    // ─ Cancelar lembrete ────────────────────────────────────────────────────────────
    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.update(reminders)
          .set({ status: "cancelado", cancelledAt: new Date() })
          .where(and(eq(reminders.id, input.id), eq(reminders.organizationId, orgId)));
        return { success: true };
      }),

    // ─ Excluir lembrete ────────────────────────────────────────────────────────────
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        await db.delete(reminders)
          .where(and(eq(reminders.id, input.id), eq(reminders.organizationId, orgId)));

        return { success: true };
      }),

    // ─ Concluir todos os lembretes pendentes acumulados (evita disparo em massa) ──
    completeAllPending: protectedProcedure
      .input(z.object({
        targetStatus: z.enum(["enviado", "cancelado"]).default("enviado"),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const target = input?.targetStatus || "enviado";

        const whereCondition = isAdmin
          ? and(eq(reminders.organizationId, orgId), eq(reminders.status, "pendente"))
          : and(eq(reminders.organizationId, orgId), eq(reminders.userId, ctx.user.id), eq(reminders.status, "pendente"));

        const updated = await db
          .update(reminders)
          .set({
            status: target,
            sentAt: target === "enviado" ? new Date() : null,
            cancelledAt: target === "cancelado" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(whereCondition)
          .returning({ id: reminders.id });

        return {
          success: true,
          count: updated.length,
          message: `${updated.length} lembrete(s) pendente(s) marcado(s) como ${target === "enviado" ? "concluído(s)" : "cancelado(s)"} com sucesso!`,
        };
      }),

    // ─ Cancelar lembrete quando aula é cancelada ────────────────────────────────
    syncLessonCancelled: protectedProcedure
      .input(z.object({ lessonId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.update(reminders)
          .set({ status: "cancelado", cancelledAt: new Date() })
          .where(
            and(
              eq(reminders.lessonId, input.lessonId),
              eq(reminders.organizationId, orgId),
              eq(reminders.status, "pendente")
            )
          );
        return { success: true };
      }),

    // ─ Cancelar lembrete quando mensalidade é paga ─────────────────────────────
    syncPaymentPaid: protectedProcedure
      .input(z.object({ paymentDueId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.update(reminders)
          .set({ status: "cancelado", cancelledAt: new Date() })
          .where(
            and(
              eq(reminders.paymentDueId, input.paymentDueId),
              eq(reminders.organizationId, orgId),
              eq(reminders.status, "pendente")
            )
          );
        return { success: true };
      }),

    testNotification: protectedProcedure
      .input(z.object({ title: z.string(), content: z.string() }))
      .mutation(async ({ input }) => {
        const ok = await notifyOwner(input);
        if (!ok) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Falha na comunicação com o serviço de notificações do sistema. Verifique se as permissões de notificação estão ativas."
          });
        }
        return ok;
      }),
  }),

  whatsapp: router({
    startSession: protectedProcedure
      .input(z.object({ 
        phoneNumber: z.string().optional(),
        mode: z.enum(["QR_CODE", "PAIRING_CODE"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [userSet] = await db.select({
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
        }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);

        const sessionId = `prof_${ctx.user.id}`;

        // ── MARCAR SESSÃO COMO EM PAREAMENTO ────────────────────────────────────
        // Isso blinda o Keep-Alive do automationJob de destruir a sessão
        // enquanto o usuário está tentando escanear o QR Code ou inserir o código.
        pairingActiveSessions.set(sessionId, Date.now());

        const result = await startWhatsAppSession({
          url: userSet?.whatsappBotUrl || undefined,
          token: userSet?.whatsappBotToken || undefined,
          sessionId,
          phoneNumber: input.phoneNumber || "",
          mode: input.mode,
        });

        // Se falhou, remove o flag de pareamento imediatamente
        if (!result.success) {
          pairingActiveSessions.delete(sessionId);
        }

        return result;
      }),

    getStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [userSet] = await db.select({
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
        }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);

        const sessionId = `prof_${ctx.user.id}`;
        try {
          const statusResult = await getWhatsAppSessionStatus({
            url: userSet?.whatsappBotUrl || undefined,
            token: userSet?.whatsappBotToken || undefined,
            sessionId,
          });

          // Se conectou com sucesso, remove o flag de pareamento ativo
          if (statusResult.status === "CONNECTED") {
            pairingActiveSessions.delete(sessionId);
          }

          return statusResult;
        } catch (err: any) {
          return { sessionId, status: "DISCONNECTED", phone: "" };
        }
      }),

    logout: protectedProcedure
      .mutation(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [userSet] = await db.select({
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
        }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);

        const sessionId = `prof_${ctx.user.id}`;

        // Limpa o flag de pareamento ao desconectar manualmente
        pairingActiveSessions.delete(sessionId);

        return await logoutWhatsAppSession({
          url: userSet?.whatsappBotUrl || undefined,
          token: userSet?.whatsappBotToken || undefined,
          sessionId,
        });
      }),

    testConnection: protectedProcedure
      .mutation(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [userSet] = await db.select({
          phone: settings.phone,
          whatsappBotUrl: settings.whatsappBotUrl,
          whatsappBotToken: settings.whatsappBotToken,
        }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);

        if (!userSet?.phone) {
          throw new Error("Você precisa cadastrar o seu número de celular nas configurações do Perfil para realizar o teste.");
        }

        const sessionId = `prof_${ctx.user.id}`;
        const sendRes = await sendWhatsAppMessage({
          url: userSet?.whatsappBotUrl || undefined,
          token: userSet?.whatsappBotToken || undefined,
          phone: userSet.phone,
          message: "🤖 Teste de Conexão: O robô de mensagens do seu MusicPro está funcionando perfeitamente!",
          sessionId,
        });

        if (!sendRes.success) {
          throw new Error(sendRes.error || "Falha ao enviar mensagem de teste.");
        }

        return { success: true };
      }),
  }),

  reminderTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId!;
      const db = await getDb();
      if (!db) return [];
      return db.select().from(reminderTemplates)
        .where(and(eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id)))
        .orderBy(asc(reminderTemplates.type));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        type: z.enum(["aula", "cobranca", "inadimplencia", "manual"]),
        body: z.string().min(1),
        isDefault: z.boolean().optional(),
        sendToStudent: z.boolean().optional(),
        sendToGuardian: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const orgId = ctx.user.organizationId!;
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          
          if (input.isDefault) {
            await db.update(reminderTemplates)
              .set({ isDefault: 0 })
              .where(and(eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id), eq(reminderTemplates.type, input.type)));
          }
          await db.insert(reminderTemplates).values({
            organizationId: orgId,
            userId: ctx.user.id,
            name: input.name,
            type: input.type,
            body: input.body,
            isDefault: input.isDefault ? 1 : 0,
            sendToStudent: input.sendToStudent ?? true,
            sendToGuardian: input.sendToGuardian ?? false,
            createdAt: new Date(),
          });
          return { success: true };
        } catch (error) {
          return handleDbError(error, "criar o modelo de lembrete");
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        type: z.enum(["aula", "cobranca", "inadimplencia", "manual"]).optional(),
        body: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
        sendToStudent: z.boolean().optional(),
        sendToGuardian: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const { id, isDefault, ...rest } = input;
          const updateData: Record<string, unknown> = { ...rest };
          
          if (isDefault !== undefined) {
            if (isDefault && rest.type) {
              await db.update(reminderTemplates)
                .set({ isDefault: 0 })
                .where(and(eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id), eq(reminderTemplates.type, rest.type)));
            }
            updateData.isDefault = isDefault ? 1 : 0;
          }
          
          await db.update(reminderTemplates).set(updateData)
            .where(and(eq(reminderTemplates.id, id), eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id)));
          return { success: true };
        } catch (error) {
          return handleDbError(error, "atualizar o modelo de lembrete");
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          await db.delete(reminderTemplates)
            .where(and(eq(reminderTemplates.id, input.id), eq(reminderTemplates.organizationId, orgId), eq(reminderTemplates.userId, ctx.user.id)));
          return { success: true };
        } catch (error) {
          return handleDbError(error, "remover o modelo de lembrete");
        }
      }),
  }),

  announcements: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      return db.select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        important: announcements.important,
        targetStudentId: announcements.targetStudentId,
        createdAt: announcements.createdAt,
        authorName: users.name,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.userId, users.id))
      .where(and(eq(announcements.organizationId, orgId), eq(announcements.userId, ctx.user.id)))
      .orderBy(desc(announcements.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      title: z.string(),
      content: z.string(),
      important: z.boolean().default(false),
      targetStudentId: z.number().nullable().optional(),
      targetStudentIds: z.array(z.number()).optional(),
      sendViaWhatsApp: z.boolean().default(false).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      // Normalizar lista de alunos alvo
      let targetIds: number[] = [];
      if (input.targetStudentIds && input.targetStudentIds.length > 0) {
        targetIds = Array.from(new Set(input.targetStudentIds));
      } else if (input.targetStudentId) {
        targetIds = [input.targetStudentId];
      }

      if (targetIds.length > 0) {
        // Criar um registro de comunicado para cada aluno selecionado
        for (const studentId of targetIds) {
          await db.insert(announcements).values({
            organizationId: orgId,
            userId: ctx.user.id,
            title: input.title,
            content: input.content,
            important: input.important,
            targetStudentId: studentId,
          });
        }
      } else {
        // Para todos os alunos
        await db.insert(announcements).values({
          organizationId: orgId,
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          important: input.important,
          targetStudentId: null,
        });
      }

      if (input.sendViaWhatsApp) {
        // Formatar mensagem
        const messageText = `*Novo Comunicado:* ${input.title}\n${input.important ? '🚨 *URGENTE*\n' : ''}\n${input.content}`;
        const sessionId = `prof_${ctx.user.id}`;
        
        // Disparar assincronamente (background) para não travar o frontend
        (async () => {
          try {
            if (targetIds.length > 0) {
              for (const sId of targetIds) {
                // AUDIT-P1 FIX (IDOR): filtrar por organização — sem isso, um usuário
                // podia enviar WhatsApp para alunos de OUTRA escola informando IDs arbitrários
                const [student] = await db.select()
                  .from(students)
                  .where(and(eq(students.id, sId), eq(students.organizationId, orgId)))
                  .limit(1);
                if (student && student.phone) {
                  await sendWhatsAppMessage({
                    phone: student.phone,
                    message: messageText,
                    sessionId
                  });
                  if (targetIds.length > 1) {
                    await new Promise(r => setTimeout(r, 800));
                  }
                }
              }
            } else {
              const allStudents = await db.select()
                .from(students)
                .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));
              for (const student of allStudents) {
                if (student.phone) {
                  await sendWhatsAppMessage({
                    phone: student.phone,
                    message: messageText,
                    sessionId
                  });
                  // Pequeno delay para envios em massa
                  await new Promise(r => setTimeout(r, 1000));
                }
              }
            }
          } catch (err) {
            console.error("Erro no envio em massa de comunicados via WhatsApp:", err);
          }
        })();
      }

      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.delete(announcements).where(and(eq(announcements.id, input.id), eq(announcements.organizationId, orgId), eq(announcements.userId, ctx.user.id)));
      return { success: true };
    }),
  }),

  automations: router({
    // List all automation rules for the current user/org
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { messageAutomationRules } = await import("../../drizzle/schema");
      const orgId = ctx.user.organizationId!;
      const userId = ctx.user.id;

      const rules = await db
        .select()
        .from(messageAutomationRules)
        .where(
          and(
            eq(messageAutomationRules.organizationId, orgId),
            eq(messageAutomationRules.userId, userId)
          )
        )
        .orderBy(desc(messageAutomationRules.isSystem), asc(messageAutomationRules.createdAt));
      return rules;
    }),

    // Create a new custom automation rule
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          trigger: z.string().min(1),
          offsetDays: z.number().default(0),
          offsetHours: z.number().default(0),
          triggerUnit: z.enum(["meses", "aulas"]).default("meses"),
          conditions: z.string().optional(),
          actions: z.string().optional(),
          messageTemplate: z.string().min(1),
          channel: z.string().default("whatsapp"),
          isActive: z.number().default(1),
          sendToStudent: z.boolean().default(true),
          sendToGuardian: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { messageAutomationRules } = await import("../../drizzle/schema");
        const orgId = ctx.user.organizationId!;
        const userId = ctx.user.id;

        debugLog("[automations.create] RECEIVED REQUEST:", { userId, orgId, name: input.name, trigger: input.trigger });

        // RN: contratos exigem valor > 0 (meses/aulas) — não agenda "quando faltar 0"
        if (input.trigger === "contract_expiring" && input.offsetDays <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor (meses/aulas) maior que zero para o fim de contrato." });
        }

        try {
          // Use Drizzle's .insert().values().returning() for safe superjson serialization
          // (db.execute with RETURNING returns postgres.Row[] which is not a plain JS array
          //  and cannot be serialized by superjson, causing "Unable to transform response" errors)
          const inserted = await db
            .insert(messageAutomationRules)
            .values({
              organizationId: orgId,
              userId,
              name: input.name,
              description: input.description ?? null,
              isSystem: 0,
              isActive: input.isActive,
              trigger: input.trigger,
              offsetDays: input.offsetDays,
              offsetHours: input.offsetHours,
              triggerUnit: input.triggerUnit,
              conditions: input.conditions ?? null,
              messageTemplate: input.messageTemplate,
              channel: input.channel,
              sendToStudent: input.sendToStudent ? 1 : 0,
              sendToGuardian: input.sendToGuardian ? 1 : 0,
            })
            .returning({ id: messageAutomationRules.id });

          const newId = inserted[0]?.id ?? null;
          debugLog("[automations.create] INSERT OK, newId=", newId);

          return { success: true, id: Number(newId), name: input.name };
        } catch (error) {
          console.error("[automations.create] FAILED:", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao salvar automação: " + String(error) });
        }
      }),

    // Update an existing automation rule (name, template, timing, etc.)
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional().nullable(),
          trigger: z.string().optional(), // BUG#4 FIX: permite atualizar o trigger
          offsetDays: z.number().optional(),
          offsetHours: z.number().optional(),
          triggerUnit: z.enum(["meses", "aulas"]).optional(),
          conditions: z.string().optional().nullable(), // BUG#3 FIX: persistir daysOfWeek+sendTime do daily_study
          actions: z.string().optional(),
          messageTemplate: z.string().optional(),
          channel: z.string().optional(),
          isActive: z.number().optional(),
          sendToStudent: z.boolean().optional(),
          sendToGuardian: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { messageAutomationRules } = await import("../../drizzle/schema");
        const orgId = ctx.user.organizationId!;
        const userId = ctx.user.id;

        const { id, ...fields } = input;
        const updateData: Record<string, any> = {};
        if (fields.name !== undefined) updateData.name = fields.name;
        if (fields.description !== undefined) updateData.description = fields.description;
        if (fields.trigger !== undefined) updateData.trigger = fields.trigger;
        if (fields.offsetDays !== undefined) updateData.offsetDays = fields.offsetDays;
        if (fields.offsetHours !== undefined) updateData.offsetHours = fields.offsetHours;
        if (fields.triggerUnit !== undefined) updateData.triggerUnit = fields.triggerUnit;
        // BUG#3+#4 FIX: conditions agora é persistido corretamente (null limpa, string salva)
        if (fields.conditions !== undefined) updateData.conditions = fields.conditions ?? null;
        if (fields.actions !== undefined) updateData.actions = fields.actions;
        if (fields.messageTemplate !== undefined) updateData.messageTemplate = fields.messageTemplate;
        if (fields.channel !== undefined) updateData.channel = fields.channel;
        if (fields.isActive !== undefined) updateData.isActive = fields.isActive;
        if (fields.sendToStudent !== undefined) updateData.sendToStudent = fields.sendToStudent ? 1 : 0;
        if (fields.sendToGuardian !== undefined) updateData.sendToGuardian = fields.sendToGuardian ? 1 : 0;
        updateData.updatedAt = new Date();

        // RN: contratos exigem valor > 0 (meses/aulas) — não agenda "quando faltar 0"
        if ((fields.trigger ?? "" ) === "contract_expiring" && (fields.offsetDays ?? 0) <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor (meses/aulas) maior que zero para o fim de contrato." });
        }

        await db
          .update(messageAutomationRules)
          .set(updateData)
          .where(
            and(
              eq(messageAutomationRules.id, id),
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId)
            )
          );
        return { success: true };
      }),

    // Toggle active/inactive
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { messageAutomationRules } = await import("../../drizzle/schema");
        const orgId = ctx.user.organizationId!;
        const userId = ctx.user.id;

        await db
          .update(messageAutomationRules)
          .set({ isActive: input.isActive, updatedAt: new Date() })
          .where(
            and(
              eq(messageAutomationRules.id, input.id),
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId)
            )
          );
        return { success: true };
      }),

    // Delete a custom rule (system rules cannot be deleted)
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { messageAutomationRules } = await import("../../drizzle/schema");
        const orgId = ctx.user.organizationId!;
        const userId = ctx.user.id;

        const [rule] = await db
          .select()
          .from(messageAutomationRules)
          .where(
            and(
              eq(messageAutomationRules.id, input.id),
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId)
            )
          )
          .limit(1);

        if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
        if (rule.isSystem === 1) throw new TRPCError({ code: "FORBIDDEN", message: "Regras do sistema não podem ser excluídas." });

        // BUG-AUTO-003 FIX: Adiciona orgId + userId no WHERE do DELETE para
        // garantir defesa em profundidade. Sem isso, um race condition multi-processo
        // poderia apagar uma regra de outra organização caso o id coincidisse.
        await db
          .delete(messageAutomationRules)
          .where(
            and(
              eq(messageAutomationRules.id, input.id),
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId)
            )
          );
        return { success: true };
      }),

    // Get execution history (reminders generated by a specific rule)
    history: protectedProcedure
      .input(z.object({ ruleId: z.number(), limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;

        const rows = await db
          .select({
            id: reminders.id,
            studentName: students.name,
            studentPhone: students.phone,
            message: reminders.message,
            status: reminders.status,
            scheduledAt: reminders.scheduledAt,
            sentAt: reminders.sentAt,
            errorMessage: reminders.errorMessage,
            channel: reminders.type,
          })
          .from(reminders)
          .leftJoin(students, and(eq(reminders.studentId, students.id), eq(students.organizationId, orgId)))
          .where(
            and(
              eq(reminders.organizationId, orgId),
              eq(reminders.userId, ctx.user.id),
              sql`${reminders.refId} LIKE ${'auto-rule-' + input.ruleId + '-%'}`
            )
          )
          .orderBy(desc(reminders.createdAt))
          .limit(input.limit);
        return rows;
      }),

    // Dashboard stats
    stats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalSent: 0, activeRules: 0, deliveryRate: 0, topRule: null };
      const { messageAutomationRules } = await import("../../drizzle/schema");
      const orgId = ctx.user.organizationId!;
      const userId = ctx.user.id;

      try {
        const rules = await db
          .select()
          .from(messageAutomationRules)
          .where(
            and(
              eq(messageAutomationRules.organizationId, orgId),
              eq(messageAutomationRules.userId, userId)
            )
          );

        const totalSent = rules.reduce((acc, r) => acc + (r.totalSent || 0), 0);
        const activeRules = rules.filter(r => r.isActive === 1).length;

        // Count sent/error from reminders with auto-rule prefix
        const [sentCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(reminders)
          .where(
            and(
              eq(reminders.organizationId, orgId),
              eq(reminders.userId, userId),
              eq(reminders.status, "enviado"),
              sql`${reminders.refId} LIKE 'auto-rule-%'`
            )
          );

        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(reminders)
          .where(
            and(
              eq(reminders.organizationId, orgId),
              eq(reminders.userId, userId),
              sql`${reminders.refId} LIKE 'auto-rule-%'`
            )
          );

        const sentNum = Number(sentCount?.count ?? 0);
        const totalNum = Number(totalCount?.count ?? 0);
        const deliveryRate = totalNum > 0 ? Math.round((sentNum / totalNum) * 100) : 0;
        const topRule = rules.sort((a, b) => (b.totalSent || 0) - (a.totalSent || 0))[0] ?? null;

        return {
          totalSent: sentNum || 0,
          activeRules,
          deliveryRate,
          topRule: topRule ? { id: topRule.id, name: topRule.name, totalSent: topRule.totalSent } : null,
        };
      } catch (e) {
        console.error("[automations.stats] ERROR:", e);
        return { totalSent: 0, activeRules: 0, deliveryRate: 0, topRule: null };
      }
    }),

    // Seed default system rules for the current user if they don't exist yet
    seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { messageAutomationRules } = await import("../../drizzle/schema");
      const orgId = ctx.user.organizationId!;
      const userId = ctx.user.id;

      const existing = await db
        .select({ id: messageAutomationRules.id })
        .from(messageAutomationRules)
        .where(
          and(
            eq(messageAutomationRules.organizationId, orgId),
            eq(messageAutomationRules.userId, userId),
            eq(messageAutomationRules.isSystem, 1)
          )
        )
        .limit(1);

      if (existing.length > 0) return { seeded: false };

      const systemRules = [
        {
          name: "Boas-vindas ao Novo Aluno",
          description: "Envia mensagem de boas-vindas quando um novo aluno é matriculado.",
          trigger: "new_student",
          offsetDays: 0,
          offsetHours: 0,
          messageTemplate: "Olá {nome_aluno}! 🎵 Seja muito bem-vindo(a) à {nome_escola}! Estamos felizes em ter você aqui. Em breve seu professor {nome_professor} entrará em contato para organizar sua primeira aula de {curso}. Qualquer dúvida, estamos à disposição!",
          channel: "whatsapp",
        },
        {
          name: "Lembrete de Aula 24h Antes",
          description: "Lembra o aluno da aula 24 horas antes do horário agendado.",
          trigger: "lesson_scheduled",
          offsetDays: 0,
          offsetHours: -24,
          messageTemplate: "Olá {nome_aluno}! 🎸 Lembrando que você tem aula de {curso} amanhã, {data_aula} às {hora_aula}. Te esperamos! Qualquer imprevisto, entre em contato.",
          channel: "whatsapp",
        },
        {
          name: "Mensalidade Próxima do Vencimento",
          description: "Avisa o aluno sobre mensalidade prestes a vencer. Timing configurável.",
          trigger: "payment_due",
          offsetDays: -3,
          offsetHours: 0,
          messageTemplate: "Olá {nome_aluno}! 💰 Passando para lembrar que sua mensalidade de {valor_mensalidade} vence em {data_vencimento}. Por favor, realize o pagamento no prazo. Obrigado!",
          channel: "whatsapp",
        },
        {
          name: "Mensalidade Vencida",
          description: "Avisa o aluno que a mensalidade já venceu.",
          trigger: "payment_overdue",
          offsetDays: 0,
          offsetHours: 0,
          messageTemplate: "Olá {nome_aluno}! Identificamos que sua mensalidade de {valor_mensalidade} com vencimento em {data_vencimento} ainda consta como pendente. Por favor, regularize o quanto antes. Qualquer dúvida, fale conosco!",
          channel: "whatsapp",
        },
        {
          name: "Parabéns no Aniversário",
          description: "Envia mensagem de parabéns no dia do aniversário do aluno.",
          trigger: "birthday",
          offsetDays: 0,
          offsetHours: 0,
          messageTemplate: "🎂 Feliz Aniversário, {nome_aluno}! A equipe da {nome_escola} deseja um dia incrível cheio de muita música e alegria! 🎵🎉",
          channel: "whatsapp",
        },
        {
          name: "Confirmação de Pagamento Recebido",
          description: "Confirma ao aluno que o pagamento foi registrado.",
          trigger: "payment_confirmed",
          offsetDays: 0,
          offsetHours: 0,
          messageTemplate: "Olá {nome_aluno}! ✅ Seu pagamento de {valor_mensalidade} foi confirmado com sucesso. Obrigado pela pontualidade! Qualquer dúvida, estamos à disposição.",
          channel: "whatsapp",
        },
        {
          name: "Reativação de Aluno Inativo",
          description: "Envia mensagem para alunos que não acessam a plataforma há muitos dias.",
          trigger: "student_inactive",
          offsetDays: 30,
          offsetHours: 0,
          messageTemplate: "Olá {nome_aluno}! 🎵 Sentimos sua falta! Você está há {dias_sem_estudo} dias sem registrar atividades. Que tal voltar à sua jornada musical? Estamos aqui para te apoiar na {nome_escola}!",
          channel: "whatsapp",
        },
        {
          name: "Lembrete de Estudo Diário",
          description: "Envia lembrete motivacional para os alunos praticarem. Configure os dias da semana e o horário na aba de configurações da regra.",
          trigger: "daily_study",
          offsetDays: 0,
          offsetHours: 0,
          conditions: JSON.stringify({ daysOfWeek: [1, 2, 3, 4, 5], sendTime: "08:00" }),
          messageTemplate: "🎵 Olá {nome_aluno}! Hora de praticar {instrumento}!\nSeu professor {nome_professor} da {nome_escola} está torcendo por você.\nMesmo 15 minutinhos por dia fazem uma grande diferença. Vamos lá! 💪",
          channel: "whatsapp",
        },
        {
          name: "Fim de Contrato (aviso de encerramento)",
          description: "Avisa o aluno quando o contrato está próximo do fim. Configure a unidade (meses ou aulas) e o valor na aba de configurações.",
          trigger: "contract_expiring",
          offsetDays: 1,
          offsetHours: 0,
          triggerUnit: "meses",
          messageTemplate: "Olá {nome_aluno}! 📄 Seu contrato de {curso} está chegando ao fim. Se quiser continuar suas aulas, fale com a {nome_escola} para renovar. Qualquer dúvida, estamos à disposição!",
          channel: "whatsapp",
        },
      ];

      for (const rule of systemRules) {
        await db.insert(messageAutomationRules).values({
          organizationId: orgId,
          userId,
          isSystem: 1,
          isActive: 1,
          ...rule,
        });
      }

      return { seeded: true, count: systemRules.length };
    }),
  }),

};
