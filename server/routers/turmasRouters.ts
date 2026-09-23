// ─── Turmas com vagas e lista de espera (DancePro) ───────────────────────────
// A turma é o contrato coletivo (grade semanal, capacidade e fila). Ao abrir
// vaga (cancelamento/remoção), o primeiro da lista de espera sobe automaticamente.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instruments, lessons, studentEnrollments, students, studioRooms, turmaAlunos, turmas, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { previewTurmaLessons, generateTurmaLessons, cancelFutureTurmaLessons, todayBR, addMonthsISO } from "../services/TurmaScheduleService";

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

/** Promove o primeiro da lista de espera quando uma vaga é aberta (ordem da fila).
 *  Pula (sem remover) quem tiver conflito de horário com outra matrícula/turma. */
async function promoteNextFromWaitlist(db: any, turmaId: number, orgId: number) {
  const [turma] = await db.select({
    weekdays: turmas.weekdays,
    timeStr: turmas.timeStr,
    durationMinutes: turmas.durationMinutes,
  }).from(turmas).where(eq(turmas.id, turmaId)).limit(1);

  const queue = await db.select({ id: turmaAlunos.id, studentId: turmaAlunos.studentId })
    .from(turmaAlunos)
    .where(and(eq(turmaAlunos.turmaId, turmaId), eq(turmaAlunos.status, "espera")))
    .orderBy(asc(turmaAlunos.position), asc(turmaAlunos.id))
    .limit(50);

  for (const next of queue as Array<{ id: number; studentId: number }>) {
    if (turma) {
      const conflict = await findStudentScheduleConflict(
        db, orgId, next.studentId, (turma.weekdays as number[] | null) ?? [], turma.timeStr, turma.durationMinutes,
        { excludeEnrollmentId: next.id },
      );
      if (conflict) continue; // aluno com choque de horário: mantém na fila e tenta o próximo
    }
    await db.update(turmaAlunos).set({ status: "ativa", position: 0, updatedAt: new Date() })
      .where(eq(turmaAlunos.id, next.id));
    return next;
  }
  return null;
}

/** Cancela a matrícula (soft) e promove o próximo da fila se a vaga foi aberta. */
async function releaseEnrollmentSlot(db: any, enrollment: { id: number; turmaId: number; status: string }, orgId: number) {
  await db.update(turmaAlunos).set({ status: "cancelada", position: 0, updatedAt: new Date() })
    .where(eq(turmaAlunos.id, enrollment.id));
  if (enrollment.status === "ativa") {
    return promoteNextFromWaitlist(db, enrollment.turmaId, orgId);
  }
  return null;
}

/** Converte "HH:MM" em minutos desde 00:00 (null se inválido/ausente). */
function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * D3 — Conflito de horário do ALUNO: bloqueia matrícula (ou promoção) quando o
 * aluno já tem outra turma ativa ou matrícula adicional no mesmo dia/horário.
 * Retorna a mensagem de conflito (null = sem conflito).
 */
async function findStudentScheduleConflict(
  db: any,
  orgId: number,
  studentId: number,
  weekdays: number[],
  timeStr: string | null,
  durationMinutes: number,
  opts?: { excludeEnrollmentId?: number },
): Promise<string | null> {
  const start = timeToMinutes(timeStr);
  if (start == null || !weekdays || weekdays.length === 0) return null;
  const end = start + (Number(durationMinutes) || 60);

  const rows = await db.select({
    enrollmentId: turmaAlunos.id,
    turmaName: turmas.name,
    weekdays: turmas.weekdays,
    timeStr: turmas.timeStr,
    durationMinutes: turmas.durationMinutes,
  }).from(turmaAlunos)
    .innerJoin(turmas, eq(turmas.id, turmaAlunos.turmaId))
    .where(and(
      eq(turmaAlunos.studentId, studentId),
      eq(turmaAlunos.organizationId, orgId),
      eq(turmaAlunos.status, "ativa"),
      eq(turmas.status, "ativa"),
    ));

  for (const row of rows as any[]) {
    if (opts?.excludeEnrollmentId && row.enrollmentId === opts.excludeEnrollmentId) continue;
    const otherStart = timeToMinutes(row.timeStr);
    if (otherStart == null) continue;
    const otherEnd = otherStart + (Number(row.durationMinutes) || 60);
    const sameDay = ((row.weekdays as number[] | null) ?? []).some((day: number) => weekdays.includes(day));
    if (sameDay && start < otherEnd && otherStart < end) {
      return `Conflito de horário: o aluno já está na turma "${row.turmaName}" nesse mesmo dia/horário.`;
    }
  }

  const enrollments = await db.select({
    id: studentEnrollments.id,
    weekday: studentEnrollments.weekday,
    timeStr: studentEnrollments.timeStr,
  }).from(studentEnrollments)
    .where(and(
      eq(studentEnrollments.studentId, studentId),
      eq(studentEnrollments.organizationId, orgId),
      eq(studentEnrollments.status, "ativo"),
    ));

  for (const enrollment of enrollments as any[]) {
    const otherStart = timeToMinutes(enrollment.timeStr);
    if (otherStart == null) continue;
    if (weekdays.includes(Number(enrollment.weekday)) && start < otherStart + 60 && otherStart < end) {
      return "Conflito de horário: o aluno já tem uma matrícula adicional nesse mesmo dia/horário.";
    }
  }

  return null;
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
  ageMin: z.number().int().min(0).max(120).nullable().optional(),
  ageMax: z.number().int().min(0).max(120).nullable().optional(),
  shift: z.string().max(40).nullable().optional(),
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
        ageMin: turmas.ageMin,
        ageMax: turmas.ageMax,
        shift: turmas.shift,
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
        ageMin: input.ageMin ?? null,
        ageMax: input.ageMax ?? null,
        shift: input.shift?.trim() || null,
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
        ageMin: input.ageMin ?? null,
        ageMax: input.ageMax ?? null,
        shift: input.shift?.trim() || null,
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

      const [turma] = await db.select({
        id: turmas.id,
        capacity: turmas.capacity,
        status: turmas.status,
        name: turmas.name,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
      })
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

      // D3: bloqueio de conflito de horário do aluno (depois de descartar duplicidade)
      const conflict = await findStudentScheduleConflict(
        db, orgId, input.studentId, (turma.weekdays as number[] | null) ?? [], turma.timeStr, turma.durationMinutes,
      );
      if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: conflict });

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
        studentId: turmaAlunos.studentId,
      }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.id, input.id), eq(turmaAlunos.organizationId, orgId))).limit(1);
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND", message: "Matrícula não encontrada." });

      if (input.status === "ativa" && enrollment.status !== "ativa") {
        const [turma] = await db.select({
          capacity: turmas.capacity,
          name: turmas.name,
          weekdays: turmas.weekdays,
          timeStr: turmas.timeStr,
          durationMinutes: turmas.durationMinutes,
        }).from(turmas).where(eq(turmas.id, enrollment.turmaId)).limit(1);
        const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(turmaAlunos)
          .where(and(eq(turmaAlunos.turmaId, enrollment.turmaId), eq(turmaAlunos.status, "ativa")));
        if ((Number(ocupadas?.count) || 0) >= (turma?.capacity ?? 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A turma está lotada — não há vaga para ativar esta matrícula." });
        }

        const conflict = await findStudentScheduleConflict(
          db, orgId, enrollment.studentId, (turma?.weekdays as number[] | null) ?? [], turma?.timeStr ?? null, turma?.durationMinutes ?? 60,
          { excludeEnrollmentId: enrollment.id },
        );
        if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: conflict });
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
        const promoted = enrollment.status === "ativa"
          ? await promoteNextFromWaitlist(db, enrollment.turmaId, orgId)
          : null;
        return { success: true, promoted };
      }

      // Cancela + promove o próximo da fila (pulando conflitos de horário)
      const promoted = await releaseEnrollmentSlot(db, enrollment, orgId);
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
        studentId: turmaAlunos.studentId,
      }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.id, input.id), eq(turmaAlunos.organizationId, orgId))).limit(1);
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND", message: "Matrícula não encontrada." });
      if (enrollment.status !== "espera") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Somente alunos na lista de espera podem ser promovidos." });
      }

      const [turma] = await db.select({
        capacity: turmas.capacity,
        name: turmas.name,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
      }).from(turmas).where(eq(turmas.id, enrollment.turmaId)).limit(1);
      const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, enrollment.turmaId), eq(turmaAlunos.status, "ativa")));
      if ((Number(ocupadas?.count) || 0) >= (turma?.capacity ?? 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A turma está lotada — não há vaga no momento." });
      }

      const conflict = await findStudentScheduleConflict(
        db, orgId, enrollment.studentId, (turma?.weekdays as number[] | null) ?? [], turma?.timeStr ?? null, turma?.durationMinutes ?? 60,
        { excludeEnrollmentId: enrollment.id },
      );
      if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: conflict });

      await db.update(turmaAlunos).set({ status: "ativa", position: 0, updatedAt: new Date() })
        .where(eq(turmaAlunos.id, input.id));
      return { success: true };
    }),

    /** Matrícula atual (ativa ou em espera) do aluno — usada no cadastro/edição. */
    studentEnrollment: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;

      const [enrollment] = await db.select({
        id: turmaAlunos.id,
        turmaId: turmaAlunos.turmaId,
        status: turmaAlunos.status,
        position: turmaAlunos.position,
        turmaName: turmas.name,
        turmaStatus: turmas.status,
        modalidadeId: turmas.modalidadeId,
        timeStr: turmas.timeStr,
        weekdays: turmas.weekdays,
      })
        .from(turmaAlunos)
        .innerJoin(turmas, eq(turmas.id, turmaAlunos.turmaId))
        .where(and(
          eq(turmaAlunos.studentId, input.studentId),
          eq(turmaAlunos.organizationId, orgId),
          sql`${turmaAlunos.status} <> 'cancelada'`,
        ))
        .orderBy(asc(turmaAlunos.status), asc(turmaAlunos.id))
        .limit(1);

      return enrollment ?? null;
    }),

    /**
     * Define (ou remove) a turma do aluno a partir do cadastro.
     * - turmaId null → remove a matrícula atual (liberando vaga + promovendo a fila);
     * - turmaId igual à atual → no-op idempotente;
     * - turmaId diferente → transfere (libera a antiga e matricula na nova);
     * - turma lotada → entra automaticamente na lista de espera.
     */
    setStudentTurma: protectedProcedure.input(z.object({
      studentId: z.number(),
      turmaId: z.number().nullable(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      const [current] = await db.select({
        id: turmaAlunos.id,
        turmaId: turmaAlunos.turmaId,
        status: turmaAlunos.status,
      }).from(turmaAlunos)
        .where(and(
          eq(turmaAlunos.studentId, input.studentId),
          eq(turmaAlunos.organizationId, orgId),
          sql`${turmaAlunos.status} <> 'cancelada'`,
        ))
        .orderBy(asc(turmaAlunos.status), asc(turmaAlunos.id))
        .limit(1);

      // Remover turma
      if (input.turmaId == null) {
        if (!current) return { success: true, removed: false, waitlisted: false, turmaName: null };
        const promoted = await releaseEnrollmentSlot(db, current, orgId);
        return { success: true, removed: true, waitlisted: false, turmaName: null, promoted };
      }

      const [turma] = await db.select({
        id: turmas.id,
        name: turmas.name,
        capacity: turmas.capacity,
        status: turmas.status,
        modalidadeId: turmas.modalidadeId,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
      }).from(turmas)
        .where(and(eq(turmas.id, input.turmaId), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada nesta escola." });
      if (turma.status === "encerrada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta turma está encerrada e não aceita novas matrículas." });
      }

      // Já está na mesma turma → idempotente
      if (current && current.turmaId === input.turmaId) {
        return { success: true, unchanged: true, waitlisted: current.status === "espera", turmaName: turma.name };
      }

      // Transfere: libera a vaga antiga (e promove a fila dela)
      if (current) {
        await releaseEnrollmentSlot(db, current, orgId);
      }

      // D3: bloqueio de conflito de horário do aluno (após liberar a turma antiga)
      const conflict = await findStudentScheduleConflict(
        db, orgId, input.studentId, (turma.weekdays as number[] | null) ?? [], turma.timeStr, turma.durationMinutes,
      );
      if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: conflict });

      // Capacidade da turma de destino
      const [ocupadas] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.status, "ativa")));
      const temVaga = (Number(ocupadas?.count) || 0) < turma.capacity;

      const [{ maxPosition }] = await db.select({ maxPosition: sql<number>`COALESCE(MAX(${turmaAlunos.position}), 0)` })
        .from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.status, "espera")));

      // Reaproveita linha cancelada da mesma turma (unique turmaId+studentId)
      const [reusable] = await db.select({ id: turmaAlunos.id }).from(turmaAlunos)
        .where(and(eq(turmaAlunos.turmaId, input.turmaId), eq(turmaAlunos.studentId, input.studentId)))
        .limit(1);

      const values = {
        organizationId: orgId,
        turmaId: input.turmaId,
        studentId: input.studentId,
        status: temVaga ? ("ativa" as const) : ("espera" as const),
        position: temVaga ? 0 : (Number(maxPosition) || 0) + 1,
        enrolledAt: new Date(),
        updatedAt: new Date(),
      };

      if (reusable) {
        await db.update(turmaAlunos).set(values).where(eq(turmaAlunos.id, reusable.id));
      } else {
        await db.insert(turmaAlunos).values(values);
      }

      return { success: true, waitlisted: !temVaga, turmaName: turma.name };
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

    // ─── Fluxo de dança: a GRADE vira agenda ────────────────────────────────
    /** Prévia da geração de aulas da grade (não grava nada). */
    previewLessons: protectedProcedure.input(z.object({
      id: z.number(),
      months: z.number().int().min(1).max(12).default(3),
    })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [turma] = await db.select().from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada" });
      const fromISO = todayBR();
      const preview = await previewTurmaLessons(db, turma as any, fromISO, addMonthsISO(fromISO, input.months));
      return {
        fromISO,
        toISO: addMonthsISO(fromISO, input.months),
        toCreate: preview.toCreate,
        existing: preview.existing,
        conflicts: preview.conflicts,
        firstDates: preview.plans.filter((p) => !p.exists).slice(0, 8).map((p) => p.dateISO),
        conflictDates: preview.plans.filter((p) => p.conflict).map((p) => `${p.dateISO} (${p.conflict === "sala" ? "sala" : "professor"})`).slice(0, 10),
      };
    }),

    /** Gera as aulas da turma no período escolhido (sessões mesmo sem alunos). */
    generateLessons: protectedProcedure.input(z.object({
      id: z.number(),
      months: z.number().int().min(1).max(12).default(3),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [turma] = await db.select().from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada" });
      if (turma.status === "encerrada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Turma encerrada não gera aulas." });
      }
      try {
        const fromISO = todayBR();
        const res = await generateTurmaLessons(db, turma as any, fromISO, addMonthsISO(fromISO, input.months));
        return { success: true, ...res };
      } catch (err: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message || "Não foi possível gerar as aulas." });
      }
    }),

    /** Cancela as aulas futuras agendadas da turma (histórico preservado). */
    cancelFutureLessons: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [turma] = await db.select({ id: turmas.id }).from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada" });
      const res = await cancelFutureTurmaLessons(db, orgId, input.id);
      return { success: true, ...res };
    }),

    /** Sessão de HOJE da turma (para abrir a chamada direto do card). */
    todayLesson: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const [turma] = await db.select().from(turmas)
        .where(and(eq(turmas.id, input.id), eq(turmas.organizationId, orgId))).limit(1);
      if (!turma) throw new TRPCError({ code: "NOT_FOUND", message: "Turma não encontrada" });
      const today = todayBR();
      const [lesson] = await db.select({
        id: lessons.id,
        title: lessons.title,
        scheduledAt: lessons.scheduledAt,
        status: lessons.status,
      }).from(lessons).where(and(
        eq(lessons.organizationId, orgId),
        eq(lessons.turmaId, turma.id),
        gte(lessons.scheduledAt, new Date(`${today}T00:00:00.000-03:00`)),
        lte(lessons.scheduledAt, new Date(`${today}T23:59:59.999-03:00`)),
      )).limit(1);
      return { lesson: lesson ?? null };
    }),
  }),
};
