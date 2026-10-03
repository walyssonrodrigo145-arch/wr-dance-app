// FASE 2: Ingressos do evento — tipos, emissão (venda/cortesia), check-in com QR,
// mapa de assentos. INDEPENDENTE da Loja (produtos) e das participações.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eventParticipants, eventSeats, events, tickets, ticketTypes } from "../../drizzle/schema";

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  const role = ctx.user?.role;
  if (role !== "admin" && role !== "professor") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para gerenciar ingressos." });
  }
}

const ADMISSION_TYPES = ["adulto", "infantil", "vip", "meia", "cortesia", "custom"] as const;
const TICKET_STATUSES = ["vendido", "cortesia", "reservado", "cancelado"] as const;

async function generateUniqueCode(db: any): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = "TE-" + nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
    const [existing] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.code, code)).limit(1);
    if (!existing) return code;
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível gerar o código do ingresso." });
}

export const ticketsRouters = {
  tickets: router({
    // ── Tipos de ingresso ────────────────────────────────────────────────
    typesList: protectedProcedure.input(z.object({ eventId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const types = await db.select().from(ticketTypes)
        .where(and(eq(ticketTypes.organizationId, orgId), eq(ticketTypes.eventId, input.eventId)))
        .orderBy(asc(ticketTypes.id));
      const issued = await db.select({
        ticketTypeId: tickets.ticketTypeId,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
        checked: sql<number>`CAST(SUM(CASE WHEN ${tickets.checkedInAt} IS NOT NULL THEN 1 ELSE 0 END) AS INT)`,
      }).from(tickets)
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId), sql`${tickets.status} <> 'cancelado'`))
        .groupBy(tickets.ticketTypeId);
      const issuedMap = new Map<number, { count: number; checked: number }>(issued.map((r: any) => [r.ticketTypeId, { count: Number(r.count) || 0, checked: Number(r.checked) || 0 }]));

      return types.map((t) => ({
        ...t,
        price: Number(t.price) || 0,
        issued: issuedMap.get(t.id)?.count ?? 0,
        checkedIn: issuedMap.get(t.id)?.checked ?? 0,
      }));
    }),

    typeCreate: protectedProcedure.input(z.object({
      eventId: z.number(),
      name: z.string().min(1, "Informe o nome do tipo").max(60),
      admissionType: z.enum(ADMISSION_TYPES).default("adulto"),
      price: z.number().min(0).max(1000000).default(0),
      quantity: z.number().int().min(0).max(100000).default(0),
      salesStart: z.coerce.date().nullable().optional(),
      salesEnd: z.coerce.date().nullable().optional(),
      perStudentFree: z.number().int().min(0).max(50).default(0),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      if (input.salesStart && input.salesEnd && input.salesEnd < input.salesStart) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O fim das vendas não pode ser antes do início." });
      }
      const [created] = await db.insert(ticketTypes).values({
        organizationId: orgId,
        eventId: input.eventId,
        name: input.name.trim(),
        admissionType: input.admissionType,
        price: input.price.toFixed(2),
        quantity: input.quantity,
        salesStart: input.salesStart ?? null,
        salesEnd: input.salesEnd ?? null,
        perStudentFree: input.perStudentFree,
      }).returning({ id: ticketTypes.id });
      return { success: true, id: created.id };
    }),

    typeUpdate: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(60),
      admissionType: z.enum(ADMISSION_TYPES),
      price: z.number().min(0).max(1000000),
      quantity: z.number().int().min(0).max(100000),
      salesStart: z.coerce.date().nullable().optional(),
      salesEnd: z.coerce.date().nullable().optional(),
      perStudentFree: z.number().int().min(0).max(50),
      active: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [existing] = await db.select({ id: ticketTypes.id }).from(ticketTypes)
        .where(and(eq(ticketTypes.id, input.id), eq(ticketTypes.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de ingresso não encontrado." });
      await db.update(ticketTypes).set({
        name: input.name.trim(),
        admissionType: input.admissionType,
        price: input.price.toFixed(2),
        quantity: input.quantity,
        salesStart: input.salesStart ?? null,
        salesEnd: input.salesEnd ?? null,
        perStudentFree: input.perStudentFree,
        active: input.active,
        updatedAt: new Date(),
      }).where(eq(ticketTypes.id, input.id));
      return { success: true };
    }),

    typeDelete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [existing] = await db.select({ id: ticketTypes.id }).from(ticketTypes)
        .where(and(eq(ticketTypes.id, input.id), eq(ticketTypes.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de ingresso não encontrado." });
      const [used] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` }).from(tickets)
        .where(and(eq(tickets.ticketTypeId, input.id), sql`${tickets.status} <> 'cancelado'`));
      if (Number(used?.count) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este tipo já tem ingressos emitidos — desative-o em vez de excluir." });
      }
      await db.delete(ticketTypes).where(eq(ticketTypes.id, input.id));
      return { success: true };
    }),

    // ── Emissão ──────────────────────────────────────────────────────────
    issue: protectedProcedure.input(z.object({
      eventId: z.number(),
      ticketTypeId: z.number(),
      quantity: z.number().int().min(1).max(200).default(1),
      buyerName: z.string().max(255).nullable().optional(),
      buyerPhone: z.string().max(30).nullable().optional(),
      studentId: z.number().nullable().optional(),
      asCourtesy: z.boolean().default(false),
      seatIds: z.array(z.number()).max(200).optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      const [type] = await db.select().from(ticketTypes)
        .where(and(eq(ticketTypes.id, input.ticketTypeId), eq(ticketTypes.organizationId, orgId), eq(ticketTypes.eventId, input.eventId))).limit(1);
      if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de ingresso não encontrado para este evento." });
      if (!type.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Este tipo de ingresso está desativado." });

      if (!input.asCourtesy) {
        const now = new Date();
        if (type.salesStart && now < type.salesStart) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "As vendas deste tipo ainda não começaram." });
        }
        if (type.salesEnd && now > type.salesEnd) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "As vendas deste tipo foram encerradas." });
        }
      }

      // Capacidade do lote/tipo (0 = sem limite definido)
      if (type.quantity > 0) {
        const [issuedCount] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` }).from(tickets)
          .where(and(eq(tickets.ticketTypeId, type.id), sql`${tickets.status} <> 'cancelado'`));
        const remaining = type.quantity - (Number(issuedCount?.count) || 0);
        if (input.quantity > remaining) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: remaining <= 0
              ? `"${type.name}" esgotado.`
              : `Só restam ${remaining} ingresso(s) de "${type.name}".`,
          });
        }
      }

      // Assentos (opcional): precisam existir, estar disponíveis e não ocupados
      let seats: Array<{ id: number; sector: string; row: string; number: string }> = [];
      if (input.seatIds && input.seatIds.length > 0) {
        if (input.seatIds.length !== input.quantity) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um assento para cada ingresso." });
        }
        seats = await db.select({ id: eventSeats.id, sector: eventSeats.sector, row: eventSeats.row, number: eventSeats.number })
          .from(eventSeats)
          .where(and(eq(eventSeats.eventId, input.eventId), eq(eventSeats.organizationId, orgId), inArray(eventSeats.id, input.seatIds)));
        if (seats.length !== input.seatIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais assentos não pertencem a este evento." });
        }
        const blocked = seats.find((s: any) => (s as any).status === "bloqueado");
        void blocked;
        const occupied = await db.select({ seatSector: tickets.seatSector, seatRow: tickets.seatRow, seatNumber: tickets.seatNumber })
          .from(tickets)
          .where(and(eq(tickets.eventId, input.eventId), sql`${tickets.status} <> 'cancelado'`, sql`${tickets.seatSector} IS NOT NULL`));
        const occupiedKeys = new Set(occupied.map((o) => `${o.seatSector}|${o.seatRow}|${o.seatNumber}`));
        for (const s of seats) {
          if (occupiedKeys.has(`${s.sector}|${s.row}|${s.number}`)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Assento ${s.sector} ${s.row}-${s.number} já está ocupado.` });
          }
        }
      }

      const created: string[] = [];
      for (let i = 0; i < input.quantity; i++) {
        const code = await generateUniqueCode(db);
        const seat = seats[i];
        await db.insert(tickets).values({
          organizationId: orgId,
          eventId: input.eventId,
          ticketTypeId: type.id,
          code,
          status: input.asCourtesy ? "cortesia" : "vendido",
          studentId: input.studentId ?? null,
          buyerName: input.buyerName?.trim() || null,
          buyerPhone: input.buyerPhone?.trim() || null,
          seatSector: seat?.sector ?? null,
          seatRow: seat?.row ?? null,
          seatNumber: seat?.number ?? null,
          notes: input.notes?.trim() || null,
          createdByUserId: ctx.user.id,
        });
        created.push(code);
      }
      return { success: true, codes: created };
    }),

    /** Benefício por aluno: gera cortesias para cada participante conforme o tipo. */
    issueCourtesyToParticipants: protectedProcedure.input(z.object({
      eventId: z.number(),
      ticketTypeId: z.number(),
      perStudent: z.number().int().min(1).max(20).optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [type] = await db.select().from(ticketTypes)
        .where(and(eq(ticketTypes.id, input.ticketTypeId), eq(ticketTypes.organizationId, orgId), eq(ticketTypes.eventId, input.eventId))).limit(1);
      if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Tipo de ingresso não encontrado para este evento." });
      const perStudent = input.perStudent ?? (type.perStudentFree > 0 ? type.perStudentFree : 1);

      const participants = await db.select({ studentId: eventParticipants.studentId, name: eventParticipants.status })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.organizationId, orgId), eq(eventParticipants.eventId, input.eventId)));
      if (participants.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum participante no evento para gerar cortesias." });
      }

      let created = 0;
      for (const p of participants) {
        const [already] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` }).from(tickets)
          .where(and(eq(tickets.eventId, input.eventId), eq(tickets.studentId, p.studentId), eq(tickets.ticketTypeId, type.id), eq(tickets.status, "cortesia")));
        const missing = Math.max(0, perStudent - (Number(already?.count) || 0));
        for (let i = 0; i < missing; i++) {
          const code = await generateUniqueCode(db);
          await db.insert(tickets).values({
            organizationId: orgId,
            eventId: input.eventId,
            ticketTypeId: type.id,
            code,
            status: "cortesia",
            studentId: p.studentId,
            buyerName: null,
            notes: "Cortesia de participante (benefício)",
            createdByUserId: ctx.user.id,
          });
          created += 1;
        }
      }
      return { success: true, created, perStudent };
    }),

    list: protectedProcedure.input(z.object({
      eventId: z.number(),
      status: z.enum(["todos", ...TICKET_STATUSES]).default("todos"),
      search: z.string().max(120).optional(),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const rows = await db.select({
        id: tickets.id,
        code: tickets.code,
        status: tickets.status,
        buyerName: tickets.buyerName,
        buyerPhone: tickets.buyerPhone,
        studentId: tickets.studentId,
        seatSector: tickets.seatSector,
        seatRow: tickets.seatRow,
        seatNumber: tickets.seatNumber,
        checkedInAt: tickets.checkedInAt,
        notes: tickets.notes,
        createdAt: tickets.createdAt,
        ticketTypeId: tickets.ticketTypeId,
        typeName: ticketTypes.name,
        typePrice: ticketTypes.price,
      })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(and(
          eq(tickets.organizationId, orgId),
          eq(tickets.eventId, input.eventId),
          input.status !== "todos" ? eq(tickets.status, input.status) : undefined,
        ))
        .orderBy(desc(tickets.createdAt))
        .limit(500);

      const q = input.search?.trim().toLowerCase();
      const filtered = q
        ? rows.filter((r) =>
            r.code.toLowerCase().includes(q) ||
            (r.buyerName ?? "").toLowerCase().includes(q) ||
            (r.typeName ?? "").toLowerCase().includes(q) ||
            (r.seatNumber ?? "").toLowerCase().includes(q))
        : rows;
      return filtered.map((r) => ({ ...r, typePrice: Number(r.typePrice) || 0 }));
    }),

    cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [ticket] = await db.select({ id: tickets.id, status: tickets.status }).from(tickets)
        .where(and(eq(tickets.id, input.id), eq(tickets.organizationId, orgId))).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ingresso não encontrado." });
      if (ticket.status === "cancelado") return { success: true };
      await db.update(tickets).set({ status: "cancelado", updatedAt: new Date() }).where(eq(tickets.id, input.id));
      return { success: true };
    }),

    // ── Check-in ─────────────────────────────────────────────────────────
    checkin: protectedProcedure.input(z.object({ code: z.string().min(3).max(30) })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const code = input.code.trim().toUpperCase();

      const [ticket] = await db.select({
        id: tickets.id,
        code: tickets.code,
        status: tickets.status,
        checkedInAt: tickets.checkedInAt,
        buyerName: tickets.buyerName,
        studentId: tickets.studentId,
        seatSector: tickets.seatSector,
        seatRow: tickets.seatRow,
        seatNumber: tickets.seatNumber,
        typeName: ticketTypes.name,
      })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.code, code))).limit(1);

      if (!ticket) return { result: "invalido" as const, ticket: null };
      if (ticket.status === "cancelado") return { result: "cancelado" as const, ticket };
      if (ticket.status === "reservado") return { result: "reservado" as const, ticket };
      if (ticket.checkedInAt) return { result: "duplicado" as const, ticket };

      await db.update(tickets).set({ checkedInAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
      return { result: "valido" as const, ticket: { ...ticket, checkedInAt: new Date() } };
    }),

    stats: protectedProcedure.input(z.object({ eventId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { issued: 0, sold: 0, courtesy: 0, checkedIn: 0, waiting: 0, capacity: 0, revenue: 0 };
      const orgId = ctx.user.organizationId!;

      const [aggregate] = await db.select({
        issued: sql<number>`CAST(COUNT(*) AS INT)`,
        sold: sql<number>`CAST(SUM(CASE WHEN ${tickets.status} = 'vendido' THEN 1 ELSE 0 END) AS INT)`,
        courtesy: sql<number>`CAST(SUM(CASE WHEN ${tickets.status} = 'cortesia' THEN 1 ELSE 0 END) AS INT)`,
        checkedIn: sql<number>`CAST(SUM(CASE WHEN ${tickets.checkedInAt} IS NOT NULL THEN 1 ELSE 0 END) AS INT)`,
      }).from(tickets)
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId), sql`${tickets.status} <> 'cancelado'`));

      const [capacityRow] = await db.select({
        capacity: sql<number>`CAST(COALESCE(SUM(${ticketTypes.quantity}), 0) AS INT)`,
      }).from(ticketTypes)
        .where(and(eq(ticketTypes.organizationId, orgId), eq(ticketTypes.eventId, input.eventId), eq(ticketTypes.active, true)));

      const soldRows = await db.select({ price: ticketTypes.price, count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId), eq(tickets.status, "vendido")))
        .groupBy(ticketTypes.price);
      const revenue = soldRows.reduce((acc, r: any) => acc + (Number(r.price) || 0) * (Number(r.count) || 0), 0);

      const issued = Number(aggregate?.issued) || 0;
      const checkedIn = Number(aggregate?.checkedIn) || 0;
      return {
        issued,
        sold: Number(aggregate?.sold) || 0,
        courtesy: Number(aggregate?.courtesy) || 0,
        checkedIn,
        waiting: Math.max(0, issued - checkedIn),
        capacity: Number(capacityRow?.capacity) || 0,
        revenue,
      };
    }),

    // ── Mapa de assentos ────────────────────────────────────────────────
    seatsList: protectedProcedure.input(z.object({ eventId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const seats = await db.select().from(eventSeats)
        .where(and(eq(eventSeats.organizationId, orgId), eq(eventSeats.eventId, input.eventId)))
        .orderBy(asc(eventSeats.sector), asc(eventSeats.row), asc(eventSeats.number));
      const occupied = await db.select({
        seatSector: tickets.seatSector,
        seatRow: tickets.seatRow,
        seatNumber: tickets.seatNumber,
        status: tickets.status,
      }).from(tickets)
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId), sql`${tickets.status} <> 'cancelado'`, sql`${tickets.seatSector} IS NOT NULL`));
      const occMap = new Map<string, string>(occupied.map((o: any) => [`${o.seatSector}|${o.seatRow}|${o.seatNumber}`, o.status]));
      return seats.map((s) => ({
        ...s,
        occupant: occMap.get(`${s.sector}|${s.row}|${s.number}`) ?? null,
      }));
    }),

    seatsGenerate: protectedProcedure.input(z.object({
      eventId: z.number(),
      sector: z.string().min(1).max(40),
      rows: z.number().int().min(1).max(60),
      perRow: z.number().int().min(1).max(200),
      startNumber: z.number().int().min(1).max(999).default(1),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });

      let created = 0;
      for (let r = 1; r <= input.rows; r++) {
        for (let n = 0; n < input.perRow; n++) {
          const number = String(input.startNumber + n);
          const inserted = await db.insert(eventSeats).values({
            organizationId: orgId,
            eventId: input.eventId,
            sector: input.sector.trim(),
            row: String(r),
            number,
          }).onConflictDoNothing().returning({ id: eventSeats.id });
          if (inserted.length > 0) created += 1;
        }
      }
      return { success: true, created };
    }),

    seatSetStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["disponivel", "bloqueado"]),
      note: z.string().max(120).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [seat] = await db.select({ id: eventSeats.id }).from(eventSeats)
        .where(and(eq(eventSeats.id, input.id), eq(eventSeats.organizationId, orgId))).limit(1);
      if (!seat) throw new TRPCError({ code: "NOT_FOUND", message: "Assento não encontrado." });
      await db.update(eventSeats).set({ status: input.status, note: input.note?.trim() || null }).where(eq(eventSeats.id, input.id));
      return { success: true };
    }),

    seatsDeleteSector: protectedProcedure.input(z.object({ eventId: z.number(), sector: z.string().min(1).max(40) })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const seats = await db.select({ id: eventSeats.id, sector: eventSeats.sector, row: eventSeats.row, number: eventSeats.number }).from(eventSeats)
        .where(and(eq(eventSeats.organizationId, orgId), eq(eventSeats.eventId, input.eventId), eq(eventSeats.sector, input.sector)));
      const occupied = await db.select({ seatSector: tickets.seatSector, seatRow: tickets.seatRow, seatNumber: tickets.seatNumber }).from(tickets)
        .where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId), sql`${tickets.status} <> 'cancelado'`, sql`${tickets.seatSector} IS NOT NULL`));
      const occKeys = new Set(occupied.map((o: any) => `${o.seatSector}|${o.seatRow}|${o.seatNumber}`));
      const removable = seats.filter((s) => !occKeys.has(`${s.sector}|${s.row}|${s.number}`));
      if (removable.length > 0) {
        await db.delete(eventSeats).where(and(
          eq(eventSeats.eventId, input.eventId),
          eq(eventSeats.sector, input.sector),
          inArray(eventSeats.id, removable.map((s) => s.id)),
        ));
      }
      return { success: true, removed: removable.length, kept: seats.length - removable.length };
    }),

    /** Reset administrativo do módulo de ingressos do evento (apaga ingressos, tipos e assentos). */
    purgeEventTickets: protectedProcedure.input(z.object({ eventId: z.number(), confirm: z.literal(true) })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [event] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      await db.delete(tickets).where(and(eq(tickets.organizationId, orgId), eq(tickets.eventId, input.eventId)));
      await db.delete(ticketTypes).where(and(eq(ticketTypes.organizationId, orgId), eq(ticketTypes.eventId, input.eventId)));
      await db.delete(eventSeats).where(and(eq(eventSeats.organizationId, orgId), eq(eventSeats.eventId, input.eventId)));
      return { success: true };
    }),
  }),
};
