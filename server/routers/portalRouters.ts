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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, extraLessonRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs } from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lt, lte, asc, ne, or, inArray, aliasedTable, ilike, isNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "../_core/notification";
import { handleDbError } from "../utils/error_handler";
import { TRPCError } from "@trpc/server";

import crypto from "crypto";
import { decryptSecret } from "../utils/integrationCrypto";
import { createAsaasCustomer, createAsaasCharge, deleteAsaasCharge, getAsaasPixQrCode } from "../utils/asaas";
import { buildUserContext } from "../utils/aiContext";
import { getSystemPrompt, buildExerciseExplanationPrompt, AI_PROMPT_VERSIONS } from "../utils/aiPrompts";
import { resolveAiCredentials } from "../utils/aiProvider";
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
import { createFileToken } from "../_core/fileTokens";

export const portalRouters = {
  chat: router({
    getMessages: protectedProcedure.input(z.object({ withUserId: z.number() })).query(async ({ ctx, input }) => {
       const db = await getDb();
       if (!db) throw new Error("Database not available");
       const orgId = ctx.user.organizationId!;
       return db.select({
         id: chatMessages.id,
         senderId: chatMessages.senderId,
         content: chatMessages.content,
         createdAt: chatMessages.createdAt,
         isRead: chatMessages.isRead,
         isMe: sql`${chatMessages.senderId} = ${ctx.user.id}`,
       }).from(chatMessages)
         .where(and(
           eq(chatMessages.organizationId, orgId),
           or(
             and(eq(chatMessages.senderId, ctx.user.id), eq(chatMessages.receiverId, input.withUserId)),
             and(eq(chatMessages.senderId, input.withUserId), eq(chatMessages.receiverId, ctx.user.id))
           )
         ))
         .orderBy(asc(chatMessages.createdAt));
    }),
    send: protectedProcedure.input(z.object({ receiverId: z.number(), content: z.string() })).mutation(async ({ ctx, input }) => {
       const db = await getDb();
       if (!db) throw new Error("Database not available");
       const orgId = ctx.user.organizationId!;
       await db.insert(chatMessages).values({
         organizationId: orgId,
         senderId: ctx.user.id,
         receiverId: input.receiverId,
         content: input.content,
       });
       return { success: true };
    }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const [result] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
        .from(chatMessages)
        .where(and(eq(chatMessages.organizationId, orgId), eq(chatMessages.receiverId, ctx.user.id), eq(chatMessages.isRead, false)));
      return result?.count || 0;
    }),
    markAsRead: protectedProcedure.input(z.object({ fromUserId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.update(chatMessages)
        .set({ isRead: true })
        .where(and(
          eq(chatMessages.organizationId, orgId),
          eq(chatMessages.senderId, input.fromUserId),
          eq(chatMessages.receiverId, ctx.user.id),
          eq(chatMessages.isRead, false)
        ));
      return { success: true };
    }),
  }),

  studentPortal: router({
    getDashboard: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let studentId = ctx.user.studentId;

      if (!studentId) {
        // BUG-008: Busca com filtro de org para prevenir IDOR
        const [found] = await db.select({ id: students.id })
          .from(students)
          .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, ctx.user.organizationId!)))
          .limit(1);
        if (found) studentId = found.id;
      }

      if (!studentId) {
        throw new Error("Acesso não autorizado ou perfil de aluno incompleto.");
      }
      
      const orgId = ctx.user.organizationId!;
      const now = new Date();
      
      // BUG-008: Filtra por org para garantir isolamento multi-tenant
      const [student] = await db.select().from(students)
        .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
        .limit(1);
      
      // Parse permissions
      let permissions = {
        canSeeFinanceiro: true,
        canSeeProgress: true,
        canSeeFiles: true,
        canSeeSchedule: true,
        canSeeMessages: true,
      };

      if (student.permissions) {
        try {
          const parsed = JSON.parse(student.permissions);
          permissions = { ...permissions, ...parsed };
        } catch (e) {
          console.error("[studentPortal] Error parsing permissions for student", studentId, e);
        }
      }

      const [
        teacher,
        upcoming,
        timeline,
        dbAnnouncements,
        materials,
        statsDone,
        statsPending,
        statsTotalRecent,
        statsDoneRecent,
        payments,
        latestMessages,
        pendingGoals,
        totalMaterials,
        recentGoals
      ] = await Promise.all([
        db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, student.professorId)).limit(1).then(res => res[0]),
        
        // Upcoming (Schedule)
        permissions.canSeeSchedule 
          ? (() => {
              const profUsers = aliasedTable(users, "dash_prof_users");
              const creatorUsers = aliasedTable(users, "dash_creator_users");
              const profData = aliasedTable(professores, "dash_prof_data");
              const creatorData = aliasedTable(professores, "dash_creator_data");

              return db.select({
                id: lessons.id,
                title: lessons.title,
                scheduledAt: lessons.scheduledAt,
                status: lessons.status,
                duration: lessons.duration,
                instrumentId: lessons.instrumentId,
                studioRoomId: lessons.studioRoomId,
                studioRoomName: studioRooms.name,
                studioRoomColor: studioRooms.color,
                teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
                teacherFoto: sql<string | null>`COALESCE(${profData.foto}, ${creatorData.foto})`,
              }).from(lessons)
                .leftJoin(students, eq(lessons.studentId, students.id))
                .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
                .leftJoin(profUsers, eq(students.professorId, profUsers.id))
                .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
                .leftJoin(profData, eq(students.professorId, profData.userId))
                .leftJoin(creatorData, eq(lessons.userId, creatorData.userId))
                .where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId), gte(lessons.scheduledAt, new Date()), eq(lessons.status, 'agendada')))
                .orderBy(asc(lessons.scheduledAt))
                .limit(5);
            })()
          : Promise.resolve([]),

        // Timeline (Progress)
        permissions.canSeeProgress
          ? db.select().from(studentTimeline)
              .where(and(eq(studentTimeline.studentId, studentId), eq(studentTimeline.organizationId, orgId)))
              .orderBy(desc(studentTimeline.achievedAt))
              .limit(5)
          : Promise.resolve([]),

        db.select({
          id: announcements.id,
          title: announcements.title,
          author: users.name,
          date: announcements.createdAt,
          important: announcements.important,
          content: announcements.content,
        })
        .from(announcements)
        .leftJoin(users, eq(announcements.userId, users.id))
        .where(and(
          eq(announcements.organizationId, orgId),
          eq(announcements.userId, student.professorId),
          sql`(${announcements.targetStudentId} IS NULL OR ${announcements.targetStudentId} = ${studentId})`
        ))
        .orderBy(desc(announcements.createdAt))
        .limit(10),

        // Materials (Files)
        permissions.canSeeFiles
          ? db.select().from(studentFiles)
              .where(and(eq(studentFiles.studentId, studentId), eq(studentFiles.organizationId, orgId)))
              .orderBy(desc(studentFiles.createdAt))
              .limit(4)
          : Promise.resolve([]),

        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons).where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId), eq(lessons.status, 'concluida'))).then(res => res[0]),
        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(studentGoals).where(and(eq(studentGoals.studentId, studentId), eq(studentGoals.organizationId, orgId), eq(studentGoals.status, 'pendente'))).then(res => res[0]),
        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons).where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId), gte(lessons.scheduledAt, new Date(new Date().setMonth(new Date().getMonth() - 3))), ne(lessons.status, 'cancelada'))).then(res => res[0]),
        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons).where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId), gte(lessons.scheduledAt, new Date(new Date().setMonth(new Date().getMonth() - 3))), eq(lessons.status, 'concluida'))).then(res => res[0]),
        
        // Payments (Financeiro)
        permissions.canSeeFinanceiro
          ? db.select().from(paymentDues)
              .where(and(eq(paymentDues.studentId, studentId), eq(paymentDues.organizationId, orgId)))
              .orderBy(desc(paymentDues.dueDate))
              .limit(3)
          : Promise.resolve([]),

        // Latest Messages
        permissions.canSeeMessages !== false
          ? db.select({
              id: chatMessages.id,
              content: chatMessages.content,
              createdAt: chatMessages.createdAt,
              senderName: users.name,
              isMe: sql`${chatMessages.senderId} = ${ctx.user.id}`,
            }).from(chatMessages)
              .leftJoin(users, eq(chatMessages.senderId, users.id))
              .where(and(
                eq(chatMessages.organizationId, orgId),
                sql`(${chatMessages.senderId} = ${ctx.user.id} OR ${chatMessages.receiverId} = ${ctx.user.id})`
              ))
              .orderBy(desc(chatMessages.createdAt))
              .limit(3)
          : Promise.resolve([]),
          
        // Pending Exercises (Goals)
        db.select({
          id: studentGoals.id,
          title: studentGoals.title,
          status: studentGoals.status,
          createdAt: studentGoals.createdAt,
        }).from(studentGoals)
          .where(and(eq(studentGoals.studentId, studentId), eq(studentGoals.organizationId, orgId), eq(studentGoals.status, 'pendente')))
          .orderBy(desc(studentGoals.createdAt))
          .limit(5),

        // Total de materiais (contagem real para o card de métricas)
        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(studentFiles)
          .where(and(eq(studentFiles.studentId, studentId), eq(studentFiles.organizationId, orgId)))
          .then(res => res[0]),

        // Metas recentes (qualquer status) para "Exercícios recentes" / Missões concluídas
        db.select({
          id: studentGoals.id,
          title: studentGoals.title,
          status: studentGoals.status,
          createdAt: studentGoals.createdAt,
          completedAt: studentGoals.completedAt,
        }).from(studentGoals)
          .where(and(eq(studentGoals.studentId, studentId), eq(studentGoals.organizationId, orgId)))
          .orderBy(desc(studentGoals.createdAt))
          .limit(5)
      ]);

      const frequency = statsTotalRecent.count > 0 ? Math.round((statsDoneRecent.count / statsTotalRecent.count) * 100) : 100;

      return {
        upcomingLessons: upcoming,
        recentActivities: timeline,
        announcements: dbAnnouncements.map(a => ({ 
          ...a, 
          date: a.date instanceof Date ? a.date.toLocaleDateString('pt-BR') : a.date 
        })),
        materials,
        payments,
        pendingGoals: pendingGoals,
        materialsCount: totalMaterials.count,
        recentGoals: recentGoals,
        teacherName: teacher?.name || 'Professor',
        teacherId: teacher?.id,
        messages: latestMessages,
        stats: {
          lessonsDone: statsDone.count,
          pendingExercises: statsPending.count,
          unreadAnnouncements: dbAnnouncements.length,
          frequency,
          generalProgress: 85,
          level: student.level || 'iniciante',
        }
      };
    }),
    getAnnouncements: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let studentId = ctx.user.studentId;
      if (!studentId) {
        const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
        if (found) studentId = found.id;
      }
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      const [student] = await db.select({ professorId: students.professorId })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
        .limit(1);
      
      if (!student) throw new Error("Estudante não encontrado.");

      const dbAnnouncements = await db.select({
        id: announcements.id,
        title: announcements.title,
        author: users.name,
        date: announcements.createdAt,
        important: announcements.important,
        content: announcements.content,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.userId, users.id))
      .where(and(
        eq(announcements.organizationId, orgId),
        eq(announcements.userId, student.professorId),
        sql`(${announcements.targetStudentId} IS NULL OR ${announcements.targetStudentId} = ${studentId})`
      ))
      .orderBy(desc(announcements.createdAt))
      .limit(50);
      
      return dbAnnouncements.map(a => ({ 
        ...a, 
        date: a.date instanceof Date ? a.date.toLocaleDateString('pt-BR') : a.date 
      }));
    }),
    getLessons: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      const profUsers = aliasedTable(users, "less_prof_users");
      const creatorUsers = aliasedTable(users, "less_creator_users");
      const profData = aliasedTable(professores, "less_prof_data");
      const creatorData = aliasedTable(professores, "less_creator_data");

      const lessonRows = await db.select({
        id: lessons.id,
        organizationId: lessons.organizationId,
        userId: lessons.userId,
        studentId: lessons.studentId,
        isExperimental: lessons.isExperimental,
        experimentalName: lessons.experimentalName,
        experimentalPhone: lessons.experimentalPhone,
        title: lessons.title,
        description: lessons.description,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        lessonType: lessons.lessonType,
        notes: lessons.notes,
        rating: lessons.rating,
        instrumentId: lessons.instrumentId,
        studioRoomId: lessons.studioRoomId,
        studioRoomName: studioRooms.name,
        studioRoomColor: studioRooms.color,
        teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
        teacherFoto: sql<string | null>`COALESCE(${profData.foto}, ${creatorData.foto})`,
      }).from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
        .leftJoin(profUsers, eq(students.professorId, profUsers.id))
        .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
        .leftJoin(profData, eq(students.professorId, profData.userId))
        .leftJoin(creatorData, eq(lessons.userId, creatorData.userId))
        .where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId)))
        .orderBy(desc(lessons.scheduledAt))
        .limit(50);

      // Buscar o link de reunião online do aluno e sala padrão
      const [studentRow] = await db.select({ 
        onlineMeetingLink: students.onlineMeetingLink, 
        lessonType: students.lessonType,
        studentStudioRoomId: students.studioRoomId
      }).from(students).where(eq(students.id, studentId)).limit(1);

      return lessonRows.map(l => ({ 
        ...l, 
        onlineMeetingLink: studentRow?.onlineMeetingLink || null, 
        studentLessonType: studentRow?.lessonType || 'individual' 
      }));
    }),
    getMaterials: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      return db.select().from(studentFiles).where(and(eq(studentFiles.studentId, studentId), eq(studentFiles.organizationId, orgId))).orderBy(desc(studentFiles.createdAt)).limit(100);
    }),
    markMaterialViewed: studentProcedure.input(z.object({ fileId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      
      let studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      await db.update(studentFiles)
        .set({ viewedAt: new Date() })
        .where(and(
          eq(studentFiles.id, input.fileId),
          eq(studentFiles.organizationId, orgId),
          eq(studentFiles.studentId, studentId)
        ));
      return { success: true };
    }),
    getFileUrl: studentProcedure.input(z.object({ fileId: z.number() })).mutation(async ({ ctx, input }) => {
      // Gera uma URL acessível para o arquivo — necessário porque iframes e players
      // de mídia não enviam o cookie de sessão que protege a rota /uploads direta.
      // Para arquivos externos (Forge/S3) retorna a URL diretamente.
      // Para arquivos locais (/uploads/) verifica existência no disco antes de gerar token.
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      let studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acesso não autorizado" });

      const [file] = await db.select({ id: studentFiles.id, fileUrl: studentFiles.fileUrl, fileName: studentFiles.fileName })
        .from(studentFiles)
        .where(and(
          eq(studentFiles.id, input.fileId),
          eq(studentFiles.organizationId, orgId),
          eq(studentFiles.studentId, studentId)
        ))
        .limit(1);

      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });

      const rawUrl: string = file.fileUrl ?? "";

      // Se for URL externa (http/https e não aponta para /uploads/ local), retorna direto
      const isLocal = rawUrl.startsWith("/uploads/") || rawUrl.match(/https?:\/\/[^/]+\/uploads\//);
      if (!isLocal) {
        return { url: rawUrl, fileNotFound: false };
      }

      // Extrai o caminho relativo dentro de /uploads/
      const relKey = rawUrl.replace(/^https?:\/\/[^/]+\/uploads\//, "").replace(/^\/uploads\//, "");

      // Verifica se o arquivo físico existe no disco antes de gerar o token.
      // Arquivos podem ter sido perdidos se o deploy foi feito sem volume persistente.
      const { existsSync } = await import("fs");
      const { resolve } = await import("path");
      const absPath = resolve(process.cwd(), "uploads", relKey);
      if (!existsSync(absPath)) {
        // Arquivo perdido (ex: rebuild Docker sem volume) — retorna flag para o client exibir mensagem
        return { url: "", fileNotFound: true };
      }

      const token = createFileToken(relKey);
      const fileName = encodeURIComponent(file.fileName ?? relKey.split("/").pop() ?? "arquivo");
      const url = `/uploads-token/${token}/${fileName}`;

      return { url, fileNotFound: false };
    }),
    getExercises: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      return db.select().from(studentGoals).where(and(eq(studentGoals.studentId, studentId), eq(studentGoals.organizationId, orgId))).orderBy(desc(studentGoals.createdAt));
    }),
    getProgress: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      const [timeline, done] = await Promise.all([
        db.select().from(studentTimeline).where(and(eq(studentTimeline.studentId, studentId), eq(studentTimeline.organizationId, orgId))).orderBy(desc(studentTimeline.achievedAt)),
        db.select({ count: sql<number>`CAST(count(*) AS INT)` }).from(lessons).where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId), eq(lessons.status, 'concluida'))).then(res => res[0])
      ]);

      return {
        timeline,
        stats: {
          lessonsDone: done.count,
          averageGrade: 9.2, // Mock
        }
      };
    }),
    getPayments: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const studentId = ctx.user.studentId || (await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1).then(res => res[0]?.id));
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      return db.select().from(paymentDues).where(and(eq(paymentDues.studentId, studentId), eq(paymentDues.organizationId, orgId))).orderBy(desc(paymentDues.dueDate));
    }),
    getMessages: studentProcedure.input(z.object({ withUserId: z.number() })).query(async ({ ctx, input }) => {
       const db = await getDb();
       if (!db) throw new Error("Database not available");

       let studentId = ctx.user.studentId;
       let [student] = studentId ? await db.select({ permissions: students.permissions }).from(students).where(eq(students.id, studentId)).limit(1) : [null];
       if (!student) {
         [student] = await db.select({ permissions: students.permissions }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
       }

       if (student?.permissions) {
         try {
           const parsed = JSON.parse(student.permissions);
           if (parsed.canSeeMessages === false) return [];
         } catch (e) {
           console.error("Error parsing student permissions in getMessages:", e);
         }
       }

       const orgId = ctx.user.organizationId!;
       return db.select({
         id: chatMessages.id,
         senderId: chatMessages.senderId,
         content: chatMessages.content,
         createdAt: chatMessages.createdAt,
         isMe: sql`${chatMessages.senderId} = ${ctx.user.id}`,
       }).from(chatMessages)
         .where(and(
           eq(chatMessages.organizationId, orgId),
           or(
             and(eq(chatMessages.senderId, ctx.user.id), eq(chatMessages.receiverId, input.withUserId)),
             and(eq(chatMessages.senderId, input.withUserId), eq(chatMessages.receiverId, ctx.user.id))
           )
         ))
         .orderBy(asc(chatMessages.createdAt));
    }),
    sendMessage: studentProcedure.input(z.object({ receiverId: z.number(), content: z.string() })).mutation(async ({ ctx, input }) => {
       const db = await getDb();
       if (!db) throw new Error("Database not available");

       let studentId = ctx.user.studentId;
       let [student] = studentId ? await db.select({ permissions: students.permissions }).from(students).where(eq(students.id, studentId)).limit(1) : [null];
       if (!student) {
         [student] = await db.select({ permissions: students.permissions }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
       }

       if (student?.permissions) {
         try {
           const parsed = JSON.parse(student.permissions);
           if (parsed.canSeeMessages === false) {
             throw new TRPCError({
               code: 'FORBIDDEN',
               message: 'Você não tem permissão para enviar mensagens.'
             });
           }
         } catch (e) {
           console.error("Error parsing student permissions in sendMessage:", e);
           if (e instanceof TRPCError) throw e;
         }
       }

       const orgId = ctx.user.organizationId!;
       await db.insert(chatMessages).values({
         organizationId: orgId,
         senderId: ctx.user.id,
         receiverId: input.receiverId,
         content: input.content,
       });
       return { success: true };
    }),
    getProfile: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let studentId = ctx.user.studentId;
      let [student] = studentId ? await db.select({
        id: students.id,
        name: students.name,
        email: students.email,
        phone: students.phone,
        level: students.level,
        instrumentId: students.instrumentId,
        teacherId: students.professorId,
        startDate: students.startDate,
        birthDate: students.birthDate,
        address: students.address,
        guardianName: students.guardianName,
        guardianPhone: students.guardianPhone,
        permissions: students.permissions,
        organizationId: students.organizationId,
        avatar: students.avatar,
      }).from(students).where(eq(students.id, studentId)).limit(1) : [null];

      if (!student) {
        [student] = await db.select({
          id: students.id,
          name: students.name,
          email: students.email,
          phone: students.phone,
          level: students.level,
          instrumentId: students.instrumentId,
          teacherId: students.professorId,
          startDate: students.startDate,
          birthDate: students.birthDate,
          address: students.address,
          guardianName: students.guardianName,
          guardianPhone: students.guardianPhone,
          permissions: students.permissions,
          organizationId: students.organizationId,
          avatar: students.avatar,
        }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
      }
      
      if (!student) throw new Error("Dados do aluno não encontrados.");
      
      const [teacher] = await db.select({ 
        name: users.name,
        organizationId: users.organizationId
      })
      .from(users)
      .where(eq(users.id, student.teacherId))
      .limit(1);

      const resolvedOrgId = student.organizationId || teacher?.organizationId;

      const [[instrument], [orgSettings], [nextGoal]] = await Promise.all([
        student.instrumentId 
          ? db.select({ name: instruments.name })
              .from(instruments)
              .where(eq(instruments.id, student.instrumentId))
              .limit(1)
          : Promise.resolve([{ name: null }]),
          
        resolvedOrgId
          ? db.select({ pixKey: settings.pixKey, schoolPhone: settings.schoolPhone, paymentGateway: settings.paymentGateway, infinitepayHandle: settings.infinitepayHandle, infinitepayEnabled: settings.infinitepayEnabled })
              .from(settings)
              .innerJoin(users, eq(users.id, settings.userId))
              .where(
                and(
                  eq(settings.organizationId, resolvedOrgId),
                  eq(users.role, "admin")
                )
              )
              .orderBy(desc(settings.updatedAt))
              .limit(1)
          : Promise.resolve([{ pixKey: null, schoolPhone: null, paymentGateway: "asaas", infinitepayHandle: null, infinitepayEnabled: 0 }]),
          
        db.select({ title: studentGoals.title })
          .from(studentGoals)
          .where(
            and(
              eq(studentGoals.studentId, student.id),
              eq(studentGoals.status, 'pendente')
            )
          )
          .orderBy(asc(studentGoals.targetDate))
          .limit(1)
      ]);
      
      let parsedPermissions = {
        canSeeFinanceiro: true,
        canSeeProgress: true,
        canSeeFiles: true,
        canSeeSchedule: true,
        canSeeMessages: true,
      };

      if (student.permissions) {
        try {
          const parsed = JSON.parse(student.permissions);
          parsedPermissions = { ...parsedPermissions, ...parsed };
        } catch (e) {
          console.error("[studentPortal] Error parsing permissions for student profile", student.id, e);
        }
      }
      
      return { 
        ...student, 
        permissions: parsedPermissions,
        teacherName: teacher?.name || 'Professor',
        teacherPixKey: orgSettings?.pixKey,
        schoolPhone: orgSettings?.schoolPhone,
        paymentGateway: orgSettings?.paymentGateway || 'asaas',
        instrumentName: instrument?.name || 'Não definido',
        nextGoal: nextGoal?.title || null
      };
    }),
    generatePaymentLink: studentProcedure
      .input(z.object({
        paymentDueId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const orgId = ctx.user.organizationId!;

        const [settingsData] = await db.select({
          mpAccessToken: settings.mpAccessToken,
          paymentGateway: settings.paymentGateway,
          infinitepayHandle: settings.infinitepayHandle,
          infinitepayApiKey: settings.infinitepayApiKey,
          infinitepayEnabled: settings.infinitepayEnabled,
        })
        .from(settings)
        .innerJoin(users, eq(users.id, settings.userId))
        .where(
          and(
            eq(settings.organizationId, orgId),
            eq(users.role, "admin")
          )
        )
        .orderBy(desc(settings.updatedAt))
        .limit(1);

        if (!settingsData) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Geração de link de pagamento não está configurada." });
        }

        // Validar permissão do aluno para essa mensalidade
        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Acesso não autorizado" });

        const [due] = await db.select().from(paymentDues)
          .where(and(eq(paymentDues.id, input.paymentDueId), eq(paymentDues.studentId, studentId)))
          .limit(1);

        if (!due) throw new TRPCError({ code: "NOT_FOUND", message: "Mensalidade não encontrada" });

        const [student] = await db.select().from(students)
          .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
          .limit(1);

        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

        // ── InfinitePay: link de checkout hospedado on-the-fly ──
        if (settingsData.paymentGateway === 'infinitepay') {
          if (settingsData.infinitepayEnabled !== 1 || !settingsData.infinitepayHandle) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Geração via InfinitePay não está configurada." });
          }
          if (due.infinitepayPaymentLink) return { paymentLink: due.infinitepayPaymentLink }; // Já existe

          const { createInfinitePayLink, buildInfinitePayWebhookUrl, brlToCents, resolveInfinitePayApiKey } = await import('../utils/infinitepay');
          const { createPaymentShortLink } = await import('../utils/shortlinks');
          const ipLink = await createInfinitePayLink({
            handle: settingsData.infinitepayHandle,
            orderNsu: String(due.id),
            items: [{
              quantity: 1,
              price: brlToCents(due.amount),
              description: `Mensalidade ${due.month}/${due.year} - ${student.name}`,
            }],
            redirectUrl: `${ENV.appUrl || 'https://wrmusicpro.com.br'}/painel/mensalidades`,
            webhookUrl: buildInfinitePayWebhookUrl(due.id),
            apiKey: resolveInfinitePayApiKey(settingsData.infinitepayApiKey),
            customer: {
              name: student.name,
              email: student.email || undefined,
              phone: student.phone || undefined,
            },
          });

          const shareUrl = await createPaymentShortLink(db, {
            targetUrl: ipLink.url,
            organizationId: orgId,
            paymentDueId: due.id,
          });

          await db.update(paymentDues)
            .set({
              infinitepayPaymentLink: shareUrl,
              infinitepaySlug: ipLink.slug,
              updatedAt: new Date(),
            })
            .where(eq(paymentDues.id, input.paymentDueId));

          return { paymentLink: shareUrl };
        }

        // ── Mercado Pago (padrão) ──
        if (settingsData.paymentGateway !== 'mercadopago' || !settingsData.mpAccessToken) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Geração via Mercado Pago não está configurada." });
        }

        // BUG FIX: decifrar o token (select cru traz v1:...) antes de usar na API do MP
        const accessToken = decryptSecret(settingsData.mpAccessToken);

        if (due.mpPaymentLink) return { paymentLink: due.mpPaymentLink }; // Já existe

        const { createMPPreference } = await import('../utils/mercadopago');
        const pref = await createMPPreference({
          items: [{
            title: `Mensalidade ${due.month}/${due.year} - ${student.name}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number(due.amount)
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

        return { paymentLink: pref.init_point };
      }),
    getSchedule: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let studentId = ctx.user.studentId;
      if (!studentId) {
        const [found] = await db.select({ id: students.id, permissions: students.permissions }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
        if (found) {
          if (found.permissions) {
            const perms = JSON.parse(found.permissions);
            if (perms.canSeeSchedule === false) return [];
          }
          studentId = found.id;
        }
      } else {
        const [found] = await db.select({ permissions: students.permissions }).from(students).where(eq(students.id, studentId)).limit(1);
        if (found?.permissions) {
          const perms = JSON.parse(found.permissions);
          if (perms.canSeeSchedule === false) return [];
        }
      }
      if (!studentId) throw new Error("Acesso não autorizado");

      const orgId = ctx.user.organizationId!;
      const profUsers = aliasedTable(users, "sched_prof_users");
      const creatorUsers = aliasedTable(users, "sched_creator_users");
      const profData = aliasedTable(professores, "sched_prof_data");
      const creatorData = aliasedTable(professores, "sched_creator_data");

      return db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        duration: lessons.duration,
        status: lessons.status,
        notes: lessons.notes,
        lessonType: lessons.lessonType,
        studioRoomId: lessons.studioRoomId,
        studioRoomName: studioRooms.name,
        studioRoomColor: studioRooms.color,
        teacherName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
        teacherFoto: sql<string | null>`COALESCE(${profData.foto}, ${creatorData.foto})`,
      }).from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .leftJoin(studioRooms, eq(lessons.studioRoomId, studioRooms.id))
        .leftJoin(profUsers, eq(students.professorId, profUsers.id))
        .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
        .leftJoin(profData, eq(students.professorId, profData.userId))
        .leftJoin(creatorData, eq(lessons.userId, creatorData.userId))
        .where(and(eq(lessons.studentId, studentId), eq(lessons.organizationId, orgId)))
        .orderBy(asc(lessons.scheduledAt))
        .limit(100);
    }),
    updateProfile: studentProcedure
      .input(z.object({
        phone: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new Error("Acesso não autorizado");

        await db.update(students).set({ phone: input.phone, email: input.email }).where(eq(students.id, studentId));

        const userUpdates: any = {};
        if (input.email) userUpdates.email = input.email;
        if (input.password) {
           const salt = crypto.randomBytes(16).toString('hex');
           const derivedKey = crypto.scryptSync(input.password, salt, 64).toString('hex');
           userUpdates.passwordHash = salt + ':' + derivedKey;
        }

        if (Object.keys(userUpdates).length > 0) {
          await db.update(users).set(userUpdates).where(eq(users.id, ctx.user.id));
        }

        return { success: true };
      }),

    // Upload de avatar pelo PRÓPRIO aluno (foto de perfil do portal)
    updateMyAvatar: studentProcedure
      .input(z.object({
        avatar: z.string().min(10).max(3_000_000), // data URL (JPEG comprimido no client)
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new Error("Acesso não autorizado");

        await db.update(students).set({ avatar: input.avatar, updatedAt: new Date() }).where(eq(students.id, studentId));

        return { success: true };
      }),

    getTeacherSchedule: studentProcedure
      .input(z.object({ lessonId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        // Find lesson
        const [lesson] = await db.select().from(lessons).where(and(eq(lessons.id, input.lessonId), eq(lessons.organizationId, orgId))).limit(1);
        if (!lesson) throw new Error("Lesson not found");

        // AGENDA FIX: professor EFETIVO — aulas criadas pelo admin têm userId do
        // admin; os horários de funcionamento e a agenda ocupada devem vir do
        // professor real do aluno (students.professorId), não do criador.
        let teacherId = lesson.userId;
        if (lesson.studentId) {
          const [st] = await db.select({ professorId: students.professorId }).from(students)
            .where(eq(students.id, lesson.studentId)).limit(1);
          if (st?.professorId) teacherId = st.professorId;
        }

        const settingsSelect = {
          schoolHours: settings.schoolHours,
          schoolPhone: settings.schoolPhone,
          phone: settings.phone,
        };
        // Settings do professor efetivo — fallback para o criador da aula
        let [teacherSettings] = await db.select(settingsSelect).from(settings).where(eq(settings.userId, teacherId)).limit(1);
        if (!teacherSettings && teacherId !== lesson.userId) {
          [teacherSettings] = await db.select(settingsSelect).from(settings).where(eq(settings.userId, lesson.userId)).limit(1);
        }

        const schoolHoursRaw = teacherSettings?.schoolHours || '{}';
        let parsedHours: Record<string, any> = {};
        try { parsedHours = JSON.parse(schoolHoursRaw); } catch(e) {}

        // AGENDA FIX (§remarcação): escola sem "Horário de Funcionamento" salvo
        // deixava o modal do aluno sem NENHUM dia disponível — remarcação morta.
        // Fallback seguro: oferecer o horário atual da aula (a escola comprovadamente
        // atende nesse slot) no mesmo dia da semana, nos próximos 14 dias.
        const hasActiveDay = Object.values(parsedHours).some((d: any) => d?.active);
        if (!hasActiveDay && lesson.scheduledAt) {
          const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const lessonDate = new Date(lesson.scheduledAt);
          // Horário da aula no fuso de Brasília (padrão do sistema)
          const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
          const [hh, mm] = fmt.format(lessonDate).split(':');
          const startMin = (Number(hh) * 60) + Number(mm);
          const durationMin = lesson.duration || 60;
          const endMin = Math.min(startMin + durationMin + 30, 23 * 60 + 30);
          const pad = (n: number) => String(n).padStart(2, '0');
          const toHM = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
          for (const day of DAY_NAMES) {
            parsedHours[day] = {
              active: day === DAY_NAMES[lessonDate.getDay()],
              start: toHM(startMin),
              end: toHM(endMin),
            };
          }
        }

        // Get future booked slots for the effective teacher — inclui aulas criadas
        // por admin para alunos deste professor (antes: apenas lessons.userId).
        // Exclui a própria aula em remarcação.
        const futureLessons = await db.select({ scheduledAt: lessons.scheduledAt, duration: lessons.duration })
          .from(lessons)
          .leftJoin(students, eq(lessons.studentId, students.id))
          .where(and(
            eq(lessons.organizationId, orgId),
            eq(lessons.status, 'agendada'),
            ne(lessons.id, input.lessonId),
            or(eq(lessons.userId, teacherId), eq(students.professorId, teacherId)),
            sql`${lessons.scheduledAt} > NOW()`,
            sql`${lessons.scheduledAt} < NOW() + INTERVAL '30 days'`
          ));

        return {
          schoolHours: parsedHours,
          bookedSlots: futureLessons.map(l => ({ scheduledAt: l.scheduledAt.toISOString(), duration: l.duration })),
          teacherPhone: teacherSettings?.schoolPhone || teacherSettings?.phone || '',
          lessonDuration: lesson.duration || 60
        };
      }),

    /**
     * PRD_AULA_EXTRA (RF-002): horários livres do professor EFETIVO do aluno,
     * sem depender de uma aula origem (ao contrário de getTeacherSchedule).
     * Fallback quando a escola não tem horários configurados: hasConfiguredHours=false
     * e o client oferece preferência em texto livre.
     */
    getExtraLessonSchedule: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      let studentId = ctx.user.studentId;
      if (!studentId) {
        const [found] = await db.select({ id: students.id }).from(students)
          .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId)))
          .limit(1);
        if (found) studentId = found.id;
      }
      if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil de aluno incompleto." });

      const [student] = await db.select({ professorId: students.professorId }).from(students)
        .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
        .limit(1);

      const teacherId = student?.professorId ?? ctx.user.id;
      const settingsSelect = { schoolHours: settings.schoolHours };
      const [teacherSettings] = await db.select(settingsSelect).from(settings).where(eq(settings.userId, teacherId)).limit(1);

      let parsedHours: Record<string, any> = {};
      try { parsedHours = JSON.parse(teacherSettings?.schoolHours || '{}'); } catch(e) {}
      const hasConfiguredHours = Object.values(parsedHours).some((d: any) => d?.active);

      // Aulas agendadas futuras do professor (diretas ou de seus alunos)
      const futureLessons = await db.select({ scheduledAt: lessons.scheduledAt, duration: lessons.duration })
        .from(lessons)
        .leftJoin(students, eq(lessons.studentId, students.id))
        .where(and(
          eq(lessons.organizationId, orgId),
          eq(lessons.status, 'agendada'),
          or(eq(lessons.userId, teacherId), eq(students.professorId, teacherId)),
          sql`${lessons.scheduledAt} > NOW()`,
          sql`${lessons.scheduledAt} < NOW() + INTERVAL '30 days'`
        ));

      return {
        schoolHours: parsedHours,
        hasConfiguredHours,
        bookedSlots: futureLessons.map(l => ({ scheduledAt: l.scheduledAt.toISOString(), duration: l.duration })),
        lessonDuration: 60,
      };
    }),

    /**
     * PRD_AULA_EXTRA (RF-001): aluno solicita aula extra. RN-001: apenas 1 pendente
     * por aluno. Notifica o professor efetivo (fallback: admins da organização).
     */
    requestExtraLesson: studentProcedure
      .input(z.object({
        preferredDates: z.string().min(3, "Informe suas preferências de data/horário.").max(300),
        reason: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students)
            .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId)))
            .limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil de aluno incompleto." });

        const [student] = await db.select({ id: students.id, name: students.name, professorId: students.professorId, studentUserId: students.studentUserId })
          .from(students)
          .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
          .limit(1);
        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });

        // RN-001 (anti-spam): apenas 1 solicitação pendente por aluno
        const [pending] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
          .from(extraLessonRequests)
          .where(and(eq(extraLessonRequests.studentId, studentId), eq(extraLessonRequests.status, 'pendente')));
        if (pending.count > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Você já tem uma solicitação de aula extra pendente. Aguarde a resposta do professor." });
        }

        await db.insert(extraLessonRequests).values({
          organizationId: orgId,
          studentId,
          preferredDates: input.preferredDates,
          reason: input.reason ?? null,
          status: 'pendente',
        });

        const studentName = student.name || "Seu aluno";
        const title = "Solicitação de Aula Extra";
        const message = `${studentName} solicitou uma aula extra. Preferências: ${input.preferredDates}`;

        // RN-003: professor efetivo; sem vínculo → admins da organização
        let recipients: number[] = [];
        if (student.professorId) {
          recipients = [student.professorId];
        } else {
          const admins = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.organizationId, orgId), eq(users.role, 'admin')))
            .limit(5);
          recipients = admins.map(a => a.id);
        }

        for (const recipientId of recipients) {
          await db.insert(notifications).values({
            organizationId: orgId,
            userId: recipientId,
            title,
            message,
            type: "warning",
            actionUrl: "/solicitacoes",
          });
          // Push não bloqueia a criação em caso de falha
          notifyUser(recipientId, { title, content: message, url: "/solicitacoes" }).catch(e => console.error("Falha ao enviar push de aula extra:", e));
        }

        return { success: true };
      }),

    autoReschedule: studentProcedure
      .input(z.object({
        lessonId: z.number(),
        newDateIso: z.string(), // e.g. "2024-05-10T14:00:00.000Z"
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        
        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new Error("Acesso não autorizado");

        const [lesson] = await db.select().from(lessons).where(and(eq(lessons.id, input.lessonId), eq(lessons.studentId, studentId))).limit(1);
        if (!lesson) throw new Error("Aula não encontrada ou não pertence a você");

        const newDateObj = new Date(input.newDateIso);

        // AGENDA FIX: o servidor passa a validar de verdade (o client só faz UX):
        // 1) horário deve ser futuro; 2) sem conflito de professor efetivo ou sala.
        if (isNaN(newDateObj.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Data inválida para remarcação." });
        }
        if (newDateObj.getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma data e horário no futuro para remarcar sua aula." });
        }

        const duration = lesson.duration || 60;
        const endsAt = new Date(newDateObj.getTime() + duration * 60000);
        const startOfDay = new Date(newDateObj);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(newDateObj);
        endOfDay.setHours(23, 59, 59, 999);

        // Professor efetivo: criador OU professor do aluno
        let studentProfessorId: number | null = null;
        if (lesson.studentId) {
          const [st] = await db.select({ professorId: students.professorId }).from(students).where(eq(students.id, lesson.studentId)).limit(1);
          studentProfessorId = st?.professorId ?? null;
        }
        const lessonTeacherIds = new Set<number>([lesson.userId, studentProfessorId].filter(Boolean) as number[]);

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
            ne(lessons.id, lesson.id),
            gte(lessons.scheduledAt, startOfDay),
            lte(lessons.scheduledAt, endOfDay)
          ));

        for (const existing of existingLessons) {
          const exStart = new Date(existing.scheduledAt);
          const exEnd = new Date(exStart.getTime() + (existing.duration || 60) * 60000);
          if (exStart < endsAt && exEnd > newDateObj) {
            const existingTeacherIds = new Set<number>([existing.userId, existing.studentProfessorId].filter(Boolean) as number[]);
            const sharesTeacher = Array.from(lessonTeacherIds).some((t) => existingTeacherIds.has(t));
            if (sharesTeacher && (lesson.lessonType === 'individual' || existing.lessonType === 'individual')) {
              throw new TRPCError({ code: "CONFLICT", message: "Este horário acabou de ser ocupado por outra aula. Escolha um horário livre." });
            }
            if (lesson.studioRoomId && existing.studioRoomId === lesson.studioRoomId) {
              throw new TRPCError({ code: "CONFLICT", message: "A sala já está ocupada neste horário. Escolha outro horário." });
            }
          }
        }

        // LEMBRETE FIX: cancelar lembretes pendentes da data antiga — antes a
        // remarcação pelo portal deixava lembretes pendentes para o horário antigo
        // (o aluno continuava recebendo lembrete do horário errado).
        if (new Date(lesson.scheduledAt).getTime() !== newDateObj.getTime()) {
          await db.update(reminders)
            .set({ status: 'cancelado', cancelledAt: new Date(), updatedAt: new Date() })
            .where(and(
              eq(reminders.lessonId, input.lessonId),
              eq(reminders.status, 'pendente')
            ));
        }

        // Update the lesson date
        await db.update(lessons)
          .set({ scheduledAt: newDateObj, status: "agendada" })
          .where(eq(lessons.id, input.lessonId));

        const formatter = new Intl.DateTimeFormat('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const formattedDate = formatter.format(newDateObj);

        // Create a notification for the teacher
        const [studentData] = await db.select({ name: students.name }).from(students).where(eq(students.id, studentId)).limit(1);
        await db.insert(notifications).values({
          organizationId: orgId,
          userId: lesson.userId,
          title: "Aula Reagendada pelo Robô",
          message: `O aluno ${studentData?.name || 'desconhecido'} reagendou a aula "${lesson.title}" para ${formattedDate}.`,
          type: "INFO",
          read: false,
        });

        // Send Push Notification (FCM / Web Push) to Teacher's devices (async)
        notifyUser(lesson.userId, {
          title: "Aula Reagendada 🔄",
          content: `O aluno ${studentData?.name || 'desconhecido'} reagendou a aula "${lesson.title}" para ${formattedDate}.`
        }).catch(err => console.error("Erro no push de reagendamento:", err));

        // WhatsApp Notification to the Teacher (async)
        (async () => {
          try {
            const [orgSettings] = await db.select({
              whatsappBotUrl: settings.whatsappBotUrl,
              whatsappBotToken: settings.whatsappBotToken
            })
            .from(settings)
            .innerJoin(users, eq(users.id, settings.userId))
            .where(and(eq(users.organizationId, orgId), eq(users.role, "admin")))
            .limit(1);

            const [teacherProf] = await db.select({ telefone: professores.telefone })
              .from(professores)
              .where(eq(professores.userId, lesson.userId))
              .limit(1);

            if (orgSettings?.whatsappBotUrl && teacherProf?.telefone) {
              const { sendWhatsAppMessage } = await import("../utils/whatsapp");

              await sendWhatsAppMessage({
                url: orgSettings.whatsappBotUrl,
                token: orgSettings.whatsappBotToken || "",
                phone: teacherProf.telefone,
                message: `🔄 *AULA REAGENDADA*\n\nOlá! O aluno *${studentData?.name || 'desconhecido'}* acabou de reagendar a aula pelo Portal do Aluno.\n\n📚 *Aula:* ${lesson.title}\n📅 *Nova Data/Hora:* ${formattedDate}`
              });
            }
          } catch (e) {
            console.error("Erro ao enviar whatsapp para professor no reagendamento", e);
          }
        })();

        return { success: true, message: "Aula reagendada com sucesso!" };
      }),
    verifyAndConfirmPayment: studentProcedure
      .input(z.object({
        paymentDueId: z.number(),
        fileData: z.string(),
        fileName: z.string(),
        fileType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        const orgId = ctx.user.organizationId!;

        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new Error("Acesso não autorizado");

        const [payment] = await db.select()
          .from(paymentDues)
          .where(and(
            eq(paymentDues.id, input.paymentDueId),
            eq(paymentDues.studentId, studentId),
            eq(paymentDues.organizationId, orgId)
          ))
          .limit(1);

        if (!payment) throw new Error("Mensalidade não encontrada.");
        if (payment.status === 'pago') throw new Error("Esta mensalidade já está paga.");

        const [student] = await db.select()
          .from(students)
          .where(eq(students.id, studentId))
          .limit(1);

        const [teacher] = await db.select({
          name: users.name,
          pixKey: settings.pixKey,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel
        })
        .from(users)
        .leftJoin(settings, eq(users.id, settings.userId))
        .where(eq(users.id, student.professorId))
        .limit(1);

        // Upload receipt to local storage
        const base64Content = input.fileData.includes(',') ? input.fileData.split(',')[1] : input.fileData;
        const buffer = Buffer.from(base64Content, 'base64');
        const ext = input.fileName.split('.').pop() || 'dat';
        const storageKey = `receipts/org_${orgId}/user_${ctx.user.id}/pay_${input.paymentDueId}_${nanoid(6)}.${ext}`;
        
        const { url: receiptUrl } = await storagePut(storageKey, buffer, input.fileType);

        // AI Validation
        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const apiKeyToUse = teacher?.geminiApiKey || process.env.GEMINI_API_KEY;
          if (!apiKeyToUse) throw new Error("Chave Gemini não configurada");
          const localGenAI = new GoogleGenerativeAI(apiKeyToUse);
          const model = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const systemPrompt = `Você é um robô de inteligência artificial especializado em análise de comprovantes de pagamento (principalmente PIX) para uma escola de música.
Sua tarefa é analisar a imagem do comprovante enviada pelo aluno e verificar se ela é válida para a mensalidade esperada.

Dados da mensalidade esperada:
- Nome do Aluno: ${student?.name || 'Não especificado'}
- Valor Esperado: R$ ${Number(payment.amount).toFixed(2)}
- Mês de Referência: ${payment.month}/${payment.year}
- Chave PIX / Nome do Recebedor (Professor): ${teacher?.pixKey || 'Não especificada'} / ${teacher?.name || 'Não especificado'}

Instruções de análise:
1. Verifique se a imagem é realmente um comprovante de pagamento válido (PIX, transferência bancária ou boleto pago). Se for uma imagem irrelevante ou inválida, marque "isValidReceipt" como false.
2. Extraia o valor pago encontrado no comprovante.
3. Extraia a data do pagamento.
4. Verifique se o valor pago é compatível com o valor esperado (permita variações muito pequenas, mas idealmente deve bater).
5. Retorne estritamente um objeto JSON com o seguinte formato exato (sem formatação markdown):
{
  "isValidReceipt": true/false,
  "amountPaid": 200.00,
  "paymentDate": "YYYY-MM-DD",
  "confidenceScore": 0.95,
  "reason": "Motivo resumido em português explicando a validação ou recusa"
}`;

          const result = await model.generateContent({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  { inlineData: { data: base64Content, mimeType: input.fileType } }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          });

          let aiResponseText = result.response.text();
          if (aiResponseText.includes("\`\`\`")) {
            aiResponseText = aiResponseText.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
          }

          const analysis = JSON.parse(aiResponseText);

          if (!analysis.isValidReceipt) {
            return {
              success: false,
              verified: false,
              reason: analysis.reason || "O comprovante não pôde ser validado."
            };
          }

          // Confirma o pagamento no banco de dados
          await db.update(paymentDues)
            .set({ 
              status: 'pago',
              paidAt: new Date(),
              receiptUrl: receiptUrl,
              updatedAt: new Date()
            })
            .where(eq(paymentDues.id, payment.id));

          const valor = Number(payment.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          await notifyUser(student.professorId, {
            title: "Pagamento Confirmado",
            content: `O aluno ${student.name || "Aluno"} pagou a mensalidade de ${valor} via PIX (validado por IA).`,
          });

          return {
            success: true,
            verified: true,
            amountPaid: analysis.amountPaid,
            reason: analysis.reason || "Comprovante validado com sucesso!"
          };
        } catch (error: any) {
          console.error("[verifyAndConfirmPayment] Erro na análise do Gemini:", error);
          throw new Error("Ocorreu um erro ao analisar o comprovante com a IA. Tente novamente mais tarde.");
        }
      }),
    completeExercise: studentProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        
        let studentId = ctx.user.studentId;
        if (!studentId) {
          const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
          if (found) studentId = found.id;
        }
        if (!studentId) throw new Error("Acesso não autorizado");

        const [exercise] = await db.select({
          id: studentGoals.id,
          title: studentGoals.title,
          userId: studentGoals.userId,
          studentName: students.name,
        })
        .from(studentGoals)
        .leftJoin(students, eq(studentGoals.studentId, students.id))
        .where(and(eq(studentGoals.id, input.id), eq(studentGoals.studentId, studentId), eq(studentGoals.organizationId, orgId)))
        .limit(1);

        if (!exercise) throw new Error("Exercício não encontrado.");

        await db.update(studentGoals)
          .set({ status: "concluida", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(studentGoals.id, input.id));

        // Notify the professor (exercise.userId)
        await notifyUser(exercise.userId, {
          title: "Exercício Concluído",
          content: `O aluno ${exercise.studentName || "Aluno"} concluiu a atividade "${exercise.title}".`
        });

        return { success: true };
      }),

    // Retorna o contato do professor responsável pelo aluno (para o botão "Falar com o professor")
    getProfessorContact: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let studentId = ctx.user.studentId;
      if (!studentId) {
        const [found] = await db.select({ id: students.id }).from(students).where(eq(students.studentUserId, ctx.user.id)).limit(1);
        if (found) studentId = found.id;
      }
      if (!studentId) throw new Error("Perfil de aluno não encontrado.");

      // Busca o professor do aluno
      const [student] = await db.select({ professorId: students.professorId })
        .from(students).where(eq(students.id, studentId)).limit(1);
      if (!student) throw new Error("Aluno não encontrado.");

      // Busca o nome do professor
      const [professor] = await db.select({ name: users.name })
        .from(users).where(eq(users.id, student.professorId)).limit(1);

      // Busca o telefone do professor nas configurações (tabela settings)
      const [professorSettings] = await db.select({ phone: settings.phone })
        .from(settings).where(eq(settings.userId, student.professorId)).limit(1);

      return {
        name: professor?.name || null,
        phone: professorSettings?.phone || null,
      };
    }),

    // Gera uma explicação detalhada de um exercício do plano de estudos via IA
    getExerciseDetails: studentProcedure.input(z.object({
      exerciseTitle: z.string(),
      exerciseSubtitle: z.string().optional(),
      exercisePoints: z.array(z.string()).optional(),
      instrument: z.string().optional(),
      dayFocus: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [student] = await db.select({ professorId: students.professorId, name: students.name }).from(students).where(eq(students.id, ctx.user.studentId!));

        // FIX: extrair o primeiro nome do aluno (era usado no prompt mas nunca definido → ReferenceError)
        const firstName = (student?.name || "Aluno").trim().split(" ")[0];
        
        const instrument = input.instrument || "seu instrumento";
        const dayFocus = input.dayFocus || "evoluir a prática do dia";
        const exerciseSubtitle = input.exerciseSubtitle || "Instruções do exercício";
        const exercisePoints = input.exercisePoints && input.exercisePoints.length > 0 ? input.exercisePoints.join(", ") : "Execução prática com atenção aos detalhes";

        const prompt = buildExerciseExplanationPrompt({
          firstName,
          instrument,
          dayFocus,
          exerciseTitle: input.exerciseTitle,
          exerciseSubtitle,
          exercisePoints,
        });

        const { getSettingsByUserId } = await import("../db");
        const settingsData = await getSettingsByUserId(ctx.user.organizationId!, student?.professorId || ctx.user.id);

        const { callGemini } = await import("../utils/gemini");
        // RF-002 (PRD): resolução unificada (suporta gemini|groq|opencode)
        const creds = resolveAiCredentials(settingsData);
        const explanation = await callGemini([{ role: "user", content: prompt }], undefined, false, creds.apiKey, creds.model, 0.4, {
          organizationId: ctx.user.organizationId,
          userId: ctx.user.id,
          feature: "explicacao_exercicio",
          promptVersion: AI_PROMPT_VERSIONS.explicacaoExercicio,
        });
        return { explanation };
      } catch (e: any) {
        throw new Error("Não foi possível gerar a explicação: " + e.message);
      }
    }),
  }),

  // ─── AI ASSISTANT (Gemini) ──────────────────────────────────────────────────────────

  // ─── Helpers de validação de mensagens da IA ───────────────────────────────────────
  // Verificações feitas ANTES de enviar ao Gemini, no endpoint ai.chat

  /**
   * Verifica se a mensagem é válida para ser enviada à IA.
   * Retorna null se válida, ou uma string de erro se inválida.
   */

  fileComments: router({
    list: protectedProcedure.input(z.object({ fileId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      return db.select({
        id: fileComments.id,
        content: fileComments.content,
        createdAt: fileComments.createdAt,
        userId: fileComments.userId,
        userName: users.name,
      })
      .from(fileComments)
      .leftJoin(users, eq(users.id, fileComments.userId))
      .where(and(
        eq(fileComments.organizationId, orgId),
        eq(fileComments.fileId, input.fileId)
      ))
      .orderBy(asc(fileComments.createdAt));
    }),
    create: protectedProcedure.input(z.object({ fileId: z.number(), content: z.string() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      // AUDIT-P1 FIX (IDOR): validar que o arquivo comentado pertence à organização
      const [ownedFile] = await db.select({ id: studentFiles.id })
        .from(studentFiles)
        .where(and(eq(studentFiles.id, input.fileId), eq(studentFiles.organizationId, orgId)))
        .limit(1);
      if (!ownedFile) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo não encontrado nesta escola." });
      }

      const [newComment] = await db.insert(fileComments).values({
        organizationId: orgId,
        fileId: input.fileId,
        userId: ctx.user.id,
        content: input.content,
        createdAt: new Date(),
      }).returning();
      
      return newComment;
    }),
  }),

};
