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
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, schoolPlans, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs } from "../../drizzle/schema";
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
import { decryptSecret } from "../utils/integrationCrypto";
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
export const studentsRouters = {
  students: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      return getStudentsWithInstrument(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id);
    }),
    recent: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      return getStudentsWithInstrument(ctx.user.organizationId!, isUserAdmin ? undefined : ctx.user.id, 8);
    }),
    getForEdit: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      debugLog(`[TRPC] students.getForEdit called for ID: ${input.id} by user: ${ctx.user.id}`);
      const db = await getDb();
      if (!db) {
        console.error("[TRPC] students.getForEdit: Database not available");
        return null;
      }

      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const [student] = await db.select({
        id: students.id,
        name: students.name,
        socialName: students.socialName,
        birthDate: students.birthDate,
        gender: students.gender,
        cpf: students.cpf,
        rg: students.rg,
        address: students.address,
        guardianName: students.guardianName,
        guardianPhone: students.guardianPhone,
        guardianEmail: students.guardianEmail,
        instrumentId: students.instrumentId,
        email: students.email,
        phone: students.phone,
        level: students.level,
        status: students.status,
        monthlyFee: students.monthlyFee,
        billingPeriodicity: students.billingPeriodicity,
        dueDay: students.dueDay,
        schoolPlanId: students.schoolPlanId,
        lessonType: students.lessonType,
        notes: students.notes,
        startDate: students.startDate,
        professorId: students.professorId,
        allowAutoReminders: students.allowAutoReminders,
        studioRoomId: students.studioRoomId,
      }).from(students)
        .where(and(
          eq(students.id, input.id), 
          eq(students.organizationId, orgId),
          isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ))
        .limit(1);

      if (!student) {
        console.warn(`[TRPC] students.getForEdit: Student ${input.id} not found or doesn't belong to user ${ctx.user.id}`);
        return null;
      }

      debugLog(`[TRPC] students.getForEdit: Successfully retrieved student ${student.name}`);
      return student;
    }),
    getDetails: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        console.error("[TRPC] Database not available for getDetails");
        return null;
      }

      debugLog(`[TRPC] Fetching student details for ID: ${input.id} requested by user: ${ctx.user.id} (${ctx.user.role})`);

      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;

      const [student] = await db.select({
        id: students.id,
        name: students.name,
        socialName: students.socialName,
        birthDate: students.birthDate,
        gender: students.gender,
        cpf: students.cpf,
        rg: students.rg,
        address: students.address,
        guardianName: students.guardianName,
        guardianPhone: students.guardianPhone,
        guardianEmail: students.guardianEmail,
        instrumentId: students.instrumentId,
        email: students.email,
        phone: students.phone,
        level: students.level,
        status: students.status,
        monthlyFee: students.monthlyFee,
        billingPeriodicity: students.billingPeriodicity,
        dueDay: students.dueDay,
        lessonType: students.lessonType,
        notes: students.notes,
        startDate: students.startDate,
        avatar: students.avatar,
        createdAt: students.createdAt,
        instrumentName: instruments.name,
        instrumentColor: instruments.color,
        instrumentIcon: instruments.icon,
        professorId: students.professorId,
        permissions: students.permissions,
        allowAutoReminders: students.allowAutoReminders,
        studioRoomId: students.studioRoomId,
        studioRoomName: studioRooms.name,
      }).from(students)
        .leftJoin(instruments, eq(students.instrumentId, instruments.id))
        .leftJoin(studioRooms, eq(students.studioRoomId, studioRooms.id))
        .where(and(eq(students.id, input.id), eq(students.organizationId, orgId)))
        .limit(1);

      if (!student) {
        console.warn(`[TRPC] Student with ID ${input.id} not found`);
        return null;
      }

      // Check permission: owner of the student or admin/owner of the system
      const isOwner = student.professorId === ctx.user.id;
      // const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId; // Removed redeclaration
      
      if (!isOwner && !isUserAdmin) {
        console.warn(`[TRPC] Access denied for user ${ctx.user.id} to student ${input.id}`);
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Você não tem permissão para visualizar os detalhes deste aluno.'
        });
      }

      // Buscar informações financeiras e acesso portal
      debugLog(`[TRPC] Fetching additional info for student ${input.id}`);
      const [
        [lastPayment],
        [nextPayment],
        [studentUser]
      ] = await Promise.all([
        db.select({
          paidAt: paymentDues.paidAt,
          dueDate: paymentDues.dueDate,
          status: paymentDues.status,
        }).from(paymentDues)
          .where(and(
             eq(paymentDues.organizationId, orgId),
             eq(paymentDues.studentId, input.id),
             eq(paymentDues.status, 'pago')
          ))
          .orderBy(desc(paymentDues.paidAt))
          .limit(1),

        db.select({
          paidAt: paymentDues.paidAt,
          dueDate: paymentDues.dueDate,
          status: paymentDues.status,
        }).from(paymentDues)
          .where(and(
             eq(paymentDues.organizationId, orgId),
             eq(paymentDues.studentId, input.id),
             or(eq(paymentDues.status, 'pendente'), eq(paymentDues.status, 'atrasado'))
          ))
          .orderBy(asc(paymentDues.dueDate))
          .limit(1),

        // BUG#4 FIX: Unificar fonte de verdade do acesso ao portal.
        // Antes: getDetails usava APENAS users.studentId, mas enablePortalAccess também gravava
        // em students.studentUserId — colunas diferentes causando hasPortalAccess sempre false.
        // Agora: verifica users.studentId (coluna canonical) que o Bug#2 FIX mantém em sincronia.
        db.select({ email: users.email, userId: users.id })
          .from(users)
          .where(
            and(
              eq(users.organizationId, orgId),
              eq(users.studentId, input.id)
            )
          )
          .limit(1)
      ]);

      debugLog(`[TRPC] Successfully fetched all info for student ${input.id}. Portal access: ${!!studentUser}`);

      return {
        ...student,
        lastPaymentDate: lastPayment?.paidAt || null,
        nextDueDate: nextPayment?.dueDate || null, 
        hasPortalAccess: !!studentUser,
        portalEmail: studentUser?.email || null,
      };
    }),

    updateAvatar: protectedProcedure.input(z.object({
      id: z.number(),
      avatar: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

      // MÉDIO-14 FIX: Admin pode atualizar avatar de qualquer aluno da org.
      // Professor só pode atualizar avatar dos seus próprios alunos.
      const condition = isUserAdmin
        ? and(eq(students.id, input.id), eq(students.organizationId, orgId))
        : and(eq(students.id, input.id), eq(students.organizationId, orgId), eq(students.professorId, ctx.user.id));
      
      await db.update(students)
        .set({ avatar: input.avatar })
        .where(condition);
      
      return { success: true };
    }),

    // BUG#5 FIX: Trocado de professorProcedure para protectedProcedure.
    // professorProcedure bloqueava admins antes de chegar na verificação isUserAdmin.
    // A verificação de permissão real (isOwner || isUserAdmin) já existe dentro da mutation.
    enablePortalAccess: protectedProcedure.input(z.object({
      studentId: z.number(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      permissions: z.record(z.string(), z.boolean()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: "Banco de dados não disponível" });

      const orgId = ctx.user.organizationId!;
      debugLog(`[TRPC] Enabling portal access for student: ${input.studentId} requested by: ${ctx.user.id}`);

      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId as number), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: 'NOT_FOUND', message: "Aluno não encontrado." });

      const isOwner = student.professorId === ctx.user.id;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      
      if (!isOwner && !isUserAdmin) {
        console.warn(`[TRPC] Permission denied for enabling portal access - User: ${ctx.user.id}, Student: ${input.studentId}`);
        throw new TRPCError({ code: 'FORBIDDEN', message: "Você não tem permissão para liberar o acesso deste aluno." });
      }

      // Update student permissions
      if (input.permissions) {
        await db.update(students).set({ 
          permissions: JSON.stringify(input.permissions) 
        }).where(eq(students.id, student.id));
      }

      // Check if user already exists for this student
      const [existingStudentUser] = await db.select().from(users).where(and(eq(users.studentId, student.id), eq(users.organizationId, orgId))).limit(1);
      
      // Se não informado, tentar usar o e-mail do cadastro do aluno, ou gerar um padrão
      const email = input.email || student.email || `${student.name.toLowerCase().replace(/\s+/g, '.')}@musicpro.com`;
      const isAutoGeneratedPassword = !input.password;
      const password = input.password || Math.random().toString(36).slice(-8);

      // If creating a NEW user (not just updating), check email availability
      if (!existingStudentUser) {
        const [existingEmail] = await db.select().from(users).where(and(eq(users.email, email), eq(users.organizationId, orgId))).limit(1);
        if (existingEmail) throw new TRPCError({ code: 'CONFLICT', message: "Este e-mail já está em uso por outro usuário." });
      }

      const salt = crypto.randomBytes(16).toString("hex");
      const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
      const passwordHash = `${salt}:${derivedKey}`;
      
      if (existingStudentUser) {
        await db.update(users)
          .set({ 
            email, 
            passwordHash, 
            mustChangePassword: isAutoGeneratedPassword,
            role: 'aluno', 
            studentId: student.id, 
            isEmailVerified: true 
          })
          .where(eq(users.id, existingStudentUser.id));
        debugLog(`[TRPC] Updated existing user ${existingStudentUser.id} for student ${student.id}`);
      } else {
        const openId = crypto.randomUUID();
        await db.insert(users).values({
          openId,
          organizationId: orgId,
          name: student.name,
          email,
          passwordHash,
          mustChangePassword: isAutoGeneratedPassword,
          loginMethod: 'local',
          role: 'aluno',
          studentId: student.id,
          isEmailVerified: true,
        });
        debugLog(`[TRPC] Created new user for student ${student.id} with email: ${email}`);
      }

      // BUG#2 FIX: Validação robusta do link student → user.
      // Antes: se o INSERT falhasse silenciosamente, finalUser era undefined e
      // students.studentUserId ficava null — acesso "criado" mas inoperante.
      // Agora: erro explícito + gravação de AMBAS as colunas de link para consistência.
      const [finalUser] = await db.select({ id: users.id, openId: users.openId })
        .from(users)
        .where(and(eq(users.email, email), eq(users.organizationId, orgId)))
        .limit(1);

      if (!finalUser) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao criar o usuário de acesso. Por favor, tente novamente.',
        });
      }

      // Grava studentUserId em students E studentId em users — mantém ambas as colunas em sincronia
      await Promise.all([
        db.update(students)
          .set({ studentUserId: finalUser.id })
          .where(eq(students.id, student.id)),
        db.update(users)
          .set({ studentId: student.id })
          .where(eq(users.id, finalUser.id)),
      ]);

      debugLog(`[TRPC] Successfully linked student ${student.id} ↔ user ${finalUser.id}`);

      // MÉDIO-08 FIX: Senha não é mais retornada em texto claro via API.
      // A senha temporária é retornada APENAS quando foi gerada automaticamente,
      // para que o professor possa transmiti-la ao aluno de forma segura offline.
      // Em versões futuras, implementar envio por e-mail diretamente ao aluno.
      return { 
        success: true, 
        email,
        // Retorna a senha APENAS se foi gerada automaticamente pelo sistema
        // e o professor precisa dela para informar ao aluno.
        // Não retornar quando o professor definiu uma senha customizada.
        password: isAutoGeneratedPassword ? password : undefined,
        isAutoGenerated: isAutoGeneratedPassword,
      };
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1, "O nome é obrigatório"),
      socialName: z.string().optional().nullable(),
      email: z.string().email("E-mail inválido").or(z.literal("")).optional().nullable(),
      phone: z.string().optional().nullable().default(""),
      birthDate: z.string().optional().nullable(),
      gender: z.string().optional().nullable(),
      cpf: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/\D/g, "");
        if (clean === "") return true;
        if (clean.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(clean)) return false;
        
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
        let rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(clean.charAt(9))) return false;
        
        sum = 0;
        for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
        rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(clean.charAt(10))) return false;
        
        return true;
      }, "CPF inválido"),
      rg: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/[^a-zA-Z0-9]/g, "");
        if (clean === "") return true;
        return clean.length >= 5 && !/^0+$/.test(clean);
      }, "RG deve ter pelo menos 5 caracteres e não conter apenas zeros"),
      address: z.string().optional().nullable(),
      guardianName: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        return /^[a-zA-ZáàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]*$/.test(val);
      }, "O nome do responsável deve conter apenas letras"),
      guardianPhone: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/\D/g, "");
        if (clean === "") return true;
        return (clean.length === 10 || clean.length === 11) && !/^0+$/.test(clean);
      }, "Telefone do responsável deve ter 10 ou 11 dígitos e não conter apenas zeros"),
      guardianEmail: z.string().email("E-mail do responsável inválido").or(z.literal("")).optional().nullable(),
      instrumentId: z.number().optional(),
      level: z.enum(['iniciante','intermediario','avancado']).default('iniciante'),
      monthlyFee: z.union([z.number(), z.string()]).transform((val) => {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val || typeof val !== 'string') return 0;
        const clean = val.replace(/R\$\s*/g, '').replace(/\s/g, '');
        const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
        const n = parseFloat(normalized);
        return isNaN(n) ? 0 : n;
      }).default(0),
      billingPeriodicity: z.enum(['mensal','bimestral','trimestral','semestral','anual']).default('mensal'),
      dueDay: z.number().default(15),
      schoolPlanId: z.number().nullable().optional(),
      lessonType: z.enum(['individual','turma','online']).default('individual'),
      onlineMeetingLink: z.string().url().optional().nullable(),
      notes: z.string().optional(),
      status: z.enum(['ativo','inativo','pausado']).default('ativo'),
      startDate: z.string().optional().nullable(),
      temporaryPassword: z.string().optional(),
      professorId: z.number().optional(),
      avatar: z.string().optional(),
      allowAutoReminders: z.boolean().default(true),
      studioRoomId: z.number().optional().nullable(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        
        const orgId = ctx.user.organizationId!;

        // --- Verificação de limite de plano ---
        const planInfo = await getOrgPlanLimits(db, orgId);
        
        const [{ count: activeStudentsCount }] = await db.select({ count: sql<number>`count(*)` })
          .from(students)
          .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));
        
        if (input.status === 'ativo' && activeStudentsCount >= planInfo.maxStudents) {
          if (planInfo.allowExtraStudents) {
            // Permitido como excedente — continua normalmente
            debugLog(`[ExcessStudent] Org #${orgId}: aluno excedente (${activeStudentsCount + 1}/${planInfo.maxStudents}). Taxa: R$ ${planInfo.extraStudentPrice}/aluno`);
          } else {
            throw new TRPCError({ 
              code: 'FORBIDDEN', 
              message: `Limite de alunos atingido (${planInfo.maxStudents} alunos). Faça upgrade do seu plano para continuar crescendo!` 
            });
          }
        }
        // ---------------------------------------

        // 1. Criar o Aluno primeiro para ter o ID
        const newStudentId = await db.transaction(async (tx) => {
          // PLANOS & BOLSAS: valida que o plano pertence à organização (integridade)
          if (input.schoolPlanId != null) {
            const [planExists] = await db.select({ id: schoolPlans.id }).from(schoolPlans)
              .where(and(eq(schoolPlans.id, input.schoolPlanId), eq(schoolPlans.organizationId, orgId)))
              .limit(1);
            if (!planExists) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado não existe nesta escola." });
          }
          const [newStudent] = await tx.insert(students).values({
            organizationId: orgId,
            userId: ctx.user.id,
            professorId: input.professorId || ctx.user.id,
            name: input.name,
            socialName: input.socialName || undefined,
            email: input.email || undefined,
            phone: input.phone || "",
            birthDate: input.birthDate || undefined,
            gender: input.gender || undefined,
            cpf: input.cpf || undefined,
            rg: input.rg || undefined,
            address: input.address || undefined,
            guardianName: input.guardianName || undefined,
            guardianPhone: input.guardianPhone || undefined,
            guardianEmail: input.guardianEmail || undefined,
            avatar: input.avatar ?? undefined,
            instrumentId: input.instrumentId || undefined,
            level: input.level,
            monthlyFee: String(input.monthlyFee),
            billingPeriodicity: input.billingPeriodicity || 'mensal',
            dueDay: input.dueDay,
            schoolPlanId: input.schoolPlanId || null,
            lessonType: input.lessonType,
            onlineMeetingLink: input.onlineMeetingLink || undefined,
            startDate: input.startDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
            notes: input.notes || undefined,
            status: input.status,
            allowAutoReminders: input.allowAutoReminders,
            studioRoomId: input.studioRoomId || undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning({ id: students.id });

          // 2. Criar o usuário se o email for gmail (mesmo sem senha) ou se tiver senha temporária
          if (input.email) {
            const isGoogle = input.email.toLowerCase().endsWith('@gmail.com');
            
            if (isGoogle || input.temporaryPassword) {
              let passwordHash: string | null = null;
              let loginMethod = 'local';
              
              if (isGoogle) {
                loginMethod = 'google';
              } else if (input.temporaryPassword) {
                const salt = crypto.randomBytes(16).toString("hex");
                const derivedKey = crypto.scryptSync(input.temporaryPassword, salt, 64).toString("hex");
                passwordHash = `${salt}:${derivedKey}`;
              }

              const openId = crypto.randomUUID();

              const [newUser] = await tx.insert(users).values({
                openId,
                organizationId: orgId,
                name: input.name,
                email: input.email,
                passwordHash,
                loginMethod,
                role: 'aluno',
                studentId: newStudent.id,
                isEmailVerified: true,
              }).returning({ id: users.id });

              // Atualizar o aluno com o link para o usuário
              await tx.update(students)
                .set({ studentUserId: newUser.id })
                .where(and(eq(students.id, newStudent.id), eq(students.organizationId, orgId)));
            }
          }
          return newStudent.id;
        });

        // --- NOTIFICAÇÃO NOVO ALUNO ---
        try {
          const [userSettings] = await db.select({ notifyNewStudent: settings.notifyNewStudent }).from(settings).where(eq(settings.userId, ctx.user.id)).limit(1);
          if (userSettings && userSettings.notifyNewStudent === 1) {
             const { notifyUser } = await import("../_core/notification");
             await notifyUser(ctx.user.id, {
               title: "🎉 Novo Aluno Cadastrado",
               content: `O aluno ${input.name} acabou de ser cadastrado no sistema.`
             });
          }
        } catch (e) {
          console.error("Erro ao notificar novo aluno:", e);
        }
        
        await syncOrgAsaasSubscription(db, orgId).catch(console.error);
        return { success: true, studentId: newStudentId };
      } catch (error) {
        return handleDbError(error, "cadastrar o aluno");
      }
    }),


    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      socialName: z.string().optional().nullable(),
      birthDate: z.string().optional().nullable(),
      gender: z.string().optional().nullable(),
      cpf: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/\D/g, "");
        if (clean === "") return true;
        if (clean.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(clean)) return false;
        
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
        let rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(clean.charAt(9))) return false;
        
        sum = 0;
        for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
        rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(clean.charAt(10))) return false;
        
        return true;
      }, "CPF inválido"),
      rg: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/[^a-zA-Z0-9]/g, "");
        if (clean === "") return true;
        return clean.length >= 5 && !/^0+$/.test(clean);
      }, "RG deve ter pelo menos 5 caracteres e não conter apenas zeros"),
      address: z.string().optional().nullable(),
      guardianName: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        return /^[a-zA-ZáàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]*$/.test(val);
      }, "O nome do responsável deve conter apenas letras"),
      guardianPhone: z.string().optional().nullable().refine((val) => {
        if (!val) return true;
        const clean = val.replace(/\D/g, "");
        if (clean === "") return true;
        return (clean.length === 10 || clean.length === 11) && !/^0+$/.test(clean);
      }, "Telefone do responsável deve ter 10 ou 11 dígitos e não conter apenas zeros"),
      guardianEmail: z.string().email("E-mail do responsável inválido").or(z.literal("")).optional().nullable(),
      email: z.string().email("E-mail inválido").or(z.literal("")).optional().nullable(),
      phone: z.string().optional().nullable(),
      instrumentId: z.number().optional().nullable(),
      level: z.enum(['iniciante', 'intermediario', 'avancado']).optional(),
      monthlyFee: z.union([z.number(), z.string()]).transform((val) => {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val || typeof val !== 'string') return 0;
        const clean = val.replace(/R\$\s*/g, '').replace(/\s/g, '');
        const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
        const n = parseFloat(normalized);
        return isNaN(n) ? 0 : n;
      }).optional(),
      billingPeriodicity: z.enum(['mensal', 'bimestral', 'trimestral', 'semestral', 'anual']).optional(),
      dueDay: z.number().optional(),
      status: z.enum(['ativo', 'inativo', 'pausado']).optional(),
      lessonType: z.enum(['individual', 'turma', 'online']).optional(),
      onlineMeetingLink: z.string().url().optional().nullable(),
      notes: z.string().optional(),
      startDate: z.string().optional().nullable(),
      updateFutureDues: z.boolean().optional(),
      professorId: z.number().optional(),
      avatar: z.string().optional(),
      allowAutoReminders: z.boolean().optional(),
      studioRoomId: z.number().optional().nullable(),
      schoolPlanId: z.number().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        
        const orgId = ctx.user.organizationId!;
        const { id, updateFutureDues, ...data } = input;
        
        // Converte strings vazias para null para evitar erros do Postgres (como em datas ou email)
        const cleanData = Object.fromEntries(
          Object.entries(data).map(([k, v]) => {
            if ((k === "phone" || k === "name") && v === "") return [k, ""];
            return [k, v === "" ? null : v];
          })
        );

        const updateData: any = { ...cleanData, updatedAt: new Date() };
        if (updateData.monthlyFee !== undefined && updateData.monthlyFee !== null) {
          updateData.monthlyFee = String(updateData.monthlyFee);
        }
        
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const condition = isUserAdmin 
          ? and(eq(students.id, id), eq(students.organizationId, orgId))
          : and(eq(students.id, id), eq(students.organizationId, orgId), eq(students.professorId, ctx.user.id));

        const [existing] = await db.select().from(students).where(condition).limit(1);
        if (!existing) throw new TRPCError({ code: "FORBIDDEN", message: "Aluno não encontrado ou sem permissão" });

        // PLANOS & BOLSAS: valida que o plano pertence à organização (integridade)
        if (input.schoolPlanId != null) {
          const [planExists] = await db.select({ id: schoolPlans.id }).from(schoolPlans)
            .where(and(eq(schoolPlans.id, input.schoolPlanId), eq(schoolPlans.organizationId, orgId)))
            .limit(1);
          if (!planExists) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado não existe nesta escola." });
        }

        // --- Verificação de limite de plano na reativação ---
        if (updateData.status === 'ativo' && existing.status !== 'ativo') {
          const planInfo = await getOrgPlanLimits(db, orgId);
          
          const [{ count: activeStudentsCount }] = await db.select({ count: sql<number>`count(*)` })
            .from(students)
            .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));
          
          if (activeStudentsCount >= planInfo.maxStudents) {
            if (planInfo.allowExtraStudents) {
              // Permitido como excedente — continua normalmente
              debugLog(`[ExcessStudent] Org #${orgId}: aluno excedente (${activeStudentsCount + 1}/${planInfo.maxStudents}). Taxa: R$ ${planInfo.extraStudentPrice}/aluno`);
            } else {
              throw new TRPCError({ 
                code: 'FORBIDDEN', 
                message: `Limite de alunos atingido (${planInfo.maxStudents} alunos). Faça upgrade do seu plano para continuar crescendo!` 
              });
            }
          }
        }
        // ---------------------------------------

        // Sincronizar e-mail com a tabela de usuários, se houver alteração
        if (updateData.email && updateData.email !== existing.email) {
          // Verifica se já existe outro usuário com este e-mail
          const [existingUserWithEmail] = await db.select().from(users).where(eq(users.email, updateData.email)).limit(1);
          if (existingUserWithEmail && existingUserWithEmail.studentId !== id) {
             throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já está em uso por outro usuário." });
          }
          
          // Atualiza o e-mail na tabela de usuários caso o aluno já tenha portal de acesso
          await db.update(users).set({ email: updateData.email, updatedAt: new Date() }).where(eq(users.studentId, id));
        }

        // AUDIT-P2 FIX (defense-in-depth): manter o filtro de tenant também no UPDATE
        // final (antes: where(eq(students.id, id)) — check-then-act sem org)
        await db.update(students).set(updateData).where(condition);

        // Sincronizar vencimentos futuros se solicitado
        if (updateFutureDues && data.dueDay) {
          const unpaidPayments = await db.select()
            .from(paymentDues)
            .where(and(
              eq(paymentDues.organizationId, orgId),
              eq(paymentDues.studentId, id),
              eq(paymentDues.userId, ctx.user.id),
              ne(paymentDues.status, "pago")
            ));

          for (const pay of unpaidPayments) {
            const currentDueDate = new Date(pay.dueDate);
            const newDueDate = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth(), data.dueDay);
            
            // Format to YYYY-MM-DD
            const formattedDate = newDueDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

            await db.update(paymentDues)
              .set({ 
                dueDate: formattedDate,
                updatedAt: new Date()
              })
              .where(and(eq(paymentDues.id, pay.id), eq(paymentDues.organizationId, orgId)));
          }
        }
        
        await syncOrgAsaasSubscription(db, orgId).catch(console.error);
        return { success: true };
      } catch (error) {
        return handleDbError(error, "atualizar o aluno");
      }
    }),
    updateStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(['ativo', 'inativo', 'pausado']),
      deletePendingData: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        // --- Verificação de limite de plano na reativação ---
        const [existing] = await db.select({ status: students.status }).from(students)
          .where(and(eq(students.id, input.id), eq(students.organizationId, orgId))).limit(1);
        
        if (existing && input.status === 'ativo' && existing.status !== 'ativo') {
          const planInfo = await getOrgPlanLimits(db, orgId);
          
          const [{ count: activeStudentsCount }] = await db.select({ count: sql<number>`count(*)` })
            .from(students)
            .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));
          
          if (activeStudentsCount >= planInfo.maxStudents) {
            if (planInfo.allowExtraStudents) {
              // Permitido como excedente — continua normalmente
              debugLog(`[ExcessStudent] Org #${orgId}: aluno excedente (${activeStudentsCount + 1}/${planInfo.maxStudents}). Taxa: R$ ${planInfo.extraStudentPrice}/aluno`);
            } else {
              throw new TRPCError({ 
                code: 'FORBIDDEN', 
                message: `Limite de alunos atingido (${planInfo.maxStudents} alunos). Faça upgrade do seu plano para continuar crescendo!` 
              });
            }
          }
        }
        // ---------------------------------------

        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        await db.update(students).set({
          status: input.status,
          updatedAt: new Date(),
        }).where(and(
          eq(students.id, input.id), 
          eq(students.organizationId, orgId), 
          isAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ));

        if (input.deletePendingData && (input.status === 'inativo' || input.status === 'pausado')) {
          // AUDIT-01 FIX: apagar apenas aulas agendadas FUTURAS — aulas passadas
          // são histórico do aluno e não devem ser destruídas na desativação.
          await db.delete(lessons).where(and(
            eq(lessons.studentId, input.id),
            eq(lessons.organizationId, orgId),
            eq(lessons.status, 'agendada'),
            gte(lessons.scheduledAt, new Date())
          ));
          await db.delete(paymentDues).where(and(
            eq(paymentDues.studentId, input.id), 
            eq(paymentDues.organizationId, orgId), 
            eq(paymentDues.status, 'pendente')
          ));
        }

        await syncOrgAsaasSubscription(db, orgId).catch(console.error);
        return { success: true };
      } catch (error) {
        return handleDbError(error, "atualizar o status do aluno");
      }
    }),
    delete: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        // Fetch student first to check permissions and get studentUserId
        const [student] = await db.select().from(students).where(and(eq(students.id, input.id), eq(students.organizationId, orgId))).limit(1);
        if (!student) throw new Error("Aluno não encontrado");
        
        // Only admin or the assigned professor can delete the student
        if (!isAdmin && student.professorId !== ctx.user.id) {
          throw new Error("Você não tem permissão para remover este aluno");
        }

        // DELETAR ASAAS CUSTOMER
        try {
          const [asaasCust] = await db.select().from(asaasCustomers).where(and(eq(asaasCustomers.studentId, input.id), eq(asaasCustomers.organizationId, orgId))).limit(1);
          if (asaasCust) {
            const [settingsData] = await db.select({ asaasApiKey: settings.asaasApiKey })
              .from(settings).where(eq(settings.userId, student.professorId ?? ctx.user.id)).limit(1);
            // BUG FIX: chave BYOK vem cifrada (v1:...) no select cru — decifrar antes de usar na API
            const apiKey = (settingsData?.asaasApiKey ? decryptSecret(settingsData.asaasApiKey) : null) || ENV.asaasApiKey;
            if (apiKey) {
              await fetch(`${ENV.asaasBaseUrl}/customers/${asaasCust.asaasCustomerId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json", "access_token": apiKey }
              });
            }
          }
        } catch (e) {
          console.error("Erro ao deletar cliente no Asaas:", e);
        }

        // AUDIT-P1 FIX: exclusão transacional + limpeza de órfãos.
        // Antes: 15 DELETEs sequenciais sem transação (falha no meio = tenant
        // inconsistente) e deixava órfãos: reminders (por paymentDueId), attendanceLogs,
        // fileComments, contractEvents e slotOffers.
        const paymentIds = (await db.select({ id: paymentDues.id }).from(paymentDues)
          .where(and(eq(paymentDues.studentId, input.id), eq(paymentDues.organizationId, orgId))))
          .map(r => r.id);
        const lessonIds = (await db.select({ id: lessons.id }).from(lessons)
          .where(and(eq(lessons.studentId, input.id), eq(lessons.organizationId, orgId))))
          .map(r => r.id);
        const fileIds = (await db.select({ id: studentFiles.id }).from(studentFiles)
          .where(and(eq(studentFiles.studentId, input.id), eq(studentFiles.organizationId, orgId))))
          .map(r => r.id);
        const contractIds = (await db.select({ id: contracts.id }).from(contracts)
          .where(and(eq(contracts.studentId, input.id), eq(contracts.organizationId, orgId))))
          .map(r => r.id);

        await db.transaction(async (tx) => {
          // Lembretes órfãos: por paymentDueId/lessonId das dependências que serão apagadas
          if (paymentIds.length > 0 || lessonIds.length > 0) {
            const orphanConditions = [eq(reminders.studentId, input.id)];
            if (paymentIds.length > 0) orphanConditions.push(inArray(reminders.paymentDueId, paymentIds));
            if (lessonIds.length > 0) orphanConditions.push(inArray(reminders.lessonId, lessonIds));
            await tx.delete(reminders).where(and(eq(reminders.organizationId, orgId), or(...orphanConditions)));
          }
          if (fileIds.length > 0) {
            await tx.delete(fileComments).where(and(eq(fileComments.organizationId, orgId), inArray(fileComments.fileId, fileIds)));
          }
          if (contractIds.length > 0) {
            const { contractEvents } = await import("../../drizzle/schema");
            await tx.delete(contractEvents).where(inArray(contractEvents.contractId, contractIds));
          }
          if (lessonIds.length > 0) {
            const { attendanceLogs } = await import("../../drizzle/schema");
            await tx.delete(attendanceLogs).where(and(eq(attendanceLogs.organizationId, orgId), inArray(attendanceLogs.lessonId, lessonIds)));
          }
          const { slotOffers } = await import("../../drizzle/schema");
          await tx.delete(slotOffers).where(and(eq(slotOffers.organizationId, orgId), eq(slotOffers.acceptedByStudentId, input.id)));

          await tx.delete(asaasCustomers).where(and(eq(asaasCustomers.studentId, input.id), eq(asaasCustomers.organizationId, orgId)));
          await tx.delete(paymentDues).where(and(eq(paymentDues.studentId, input.id), eq(paymentDues.organizationId, orgId)));
          await tx.delete(rescheduleRequests).where(and(eq(rescheduleRequests.studentId, input.id), eq(rescheduleRequests.organizationId, orgId)));
          await tx.delete(studentEvolution).where(and(eq(studentEvolution.studentId, input.id), eq(studentEvolution.organizationId, orgId)));
          await tx.delete(dailyStudyPlans).where(and(eq(dailyStudyPlans.studentId, input.id), eq(dailyStudyPlans.organizationId, orgId)));
          await tx.delete(studentGoals).where(and(eq(studentGoals.studentId, input.id), eq(studentGoals.organizationId, orgId)));
          await tx.delete(studentTimeline).where(and(eq(studentTimeline.studentId, input.id), eq(studentTimeline.organizationId, orgId)));
          await tx.delete(studentFiles).where(and(eq(studentFiles.studentId, input.id), eq(studentFiles.organizationId, orgId)));
          // PRD Reposição (Caça-Bug): limpar créditos/eventos de reposição do aluno
          const { lessonRepositions, repositionEvents } = await import("../../drizzle/schema");
          const repRows = await tx
            .select({ id: lessonRepositions.id })
            .from(lessonRepositions)
            .where(and(eq(lessonRepositions.organizationId, orgId), eq(lessonRepositions.studentId, input.id)));
          if (repRows.length > 0) {
            await tx.delete(repositionEvents).where(inArray(repositionEvents.repositionId, repRows.map((r) => r.id)));
            await tx.delete(lessonRepositions).where(and(eq(lessonRepositions.organizationId, orgId), eq(lessonRepositions.studentId, input.id)));
          }
          // PRD Repertório: limpar músicas do repertório do aluno
          const { studentRepertoire } = await import("../../drizzle/schema");
          await tx.delete(studentRepertoire).where(and(eq(studentRepertoire.organizationId, orgId), eq(studentRepertoire.studentId, input.id)));
          // BUG-009: Também limpar contracts e announcements específicos do aluno
          await tx.delete(contracts).where(and(eq(contracts.studentId, input.id), eq(contracts.organizationId, orgId)));
          await tx.delete(announcements).where(and(eq(announcements.targetStudentId, input.id), eq(announcements.organizationId, orgId)));

          if (student.studentUserId) {
            await tx.delete(chatMessages).where(and(or(eq(chatMessages.senderId, student.studentUserId), eq(chatMessages.receiverId, student.studentUserId)), eq(chatMessages.organizationId, orgId)));
          }

          await tx.delete(lessons).where(and(eq(lessons.studentId, input.id), eq(lessons.organizationId, orgId)));
          await tx.delete(students).where(and(eq(students.id, input.id), eq(students.organizationId, orgId)));
        });

        if (student.studentUserId) {
          await db.delete(users).where(and(eq(users.id, student.studentUserId), eq(users.organizationId, orgId)));
        }
        
        await syncOrgAsaasSubscription(db, orgId).catch(console.error);
        return { success: true };
      } catch (error) {
        return handleDbError(error, "remover o aluno");
      }
    }),
    search: protectedProcedure.input(z.object({ q: z.string() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      if (!input.q.trim()) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.toLowerCase()}%`;
      return db.select({
        id: students.id,
        name: students.name,
        email: students.email,
        status: students.status,
      }).from(students).where(and(
        eq(students.organizationId, orgId),
        eq(students.professorId, ctx.user.id),
        sql`LOWER(name) LIKE ${term} OR LOWER(email) LIKE ${term}`
      )).limit(8);
    }),
  }),

  instruments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      return getInstrumentsWithCount(orgId, isUserAdmin ? undefined : ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(2),
      category: z.string().min(2),
      color: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.insert(instruments).values({
          organizationId: orgId,
          userId: ctx.user.id,
          name: input.name,
          category: input.category,
          color: input.color ?? '#6366f1',
          createdAt: new Date(),
        });
        return { success: true };
      } catch (error) {
        return handleDbError(error, "cadastrar o instrumento");
      }
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      category: z.string().min(2).optional(),
      color: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const { id, ...rest } = input;
        const whereClause = isAdmin
          ? and(eq(instruments.id, id), eq(instruments.organizationId, orgId))
          : and(eq(instruments.id, id), eq(instruments.organizationId, orgId), eq(instruments.userId, ctx.user.id));
        await db.update(instruments).set(rest).where(whereClause);
        return { success: true };
      } catch (error) {
        return handleDbError(error, "atualizar o instrumento");
      }
    }),
    delete: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const isAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

        // Verify instrument belongs to this org before deleting
        const [inst] = await db.select({ id: instruments.id, userId: instruments.userId })
          .from(instruments)
          .where(and(eq(instruments.id, input.id), eq(instruments.organizationId, orgId)))
          .limit(1);

        if (!inst) return { success: false, message: "Instrumento não encontrado." };
        if (!isAdmin && inst.userId !== ctx.user.id) return { success: false, message: "Sem permissão para remover este instrumento." };

        // Remove instrument reference from students of this org
        await db.update(students).set({ instrumentId: null }).where(and(eq(students.instrumentId, input.id), eq(students.organizationId, orgId)));
        // Remove instrument reference from lessons (agenda) of this org
        await db.update(lessons).set({ instrumentId: null }).where(and(eq(lessons.instrumentId, input.id), eq(lessons.organizationId, orgId)));
        // Delete the instrument
        await db.delete(instruments).where(and(eq(instruments.id, input.id), eq(instruments.organizationId, orgId)));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "remover o instrumento");
      }
    }),
    search: protectedProcedure.input(z.object({ q: z.string() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.toLowerCase()}%`;
      return db.select({
        id: instruments.id,
        name: instruments.name,
        category: instruments.category,
      }).from(instruments).where(and(
        eq(instruments.organizationId, orgId),
        eq(instruments.userId, ctx.user.id),
        sql`LOWER(name) LIKE ${term}`
      )).limit(5);
    }),
  }),

};
