import { debugLog } from "./_core/logger";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { eq, sql, count, inArray } from "drizzle-orm";
import {
  systemPlans,
  systemCoupons,
  organizations,
  users,
  students,
  professores,
  instruments,
  lessons,
  monthlyStats,
  settings,
  reminders,
  reminderTemplates,
  paymentDues,
  billingAuditLogs,
  asaasCustomers,
  expenses,
  studentGoals,
  studentTimeline,
  studentFiles,
  fileComments,
  announcements,
  chatMessages,
  rescheduleRequests,
  studentEvolution,
  dailyStudyPlans,
  notifications,
  aiConversations,
  aiMessages,
  aiDocuments,
  chatbotSessions,
  fcmTokens,
  contracts,
  professorPayments,
  attendanceTokens,
  attendanceLogs,
  messageAutomationRules,
  marketingCampaigns,
  marketingContacts,
  marketingJobs,
  marketingLogs,
  analyticsSessions,
  analyticsRevenue,
  analyticsSecurityLogs,
  crmLeads,
  studioRooms,
  enrollmentLinks,
  landingClients,
  landingHeroSlides,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── Middleware de autorização ────────────────────────────────────────────────
// REGRA: Somente usuários configurados em SUPER_ADMIN_EMAIL / SUPER_ADMIN_EMAILS
// (variáveis de ambiente) OU via OWNER_OPEN_ID têm acesso.
// AUDIT-P0 FIX: e-mails hardcoded removidos — a lista vem exclusivamente de env.
export const isSuperAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const userEmail = ctx.user.email?.toLowerCase().trim();

  const isMaster =
    (Boolean(userEmail) && ENV.superAdminEmails.includes(userEmail || "")) ||
    (ENV.ownerOpenId && ctx.user.openId === ENV.ownerOpenId);

  if (!isMaster) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Acesso restrito exclusivamente ao Super Admin.",
    });
  }
  return next({ ctx });
});

export const superAdminRouter = router({

  // ─── Dashboard: contagens globais usando COUNT(*) no SQL ──────────────────
  getDashboardStats: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    // FIX: usar COUNT(*) em vez de SELECT * para evitar Full Table Scan em memória
    const [{ totalOrgs }] = await db.select({ totalOrgs: sql<number>`CAST(count(*) AS INT)` }).from(organizations);
    const [{ totalProfs }] = await db.select({ totalProfs: sql<number>`CAST(count(*) AS INT)` }).from(users).where(eq(users.role, "professor"));
    const [{ totalStuds }] = await db.select({ totalStuds: sql<number>`CAST(count(*) AS INT)` }).from(students).where(eq(students.status, "ativo"));

    // Últimas 10 organizações para o painel — ordenadas por criação
    const recentOrgs = await db.select({
      id: organizations.id,
      name: organizations.name,
      subscriptionStatus: organizations.subscriptionStatus,
      createdAt: organizations.createdAt,
    }).from(organizations).orderBy(sql`${organizations.createdAt} DESC`).limit(10);

    return {
      totalOrganizations: totalOrgs,
      totalProfessors: totalProfs,
      totalStudents: totalStuds,
      organizations: recentOrgs,
    };
  }),

  // ─── Lista de organizações — sem dados sensíveis ──────────────────────────
  getOrganizations: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // CRÍTICO-09 FIX: especificar campos explicitamente — NUNCA usar select() sem campos.
    // Evita retornar asaasCustomerId, asaasSubscriptionId e outros dados sensíveis
    // quando não estritamente necessários.
    const orgsList = await db.select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logo: organizations.logo,
      active: organizations.active,
      ownerId: organizations.ownerId,
      subscriptionStatus: organizations.subscriptionStatus,
      trialEndsAt: organizations.trialEndsAt,
      currentPeriodEnd: organizations.currentPeriodEnd,
      planId: organizations.planId,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      // Campos de integração Asaas: incluídos pois o super admin precisa deles
      // para gestão, mas NUNCA expor para outros roles.
      asaasCustomerId: organizations.asaasCustomerId,
      asaasSubscriptionId: organizations.asaasSubscriptionId,
    }).from(organizations);

    // Busca a quantidade real de professores vinculados por escola na tabela 'professores' (ou role='professor')
    const profCounts = await db.select({
      organizationId: professores.organizationId,
      total: sql<number>`CAST(count(*) AS INT)`,
    }).from(professores).groupBy(professores.organizationId);

    // ── Contato das escolas (settings.schoolPhone — fonte única do telefone) ──
    const orgIds = orgsList.map((o) => o.id);
    const phoneMap = new Map<number, string | null>();
    const schoolNameMap = new Map<number, string | null>();
    if (orgIds.length > 0) {
      const settingsRows = await db
        .select({
          organizationId: settings.organizationId,
          schoolPhone: settings.schoolPhone,
          schoolName: settings.schoolName,
        })
        .from(settings)
        .where(inArray(settings.organizationId, orgIds));
      for (const s of settingsRows) {
        if (s.organizationId == null) continue;
        if (!phoneMap.has(s.organizationId)) phoneMap.set(s.organizationId, s.schoolPhone || null);
        if (!schoolNameMap.has(s.organizationId)) schoolNameMap.set(s.organizationId, s.schoolName || null);
      }
    }

    // Busca a quantidade real de alunos ATIVOS cadastrados por escola
    const studentCounts = await db.select({
      organizationId: students.organizationId,
      total: sql<number>`CAST(count(*) AS INT)`,
    }).from(students).where(eq(students.status, "ativo")).groupBy(students.organizationId);

    // Busca os usuários admins e o último acesso por organização
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      organizationId: users.organizationId,
      role: users.role,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    }).from(users);

    const profCountMap = new Map(profCounts.map(r => [r.organizationId, r.total]));
    const studentCountMap = new Map(studentCounts.map(r => [r.organizationId, r.total]));
    
    // Mapeia donos por org (priorizando role='admin', senão o primeiro usuário criado da org)
    const ownerMap = new Map<number | null, any>();
    const lastAccessMap = new Map<number | null, Date>();

    for (const u of allUsers) {
      if (!u.organizationId) continue;

      // Guarda a data do último acesso mais recente da organização
      const currentLatest = lastAccessMap.get(u.organizationId);
      if (!currentLatest || (u.lastSignedIn && new Date(u.lastSignedIn) > new Date(currentLatest))) {
        lastAccessMap.set(u.organizationId, u.lastSignedIn);
      }

      // Define dono
      const existingOwner = ownerMap.get(u.organizationId);
      if (!existingOwner) {
        ownerMap.set(u.organizationId, u);
      } else if (existingOwner.role !== 'admin' && u.role === 'admin') {
        ownerMap.set(u.organizationId, u);
      }
    }

    return orgsList.map(org => ({
      ...org,
      owner: ownerMap.get(org.id) ?? null,
      lastSignedIn: lastAccessMap.get(org.id) ?? null,
      totalUsers: profCountMap.get(org.id) ?? 0,
      totalStudents: studentCountMap.get(org.id) ?? 0,
      // Contato da escola (para o super admin entrar em contato direto)
      schoolPhone: phoneMap.get(org.id) ?? null,
      schoolNameConfigured: schoolNameMap.get(org.id) ?? null,
    }));
  }),

  // ─── Exclusão de organização: com transação e Drizzle tipado ─────────────
  deleteOrganization: isSuperAdmin
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = input.id; // já validado pelo Zod como int positivo

      // Verifica que a organização existe antes de deletar
      const [org] = await db.select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada." });
      }

      // FIX: envolver em transação para garantir atomicidade
      // FIX: usar Drizzle delete tipado com schema oficial (evita erros de tabelas inexistentes como "messages")
      await db.transaction(async (tx) => {
        // Deleção em ordem respeitando dependências / FKs
        await tx.delete(marketingLogs).where(eq(marketingLogs.organizationId, orgId));
        await tx.delete(marketingJobs).where(eq(marketingJobs.organizationId, orgId));
        await tx.delete(marketingContacts).where(eq(marketingContacts.organizationId, orgId));
        await tx.delete(marketingCampaigns).where(eq(marketingCampaigns.organizationId, orgId));

        // Passo 1: busca todos os IDs de arquivos da organização para deletar
        // file_comments via fileId — cobre registros com organizationId NULL ou de outros usuários
        const orgFileIds = await tx
          .select({ id: studentFiles.id })
          .from(studentFiles)
          .where(eq(studentFiles.organizationId, orgId));
        if (orgFileIds.length > 0) {
          await tx.delete(fileComments)
            .where(inArray(fileComments.fileId, orgFileIds.map(f => f.id)));
        }
        // Passo 2: fallback — deleta file_comments restantes pelo organizationId direto
        await tx.delete(fileComments).where(eq(fileComments.organizationId, orgId));
        await tx.delete(studentFiles).where(eq(studentFiles.organizationId, orgId));
        await tx.delete(studentTimeline).where(eq(studentTimeline.organizationId, orgId));
        await tx.delete(studentGoals).where(eq(studentGoals.organizationId, orgId));
        await tx.delete(studentEvolution).where(eq(studentEvolution.organizationId, orgId));
        await tx.delete(dailyStudyPlans).where(eq(dailyStudyPlans.organizationId, orgId));
        await tx.delete(rescheduleRequests).where(eq(rescheduleRequests.organizationId, orgId));

        await tx.delete(attendanceLogs).where(eq(attendanceLogs.organizationId, orgId));
        await tx.delete(attendanceTokens).where(eq(attendanceTokens.organizationId, orgId));
        await tx.delete(professorPayments).where(eq(professorPayments.organizationId, orgId));
        await tx.delete(contracts).where(eq(contracts.organizationId, orgId));
        await tx.delete(asaasCustomers).where(eq(asaasCustomers.organizationId, orgId));
        await tx.delete(billingAuditLogs).where(eq(billingAuditLogs.organizationId, orgId));
        await tx.delete(paymentDues).where(eq(paymentDues.organizationId, orgId));
        await tx.delete(reminders).where(eq(reminders.organizationId, orgId));
        await tx.delete(reminderTemplates).where(eq(reminderTemplates.organizationId, orgId));

        await tx.delete(chatMessages).where(eq(chatMessages.organizationId, orgId));
        await tx.delete(announcements).where(eq(announcements.organizationId, orgId));
        await tx.delete(messageAutomationRules).where(eq(messageAutomationRules.organizationId, orgId));

        await tx.delete(notifications).where(eq(notifications.organizationId, orgId));
        await tx.delete(fcmTokens).where(eq(fcmTokens.organizationId, orgId));
        await tx.delete(aiDocuments).where(eq(aiDocuments.organizationId, orgId));
        // Deleta mensagens de IA vinculadas às conversas da organização antes das conversas
        const orgConversationIds = await tx.select({ id: aiConversations.id })
          .from(aiConversations)
          .where(eq(aiConversations.organizationId, orgId));
        if (orgConversationIds.length > 0) {
          await tx.delete(aiMessages).where(inArray(aiMessages.conversationId, orgConversationIds.map(c => c.id)));
        }
        await tx.delete(aiConversations).where(eq(aiConversations.organizationId, orgId));
        await tx.delete(chatbotSessions).where(eq(chatbotSessions.organizationId, orgId));
        await tx.delete(crmLeads).where(eq(crmLeads.organizationId, orgId));
        await tx.delete(studioRooms).where(eq(studioRooms.organizationId, orgId));
        await tx.delete(enrollmentLinks).where(eq(enrollmentLinks.organizationId, orgId));

        await tx.delete(analyticsSessions).where(eq(analyticsSessions.organizationId, orgId));
        await tx.delete(analyticsRevenue).where(eq(analyticsRevenue.organizationId, orgId));
        await tx.delete(analyticsSecurityLogs).where(eq(analyticsSecurityLogs.organizationId, orgId));

        await tx.delete(lessons).where(eq(lessons.organizationId, orgId));
        await tx.delete(students).where(eq(students.organizationId, orgId));
        await tx.delete(professores).where(eq(professores.organizationId, orgId));
        await tx.delete(instruments).where(eq(instruments.organizationId, orgId));
        await tx.delete(expenses).where(eq(expenses.organizationId, orgId));
        await tx.delete(settings).where(eq(settings.organizationId, orgId));
        await tx.delete(monthlyStats).where(eq(monthlyStats.organizationId, orgId));

        // Deleta usuários da organização (professores, admins)
        await tx.delete(users).where(eq(users.organizationId, orgId));
        // Por último, deleta a organização em si
        await tx.delete(organizations).where(eq(organizations.id, orgId));
      });

      debugLog(`[SuperAdmin] Organização #${orgId} ("${org.name}") excluída permanentemente.`);
      return { success: true };
    }),

  // ─── Planos ───────────────────────────────────────────────────────────────
  getPlans: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return await db.select().from(systemPlans);
  }),

  savePlan: isSuperAdmin
    .input(z.object({
      id: z.string().min(1).regex(/^[a-z0-9_-]+$/, "ID deve conter apenas letras minúsculas, números, _ ou -"),
      name: z.string().min(1),
      priceMonthly: z.number().min(0, "Preço não pode ser negativo"),
      priceYearly: z.number().min(0, "Preço não pode ser negativo"),
      maxStudents: z.number().int().min(1, "Limite mínimo é 1 aluno").max(999999999, "Limite máximo é 999.999.999 alunos"),
      features: z.array(z.string()),
      isActive: z.boolean(),
      showOnLanding: z.boolean(),
      isPopular: z.boolean().default(false),
      order: z.number().int().default(0),
      allowExtraStudents: z.boolean().default(true),
      extraStudentPrice: z.number().min(0, "Valor do excedente não pode ser negativo").default(1.49),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const exists = await db.select({ id: systemPlans.id }).from(systemPlans).where(eq(systemPlans.id, input.id)).limit(1);
      if (exists.length > 0) {
        await db.update(systemPlans).set({
          name: input.name,
          priceMonthly: input.priceMonthly.toString(),
          priceYearly: input.priceYearly.toString(),
          maxStudents: input.maxStudents,
          features: JSON.stringify(input.features),
          isActive: input.isActive,
          showOnLanding: input.showOnLanding,
          isPopular: input.isPopular,
          order: input.order,
          allowExtraStudents: input.allowExtraStudents,
          extraStudentPrice: input.extraStudentPrice.toString(),
          updatedAt: new Date(),
        }).where(eq(systemPlans.id, input.id));
      } else {
        await db.insert(systemPlans).values({
          id: input.id,
          name: input.name,
          priceMonthly: input.priceMonthly.toString(),
          priceYearly: input.priceYearly.toString(),
          maxStudents: input.maxStudents,
          features: JSON.stringify(input.features),
          isActive: input.isActive,
          showOnLanding: input.showOnLanding,
          isPopular: input.isPopular,
          order: input.order,
          allowExtraStudents: input.allowExtraStudents,
          extraStudentPrice: input.extraStudentPrice.toString(),
        });
      }
      return { success: true };
    }),

  // ─── Cupons ───────────────────────────────────────────────────────────────
  getCoupons: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return await db.select().from(systemCoupons);
  }),

  saveCoupon: isSuperAdmin
    .input(z.object({
      code: z.string().min(1).toUpperCase(),
      discountType: z.enum(['PERCENTAGE', 'FIXED']),
      discountValue: z.number().min(0.01, "Desconto deve ser maior que zero"),
      durationMonths: z.number().int().min(1).nullable(),
      maxUses: z.number().int().min(1).nullable(),
      isActive: z.boolean(),
      validUntil: z.string().nullable().optional(), // data ISO opcional
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Validação extra: porcentagem não pode ser maior que 100%
      if (input.discountType === 'PERCENTAGE' && input.discountValue > 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Desconto percentual não pode ultrapassar 100%." });
      }

      const code = input.code.toUpperCase().trim();
      const exists = await db.select({ code: systemCoupons.code }).from(systemCoupons).where(eq(systemCoupons.code, code)).limit(1);

      if (exists.length > 0) {
        await db.update(systemCoupons).set({
          discountType: input.discountType,
          discountValue: input.discountValue.toString(),
          durationMonths: input.durationMonths,
          maxUses: input.maxUses,
          isActive: input.isActive,
        }).where(eq(systemCoupons.code, code));
      } else {
        await db.insert(systemCoupons).values({
          code,
          discountType: input.discountType,
          discountValue: input.discountValue.toString(),
          durationMonths: input.durationMonths,
          maxUses: input.maxUses,
          isActive: input.isActive,
        });
      }
      return { success: true };
    }),

  // ─── Ação de gestão: alterar status de assinatura de uma escola ──────────
  updateOrgSubscription: isSuperAdmin
    .input(z.object({
      orgId: z.number().int().positive(),
      // Valores válidos que correspondem aos usados no sistema
      subscriptionStatus: z.enum(['active', 'trialing', 'pending', 'past_due', 'canceled', 'inactive', 'suspended']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verificar que a org existe antes de alterar
      const [org] = await db.select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, input.orgId))
        .limit(1);

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada." });
      }

      await db.update(organizations)
        .set({ subscriptionStatus: input.subscriptionStatus, updatedAt: new Date() })
        .where(eq(organizations.id, input.orgId));

      debugLog(`[SuperAdmin] Status da org #${input.orgId} alterado para "${input.subscriptionStatus}".`);
      return { success: true };
    }),

  // ─── Ação de suporte: redefinir senha do usuário administrador da escola ─────
  resetUserPassword: isSuperAdmin
    .input(z.object({
      userId: z.number().int().positive(),
      newPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const crypto = await import("crypto");
      const salt = crypto.randomBytes(16).toString("hex");
      const derivedKey = crypto.scryptSync(input.newPassword, salt, 64).toString("hex");
      const passwordHash = `${salt}:${derivedKey}`;

      await db.update(users)
        .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      debugLog(`[SuperAdmin] Senha do usuário #${input.userId} redefinida pelo Super Admin.`);
      return { success: true };
    }),

  // ─── GESTÃO DE CLIENTES / LOGOS DA LANDING PAGE ─────────────────────────────
  listLandingClients: isSuperAdmin
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { asc } = await import("drizzle-orm");
      return await db.select().from(landingClients).orderBy(asc(landingClients.order), asc(landingClients.createdAt));
    }),

  createLandingClient: isSuperAdmin
    .input(z.object({
      name: z.string().min(1, "Nome da escola ou cliente é obrigatório"),
      logoUrl: z.string().min(1, "URL ou imagem da logo é obrigatória"),
      websiteUrl: z.string().optional().nullable(),
      testimonial: z.string().optional().nullable(),
      order: z.number().int().default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [newClient] = await db.insert(landingClients).values({
        name: input.name,
        logoUrl: input.logoUrl,
        websiteUrl: input.websiteUrl || null,
        testimonial: input.testimonial || null,
        order: input.order,
        isActive: input.isActive,
      }).returning();

      return newClient;
    }),

  updateLandingClient: isSuperAdmin
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).optional(),
      logoUrl: z.string().min(1).optional(),
      websiteUrl: z.string().optional().nullable(),
      testimonial: z.string().optional().nullable(),
      order: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...data } = input;
      const [updated] = await db.update(landingClients)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(landingClients.id, id))
        .returning();

      return updated;
    }),

  deleteLandingClient: isSuperAdmin
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(landingClients).where(eq(landingClients.id, input.id));
      return { success: true };
    }),

  // ─── GESTÃO DE SLIDES DE FUNCIONALIDADES (HERO SLIDER) ──────────────────────
  listHeroSlides: isSuperAdmin
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { asc } = await import("drizzle-orm");
      return await db.select().from(landingHeroSlides).orderBy(asc(landingHeroSlides.order), asc(landingHeroSlides.id));
    }),

  createHeroSlide: isSuperAdmin
    .input(z.object({
      title: z.string().min(1, "Título é obrigatório"),
      highlight: z.string().min(1, "Texto destacado é obrigatório"),
      subtitle: z.string().min(1, "Subtítulo é obrigatório"),
      points: z.array(z.string()).default([]),
      imageUrl: z.string().min(1, "Imagem do slide é obrigatória"),
      bgTheme: z.string().default("slate-900"),
      order: z.number().int().default(0),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [newSlide] = await db.insert(landingHeroSlides).values({
        title: input.title,
        highlight: input.highlight,
        subtitle: input.subtitle,
        points: JSON.stringify(input.points),
        imageUrl: input.imageUrl,
        bgTheme: input.bgTheme,
        order: input.order,
        isActive: input.isActive,
      }).returning();

      return newSlide;
    }),

  updateHeroSlide: isSuperAdmin
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).optional(),
      highlight: z.string().min(1).optional(),
      subtitle: z.string().min(1).optional(),
      points: z.array(z.string()).optional(),
      imageUrl: z.string().min(1).optional(),
      bgTheme: z.string().optional(),
      order: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, points, ...rest } = input;
      const updateData: any = { ...rest, updatedAt: new Date() };
      if (points !== undefined) {
        updateData.points = JSON.stringify(points);
      }

      const [updated] = await db.update(landingHeroSlides)
        .set(updateData)
        .where(eq(landingHeroSlides.id, id))
        .returning();

      return updated;
    }),

  deleteHeroSlide: isSuperAdmin
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(landingHeroSlides).where(eq(landingHeroSlides.id, input.id));
      return { success: true };
    }),

  // ─── BUSCA GLOBAL DE USUÁRIOS (Para Impersonação / Suporte) ───────────────
  listAllUsers: isSuperAdmin
    .input(z.object({
      search: z.string().optional(),
      role: z.enum(['admin', 'professor', 'aluno']).optional(),
      organizationId: z.number().int().optional(),
      limit: z.number().int().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { ilike, or, and, desc } = await import("drizzle-orm");
      const conditions: any[] = [];

      if (input?.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(ilike(users.name, term), ilike(users.email, term)));
      }

      if (input?.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input?.organizationId) {
        conditions.push(eq(users.organizationId, input.organizationId));
      }

      const usersList = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        organizationId: users.organizationId,
        studentId: users.studentId,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.lastSignedIn), desc(users.id))
      .limit(input?.limit || 50);

      // Buscar nomes das organizações correspondentes
      const orgIds = Array.from(new Set(usersList.map(u => u.organizationId).filter(Boolean))) as number[];
      let orgMap = new Map<number, string>();
      if (orgIds.length > 0) {
        const orgs = await db.select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, orgIds));
        orgMap = new Map(orgs.map(o => [o.id, o.name]));
      }

      return usersList.map(u => ({
        ...u,
        organizationName: u.organizationId ? orgMap.get(u.organizationId) || "Escola Desconhecida" : "Sem Escola",
      }));
    }),

  // ─── INICIAR SESSÃO DE SUPORTE / IMPERSONAÇÃO ─────────────────────────────
  impersonateUser: isSuperAdmin
    .input(z.object({
      targetUserId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Localiza o usuário alvo
      const [targetUser] = await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário alvo não encontrado." });
      }

      if (targetUser.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você já está conectado na sua própria conta de Super Admin." });
      }

      const { sdk } = await import("./_core/sdk");
      const { COOKIE_NAME } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("./_core/cookies");

      // Gera o token de sessão do usuário alvo preservando a identidade do Super Admin
      const sessionToken = await sdk.createSessionToken(targetUser.openId, {
        name: targetUser.name || "",
        expiresInMs: 4 * 60 * 60 * 1000, // 4 horas de sessão de suporte
        impersonatorAdminId: ctx.user.id,
        impersonatorAdminName: ctx.user.name || ctx.user.email || "Super Admin",
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 4 * 60 * 60 * 1000,
      });

      debugLog(`[Impersonation] Super Admin #${ctx.user.id} (${ctx.user.email}) acessou a conta de #${targetUser.id} (${targetUser.email} - ${targetUser.role})`);

      // Determina a rota de redirecionamento apropriada
      let redirectUrl = "/dashboard";
      if (targetUser.role === "aluno") {
        redirectUrl = "/portal";
      }

      return {
        success: true,
        targetUser: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
        },
        redirectUrl,
      };
    }),

  // ─── ENCERRAR SESSÃO DE SUPORTE / VOLTAR PARA SUPER ADMIN ─────────────────
  stopImpersonation: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (!ctx.impersonatorAdminId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Você não está em uma sessão de impersonação / modo suporte ativa.",
        });
      }

      const [adminUser] = await db.select().from(users).where(eq(users.id, ctx.impersonatorAdminId)).limit(1);
      if (!adminUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conta de Super Admin de origem não encontrada." });
      }

      const { sdk } = await import("./_core/sdk");
      const { COOKIE_NAME } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("./_core/cookies");

      // Gera o token restaurado do Super Admin
      const sessionToken = await sdk.createSessionToken(adminUser.openId, {
        name: adminUser.name || "",
        expiresInMs: 30 * 24 * 60 * 60 * 1000,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      debugLog(`[Impersonation] Sessão de suporte encerrada. Retornando para Super Admin #${adminUser.id} (${adminUser.email})`);

      return {
        success: true,
        redirectUrl: "/super-admin",
      };
    }),
});


