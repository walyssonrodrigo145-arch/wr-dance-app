// ─── Saúde & Condicionamento Físico + NPS (DancePro) ─────────────────────────
// Saúde: avaliações periódicas do bailarino (peso, flexibilidade, condicionamento,
// lesões/restrições) — uso interno da escola.
// NPS: pesquisa de satisfação respondida pelo aluno no portal (0–10 + comentário).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { npsResponses, studentHealthRecords, students, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const CONDITIONING_VALUES = ["ruim", "regular", "bom", "excelente"] as const;

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

const healthInput = z.object({
  studentId: z.number(),
  recordDate: z.coerce.date(),
  weightKg: z.number().min(0).max(500).nullable().optional(),
  heightCm: z.number().int().min(0).max(300).nullable().optional(),
  flexibilityCm: z.number().min(-100).max(200).nullable().optional(),
  conditioning: z.enum(CONDITIONING_VALUES).nullable().optional(),
  injuryNotes: z.string().max(2000).nullable().optional(),
  restrictions: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function assertStudentInOrg(db: any, orgId: number, studentId: number) {
  const [student] = await db.select({ id: students.id }).from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
    .limit(1);
  if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });
}

/**
 * LGPD: saúde é dado pessoal sensível. Acesso restrito a admin/owner da escola
 * e ao professor responsável pelo aluno (least privilege) — não a toda a equipe.
 */
async function assertHealthAccess(
  db: any,
  ctx: { user: { id: number; role: string; openId: string; organizationId?: number | null } },
  studentId: number,
) {
  const orgId = ctx.user.organizationId!;
  const [student] = await db.select({ id: students.id, professorId: students.professorId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
    .limit(1);
  if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

  const isAdmin = ctx.user.role === "admin" || ctx.user.role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isAdmin && student.professorId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Dados de saúde são restritos à administração e ao professor responsável pelo aluno.",
    });
  }
  return student;
}

export const saudeRouters = {
  saude: router({
    list: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      await assertHealthAccess(db, ctx, input.studentId);

      return db.select().from(studentHealthRecords)
        .where(and(
          eq(studentHealthRecords.organizationId, orgId),
          eq(studentHealthRecords.studentId, input.studentId),
        ))
        .orderBy(desc(studentHealthRecords.recordDate), desc(studentHealthRecords.id));
    }),

    create: protectedProcedure.input(healthInput).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      await assertHealthAccess(db, ctx, input.studentId);

      const [created] = await db.insert(studentHealthRecords).values({
        organizationId: orgId,
        studentId: input.studentId,
        recordedByUserId: ctx.user.id,
        recordDate: input.recordDate.toISOString().slice(0, 10),
        weightKg: input.weightKg != null ? input.weightKg.toFixed(2) : null,
        heightCm: input.heightCm ?? null,
        flexibilityCm: input.flexibilityCm != null ? input.flexibilityCm.toFixed(1) : null,
        conditioning: input.conditioning ?? null,
        injuryNotes: input.injuryNotes?.trim() || null,
        restrictions: input.restrictions?.trim() || null,
        notes: input.notes?.trim() || null,
      }).returning({ id: studentHealthRecords.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(healthInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: studentHealthRecords.id, studentId: studentHealthRecords.studentId }).from(studentHealthRecords)
        .where(and(eq(studentHealthRecords.id, input.id), eq(studentHealthRecords.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação não encontrada." });
      await assertHealthAccess(db, ctx, existing.studentId);

      await db.update(studentHealthRecords).set({
        recordDate: input.recordDate.toISOString().slice(0, 10),
        weightKg: input.weightKg != null ? input.weightKg.toFixed(2) : null,
        heightCm: input.heightCm ?? null,
        flexibilityCm: input.flexibilityCm != null ? input.flexibilityCm.toFixed(1) : null,
        conditioning: input.conditioning ?? null,
        injuryNotes: input.injuryNotes?.trim() || null,
        restrictions: input.restrictions?.trim() || null,
        notes: input.notes?.trim() || null,
      }).where(eq(studentHealthRecords.id, input.id));

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: studentHealthRecords.id, studentId: studentHealthRecords.studentId }).from(studentHealthRecords)
        .where(and(eq(studentHealthRecords.id, input.id), eq(studentHealthRecords.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Avaliação não encontrada." });
      await assertHealthAccess(db, ctx, existing.studentId);

      await db.delete(studentHealthRecords).where(eq(studentHealthRecords.id, input.id));
      return { success: true };
    }),
  }),

  nps: router({
    /** Resposta do aluno pelo portal (uma por avaliação; pode responder de novo após 90 dias). */
    respond: studentProcedure.input(z.object({
      score: z.number().int().min(0).max(10),
      comment: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de aluno não encontrado." });

      // Anti-spam: no máximo 1 resposta a cada 30 dias por aluno
      const [recent] = await db.select({ respondedAt: npsResponses.respondedAt })
        .from(npsResponses)
        .where(and(
          eq(npsResponses.organizationId, ctx.user.organizationId!),
          eq(npsResponses.studentId, studentId),
        ))
        .orderBy(desc(npsResponses.respondedAt))
        .limit(1);
      if (recent && Date.now() - new Date(recent.respondedAt).getTime() < 30 * 24 * 60 * 60 * 1000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você já respondeu recentemente. Obrigado pela avaliação!" });
      }

      await db.insert(npsResponses).values({
        organizationId: ctx.user.organizationId!,
        studentId,
        score: input.score,
        comment: input.comment?.trim() || null,
        source: "portal",
        respondedAt: new Date(),
      });

      return { success: true };
    }),

    /** Última resposta do aluno (para o portal saber se deve exibir o convite). */
    myLatest: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return null;
      const [latest] = await db.select({
        score: npsResponses.score,
        respondedAt: npsResponses.respondedAt,
      }).from(npsResponses)
        .where(and(
          eq(npsResponses.organizationId, ctx.user.organizationId!),
          eq(npsResponses.studentId, studentId),
        ))
        .orderBy(desc(npsResponses.respondedAt))
        .limit(1);
      return latest ?? null;
    }),

    /** Painel da escola: respostas + NPS consolidado no período. */
    list: protectedProcedure.input(z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { responses: [], summary: { nps: 0, promotores: 0, neutros: 0, detratores: 0, total: 0, media: 0 } };
      const orgId = ctx.user.organizationId!;

      const responses = await db.select({
        id: npsResponses.id,
        score: npsResponses.score,
        comment: npsResponses.comment,
        source: npsResponses.source,
        respondedAt: npsResponses.respondedAt,
        studentId: npsResponses.studentId,
        studentName: students.name,
        createdByName: users.name,
      })
        .from(npsResponses)
        .leftJoin(students, eq(students.id, npsResponses.studentId))
        .leftJoin(users, eq(users.id, npsResponses.createdByUserId))
        .where(and(
          eq(npsResponses.organizationId, orgId),
          input?.from ? gte(npsResponses.respondedAt, input.from) : undefined,
          input?.to ? lte(npsResponses.respondedAt, input.to) : undefined,
        ))
        .orderBy(desc(npsResponses.respondedAt))
        .limit(500);

      const total = responses.length;
      const promotores = responses.filter((row) => row.score >= 9).length;
      const neutros = responses.filter((row) => row.score >= 7 && row.score <= 8).length;
      const detratores = responses.filter((row) => row.score <= 6).length;
      const media = total > 0 ? responses.reduce((sum, row) => sum + row.score, 0) / total : 0;
      const nps = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : 0;

      return { responses, summary: { nps, promotores, neutros, detratores, total, media: Math.round(media * 10) / 10 } };
    }),

    /** Registro manual (ex.: resposta recebida presencialmente ou por WhatsApp). */
    createManual: protectedProcedure.input(z.object({
      studentId: z.number().nullable().optional(),
      score: z.number().int().min(0).max(10),
      comment: z.string().max(2000).nullable().optional(),
      source: z.enum(["manual", "whatsapp"]).default("manual"),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      if (input.studentId != null) {
        await assertStudentInOrg(db, orgId, input.studentId);
      }

      await db.insert(npsResponses).values({
        organizationId: orgId,
        studentId: input.studentId ?? null,
        score: input.score,
        comment: input.comment?.trim() || null,
        source: input.source,
        createdByUserId: ctx.user.id,
        respondedAt: new Date(),
      });

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: npsResponses.id }).from(npsResponses)
        .where(and(eq(npsResponses.id, input.id), eq(npsResponses.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Resposta não encontrada." });

      await db.delete(npsResponses).where(eq(npsResponses.id, input.id));
      return { success: true };
    }),
  }),
};
