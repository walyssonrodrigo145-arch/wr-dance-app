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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs, turmas, teacherPaymentRules, teacherPaymentRuleConditions, teacherPaymentRuleCourses } from "../../drizzle/schema";
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
import { loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract, getTodayBR, toISODate } from "./helpers";
export const reportsRouters = {
  reports: router({
    getInstrumentStats: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      return getInstrumentsWithCount(orgId, isUserAdmin ? undefined : ctx.user.id);
    }),
    getFinanceiroDetails: protectedProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        const payments = await db.select({
          status: paymentDues.status,
          amount: paymentDues.amount,
          studentStatus: students.status,
          dueDate: paymentDues.dueDate,
        }).from(paymentDues)
          .leftJoin(students, eq(paymentDues.studentId, students.id))
          .where(and(
            eq(paymentDues.organizationId, orgId),
            userId ? eq(paymentDues.userId, userId) : undefined,
            eq(paymentDues.month, input.month),
            eq(paymentDues.year, input.year)
          ));

        const summary = {
          pago: 0,
          pendente: 0,
          atrasado: 0,
          total: 0
        };

        const today = getTodayBR();

        payments.forEach(p => {
          const amt = Number(p.amount);
          const isAtrasado = p.status === 'atrasado' || (p.status === 'pendente' && toISODate(p.dueDate) < today);
          if (p.status === 'pago') {
            summary.pago += amt;
            summary.total += amt;
          } else {
            if (isAtrasado) summary.atrasado += amt;
            else summary.pendente += amt;
            summary.total += amt;
          }
        });

        return summary;
      }),

    getDespesasDetails: protectedProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        const expensesList = await db.select({
          amount: expenses.amount,
          category: expenses.category,
          status: expenses.status,
        }).from(expenses)
          .where(and(
            eq(expenses.organizationId, orgId),
            userId ? eq(expenses.userId, userId) : undefined,
            sql`EXTRACT(MONTH FROM ${expenses.date}) = ${input.month}`,
            sql`EXTRACT(YEAR FROM ${expenses.date}) = ${input.year}`
          ));

        let total = 0;
        let pago = 0;
        let pendente = 0;
        const byCategory: Record<string, number> = {};

        expensesList.forEach(e => {
          const amt = Number(e.amount);
          total += amt;
          if (e.status === 'pago') pago += amt;
          else pendente += amt;
          byCategory[e.category] = (byCategory[e.category] || 0) + amt;
        });

        const categories = Object.keys(byCategory).map(k => ({
          name: k,
          value: byCategory[k]
        }));

        return { total, pago, pendente, categories };
      }),

    getProjecao6Meses: protectedProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        const activeStudents = await db.select({ monthlyFee: students.monthlyFee, billingPeriodicity: students.billingPeriodicity }).from(students)
          .where(and(
            eq(students.organizationId, orgId),
            userId ? eq(students.professorId, userId) : undefined,
            eq(students.status, 'ativo')
          ));
        // AUDITORIA (DP-027): normaliza planos não mensais para base MENSAL
        const periodicityMonths: Record<string, number> = {
          mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
        };
        const receitaBase = activeStudents.reduce((acc, s) => {
          const months = periodicityMonths[String(s.billingPeriodicity || "mensal")] || 1;
          return acc + Number(s.monthlyFee || 0) / months;
        }, 0);

        const recurringExpenses = await db.select({
          amount: expenses.amount,
          description: expenses.description,
          date: expenses.date,
        }).from(expenses)
          .where(and(
            eq(expenses.organizationId, orgId),
            userId ? eq(expenses.userId, userId) : undefined,
            eq(expenses.recurrence, 'mensal')
          ));
        // AUDITORIA (DP-027): recorrentes geram uma linha por mês — soma apenas a mais
        // recente de cada descrição para não multiplicar a despesa por 6 na projeção.
        const latestByDescription = new Map<string, { amount: number; date: string }>();
        for (const e of recurringExpenses) {
          const key = String(e.description || "");
          const dateStr = String(e.date || "");
          const prev = latestByDescription.get(key);
          if (!prev || dateStr > prev.date) {
            latestByDescription.set(key, { amount: Number(e.amount || 0), date: dateStr });
          }
        }
        let despesaBase = 0;
        latestByDescription.forEach((v) => { despesaBase += v.amount; });

        const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        const projection = [];

        let currentM = input.month;
        let currentY = input.year;

        for (let i = 0; i < 6; i++) {
          let m = currentM + i;
          let y = currentY;
          while (m > 12) { m -= 12; y += 1; }

          projection.push({
            monthName: `${MONTHS_PT[m - 1]}/${y}`,
            month: m,
            year: y,
            receita: receitaBase,
            despesa: despesaBase,
            lucro: receitaBase - despesaBase
          });
        }

        return {
          receitaBase,
          despesaBase,
          lucroBase: receitaBase - despesaBase,
          projection
        };
      }),

    getFrequencyDetails: protectedProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        const startOfMonth = new Date(input.year, input.month - 1, 1);
        const endOfMonth = new Date(input.year, input.month, 0, 23, 59, 59, 999);

        return db.select({
          id: lessons.id,
          date: lessons.scheduledAt,
          studentName: students.name,
          professorName: users.name,
          status: lessons.status,
          observation: lessons.title,
        })
        .from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .leftJoin(users, eq(lessons.userId, users.id))
        .where(and(
          eq(lessons.organizationId, orgId),
          userId ? eq(lessons.userId, userId) : undefined,
          gte(lessons.scheduledAt, startOfMonth),
          lte(lessons.scheduledAt, endOfMonth)
        ))
        .orderBy(desc(lessons.scheduledAt));
      }),

    getEvolutionDetails: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        return db.select({
          studentName: students.name,
          technical: studentEvolution.technical,
          rhythm: studentEvolution.rhythm,
          harmony: studentEvolution.harmony,
          reading: studentEvolution.reading,
          recordedAt: studentEvolution.recordedAt,
        })
        .from(studentEvolution)
        .leftJoin(students, eq(studentEvolution.studentId, students.id))
        .where(and(
          eq(studentEvolution.organizationId, orgId),
          userId ? eq(students.professorId, userId) : undefined
        ))
        .orderBy(desc(studentEvolution.recordedAt));
      }),

    getAlunosReport: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        return db.select({
          id: students.id,
          name: students.name,
          professorName: users.name,
          instrumentName: instruments.name,
          monthlyFee: students.monthlyFee,
          status: students.status,
        })
        .from(students)
        .leftJoin(users, eq(students.professorId, users.id))
        .leftJoin(instruments, eq(students.instrumentId, instruments.id))
        .where(and(
          eq(students.organizationId, orgId),
          userId ? eq(students.professorId, userId) : undefined
        ))
        .orderBy(students.name);
      }),

    getModalidadeStats: protectedProcedure
      .input(z.object({ month: z.number(), year: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const userId = (ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId) ? undefined : ctx.user.id;

        // 1. Distribuição de alunos por modalidade (ativos)
        const studentStats = await db.select({
          lessonType: students.lessonType,
          count: sql<number>`CAST(count(*) AS INT)`,
        })
        .from(students)
        .where(and(
          eq(students.organizationId, orgId),
          userId ? eq(students.professorId, userId) : undefined,
          eq(students.status, 'ativo')
        ))
        .groupBy(students.lessonType);

        // 2. Faturamento por modalidade (recebido e a receber)
        const revenueStats = await db.select({
          lessonType: students.lessonType,
          recebido: sql<number>`CAST(sum(CASE WHEN ${paymentDues.status} = 'pago' THEN CAST(${paymentDues.amount} AS DECIMAL) ELSE 0 END) AS FLOAT)`,
          aReceber: sql<number>`CAST(sum(CASE WHEN ${paymentDues.status} IN ('pendente', 'atrasado') THEN CAST(${paymentDues.amount} AS DECIMAL) ELSE 0 END) AS FLOAT)`,
          total: sql<number>`CAST(sum(CASE WHEN ${paymentDues.status} = 'pago' THEN CAST(${paymentDues.amount} AS DECIMAL) ELSE 0 END) AS FLOAT)`, // Mantendo 'total' igual a 'recebido' para compatibilidade caso outro lugar use, ou podemos deixar como a soma de tudo. Como antes filtrava apenas por 'pago', o 'total' de antes era apenas o pago.
        })
        .from(paymentDues)
        .leftJoin(students, eq(paymentDues.studentId, students.id))
        .where(and(
          eq(paymentDues.organizationId, orgId),
          userId ? eq(paymentDues.userId, userId) : undefined,
          eq(paymentDues.month, input.month),
          eq(paymentDues.year, input.year)
        ))
        .groupBy(students.lessonType);

        return {
          students: studentStats,
          revenue: revenueStats
        };
      }),
  }),

  professores: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const list = await db.select({
        professor: professores,
        userName: users.name,
        userEmail: users.email,
        openId: users.openId,
      })
        .from(professores)
        .innerJoin(users, eq(users.id, professores.userId))
        .where(eq(professores.organizationId, orgId));

      return list.map(p => ({
        ...p.professor,
        name: p.userName,
        email: p.userEmail,
      }));
    }),

    /**
     * Dashboard de professores — ADMIN/OWNER apenas (professor NÃO acessa).
     * KPIs + métricas por professor: alunos ativos, aulas do mês, folha do mês,
     * último acesso, telefone e permissões (para a nova página /professores).
     */
    overview: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem acessar a gestão de professores." });
      }
      const db = await getDb();
      if (!db) return { kpis: { totalProfessores: 0, alunosAtivos: 0, aulasMes: 0, custoMes: 0 }, professores: [] };
      const orgId = ctx.user.organizationId!;

      // Mês/ano corrente no fuso de Brasília
      const [year, month] = getTodayBR().split("-").map(Number);

      const rows = await db
        .select({
          professor: professores,
          userName: users.name,
          userEmail: users.email,
          lastSignedIn: users.lastSignedIn,
        })
        .from(professores)
        .innerJoin(users, eq(users.id, professores.userId))
        .where(eq(professores.organizationId, orgId));

      const profUserIds = rows.map((p) => p.professor.userId);

      // Alunos ATIVOS por professor (students.professorId = professores.userId)
      const alunosMap = new Map<number, number>();
      if (profUserIds.length > 0) {
        const rows = await db
          .select({ professorId: students.professorId, total: sql<number>`CAST(count(*) AS INT)` })
          .from(students)
          .where(and(
            eq(students.organizationId, orgId),
            eq(students.status, "ativo"),
            inArray(students.professorId, profUserIds)
          ))
          .groupBy(students.professorId);
        for (const r of rows) alunosMap.set(r.professorId, Number(r.total));
      }

      // Aulas do MÊS por professor (lessons.userId = professores.userId), sem canceladas
      const aulasMap = new Map<number, number>();
      if (profUserIds.length > 0) {
        const rows = await db
          .select({ userId: lessons.userId, total: sql<number>`CAST(count(*) AS INT)` })
          .from(lessons)
          .where(and(
            eq(lessons.organizationId, orgId),
            inArray(lessons.userId, profUserIds),
            ne(lessons.status, "cancelada"),
            sql`EXTRACT(MONTH FROM ${lessons.scheduledAt}) = ${month}`,
            sql`EXTRACT(YEAR FROM ${lessons.scheduledAt}) = ${year}`
          ))
          .groupBy(lessons.userId);
        for (const r of rows) aulasMap.set(r.userId, Number(r.total));
      }

      // Folha do MÊS por professor (professorPayments.professorId = professores.id)
      const pagMap = new Map<number, { totalClasses: number; totalAmount: number; status: string }>();
      if (rows.length > 0) {
        const payRows = await db
          .select({
            professorId: professorPayments.professorId,
            totalClasses: professorPayments.totalClasses,
            totalAmount: professorPayments.totalAmount,
            status: professorPayments.status,
          })
          .from(professorPayments)
          .where(and(
            eq(professorPayments.organizationId, orgId),
            eq(professorPayments.month, month),
            eq(professorPayments.year, year)
          ));
        for (const r of payRows) {
          pagMap.set(r.professorId, {
            totalClasses: Number(r.totalClasses),
            totalAmount: Number(r.totalAmount),
            status: r.status,
          });
        }
      }

      const professoresOut = rows.map((p) => ({
        id: p.professor.id,
        userId: p.professor.userId,
        name: p.userName,
        email: p.userEmail,
        telefone: p.professor.telefone,
        foto: p.professor.foto,
        especialidade: p.professor.especialidade,
        permissions: p.professor.permissions,
        dashboardWidgets: p.professor.dashboardWidgets,
        paymentType: p.professor.paymentType,
        hourlyRate: p.professor.hourlyRate,
        paymentPercentage: p.professor.paymentPercentage,
        lastSignedIn: p.lastSignedIn,
        alunosAtivos: alunosMap.get(p.professor.userId) ?? 0,
        aulasMes: aulasMap.get(p.professor.userId) ?? 0,
        pagamentoMes: pagMap.get(p.professor.id) ?? null,
      }));

      return {
        kpis: {
          totalProfessores: rows.length,
          alunosAtivos: Array.from(alunosMap.values()).reduce((a, b) => a + b, 0),
          aulasMes: Array.from(aulasMap.values()).reduce((a, b) => a + b, 0),
          custoMes: Array.from(pagMap.values()).reduce((a, p) => a + p.totalAmount, 0),
        },
        professores: professoresOut,
      };
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
        password: z.string().min(6),
        telefone: z.string().optional(),
        foto: z.string().optional(),
        especialidade: z.string().optional(),
        permissions: z.array(z.string()).default([]),
        dashboardWidgets: z.array(z.string()).optional(),
        paymentType: z.enum(["fixo", "porcentagem"]).optional().default("fixo"),
        hourlyRate: z.string().optional(),
        paymentPercentage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem criar professores" });
        }

        const existingUser = await db.select().from(users).where(and(eq(users.email, input.email), eq(users.organizationId, orgId))).limit(1);
        if (existingUser.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "E-mail já cadastrado nesta organização" });
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
        const passwordHash = `${salt}:${derivedKey}`;

        const openId = `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const [newUser] = await db.insert(users).values({
          organizationId: orgId,
          name: input.name,
          email: input.email,
          openId,
          passwordHash,
          role: "professor",
          mustChangePassword: false,
          isEmailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning({ id: users.id });

        // Sanitiza campos numéricos: string vazia quebra coluna decimal no postgres
        const sanitizedHourlyRate = input.hourlyRate && input.hourlyRate.trim() !== "" ? input.hourlyRate : null;
        const sanitizedPaymentPercentage = input.paymentPercentage && input.paymentPercentage.trim() !== "" ? input.paymentPercentage : null;

        try {
          const [newProfessor] = await db.insert(professores).values({
            organizationId: orgId,
            userId: newUser.id,
            telefone: input.telefone,
            foto: input.foto,
            especialidade: input.especialidade,
            permissions: input.permissions,
            // Trava do dashboard: cards PERMITIDOS (vazio = todos)
            dashboardWidgets: input.dashboardWidgets && input.dashboardWidgets.length > 0 ? JSON.stringify(input.dashboardWidgets) : "",
            paymentType: input.paymentType,
            hourlyRate: sanitizedHourlyRate,
            paymentPercentage: sanitizedPaymentPercentage,
            createdAt: new Date(),
          }).returning();

          return { success: true, professor: newProfessor };
        } catch (profError: any) {
          // Rollback: deleta o usuário criado para não deixar registro órfão
          await db.delete(users).where(eq(users.id, newUser.id));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao criar professor. O cadastro foi revertido. Detalhe: ${profError?.message ?? profError}`,
          });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        telefone: z.string().optional(),
        foto: z.string().optional(),
        especialidade: z.string().optional(),
        permissions: z.array(z.string()).optional(),
        dashboardWidgets: z.array(z.string()).optional(),
        password: z.string().optional(),
        paymentType: z.enum(["fixo", "porcentagem"]).optional(),
        hourlyRate: z.string().optional(),
        paymentPercentage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar professores" });
        }

        const [prof] = await db.select().from(professores).where(and(eq(professores.id, input.id), eq(professores.organizationId, orgId))).limit(1);
        if (!prof) throw new TRPCError({ code: "NOT_FOUND", message: "Professor não encontrado" });

        // Sanitiza campos numéricos: string vazia quebra coluna decimal no postgres
        const sanitizedHourlyRate = input.hourlyRate && input.hourlyRate.trim() !== "" ? input.hourlyRate : null;
        const sanitizedPaymentPercentage = input.paymentPercentage && input.paymentPercentage.trim() !== "" ? input.paymentPercentage : null;

        await db.update(professores)
          .set({
            telefone: input.telefone,
            foto: input.foto,
            especialidade: input.especialidade,
            paymentType: input.paymentType,
            hourlyRate: sanitizedHourlyRate,
            paymentPercentage: sanitizedPaymentPercentage,
            ...(input.permissions ? { permissions: input.permissions } : {}),
            ...(input.dashboardWidgets !== undefined
              ? { dashboardWidgets: input.dashboardWidgets.length > 0 ? JSON.stringify(input.dashboardWidgets) : "" }
              : {})
          })
          .where(eq(professores.id, input.id));

        const userUpdates: any = { name: input.name, updatedAt: new Date() };

        if (input.password) {
          const salt = crypto.randomBytes(16).toString("hex");
          const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
          userUpdates.passwordHash = `${salt}:${derivedKey}`;
        }

        await db.update(users).set(userUpdates).where(eq(users.id, prof.userId));

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        if (ctx.user.role !== "admin" && ctx.user.openId !== ENV.ownerOpenId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem excluir professores" });
        }

        const [prof] = await db.select().from(professores).where(and(eq(professores.id, input.id), eq(professores.organizationId, orgId))).limit(1);
        if (!prof) throw new TRPCError({ code: "NOT_FOUND", message: "Professor não encontrado" });

        // AUDIT-P1 FIX: bloquear exclusão de professor com alunos ativos ou folha
        // pendente — antes o delete deixava students.professorId (NOT NULL), lessons,
        // professorPayments e settings apontando para IDs inexistentes.
        const [{ count: activeStudentsCount }] = await db.select({ count: sql<number>`count(*)` })
          .from(students)
          .where(and(eq(students.organizationId, orgId), eq(students.professorId, prof.userId), eq(students.status, "ativo")));
        if (Number(activeStudentsCount) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Este professor possui ${activeStudentsCount} aluno(s) ativo(s). Transfira ou inative os alunos antes de excluir o professor.`,
          });
        }

        // Alunos inativos restantes são reatribuídos ao admin que executa a exclusão
        const orgOwnerSubstitute = ctx.user.id;

        await db.transaction(async (tx) => {
          // Reatribui dados órfãos antes de apagar o usuário
          await tx.update(students).set({ professorId: orgOwnerSubstitute })
            .where(and(eq(students.organizationId, orgId), eq(students.professorId, prof.userId)));
          await tx.delete(reminders).where(and(eq(reminders.organizationId, orgId), eq(reminders.userId, prof.userId)));
          await tx.delete(settings).where(eq(settings.userId, prof.userId));

          // AUDITORIA (DP-022): limpar folha, regras de remuneração e reatribuir turmas/aulas
          // antes de apagar o professor — evita histórico órfão e joins quebrados.
          await tx.delete(professorPayments).where(and(eq(professorPayments.organizationId, orgId), eq(professorPayments.professorId, prof.id)));
          const ruleRows = await tx.select({ id: teacherPaymentRules.id }).from(teacherPaymentRules)
            .where(and(eq(teacherPaymentRules.organizationId, orgId), eq(teacherPaymentRules.teacherId, prof.id)));
          if (ruleRows.length > 0) {
            const ruleIds = ruleRows.map((r: any) => r.id);
            await tx.delete(teacherPaymentRuleConditions).where(inArray(teacherPaymentRuleConditions.ruleId, ruleIds));
            await tx.delete(teacherPaymentRuleCourses).where(inArray(teacherPaymentRuleCourses.ruleId, ruleIds));
            await tx.delete(teacherPaymentRules).where(inArray(teacherPaymentRules.id, ruleIds));
          }
          await tx.update(turmas).set({ professorId: orgOwnerSubstitute })
            .where(and(eq(turmas.organizationId, orgId), eq(turmas.professorId, prof.userId)));
          await tx.update(lessons).set({ userId: orgOwnerSubstitute })
            .where(and(eq(lessons.organizationId, orgId), eq(lessons.userId, prof.userId)));
          await tx.update(attendanceLogs).set({ userId: orgOwnerSubstitute })
            .where(and(eq(attendanceLogs.organizationId, orgId), eq(attendanceLogs.userId, prof.userId)));

          await tx.delete(professores).where(eq(professores.id, input.id));
          await tx.delete(users).where(eq(users.id, prof.userId));
        });

        return { success: true };
      }),
  }),

  fcm: fcmRouter,

};
