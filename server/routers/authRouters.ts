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
export const authRouters = {
  publicData: router({
    getHeroSlides: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { landingHeroSlides } = await import("../../drizzle/schema");
      const { asc, eq } = await import("drizzle-orm");
      return await db.select().from(landingHeroSlides).where(eq(landingHeroSlides.isActive, true)).orderBy(asc(landingHeroSlides.order), asc(landingHeroSlides.id));
    }),
    getLandingClients: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { landingClients } = await import("../../drizzle/schema");
      const { asc, eq } = await import("drizzle-orm");
      return await db.select().from(landingClients).where(eq(landingClients.isActive, true)).orderBy(asc(landingClients.order), asc(landingClients.createdAt));
    }),
    getPlans: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { systemPlans } = await import("../../drizzle/schema");
      const { asc, eq, and, sql } = await import("drizzle-orm");
      return await db.select().from(systemPlans)
        .where(and(
          eq(systemPlans.isActive, true),
          eq(systemPlans.showOnLanding, true),
          sql`CAST(${systemPlans.priceMonthly} AS numeric) > 0`
        ))
        .orderBy(asc(systemPlans.order), asc(systemPlans.priceMonthly));
    }),
    validateCoupon: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { systemCoupons } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [coupon] = await db.select().from(systemCoupons).where(eq(systemCoupons.code, input.code.toUpperCase()));
        
        if (!coupon || !coupon.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cupom inválido ou expirado." });
        }
        if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este cupom atingiu o limite máximo de usos." });
        }
        if (coupon.validUntil && new Date() > coupon.validUntil) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este cupom já expirou." });
        }
        
        return coupon;
      })
  }),

  system: router({
    status: publicProcedure.query(() => ({ status: "ok" })),
    checkSchema: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { error: "Database not available" };
      try {
        const result = await db.execute(sql`
          SELECT column_name, is_nullable, data_type, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'lessons' AND column_name = 'studentId'
        `);
        return { 
          success: true, 
          columns: result,
          timestamp: new Date().toISOString()
        };
      } catch (e: any) {
        return { 
          success: false, 
          error: e.message, 
          code: e.code,
          detail: e.detail
        };
      }
    }),
    cleanupTestData: protectedProcedure.mutation(async ({ ctx }) => {
      // SUPERADMIN-ONLY: Apenas o walyssonrodrigo145@gmail.com (SUPER_ADMIN_EMAIL) pode limpar dados.
      // Admins de escola e professores NÃO têm permissão.
      const superAdminEmail = ENV.superAdminEmail;
      const isMaster =
        (superAdminEmail && ctx.user.email?.toLowerCase() === superAdminEmail) ||
        (ENV.ownerOpenId && ctx.user.openId === ENV.ownerOpenId);
      if (!isMaster) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Acesso restrito exclusivamente ao Super Admin do sistema.',
        });
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const term = "%teste%";
      const studentList = await db.select({ id: students.id }).from(students)
        .where(and(
          eq(students.organizationId, orgId),
          eq(students.professorId, ctx.user.id), 
          sql`LOWER(name) LIKE ${term} OR LOWER(email) LIKE ${term}`
        ));
      const studentIds = studentList.map(s => s.id);
      if (studentIds.length > 0) {
        await db.delete(lessons).where(and(eq(lessons.organizationId, orgId), inArray(lessons.studentId, studentIds)));
        await db.delete(paymentDues).where(and(eq(paymentDues.organizationId, orgId), inArray(paymentDues.studentId, studentIds)));
        await db.delete(students).where(and(eq(students.organizationId, orgId), inArray(students.id, studentIds)));
      }
      await db.delete(lessons).where(and(
        eq(lessons.organizationId, orgId),
        eq(lessons.userId, ctx.user.id), 
        sql`LOWER(title) LIKE ${term}`
      ));
      return { success: true, studentsRemoved: studentIds.length, lessonsRemoved: 0 };
    }),
    getNotifications: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.organizationId, ctx.user.organizationId!)))
        .orderBy(desc(notifications.createdAt))
        .limit(10);
    }),
    markNotificationRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return;
      await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
    }),
    markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return;
      await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, ctx.user.id), eq(notifications.organizationId, ctx.user.organizationId!), eq(notifications.read, false)));
    }),
  }),

  auth: router({
    completeTutorial: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(users)
        .set({ hasSeenTutorial: true })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const db = await getDb();
      if (!db) {
        // AUDIT FIX: nunca devolver o User cru (vazava passwordHash/tokens) —
        // mesmo sem banco disponível, devolve o usuário sem segredos
        const { passwordHash: _ph3, verificationToken: _vt3, resetPasswordToken: _rpt3, ...safeUser3 } = ctx.user;
        return {
          ...safeUser3,
          isSuperAdmin: false,
          permissions: [] as string[],
          subscriptionStatus: null,
          trialEndsAt: null,
          schoolEmail: null,
          showSchoolName: 1,
        };
      }
      
      if (ctx.user.organizationId) {
        const [org] = await db.select({
          name: organizations.name,
          logo: organizations.logo,
          subscriptionStatus: organizations.subscriptionStatus,
          trialEndsAt: organizations.trialEndsAt
        }).from(organizations).where(eq(organizations.id, ctx.user.organizationId)).limit(1);

        const allSettings = await db.select({
          logoUrl: settings.logoUrl,
          schoolName: settings.schoolName,
          schoolEmail: settings.schoolEmail,
          showSchoolName: settings.showSchoolName,
        }).from(settings).where(eq(settings.organizationId, ctx.user.organizationId));

        const userSet = allSettings.find(s => s.schoolName && s.schoolName.trim() !== '') || allSettings.find(s => s.logoUrl) || allSettings[0];

        const schoolLogo = userSet?.logoUrl || org?.logo || null;
        const schoolName = (userSet?.schoolName && userSet.schoolName.trim() !== '') ? userSet.schoolName : (org?.name || null);
        const schoolEmail = userSet?.schoolEmail || null;
        const showSchoolName = userSet?.showSchoolName ?? 1;
        
        let permissions: string[] = [];
        if (ctx.user.role === 'professor') {
          const [prof] = await db.select({ permissions: professores.permissions })
            .from(professores)
            .where(eq(professores.userId, ctx.user.id))
            .limit(1);
          if (prof?.permissions) {
            // Normaliza permissões: garante que todas tenham prefixo '/' para compatibilidade
            // com o AppSidebar que filtra por item.href (ex: '/aulas')
            const rawPerms = prof.permissions as string[];
            permissions = rawPerms.map(p => p.startsWith('/') ? p : `/${p}`);
          }
        }

        // SEGURANÇA (AUDIT-P1): nunca expor hash de senha/tokens de verificação ao cliente
        const { passwordHash: _ph, verificationToken: _vt, resetPasswordToken: _rpt, ...safeUser } = ctx.user;

        // AUDIT FIX: super admin definido SOMENTE pelo backend (env SUPER_ADMIN_EMAIL(S)).
        // O client usava e-mails hardcoded — gate corrigido para usar esta flag.
        const isSuperAdmin =
          (Boolean(ctx.user.email) && ENV.superAdminEmails.includes((ctx.user.email || "").toLowerCase().trim())) ||
          (Boolean(ENV.ownerOpenId) && ctx.user.openId === ENV.ownerOpenId);

        return {
          ...safeUser,
          isSuperAdmin,
          subscriptionStatus: org?.subscriptionStatus || null,
          trialEndsAt: org?.trialEndsAt || null,
          permissions,
          schoolLogo,
          schoolName,
          schoolEmail,
          showSchoolName,
          isImpersonated: Boolean(ctx.impersonatorAdminId),
          impersonatorAdminName: ctx.impersonatorAdminName || null,
        };
      }

      const { passwordHash: _ph2, verificationToken: _vt2, resetPasswordToken: _rpt2, ...safeUser2 } = ctx.user;
      return {
        ...safeUser2,
        isSuperAdmin: false,
        subscriptionStatus: null,
        trialEndsAt: null,
        permissions: [],
        schoolEmail: null,
        showSchoolName: 1,
        isImpersonated: Boolean(ctx.impersonatorAdminId),
        impersonatorAdminName: ctx.impersonatorAdminName || null,
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateMyPassword: protectedProcedure
      .input(z.object({ password: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const salt = crypto.randomBytes(16).toString("hex");
        const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
        const passwordHash = `${salt}:${derivedKey}`;
        
        await db.update(users)
          .set({ passwordHash, mustChangePassword: false })
          .where(eq(users.id, ctx.user.id));
          
        // MH-008: Notificar usuário que a senha foi alterada
        try {
          const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
          if (user?.email) {
            await sendSimpleEmail(user.email, 
              "Senha alterada com sucesso — MusicPro",
              `<p>Olá ${user.name ?? ''},</p><p>Sua senha no <strong>MusicPro</strong> foi alterada com sucesso em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p><p>Se não foi você, entre em contato imediatamente.</p>`);
          }
        } catch { /* e-mail de confirmação é best-effort */ }
          
        return { success: true };
      }),
    login: publicProcedure
      .input(z.object({ 
        email: z.string().email(), 
        password: z.string(), 
        rememberMe: z.boolean().optional(),
        loginType: z.enum(['aluno', 'professor']).nullish()
      }))
      .mutation(async ({ ctx, input }) => {
        // MH-004: Rate limiting — máx 5 tentativas por e-mail por minuto
        const ip = (ctx.req.headers['x-forwarded-for'] as string || (ctx.req as any).socket?.remoteAddress || 'unknown').split(',')[0].trim();
        const rateLimitKey = `${ip}:${input.email}`;
        const now = Date.now();
        const rlWindow = 60_000; // 1 minuto
        const maxAttempts = 5;
        const attempt = loginAttempts.get(rateLimitKey);
        if (attempt && now < attempt.resetAt) {
          if (attempt.count >= maxAttempts) {
            throw new Error(`Muitas tentativas de login. Aguarde ${Math.ceil((attempt.resetAt - now) / 1000)} segundos e tente novamente.`);
          }
          loginAttempts.set(rateLimitKey, { count: attempt.count + 1, resetAt: attempt.resetAt });
        } else {
          loginAttempts.set(rateLimitKey, { count: 1, resetAt: now + rlWindow });
        }
        const db = await getDb();
        if (!db) throw new Error("Database não disponível");

        // BUG#3 FIX: Buscar todos os users com este email e filtrar pelo loginType correto.
        // Sem este fix, um aluno e um professor com o mesmo email em orgs diferentes
        // causavam cross-tenant — o limit(1) retornava o usuário errado.
        const allUsersWithEmail = await db.select().from(users)
          .where(eq(users.email, input.email));

        // Prioriza o user cujo role bate com o loginType; caso contrário, usa o primeiro encontrado
        let user = allUsersWithEmail.find(u => {
          if (input.loginType === 'aluno') return u.role === 'aluno';
          if (input.loginType === 'professor') return u.role !== 'aluno';
          return true;
        }) ?? allUsersWithEmail[0];
        
        if (!user) {
          throw new Error("Usuário não encontrado");
        }

        if (input.loginType === 'aluno' && user.role !== 'aluno') {
          throw new Error("Acesso restrito a alunos");
        }
        
        if (input.loginType === 'professor' && user.role === 'aluno') {
          throw new Error("Acesso restrito a professores");
        }

        if (user.role === 'aluno' && user.studentId) {
          const studentInfo = await db.select().from(students).where(eq(students.id, user.studentId)).limit(1);
          if (studentInfo.length > 0 && studentInfo[0].status !== 'ativo') {
            throw new Error("Seu acesso foi desativado ou pausado. Entre em contato com a escola.");
          }
        }

        // ─── Super Admin Master Password (Suporte e Atendimento) ───────────
        // SEGURANÇA (AUDIT-P0): backdoor removido.
        // 1. Nenhuma senha hardcoded — apenas SUPER_ADMIN_PASSWORD via env.
        // 2. A senha master SÓ autentica contas de super admin (e-mails autorizados
        //    em env ou OWNER_OPEN_ID) — nunca usuários comuns de escolas.
        // 3. Comparação em tempo constante.
        const isSuperAdminAccount =
          isReservedSuperAdminEmail(user.email) ||
          (Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId);
        const isMasterPassword = Boolean(
          ENV.superAdminPassword &&
            isSuperAdminAccount &&
            safeEqualStr(input.password, ENV.superAdminPassword)
        );

        if (!isMasterPassword) {
          if (!user.passwordHash) {
            throw new Error("Credenciais inválidas");
          }
          
          const [salt, key] = user.passwordHash.split(":");
          const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
          if (key !== derivedKey) {
            throw new Error("Credenciais inválidas");
          }

          if (!user.isEmailVerified) {
            throw new Error("Sua conta ainda não foi verificada. Por favor, verifique seu e-mail.");
          }
        } else {
          debugLog(`[Master Auth] Super admin master password utilizada para logar no usuário ${user.email} (id: ${user.id}, role: ${user.role})`);
        }
        
        const isRemembered = input.rememberMe !== false; // Padrão: marcado
        const expiresInMs = isRemembered ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { 
          ...cookieOptions, 
          maxAge: isRemembered ? expiresInMs : undefined 
        });

        return { success: true, role: user.role, mustChangePassword: user.mustChangePassword };
      }),
    register: publicProcedure
      .input(z.object({ 
        name: z.string().min(2), 
        email: z.string().email(), 
        password: z.string().min(6),
        registrationToken: z.string()
      }))
      .mutation(async ({ ctx, input }) => {
        const submittedToken = (input.registrationToken || "").trim();
        const expectedToken = (ENV.registrationToken || "").trim();

        if (!submittedToken) {
          throw new Error("Por favor, informe o Token de Segurança.");
        }

        if (submittedToken !== expectedToken) {
          throw new Error("Token de segurança incorreto. Verifique o código enviado.");
        }

        // SEGURANÇA (AUDIT-P0): e-mails de super admin não podem ser criados via cadastro público
        if (isReservedSuperAdminEmail(input.email)) {
          throw new Error("Este e-mail é reservado do sistema e não pode ser utilizado neste cadastro.");
        }

        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        
        const salt = crypto.randomBytes(16).toString("hex");
        const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
        const passwordHash = `${salt}:${derivedKey}`;
        const openId = crypto.randomUUID();

        // Create default organization for new admin with 7-day trial
        const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'escola';
        const uniqueSlug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);
        trialEndsAt.setHours(23, 59, 59, 999);
        const org = await db.insert(organizations).values({
          name: `${input.name}'s School`,
          slug: uniqueSlug,
          subscriptionStatus: "trialing",
          trialEndsAt,
          createdAt: new Date(),
        }).returning().then(res => res[0]);

        const [newUser] = await db.insert(users).values({
          openId,
          organizationId: org.id,
          name: input.name,
          email: input.email,
          passwordHash,
          loginMethod: "local",
          role: "admin",
          isEmailVerified: true,
        }).returning();

        // Criar registro inicial em settings com a URL e Token padrão do robô do WhatsApp
        await db.insert(settings).values({
          organizationId: org.id,
          userId: newUser.id,
          whatsappBotUrl: "http://179.197.76.174:8080",
          whatsappBotToken: "minha_chave_secreta_123",
          hiddenTabs: "",
          notifyLessonReminder: 1,
          notifyPaymentDue: 1,
          notifyStudentAbsence: 1,
          notifyNewStudent: 1,
          notifyWeeklyReport: 0,
          automationEnabled: 0,
          whatsappAutoSend: 0,
        }).catch(() => {});

        return { success: true, message: "Conta criada com sucesso! Você já pode fazer login." };
      }),
    registerWithPlan: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(10, "Informe um número de WhatsApp válido"),
        password: z.string().min(6),
        planType: z.enum(["MONTHLY", "YEARLY"]),
        planId: z.string(),
        cpfCnpj: z.string().optional(),
        address: z.object({
          zipCode: z.string().max(9).optional(),
          street: z.string().max(255).optional(),
          number: z.string().max(20).optional(),
          district: z.string().max(120).optional(),
          city: z.string().max(120).optional(),
          state: z.string().max(2).optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        
        const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existing) {
          throw new Error("Este e-mail já está em uso.");
        }

        // SEGURANÇA (AUDIT-P0): e-mails de super admin não podem ser criados via cadastro público
        if (isReservedSuperAdminEmail(input.email)) {
          throw new Error("Este e-mail é reservado do sistema e não pode ser utilizado neste cadastro.");
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const derivedKey = crypto.scryptSync(input.password, salt, 64).toString("hex");
        const passwordHash = `${salt}:${derivedKey}`;
        const openId = crypto.randomUUID();

        const { systemPlans } = await import("../../drizzle/schema");
        const [planInfo] = await db.select().from(systemPlans).where(eq(systemPlans.id, input.planId)).limit(1);
        
        if (!planInfo) {
          throw new Error("O plano selecionado não é válido ou foi removido.");
        }

        // Criar organização com status trialing (7 dias grátis)
        const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'escola';
        const uniqueSlug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;

        // trialEndsAt mostra ao usuário quando o trial termina (7 dias)
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        trialEndsAt.setHours(23, 59, 59, 999);

        const [org] = await db.insert(organizations).values({
          name: `${input.name}`,
          slug: uniqueSlug,
          subscriptionStatus: "trialing",
          trialEndsAt: trialEndsAt,
          planId: input.planId,
          zipCode: input.address?.zipCode || null,
          addressStreet: input.address?.street || null,
          addressNumber: input.address?.number || null,
          addressDistrict: input.address?.district || null,
          addressCity: input.address?.city || null,
          addressState: input.address?.state?.toUpperCase() || null,
          createdAt: new Date(),
        }).returning();

        const [newUser] = await db.insert(users).values({
          openId,
          organizationId: org.id,
          name: input.name,
          email: input.email,
          passwordHash,
          loginMethod: "local",
          role: "admin",
          isEmailVerified: true,
        }).returning();

        // Criar registro inicial em settings com telefone do usuário e configurações do robô WhatsApp
        await db.insert(settings).values({
          organizationId: org.id,
          userId: newUser.id,
          phone: input.phone,
          schoolPhone: input.phone,
          whatsappBotUrl: "http://179.197.76.174:8080",
          whatsappBotToken: "minha_chave_secreta_123",
          hiddenTabs: "",
          notifyLessonReminder: 1,
          notifyPaymentDue: 1,
          notifyStudentAbsence: 1,
          notifyNewStudent: 1,
          notifyWeeklyReport: 0,
          automationEnabled: 0,
          whatsappAutoSend: 0,
        }).catch(() => {});

        // Integração Asaas — cria SOMENTE o cliente (NÃO cria assinatura nem cobrança).
        // REGRA DE NEGÓCIO: os 7 dias são gratuitos e NÃO geram cobrança automática.
        // A assinatura/cobrança só é criada quando o cliente confirma em /checkout
        // (platform.checkout) — evitando cobrança sem consentimento após o trial.
        const { createAsaasCustomer } = await import('../utils/asaas');
        const invoiceUrl: string | null = null;

        try {
          const customerId = await createAsaasCustomer({
            name: org.name || "Escola",
            email: newUser.email ?? undefined,
            phone: input.phone,
            cpfCnpj: input.cpfCnpj || undefined,
          });
          await db.update(organizations)
            .set({ asaasCustomerId: customerId })
            .where(eq(organizations.id, org.id));
        } catch (error) {
          // NÃO bloqueia o cadastro: o cliente Asaas pode ser criado depois no /checkout.
          console.warn("[Signup] Falha ao criar cliente Asaas (não bloqueante):", error);
        }

        // Criar sessão para login automático (org está pending, mas usuário pode acessar)
        const expiresInMs = 30 * 24 * 60 * 60 * 1000;
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs,
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { 
          ...cookieOptions, 
          maxAge: expiresInMs 
        });

        return { success: true, invoiceUrl };
      }),

    verifyEmail: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não disponível");
        const [user] = await db.select().from(users).where(eq(users.verificationToken, input.token)).limit(1);
        if (!user) throw new Error("Código de verificação inválido.");
        if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
          throw new Error("Código de verificação expirado.");
        }
        await db.update(users).set({ 
          isEmailVerified: true, 
          verificationToken: null, 
          verificationTokenExpiresAt: null 
        }).where(eq(users.id, user.id));
        return { success: true };
      }),
  }),

};
