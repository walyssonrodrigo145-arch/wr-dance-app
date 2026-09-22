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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs, turmas, turmaAlunos, events } from "../../drizzle/schema";
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
import { getFreeSlotsForDay, getLiveRooms } from "../services/ScheduleAvailabilityService";
import { DASHBOARD_WIDGETS, resolveVisibleWidgets, parseWidgetList } from "@shared/dashboardWidgets";
export const dashboardRouters = {
  dashboard: router({
    todaySummary: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const userId = ctx.user.id;
      const isProfessor = ctx.user.role === 'professor' && !isUserAdmin;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
      
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo

      let professorStudentIds: number[] | undefined = undefined;
      if (isProfessor) {
        const profStudents = await db
          .select({ id: students.id })
          .from(students)
          .where(and(
            eq(students.organizationId, orgId),
            eq(students.professorId, userId),
            eq(students.status, 'ativo')
          ));
        professorStudentIds = profStudents.map(s => s.id);
      }

      const baseLessonCondition = professorStudentIds
        ? (professorStudentIds.length > 0 ? inArray(lessons.studentId, professorStudentIds) : sql`false`)
        : (isUserAdmin ? undefined : eq(lessons.userId, userId));

      const aulasHojeRes = await db.select({ count: sql<number>`count(*)` })
        .from(lessons)
        .where(and(
          eq(lessons.organizationId, orgId),
          baseLessonCondition,
          gte(lessons.scheduledAt, startOfDay),
          lte(lessons.scheduledAt, endOfDay)
        ));
      
      // AUDITORIA (DP-026): check-ins reais vêm de attendance_logs (leitura de QR),
      // não de "aula marcada como concluída".
      const checkinsRes = await db.select({ count: sql<number>`count(*)` })
        .from(attendanceLogs)
        .innerJoin(lessons, eq(attendanceLogs.lessonId, lessons.id))
        .where(and(
          eq(attendanceLogs.organizationId, orgId),
          baseLessonCondition,
          gte(attendanceLogs.scannedAt, startOfDay),
          lte(attendanceLogs.scannedAt, endOfDay)
        ));

      const experimentaisRes = await db.select({ count: sql<number>`count(*)` })
        .from(lessons)
        .where(and(
          eq(lessons.organizationId, orgId),
          baseLessonCondition,
          eq(lessons.isExperimental, true),
          gte(lessons.scheduledAt, startOfDay),
          lte(lessons.scheduledAt, endOfDay)
        ));

      const basePaymentCondition = professorStudentIds
        ? (professorStudentIds.length > 0 ? inArray(paymentDues.studentId, professorStudentIds) : sql`false`)
        : (isUserAdmin ? undefined : eq(paymentDues.userId, userId));

      const recebidoRes = await db.select({ total: sql<number>`sum(${paymentDues.amount})` })
        .from(paymentDues)
        .where(and(
          eq(paymentDues.organizationId, orgId),
          basePaymentCondition,
          eq(paymentDues.status, 'pago'),
          gte(paymentDues.paidAt, startOfDay),
          lte(paymentDues.paidAt, endOfDay)
        ));
      
      const todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const pendentesRes = await db.select({ count: sql<number>`count(*)` })
        .from(paymentDues)
        .where(and(
          eq(paymentDues.organizationId, orgId),
          basePaymentCondition,
          eq(paymentDues.status, 'pendente'),
          eq(paymentDues.dueDate, todayDateString)
        ));

      let professorDestaque = "Nenhum definido";
      if (isUserAdmin) {
        try {
          const destRes = await db.select({ 
              profName: users.name, 
              count: sql<number>`count(${lessons.id})`
            })
            .from(lessons)
            .innerJoin(students, eq(lessons.studentId, students.id))
            .innerJoin(users, eq(students.professorId, users.id))
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.status, 'concluida'),
              gte(lessons.scheduledAt, startOfDay),
              lte(lessons.scheduledAt, endOfDay)
            ))
            .groupBy(users.name)
            .orderBy(desc(sql<number>`count(${lessons.id})`))
            .limit(1);

          if (destRes.length > 0) {
            professorDestaque = destRes[0].profName || "Nenhum definido";
          }
        } catch (e) {
          console.error("Dashboard todaySummary - professorDestaque error:", e);
        }
      }

      return {
        aulasHoje: Number(aulasHojeRes[0].count) || 0,
        checkins: Number(checkinsRes[0].count) || 0,
        experimentais: Number(experimentaisRes[0].count) || 0,
        recebidoHoje: Number(recebidoRes[0].total) || 0,
        pagamentosPendentes: Number(pendentesRes[0].count) || 0,
        professorDestaque
      };
    }),
    stats: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      return getDashboardStats(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id);
    }),
    monthlyStats: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const stats = await getMonthlyStats(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id, 12);
      return stats;
    }),
    experimentalStats: protectedProcedure
      .input(z.object({
        month: z.number().optional(),
        year: z.number().optional()
      }).optional())
      .query(async ({ ctx, input }) => {
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        return getExperimentalStats(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id, input?.month, input?.year);
      }),
    lessonsByDay: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const data = await getLessonsByDayOfWeek(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id);
      const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      const result = days.map((day, i) => ({
        day,
        aulas: 0,
      }));
      data.forEach(d => {
        const idx = (Number(d.dayOfWeek) - 1 + 7) % 7;
        result[idx].aulas = Number(d.count);
      });
      return result;
    }),
    recentLessons: protectedProcedure.query(async ({ ctx }) => {
      // Por padrão agora redireciona para a mesma lógica de upcoming (próximas aulas)
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      now.setHours(0, 0, 0, 0); // hoje em diante

      return db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        isExperimental: lessons.isExperimental,
        experimentalName: lessons.experimentalName,
        studentName: students.name,
        studentId: students.id,
      }).from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .where(and(
          eq(lessons.status, 'agendada'), 
          eq(lessons.userId, ctx.user.id),
          sql`${lessons.scheduledAt} >= ${now.toISOString()}`
        ))
        .orderBy(asc(lessons.scheduledAt))
        .limit(8);
    }),
    getStudentAccessReport: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const profId = isUserAdmin ? undefined : ctx.user.id;

      let studentFilter = eq(students.organizationId, orgId);
      if (profId) {
        studentFilter = and(studentFilter, eq(students.professorId, profId)) as any;
      }

      const allStudents = await db.select({
        id: students.id,
        name: students.name,
        avatar: students.avatar,
        studentUserId: students.studentUserId,
      }).from(students).where(studentFilter);

      const userIds = allStudents.map(s => s.studentUserId).filter(Boolean) as number[];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        usersData = await db.select({
          id: users.id,
          lastSignedIn: users.lastSignedIn,
        }).from(users).where(inArray(users.id, userIds));
      }

      const studentIds = allStudents.map(s => s.id);
      let plansData: any[] = [];
      if (studentIds.length > 0) {
        plansData = await db.select({
          studentId: dailyStudyPlans.studentId,
          daysCompleted: dailyStudyPlans.daysCompleted,
          updatedAt: dailyStudyPlans.updatedAt,
        }).from(dailyStudyPlans).where(and(
          eq(dailyStudyPlans.organizationId, orgId), 
          eq(dailyStudyPlans.publishedStatus, 'publicado'), 
          inArray(dailyStudyPlans.studentId, studentIds)
        ));
      }

      return allStudents.map(student => {
        const u = usersData.find(user => user.id === student.studentUserId);
        const p = plansData.filter(plan => plan.studentId === student.id);
        
        let completedCount = 0;
        p.forEach(plan => {
          try {
            const arr = JSON.parse(plan.daysCompleted || "[]");
            if (Array.isArray(arr)) {
              completedCount += arr.filter(Boolean).length;
            }
          } catch(e) {}
        });

        return {
          id: student.id,
          name: student.name,
          avatar: student.avatar,
          lastSignedIn: u?.lastSignedIn ? new Date(u.lastSignedIn).toISOString() : null,
          hasAccess: !!u?.lastSignedIn,
          completedPracticeCount: completedCount,
        };
      }).sort((a, b) => b.completedPracticeCount - a.completedPracticeCount);
    }),

    // ── RF-001: Relatório de horários livres do dia ─────────────────────────
    freeSlotsToday: protectedProcedure
      .input(z.object({
        professorId: z.number().optional(),
        roomId: z.number().optional(),
        includePast: z.boolean().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        let professorId = input?.professorId;
        if (!isAdmin) {
          // RN-011: professor vê apenas a própria agenda
          const [prof] = await db.select({ id: professores.id }).from(professores)
            .where(and(eq(professores.organizationId, orgId), eq(professores.userId, ctx.user.id)))
            .limit(1);
          if (!prof) return null;
          professorId = prof.id;
        }

        return getFreeSlotsForDay({
          organizationId: orgId,
          professorId,
          roomId: input?.roomId,
          includePast: input?.includePast,
        });
      }),

    // ── RF-002: Salas ao Vivo (24h) ─────────────────────────────────────────
    liveRooms: protectedProcedure.query(async ({ ctx }) => {
      const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      return getLiveRooms(ctx.user.organizationId!, { isAdmin, userId: ctx.user.id });
    }),

    // ── RF-003/RN-016: cards efetivamente visíveis (trava aplicada no servidor) ──
    getVisibleWidgets: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId!;
      const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const s = await getSettingsByUserId(orgId, ctx.user.id);
      const hiddenRaw = (s as any)?.hiddenDashboardWidgets || "";
      const hideFinancialValues = ((s as any)?.hideFinancialValues ?? 0) === 1;

      let allowedRaw = "";
      if (!isAdmin) {
        const db = await getDb();
        if (db) {
          const [prof] = await db.select({ dashboardWidgets: professores.dashboardWidgets }).from(professores)
            .where(and(eq(professores.organizationId, orgId), eq(professores.userId, ctx.user.id)))
            .limit(1);
          allowedRaw = prof?.dashboardWidgets || "";
        }
      }

      return {
        isAdmin,
        allowed: parseWidgetList(allowedRaw),
        hidden: parseWidgetList(hiddenRaw),
        visible: resolveVisibleWidgets(allowedRaw, hiddenRaw),
        hideFinancialValues,
        widgets: DASHBOARD_WIDGETS,
      };
    }),

    /**
     * Fase 3 (produtividade do dono): central de pendências do dia.
     * - Pagamentos atrasados (admin vê a escola; professor vê os próprios)
     * - Lista de espera em turmas
     * - Eventos próximos com autorização de imagem/participação pendente
     */
    attentionToday: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { overdueCount: 0, overdueTotal: 0, waitlistCount: 0, eventsPendingAuth: 0 };
      const orgId = ctx.user.organizationId!;
      const isAdmin = ctx.user.role === "admin" || ctx.user.openId === ENV.ownerOpenId;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      const overdueWhere = isAdmin
        ? and(
            eq(paymentDues.organizationId, orgId),
            sql`${paymentDues.dueDate} < ${today}`,
            sql`${paymentDues.status} != 'pago'`
          )
        : and(
            eq(paymentDues.organizationId, orgId),
            eq(paymentDues.userId, ctx.user.id),
            sql`${paymentDues.dueDate} < ${today}`,
            sql`${paymentDues.status} != 'pago'`
          );

      const [overdueAgg] = await db.select({
        count: sql<number>`CAST(COUNT(*) AS INT)`,
        total: sql<number>`CAST(COALESCE(SUM(${paymentDues.amount}), 0) AS DOUBLE PRECISION)`,
      }).from(paymentDues).where(overdueWhere);

      let waitlistCount = 0;
      if (isAdmin) {
        const [espera] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(turmaAlunos)
          .where(and(eq(turmaAlunos.organizationId, orgId), eq(turmaAlunos.status, "espera")));
        waitlistCount = Number(espera?.count) || 0;
      }

      const [eventsPending] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(events)
        .where(and(
          eq(events.organizationId, orgId),
          eq(events.active, true),
          eq(events.requiresAuthorization, true),
          gte(events.startsAt, new Date()),
          ne(events.status, "realizado"),
          ne(events.status, "cancelado"),
          sql`(SELECT COUNT(*) FROM "event_participants" ep WHERE ep."eventId" = ${events.id}) > (SELECT COUNT(*) FROM "event_participants" ep2 WHERE ep2."eventId" = ${events.id} AND ep2."imageAuthorization" = true AND ep2."participationAuthorization" = true)`
        ));

      return {
        overdueCount: Number(overdueAgg?.count) || 0,
        overdueTotal: Number(overdueAgg?.total) || 0,
        waitlistCount,
        eventsPendingAuth: Number(eventsPending?.count) || 0,
      };
    }),

    /**
     * Fase 3: checklist "Escola pronta em 10 minutos" — calculado dos dados reais.
     */
    setupProgress: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;

      const countRows = async (table: any, where: any) => {
        const [row] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` }).from(table).where(where);
        return Number(row?.count) || 0;
      };

      const [school] = await db.select({ schoolName: settings.schoolName }).from(settings)
        .where(eq(settings.organizationId, orgId)).limit(1);

      const [modalities, rooms, groups, teachers, pupils] = await Promise.all([
        countRows(instruments, eq(instruments.organizationId, orgId)),
        countRows(studioRooms, eq(studioRooms.organizationId, orgId)),
        countRows(turmas, eq(turmas.organizationId, orgId)),
        countRows(professores, eq(professores.organizationId, orgId)),
        countRows(students, eq(students.organizationId, orgId)),
      ]);

      const steps = [
        { key: "escola", label: "Dados da escola", hint: "Nome, logo e horários de funcionamento", done: !!school?.schoolName?.trim(), to: "/configuracoes" },
        { key: "modalidades", label: "Modalidades de dança", hint: "Ballet, Jazz, Hip Hop, Sapateado...", done: modalities > 0, to: "/instrumentos" },
        { key: "salas", label: "Salas de aula", hint: "Estúdios e salas usados nas aulas", done: rooms > 0, to: "/salas" },
        { key: "turmas", label: "Turmas e horários", hint: "Monte a grade de turmas por dia e horário", done: groups > 0, to: "/turmas" },
        { key: "professores", label: "Professores", hint: "Cadastre a equipe e as permissões", done: teachers > 0, to: "/professores" },
        { key: "alunos", label: "Primeiros alunos", hint: "Cadastre um a um ou importe por CSV", done: pupils > 0, to: "/alunos" },
      ];

      return { steps, completed: steps.filter((s) => s.done).length, total: steps.length };
    }),
  }),

};
