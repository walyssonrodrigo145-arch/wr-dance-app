// Calendário Escolar — Feriados, recessos e eventos da escola de dança.
// Usado na aba Configurações → Calendário e na agenda mobile (pontinhos e avisos).
import { z } from "zod";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { schoolHolidays } from "../../drizzle/schema";
import { SCHOOL_HOLIDAY_TYPE_IDS, nationalHolidays } from "../../shared/schoolCalendar";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato AAAA-MM-DD");
const typeSchema = z.enum(SCHOOL_HOLIDAY_TYPE_IDS as [string, ...string[]]);

export const holidaysRouters = {
  schoolHolidays: router({
    /** Lista as marcações do calendário no ano (org do usuário). */
    list: protectedProcedure
      .input(z.object({ year: z.number().int().min(2000).max(2100) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const orgId = ctx.user.organizationId!;
        return db
          .select()
          .from(schoolHolidays)
          .where(
            and(
              eq(schoolHolidays.organizationId, orgId),
              gte(schoolHolidays.date, `${input.year}-01-01`),
              lte(schoolHolidays.date, `${input.year}-12-31`)
            )
          )
          .orderBy(asc(schoolHolidays.date), asc(schoolHolidays.id));
      }),

    /** Cria uma marcação (feriado/recesso/evento). */
    create: adminProcedure
      .input(z.object({ date: dateSchema, name: z.string().trim().min(2).max(255), type: typeSchema }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const [row] = await db
          .insert(schoolHolidays)
          .values({ organizationId: orgId, date: input.date, name: input.name, type: input.type, createdByUserId: ctx.user.id })
          .returning();
        return { success: true, holiday: row };
      }),

    /** Edita uma marcação existente. */
    update: adminProcedure
      .input(z.object({ id: z.number().int(), date: dateSchema.optional(), name: z.string().trim().min(2).max(255).optional(), type: typeSchema.optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        const patch: Record<string, unknown> = {};
        if (input.date) patch.date = input.date;
        if (input.name) patch.name = input.name;
        if (input.type) patch.type = input.type;
        if (!Object.keys(patch).length) return { success: true, unchanged: true };
        await db
          .update(schoolHolidays)
          .set(patch)
          .where(and(eq(schoolHolidays.id, input.id), eq(schoolHolidays.organizationId, orgId)));
        return { success: true };
      }),

    /** Remove uma marcação. */
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;
        await db.delete(schoolHolidays).where(and(eq(schoolHolidays.id, input.id), eq(schoolHolidays.organizationId, orgId)));
        return { success: true };
      }),

    /** Importa os feriados nacionais do ano (não duplica os já existentes). */
    seedNational: adminProcedure
      .input(z.object({ year: z.number().int().min(2000).max(2100) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const orgId = ctx.user.organizationId!;

        const existentes = await db
          .select({ date: schoolHolidays.date, name: schoolHolidays.name })
          .from(schoolHolidays)
          .where(
            and(
              eq(schoolHolidays.organizationId, orgId),
              gte(schoolHolidays.date, `${input.year}-01-01`),
              lte(schoolHolidays.date, `${input.year}-12-31`)
            )
          );
        const chaves = new Set(existentes.map((e) => `${e.date}|${e.name}`));

        const novos = nationalHolidays(input.year).filter((h) => !chaves.has(`${h.date}|${h.name}`));
        if (novos.length) {
          await db.insert(schoolHolidays).values(
            novos.map((h) => ({
              organizationId: orgId,
              date: h.date,
              name: h.name,
              type: "feriado_nacional",
              createdByUserId: ctx.user.id,
            }))
          );
        }
        return { success: true, inserted: novos.length, total: (existentes?.length || 0) + novos.length };
      }),
  }),
};
