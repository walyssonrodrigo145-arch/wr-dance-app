// ─── Eventos / Espetáculos (DancePro) ────────────────────────────────────────
// Recitais, festivais, competições e workshops: coreografias com ordem de
// apresentação e participantes com autorização de imagem/participação.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coreografiaAlunos, coreografias, costumeSales, eventChoreographies, eventParticipants, events, instruments, settings, students } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { notifyUser } from "../_core/notification";
import { sendWhatsAppMessage } from "../utils/whatsapp";

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

function formatEventWhen(startsAt: Date) {
  const date = new Date(startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
  const time = new Date(startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${date} às ${time}`;
}

/**
 * Notifica os participantes do evento (in-app para quem tem portal + WhatsApp
 * quando a escola tem disparo automático configurado). Nunca lança erro.
 */
async function notifyEventParticipants(
  db: any,
  orgId: number,
  eventId: number,
  title: string,
  content: string,
  opts?: { whatsapp?: boolean; onlyStudentIds?: number[] }
) {
  try {
    const rows = await db.select({
      studentId: eventParticipants.studentId,
      name: students.name,
      phone: students.phone,
      studentUserId: students.studentUserId,
    }).from(eventParticipants)
      .innerJoin(students, eq(students.id, eventParticipants.studentId))
      .where(eq(eventParticipants.eventId, eventId));

    const targets = opts?.onlyStudentIds
      ? rows.filter((r: any) => opts.onlyStudentIds!.includes(r.studentId))
      : rows;

    for (const r of targets) {
      if (r.studentUserId) {
        await notifyUser(r.studentUserId, { title, content }).catch(() => {});
      }
    }

    if (opts?.whatsapp) {
      const [s] = await db.select({
        whatsappBotUrl: settings.whatsappBotUrl,
        whatsappBotToken: settings.whatsappBotToken,
        whatsappAutoSend: settings.whatsappAutoSend,
      }).from(settings).where(eq(settings.organizationId, orgId)).limit(1);
      if (s?.whatsappAutoSend === 1 && s.whatsappBotUrl) {
        for (const r of targets) {
          if (!r.phone) continue;
          await sendWhatsAppMessage({
            url: s.whatsappBotUrl,
            token: s.whatsappBotToken ?? undefined,
            phone: r.phone,
            message: `*${title}*\n\n${content}`,
          }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.warn("[Eventos] Falha ao notificar participantes:", error);
  }
}

/** Importa o elenco (coreografia_alunos) de uma coreografia para o evento. */
async function importCastForCoreografia(db: any, orgId: number, eventId: number, coreografiaId: number): Promise<number> {
  const cast = await db.select({ studentId: coreografiaAlunos.studentId }).from(coreografiaAlunos)
    .where(and(eq(coreografiaAlunos.organizationId, orgId), eq(coreografiaAlunos.coreografiaId, coreografiaId)));
  if (cast.length === 0) return 0;

  const existing = await db.select({ studentId: eventParticipants.studentId }).from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId));
  const existingIds = new Set(existing.map((r: any) => r.studentId));

  let ids = cast.map((r: any) => r.studentId).filter((id: number) => !existingIds.has(id));
  if (ids.length === 0) return 0;

  const valid = await db.select({ id: students.id }).from(students)
    .where(and(eq(students.organizationId, orgId), eq(students.status, "ativo"), inArray(students.id, ids)));
  ids = valid.map((r: any) => r.id);
  if (ids.length === 0) return 0;

  await db.insert(eventParticipants).values(ids.map((studentId: number) => ({
    organizationId: orgId,
    eventId,
    studentId,
  })));
  return ids.length;
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
  photoUrl: z.string().max(1000).nullable().optional(),
});

export const eventosRouters = {
  eventos: router({
    list: protectedProcedure.input(z.object({
      search: z.string().max(120).optional(),
      status: z.enum(EVENT_STATUS).optional(),
      type: z.enum(EVENT_TYPES).optional(),
      upcomingOnly: z.boolean().default(false),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

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
        photoUrl: events.photoUrl,
        createdAt: events.createdAt,
      })
        .from(events)
        .where(and(
          eq(events.organizationId, orgId),
          eq(events.active, true),
          input?.status ? eq(events.status, input.status) : undefined,
          input?.type ? eq(events.type, input.type) : undefined,
          input?.upcomingOnly ? gte(events.startsAt, new Date()) : undefined,
          input?.upcomingOnly ? inArray(events.status, ["planejado", "confirmado"]) : undefined,
          input?.search
            ? or(ilike(events.name, `%${input.search}%`), ilike(events.venueName, `%${input.search}%`), ilike(events.description, `%${input.search}%`))
            : undefined,
        ))
        .orderBy(asc(events.startsAt));

      // AUDITORIA postgres.js: subqueries escalares com alias (.as()) vinham
      // zeradas na resposta — os KPIs agora são agregados por eventId (groupBy)
      // e mesclados em JS (mesmo caminho do stats, testado e confiável).
      const eventIds = rows.map((row) => row.id);
      const coreoRows = eventIds.length > 0 ? await db.select({
        eventId: eventChoreographies.eventId,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      }).from(eventChoreographies).where(inArray(eventChoreographies.eventId, eventIds)).groupBy(eventChoreographies.eventId) : [];
      const partRows = eventIds.length > 0 ? await db.select({
        eventId: eventParticipants.eventId,
        total: sql<number>`CAST(COUNT(*) AS INT)`,
        confirmados: sql<number>`CAST(SUM(CASE WHEN ${eventParticipants.status} = 'confirmado' THEN 1 ELSE 0 END) AS INT)`,
        autorizados: sql<number>`CAST(SUM(CASE WHEN ${eventParticipants.imageAuthorization} = true AND ${eventParticipants.participationAuthorization} = true THEN 1 ELSE 0 END) AS INT)`,
      }).from(eventParticipants).where(inArray(eventParticipants.eventId, eventIds)).groupBy(eventParticipants.eventId) : [];
      const saleRows = eventIds.length > 0 ? await db.select({
        eventId: costumeSales.eventId,
        qty: sql<number>`CAST(COALESCE(SUM(${costumeSales.quantity}), 0) AS INT)`,
        previsto: sql<number>`COALESCE(SUM(${costumeSales.totalPrice}), 0)`,
        arrecadado: sql<number>`COALESCE(SUM(CASE WHEN ${costumeSales.status} IN ('pago', 'entregue') THEN ${costumeSales.totalPrice} ELSE 0 END), 0)`,
      }).from(costumeSales).where(and(
        inArray(costumeSales.eventId, eventIds),
        sql`${costumeSales.status} <> 'cancelado'`,
      )).groupBy(costumeSales.eventId) : [];

      // inArray já ignora eventId IS NULL — agrupamentos garantem 1 linha/evento
      const coreoMap = new Map<number, number>(coreoRows.map((r: any) => [r.eventId, Number(r.count) || 0]));
      const partMap = new Map<number, { total: number; confirmados: number; autorizados: number }>(partRows.map((r: any) => [r.eventId, { total: Number(r.total) || 0, confirmados: Number(r.confirmados) || 0, autorizados: Number(r.autorizados) || 0 }]));
      const saleMap = new Map<number, { qty: number; previsto: number; arrecadado: number }>(saleRows.map((r: any) => [r.eventId, { qty: Number(r.qty) || 0, previsto: Number(r.previsto) || 0, arrecadado: Number(r.arrecadado) || 0 }]));

      return rows.map((row) => {
        const part = partMap.get(row.id) ?? { total: 0, confirmados: 0, autorizados: 0 };
        const sale = saleMap.get(row.id) ?? { qty: 0, previsto: 0, arrecadado: 0 };
        return {
          ...row,
          coreografiasCount: coreoMap.get(row.id) ?? 0,
          participantesCount: part.total,
          confirmadosCount: part.confirmados,
          autorizadosCount: part.autorizados,
          vendasQty: sale.qty,
          receitaPrevista: sale.previsto,
          receitaArrecadada: sale.arrecadado,
        };
      });
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
        .innerJoin(events, eq(events.id, eventParticipants.eventId))
        .where(and(
          eq(eventParticipants.organizationId, orgId),
          sql`${events.status} <> 'cancelado'`,
          eq(events.active, true),
        ));

      // KPIs extras (padrão da Loja/Eventos): novos no mês + janela de 30 dias
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const [novos] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(events)
        .where(and(eq(events.organizationId, orgId), gte(events.createdAt, monthStart)));
      const [prox30] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(events)
        .where(and(
          eq(events.organizationId, orgId),
          inArray(events.status, ["planejado", "confirmado"]),
          gte(events.startsAt, new Date()),
          lte(events.startsAt, in30Days),
        ));

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
        novosEsteMes: Number(novos?.count) || 0,
        proximos30: Number(prox30?.count) || 0,
        planejados: byStatus.planejado || 0,
        confirmados: byStatus.confirmado || 0,
        cancelados: byStatus.cancelado || 0,
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
        photoUrl: input.photoUrl?.trim() || null,
      }).returning({ id: events.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(eventInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: events.id, status: events.status, name: events.name }).from(events)
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
        photoUrl: input.photoUrl?.trim() || null,
        updatedAt: new Date(),
      }).where(eq(events.id, input.id));

      // AVISA os participantes quando o status muda (confirmado/cancelado).
      if (existing.status !== input.status && (input.status === "confirmado" || input.status === "cancelado")) {
        const title = input.status === "confirmado" ? "Evento confirmado!" : "Evento cancelado";
        const content = input.status === "confirmado"
          ? `O evento "${input.name}" está confirmado para ${formatEventWhen(input.startsAt)}${input.venueName ? ` — ${input.venueName}` : ""}.`
          : `O evento "${input.name}" foi cancelado pela escola.`;
        await notifyEventParticipants(db, orgId, input.id, title, content, { whatsapp: input.status === "cancelado" });
      }

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: events.id, name: events.name }).from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      // AVISA os participantes antes de remover (o registro será apagado).
      await notifyEventParticipants(db, orgId, input.id, "Evento cancelado", `O evento "${existing.name}" foi cancelado pela escola.`, { whatsapp: true });

      await db.delete(eventChoreographies).where(eq(eventChoreographies.eventId, input.id));
      await db.delete(eventParticipants).where(eq(eventParticipants.eventId, input.id));
      // AUDITORIA: não deixar vendas de figurino apontando para evento excluído.
      await db.update(costumeSales).set({ eventId: null }).where(eq(costumeSales.eventId, input.id));
      await db.delete(events).where(eq(events.id, input.id));
      return { success: true };
    }),

    /** Duplica um evento: campos + programa (coreografias) + participantes reconvidados. */
    duplicate: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [source] = await db.select().from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId))).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const [copy] = await db.insert(events).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        name: `${source.name} (cópia)`,
        type: source.type,
        description: source.description,
        venueName: source.venueName,
        venueAddress: source.venueAddress,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        status: "planejado",
        requiresAuthorization: source.requiresAuthorization,
        photoUrl: source.photoUrl,
      }).returning({ id: events.id });

      const coreos = await db.select().from(eventChoreographies).where(eq(eventChoreographies.eventId, source.id));
      if (coreos.length > 0) {
        await db.insert(eventChoreographies).values(coreos.map((c: any) => ({
          organizationId: orgId,
          eventId: copy.id,
          coreografiaId: c.coreografiaId,
          ordem: c.ordem ?? 0,
        })));
      }
      const parts = await db.select().from(eventParticipants).where(eq(eventParticipants.eventId, source.id));
      if (parts.length > 0) {
        await db.insert(eventParticipants).values(parts.map((p: any) => ({
          organizationId: orgId,
          eventId: copy.id,
          studentId: p.studentId,
          status: "convidado",
          imageAuthorization: false,
          participationAuthorization: false,
          guardianName: p.guardianName ?? null,
          costumeNotes: p.costumeNotes ?? null,
          notes: p.notes ?? null,
        })));
      }
      return { success: true, id: copy.id };
    }),

    /** Atalho de status do fluxo do evento (Publicar / Encerrar / Cancelar / Reativar). */
    setStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(EVENT_STATUS),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id, status: events.status, name: events.name }).from(events)
        .where(and(eq(events.id, input.id), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      if (event.status === input.status) return { success: true };
      if (event.status === "realizado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Evento realizado é terminal — duplique-o para criar um novo." });
      }
      // Transições permitidas: planejado↔confirmado, planejado/confirmado→realizado|cancelado, cancelado→confirmado
      const from = event.status;
      const to = input.status;
      const allowed =
        (from === "planejado" && ["confirmado", "realizado", "cancelado"].includes(to)) ||
        (from === "confirmado" && ["planejado", "realizado", "cancelado"].includes(to)) ||
        (from === "cancelado" && to === "confirmado");
      if (!allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transição de status inválida (${from} → ${to}).` });
      }
      await db.update(events).set({ status: to, updatedAt: new Date() }).where(eq(events.id, input.id));
      if (to === "cancelado") {
        await notifyEventParticipants(db, orgId, input.id, "Evento cancelado", `O evento "${event.name}" foi cancelado pela escola.`, { whatsapp: false });
      }
      if (to === "confirmado" && from === "planejado") {
        await notifyEventParticipants(db, orgId, input.id, "Evento confirmado", `O evento "${event.name}" está confirmado — confirme sua participação!`, { whatsapp: false });
      }
      return { success: true };
    }),

    /** Vincula uma coreografia ao evento (ordem = fim da fila). */
    linkCoreografia: protectedProcedure.input(z.object({
      eventId: z.number(),
      coreografiaId: z.number(),
      /** Importa automaticamente o elenco da coreografia (padrão: sim). */
      importCast: z.boolean().default(true),
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

      // Importa o elenco da coreografia (evita o evento ficar com "0 alunos").
      let castImported = 0;
      if (input.importCast) {
        castImported = await importCastForCoreografia(db, orgId, input.eventId, input.coreografiaId);
        if (castImported > 0) {
          const [ev] = await db.select({ name: events.name, startsAt: events.startsAt }).from(events)
            .where(eq(events.id, input.eventId)).limit(1);
          await notifyEventParticipants(db, orgId, input.eventId, "Você foi incluído(a) em um evento",
            `Você participa do evento "${ev?.name}"${ev?.startsAt ? ` em ${formatEventWhen(ev.startsAt)}` : ""}. Confirme sua presença no portal.`,
            { whatsapp: false });
        }
      }

      return { success: true, castImported };
    }),

    /** Importa manualmente o elenco (de uma coreografia ou de todas as vinculadas). */
    importCast: protectedProcedure.input(z.object({
      eventId: z.number(),
      coreografiaId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      let coreografiaIds: number[] = [];
      if (input.coreografiaId) {
        coreografiaIds = [input.coreografiaId];
      } else {
        const links = await db.select({ coreografiaId: eventChoreographies.coreografiaId }).from(eventChoreographies)
          .where(eq(eventChoreographies.eventId, input.eventId));
        coreografiaIds = links.map((l: any) => l.coreografiaId);
      }
      if (coreografiaIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma coreografia vinculada — vincule uma coreografia ou selecione uma específica." });
      }

      let added = 0;
      for (const cid of coreografiaIds) {
        added += await importCastForCoreografia(db, orgId, input.eventId, cid);
      }

      if (added > 0) {
        const [ev] = await db.select({ name: events.name, startsAt: events.startsAt }).from(events)
          .where(eq(events.id, input.eventId)).limit(1);
        await notifyEventParticipants(db, orgId, input.eventId, "Você foi incluído(a) em um evento",
          `Você participa do evento "${ev?.name}"${ev?.startsAt ? ` em ${formatEventWhen(ev.startsAt)}` : ""}. Confirme sua presença no portal.`,
          { whatsapp: false });
      }

      return { success: true, added };
    }),

    /** Reordena uma coreografia no programa (sobe/desce uma posição). */
    reorderCoreografia: protectedProcedure.input(z.object({
      id: z.number(),
      direction: z.enum(["up", "down"]),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [link] = await db.select({ id: eventChoreographies.id, eventId: eventChoreographies.eventId }).from(eventChoreographies)
        .where(and(eq(eventChoreographies.id, input.id), eq(eventChoreographies.organizationId, orgId))).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não vinculada ao evento." });

      const all = await db.select({ id: eventChoreographies.id }).from(eventChoreographies)
        .where(eq(eventChoreographies.eventId, link.eventId))
        .orderBy(asc(eventChoreographies.ordem), asc(eventChoreographies.id));

      const idx = all.findIndex((l: any) => l.id === input.id);
      const target = input.direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= all.length) return { success: true, moved: false };

      const order = all.map((l: any) => l.id);
      [order[idx], order[target]] = [order[target], order[idx]];
      for (let i = 0; i < order.length; i++) {
        await db.update(eventChoreographies).set({ ordem: i + 1 }).where(eq(eventChoreographies.id, order[i]));
      }
      return { success: true, moved: true };
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

      // AVISA quem acabou de ser convidado (in-app; WhatsApp se a escola usa disparo automático).
      const [ev] = await db.select({ name: events.name, startsAt: events.startsAt, requiresAuthorization: events.requiresAuthorization }).from(events)
        .where(eq(events.id, input.eventId)).limit(1);
      const authNote = ev?.requiresAuthorization ? " Autorize imagem/participação no portal." : "";
      await notifyEventParticipants(
        db, orgId, input.eventId,
        "Você foi convidado(a) para um evento",
        `Você foi convidado(a) para o evento "${ev?.name}"${ev?.startsAt ? ` em ${formatEventWhen(ev.startsAt)}` : ""}.${authNote}`,
        { whatsapp: true, onlyStudentIds: toInsert }
      );

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

    /** Portal do aluno: eventos em que o aluno é participante (com o programa). */
    myEvents: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      const rows = await db.select({
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

      if (rows.length === 0) return rows;

      const eventIds = rows.map((r: any) => r.id);
      const programRows = await db.select({
        eventId: eventChoreographies.eventId,
        title: coreografias.title,
        formacao: coreografias.formacao,
        ordem: eventChoreographies.ordem,
      }).from(eventChoreographies)
        .innerJoin(coreografias, eq(coreografias.id, eventChoreographies.coreografiaId))
        .where(inArray(eventChoreographies.eventId, eventIds))
        .orderBy(asc(eventChoreographies.ordem), asc(eventChoreographies.id));

      const programByEvent = new Map<number, any[]>();
      for (const p of programRows) {
        const list = programByEvent.get(p.eventId) ?? [];
        list.push({ title: p.title, formacao: p.formacao, ordem: p.ordem });
        programByEvent.set(p.eventId, list);
      }

      return rows.map((r: any) => ({ ...r, program: programByEvent.get(r.id) ?? [] }));
    }),

    /** Aluno confirma presença no evento. */
    confirmParticipation: studentProcedure.input(z.object({ eventId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de aluno não encontrado." });
      const orgId = ctx.user.organizationId!;

      // AUDITORIA: só confirma evento da propria escola, vigente e ainda não realizado.
      const [event] = await db.select({
        id: events.id,
        name: events.name,
        status: events.status,
        startsAt: events.startsAt,
        createdByUserId: events.createdByUserId,
      }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId), eq(events.active, true)))
        .limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      if (event.status === "cancelado" || event.status === "realizado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este evento não está mais disponível para confirmação." });
      }
      if (new Date(event.startsAt).getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O evento já aconteceu — fale com a escola." });
      }

      const [participant] = await db.select({ id: eventParticipants.id }).from(eventParticipants)
        .where(and(
          eq(eventParticipants.eventId, input.eventId),
          eq(eventParticipants.studentId, studentId),
          eq(eventParticipants.organizationId, orgId),
        )).limit(1);
      if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Você não é participante deste evento." });

      await db.update(eventParticipants).set({
        status: "confirmado",
        confirmedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(eventParticipants.id, participant.id));

      // AVISA a escola quem confirmou.
      await notifyUser(event.createdByUserId, {
        title: "Presença confirmada",
        content: `${ctx.user.name || "Um aluno"} confirmou presença no evento "${event.name}".`,
      }).catch(() => {});

      return { success: true };
    }),
  }),
};
