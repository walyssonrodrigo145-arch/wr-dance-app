// ─── Eventos / Espetáculos (DancePro) ────────────────────────────────────────
// Recitais, festivais, competições e workshops: coreografias com ordem de
// apresentação e participantes com autorização de imagem/participação.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coreografias, eventChoreographies, eventParticipants, events, instruments, students } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const EVENT_TYPES = ["recital", "festival", "competicao", "workshop", "audicao", "ensaio_geral", "outro"] as const;
const EVENT_STATUS = ["planejado", "confirmado", "realizado", "cancelado"] as const;
const PARTICIPANT_STATUS = ["convidado", "confirmado", "recusado"] as const;

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === "admin" || role === "professor" || role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

async function resolveStudentId(db: any, ctx: { user: { id: number; studentId?: number | null; organizationId?: number | null } }) {
  if (ctx.user.studentId) return ctx.user.studentId as number;
  const [found] = await db.select({ id: students.id })
    .from(students)
    .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, ctx.user.organizationId!)))
    .limit(1);
  return found?.id ?? null;
}

const eventInput = z.object({
  name: z.string().min(2, "Informe o nome do evento").max(255),
  type: z.enum(EVENT_TYPES).default("recital"),
  description: z.string().max(5000).nullable().optional(),
  venueName: z.string().max(255).nullable().optional(),
  venueAddress: z.string().max(500).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  status: z.enum(EVENT_STATUS).default("planejado"),
  requiresAuthorization: z.boolean().default(true),
});

export const eventosRouters = {
  eventos: router({
    list: protectedProcedure.input(z.object({
      search: z.string().max(120).optional(),
      status: z.enum(EVENT_STATUS).optional(),
      upcomingOnly: z.boolean().default(false),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const coreografiasCount = sql<number>`(SELECT COUNT(*) FROM "event_choreographies" ec WHERE ec."eventId" = ${events.id})`.as("coreografiasCount");
      const participantesCount = sql<number>`(SELECT COUNT(*) FROM "event_participants" ep WHERE ep."eventId" = ${events.id})`.as("participantesCount");
      const confirmadosCount = sql<number>`(SELECT COUNT(*) FROM "event_participants" ep2 WHERE ep2."eventId" = ${events.id} AND ep2."status" = 'confirmado')`.as("confirmadosCount");
      const autorizadosCount = sql<number>`(SELECT COUNT(*) FROM "event_participants" ep3 WHERE ep3."eventId" = ${events.id} AND ep3."imageAuthorization" = true AND ep3."participationAuthorization" = true)`.as("autorizadosCount");

      const rows = await db.select({
        id: events.id,
        name: events.name,
        type: events.type,
        description: events.description,
        venueName: events.venueName,
        venueAddress: events.venueAddress,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        status: events.status,
        requiresAuthorization: events.requiresAuthorization,
        createdAt: events.createdAt,
        coreografiasCount,
        participantesCount,
        confirmadosCount,
        autorizadosCount,
      })
        .from(events)
        .where(and(
          eq(events.organizationId, orgId),
          eq(events.active, true),
          input?.status ? eq(events.status, input.status) : undefined,
          input?.upcomingOnly ? gte(events.startsAt, new Date()) : undefined,
          input?.search
            ? or(ilike(events.name, `%${input.search}%`), ilike(events.venueName, `%${input.search}%`))
            : undefined,
        ))
        .orderBy(asc(events.startsAt));

      return rows.map((row) => ({
        ...row,
        coreografiasCount: Number(row.coreografiasCount) || 0,
        participantesCount: Number(row.participantesCount) || 0,
        confirmadosCount: Number(row.confirmadosCount) || 0,
        autorizadosCount: Number(row.autorizadosCount) || 0,
      }));
    }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { total: 0, proximos: 0, realizados: 0, participantes: 0 };
      const orgId = ctx.user.organizationId!;
      const grouped = await db.select({
        status: events.status,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      }).from(events).where(eq(events.organizationId, orgId)).groupBy(events.status);

      const [{ proximos }] = await db.select({ proximos: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(events)
        .where(and(
          eq(events.organizationId, orgId),
          inArray(events.status, ["planejado", "confirmado"]),
          gte(events.startsAt, new Date()),
        ));

      const [{ participantes }] = await db.select({ participantes: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(eventParticipants)
        .where(eq(eventParticipants.organizationId, orgId));

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of grouped) {
        byStatus[row.status] = Number(row.count) || 0;
        total += Number(row.count) || 0;
      }
      return {
        total,
        proximos: Number(proximos) || 0,
        realizados: byStatus.realizado || 0,
        participantes: Number(participantes) || 0,
      };
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select().from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId)))
        .limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const linkedCoreografias = await db.select({
        id: eventChoreographies.id,
        coreografiaId: eventChoreographies.coreografiaId,
        ordem: eventChoreographies.ordem,
        title: coreografias.title,
        formacao: coreografias.formacao,
        status: coreografias.status,
        videoId: coreografias.videoId,
      })
        .from(eventChoreographies)
        .innerJoin(coreografias, eq(coreografias.id, eventChoreographies.coreografiaId))
        .where(eq(eventChoreographies.eventId, input.id))
        .orderBy(asc(eventChoreographies.ordem), asc(eventChoreographies.id));

      const participants = await db.select({
        id: eventParticipants.id,
        studentId: eventParticipants.studentId,
        studentName: students.name,
        studentAvatar: students.avatar,
        studentLevel: students.level,
        birthDate: students.birthDate,
        guardianName: students.guardianName,
        status: eventParticipants.status,
        imageAuthorization: eventParticipants.imageAuthorization,
        participationAuthorization: eventParticipants.participationAuthorization,
        costumeNotes: eventParticipants.costumeNotes,
        notes: eventParticipants.notes,
        confirmedAt: eventParticipants.confirmedAt,
      })
        .from(eventParticipants)
        .innerJoin(students, eq(students.id, eventParticipants.studentId))
        .where(eq(eventParticipants.eventId, input.id))
        .orderBy(asc(students.name));

      return { ...event, coreografias: linkedCoreografias, participantes: participants };
    }),

    create: protectedProcedure.input(eventInput).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      if (input.endsAt && input.endsAt < input.startsAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O horário de término não pode ser antes do início." });
      }

      const [created] = await db.insert(events).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        venueName: input.venueName?.trim() || null,
        venueAddress: input.venueAddress?.trim() || null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        status: input.status,
        requiresAuthorization: input.requiresAuthorization,
      }).returning({ id: events.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(eventInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      if (input.endsAt && input.endsAt < input.startsAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O horário de término não pode ser antes do início." });
      }

      await db.update(events).set({
        name: input.name.trim(),
        type: input.type,
        description: input.description?.trim() || null,
        venueName: input.venueName?.trim() || null,
        venueAddress: input.venueAddress?.trim() || null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        status: input.status,
        requiresAuthorization: input.requiresAuthorization,
        updatedAt: new Date(),
      }).where(eq(events.id, input.id));

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      await db.delete(eventChoreographies).where(eq(eventChoreographies.eventId, input.id));
      await db.delete(eventParticipants).where(eq(eventParticipants.eventId, input.id));
      await db.delete(events).where(eq(events.id, input.id));
      return { success: true };
    }),

    /** Vincula uma coreografia ao evento (ordem = fim da fila). */
    linkCoreografia: protectedProcedure.input(z.object({
      eventId: z.number(),
      coreografiaId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const [coreografia] = await db.select({ id: coreografias.id }).from(coreografias)
        .where(and(eq(coreografias.id, input.coreografiaId), eq(coreografias.organizationId, orgId))).limit(1);
      if (!coreografia) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada." });

      const [duplicate] = await db.select({ id: eventChoreographies.id }).from(eventChoreographies)
        .where(and(eq(eventChoreographies.eventId, input.eventId), eq(eventChoreographies.coreografiaId, input.coreografiaId)))
        .limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Esta coreografia já está no evento." });

      const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${eventChoreographies.ordem}), 0)` })
        .from(eventChoreographies).where(eq(eventChoreographies.eventId, input.eventId));

      await db.insert(eventChoreographies).values({
        organizationId: orgId,
        eventId: input.eventId,
        coreografiaId: input.coreografiaId,
        ordem: (Number(max) || 0) + 1,
      });
      return { success: true };
    }),

    unlinkCoreografia: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: eventChoreographies.id }).from(eventChoreographies)
        .where(and(eq(eventChoreographies.id, input.id), eq(eventChoreographies.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não vinculada." });

      await db.delete(eventChoreographies).where(eq(eventChoreographies.id, input.id));
      return { success: true };
    }),

    /** Adiciona participante ao evento (também aceita em lote via array). */
    addParticipant: protectedProcedure.input(z.object({
      eventId: z.number(),
      studentIds: z.array(z.number()).min(1).max(200),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const validStudents = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.organizationId, orgId), sql`${students.id} IN (${sql.join(input.studentIds.map((id) => sql`${id}`), sql`, `)})`));
      const validIds = new Set(validStudents.map((row: any) => row.id));

      const existing = await db.select({ studentId: eventParticipants.studentId }).from(eventParticipants)
        .where(eq(eventParticipants.eventId, input.eventId));
      const existingIds = new Set(existing.map((row: any) => row.studentId));

      const toInsert = input.studentIds.filter((id) => validIds.has(id) && !existingIds.has(id));
      if (toInsert.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Nenhum aluno novo para adicionar (já estão no evento ou não pertencem à escola)." });
      }

      await db.insert(eventParticipants).values(toInsert.map((studentId) => ({
        organizationId: orgId,
        eventId: input.eventId,
        studentId,
      })));

      return { success: true, added: toInsert.length };
    }),

    updateParticipant: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(PARTICIPANT_STATUS).optional(),
      imageAuthorization: z.boolean().optional(),
      participationAuthorization: z.boolean().optional(),
      guardianName: z.string().max(255).nullable().optional(),
      costumeNotes: z.string().max(2000).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(eq(eventParticipants.id, input.id), eq(eventParticipants.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Participante não encontrado." });

      await db.update(eventParticipants).set({
        ...(input.status !== undefined ? { status: input.status, confirmedAt: input.status === "confirmado" ? new Date() : null } : {}),
        ...(input.imageAuthorization !== undefined ? { imageAuthorization: input.imageAuthorization } : {}),
        ...(input.participationAuthorization !== undefined ? { participationAuthorization: input.participationAuthorization } : {}),
        ...(input.guardianName !== undefined ? { guardianName: input.guardianName?.trim() || null } : {}),
        ...(input.costumeNotes !== undefined ? { costumeNotes: input.costumeNotes?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(eq(eventParticipants.id, input.id));

      return { success: true };
    }),

    removeParticipant: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(eq(eventParticipants.id, input.id), eq(eventParticipants.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Participante não encontrado." });

      await db.delete(eventParticipants).where(eq(eventParticipants.id, input.id));
      return { success: true };
    }),

    searchAlunos: protectedProcedure.input(z.object({
      q: z.string().max(120),
      eventId: z.number().optional(),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      if (!input.q.trim()) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.trim().toLowerCase()}%`;

      const jaParticipam = input.eventId
        ? db.select({ studentId: eventParticipants.studentId }).from(eventParticipants)
            .where(eq(eventParticipants.eventId, input.eventId))
        : null;

      return db.select({
        id: students.id,
        name: students.name,
        level: students.level,
        status: students.status,
      }).from(students).where(and(
        eq(students.organizationId, orgId),
        eq(students.status, "ativo"),
        sql`(LOWER(${students.name}) LIKE ${term} OR LOWER(COALESCE(${students.email}, '')) LIKE ${term})`,
        jaParticipam ? sql`${students.id} NOT IN (${jaParticipam})` : undefined,
      )).limit(10);
    }),

    /**
     * Candidatos do evento com filtros (turma / modalidade / coreografia / busca).
     * Retorna a flag `alreadyIn` para a seleção em massa não duplicar ninguém.
     */
    candidatesForEvent: protectedProcedure.input(z.object({
      eventId: z.number(),
      turmaId: z.number().optional(),
      modalidadeId: z.number().optional(),
      coreografiaId: z.number().optional(),
      search: z.string().max(120).optional(),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const conditions: any[] = [
        eq(students.organizationId, orgId),
        eq(students.status, "ativo"),
      ];
      if (input.modalidadeId) conditions.push(eq(students.instrumentId, input.modalidadeId));
      if (input.search) {
        const term = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(sql`(LOWER(${students.name}) LIKE ${term} OR LOWER(COALESCE(${students.email}, '')) LIKE ${term})`);
      }
      if (input.turmaId) {
        conditions.push(sql`${students.id} IN (SELECT ta."studentId" FROM "turma_alunos" ta WHERE ta."turmaId" = ${input.turmaId} AND ta."status" = 'ativa')`);
      }
      if (input.coreografiaId) {
        conditions.push(sql`${students.id} IN (SELECT ca."studentId" FROM "coreografia_alunos" ca WHERE ca."coreografiaId" = ${input.coreografiaId})`);
      }

      const rows = await db.select({
        id: students.id,
        name: students.name,
        level: students.level,
        birthDate: students.birthDate,
        instrumentName: instruments.name,
        alreadyIn: sql<boolean>`EXISTS (SELECT 1 FROM "event_participants" ep WHERE ep."eventId" = ${input.eventId} AND ep."studentId" = ${students.id})`,
      })
        .from(students)
        .leftJoin(instruments, eq(instruments.id, students.instrumentId))
        .where(and(...conditions))
        .orderBy(asc(students.name))
        .limit(300);

      return rows.map((row) => ({ ...row, alreadyIn: Boolean(row.alreadyIn) }));
    }),

    /** Coreografias disponíveis para vincular (não arquivadas). */
    coreografiasDisponiveis: protectedProcedure.input(z.object({ eventId: z.number().optional() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const jaVinculadas = input?.eventId
        ? db.select({ coreografiaId: eventChoreographies.coreografiaId }).from(eventChoreographies)
            .where(eq(eventChoreographies.eventId, input.eventId))
        : null;

      return db.select({
        id: coreografias.id,
        title: coreografias.title,
        formacao: coreografias.formacao,
        status: coreografias.status,
      }).from(coreografias).where(and(
        eq(coreografias.organizationId, orgId),
        eq(coreografias.active, true),
        sql`${coreografias.status} <> 'arquivada'`,
        jaVinculadas ? sql`${coreografias.id} NOT IN (${jaVinculadas})` : undefined,
      )).orderBy(asc(coreografias.title));
    }),

    /** Portal do aluno: eventos em que o aluno é participante. */
    myEvents: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      return db.select({
        participantId: eventParticipants.id,
        participantStatus: eventParticipants.status,
        imageAuthorization: eventParticipants.imageAuthorization,
        participationAuthorization: eventParticipants.participationAuthorization,
        confirmedAt: eventParticipants.confirmedAt,
        id: events.id,
        name: events.name,
        type: events.type,
        description: events.description,
        venueName: events.venueName,
        venueAddress: events.venueAddress,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        status: events.status,
        requiresAuthorization: events.requiresAuthorization,
      })
        .from(eventParticipants)
        .innerJoin(events, eq(events.id, eventParticipants.eventId))
        .where(and(
          eq(eventParticipants.studentId, studentId),
          eq(eventParticipants.organizationId, ctx.user.organizationId!),
          eq(events.active, true),
          sql`${events.status} <> 'cancelado'`,
        ))
        .orderBy(asc(events.startsAt));
    }),

    /** Aluno confirma presença no evento. */
    confirmParticipation: studentProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de aluno não encontrado." });

      const [participant] = await db.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(
          eq(eventParticipants.eventId, input.eventId),
          eq(eventParticipants.studentId, studentId),
          eq(eventParticipants.organizationId, ctx.user.organizationId!),
        )).limit(1);
      if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Você não é participante deste evento." });

      await db.update(eventParticipants).set({
        status: "confirmado",
        confirmedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(eventParticipants.id, participant.id));

      return { success: true };
    }),
  }),
};
