// ─── Matrículas adicionais do aluno (DancePro) ───────────────────────────────
// Epic 2: permite ao aluno ter mais de um plano ao mesmo tempo (ex.: Ballet 2x +
// Jazz 1x + Aula Particular), cada matrícula com modalidade, plano, professor,
// horário, tipo de aula e valor mensal próprio. A mensalidade total cobrada é a
// soma (o valor base do aluno continua em students.monthlyFee, calculado no
// cadastro), e cada matrícula fica registrada aqui para detalhamento/relatórios.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { instruments, schoolPlans, studentEnrollments, students, studioRooms, turmaAlunos, turmas, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === "admin" || role === "professor" || role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

/** Converte "HH:MM" em minutos desde 00:00 (null se inválido/ausente). */
function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const enrollmentInput = z.object({
  id: z.number().optional(),
  instrumentId: z.number().nullable().optional(),
  planId: z.number().nullable().optional(),
  teacherUserId: z.number().nullable().optional(),
  studioRoomId: z.number().nullable().optional(),
  lessonType: z.enum(["turma", "individual", "online"]).default("turma"),
  shift: z.string().max(40).nullable().optional(),
  durationMonths: z.number().int().min(1).max(60).default(12),
  lessonsPerWeek: z.number().int().min(1).max(7).default(1),
  weekday: z.number().int().min(0).max(6).default(1),
  timeStr: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido (use HH:MM)").nullable().optional(),
  monthlyFee: z.number().min(0).max(100000).default(0),
  enrollmentFee: z.number().min(0).max(100000).default(0),
  startDate: z.string().nullable().optional(),
});

export const matriculasRouters = {
  matriculas: router({
    /** Matrículas adicionais (ativas e encerradas) de um aluno. */
    listByStudent: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      const rows = await db.select({
        id: studentEnrollments.id,
        instrumentId: studentEnrollments.instrumentId,
        instrumentName: instruments.name,
        planId: studentEnrollments.planId,
        planName: schoolPlans.nome,
        teacherUserId: studentEnrollments.teacherUserId,
        teacherName: users.name,
        studioRoomId: studentEnrollments.studioRoomId,
        roomName: studioRooms.name,
        lessonType: studentEnrollments.lessonType,
        shift: studentEnrollments.shift,
        durationMonths: studentEnrollments.durationMonths,
        lessonsPerWeek: studentEnrollments.lessonsPerWeek,
        weekday: studentEnrollments.weekday,
        timeStr: studentEnrollments.timeStr,
        monthlyFee: studentEnrollments.monthlyFee,
        enrollmentFee: studentEnrollments.enrollmentFee,
        startDate: studentEnrollments.startDate,
        status: studentEnrollments.status,
      })
        .from(studentEnrollments)
        .leftJoin(instruments, eq(instruments.id, studentEnrollments.instrumentId))
        .leftJoin(schoolPlans, eq(schoolPlans.id, studentEnrollments.planId))
        .leftJoin(users, eq(users.id, studentEnrollments.teacherUserId))
        .leftJoin(studioRooms, eq(studioRooms.id, studentEnrollments.studioRoomId))
        .where(and(
          eq(studentEnrollments.organizationId, orgId),
          eq(studentEnrollments.studentId, input.studentId),
        ))
        .orderBy(asc(studentEnrollments.status), asc(studentEnrollments.id));

      return rows.map((row) => ({ ...row, monthlyFee: Number(row.monthlyFee) || 0, enrollmentFee: Number(row.enrollmentFee) || 0 }));
    }),

    /**
     * Substitui o conjunto de matrículas adicionais do aluno (idempotente):
     * - valida aluno/plano/professor/sala/modalidade na organização;
     * - bloqueia conflito de horário entre as próprias matrículas e turmas ativas;
     * - atualiza existentes, insere novas e encerra as ausentes do payload;
     * - devolve o total mensal adicional para o cadastro somar na mensalidade.
     */
    setStudentEnrollments: protectedProcedure.input(z.object({
      studentId: z.number(),
      enrollments: z.array(enrollmentInput).max(10),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      // ── Validação de vínculos (todos da mesma organização) ──
      const instrumentIds = input.enrollments.map((e) => e.instrumentId).filter((id): id is number => id != null);
      const planIds = input.enrollments.map((e) => e.planId).filter((id): id is number => id != null);
      const teacherIds = input.enrollments.map((e) => e.teacherUserId).filter((id): id is number => id != null);
      const roomIds = input.enrollments.map((e) => e.studioRoomId).filter((id): id is number => id != null);

      if (instrumentIds.length > 0) {
        const found = await db.select({ id: instruments.id }).from(instruments)
          .where(and(eq(instruments.organizationId, orgId), inArray(instruments.id, instrumentIds)));
        if (found.length !== new Set(instrumentIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uma das modalidades selecionadas não existe nesta escola." });
        }
      }
      if (planIds.length > 0) {
        const found = await db.select({ id: schoolPlans.id }).from(schoolPlans)
          .where(and(eq(schoolPlans.organizationId, orgId), inArray(schoolPlans.id, planIds)));
        if (found.length !== new Set(planIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Um dos planos selecionados não existe nesta escola." });
        }
      }
      if (teacherIds.length > 0) {
        const found = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.organizationId, orgId), inArray(users.id, teacherIds)));
        if (found.length !== new Set(teacherIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Um dos professores selecionados não pertence a esta escola." });
        }
      }
      if (roomIds.length > 0) {
        const found = await db.select({ id: studioRooms.id }).from(studioRooms)
          .where(and(eq(studioRooms.organizationId, orgId), inArray(studioRooms.id, roomIds)));
        if (found.length !== new Set(roomIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uma das salas selecionadas não pertence a esta escola." });
        }
      }

      // ── Conflito entre as próprias matrículas (mesmo dia + horário sobreposto) ──
      for (let i = 0; i < input.enrollments.length; i++) {
        const a = input.enrollments[i];
        const aStart = timeToMinutes(a.timeStr);
        if (aStart == null) continue;
        for (let j = i + 1; j < input.enrollments.length; j++) {
          const b = input.enrollments[j];
          const bStart = timeToMinutes(b.timeStr);
          if (bStart == null) continue;
          if (a.weekday === b.weekday && aStart < bStart + 60 && bStart < aStart + 60) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Duas matrículas adicionais ficaram no mesmo dia/horário. Ajuste os horários.",
            });
          }
        }
      }

      // ── Conflito com turmas ativas do aluno ──
      const studentTurmas = await db.select({
        turmaName: turmas.name,
        weekdays: turmas.weekdays,
        timeStr: turmas.timeStr,
        durationMinutes: turmas.durationMinutes,
      }).from(turmaAlunos)
        .innerJoin(turmas, eq(turmas.id, turmaAlunos.turmaId))
        .where(and(
          eq(turmaAlunos.studentId, input.studentId),
          eq(turmaAlunos.organizationId, orgId),
          eq(turmaAlunos.status, "ativa"),
          eq(turmas.status, "ativa"),
        ));

      for (const enrollment of input.enrollments) {
        const start = timeToMinutes(enrollment.timeStr);
        if (start == null) continue;
        const end = start + 60;
        for (const turma of studentTurmas as any[]) {
          const turmaStart = timeToMinutes(turma.timeStr);
          if (turmaStart == null) continue;
          const turmaEnd = turmaStart + (Number(turma.durationMinutes) || 60);
          const sameDay = ((turma.weekdays as number[] | null) ?? []).includes(enrollment.weekday);
          if (sameDay && start < turmaEnd && turmaStart < end) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Conflito de horário: o aluno já está na turma "${turma.turmaName}" nesse mesmo dia/horário.`,
            });
          }
        }
      }

      // ── Persistência (update / insert / encerrar ausentes) ──
      const existing = await db.select({ id: studentEnrollments.id }).from(studentEnrollments)
        .where(and(
          eq(studentEnrollments.organizationId, orgId),
          eq(studentEnrollments.studentId, input.studentId),
          eq(studentEnrollments.status, "ativo"),
        ));
      const existingIds = new Set(existing.map((row: any) => Number(row.id)));
      const incomingIds = new Set(input.enrollments.map((e) => e.id).filter((id): id is number => id != null));
      const toClose = Array.from(existingIds).filter((id) => !incomingIds.has(id));

      if (toClose.length > 0) {
        await db.update(studentEnrollments).set({ status: "encerrado", updatedAt: new Date() })
          .where(and(eq(studentEnrollments.organizationId, orgId), inArray(studentEnrollments.id, toClose)));
      }

      for (const enrollment of input.enrollments) {
        const values = {
          organizationId: orgId,
          studentId: input.studentId,
          instrumentId: enrollment.instrumentId ?? null,
          planId: enrollment.planId ?? null,
          teacherUserId: enrollment.teacherUserId ?? null,
          studioRoomId: enrollment.studioRoomId ?? null,
          lessonType: enrollment.lessonType,
          shift: enrollment.shift?.trim() || null,
          durationMonths: enrollment.durationMonths,
          lessonsPerWeek: enrollment.lessonsPerWeek,
          weekday: enrollment.weekday,
          timeStr: enrollment.timeStr ?? null,
          monthlyFee: enrollment.monthlyFee.toFixed(2),
          enrollmentFee: enrollment.enrollmentFee.toFixed(2),
          startDate: enrollment.startDate ?? null,
          status: "ativo" as const,
          updatedAt: new Date(),
        };
        if (enrollment.id && existingIds.has(enrollment.id)) {
          await db.update(studentEnrollments).set(values)
            .where(and(eq(studentEnrollments.id, enrollment.id), eq(studentEnrollments.organizationId, orgId)));
        } else {
          await db.insert(studentEnrollments).values(values);
        }
      }

      const additionalTotal = input.enrollments.reduce((sum, enrollment) => sum + (Number(enrollment.monthlyFee) || 0), 0);
      return { success: true, additionalTotal, count: input.enrollments.length };
    }),
  }),
};
