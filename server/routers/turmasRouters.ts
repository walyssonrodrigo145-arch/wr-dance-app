// ─── Turmas com vagas e lista de espera (DancePro) ───────────────────────────
// A turma é o contrato coletivo (grade semanal, capacidade e fila). Ao abrir
// vaga (cancelamento/remoção), o primeiro da lista de espera sobe automaticamente.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instruments, students, studioRooms, turmaAlunos, turmas, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const TURMA_STATUS = ["ativa", "pausada", "encerrada"] as const;
const LEVELS = ["iniciante", "intermediario", "avancado", "todas"] as const;
const ENROLLMENT_STATUS = ["ativa", "espera", "cancelada"] as const;

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

const turmaInput = z.object({
  name: z.string().min(2, "Informe o nome da turma").max(255),
  modalidadeId: z.number().nullable().optional(),
  professorId: z.number().nullable().optional(),
  studioRoomId: z.number().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  timeStr: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido (use HH:MM)").nullable().optional(),
  durationMinutes: z.number().int().min(15).max(600).default(60),
  capacity: z.number().int().min(1).max(500).default(20),
  level: z.enum(LEVELS).default("todas"),
  status: z.enum(TURMA_STATUS).default("ativa"),
  notes: z.string().max(2000).nullable().optional(),
});

export const turmasRouters = {
  turmas: router({
    list: protectedProcedure.input(z.object({
      search: z.string().max(120).optional(),
      status: z.enum(TURMA_STATUS).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const matriculados = sql<number>`(SELECT COUNT(*) FROM "turma_alunos" ta WHERE ta."turmaId" = ${turmas.id} AND ta."status" = 'ativa')`.as("matriculados");
      const espera = sql<number>`(SELECT COUNT(*) FROM "turma_alunos" te WHERE te."turmaId" = ${turmas.id} AND te."status" = 'espera')`.as("espera");

      const rows = await db.select({
        id: turmas.id,
        name: turmas.name,
        modalidadeId: turmas.modalidadeId,
        modalidadeName: instruments.name,
        professorId: turmas.professorId,
        professorName: users.name,
        studioRoomId: turmas.studioRoomId,
        roomName: studioRooms.name,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
        capacity: turmas.capacity,
        level: turmas.level,
        status: turmas.status,
        notes: turmas.notes,
        matriculados,
        espera,
      })
        .from(turmas)
        .leftJoin(instruments, eq(instruments.id, turmas.modalidadeId))
        .leftJoin(users, eq(users.id, turmas.professorId))
        .leftJoin(studioRooms, eq(studioRooms.id, turmas.studioRoomId))
        .where(and(
          eq(turmas.organizationId, orgId),
          input?.status ? eq(turmas.status, input.status) : undefined,
          input?.search ? ilike(turmas.name, `%${input.search}%`) : undefined,
        ))
        .orderBy(asc(turmas.name));

      return rows.map((row) => {
        const ocupadas = Number(row.matriculados) || 0;
        return {
          ...row,
          matriculados: ocupadas,
          espera: Number(row.espera) || 0,
          vagas: Math.max(0, row.capacity - ocupadas),
        };
      });
    }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { turmasAtivas: 0, matriculados: 0, vagasAbertas: 0, espera: 0 };
      const orgId = ctx.user.organizationId!;

      const [ativas] = await db.select({
        count: sql<number>`CAST(COUNT(*) AS INT)`,
        capacidade: sql<number>`CAST(COALESCE(SUM(${turmas.capacity}), 0) AS INT)`,
      }).from(turmas).where(and(eq(turmas.organizationId, orgId), eq(turmas.status, "ativa")));

      const [matriculados] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.organizationId, orgId), eq(turmaAlunos.status, "ativa")));

      const [espera] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.organizationId, orgId), eq(turmaAlunos.status, "espera")));

      const capacidadeTotal = Number(ativas?.capacidade) || 0;
      const ocupadasTotal = Number(matriculados?.count) || 0;

      return {
        turmasAtivas: Number(ativas?.count) || 0,
        matriculados: ocupadasTotal,
        vagasAbertas: Math.max(0, capacidadeTotal - ocupadasTotal),
        espera: Number(espera?.count) || 0,
      };
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [turma] = await db.select().from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId)))
        .limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada." });

      const alunos = await db.select({
        id: turmaAlunos.id,
        studentId: turmaAlunos.studentId,
        studentName: students.name,
        studentAvatar: students.avatar,
        studentLevel: students.level,
        studentStatus: students.status,
        status: turmaAlunos.status,
        position: turmaAlunos.position,
        enrolledAt: turmaAlunos.enrolledAt,
        notes: turmaAlunos.notes,
      })
        .from(turmaAlunos)
        .innerJoin(students, eq(students.id, turmaAlunos.studentId))
        .where(eq(turmaAlunos.turmaId, input.id))
        .orderBy(asc(turmaAlunos.status), asc(turmaAlunos.position), asc(students.name));

      return { ...turma, alunos };
    }),

    create: protectedProcedure.input(turmaInput).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [created] = await db.insert(turmas).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        name: input.name.trim(),
        modalidadeId: input.modalidadeId ?? null,
        professorId: input.professorId ?? null,
        studioRoomId: input.studioRoomId ?? null,
        weekdays: input.weekdays,
        timeStr: input.timeStr ?? null,
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        level: input.level,
        status: input.status,
        notes: input.notes?.trim() || null,
      }).returning({ id: turmas.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(turmaInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: turmas.id }).from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada." });

      const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.id), eq(turmaAlunos.status, "ativa")));
      if (input.capacity < (Number(ocupadas?.count) || 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A turma já tem ${ocupadas.count} aluno(s) matriculado(s) — a capacidade não pode ficar abaixo disso.`,
        });
      }

      await db.update(turmas).set({
        name: input.name.trim(),
        modalidadeId: input.modalidadeId ?? null,
        professorId: input.professorId ?? null,
        studioRoomId: input.studioRoomId ?? null,
        weekdays: input.weekdays,
        timeStr: input.timeStr ?? null,
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        level: input.level,
        status: input.status,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      }).where(eq(turmas.id, input.id));

      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: turmas.id }).from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada." });

      await db.delete(turmaAlunos).where(eq(turmaAlunos.turmaId, input.id));
      await db.delete(turmas).where(eq(turmas.id, input.id));
      return { success: true };
    }),

    /** Matricula o aluno: com vaga entra como ativa; sem vaga, entra na fila. */
    enroll: protectedProcedure.input(z.object({
      turmaId: z.number(),
      studentId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [turma] = await db.select({ id: turmas.id, capacity: turmas.capacity, status: turmas.status, name: turmas.name })
        .from(turmas)
        .where(and(eq(turmas.id, input.turmaId), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada." });
      if (turma.status === "encerrada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta turma está encerrada e não aceita novas matrículas." });
      }

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      const [existing] = await db.select({ id: turmaAlunos.id, status: turmaAlunos.status }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.studentId, input.studentId))).limit(1);
      if (existing && existing.status !== "cancelada") {
        throw new TRPCError({
          code: "CONFLICT",
          message: existing.status === "espera"
            ? "Este aluno já está na lista de espera desta turma."
            : "Este aluno já está matriculado nesta turma.",
        });
      }

      const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.status, "ativa")));
      const temVaga = (Number(ocupadas?.count) || 0) < turma.capacity;

      const [{ maxPosition }] = await db.select({ maxPosition: sql<number>`COALESCE(MAX(${turmaAlunos.position}), 0)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.status, "espera")));

      const values = {
        organizationId: orgId,
        turmaId: input.turmaId,
        studentId: input.studentId,
        status: temVaga ? ("ativa" as const) : ("espera" as const),
        position: temVaga ? 0 : (Number(maxPosition) || 0) + 1,
        enrolledAt: new Date(),
        updatedAt: new Date(),
      };

      if (existing) {
        await db.update(turmaAlunos).set(values).where(eq(turmaAlunos.id, existing.id));
      } else {
        await db.insert(turmaAlunos).values(values);
      }

      return { success: true, waitlisted: !temVaga };
    }),

    updateEnrollment: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(ENROLLMENT_STATUS).optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [enrollment] = await db.select({
        id: turmaAlunos.id,
        turmaId: turmaAlunos.turmaId,
        status: turmaAlunos.status,
      }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.id, input.id), eq(turmaAlunos.organizationId, orgId))).limit(1);
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND", message: "Matrícula não encontrada." });

      if (input.status === "ativa" && enrollment.status !== "ativa") {
        const [turma] = await db.select({ capacity: turmas.capacity }).from(turmas).where(eq(turmas.id, enrollment.turmaId)).limit(1);
        const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(turmaAlunos)
          .where(and(eq(turmaAlunos.turmaId, enrollment.turmaId), eq(turmaAlunos.status, "ativa")));
        if ((Number(ocupadas?.count) || 0) >= (turma?.capacity ?? 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A turma está lotada — não há vaga para ativar esta matrícula." });
        }
      }

      await db.update(turmaAlunos).set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(eq(turmaAlunos.id, input.id));

      return { success: true };
    }),

    /** Cancela/remove matrícula e promove automaticamente o próximo da fila. */
    cancelEnrollment: protectedProcedure.input(z.object({
      id: z.number(),
      hardDelete: z.boolean().default(false),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [enrollment] = await db.select({
        id: turmaAlunos.id,
        turmaId: turmaAlunos.turmaId,
        status: turmaAlunos.status,
        studentId: turmaAlunos.studentId,
      }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.id, input.id), eq(turmaAlunos.organizationId, orgId))).limit(1);
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND", message: "Matrícula não encontrada." });

      if (input.hardDelete) {
        await db.delete(turmaAlunos).where(eq(turmaAlunos.id, input.id));
      } else {
        await db.update(turmaAlunos).set({ status: "cancelada", position: 0, updatedAt: new Date() })
          .where(eq(turmaAlunos.id, input.id));
      }

      // Promoção automática da lista de espera quando uma vaga é aberta
      let promoted: { id: number; studentId: number } | null = null;
      if (enrollment.status === "ativa") {
        const [next] = await db.select({ id: turmaAlunos.id, studentId: turmaAlunos.studentId })
          .from(turmaAlunos)
          .where(and(eq(turmaAlunos.turmaId, enrollment.turmaId), eq(turmaAlunos.status, "espera")))
          .orderBy(asc(turmaAlunos.position), asc(turmaAlunos.id))
          .limit(1);
        if (next) {
          await db.update(turmaAlunos).set({ status: "ativa", position: 0, updatedAt: new Date() })
            .where(eq(turmaAlunos.id, next.id));
          promoted = next;
        }
      }

      return { success: true, promoted };
    }),

    /** Promove manualmente um aluno da lista de espera (respeita a capacidade). */
    promoteFromWaitlist: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [enrollment] = await db.select({
        id: turmaAlunos.id,
        turmaId: turmaAlunos.turmaId,
        status: turmaAlunos.status,
      }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.id, input.id), eq(turmaAlunos.organizationId, orgId))).limit(1);
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND", message: "Matrícula não encontrada." });
      if (enrollment.status !== "espera") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Somente alunos na lista de espera podem ser promovidos." });
      }

      const [turma] = await db.select({ capacity: turmas.capacity }).from(turmas).where(eq(turmas.id, enrollment.turmaId)).limit(1);
      const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, enrollment.turmaId), eq(turmaAlunos.status, "ativa")));
      if ((Number(ocupadas?.count) || 0) >= (turma?.capacity ?? 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A turma está lotada — não há vaga no momento." });
      }

      await db.update(turmaAlunos).set({ status: "ativa", position: 0, updatedAt: new Date() })
        .where(eq(turmaAlunos.id, input.id));
      return { success: true };
    }),

    searchAlunos: protectedProcedure.input(z.object({
      q: z.string().max(120),
      turmaId: z.number().optional(),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      if (!input.q.trim()) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.trim().toLowerCase()}%`;

      const jaNaTurma = input.turmaId
        ? db.select({ studentId: turmaAlunos.studentId }).from(turmaAlunos)
            .where(and(eq(turmaAlunos.turmaId, input.turmaId), sql`${turmaAlunos.status} <> 'cancelada'`))
        : null;

      return db.select({ id: students.id, name: students.name, level: students.level })
        .from(students)
        .where(and(
          eq(students.organizationId, orgId),
          eq(students.status, "ativo"),
          sql`(LOWER(${students.name}) LIKE ${term} OR LOWER(COALESCE(${students.email}, '')) LIKE ${term})`,
          jaNaTurma ? sql`${students.id} NOT IN (${jaNaTurma})` : undefined,
        ))
        .limit(10);
    }),

    /** Portal do aluno: turmas em que está matriculado. */
    myTurmas: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      return db.select({
        enrollmentId: turmaAlunos.id,
        enrollmentStatus: turmaAlunos.status,
        id: turmas.id,
        name: turmas.name,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
        level: turmas.level,
        status: turmas.status,
        modalidadeName: instruments.name,
        professorName: users.name,
        roomName: studioRooms.name,
      })
        .from(turmaAlunos)
        .innerJoin(turmas, eq(turmas.id, turmaAlunos.turmaId))
        .leftJoin(instruments, eq(instruments.id, turmas.modalidadeId))
        .leftJoin(users, eq(users.id, turmas.professorId))
        .leftJoin(studioRooms, eq(studioRooms.id, turmas.studioRoomId))
        .where(and(
          eq(turmaAlunos.studentId, studentId),
          eq(turmaAlunos.organizationId, ctx.user.organizationId!),
          sql`${turmaAlunos.status} <> 'cancelada'`,
          sql`${turmas.status} <> 'encerrada'`,
        ))
        .orderBy(asc(turmas.name));
    }),
  }),
};
