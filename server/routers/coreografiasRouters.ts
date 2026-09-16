// ─── Coreografias (DancePro) ─────────────────────────────────────────────────
// Núcleo pedagógico de dança: coreografia + elenco de alunos com progresso de
// domínio. Visível no painel (admin/professor) e no portal do aluno (leitura).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coreografiaAlunos, coreografias, instruments, students, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { extractYoutubeRef } from "../utils/youtubeUrl";

const STATUS_VALIDOS = ["em_montagem", "ensaiando", "pronta", "arquivada"] as const;
const NIVEIS_VALIDOS = ["iniciante", "intermediario", "avancado", "todas"] as const;
const FORMACOES_VALIDAS = ["solo", "duo", "grupo", "formacao"] as const;
const CAST_STATUS_VALIDOS = ["convidado", "confirmado", "desistiu", "substituto"] as const;

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === "admin" || role === "professor" || role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

/** Resolve o studentId do usuário-aluno logado (por vínculo direto ou studentUserId). */
async function resolveStudentId(db: any, ctx: { user: { id: number; studentId?: number | null; organizationId?: number | null } }) {
  if (ctx.user.studentId) return ctx.user.studentId as number;
  const [found] = await db.select({ id: students.id })
    .from(students)
    .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, ctx.user.organizationId!)))
    .limit(1);
  return found?.id ?? null;
}

/** Valida link do YouTube (videoId/playlistId extraídos server-side). */
function parseVideo(raw: string | null | undefined): { videoUrl: string | null; videoId: string | null } {
  if (!raw || !raw.trim()) return { videoUrl: null, videoId: null };
  const ref = extractYoutubeRef(raw);
  if (!ref) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um link válido do YouTube (ex.: https://youtu.be/...)." });
  }
  return { videoUrl: raw.trim(), videoId: ref.videoId };
}

const coreografiaInput = z.object({
  title: z.string().min(2, "Informe o nome da coreografia").max(255),
  modalidadeId: z.number().nullable().optional(),
  nivel: z.enum(NIVEIS_VALIDOS).default("todas"),
  formacao: z.enum(FORMACOES_VALIDAS).default("grupo"),
  professorId: z.number().nullable().optional(),
  musica: z.string().max(255).nullable().optional(),
  descricao: z.string().max(5000).nullable().optional(),
  videoUrl: z.string().max(500).nullable().optional(),
  status: z.enum(STATUS_VALIDOS).default("em_montagem"),
  eventId: z.number().nullable().optional(),
});

export const coreografiasRouters = {
  coreografias: router({
    /** Lista de coreografias da escola com contagem/tempo médio do elenco. */
    list: protectedProcedure.input(z.object({
      search: z.string().max(120).optional(),
      status: z.enum(STATUS_VALIDOS).optional(),
      modalidadeId: z.number().optional(),
      incluirArquivadas: z.boolean().default(false),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const elencoCount = sql<number>`(SELECT COUNT(*) FROM "coreografia_alunos" ca WHERE ca."coreografiaId" = ${coreografias.id})`.as("elencoCount");
      const progressoMedio = sql<number>`(SELECT COALESCE(AVG(ca2."progresso"), 0) FROM "coreografia_alunos" ca2 WHERE ca2."coreografiaId" = ${coreografias.id})`.as("progressoMedio");

      const filters = [
        eq(coreografias.organizationId, orgId),
        input?.status
          ? eq(coreografias.status, input.status)
          : input?.incluirArquivadas
            ? undefined
            : sql`${coreografias.status} <> 'arquivada'`,
        input?.modalidadeId ? eq(coreografias.modalidadeId, input.modalidadeId) : undefined,
        input?.search
          ? or(ilike(coreografias.title, `%${input.search}%`), ilike(coreografias.musica, `%${input.search}%`))
          : undefined,
      ];

      const rows = await db.select({
        id: coreografias.id,
        title: coreografias.title,
        modalidadeId: coreografias.modalidadeId,
        modalidadeName: instruments.name,
        professorId: coreografias.professorId,
        professorName: users.name,
        nivel: coreografias.nivel,
        formacao: coreografias.formacao,
        musica: coreografias.musica,
        descricao: coreografias.descricao,
        videoUrl: coreografias.videoUrl,
        videoId: coreografias.videoId,
        status: coreografias.status,
        eventId: coreografias.eventId,
        createdAt: coreografias.createdAt,
        elencoCount,
        progressoMedio,
      })
        .from(coreografias)
        .leftJoin(instruments, eq(instruments.id, coreografias.modalidadeId))
        .leftJoin(users, eq(users.id, coreografias.professorId))
        .where(and(...filters))
        .orderBy(desc(coreografias.createdAt));

      return rows.map((row) => ({
        ...row,
        elencoCount: Number(row.elencoCount) || 0,
        progressoMedio: Math.round(Number(row.progressoMedio) || 0),
      }));
    }),

    /** KPIs por status para os cards do topo. */
    stats: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { total: 0, em_montagem: 0, ensaiando: 0, pronta: 0, arquivada: 0, elenco: 0 };
      const orgId = ctx.user.organizationId!;
      const grouped = await db.select({
        status: coreografias.status,
        count: sql<number>`CAST(COUNT(*) AS INT)`,
      }).from(coreografias)
        .where(and(eq(coreografias.organizationId, orgId), eq(coreografias.active, true)))
        .groupBy(coreografias.status);
      const [{ elenco }] = await db.select({ elenco: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(coreografiaAlunos)
        .where(eq(coreografiaAlunos.organizationId, orgId));

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of grouped) {
        byStatus[row.status] = Number(row.count) || 0;
        total += Number(row.count) || 0;
      }
      return {
        total,
        em_montagem: byStatus.em_montagem || 0,
        ensaiando: byStatus.ensaiando || 0,
        pronta: byStatus.pronta || 0,
        arquivada: byStatus.arquivada || 0,
        elenco: Number(elenco) || 0,
      };
    }),

    /** Detalhe + elenco completo (dados do aluno para a lista). */
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [coreografia] = await db.select().from(coreografias)
        .where(and(eq(coreografias.id, input.id), eq(coreografias.organizationId, orgId)))
        .limit(1);
      if (!coreografia) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada." });

      const elenco = await db.select({
        id: coreografiaAlunos.id,
        studentId: coreografiaAlunos.studentId,
        studentName: students.name,
        studentAvatar: students.avatar,
        studentLevel: students.level,
        studentStatus: students.status,
        papel: coreografiaAlunos.papel,
        status: coreografiaAlunos.status,
        progresso: coreografiaAlunos.progresso,
        observacoes: coreografiaAlunos.observacoes,
      })
        .from(coreografiaAlunos)
        .innerJoin(students, eq(students.id, coreografiaAlunos.studentId))
        .where(eq(coreografiaAlunos.coreografiaId, input.id))
        .orderBy(asc(coreografiaAlunos.id));

      return { ...coreografia, elenco };
    }),

    create: protectedProcedure.input(coreografiaInput).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const video = parseVideo(input.videoUrl);

      const [created] = await db.insert(coreografias).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        title: input.title.trim(),
        modalidadeId: input.modalidadeId ?? null,
        nivel: input.nivel,
        formacao: input.formacao,
        professorId: input.professorId ?? null,
        musica: input.musica?.trim() || null,
        descricao: input.descricao?.trim() || null,
        videoUrl: video.videoUrl,
        videoId: video.videoId,
        status: input.status,
        eventId: input.eventId ?? null,
      }).returning({ id: coreografias.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(coreografiaInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: coreografias.id }).from(coreografias)
        .where(and(eq(coreografias.id, input.id), eq(coreografias.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada." });

      const video = parseVideo(input.videoUrl);

      await db.update(coreografias).set({
        title: input.title.trim(),
        modalidadeId: input.modalidadeId ?? null,
        nivel: input.nivel,
        formacao: input.formacao,
        professorId: input.professorId ?? null,
        musica: input.musica?.trim() || null,
        descricao: input.descricao?.trim() || null,
        videoUrl: video.videoUrl,
        videoId: video.videoId,
        status: input.status,
        eventId: input.eventId ?? null,
        updatedAt: new Date(),
      }).where(eq(coreografias.id, input.id));

      return { success: true };
    }),

    /** Exclui a coreografia e todo o elenco (sem histórico financeiro vinculado). */
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: coreografias.id }).from(coreografias)
        .where(and(eq(coreografias.id, input.id), eq(coreografias.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada." });

      await db.delete(coreografiaAlunos).where(eq(coreografiaAlunos.coreografiaId, input.id));
      await db.delete(coreografias).where(eq(coreografias.id, input.id));
      return { success: true };
    }),

    /** Escala um aluno no elenco (bloqueia duplicidade). */
    addAluno: protectedProcedure.input(z.object({
      coreografiaId: z.number(),
      studentId: z.number(),
      papel: z.string().max(120).nullable().optional(),
      status: z.enum(CAST_STATUS_VALIDOS).default("convidado"),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [coreografia] = await db.select({ id: coreografias.id }).from(coreografias)
        .where(and(eq(coreografias.id, input.coreografiaId), eq(coreografias.organizationId, orgId)))
        .limit(1);
      if (!coreografia) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada." });

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      const [duplicate] = await db.select({ id: coreografiaAlunos.id }).from(coreografiaAlunos)
        .where(and(eq(coreografiaAlunos.coreografiaId, input.coreografiaId), eq(coreografiaAlunos.studentId, input.studentId)))
        .limit(1);
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Este aluno já está no elenco desta coreografia." });
      }

      const [created] = await db.insert(coreografiaAlunos).values({
        organizationId: orgId,
        coreografiaId: input.coreografiaId,
        studentId: input.studentId,
        papel: input.papel?.trim() || null,
        status: input.status,
      }).returning({ id: coreografiaAlunos.id });

      return { success: true, id: created.id };
    }),

    updateAluno: protectedProcedure.input(z.object({
      id: z.number(),
      papel: z.string().max(120).nullable().optional(),
      status: z.enum(CAST_STATUS_VALIDOS).optional(),
      progresso: z.number().min(0).max(100).optional(),
      observacoes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: coreografiaAlunos.id }).from(coreografiaAlunos)
        .where(and(eq(coreografiaAlunos.id, input.id), eq(coreografiaAlunos.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Registro de elenco não encontrado." });

      await db.update(coreografiaAlunos).set({
        ...(input.papel !== undefined ? { papel: input.papel?.trim() || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.progresso !== undefined ? { progresso: input.progresso } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(eq(coreografiaAlunos.id, input.id));

      return { success: true };
    }),

    removeAluno: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: coreografiaAlunos.id }).from(coreografiaAlunos)
        .where(and(eq(coreografiaAlunos.id, input.id), eq(coreografiaAlunos.organizationId, orgId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Registro de elenco não encontrado." });

      await db.delete(coreografiaAlunos).where(eq(coreografiaAlunos.id, input.id));
      return { success: true };
    }),

    /** Busca de alunos para o seletor do elenco (exclui quem já está na coreografia). */
    searchAlunos: protectedProcedure.input(z.object({
      q: z.string().max(120),
      coreografiaId: z.number().optional(),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      if (!input.q.trim()) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.trim().toLowerCase()}%`;

      const jaEscalados = input.coreografiaId
        ? db.select({ studentId: coreografiaAlunos.studentId }).from(coreografiaAlunos)
            .where(eq(coreografiaAlunos.coreografiaId, input.coreografiaId))
        : null;

      const rows = await db.select({
        id: students.id,
        name: students.name,
        level: students.level,
        status: students.status,
      }).from(students).where(and(
        eq(students.organizationId, orgId),
        eq(students.status, "ativo"),
        sql`(LOWER(${students.name}) LIKE ${term} OR LOWER(COALESCE(${students.email}, '')) LIKE ${term})`,
        jaEscalados ? sql`${students.id} NOT IN (${jaEscalados})` : undefined,
      )).limit(10);

      return rows;
    }),

    /** Portal do aluno: coreografias em que o aluno está escalado. */
    myCoreografias: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      return db.select({
        castId: coreografiaAlunos.id,
        papel: coreografiaAlunos.papel,
        castStatus: coreografiaAlunos.status,
        progresso: coreografiaAlunos.progresso,
        observacoes: coreografiaAlunos.observacoes,
        id: coreografias.id,
        title: coreografias.title,
        musica: coreografias.musica,
        nivel: coreografias.nivel,
        formacao: coreografias.formacao,
        status: coreografias.status,
        videoUrl: coreografias.videoUrl,
        videoId: coreografias.videoId,
        modalidadeName: instruments.name,
        professorName: users.name,
      })
        .from(coreografiaAlunos)
        .innerJoin(coreografias, eq(coreografias.id, coreografiaAlunos.coreografiaId))
        .leftJoin(instruments, eq(instruments.id, coreografias.modalidadeId))
        .leftJoin(users, eq(users.id, coreografias.professorId))
        .where(and(
          eq(coreografiaAlunos.studentId, studentId),
          eq(coreografiaAlunos.organizationId, ctx.user.organizationId!),
          eq(coreografias.active, true),
          sql`${coreografias.status} <> 'arquivada'`,
        ))
        .orderBy(desc(coreografias.createdAt));
    }),
  }),
};
