// ─── Reposições de Aulas (PRD 01) ────────────────────────────────────────────
// Fluxo: aula elegível → status 'a_repor' + crédito (lesson_repositions, unique
// por lessonId = nunca crédito duplicado) → liberação (imediata ou fim do
// contrato) → agendamento (cria nova lesson) → realização (consome crédito).
// Expiração e liberação por fim de contrato são avaliadas de forma LAZY no
// list/stats (sweep), sem depender de cron.

import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { adminProcedure, protectedProcedure, studentProcedure, router } from "../_core/trpc";
import {
  lessonRepositions,
  repositionEvents,
  repositionPolicies,
  repositionReasons,
  lessons,
  students,
  reminders,
  notifications,
  contracts,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { handleDbError } from "../utils/error_handler";
import {
  DEFAULT_REPOSITION_POLICY,
  canScheduleCredit,
  computeExpirationDate,
  normalizePolicy,
  resolveInitialCreditStatus,
  type RepositionPolicyConfig,
} from "../services/RepositionService";

const REPOSITION_STATUS_VALUES = [
  "aguardando_liberacao",
  "disponivel",
  "agendada",
  "realizada",
  "expirada",
  "cancelada",
] as const;

type RepositionRow = typeof lessonRepositions.$inferSelect;

function isUserAdmin(ctx: { role: string; openId?: string | null }): boolean {
  return ctx.role === "admin" || ctx.openId === ENV.ownerOpenId;
}

/** Notificações in-app + push — best-effort (falha nunca derruba a operação). */
async function notifyParticipants(params: {
  organizationId: number;
  studentUserId: number | null;
  professorUserId: number | null;
  title: string;
  content: string;
  type: string;
  actionUrl?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const targets = [params.studentUserId, params.professorUserId].filter(
      (id): id is number => typeof id === "number" && id > 0
    );
    if (targets.length === 0) return;
    await db.insert(notifications).values(
      targets.map((userId) => ({
        organizationId: params.organizationId,
        userId,
        title: params.title,
        message: params.content,
        type: params.type,
        actionUrl: params.actionUrl ?? "/reposicoes",
      }))
    );
    const { notifyUser } = await import("../_core/notification");
    await Promise.all(
      targets.map((userId) =>
        notifyUser(userId, { title: params.title, content: params.content, url: params.actionUrl }).catch(() => {})
      )
    );
  } catch (e) {
    console.error("[Repositions] Falha não impeditiva ao notificar participantes:", e);
  }
}

async function logRepositionEvent(
  db: any,
  params: {
    organizationId: number;
    repositionId: number | null;
    type: string;
    message: string;
    userId: number;
  }
): Promise<void> {
  await db.insert(repositionEvents).values({
    organizationId: params.organizationId,
    repositionId: params.repositionId,
    type: params.type,
    message: params.message,
    userId: params.userId,
  });
}

const DEFAULT_REASON_SEED: Array<{ name: string; generatesCredit: boolean }> = [
  { name: "Professor faltou", generatesCredit: true },
  { name: "Aluno justificou ausência", generatesCredit: true },
  { name: "Problema de saúde", generatesCredit: true },
  { name: "Feriado", generatesCredit: true },
  { name: "Problema técnico", generatesCredit: true },
  { name: "Cancelamento pela escola", generatesCredit: true },
  { name: "Viagem do professor", generatesCredit: true },
  { name: "Evento da escola", generatesCredit: true },
  { name: "Falta não justificada", generatesCredit: false },
  { name: "Outro", generatesCredit: true },
];

async function getPolicyForOrg(db: any, orgId: number): Promise<RepositionPolicyConfig> {
  const [policy] = await db
    .select()
    .from(repositionPolicies)
    .where(eq(repositionPolicies.organizationId, orgId))
    .limit(1);
  return normalizePolicy(policy ?? DEFAULT_REPOSITION_POLICY);
}

/**
 * Sweep lazy: expira créditos vencidos e libera créditos cujo contrato encerrou.
 * Roda antes de leituras (list/stats/pendingCount) para garantir status coerentes.
 */
async function sweepRepositions(db: any, orgId: number): Promise<void> {
  const now = new Date();
  try {
    const pending = await db
      .select({
        id: lessonRepositions.id,
        status: lessonRepositions.status,
        expiresAt: lessonRepositions.expiresAt,
        studentId: lessonRepositions.studentId,
      })
      .from(lessonRepositions)
      .where(and(eq(lessonRepositions.organizationId, orgId), inArray(lessonRepositions.status, ["disponivel", "aguardando_liberacao"])));

    // 1) Expiração de créditos vencidos
    const expired = pending.filter(
      (r: any) => r.status === "disponivel" && r.expiresAt && new Date(r.expiresAt).getTime() < now.getTime()
    );
    for (const r of expired) {
      await db
        .update(lessonRepositions)
        .set({ status: "expirada", updatedAt: now })
        .where(and(eq(lessonRepositions.id, r.id), eq(lessonRepositions.organizationId, orgId)));
      await logRepositionEvent(db, {
        organizationId: orgId,
        repositionId: r.id,
        type: "expirado",
        message: "Crédito de reposição expirou (prazo configurado atingido).",
        userId: 0,
      });
    }

    // 2) Liberação por encerramento de contrato (política fim_contrato)
    const waiting = pending.filter((r: any) => r.status === "aguardando_liberacao");
    if (waiting.length === 0) return;
    const studentIds: number[] = Array.from(new Set<number>(waiting.map((r: any) => r.studentId as number)));
    const endedContracts = await db
      .select({ studentId: contracts.studentId, endDate: contracts.endDate })
      .from(contracts)
      .where(
        and(
          eq(contracts.organizationId, orgId),
          inArray(contracts.studentId, studentIds),
          eq(contracts.status, "assinado")
        )
      );
    const contractEndByStudent = new Map<number, Date>();
    for (const c of endedContracts) {
      if (!c.endDate) continue;
      const end = new Date(c.endDate);
      const prev = contractEndByStudent.get(c.studentId);
      if (!prev || end > prev) contractEndByStudent.set(c.studentId, end);
    }
    if (contractEndByStudent.size === 0) return;
    const policy = await getPolicyForOrg(db, orgId);
    // FIX (Caça-Bug): busca os usuários dos alunos para a notificação de liberação
    const releaseStudentIds: number[] = Array.from(new Set<number>(waiting.map((r: any) => r.studentId as number)));
    const studentUserRows = await db
      .select({ id: students.id, studentUserId: students.studentUserId })
      .from(students)
      .where(and(eq(students.organizationId, orgId), inArray(students.id, releaseStudentIds)));
    const studentUserByStudent = new Map<number, number | null>(
      studentUserRows.map((s: any) => [s.id, s.studentUserId ?? null])
    );
    for (const r of waiting) {
      const endDate = contractEndByStudent.get(r.studentId);
      if (!endDate || endDate.getTime() > now.getTime()) continue;
      const releasedAt = now;
      await db
        .update(lessonRepositions)
        .set({
          status: "disponivel",
          releasedAt,
          expiresAt: computeExpirationDate(releasedAt, policy),
          updatedAt: releasedAt,
        })
        .where(and(eq(lessonRepositions.id, r.id), eq(lessonRepositions.organizationId, orgId)));
      await logRepositionEvent(db, {
        organizationId: orgId,
        repositionId: r.id,
        type: "liberado",
        message: "Crédito liberado automaticamente: contrato do aluno encerrado.",
        userId: 0,
      });
      await notifyParticipants({
        organizationId: orgId,
        studentUserId: studentUserByStudent.get(r.studentId) ?? null,
        professorUserId: null,
        title: "🔓 Crédito de reposição liberado",
        content: "O contrato foi encerrado e o crédito de reposição está disponível para agendamento.",
        type: "success",
      });
    }
  } catch (e) {
    console.error("[Repositions] Sweep falhou (não impeditivo):", e);
  }
}

export const repositionsRouters = {
  repositions: router({
    // ── POLÍTICAS ────────────────────────────────────────────────────────────
    getPolicies: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const [policy] = await db
        .select()
        .from(repositionPolicies)
        .where(eq(repositionPolicies.organizationId, orgId))
        .limit(1);
      return { policy: normalizePolicy(policy ?? DEFAULT_REPOSITION_POLICY), configured: !!policy };
    }),

    updatePolicies: adminProcedure
      .input(
        z.object({
          expirationDays: z.number().int().min(1).max(3650),
          expirationUnit: z.enum(["dias", "semanas", "meses"]),
          creditRelease: z.enum(["imediata", "fim_contrato"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [existing] = await db
            .select({ id: repositionPolicies.id })
            .from(repositionPolicies)
            .where(eq(repositionPolicies.organizationId, orgId))
            .limit(1);
          if (existing) {
            await db
              .update(repositionPolicies)
              .set({ ...input, updatedAt: new Date() })
              .where(eq(repositionPolicies.id, existing.id));
          } else {
            await db.insert(repositionPolicies).values({ organizationId: orgId, ...input });
          }
          await logRepositionEvent(db, {
            organizationId: orgId,
            repositionId: null,
            type: "politica_alterada",
            message: `Política atualizada: prazo ${input.expirationDays} ${input.expirationUnit}, liberação ${input.creditRelease}.`,
            userId: ctx.user.id,
          });
          return { success: true };
        } catch (error) {
          return handleDbError(error, "salvar a política de reposição");
        }
      }),

    // ── MOTIVOS ──────────────────────────────────────────────────────────────
    listReasons: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const rows = await db
        .select()
        .from(repositionReasons)
        .where(eq(repositionReasons.organizationId, orgId))
        .orderBy(repositionReasons.name);
      if (rows.length === 0) {
        // Semeia motivos padrão na primeira visita da escola (seguindo o padrão do getKnowledgeBase)
        await db
          .insert(repositionReasons)
          .values(DEFAULT_REASON_SEED.map((r) => ({ organizationId: orgId, ...r })));
        const seeded = await db
          .select()
          .from(repositionReasons)
          .where(eq(repositionReasons.organizationId, orgId))
          .orderBy(repositionReasons.name);
        return seeded;
      }
      return rows;
    }),

    createReason: adminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          description: z.string().max(500).optional(),
          generatesCredit: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [created] = await db
            .insert(repositionReasons)
            .values({
              organizationId: orgId,
              name: input.name.trim(),
              description: input.description?.trim() || null,
              generatesCredit: input.generatesCredit,
            })
            .returning({ id: repositionReasons.id });
          await logRepositionEvent(db, {
            organizationId: orgId,
            repositionId: null,
            type: "motivo_criado",
            message: `Motivo "${input.name}" criado (gera crédito: ${input.generatesCredit ? "sim" : "não"}).`,
            userId: ctx.user.id,
          });
          return { success: true, id: created.id };
        } catch (error) {
          return handleDbError(error, "criar o motivo de reposição");
        }
      }),

    updateReason: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(500).optional(),
          active: z.boolean().optional(),
          generatesCredit: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const { id, ...data } = input;
          const updateData: Record<string, unknown> = { updatedAt: new Date() };
          if (data.name !== undefined) updateData.name = data.name.trim();
          if (data.description !== undefined) updateData.description = data.description.trim() || null;
          if (data.active !== undefined) updateData.active = data.active;
          if (data.generatesCredit !== undefined) updateData.generatesCredit = data.generatesCredit;
          const result = await db
            .update(repositionReasons)
            .set(updateData)
            .where(and(eq(repositionReasons.id, id), eq(repositionReasons.organizationId, orgId)));
          if (((result as any)?.count ?? 1) === 0) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Motivo não encontrado." });
          }
          return { success: true };
        } catch (error) {
          return handleDbError(error, "atualizar o motivo de reposição");
        }
      }),

    deleteReason: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [used] = await db
          .select({ id: lessonRepositions.id })
          .from(lessonRepositions)
          .where(and(eq(lessonRepositions.reasonId, input.id), eq(lessonRepositions.organizationId, orgId)))
          .limit(1);
        if (used) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este motivo possui reposições no histórico — desative-o em vez de excluir.",
          });
        }
        await db
          .delete(repositionReasons)
          .where(and(eq(repositionReasons.id, input.id), eq(repositionReasons.organizationId, orgId)));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "excluir o motivo de reposição");
      }
    }),

    // ── CRIAÇÃO DO CRÉDITO ───────────────────────────────────────────────────
    createFromLesson: protectedProcedure
      .input(
        z.object({
          lessonId: z.number(),
          reasonId: z.number(),
          notes: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const isAdmin = isUserAdmin(ctx.user);

          // 1. Aula da própria org + permissão (admin, criador ou professor efetivo)
          const [lesson] = await db
            .select({
              id: lessons.id,
              userId: lessons.userId,
              status: lessons.status,
              scheduledAt: lessons.scheduledAt,
              duration: lessons.duration,
              studentId: lessons.studentId,
              studentName: students.name,
              studentUserId: students.studentUserId,
              studentProfessorId: students.professorId,
              studentInstrumentId: students.instrumentId,
            })
            .from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .where(
              and(
                eq(lessons.id, input.lessonId),
                eq(lessons.organizationId, orgId),
                isAdmin ? undefined : or(eq(lessons.userId, ctx.user.id), eq(students.professorId, ctx.user.id))
              )
            )
            .limit(1);
          if (!lesson) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Aula não encontrada ou você não tem permissão." });
          }
          if (!lesson.studentId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Aulas experimentais não geram reposição." });
          }

          // 2. Uma aula = no máximo um crédito (regra anti-duplicação)
          if (lesson.status === "a_repor") {
            throw new TRPCError({ code: "CONFLICT", message: "Esta aula já está marcada como Aula a Repor." });
          }
          const [existing] = await db
            .select({ id: lessonRepositions.id })
            .from(lessonRepositions)
            .where(eq(lessonRepositions.lessonId, lesson.id))
            .limit(1);
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "Já existe um crédito de reposição para esta aula." });
          }

          // 3. Motivo válido da própria escola
          const [reason] = await db
            .select()
            .from(repositionReasons)
            .where(and(eq(repositionReasons.id, input.reasonId), eq(repositionReasons.organizationId, orgId)))
            .limit(1);
          if (!reason || !reason.active) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Motivo inválido ou inativo." });
          }
          if (!reason.generatesCredit) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Este motivo não gera direito à reposição." });
          }

          // 4. Política vigente → status/datas do crédito
          const policy = await getPolicyForOrg(db, orgId);
          const now = new Date();
          const initial = resolveInitialCreditStatus(policy, now);

          const [created] = await db
            .insert(lessonRepositions)
            .values({
              organizationId: orgId,
              lessonId: lesson.id,
              studentId: lesson.studentId,
              professorId: lesson.studentProfessorId ?? null,
              reasonId: reason.id,
              notes: input.notes?.trim() || null,
              status: initial.status,
              releasedAt: initial.releasedAt,
              expiresAt: initial.expiresAt,
            })
            .returning({ id: lessonRepositions.id });

          // 5. Marca a aula original como "Aula a Repor" e cancela lembretes pendentes
          await db
            .update(lessons)
            .set({ status: "a_repor", updatedAt: now })
            .where(and(eq(lessons.id, lesson.id), eq(lessons.organizationId, orgId)));
          await db
            .update(reminders)
            .set({ status: "cancelado", cancelledAt: now, updatedAt: now })
            .where(and(eq(reminders.lessonId, lesson.id), eq(reminders.status, "pendente")));

          await logRepositionEvent(db, {
            organizationId: orgId,
            repositionId: created.id,
            type: "criado",
            message: `Aula convertida em reposição. Motivo: ${reason.name}. Crédito ${initial.status === "disponivel" ? "liberado imediatamente" : "aguardando liberação (fim do contrato)"}.`,
            userId: ctx.user.id,
          });

          await notifyParticipants({
            organizationId: orgId,
            studentUserId: lesson.studentUserId ?? null,
            professorUserId: null,
            title: "🔁 Aula convertida em reposição",
            content:
              initial.status === "disponivel"
                ? `Sua aula foi registrada como reposição e o crédito já está disponível para agendamento (válido até ${initial.expiresAt?.toLocaleDateString("pt-BR")}).`
                : "Sua aula foi registrada como reposição. O crédito será liberado no encerramento do seu contrato.",
            type: "info",
          });

          return { success: true, repositionId: created.id, status: initial.status };
        } catch (error) {
          return handleDbError(error, "registrar a aula a repor");
        }
      }),

    // ── AGENDAMENTO ──────────────────────────────────────────────────────────
    schedule: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          scheduledAt: z.string().min(1),
          duration: z.number().int().min(15).max(240).optional(),
          studioRoomId: z.number().optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const isAdmin = isUserAdmin(ctx.user);

          const [reposition] = await db
            .select({
              id: lessonRepositions.id,
              status: lessonRepositions.status,
              expiresAt: lessonRepositions.expiresAt,
              lessonId: lessonRepositions.lessonId,
              studentId: lessonRepositions.studentId,
              originalDuration: lessons.duration,
            })
            .from(lessonRepositions)
            .leftJoin(lessons, eq(lessonRepositions.lessonId, lessons.id))
            .where(and(eq(lessonRepositions.id, input.id), eq(lessonRepositions.organizationId, orgId)))
            .limit(1);
          if (!reposition) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Reposição não encontrada." });
          }

          // Professor só agenda reposições dos seus alunos
          if (!isAdmin) {
            const [student] = await db
              .select({ professorId: students.professorId })
              .from(students)
              .where(and(eq(students.id, reposition.studentId), eq(students.organizationId, orgId)))
              .limit(1);
            if (!student || student.professorId !== ctx.user.id) {
              throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
            }
          }

          const gate = canScheduleCredit(reposition);
          if (!gate.ok) {
            const msgs: Record<string, string> = {
              aguardando_liberacao: "🔒 Reposição aguardando liberação — ficará disponível após o encerramento do contrato do aluno.",
              expirado: "Este crédito expirou e não pode mais ser utilizado.",
              status_invalido: "Somente créditos disponíveis podem ser agendados.",
            };
            throw new TRPCError({ code: "BAD_REQUEST", message: msgs[gate.reason || "status_invalido"] });
          }

          const student = (
            await db
              .select({ name: students.name, instrumentId: students.instrumentId, professorId: students.professorId })
              .from(students)
              .where(and(eq(students.id, reposition.studentId), eq(students.organizationId, orgId)))
              .limit(1)
          )[0];
          if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });

          const scheduledAt = new Date(input.scheduledAt);
          if (Number.isNaN(scheduledAt.getTime())) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Data/horário inválidos." });
          }

          // Conflito de horário do professor (aulas agendadas no mesmo dia com overlap)
          const startOfDay = new Date(scheduledAt);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(scheduledAt);
          endOfDay.setHours(23, 59, 59, 999);
          const duration = input.duration ?? reposition.originalDuration ?? 60;
          const endsAt = new Date(scheduledAt.getTime() + duration * 60000);
          const dayLessons = await db
            .select({
              id: lessons.id,
              scheduledAt: lessons.scheduledAt,
              duration: lessons.duration,
              userId: lessons.userId,
              studentProfessorId: students.professorId,
            })
            .from(lessons)
            .leftJoin(students, eq(lessons.studentId, students.id))
            .where(
              and(eq(lessons.organizationId, orgId), eq(lessons.status, "agendada"), gte(lessons.scheduledAt, startOfDay), lte(lessons.scheduledAt, endOfDay))
            );
          const teacherIds = new Set<number>([ctx.user.id, student.professorId].filter(Boolean) as number[]);
          for (const ex of dayLessons) {
            const exStart = new Date(ex.scheduledAt);
            const exEnd = new Date(exStart.getTime() + (ex.duration || 60) * 60000);
            if (exStart < endsAt && exEnd > scheduledAt) {
              const exTeachers = new Set<number>([ex.userId, ex.studentProfessorId].filter(Boolean) as number[]);
              if (Array.from(teacherIds).some((t) => exTeachers.has(t))) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Conflito: já existe uma aula agendada para este professor neste horário.",
                });
              }
            }
          }

          const [newLesson] = await db
            .insert(lessons)
            .values({
              organizationId: orgId,
              userId: ctx.user.id,
              studentId: reposition.studentId,
              title: `Reposição — ${student.name}`,
              scheduledAt,
              duration,
              status: "agendada",
              lessonType: "individual",
              instrumentId: student.instrumentId ?? null,
              studioRoomId: input.studioRoomId ?? null,
              notes: input.notes?.trim() || null,
            })
            .returning({ id: lessons.id });

          await db
            .update(lessonRepositions)
            .set({
              status: "agendada",
              scheduledLessonId: newLesson.id,
              scheduledAt,
              updatedAt: new Date(),
            })
            .where(and(eq(lessonRepositions.id, reposition.id), eq(lessonRepositions.organizationId, orgId)));

          await logRepositionEvent(db, {
            organizationId: orgId,
            repositionId: reposition.id,
            type: "agendado",
            message: `Reposição agendada para ${scheduledAt.toLocaleString("pt-BR")}.`,
            userId: ctx.user.id,
          });

          const [studentUser] = await db
            .select({ studentUserId: students.studentUserId })
            .from(students)
            .where(eq(students.id, reposition.studentId))
            .limit(1);
          await notifyParticipants({
            organizationId: orgId,
            studentUserId: studentUser?.studentUserId ?? null,
            professorUserId: null,
            title: "📅 Reposição agendada",
            content: `Sua reposição foi agendada para ${scheduledAt.toLocaleString("pt-BR")}.`,
            type: "success",
          });

          return { success: true, lessonId: newLesson.id };
        } catch (error) {
          return handleDbError(error, "agendar a reposição");
        }
      }),

    // ── REALIZAÇÃO (consome o crédito) ───────────────────────────────────────
    complete: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const isAdmin = isUserAdmin(ctx.user);
          const now = new Date();

          const [reposition] = await db
            .select({
              id: lessonRepositions.id,
              status: lessonRepositions.status,
              scheduledLessonId: lessonRepositions.scheduledLessonId,
              studentId: lessonRepositions.studentId,
            })
            .from(lessonRepositions)
            .where(and(eq(lessonRepositions.id, input.id), eq(lessonRepositions.organizationId, orgId)))
            .limit(1);
          if (!reposition) throw new TRPCError({ code: "NOT_FOUND", message: "Reposição não encontrada." });
          if (reposition.status !== "agendada") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Somente reposições agendadas podem ser concluídas." });
          }
          if (!isAdmin) {
            const [student] = await db
              .select({ professorId: students.professorId })
              .from(students)
              .where(and(eq(students.id, reposition.studentId), eq(students.organizationId, orgId)))
              .limit(1);
            if (!student || student.professorId !== ctx.user.id) {
              throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
            }
          }

          // Crédito é CONSUMIDO — não volta para disponível
          await db
            .update(lessonRepositions)
            .set({
              status: "realizada",
              completedAt: now,
              completedByUserId: ctx.user.id,
              completionNotes: input.notes?.trim() || null,
              updatedAt: now,
            })
            .where(and(eq(lessonRepositions.id, reposition.id), eq(lessonRepositions.organizationId, orgId)));

          if (reposition.scheduledLessonId) {
            await db
              .update(lessons)
              .set({ status: "concluida", updatedAt: now })
              .where(and(eq(lessons.id, reposition.scheduledLessonId), eq(lessons.organizationId, orgId)));
            await db
              .update(reminders)
              .set({ status: "cancelado", cancelledAt: now, updatedAt: now })
              .where(and(eq(reminders.lessonId, reposition.scheduledLessonId), eq(reminders.status, "pendente")));
          }

          await logRepositionEvent(db, {
            organizationId: orgId,
            repositionId: reposition.id,
            type: "realizado",
            message: `Reposição realizada e crédito consumido. ${input.notes?.trim() || ""}`.trim(),
            userId: ctx.user.id,
          });

          const [studentUser] = await db
            .select({ studentUserId: students.studentUserId })
            .from(students)
            .where(eq(students.id, reposition.studentId))
            .limit(1);
          await notifyParticipants({
            organizationId: orgId,
            studentUserId: studentUser?.studentUserId ?? null,
            professorUserId: null,
            title: "✅ Reposição realizada",
            content: "Sua reposição foi concluída. O crédito foi utilizado.",
            type: "success",
          });

          return { success: true };
        } catch (error) {
          return handleDbError(error, "concluir a reposição");
        }
      }),

    // ── CANCELAMENTO ─────────────────────────────────────────────────────────
    cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const isAdmin = isUserAdmin(ctx.user);
        const now = new Date();

        const [reposition] = await db
          .select({
            id: lessonRepositions.id,
            status: lessonRepositions.status,
            scheduledLessonId: lessonRepositions.scheduledLessonId,
            studentId: lessonRepositions.studentId,
          })
          .from(lessonRepositions)
          .where(and(eq(lessonRepositions.id, input.id), eq(lessonRepositions.organizationId, orgId)))
          .limit(1);
        if (!reposition) throw new TRPCError({ code: "NOT_FOUND", message: "Reposição não encontrada." });
        if (reposition.status === "realizada") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Reposições realizadas não podem ser canceladas." });
        }
        if (!isAdmin) {
          const [student] = await db
            .select({ professorId: students.professorId })
            .from(students)
            .where(and(eq(students.id, reposition.studentId), eq(students.organizationId, orgId)))
            .limit(1);
          if (!student || student.professorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
          }
        }

        // Cancela a reposição e DEVOLVE o crédito como disponível (se ainda dentro da validade)
        const policy = await getPolicyForOrg(db, orgId);
        const wasScheduled = reposition.status === "agendada";
        let newStatus: (typeof REPOSITION_STATUS_VALUES)[number] = "cancelada";
        if (reposition.status === "agendada" || reposition.status === "disponivel") {
          const [row] = await db
            .select({ releasedAt: lessonRepositions.releasedAt, expiresAt: lessonRepositions.expiresAt })
            .from(lessonRepositions)
            .where(eq(lessonRepositions.id, reposition.id))
            .limit(1);
          const expired = row?.expiresAt && new Date(row.expiresAt).getTime() < now.getTime();
          newStatus = expired ? "expirada" : "disponivel";
          if (newStatus === "disponivel" && !row?.expiresAt) {
            // Crédito liberado sem prazo gravado: recalcula a partir de agora
            const expiresAt = computeExpirationDate(row?.releasedAt ? new Date(row.releasedAt) : now, policy);
            await db
              .update(lessonRepositions)
              .set({ expiresAt, updatedAt: now })
              .where(eq(lessonRepositions.id, reposition.id));
          }
        }

        if (wasScheduled && reposition.scheduledLessonId) {
          await db
            .update(lessons)
            .set({ status: "cancelada", updatedAt: now })
            .where(and(eq(lessons.id, reposition.scheduledLessonId), eq(lessons.organizationId, orgId)));
          await db
            .update(reminders)
            .set({ status: "cancelado", cancelledAt: now, updatedAt: now })
            .where(and(eq(reminders.lessonId, reposition.scheduledLessonId), eq(reminders.status, "pendente")));
        }

        await db
          .update(lessonRepositions)
          .set({
            status: newStatus,
            scheduledLessonId: null,
            scheduledAt: null,
            updatedAt: now,
          })
          .where(and(eq(lessonRepositions.id, reposition.id), eq(lessonRepositions.organizationId, orgId)));

        await logRepositionEvent(db, {
          organizationId: orgId,
          repositionId: reposition.id,
          type: "cancelado",
          message:
            newStatus === "disponivel"
              ? "Reposição agendada cancelada — crédito voltou a ficar disponível."
              : "Reposição cancelada.",
          userId: ctx.user.id,
        });

        return { success: true, creditStatus: newStatus };
      } catch (error) {
        return handleDbError(error, "cancelar a reposição");
      }
    }),

    // ── CONSULTAS ────────────────────────────────────────────────────────────
    list: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(REPOSITION_STATUS_VALUES).optional(),
            reasonId: z.number().optional(),
            studentId: z.number().optional(),
            instrumentId: z.number().optional(),
            expiringOnly: z.boolean().optional(),
            waitingReleaseOnly: z.boolean().optional(),
            search: z.string().max(120).optional(),
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          if (ctx.user.role === "aluno") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Alunos devem usar a central do portal." });
          }
          await sweepRepositions(db, orgId);

          const isAdmin = isUserAdmin(ctx.user);
          const filters = [
            eq(lessonRepositions.organizationId, orgId),
            isAdmin ? undefined : eq(students.professorId, ctx.user.id),
            input?.status ? eq(lessonRepositions.status, input.status) : undefined,
            input?.reasonId ? eq(lessonRepositions.reasonId, input.reasonId) : undefined,
            input?.studentId ? eq(lessonRepositions.studentId, input.studentId) : undefined,
            input?.instrumentId ? eq(students.instrumentId, input.instrumentId) : undefined,
          ];

          const rows = await db
            .select({
              id: lessonRepositions.id,
              status: lessonRepositions.status,
              notes: lessonRepositions.notes,
              releasedAt: lessonRepositions.releasedAt,
              expiresAt: lessonRepositions.expiresAt,
              scheduledAt: lessonRepositions.scheduledAt,
              scheduledLessonId: lessonRepositions.scheduledLessonId,
              completedAt: lessonRepositions.completedAt,
              completionNotes: lessonRepositions.completionNotes,
              createdAt: lessonRepositions.createdAt,
              studentId: lessonRepositions.studentId,
              studentName: students.name,
              professorId: students.professorId,
              instrumentId: students.instrumentId,
              instrumentName: sql<string | null>`(select i.name from instruments i where i.id = ${students.instrumentId} limit 1)`.as(
                "instrument_name"
              ),
              reasonId: lessonRepositions.reasonId,
              reasonName: repositionReasons.name,
              originalLessonId: lessonRepositions.lessonId,
              originalLessonAt: lessons.scheduledAt,
            })
            .from(lessonRepositions)
            .leftJoin(students, eq(lessonRepositions.studentId, students.id))
            .leftJoin(repositionReasons, eq(lessonRepositions.reasonId, repositionReasons.id))
            .leftJoin(lessons, eq(lessonRepositions.lessonId, lessons.id))
            .where(and(...filters))
            .orderBy(desc(lessonRepositions.createdAt));

          const now = Date.now();
          const search = input?.search?.trim().toLowerCase();
          let items = rows as any[];
          if (search) items = items.filter((r) => (r.studentName || "").toLowerCase().includes(search));
          if (input?.expiringOnly) {
            items = items.filter(
              (r) => r.status === "disponivel" && r.expiresAt && new Date(r.expiresAt).getTime() - now <= 7 * 24 * 3600 * 1000
            );
          }
          if (input?.waitingReleaseOnly) items = items.filter((r) => r.status === "aguardando_liberacao");
          if (input?.from) {
            const from = new Date(input.from);
            items = items.filter((r) => r.createdAt && new Date(r.createdAt) >= from);
          }
          if (input?.to) {
            const to = new Date(input.to);
            to.setHours(23, 59, 59, 999);
            items = items.filter((r) => r.createdAt && new Date(r.createdAt) <= to);
          }
          return items;
        } catch (error) {
          return handleDbError(error, "carregar as reposições");
        }
      }),

    pendingCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return 0;
      const orgId = ctx.user.organizationId!;
      const isAdmin = isUserAdmin(ctx.user);
      const rows = await db
        .select({ status: lessonRepositions.status })
        .from(lessonRepositions)
        .leftJoin(students, eq(lessonRepositions.studentId, students.id))
        .where(
          and(
            eq(lessonRepositions.organizationId, orgId),
            inArray(lessonRepositions.status, ["aguardando_liberacao", "disponivel"]),
            isAdmin ? undefined : eq(students.professorId, ctx.user.id)
          )
        );
      return rows.length;
    }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        if (ctx.user.role === "aluno") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Alunos devem usar a central do portal." });
        }
        await sweepRepositions(db, orgId);
        const isAdmin = isUserAdmin(ctx.user);
        const rows = await db
          .select({
            status: lessonRepositions.status,
            studentId: lessonRepositions.studentId,
            expiresAt: lessonRepositions.expiresAt,
            releasedAt: lessonRepositions.releasedAt,
            completedAt: lessonRepositions.completedAt,
            createdAt: lessonRepositions.createdAt,
          })
          .from(lessonRepositions)
          .leftJoin(students, eq(lessonRepositions.studentId, students.id))
          .where(
            and(
              eq(lessonRepositions.organizationId, orgId),
              isAdmin ? undefined : eq(students.professorId, ctx.user.id)
            )
          );
        const now = Date.now();
        const sevenDays = 7 * 24 * 3600 * 1000;
        const countBy = (s: string) => rows.filter((r) => r.status === s).length;
        const pendingRows = rows.filter((r) => r.status === "aguardando_liberacao" || r.status === "disponivel");
        return {
          aulasPendentes: pendingRows.length,
          creditosDisponiveis: countBy("disponivel"),
          agendadas: countBy("agendada"),
          realizadas: countBy("realizada"),
          expiradas: countBy("expirada"),
          aguardandoLiberacao: countBy("aguardando_liberacao"),
          alunosPendentes: new Set(pendingRows.map((r) => r.studentId)).size,
          vencendoEm7Dias: rows.filter(
            (r) => r.status === "disponivel" && r.expiresAt && new Date(r.expiresAt).getTime() - now <= sevenDays
          ).length,
          tempoMedioRealizacaoHoras: (() => {
            const done = rows.filter((r) => r.status === "realizada" && r.completedAt);
            if (done.length === 0) return 0;
            const total = done.reduce((acc, r) => acc + (new Date(r.completedAt!).getTime() - new Date(r.createdAt).getTime()), 0);
            return Math.round(total / done.length / 3600000);
          })(),
        };
      } catch (error) {
        return handleDbError(error, "carregar as métricas de reposição");
      }
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const isAdmin = isUserAdmin(ctx.user);
      const [row] = await db
        .select({
          reposition: lessonRepositions,
          studentName: students.name,
          professorId: students.professorId,
          reasonName: repositionReasons.name,
          originalLessonAt: lessons.scheduledAt,
          instrumentName: sql<string | null>`(select i.name from instruments i where i.id = ${students.instrumentId} limit 1)`.as(
            "instrument_name_details"
          ),
        })
        .from(lessonRepositions)
        .leftJoin(students, eq(lessonRepositions.studentId, students.id))
        .leftJoin(repositionReasons, eq(lessonRepositions.reasonId, repositionReasons.id))
        .leftJoin(lessons, eq(lessonRepositions.lessonId, lessons.id))
        .where(and(eq(lessonRepositions.id, input.id), eq(lessonRepositions.organizationId, orgId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Reposição não encontrada." });
      if (!isAdmin && row.professorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
      }
      const events = await db
        .select()
        .from(repositionEvents)
        .where(and(eq(repositionEvents.repositionId, input.id), eq(repositionEvents.organizationId, orgId)))
        .orderBy(desc(repositionEvents.createdAt))
        .limit(50);
      return { ...row, events };
    }),

    // ── PORTAL DO ALUNO ──────────────────────────────────────────────────────
    my: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const studentId = ctx.user.studentId;
      if (!studentId) return [];
      await sweepRepositions(db, orgId);
      const rows = await db
        .select({
          id: lessonRepositions.id,
          status: lessonRepositions.status,
          notes: lessonRepositions.notes,
          releasedAt: lessonRepositions.releasedAt,
          expiresAt: lessonRepositions.expiresAt,
          scheduledAt: lessonRepositions.scheduledAt,
          scheduledLessonId: lessonRepositions.scheduledLessonId,
          completedAt: lessonRepositions.completedAt,
          createdAt: lessonRepositions.createdAt,
          reasonName: repositionReasons.name,
        })
        .from(lessonRepositions)
        .leftJoin(repositionReasons, eq(lessonRepositions.reasonId, repositionReasons.id))
        .where(and(eq(lessonRepositions.organizationId, orgId), eq(lessonRepositions.studentId, studentId)))
        .orderBy(desc(lessonRepositions.createdAt));
      return rows;
    }),
  }),
};
