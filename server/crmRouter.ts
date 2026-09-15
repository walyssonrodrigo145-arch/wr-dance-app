import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { crmLeads, crmActivities, crmFollowUps, crmSettings, students, users } from "../drizzle/schema";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";

export const crmRouter = router({
  // ── Listagem Geral de Leads com Filtros ──────────────────────────────────
  listLeads: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        stage: z.string().optional(),
        priority: z.string().optional(),
        source: z.string().optional(),
        assignedToUserId: z.number().optional(),
        tag: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) return [];

      const conditions = [eq(crmLeads.organizationId, orgId)];

      if (input?.stage && input.stage !== "todos") {
        conditions.push(eq(crmLeads.stage, input.stage));
      }
      if (input?.priority && input.priority !== "todas") {
        conditions.push(eq(crmLeads.priority, input.priority));
      }
      if (input?.source && input.source !== "todas") {
        conditions.push(eq(crmLeads.source, input.source));
      }
      if (input?.assignedToUserId) {
        conditions.push(eq(crmLeads.assignedToUserId, input.assignedToUserId));
      }
      if (input?.startDate) {
        conditions.push(gte(crmLeads.createdAt, new Date(input.startDate)));
      }
      if (input?.endDate) {
        conditions.push(lte(crmLeads.createdAt, new Date(input.endDate)));
      }

      const results = await db
        .select()
        .from(crmLeads)
        .where(and(...conditions))
        .orderBy(desc(crmLeads.createdAt));

      // Filtro local adicional para busca de texto e tags
      return results.filter((lead) => {
        if (input?.search && input.search.trim() !== "") {
          const q = input.search.toLowerCase();
          const matchName = lead.name?.toLowerCase().includes(q);
          const matchPhone = lead.phone?.toLowerCase().includes(q);
          const matchEmail = lead.email?.toLowerCase().includes(q);
          const matchInst = lead.instrument?.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchEmail && !matchInst) return false;
        }
        if (input?.tag && input.tag !== "todas") {
          const tagsArray = (lead.tags as string[]) || [];
          if (!tagsArray.includes(input.tag)) return false;
        }
        return true;
      });
    }),

  // ── Detalhes do Lead + Timeline + Follow-ups ─────────────────────────────
  getLeadDetails: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const [lead] = await db
        .select()
        .from(crmLeads)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });

      const activities = await db
        .select()
        .from(crmActivities)
        .where(and(eq(crmActivities.leadId, input.leadId), eq(crmActivities.organizationId, orgId)))
        .orderBy(desc(crmActivities.createdAt));

      const followUps = await db
        .select()
        .from(crmFollowUps)
        .where(and(eq(crmFollowUps.leadId, input.leadId), eq(crmFollowUps.organizationId, orgId)))
        .orderBy(asc(crmFollowUps.dueDate));

      return { lead, activities, followUps };
    }),

  // ── Cadastro de Lead ─────────────────────────────────────────────────────
  createLead: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        birthDate: z.string().optional().nullable(),
        cityState: z.string().optional().nullable(),
        productService: z.string().optional().nullable(),
        instrument: z.string().optional().nullable(),
        course: z.string().optional().nullable(),
        level: z.string().optional().nullable(),
        modality: z.string().optional().nullable(),
        preferredTeacherId: z.number().optional().nullable(),
        stage: z.string().default("novo"),
        source: z.string().default("WhatsApp"),
        assignedToUserId: z.number().optional().nullable(),
        value: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseFloat(v.replace(",", ".")) || 0 : v).default(0),
        priority: z.string().default("media"),
        conversionProbability: z.number().default(50),
        expectedEnrollmentDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        tags: z.array(z.string()).default([]),
        customFields: z.record(z.any()).optional().default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN", message: "Sem organização vinculada" });

      const now = new Date();
      const itemProd = input.productService || input.instrument || input.course || null;

      const [created] = await db
        .insert(crmLeads)
        .values({
          organizationId: orgId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          birthDate: input.birthDate,
          cityState: input.cityState,
          productService: itemProd,
          instrument: itemProd,
          course: input.course,
          level: input.level,
          modality: input.modality,
          preferredTeacherId: input.preferredTeacherId,
          stage: input.stage,
          source: input.source,
          assignedToUserId: input.assignedToUserId,
          value: String(input.value),
          priority: input.priority,
          conversionProbability: input.conversionProbability,
          expectedEnrollmentDate: input.expectedEnrollmentDate ? new Date(input.expectedEnrollmentDate) : null,
          notes: input.notes,
          tags: input.tags,
          customFields: input.customFields,
          firstContactAt: now,
          lastContactAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Registrar atividade na Timeline
      await db.insert(crmActivities).values({
        organizationId: orgId,
        leadId: created.id,
        title: "Lead Criado",
        type: "criacao",
        description: `Lead cadastrado via ${input.source}. Estágio inicial: ${input.stage}`,
        assignedUserName: ctx.user.name || "Sistema",
        createdAt: now,
      });

      return created;
    }),

  // ── Atualização do Lead ──────────────────────────────────────────────────
  updateLead: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        name: z.string().min(1, "Nome é obrigatório"),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        birthDate: z.string().optional().nullable(),
        cityState: z.string().optional().nullable(),
        productService: z.string().optional().nullable(),
        instrument: z.string().optional().nullable(),
        course: z.string().optional().nullable(),
        level: z.string().optional().nullable(),
        modality: z.string().optional().nullable(),
        preferredTeacherId: z.number().optional().nullable(),
        source: z.string().optional(),
        assignedToUserId: z.number().optional().nullable(),
        value: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseFloat(v.replace(",", ".")) || 0 : v).optional(),
        priority: z.string().optional(),
        conversionProbability: z.number().optional(),
        expectedEnrollmentDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        tags: z.array(z.string()).optional(),
        customFields: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const updateData: any = {
        name: input.name,
        phone: input.phone,
        email: input.email,
        birthDate: input.birthDate,
        cityState: input.cityState,
        instrument: input.instrument,
        course: input.course,
        level: input.level,
        modality: input.modality,
        preferredTeacherId: input.preferredTeacherId,
        notes: input.notes,
        updatedAt: new Date(),
      };

      if (input.source) updateData.source = input.source;
      if (input.assignedToUserId !== undefined) updateData.assignedToUserId = input.assignedToUserId;
      if (input.value !== undefined) updateData.value = String(input.value);
      if (input.priority) updateData.priority = input.priority;
      if (input.conversionProbability !== undefined) updateData.conversionProbability = input.conversionProbability;
      if (input.expectedEnrollmentDate !== undefined) {
        updateData.expectedEnrollmentDate = input.expectedEnrollmentDate ? new Date(input.expectedEnrollmentDate) : null;
      }
      if (input.tags) updateData.tags = input.tags;

      const [updated] = await db
        .update(crmLeads)
        .set(updateData)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)))
        .returning();

      return updated;
    }),

  // ── Mover Estágio (Kanban) ───────────────────────────────────────────────
  moveStage: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        stage: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const [lead] = await db
        .select()
        .from(crmLeads)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      const oldStage = lead.stage;
      const now = new Date();

      const [updated] = await db
        .update(crmLeads)
        .set({
          stage: input.stage,
          lastContactAt: now,
          updatedAt: now,
        })
        .where(eq(crmLeads.id, input.leadId))
        .returning();

      // Gravar na timeline
      await db.insert(crmActivities).values({
        organizationId: orgId,
        leadId: input.leadId,
        title: "Estágio Alterado",
        type: "mudanca_etapa",
        description: `Lead movido de "${oldStage}" para "${input.stage}".`,
        assignedUserName: ctx.user.name || "Sistema",
        createdAt: now,
      });

      return updated;
    }),

  moveLeadStage: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        leadId: z.number().optional(),
        stage: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const targetId = input.leadId || input.id;
      if (!targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID do lead é obrigatório" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const [updated] = await db
        .update(crmLeads)
        .set({ stage: input.stage, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, targetId), eq(crmLeads.organizationId, orgId)))
        .returning();

      return updated;
    }),

  getGoals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const orgId = ctx.user.organizationId;
    if (!orgId) return null;

    const { crmGoals } = await import("../drizzle/schema");
    const currentMonthYear = new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });

    let [goal] = await db.select().from(crmGoals).where(and(eq(crmGoals.organizationId, orgId), eq(crmGoals.monthYear, currentMonthYear))).limit(1);

    if (!goal) {
      const [created] = await db.insert(crmGoals).values({
        organizationId: orgId,
        monthYear: currentMonthYear,
        targetNewStudents: 10,
        targetDemos: 25,
        targetProposals: 20,
        targetDeals: 10,
        targetMrr: "2000.00",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      goal = created;
    }
    return goal;
  }),

  saveGoal: protectedProcedure
    .input(z.object({
      targetNewStudents: z.number(),
      targetDemos: z.number(),
      targetProposals: z.number(),
      targetDeals: z.number(),
      targetMrr: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const { crmGoals } = await import("../drizzle/schema");
      const currentMonthYear = new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });

      const [existing] = await db.select().from(crmGoals).where(and(eq(crmGoals.organizationId, orgId), eq(crmGoals.monthYear, currentMonthYear))).limit(1);

      if (existing) {
        const [updated] = await db.update(crmGoals).set({ ...input, updatedAt: new Date() }).where(eq(crmGoals.id, existing.id)).returning();
        return updated;
      } else {
        const [created] = await db.insert(crmGoals).values({
          organizationId: orgId,
          monthYear: currentMonthYear,
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
        return created;
      }
    }),

  listActivities: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId;
    if (!orgId) return [];

    const list = await db.select().from(crmActivities).where(eq(crmActivities.organizationId, orgId)).orderBy(desc(crmActivities.createdAt)).limit(10);
    return list;
  }),

  // ── Marcar Lead como Perdido ─────────────────────────────────────────────
  markLost: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        lostReason: z.string().min(1, "Selecione o motivo da perda"),
        lossNotes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();

      const [updated] = await db
        .update(crmLeads)
        .set({
          stage: "perdido",
          lostReason: input.lostReason,
          lossNotes: input.lossNotes,
          updatedAt: now,
        })
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)))
        .returning();

      // Registrar atividade na Timeline
      await db.insert(crmActivities).values({
        organizationId: orgId,
        leadId: input.leadId,
        title: "Lead Perdido",
        type: "perda",
        description: `Motivo: ${input.lostReason}${input.lossNotes ? ` — Obs: ${input.lossNotes}` : ""}`,
        assignedUserName: ctx.user.name || "Sistema",
        createdAt: now,
      });

      return updated;
    }),

  // ── Converter Lead em Aluno ──────────────────────────────────────────────
  convertToStudent: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        monthlyFee: z.number().default(0),
        dueDay: z.number().default(10),
        cpf: z.string().optional().nullable(),
        responsibleName: z.string().optional().nullable(),
        responsiblePhone: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const [lead] = await db
        .select()
        .from(crmLeads)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });

      const now = new Date();
      const feeValue = input.monthlyFee > 0 ? input.monthlyFee : Number(lead.value) || 0;

      // Criar Aluno no banco do MusicPro
      const [student] = await db
        .insert(students)
        .values({
          userId: ctx.user.id,
          professorId: lead.preferredTeacherId || ctx.user.id,
          name: lead.name,
          phone: lead.phone || "",
          email: lead.email || `${lead.name.toLowerCase().replace(/[^a-z0-9]/g, ".")}@aluno.local`,
          monthlyFee: String(feeValue),
          dueDay: input.dueDay,
          status: "ativo",
          notes: `[Convertido do CRM de Leads]\nInstrumento: ${lead.instrument || "Não informado"}\nOrigem: ${lead.source || "CRM"}\nObs Lead: ${lead.notes || ""}\n${input.notes || ""}`,
          startDate: now.toISOString().split("T")[0],
        })
        .returning();

      // Atualizar Lead no CRM
      const [updatedLead] = await db
        .update(crmLeads)
        .set({
          stage: "matriculado",
          convertedStudentId: student.id,
          convertedAt: now,
          updatedAt: now,
        })
        .where(eq(crmLeads.id, lead.id))
        .returning();

      // Registrar atividade na Timeline
      await db.insert(crmActivities).values({
        organizationId: orgId,
        leadId: lead.id,
        title: "Matrícula Realizada",
        type: "conversao",
        description: `Lead convertido com sucesso em Aluno (ID #${student.id}). Mensalidade: R$ ${feeValue.toFixed(2)}.`,
        assignedUserName: ctx.user.name || "Sistema",
        createdAt: now,
      });

      return { student, lead: updatedLead };
    }),

  // ── Excluir Lead ─────────────────────────────────────────────────────────
  deleteLead: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      // Excluir followups e atividades do lead
      await db.delete(crmFollowUps).where(and(eq(crmFollowUps.leadId, input.leadId), eq(crmFollowUps.organizationId, orgId)));
      await db.delete(crmActivities).where(and(eq(crmActivities.leadId, input.leadId), eq(crmActivities.organizationId, orgId)));
      await db.delete(crmLeads).where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      return { ok: true };
    }),

  // ── Gestão de Follow-ups e Tarefas ───────────────────────────────────────
  listFollowUps: protectedProcedure
    .input(
      z.object({
        filter: z.enum(["atrasados", "hoje", "proximos", "todos"]).default("todos"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) return [];

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const items = await db
        .select({
          followUp: crmFollowUps,
          leadName: crmLeads.name,
          leadPhone: crmLeads.phone,
          leadStage: crmLeads.stage,
        })
        .from(crmFollowUps)
        .leftJoin(crmLeads, eq(crmFollowUps.leadId, crmLeads.id))
        .where(eq(crmFollowUps.organizationId, orgId))
        .orderBy(asc(crmFollowUps.dueDate));

      const filterType = input?.filter || "todos";

      return items.filter(({ followUp }) => {
        if (followUp.completed) return filterType === "todos";

        const due = new Date(followUp.dueDate);
        if (filterType === "atrasados") return due < todayStart;
        if (filterType === "hoje") return due >= todayStart && due <= todayEnd;
        if (filterType === "proximos") return due > todayEnd;

        return true;
      });
    }),

  createFollowUp: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        title: z.string().min(1, "Título é obrigatório"),
        dueDate: z.string(),
        dueTime: z.string().optional().nullable(),
        contactType: z.enum(["whatsapp", "ligacao", "reuniao", "email", "outro"]).default("whatsapp"),
        assignedToUserId: z.number().optional().nullable(),
        assignedUserName: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      // AUDIT-P1 FIX (IDOR): validar que o lead pertence à organização antes de
      // escrever follow-up/atividade e atualizar o lead
      const [ownedLead] = await db.select({ id: crmLeads.id })
        .from(crmLeads)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)))
        .limit(1);
      if (!ownedLead) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Lead não encontrado nesta escola." });
      }

      const dueDateObj = new Date(input.dueDate);

      const [created] = await db
        .insert(crmFollowUps)
        .values({
          organizationId: orgId,
          leadId: input.leadId,
          title: input.title,
          dueDate: dueDateObj,
          dueTime: input.dueTime,
          contactType: input.contactType,
          assignedToUserId: input.assignedToUserId,
          assignedUserName: input.assignedUserName || ctx.user.name || "Responsável",
          notes: input.notes,
          completed: false,
          createdAt: new Date(),
        })
        .returning();

      // Atualizar próximo follow-up no lead
      await db
        .update(crmLeads)
        .set({ nextFollowUpAt: dueDateObj, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      // Registrar atividade na Timeline
      await db.insert(crmActivities).values({
        organizationId: orgId,
        leadId: input.leadId,
        title: "Follow-up Agendado",
        type: "follow_up",
        description: `Agendado para ${dueDateObj.toLocaleDateString("pt-BR")} ${input.dueTime || ""}: ${input.title}`,
        assignedUserName: ctx.user.name || "Sistema",
        createdAt: new Date(),
      });

      return created;
    }),

  completeFollowUp: protectedProcedure
    .input(z.object({ followUpId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();

      const [updated] = await db
        .update(crmFollowUps)
        .set({
          completed: true,
          completedAt: now,
        })
        .where(and(eq(crmFollowUps.id, input.followUpId), eq(crmFollowUps.organizationId, orgId)))
        .returning();

      if (updated) {
        // Timeline log
        await db.insert(crmActivities).values({
          organizationId: orgId,
          leadId: updated.leadId,
          title: "Follow-up Concluído",
          type: "contato",
          description: `Tarefa "${updated.title}" concluída por ${ctx.user.name || "Usuário"}.`,
          assignedUserName: ctx.user.name || "Sistema",
          createdAt: now,
        });
      }

      return updated;
    }),

  // ── Adicionar Interação Manual na Timeline ────────────────────────────────
  addActivity: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        type: z.string().default("observacao"),
        title: z.string().min(1, "Título é obrigatório"),
        description: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      // AUDIT-P1 FIX (IDOR): validar que o lead pertence à organização
      const [ownedLead] = await db.select({ id: crmLeads.id })
        .from(crmLeads)
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)))
        .limit(1);
      if (!ownedLead) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Lead não encontrado nesta escola." });
      }

      const now = new Date();

      const [activity] = await db
        .insert(crmActivities)
        .values({
          organizationId: orgId,
          leadId: input.leadId,
          title: input.title,
          type: input.type,
          description: input.description,
          assignedUserName: ctx.user.name || "Usuário",
          createdAt: now,
        })
        .returning();

      // Atualizar último contato do lead
      await db
        .update(crmLeads)
        .set({ lastContactAt: now, updatedAt: now })
        .where(and(eq(crmLeads.id, input.leadId), eq(crmLeads.organizationId, orgId)));

      return activity;
    }),

  // ── Métricas e Dashboard ─────────────────────────────────────────────────
  getDashboardMetrics: protectedProcedure
    .input(
      z.object({
        period: z.enum(["hoje", "7d", "30d", "mes_atual", "mes_anterior", "todos"]).default("30d"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) return null;

      const leads = await db
        .select()
        .from(crmLeads)
        .where(eq(crmLeads.organizationId, orgId));

      const now = new Date();
      let periodStartDate: Date | null = null;

      const period = input?.period || "30d";
      if (period === "hoje") {
        periodStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      } else if (period === "7d") {
        periodStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "30d") {
        periodStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === "mes_atual") {
        periodStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      } else if (period === "mes_anterior") {
        periodStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      }

      const filteredLeads = periodStartDate
        ? leads.filter((l) => new Date(l.createdAt) >= periodStartDate!)
        : leads;

      const totalLeads = filteredLeads.length;
      const newLeads = filteredLeads.filter((l) => l.stage === "novo").length;
      const inServiceLeads = filteredLeads.filter((l) =>
        ["primeiro_contato", "em_conversa", "aula_experimental", "proposta", "aguardando_decisao"].includes(l.stage)
      ).length;
      const convertedLeads = filteredLeads.filter((l) => l.stage === "matriculado").length;
      const lostLeads = filteredLeads.filter((l) => l.stage === "perdido").length;
      const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

      const totalPotentialValue = filteredLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);

      // Follow-ups pendentes no geral da escola
      const followUps = await db
        .select()
        .from(crmFollowUps)
        .where(and(eq(crmFollowUps.organizationId, orgId), eq(crmFollowUps.completed, false)));

      const pendingFollowUps = followUps.length;

      // Leads sem contato recente (> 5 dias)
      const staleCutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const staleLeadsCount = filteredLeads.filter((l) => {
        if (["matriculado", "perdido"].includes(l.stage)) return false;
        const lastContact = l.lastContactAt ? new Date(l.lastContactAt) : new Date(l.createdAt);
        return lastContact < staleCutoff;
      }).length;

      const demosCount = filteredLeads.filter((l) => ["demonstracao", "aula_experimental"].includes(l.stage)).length;
      const proposalsCount = filteredLeads.filter((l) => l.stage === "proposta").length;
      const negotiationsCount = filteredLeads.filter((l) => l.stage === "negociacao").length;
      const closedDeals = filteredLeads.filter((l) => ["fechado", "matriculado"].includes(l.stage)).length;
      const activeLeads = filteredLeads.filter((l) => !["fechado", "matriculado", "perdido"].includes(l.stage)).length;
      const newMrr = filteredLeads.filter((l) => ["fechado", "matriculado"].includes(l.stage)).reduce((acc, l) => acc + (Number(l.value) || 0), 0);

      const sourcesMap: Record<string, number> = {};
      filteredLeads.forEach((l) => {
        const src = l.source || "WhatsApp";
        sourcesMap[src] = (sourcesMap[src] || 0) + 1;
      });
      const sources = Object.entries(sourcesMap).map(([name, count]) => ({
        name,
        count,
        percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
      }));

      return {
        totalLeads,
        newLeads,
        inServiceLeads,
        convertedLeads,
        lostLeads,
        conversionRate,
        totalPotentialValue,
        pendingFollowUps,
        staleLeadsCount,
        demosCount,
        proposalsCount,
        negotiationsCount,
        closedDeals,
        activeLeads,
        newMrr,
        sources,
        funnel: [],
      };
    }),

  // ── Relatórios Completos ────────────────────────────────────────────────
  getReportsData: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const orgId = ctx.user.organizationId;
    if (!orgId) return { origins: [], instruments: [], stages: [], lostReasons: [] };

    const leads = await db
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.organizationId, orgId));

    // Por Origem
    const originMap: Record<string, { total: number; converted: number; value: number }> = {};
    // Por Instrumento
    const instrumentMap: Record<string, { total: number; converted: number }> = {};
    // Por Motivo de Perda
    const lossMap: Record<string, number> = {};

    const stageCounts: Record<string, number> = {
      novo: 0,
      primeiro_contato: 0,
      em_conversa: 0,
      aula_experimental: 0,
      proposta: 0,
      aguardando_decisao: 0,
      matriculado: 0,
      perdido: 0,
    };

    leads.forEach((lead) => {
      const src = lead.source || "Outros";
      if (!originMap[src]) originMap[src] = { total: 0, converted: 0, value: 0 };
      originMap[src].total += 1;
      originMap[src].value += Number(lead.value) || 0;
      if (lead.stage === "matriculado") originMap[src].converted += 1;

      const inst = lead.instrument || "Não Informado";
      if (!instrumentMap[inst]) instrumentMap[inst] = { total: 0, converted: 0 };
      instrumentMap[inst].total += 1;
      if (lead.stage === "matriculado") instrumentMap[inst].converted += 1;

      if (lead.stage === "perdido" && lead.lostReason) {
        lossMap[lead.lostReason] = (lossMap[lead.lostReason] || 0) + 1;
      }

      if (stageCounts[lead.stage] !== undefined) {
        stageCounts[lead.stage] += 1;
      }
    });

    const origins = Object.entries(originMap).map(([source, data]) => ({
      source,
      total: data.total,
      converted: data.converted,
      conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
      totalValue: data.value,
    }));

    const instruments = Object.entries(instrumentMap).map(([instrument, data]) => ({
      instrument,
      total: data.total,
      converted: data.converted,
      conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));

    const lostReasons = Object.entries(lossMap).map(([reason, count]) => ({
      reason,
      count,
    }));

    const stages = Object.entries(stageCounts).map(([stage, count]) => ({
      stage,
      count,
    }));

    return { origins, instruments, stages, lostReasons };
  }),

  // ── Configurações Personalizadas (Origens, Motivos de Perda, Tags) ──────
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const orgId = ctx.user.organizationId;
    if (!orgId) return { customOrigins: [], customLossReasons: [], customTags: [] };

    const [setting] = await db
      .select()
      .from(crmSettings)
      .where(eq(crmSettings.organizationId, orgId));

    const defaultOrigins = ["Instagram", "WhatsApp", "Facebook", "Google", "Site", "Indicação", "Evento", "Aula Experimental", "Outro"];
    const defaultLossReasons = ["Desistiu", "Preço", "Horário", "Escolheu outra escola", "Não respondeu", "Sem interesse", "Outro"];
    const defaultTags = ["Alta prioridade", "Aula experimental", "Teclado", "Violão", "Criança", "Adulto", "Retorno", "Urgente"];

    if (!setting) {
      return {
        customOrigins: defaultOrigins,
        customLossReasons: defaultLossReasons,
        customTags: defaultTags,
      };
    }

    return {
      customOrigins: Array.from(new Set([...defaultOrigins, ...((setting.customOrigins as string[]) || [])])),
      customLossReasons: Array.from(new Set([...defaultLossReasons, ...((setting.customLossReasons as string[]) || [])])),
      customTags: Array.from(new Set([...defaultTags, ...((setting.customTags as string[]) || [])])),
    };
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        customOrigins: z.array(z.string()),
        customLossReasons: z.array(z.string()),
        customTags: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "FORBIDDEN" });

      const [existing] = await db
        .select()
        .from(crmSettings)
        .where(eq(crmSettings.organizationId, orgId));

      if (existing) {
        const [updated] = await db
          .update(crmSettings)
          .set({
            customOrigins: input.customOrigins,
            customLossReasons: input.customLossReasons,
            customTags: input.customTags,
            updatedAt: new Date(),
          })
          .where(eq(crmSettings.organizationId, orgId))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(crmSettings)
          .values({
            organizationId: orgId,
            customOrigins: input.customOrigins,
            customLossReasons: input.customLossReasons,
            customTags: input.customTags,
            updatedAt: new Date(),
          })
          .returning();
        return created;
      }
    }),
});
