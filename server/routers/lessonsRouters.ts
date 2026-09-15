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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, extraLessonRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs, lessonRepositions, repositionEvents } from "../../drizzle/schema";
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
export const lessonsRouters = {
  lessons: router({
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const profUsers = aliasedTable(users, "prof_users");
      const creatorUsers = aliasedTable(users, "creator_users");
      const [lesson] = await db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        rating: lessons.rating,
        notes: lessons.notes,
        description: lessons.description,
        isExperimental: lessons.isExperimental,
        experimentalName: lessons.experimentalName,
        experimentalPhone: lessons.experimentalPhone,
        instrumentId: lessons.instrumentId,
        instrumentName: instruments.name,
        studentName: students.name,
        studentId: students.id,
        lessonType: lessons.lessonType,
        recurringGroupId: lessons.recurringGroupId,
        recurrence: lessons.recurrence,
        studioRoomId: lessons.studioRoomId,
        studioRoomName: studioRooms.name,
        studioRoomColor: studioRooms.color,
        teacherId: sql<number>`COALESCE(${students.professorId}, ${lessons.userId})`,
        teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
      }).from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .leftJoin(instruments, eq(lessons.instrumentId, instruments.id))
        .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
        .leftJoin(profUsers, eq(students.professorId, profUsers.id))
        .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
        .where(and(
          eq(lessons.id, input.id),
          eq(lessons.organizationId, orgId),
          isUserAdmin ? undefined : or(
            eq(lessons.userId, ctx.user.id),
            eq(students.professorId, ctx.user.id)
          )
        )).limit(1);
      return lesson ?? null;
    }),

    list: protectedProcedure
      .input(z.object({
        // BUG#5 FIX: filtro opcional de data para reduzir payload
        // Usado pelo Dashboard para buscar apenas aulas de hoje em vez de todo o histórico
        date: z.string().optional(), // formato YYYY-MM-DD
        // BUG #4 FIX: filtro por aluno específico para evitar retornar todas as aulas da org
        studentId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const isProfessor = ctx.user.role === 'professor';
        const orgId = ctx.user.organizationId!;

        // BUG #4 FIX: filtro por studentId específico — retorna só aulas do aluno solicitado
        // Antes: retornava todas as aulas da org e filtrava no cliente (ineficiente + incompleto com paginação)
        if (input?.studentId) {
          const db = await getDb();
          if (!db) return [];
          const profUsers = aliasedTable(users, "prof_users");
          const creatorUsers = aliasedTable(users, "creator_users");
          return db.select({
            id: lessons.id,
            title: lessons.title,
            scheduledAt: lessons.scheduledAt,
            duration: lessons.duration,
            status: lessons.status,
            rating: lessons.rating,
            isExperimental: lessons.isExperimental,
            experimentalName: lessons.experimentalName,
            instrumentId: lessons.instrumentId,
            instrumentName: instruments.name,
            studentName: students.name,
            studentId: students.id,
            lessonType: lessons.lessonType,
            recurringGroupId: lessons.recurringGroupId,
            recurrence: lessons.recurrence,
            studioRoomId: lessons.studioRoomId,
            studioRoomName: studioRooms.name,
            studioRoomColor: studioRooms.color,
            teacherId: sql<number>`COALESCE(${students.professorId}, ${lessons.userId})`,
            teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
          }).from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .leftJoin(instruments, eq(lessons.instrumentId, instruments.id))
            .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
            .leftJoin(profUsers, eq(students.professorId, profUsers.id))
            .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.studentId, input.studentId),
            ))
            .orderBy(asc(lessons.scheduledAt));
        }

        // Se date informada, busca apenas aulas daquele dia no banco
        if (input?.date) {
          const db = await getDb();
          if (!db) return [];
          const startOfDay = new Date(input.date + 'T00:00:00.000Z');
          const endOfDay = new Date(input.date + 'T23:59:59.999Z');

          const profUsers = aliasedTable(users, "prof_users");
          const creatorUsers = aliasedTable(users, "creator_users");

          // Para professor: buscar pelos alunos dele
          if (isProfessor) {
            const profStudents = await db
              .select({ id: students.id })
              .from(students)
              .where(and(
                eq(students.organizationId, orgId),
                eq(students.professorId, ctx.user.id),
                eq(students.status, 'ativo'),
              ));
            const studentIds = profStudents.map(s => s.id);
            if (studentIds.length === 0) return [];
            return db.select({
              id: lessons.id,
              title: lessons.title,
              scheduledAt: lessons.scheduledAt,
              duration: lessons.duration,
              status: lessons.status,
              rating: lessons.rating,
              isExperimental: lessons.isExperimental,
              experimentalName: lessons.experimentalName,
              instrumentId: lessons.instrumentId,
              instrumentName: instruments.name,
              studentName: students.name,
              studentId: students.id,
              lessonType: lessons.lessonType,
              recurringGroupId: lessons.recurringGroupId,
              recurrence: lessons.recurrence,
              studioRoomId: lessons.studioRoomId,
              studioRoomName: studioRooms.name,
              studioRoomColor: studioRooms.color,
              teacherId: sql<number>`COALESCE(${students.professorId}, ${lessons.userId})`,
              teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
            }).from(lessons)
              .leftJoin(students, eq(lessons.studentId, students.id))
              .leftJoin(instruments, eq(lessons.instrumentId, instruments.id))
              .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
              .leftJoin(profUsers, eq(students.professorId, profUsers.id))
              .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
              .where(and(
                eq(lessons.organizationId, orgId),
                inArray(lessons.studentId, studentIds),
                gte(lessons.scheduledAt, startOfDay),
                lte(lessons.scheduledAt, endOfDay),
              ))
              .orderBy(asc(lessons.scheduledAt));
          }

          return db.select({
            id: lessons.id,
            title: lessons.title,
            scheduledAt: lessons.scheduledAt,
            duration: lessons.duration,
            status: lessons.status,
            rating: lessons.rating,
            isExperimental: lessons.isExperimental,
            experimentalName: lessons.experimentalName,
            instrumentId: lessons.instrumentId,
            instrumentName: instruments.name,
            studentName: students.name,
            studentId: students.id,
            lessonType: lessons.lessonType,
            recurringGroupId: lessons.recurringGroupId,
            recurrence: lessons.recurrence,
            studioRoomId: lessons.studioRoomId,
            studioRoomName: studioRooms.name,
            studioRoomColor: studioRooms.color,
            teacherId: sql<number>`COALESCE(${students.professorId}, ${lessons.userId})`,
            teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
          }).from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .leftJoin(instruments, eq(lessons.instrumentId, instruments.id))
            .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
            .leftJoin(profUsers, eq(students.professorId, profUsers.id))
            .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
            .where(and(
              eq(lessons.organizationId, orgId),
              isUserAdmin ? undefined : eq(lessons.userId, ctx.user.id),
              gte(lessons.scheduledAt, startOfDay),
              lte(lessons.scheduledAt, endOfDay),
            ))
            .orderBy(asc(lessons.scheduledAt));
        }

        // Sem filtro de data: passa professorId para getRecentLessons se for professor
        if (isProfessor) {
          return getRecentLessons(orgId, undefined, 500, ctx.user.id);
        }
        return getRecentLessons(orgId, isUserAdmin ? undefined : ctx.user.id, 500);
      }),

    upcoming: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const isProfessor = ctx.user.role === 'professor';
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

      const now = new Date();
      now.setHours(0, 0, 0, 0); // Mostrar aulas a partir do início de hoje
      
      const twoWeeksLater = new Date(now);
      twoWeeksLater.setDate(now.getDate() + 14);

      let professorStudentIds: number[] | undefined = undefined;
      if (isProfessor) {
        const profStudents = await db
          .select({ id: students.id })
          .from(students)
          .where(and(
            eq(students.organizationId, orgId),
            eq(students.professorId, ctx.user.id),
            eq(students.status, 'ativo'),
          ));
        professorStudentIds = profStudents.map(s => s.id);
      }

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
          eq(lessons.organizationId, orgId),
          eq(lessons.status, 'agendada'), 
          professorStudentIds
            ? (professorStudentIds.length > 0
                ? inArray(lessons.studentId, professorStudentIds)
                : sql`false`
              )
            : (isUserAdmin ? undefined : eq(lessons.userId, ctx.user.id)),
          gte(lessons.scheduledAt, new Date()),
          lte(lessons.scheduledAt, twoWeeksLater)
        ))
        .orderBy(asc(lessons.scheduledAt))
        .limit(10);
    }),
    create: protectedProcedure.input(z.object({
      studentId: z.number().nullable().optional(),
      isExperimental: z.boolean().default(false),
      experimentalName: z.string().optional(),
      experimentalPhone: z.string().optional(),
      title: z.string().min(2),
      scheduledAt: z.string(),
      duration: z.number().default(60),
      description: z.string().optional(),
      notes: z.string().optional(),
      instrumentId: z.number().nullable().optional(),
      studioRoomId: z.number().nullable().optional(),
      lessonType: z.enum(['individual', 'turma']).default('individual'),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const orgId = ctx.user.organizationId!;
        const scheduledAt = new Date(input.scheduledAt);
        const endsAt = new Date(scheduledAt.getTime() + input.duration * 60000);
  
        // Segurança: Verificar se o aluno pertence ao usuário logado (se não for experimental)
        if (!input.isExperimental) {
          if (!input.studentId) throw new Error("O campo aluno é obrigatório para aulas comuns.");
          const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
          const [ownedStudent] = await db.select({ id: students.id }).from(students)
            .where(and(
              eq(students.id, input.studentId as number), 
              eq(students.organizationId, orgId), 
              isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
            ))
            .limit(1);
            
          if (!ownedStudent) {
            throw new Error("O aluno selecionado não existe ou não pertence ao seu perfil.");
          }
        } else {
          if (!input.experimentalName) throw new Error("O nome do aluno é obrigatório para aulas experimentais.");
        }

        // BUG #5 FIX: Instrumentos são recursos da organização, não do professor.
        // Antes: verificava instruments.userId === ctx.user.id → professores bloqueados se instrumento foi criado pelo admin.
        // Agora: verifica apenas organizationId → qualquer membro da organização pode usar qualquer instrumento.
        if (input.instrumentId) {
          const [ownedInstrument] = await db.select({ id: instruments.id }).from(instruments)
            .where(and(
              eq(instruments.id, input.instrumentId), 
              eq(instruments.organizationId, orgId)
              // userId removido: instrumento é recurso da organização
            ))
            .limit(1);
          if (!ownedInstrument) {
            throw new Error("O instrumento selecionado não existe nesta escola.");
          }
        }
  
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        // AUDIT-P1 FIX (conflito de agenda): buscar o professor EFETIVO do aluno da
        // nova aula — antes o conflito testava apenas o criador (ctx.user), então um
        // admin criando aula para aluno do professor X não via a agenda do X.
        let inputStudentProfessorId: number | null = null;
        if (input.studentId) {
          const [st] = await db.select({ professorId: students.professorId }).from(students)
            .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
            .limit(1);
          inputStudentProfessorId = st?.professorId ?? null;
        }

        // Prevenção de conflitos (mesmo professor/userId ou mesma organização para admin)
        const startOfDay = new Date(scheduledAt);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(scheduledAt);
        endOfDay.setHours(23, 59, 59, 999);

        const existingLessons = await db.select({
          id: lessons.id,
          scheduledAt: lessons.scheduledAt,
          duration: lessons.duration,
          lessonType: lessons.lessonType,
          userId: lessons.userId,
          studioRoomId: lessons.studioRoomId,
          studentProfessorId: students.professorId,
        }).from(lessons)
          .leftJoin(students, eq(lessons.studentId, students.id))
          .where(and(
            eq(lessons.organizationId, orgId),
            eq(lessons.status, 'agendada'),
            gte(lessons.scheduledAt, startOfDay),
            lte(lessons.scheduledAt, endOfDay)
          ));

        for (const existing of existingLessons) {
          const exStart = new Date(existing.scheduledAt);
          const exEnd = new Date(exStart.getTime() + (existing.duration || 60) * 60000);
          if (exStart < endsAt && exEnd > scheduledAt) {
            // Teacher conflict check — professor EFETIVO (criador OU professor do aluno)
            const existingTeacherIds = new Set<number>([existing.userId, existing.studentProfessorId].filter(Boolean) as number[]);
            const inputTeacherIds = new Set<number>([ctx.user.id, inputStudentProfessorId].filter(Boolean) as number[]);
            const sharesTeacher = Array.from(inputTeacherIds).some((t) => existingTeacherIds.has(t));
            if (sharesTeacher) {
              if (input.lessonType === 'individual' || existing.lessonType === 'individual') {
                throw new Error("Conflito de horário: Já existe uma aula deste professor agendada para este período.");
              }
            }
            // Room conflict check (even for different teachers)
            if (input.studioRoomId && existing.studioRoomId === input.studioRoomId) {
              throw new Error("Conflito de sala: Esta sala já está ocupada neste horário.");
            }
          }
        }

        await db.insert(lessons).values({
          organizationId: orgId,
          userId: ctx.user.id,
          studentId: input.studentId ?? null,
          isExperimental: !!input.isExperimental,
          experimentalName: input.experimentalName ?? null,
          experimentalPhone: input.experimentalPhone ?? null,
          title: input.title,
          scheduledAt: scheduledAt,
          duration: input.duration ?? 60,
          description: input.description ?? null,
          notes: input.notes ?? null,
          instrumentId: input.instrumentId ?? null,
          studioRoomId: input.studioRoomId ?? null,
          status: 'agendada',
          lessonType: input.lessonType,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Sincroniza sala com o cadastro do aluno se informado
        if (input.studentId && input.studioRoomId) {
          await db.update(students)
            .set({ studioRoomId: input.studioRoomId, updatedAt: new Date() })
            .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
        }

        return { success: true };
      } catch (error) {
        return handleDbError(error, "agendar a aula");
      }
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      title: z.string().min(2).optional(),
      scheduledAt: z.string().optional(),
      duration: z.number().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(['agendada','concluida','cancelada','remarcada','falta']).optional(),
      isExperimental: z.boolean().optional(),
      experimentalName: z.string().optional(),
      experimentalPhone: z.string().optional(),
      studentId: z.number().optional().nullable(),
      instrumentId: z.number().optional().nullable(),
      studioRoomId: z.number().optional().nullable(),
      lessonType: z.enum(['individual', 'turma']).optional(),
      updateSeries: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const orgId = ctx.user.organizationId!;
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const { id, updateSeries: _updateSeries, ...data } = input as any;
        // CRÍTICO: nunca passar updateSeries para o db.update (não é coluna do banco)
        const updateData: any = { ...data };
        // CRÍTICO: se studioRoomId não foi enviado (undefined), preserva o valor atual do banco
        if (updateData.studioRoomId === undefined) {
          delete updateData.studioRoomId; // Drizzle ignorará campos ausentes no .set()
        }
        const updateSeries = _updateSeries === true;

        // Buscar aula atual para pegar o recurringGroupId e data original
        const [currentLesson] = await db.select({
          id: lessons.id,
          title: lessons.title,
          scheduledAt: lessons.scheduledAt,
          duration: lessons.duration,
          lessonType: lessons.lessonType,
          userId: lessons.userId,
          studentId: lessons.studentId,
          recurringGroupId: lessons.recurringGroupId,
          studioRoomId: lessons.studioRoomId,
        }).from(lessons)
          .leftJoin(students, eq(lessons.studentId, students.id))
          .where(and(
            eq(lessons.id, id), 
            eq(lessons.organizationId, orgId), 
            isUserAdmin ? undefined : or(
              eq(lessons.userId, ctx.user.id),
              eq(students.professorId, ctx.user.id)
            )
          )).limit(1);
        if (!currentLesson) throw new Error("Aula não encontrada ou você não tem permissão.");

        // Segurança: Verificar propriedade do aluno se estiver sendo alterado
        if (data.studentId) {
          const [ownedStudent] = await db.select({ id: students.id }).from(students)
            .where(and(
              eq(students.id, data.studentId), 
              eq(students.organizationId, orgId), 
              isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
            ))
            .limit(1);
          if (!ownedStudent) throw new Error("O aluno selecionado não pertence ao seu perfil.");
        }

        // Segurança: Verificar propriedade do instrumento se estiver sendo alterado
        if (data.instrumentId) {
          const [ownedInstrument] = await db.select({ id: instruments.id }).from(instruments)
            .where(and(
              eq(instruments.id, data.instrumentId), 
              eq(instruments.organizationId, orgId), 
              isUserAdmin ? undefined : eq(instruments.userId, ctx.user.id)
            ))
            .limit(1);
          if (!ownedInstrument) throw new Error("O instrumento selecionado não pertence ao seu perfil.");
        }

        if (data.scheduledAt || data.studioRoomId !== undefined || data.lessonType) {
          const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : new Date(currentLesson.scheduledAt);
          const duration = data.duration ?? currentLesson.duration;
          const endsAt = new Date(scheduledAt.getTime() + duration * 60000);

          // AUDIT-P1 FIX (conflito de agenda): professor EFETIVO — criador OU professor
          // do aluno (atual ou novo). Antes testava apenas userId, escondendo a agenda
          // do professor dono do aluno quando a aula foi criada pelo admin.
          const currentStudentProfessorId = await (async () => {
            if (!currentLesson.studentId) return null;
            const [st] = await db.select({ professorId: students.professorId }).from(students)
              .where(eq(students.id, currentLesson.studentId)).limit(1);
            return st?.professorId ?? null;
          })();
          let newStudentProfessorId = currentStudentProfessorId;
          if (data.studentId) {
            const [st] = await db.select({ professorId: students.professorId }).from(students)
              .where(eq(students.id, data.studentId)).limit(1);
            newStudentProfessorId = st?.professorId ?? null;
          }
          const lessonTeacherIds = new Set<number>(
            [currentLesson.userId, currentStudentProfessorId, newStudentProfessorId].filter(Boolean) as number[]
          );

          // Prevenção de conflitos para a aula atual
          const startOfDay = new Date(scheduledAt);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(scheduledAt);
          endOfDay.setHours(23, 59, 59, 999);

          const existingLessons = await db.select({
            id: lessons.id,
            scheduledAt: lessons.scheduledAt,
            duration: lessons.duration,
            lessonType: lessons.lessonType,
            userId: lessons.userId,
            studioRoomId: lessons.studioRoomId,
            studentProfessorId: students.professorId,
          }).from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.status, 'agendada'),
              ne(lessons.id, id),
              gte(lessons.scheduledAt, startOfDay),
              lte(lessons.scheduledAt, endOfDay)
            ));

          for (const existing of existingLessons) {
            const exStart = new Date(existing.scheduledAt);
            const exEnd = new Date(exStart.getTime() + (existing.duration || 60) * 60000);
            if (exStart < endsAt && exEnd > scheduledAt) {
              const lessonTypeToCheck = data.lessonType ?? currentLesson.lessonType;
              const existingTeacherIds = new Set<number>([existing.userId, existing.studentProfessorId].filter(Boolean) as number[]);
              const sharesTeacher = Array.from(lessonTeacherIds).some((t) => existingTeacherIds.has(t));
              if (sharesTeacher) {
                if (lessonTypeToCheck === 'individual' || existing.lessonType === 'individual') {
                  throw new Error("Conflito de horário: O professor já tem aula agendada para este período.");
                }
              }
              const roomToCheck = data.studioRoomId !== undefined ? data.studioRoomId : currentLesson.studioRoomId;
              if (roomToCheck && existing.studioRoomId === roomToCheck) {
                throw new Error("Conflito de sala: Esta sala já está ocupada neste horário.");
              }
            }
          }
          updateData.scheduledAt = scheduledAt;

          // Cancelar lembretes pendentes da aula pois a data/hora mudou
          if (currentLesson && new Date(currentLesson.scheduledAt).getTime() !== scheduledAt.getTime()) {
            await db.update(reminders)
              .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(reminders.lessonId, id),
                eq(reminders.status, 'pendente')
              ));
          }

          // Se for para atualizar a série toda
          if (updateSeries && currentLesson.recurringGroupId) {
            const timeOffset = scheduledAt.getTime() - new Date(currentLesson.scheduledAt).getTime();
            
            // Buscar aulas futuras da série
            const futureLessons = await db.select().from(lessons).where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.recurringGroupId, currentLesson.recurringGroupId),
              isUserAdmin ? undefined : eq(lessons.userId, ctx.user.id),
              gte(lessons.scheduledAt, currentLesson.scheduledAt),
              sql`id != ${id}`
            ));

            // Atualizar cada aula futura
            for (const future of futureLessons) {
              const nextDate = new Date(new Date(future.scheduledAt).getTime() + timeOffset);
              await db.update(lessons).set({
                title: data.title ?? future.title,
                duration: data.duration ?? future.duration,
                notes: data.notes ?? future.notes,
                studioRoomId: data.studioRoomId !== undefined ? data.studioRoomId : future.studioRoomId,
                scheduledAt: nextDate,
                updatedAt: new Date()
              }).where(and(eq(lessons.id, future.id), eq(lessons.organizationId, orgId)));

              // Cancelar lembretes pendentes da aula futura da série pois a data mudou
              await db.update(reminders)
                .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
                .where(and(
                  eq(reminders.lessonId, future.id),
                  eq(reminders.status, 'pendente')
                ));
            }
          }
        } else if (updateSeries && currentLesson.recurringGroupId) {
          // Se mudou apenas texto (título/notas) e quer atualizar a série
          await db.update(lessons).set({
            title: data.title,
            notes: data.notes,
            duration: data.duration,
            studioRoomId: data.studioRoomId,
            updatedAt: new Date()
          }).where(and(
            eq(lessons.organizationId, orgId),
            eq(lessons.recurringGroupId, currentLesson.recurringGroupId),
            isUserAdmin ? undefined : eq(lessons.userId, ctx.user.id),
            gte(lessons.scheduledAt, currentLesson.scheduledAt)
          ));
        }

        // Sanitize: remover campos não-coluna e campos undefined antes do update
        const finalUpdateData: any = {};
        const allowedColumns = ['title','scheduledAt','duration','description','notes','status','rating','isExperimental','experimentalName','experimentalPhone','studentId','instrumentId','studioRoomId','lessonType','updatedAt'];
        for (const key of allowedColumns) {
          if (key in updateData && updateData[key] !== undefined) {
            finalUpdateData[key] = updateData[key];
          }
        }
        finalUpdateData.updatedAt = new Date();
        await db.update(lessons).set(finalUpdateData).where(and(
          eq(lessons.id, id), 
          eq(lessons.organizationId, orgId)
        ));

        // Sincroniza a sala com o perfil do aluno vinculado se studioRoomId foi modificado
        const studentIdToSync = data.studentId !== undefined ? data.studentId : currentLesson.studentId;
        if (studentIdToSync && data.studioRoomId !== undefined) {
          await db.update(students)
            .set({ studioRoomId: data.studioRoomId, updatedAt: new Date() })
            .where(and(eq(students.id, studentIdToSync), eq(students.organizationId, orgId)));
        }

        return { success: true };
      } catch (error) {
        return handleDbError(error, "atualizar a aula");
      }
    }),
    updateStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(['agendada','concluida','cancelada','remarcada','falta']),
      scheduledAt: z.string().optional(), // Nova data opcional para remarcação
      rating: z.number().min(1).max(5).optional(),
      updateSeries: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");

        const orgId = ctx.user.organizationId!;
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        // PERMISSÃO FIX: validar existência e vínculo do usuário com a aula
        // (criador OU professor efetivo do aluno) ANTES de qualquer alteração.
        // Antes: o WHERE do UPDATE final filtrava apenas `lessons.userId`, então um
        // professor remarcando aula criada pelo admin atualizava 0 linhas e recebia
        // `{ success: true }` silenciosamente (toast de sucesso sem mudar o banco).
        const [currentLesson] = await db.select({
          id: lessons.id,
          userId: lessons.userId,
          studentId: lessons.studentId,
          scheduledAt: lessons.scheduledAt,
          duration: lessons.duration,
          lessonType: lessons.lessonType,
          recurringGroupId: lessons.recurringGroupId,
          studioRoomId: lessons.studioRoomId,
          status: lessons.status,
          studentProfessorId: students.professorId,
        }).from(lessons)
          .leftJoin(students, eq(lessons.studentId, students.id))
          .where(and(
            eq(lessons.id, input.id),
            eq(lessons.organizationId, orgId),
            isUserAdmin ? undefined : or(
              eq(lessons.userId, ctx.user.id),
              eq(students.professorId, ctx.user.id)
            )
          )).limit(1);
        if (!currentLesson) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Aula não encontrada ou você não tem permissão." });
        }

        const updateData: any = {
          status: input.status,
          rating: input.rating,
          updatedAt: new Date(),
        };

        // Se a aula foi remarcada com nova data, ela deve voltar ao status 'agendada'
        // para que o job de automação possa gerar lembretes normalmente.
        // O status 'remarcada' sem nova data fica apenas como marcação histórica.
        if (input.status === 'remarcada' && input.scheduledAt) {
          updateData.status = 'agendada';
        }

        // Se estiver remarcando com uma nova data, validar conflitos
        if (input.scheduledAt) {
          const newDate = new Date(input.scheduledAt);
          const duration = currentLesson.duration || 60;
          const endsAt = new Date(newDate.getTime() + duration * 60000);

          const startOfDay = new Date(newDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(newDate);
          endOfDay.setHours(23, 59, 59, 999);

          // CONFLITO FIX: consulta org-wide + professor EFETIVO (criador OU professor
          // do aluno), espelhando a lógica de `lessons.update` e `lessons.create`.
          // Antes: filtrava apenas lessons.userId para não-admin, permitindo que um
          // professor remarcar por cima de aula criada pelo admin sem ser avisado.
          const existingLessons = await db.select({
            id: lessons.id,
            scheduledAt: lessons.scheduledAt,
            duration: lessons.duration,
            lessonType: lessons.lessonType,
            userId: lessons.userId,
            studentProfessorId: students.professorId,
          }).from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.status, 'agendada'),
              gte(lessons.scheduledAt, startOfDay),
              lte(lessons.scheduledAt, endOfDay)
            ));

          const lessonTeacherIds = new Set<number>(
            [currentLesson.userId, currentLesson.studentProfessorId].filter(Boolean) as number[]
          );
          const curLessonType = currentLesson.lessonType || 'individual';
          for (const existing of existingLessons) {
            if (existing.id === input.id) continue;
            const exStart = new Date(existing.scheduledAt);
            const exEnd = new Date(exStart.getTime() + (existing.duration || 60) * 60000);
            if (exStart < endsAt && exEnd > newDate) {
              const existingTeacherIds = new Set<number>([existing.userId, existing.studentProfessorId].filter(Boolean) as number[]);
              const sharesTeacher = Array.from(lessonTeacherIds).some((t) => existingTeacherIds.has(t));
              if (sharesTeacher) {
                if (curLessonType === 'individual' || existing.lessonType === 'individual') {
                  throw new TRPCError({ code: "CONFLICT", message: "Conflito: Já existe uma aula agendada para este novo horário." });
                }
              }
            }
          }

          updateData.scheduledAt = newDate;

          // Cancelar lembretes pendentes da aula pois a data/hora mudou
          if (new Date(currentLesson.scheduledAt).getTime() !== newDate.getTime()) {
            await db.update(reminders)
              .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(reminders.lessonId, input.id),
                eq(reminders.status, 'pendente')
              ));
          }

          // Se for para atualizar a série toda
          if (input.updateSeries && currentLesson.recurringGroupId) {
            const timeOffset = newDate.getTime() - new Date(currentLesson.scheduledAt).getTime();
            
            // Buscar aulas futuras da série
            const futureLessons = await db.select().from(lessons).where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.recurringGroupId, currentLesson.recurringGroupId),
              gte(lessons.scheduledAt, currentLesson.scheduledAt),
              sql`id != ${input.id}`
            ));

            // Atualizar cada aula futura deslocando a data
            for (const future of futureLessons) {
              const nextDate = new Date(new Date(future.scheduledAt).getTime() + timeOffset);
              await db.update(lessons).set({
                scheduledAt: nextDate,
                // Se a aula estava remarcada, volta para agendada para que a automação processe
                status: future.status === 'remarcada' || input.status === 'remarcada' ? 'agendada' : future.status,
                updatedAt: new Date()
              }).where(and(eq(lessons.id, future.id), eq(lessons.organizationId, orgId)));

              // Cancelar lembretes pendentes da aula futura da série pois a data mudou
              await db.update(reminders)
                .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
                .where(and(
                  eq(reminders.lessonId, future.id),
                  eq(reminders.status, 'pendente')
                ));
            }
          }
        }

        // Enum já foi corrigido definitivamente nas migrações — ALTER TYPE removido para evitar table-lock

        // Cancelar lembretes pendentes associados se a aula mudou para um status não-agendada
        if (input.status === 'cancelada' || input.status === 'concluida' || input.status === 'remarcada' || input.status === 'falta') {
          await db.update(reminders)
            .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
            .where(and(
              eq(reminders.lessonId, input.id),
              eq(reminders.organizationId, orgId),
              eq(reminders.status, 'pendente')
            ));
        }

        // Permissão já validada no pre-check (FORBIDDEN) — o WHERE final precisa
        // apenas filtrar organização. O filtro antigo `lessons.userId` para
        // não-admin é o que impedia professores de remarcar aulas criadas por admin.
        const updateResult = await db.update(lessons).set(updateData).where(and(
          eq(lessons.id, input.id), 
          eq(lessons.organizationId, orgId)
        ));
        // postgres-js RowList expõe `count` (linhas afetadas) para UPDATE sem RETURNING
        const updated = ((updateResult as any)?.count ?? 1) > 0;

        // ── PRD Reposição (Caça-Bug): crédito órfão ──
        // Se a aula estava marcada como 'a_repor' e o professor mudou diretamente
        // para um status terminal (Concluída/Cancelada/Falta), o crédito de reposição
        // deve ser CANCELADO (com sua aula de reposição agendada, se houver) —
        // nunca pode existir crédito disponível sem a aula "a repor" original.
        if (currentLesson.status === "a_repor" && ["concluida", "cancelada", "falta"].includes(input.status)) {
          try {
            const [repRow] = await db
              .select({ id: lessonRepositions.id, scheduledLessonId: lessonRepositions.scheduledLessonId })
              .from(lessonRepositions)
              .where(and(eq(lessonRepositions.lessonId, input.id), eq(lessonRepositions.organizationId, orgId)))
              .limit(1);
            if (repRow) {
              await db
                .update(lessonRepositions)
                .set({ status: "cancelada", scheduledLessonId: null, scheduledAt: null, updatedAt: new Date() })
                .where(and(eq(lessonRepositions.id, repRow.id), eq(lessonRepositions.organizationId, orgId)));
              if (repRow.scheduledLessonId) {
                await db
                  .update(lessons)
                  .set({ status: "cancelada", updatedAt: new Date() })
                  .where(and(eq(lessons.id, repRow.scheduledLessonId), eq(lessons.organizationId, orgId)));
                await db
                  .update(reminders)
                  .set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
                  .where(and(eq(reminders.lessonId, repRow.scheduledLessonId), eq(reminders.status, "pendente")));
              }
              await db.insert(repositionEvents).values({
                organizationId: orgId,
                repositionId: repRow.id,
                type: "cancelado",
                message: `Crédito cancelado automaticamente: aula original alterada para "${input.status}" na agenda.`,
                userId: ctx.user.id,
              });
            }
          } catch (repErr) {
            console.error("Erro ao cancelar crédito de reposição (não impeditivo):", repErr);
          }
        }
        
        // --- NOTIFICAÇÃO DE FALTA DE ALUNO ---
        if (input.status === 'falta') {
          try {
            const [userSettings] = await db.select({ notifyStudentAbsence: settings.notifyStudentAbsence }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);
            if (userSettings && userSettings.notifyStudentAbsence === 1) {
               const [student] = await db.select({ name: students.name, title: lessons.title }).from(lessons).innerJoin(students, eq(students.id, lessons.studentId)).where(eq(lessons.id, input.id)).limit(1);
               const { notifyUser } = await import("../_core/notification");
               await notifyUser(ctx.user.id, {
                 title: "📉 Falta Registrada",
                 content: `O aluno ${student?.name || 'Desconhecido'} faltou à aula de ${student?.title || 'música'}.`
               });
            }
          } catch (e) {
            console.error("Erro ao notificar falta de aluno:", e);
          }

          // --- AUTOMAÇÃO INTELIGENTE DE ANTECIPAÇÃO DE HORÁRIOS ---
          try {
            const { triggerSlotAdvanceOnAbsence } = await import("../services/slotAdvanceEngine");
            await triggerSlotAdvanceOnAbsence({
              lessonId: input.id,
              organizationId: orgId,
              userId: ctx.user.id,
            });
          } catch (e) {
            console.error("[SlotAdvance] Erro ao disparar antecipação de horários:", e);
          }
        }
        
        return { success: true, updated };
      } catch (error) {
        return handleDbError(error, "atualizar o status da aula");
      }
    }),
    delete: protectedProcedure.input(z.object({
      id: z.number(),
      deleteSeries: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const deleteSeries = input.deleteSeries === true;

        // Buscar aula atual garantindo permissão (seja criador da aula, admin da escola ou professor do aluno)
        const [currentLesson] = await db.select({
          id: lessons.id,
          recurringGroupId: lessons.recurringGroupId,
          scheduledAt: lessons.scheduledAt,
          studentId: lessons.studentId,
          lessonType: lessons.lessonType,
          title: lessons.title,
          userId: lessons.userId,
        })
          .from(lessons)
          .leftJoin(students, eq(lessons.studentId, students.id))
          .where(and(
            eq(lessons.id, input.id),
            eq(lessons.organizationId, orgId),
            isAdmin ? undefined : or(
              eq(lessons.userId, ctx.user.id),
              eq(students.professorId, ctx.user.id)
            )
          ))
          .limit(1);

        if (!currentLesson) {
          throw new Error("Aula não encontrada ou você não tem permissão para excluí-la.");
        }

        if (deleteSeries) {
          // Identificar todas as aulas a serem excluídas da série
          let targetLessons: Array<{ id: number }> = [];

          if (currentLesson.recurringGroupId) {
            // Caso 1: Pertence a um grupo recorrente
            targetLessons = await db.select({ id: lessons.id })
              .from(lessons)
              .leftJoin(students, eq(lessons.studentId, students.id))
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.recurringGroupId, currentLesson.recurringGroupId),
                gte(lessons.scheduledAt, currentLesson.scheduledAt),
                isAdmin ? undefined : or(
                  eq(lessons.userId, ctx.user.id),
                  eq(students.professorId, ctx.user.id)
                )
              ));
          } else if (currentLesson.studentId) {
            // Caso 2: Sem recurringGroupId explícito mas é aula de aluno - excluir todas as aulas futuras agendadas do mesmo aluno
            targetLessons = await db.select({ id: lessons.id })
              .from(lessons)
              .leftJoin(students, eq(lessons.studentId, students.id))
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.studentId, currentLesson.studentId),
                eq(lessons.status, 'agendada'),
                gte(lessons.scheduledAt, currentLesson.scheduledAt),
                isAdmin ? undefined : or(
                  eq(lessons.userId, ctx.user.id),
                  eq(students.professorId, ctx.user.id)
                )
              ));
          } else if (currentLesson.lessonType === 'turma') {
            // Caso 3: Turma sem recurringGroupId - excluir todas as turmas futuras com o mesmo título
            targetLessons = await db.select({ id: lessons.id })
              .from(lessons)
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.title, currentLesson.title),
                eq(lessons.lessonType, 'turma'),
                eq(lessons.status, 'agendada'),
                gte(lessons.scheduledAt, currentLesson.scheduledAt),
                isAdmin ? undefined : eq(lessons.userId, ctx.user.id)
              ));
          } else {
            // Caso 4: Aula avulsa avulsa
            targetLessons = [{ id: currentLesson.id }];
          }

          const targetIds = targetLessons.map(t => t.id);
          if (targetIds.length > 0) {
            // Limpar lembretes vinculados
            await db.delete(reminders).where(inArray(reminders.lessonId, targetIds));
            // Excluir as aulas
            await db.delete(lessons).where(inArray(lessons.id, targetIds));
            return { success: true, count: targetIds.length };
          }
        }

        // Excluir apenas a aula individual
        await db.delete(reminders).where(eq(reminders.lessonId, currentLesson.id));
        await db.delete(lessons).where(eq(lessons.id, currentLesson.id));
        return { success: true, count: 1 };
      } catch (error) {
        return handleDbError(error, "remover a aula");
      }
    }),
    
    // ─ Excluir Aulas em Massa (Filtro por aluno ou Todas) ──────────────────
    deleteBulk: protectedProcedure.input(z.object({
      type: z.enum(['all', 'student']),
      studentId: z.number().optional().nullable()
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        if (input.type === 'student') {
          if (!input.studentId) throw new Error("ID do aluno não fornecido");
          await db.delete(lessons).where(and(
             eq(lessons.organizationId, orgId),
             isAdmin ? undefined : eq(lessons.userId, ctx.user.id),
             eq(lessons.studentId, input.studentId as number),
             eq(lessons.status, 'agendada')
          ));
        } else {
          // Apagar todas as aulas agendadas (não concluídas)
          await db.delete(lessons).where(and(
             eq(lessons.organizationId, orgId),
             isAdmin ? undefined : eq(lessons.userId, ctx.user.id),
             eq(lessons.status, 'agendada')
          ));
        }
        return { success: true };
      } catch (error) {
        return handleDbError(error, "excluir agendamentos em massa");
      }
    }),

    // ─ Listar aulas de uma semana específica ────────────────────────────────
    listByWeek: protectedProcedure.input(z.object({
      weekStart: z.string(), // ISO string da segunda-feira da semana
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const start = new Date(input.weekStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        rating: lessons.rating,
        description: lessons.description,
        notes: lessons.notes,
        studentName: students.name,
        studentPhone: students.phone,
        isExperimental: lessons.isExperimental,
        experimentalName: lessons.experimentalName,
        instrumentId: instruments.id,
        instrumentName: instruments.name,
        instrumentColor: instruments.color,
        instrumentIcon: instruments.icon,
        lessonType: lessons.lessonType,
      }).from(lessons)
        .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
        .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
        .where(and(
          eq(lessons.organizationId, orgId),
          eq(lessons.userId, ctx.user.id),
          gte(lessons.scheduledAt, start), 
          lt(lessons.scheduledAt, end)
        ))
        .orderBy(asc(lessons.scheduledAt));
    }),

    listRange: protectedProcedure.input(z.object({
      start: z.string(),
      end: z.string(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const start = new Date(input.start);
      const end = new Date(input.end);
      return db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        rating: lessons.rating,
        description: lessons.description,
        notes: lessons.notes,
        studentName: students.name,
        studentPhone: students.phone,
        isExperimental: lessons.isExperimental,
        experimentalName: lessons.experimentalName,
        instrumentId: instruments.id,
        instrumentName: instruments.name,
        instrumentColor: instruments.color,
        instrumentIcon: instruments.icon,
        lessonType: lessons.lessonType,
      }).from(lessons)
        .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
        .leftJoin(instruments, and(eq(students.instrumentId, instruments.id), eq(students.organizationId, orgId)))
        .where(and(
          eq(lessons.organizationId, orgId),
          eq(lessons.userId, ctx.user.id),
          gte(lessons.scheduledAt, start), 
          lte(lessons.scheduledAt, end)
        ))
        .orderBy(asc(lessons.scheduledAt));
    }),

    // ─ Verificar conflitos para agendamentos recorrentes (suporta múltiplos dias/semana) ────
    // BUG #1/#8 FIX: convertido de query → mutation para aceitar slots dinâmicos no payload
    // Antes: cliente enviava "scheduledAt" (campo inexistente no schema), recebia [] vazio
    // Agora: cliente envia slots calculados dinamicamente e conflitos são verificados de verdade
    checkConflicts: protectedProcedure.input(z.object({
      firstDate: z.string().optional(),
      duration: z.number(),
      weeksCount: z.number().min(1).max(104),
      studioRoomId: z.number().optional().nullable(),
      slots: z.array(z.object({
        scheduledAt: z.string(),
        studioRoomId: z.number().optional().nullable(),
      })).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const orgId = ctx.user.organizationId!;
      const results = [];

      let datesToCheck: Array<{ scheduledAt: Date; roomId?: number | null }> = [];

      if (input.slots && input.slots.length > 0) {
        datesToCheck = input.slots.map(s => ({
          scheduledAt: new Date(s.scheduledAt),
          roomId: s.studioRoomId ?? input.studioRoomId
        }));
      } else if (input.firstDate) {
        const base = new Date(input.firstDate);
        for (let i = 0; i < input.weeksCount; i++) {
          const d = new Date(base);
          d.setDate(base.getDate() + i * 7);
          datesToCheck.push({ scheduledAt: d, roomId: input.studioRoomId });
        }
      }

      for (const item of datesToCheck) {
        const d = item.scheduledAt;
        const endsAt = new Date(d.getTime() + input.duration * 60000);
        const roomId = item.roomId;
        
        const [conflict] = await db.select({ 
          id: lessons.id, 
          studentName: students.name 
        })
          .from(lessons)
          .leftJoin(students, and(eq(lessons.studentId, students.id), eq(lessons.organizationId, orgId)))
          .where(and(
            eq(lessons.organizationId, orgId),
            eq(lessons.status, 'agendada'),
            or(
              eq(lessons.userId, ctx.user.id),
              roomId ? eq(lessons.studioRoomId, roomId) : sql`false`
            ),
            sql`(${lessons.scheduledAt}, (${lessons.scheduledAt} + (${lessons.duration} || ' minutes')::interval)) OVERLAPS (${d.toISOString()}::timestamp, ${endsAt.toISOString()}::timestamp)`
          )).limit(1);
          
        results.push({
          date: d.toISOString(),
          hasConflict: !!conflict,
          conflictingWith: conflict?.studentName || null
        });
      }
      return results;
    }),

    // ─ Criar aulas recorrentes semanalmente ──────────────────
    createBatch: protectedProcedure.input(z.object({
      studentId: z.number(),
      title: z.string().min(2),
      duration: z.number().default(60),
      description: z.string().optional(),
      notes: z.string().optional(),
      instrumentId: z.number().nullable().optional(),
      studioRoomId: z.number().nullable().optional(),
      recurrence: z.enum(["semanal", "quinzenal", "mensal30", "mensal_fixo"]).optional(),
      items: z.array(z.object({
        scheduledAt: z.string(),
        force: z.boolean().default(false)
      })).min(1).max(200, "Limite de 200 aulas por geração em lote")
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");

        const orgId = ctx.user.organizationId!;
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        // Segurança: Verificar se o aluno pertence ao usuário logado
        const [ownedStudent] = await db.select({ id: students.id }).from(students)
          .where(and(
            eq(students.id, input.studentId as number), 
            eq(students.organizationId, orgId), 
            isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
          ))
          .limit(1);

        if (!ownedStudent) {
          throw new Error("O aluno selecionado não existe ou não pertence ao seu perfil.");
        }
        
        const rowsToInsert = [];
        const groupId = nanoid();
        for (const item of input.items) {
          const scheduledAt = new Date(item.scheduledAt);
          
          if (!item.force) {
            const endsAt = new Date(scheduledAt.getTime() + input.duration * 60000);
            const [conflict] = await db.select({ id: lessons.id }).from(lessons)
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.status, 'agendada'),
                or(
                  eq(lessons.userId, ctx.user.id),
                  input.studioRoomId ? eq(lessons.studioRoomId, input.studioRoomId) : sql`false`
                ),
                sql`(${lessons.scheduledAt}, (${lessons.scheduledAt} + (${lessons.duration} || ' minutes')::interval)) OVERLAPS (${scheduledAt.toISOString()}::timestamp, ${endsAt.toISOString()}::timestamp)`
              )).limit(1);
              
            if (conflict) continue; // Pula se tem conflito e não foi forçado
          }
          
          rowsToInsert.push({
            organizationId: orgId,
            userId: ctx.user.id,
            studentId: input.studentId,
            title: input.title,
            scheduledAt: scheduledAt,
            duration: input.duration,
            description: input.description || null,
            notes: input.notes || null,
            instrumentId: input.instrumentId || null,
            studioRoomId: input.studioRoomId || null,
            rating: null,
            recurringGroupId: groupId,
            recurrence: input.recurrence ?? null,
            status: 'agendada' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        
        if (rowsToInsert.length > 0) {
          await db.insert(lessons).values(rowsToInsert);
        }

        // Sincroniza a sala com o aluno se informado
        if (input.studentId && input.studioRoomId) {
          await db.update(students)
            .set({ studioRoomId: input.studioRoomId, updatedAt: new Date() })
            .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
        }
        
        return { success: true, count: rowsToInsert.length };
      } catch (error) {
        return handleDbError(error, "realizar agendamentos em lote");
      }
    }),

    // ─ Criar aulas em turma (mesmo horário, vários alunos) ───────────────
    createTurma: protectedProcedure.input(z.object({
      studentIds: z.array(z.number()).min(1),
      title: z.string().min(2),
      scheduledAt: z.string(),
      duration: z.number().default(60),
      notes: z.string().optional(),
      instrumentId: z.number().nullable().optional(),
      studioRoomId: z.number().nullable().optional(),
      weeksCount: z.number().default(1),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");

        const orgId = ctx.user.organizationId!;
        
        // Segurança: Verificar se todos os alunos pertencem ao usuário logado
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const ownedStudents = await db.select({ id: students.id, name: students.name }).from(students)
          .where(and(
            inArray(students.id, input.studentIds),
            eq(students.organizationId, orgId),
            isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
          ));

        if (ownedStudents.length !== input.studentIds.length) {
          throw new Error("Um ou mais alunos selecionados não existem ou não pertencem ao seu perfil.");
        }
        
        const rowsToInsert = [];
        const baseDate = new Date(input.scheduledAt);
        
        for (let w = 0; w < input.weeksCount; w++) {
          const d = new Date(baseDate);
          d.setDate(baseDate.getDate() + w * 7);
          const endsAt = new Date(d.getTime() + input.duration * 60000);
          
          const groupId = nanoid(); // Cada sessão/data de turma ganha um groupId unificado

          // Checar conflito de sala e professor antes de processar os alunos
          if (input.studioRoomId) {
            const [roomConflict] = await db.select({ id: lessons.id }).from(lessons)
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.studioRoomId, input.studioRoomId),
                eq(lessons.status, 'agendada'),
                sql`(${lessons.scheduledAt}, (${lessons.scheduledAt} + (${lessons.duration} || ' minutes')::interval)) OVERLAPS (${d.toISOString()}::timestamp, ${endsAt.toISOString()}::timestamp)`
              )).limit(1);
            if (roomConflict) {
              throw new Error("Conflito de sala: Esta sala já está ocupada neste horário.");
            }
          }

          for (const studentId of input.studentIds) {
            // Verificar se o aluno específico tem conflito de horário.
            // Para turmas, só nos importamos se *este* aluno tem outra aula na mesma hora.
            const [conflict] = await db.select({ id: lessons.id }).from(lessons)
              .where(and(
                eq(lessons.organizationId, orgId),
                eq(lessons.studentId, studentId),
                eq(lessons.status, 'agendada'),
                sql`(${lessons.scheduledAt}, (${lessons.scheduledAt} + (${lessons.duration} || ' minutes')::interval)) OVERLAPS (${d.toISOString()}::timestamp, ${endsAt.toISOString()}::timestamp)`
              )).limit(1);
              
            if (conflict) {
              const studentName = ownedStudents.find(s => s.id === studentId)?.name || 'Aluno';
              throw new Error(`Conflito: ${studentName} já possui aula agendada neste horário.`);
            }

            rowsToInsert.push({
              organizationId: orgId,
              userId: ctx.user.id,
              studentId: studentId,
              title: input.title,
              scheduledAt: d,
              duration: input.duration,
              notes: input.notes || null,
              instrumentId: input.instrumentId || null,
              studioRoomId: input.studioRoomId || null,
              rating: null,
              recurringGroupId: groupId, // Todas as linhas desta turma terão o mesmo groupId
              status: 'agendada' as const,
              lessonType: 'turma' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        
        if (rowsToInsert.length > 0) {
          await db.insert(lessons).values(rowsToInsert);
        }
        
        return { success: true, count: rowsToInsert.length };
      } catch (error) {
        return handleDbError(error, "agendar turma");
      }
    }),

    // ─ Buscar detalhes de todos os alunos de uma turma específica ───────────
    getTurmaDetails: protectedProcedure.input(z.object({
      groupId: z.string().optional(),
      scheduledAt: z.string(),
      title: z.string(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const dateObj = new Date(input.scheduledAt);
      const startWindow = new Date(dateObj.getTime() - 60000); // 1 min margin
      const endWindow = new Date(dateObj.getTime() + 60000);

      const whereClause = input.groupId
        ? and(
            eq(lessons.organizationId, orgId),
            eq(lessons.recurringGroupId, input.groupId),
            gte(lessons.scheduledAt, startWindow),
            lte(lessons.scheduledAt, endWindow)
          )
        : and(
            eq(lessons.organizationId, orgId),
            eq(lessons.title, input.title),
            eq(lessons.lessonType, 'turma'),
            gte(lessons.scheduledAt, startWindow),
            lte(lessons.scheduledAt, endWindow)
          );

      return db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        notes: lessons.notes,
        studentId: students.id,
        studentName: students.name,
        studentPhone: students.phone,
        studentAvatar: students.avatar,
        instrumentName: instruments.name,
      })
      .from(lessons)
      .leftJoin(students, and(eq(lessons.studentId, students.id), eq(students.organizationId, orgId)))
      .leftJoin(instruments, and(eq(lessons.instrumentId, instruments.id), eq(instruments.organizationId, orgId)))
      .where(whereClause)
      .orderBy(asc(students.name));
    }),

    // ─ Dar baixa em lote no status de chamada de uma turma ─────────────────
    updateTurmaAttendance: protectedProcedure.input(z.object({
      attendances: z.array(z.object({
        lessonId: z.number(),
        status: z.enum(['agendada', 'concluida', 'falta', 'cancelada', 'remarcada'])
      }))
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        const orgId = ctx.user.organizationId!;

        // Enum já foi corrigido definitivamente nas migrações — ALTER TYPE removido para evitar table-lock

        for (const item of input.attendances) {
          // AUDIT-P1 FIX (IDOR): remover isNull(organizationId) — aulas legadas sem
          // org não podem ser alteradas por qualquer professor logado. Agora exige
          // que a aula pertença à organização do usuário.
          const whereClause = and(eq(lessons.id, item.lessonId), eq(lessons.organizationId, orgId));

          await db.update(lessons)
            .set({ status: item.status, updatedAt: new Date() })
            .where(whereClause);

          // Cancelar lembretes pendentes associados se a aula mudou para um status não-agendada
          if (item.status === 'cancelada' || item.status === 'concluida' || item.status === 'remarcada' || item.status === 'falta') {
            await db.update(reminders)
              .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
              .where(and(eq(reminders.lessonId, item.lessonId), eq(reminders.organizationId, orgId)));
          }

          // Notificação de falta de aluno se habilitado
          if (item.status === 'falta') {
            try {
              const [userSettings] = await db.select({ notifyStudentAbsence: settings.notifyStudentAbsence }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);
              if (userSettings && userSettings.notifyStudentAbsence === 1) {
                 const [student] = await db.select({ name: students.name, title: lessons.title }).from(lessons).innerJoin(students, eq(students.id, lessons.studentId)).where(eq(lessons.id, item.lessonId)).limit(1);
                 const { notifyUser } = await import("../_core/notification");
                 await notifyUser(ctx.user.id, {
                   title: "📉 Falta Registrada",
                   content: `O aluno ${student?.name || 'Desconhecido'} faltou à aula de turma ${student?.title || ''}.`
                 });
              }
            } catch (e) {
              console.error("Erro ao notificar falta de aluno na turma:", e);
            }

            // --- AUTOMAÇÃO INTELIGENTE DE ANTECIPAÇÃO DE HORÁRIOS ---
            try {
              const { triggerSlotAdvanceOnAbsence } = await import("../services/slotAdvanceEngine");
              await triggerSlotAdvanceOnAbsence({
                lessonId: item.lessonId,
                organizationId: orgId,
                userId: ctx.user.id,
              });
            } catch (e) {
              console.error("[SlotAdvance] Erro ao disparar antecipação de horários na turma:", e);
            }
          }
        }

        return { success: true };
      } catch (error) {
        return handleDbError(error, "dar baixa na frequência da turma");
      }
    }),
  }),

  attendance: router({
    generateToken: protectedProcedure
      .mutation(async ({ ctx }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;

          const [active] = await db.select()
            .from(attendanceTokens)
            .where(and(
              eq(attendanceTokens.organizationId, orgId),
              gte(attendanceTokens.expiresAt, new Date())
            ))
            .orderBy(desc(attendanceTokens.createdAt))
            .limit(1);

          if (active) {
            return { success: true, token: active.token, expiresAt: active.expiresAt };
          }

          const token = crypto.randomBytes(16).toString('hex');
          const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 anos

          const [created] = await db.insert(attendanceTokens).values({
            organizationId: orgId,
            token,
            expiresAt,
            createdAt: new Date(),
          }).returning();

          return { success: true, token: created.token, expiresAt: created.expiresAt };
        } catch (error) {
          return handleDbError(error, "gerar token de presença");
        }
      }),

    getActiveToken: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) return null;
        const orgId = ctx.user.organizationId!;

        const [active] = await db.select()
          .from(attendanceTokens)
          .where(and(
            eq(attendanceTokens.organizationId, orgId),
            gte(attendanceTokens.expiresAt, new Date()),
          ))
          .orderBy(desc(attendanceTokens.createdAt))
          .limit(1);

        return active || null;
      }),

    scan: protectedProcedure
      .input(z.object({
        token: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const orgId = ctx.user.organizationId!;
          const userId = ctx.user.id;

          // 1. Validate the token
          const [tokenRecord] = await db.select()
            .from(attendanceTokens)
            .where(and(
              eq(attendanceTokens.organizationId, orgId),
              eq(attendanceTokens.token, input.token),
            ))
            .limit(1);

          if (!tokenRecord) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
          }

          if (new Date() > tokenRecord.expiresAt) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Token expirado" });
          }

          // Trava 1: Apenas alunos podem registrar presença via QR Code
          if (ctx.user.role !== "aluno" || !ctx.user.studentId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Apenas alunos podem registrar presença via QR Code." });
          }

          // 2. Obter configurações de presença da escola
          const [schoolSettings] = await db.select({
            checkinMoment: settings.attendanceCheckinMoment,
            toleranceMinutes: settings.attendanceToleranceMinutes,
            lessonDuration: settings.lessonDuration,
          }).from(settings).where(eq(settings.organizationId, orgId)).limit(1);

          const checkinMoment = schoolSettings?.checkinMoment || "inicio";
          const toleranceMs = (schoolSettings?.toleranceMinutes ?? 30) * 60 * 1000;
          const defaultDurationMin = schoolSettings?.lessonDuration ?? 60;

          // Buscar aulas agendadas do aluno para hoje (com ampla margem para checagem contextual)
          const now = new Date();
          const dayStart = new Date(now);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(now);
          dayEnd.setHours(23, 59, 59, 999);

          const candidateLessons = await db.select()
            .from(lessons)
            .where(and(
              eq(lessons.organizationId, orgId),
              eq(lessons.studentId, ctx.user.studentId),
              eq(lessons.status, "agendada"),
              gte(lessons.scheduledAt, dayStart),
              lte(lessons.scheduledAt, dayEnd),
            ))
            .orderBy(asc(lessons.scheduledAt));

          if (candidateLessons.length === 0) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma aula agendada encontrada para você hoje." });
          }

          // Encontrar a aula que se enquadra na janela temporal permitida
          let todayLesson: typeof candidateLessons[0] | null = null;
          let feedbackError: string | null = null;

          for (const lesson of candidateLessons) {
            const lessonStart = new Date(lesson.scheduledAt);
            const durationMin = (lesson as any).durationMinutes ?? defaultDurationMin;
            const lessonEnd = new Date(lessonStart.getTime() + durationMin * 60 * 1000);

            const horaInicio = lessonStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            const horaFim = lessonEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

            let validWindowStart: Date;
            let validWindowEnd: Date;

            if (checkinMoment === "fim") {
              // Check-in na saída: janela centrada no término da aula
              validWindowStart = new Date(lessonEnd.getTime() - toleranceMs);
              validWindowEnd = new Date(lessonEnd.getTime() + toleranceMs);
            } else if (checkinMoment === "livre") {
              // Check-in livre: do início menos tolerância até o fim mais tolerância
              validWindowStart = new Date(lessonStart.getTime() - toleranceMs);
              validWindowEnd = new Date(lessonEnd.getTime() + toleranceMs);
            } else {
              // Check-in no início (padrão): janela centrada no início da aula
              validWindowStart = new Date(lessonStart.getTime() - toleranceMs);
              validWindowEnd = new Date(lessonStart.getTime() + toleranceMs);
            }

            if (now >= validWindowStart && now <= validWindowEnd) {
              todayLesson = lesson;
              break;
            } else if (now < validWindowStart) {
              if (checkinMoment === "fim") {
                feedbackError = `O check-in desta escola é feito no término da aula (${horaFim}). Aguarde o fim da aula para registrar.`;
              } else {
                feedbackError = `Sua aula inicia às ${horaInicio}. O check-in será liberado próximo ao início da aula.`;
              }
            } else if (now > validWindowEnd) {
              feedbackError = `O horário limite de check-in para a aula das ${horaInicio} já expirou.`;
            }
          }

          if (!todayLesson) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: feedbackError || "Nenhuma aula agendada disponível para check-in neste momento.",
            });
          }

          // 3. Check for duplicate scan
          const [existingLog] = await db.select()
            .from(attendanceLogs)
            .where(and(
              eq(attendanceLogs.organizationId, orgId),
              eq(attendanceLogs.userId, userId),
              eq(attendanceLogs.lessonId, todayLesson.id),
            ))
            .limit(1);

          if (existingLog) {
            throw new TRPCError({ code: "CONFLICT", message: "Presença já registrada para esta aula" });
          }

          // 4. Mark the lesson as completed
          await db.update(lessons)
            .set({ status: "concluida", updatedAt: new Date() })
            .where(eq(lessons.id, todayLesson.id));

          // 5. Create attendance log
          await db.insert(attendanceLogs).values({
            organizationId: orgId,
            userId,
            lessonId: todayLesson.id,
            tokenId: tokenRecord.id,
            scannedAt: new Date(),
          });

          return { success: true, lessonId: todayLesson.id, lessonTitle: todayLesson.title };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          return handleDbError(error, "registrar presença");
        }
      }),

    getLogs: protectedProcedure
      .input(z.object({
        startDate: z.string(), // ISO date string
        endDate: z.string(),   // ISO date string
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;

        // FIX TZ: interpretar as datas no fuso do Brasil (America/Sao_Paulo), senão
        // check-ins após 21h BRT caem no dia UTC seguinte e somem das "atividades recentes".
        const start = new Date(`${input.startDate}T00:00:00-03:00`);
        const end = new Date(`${input.endDate}T23:59:59.999-03:00`);

        // BUG FIX: O filtro por lessons.userId escondia registros de aulas criadas por
        // outro usuário da mesma escola (ex.: aula criada pelo admin para um aluno do
        // professor) — a recepção deve mostrar TODOS os check-ins da organização.
        const logs = await db.select({
          log: attendanceLogs,
          userName: users.name,
          lessonTitle: lessons.title,
          lessonScheduledAt: lessons.scheduledAt,
        })
          .from(attendanceLogs)
          .innerJoin(users, eq(users.id, attendanceLogs.userId))
          .leftJoin(lessons, eq(lessons.id, attendanceLogs.lessonId))
          .where(and(
            eq(attendanceLogs.organizationId, orgId),
            gte(attendanceLogs.scannedAt, start),
            lte(attendanceLogs.scannedAt, end),
          ))
          .orderBy(desc(attendanceLogs.scannedAt));

        return logs.map(l => ({
          ...l.log,
          userName: l.userName,
          lessonTitle: l.lessonTitle,
          lessonScheduledAt: l.lessonScheduledAt,
        }));
      }),
  }),

  reschedule: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      return db.select({
        id: rescheduleRequests.id,
        studentName: students.name,
        lessonTitle: lessons.title,
        reason: rescheduleRequests.reason,
        preferredDates: rescheduleRequests.preferredDates,
        status: rescheduleRequests.status,
        createdAt: rescheduleRequests.createdAt,
      })
      .from(rescheduleRequests)
      .leftJoin(students, eq(rescheduleRequests.studentId, students.id))
      .leftJoin(lessons, eq(rescheduleRequests.lessonId, lessons.id))
      .where(and(eq(rescheduleRequests.organizationId, orgId), eq(students.professorId, ctx.user.id)))
      .orderBy(desc(rescheduleRequests.createdAt));
    }),
    pendingCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const [result] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
        .from(rescheduleRequests)
        .leftJoin(students, eq(rescheduleRequests.studentId, students.id))
        .where(and(eq(rescheduleRequests.organizationId, orgId), eq(students.professorId, ctx.user.id), eq(rescheduleRequests.status, 'pendente')));
      return result?.count || 0;
    }),
    respond: protectedProcedure.input(z.object({ id: z.number(), status: z.enum(['aprovada', 'recusada']) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.update(rescheduleRequests).set({ status: input.status }).where(and(eq(rescheduleRequests.id, input.id), eq(rescheduleRequests.organizationId, orgId)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.delete(rescheduleRequests).where(and(eq(rescheduleRequests.id, input.id), eq(rescheduleRequests.organizationId, orgId)));
      return { success: true };
    }),
  }),

  /**
   * PRD_AULA_EXTRA: solicitações de aula extra enviadas pelo portal do aluno.
   * Mesmo isolamento do reschedule: o professor vê apenas solicitações dos
   * SEUS alunos (students.professorId = ctx.user.id), sempre filtrando por org.
   */
  extraRequests: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      return db.select({
        id: extraLessonRequests.id,
        studentName: students.name,
        preferredDates: extraLessonRequests.preferredDates,
        reason: extraLessonRequests.reason,
        status: extraLessonRequests.status,
        createdAt: extraLessonRequests.createdAt,
      })
      .from(extraLessonRequests)
      .leftJoin(students, eq(extraLessonRequests.studentId, students.id))
      .where(and(eq(extraLessonRequests.organizationId, orgId), eq(students.professorId, ctx.user.id)))
      .orderBy(desc(extraLessonRequests.createdAt));
    }),
    pendingCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const [result] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
        .from(extraLessonRequests)
        .leftJoin(students, eq(extraLessonRequests.studentId, students.id))
        .where(and(eq(extraLessonRequests.organizationId, orgId), eq(students.professorId, ctx.user.id), eq(extraLessonRequests.status, 'pendente')));
      return result?.count || 0;
    }),
    respond: protectedProcedure.input(z.object({ id: z.number(), status: z.enum(['aprovada', 'recusada']) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      // RN-002: busca antes de atualizar para notificar o aluno (conta vinculada)
      const [request] = await db.select({
        id: extraLessonRequests.id,
        studentId: extraLessonRequests.studentId,
        organizationId: extraLessonRequests.organizationId,
      }).from(extraLessonRequests)
        .where(and(eq(extraLessonRequests.id, input.id), eq(extraLessonRequests.organizationId, orgId)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });

      // CA-003: apenas o professor efetivo do aluno pode responder
      const [student] = await db.select({ professorId: students.professorId, studentUserId: students.studentUserId, name: students.name })
        .from(students)
        .where(and(eq(students.id, request.studentId), eq(students.organizationId, orgId)))
        .limit(1);
      if (!student || student.professorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para responder esta solicitação." });
      }

      await db.update(extraLessonRequests).set({ status: input.status }).where(and(eq(extraLessonRequests.id, input.id), eq(extraLessonRequests.organizationId, orgId)));

      if (student.studentUserId) {
        const title = input.status === 'aprovada' ? "Aula Extra Aprovada! 🎸" : "Solicitação de Aula Extra";
        const message = input.status === 'aprovada'
          ? `Boa, ${student.name}! Seu professor aprovou sua aula extra. Em breve ela aparecerá na sua agenda.`
          : `Sua solicitação de aula extra foi recusada. Fale com seu professor para combinar o melhor horário.`;
        await db.insert(notifications).values({
          organizationId: orgId,
          userId: student.studentUserId,
          title,
          message,
          type: input.status === 'aprovada' ? "success" : "info",
          actionUrl: "/aluno/aulas",
        });
        notifyUser(student.studentUserId, { title, content: message, url: "/aluno/aulas" }).catch(e => console.error("Falha ao enviar push de resposta de aula extra:", e));
      }

      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.delete(extraLessonRequests).where(and(eq(extraLessonRequests.id, input.id), eq(extraLessonRequests.organizationId, orgId)));
      return { success: true };
    }),
  }),

};
