// ─── ⭐ Avaliações de Professores (PRD módulo 2) ─────────────────────────────
// O aluno avalia o próprio professor durante um ciclo (janela de datas).
// LEITURA EXCLUSIVA DO ADMIN — o professor NUNCA tem acesso (RN-001).
// Ranking com corte de amostra: < 3 avaliações = "amostra pequena".
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql, gte, lte, lt } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  professorEvaluationPeriods,
  professorEvaluations,
  students,
  users,
  professores,
  settings,
  notifications,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";

const FREQUENCIES = ["mensal", "bimestral", "trimestral", "semestral"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQ_MONTHS: Record<Frequency, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
};

/** Recusa professor (e outros papéis) — módulo exclusivo do admin (RN-001). */
function assertAdmin(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const isAdmin = ctx.user.role === "admin" || ctx.user.role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
}

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Config de frequência da org (lê qualquer linha de settings da org que tenha valor). */
async function getEvalConfig(db: any, orgId: number): Promise<{ frequency: Frequency; windowDays: number }> {
  const [row] = await db.select({
    frequency: settings.professorEvalFrequency,
    windowDays: settings.professorEvalWindowDays,
  }).from(settings)
    .where(and(eq(settings.organizationId, orgId), sql`${settings.professorEvalFrequency} IS NOT NULL`))
    .limit(1);
  const frequency: Frequency = (FREQUENCIES as readonly string[]).includes(row?.frequency ?? "")
    ? (row!.frequency as Frequency)
    : "trimestral";
  const windowDays = row?.windowDays && row.windowDays >= 3 && row.windowDays <= 30 ? row.windowDays : 7;
  return { frequency, windowDays };
}

/** Abre um novo ciclo para a org (usa config atual). */
async function openNewPeriod(db: any, orgId: number, createdBy: number): Promise<any> {
  const { windowDays } = await getEvalConfig(db, orgId);
  const start = todayISO();
  const endDate = addDaysISO(start, windowDays);
  const [created] = await db.insert(professorEvaluationPeriods).values({
    organizationId: orgId,
    startDate: start,
    endDate,
    status: "aberta",
    createdBy,
    createdAt: new Date(),
  }).returning();
  return created;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export const avaliacoesRouter = router({
  // ═══ ADMIN (gerência) ═══

  /** Config de frequência da org + janela. */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) return { frequency: "trimestral" as Frequency, windowDays: 7, openPeriod: null, lastClosedPeriod: null };
    const orgId = ctx.user.organizationId!;
    const cfg = await getEvalConfig(db, orgId);
    const [open] = await db.select().from(professorEvaluationPeriods)
      .where(and(eq(professorEvaluationPeriods.organizationId, orgId), eq(professorEvaluationPeriods.status, "aberta")))
      .orderBy(desc(professorEvaluationPeriods.startDate)).limit(1);
    const [lastClosed] = await db.select().from(professorEvaluationPeriods)
      .where(and(eq(professorEvaluationPeriods.organizationId, orgId), eq(professorEvaluationPeriods.status, "fechada")))
      .orderBy(desc(professorEvaluationPeriods.endDate)).limit(1);
    return { ...cfg, openPeriod: open ?? null, lastClosedPeriod: lastClosed ?? null };
  }),

  /** Admin define de quanto em quanto tempo o ciclo abre (RF-001). */
  configure: protectedProcedure
    .input(z.object({
      frequency: z.enum(FREQUENCIES),
      windowDays: z.number().int().min(3).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;
      const userId = ctx.user.id;
      // settings é por usuário (userId UNIQUE) — garantir linha antes do update
      // (admin que nunca abriu Configurações não tem linha → UPDATE afetaria 0 linhas)
      const { getSettingsByUserId } = await import("../db");
      await getSettingsByUserId(orgId, userId);
      await db.update(settings)
        .set({ professorEvalFrequency: input.frequency, professorEvalWindowDays: input.windowDays, updatedAt: new Date() })
        .where(eq(settings.userId, userId));
      return { success: true };
    }),

  /** Admin abre um ciclo manualmente (RN-003: único aberto por escola). */
  openPeriod: protectedProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const [open] = await db.select({ id: professorEvaluationPeriods.id }).from(professorEvaluationPeriods)
      .where(and(eq(professorEvaluationPeriods.organizationId, orgId), eq(professorEvaluationPeriods.status, "aberta"))).limit(1);
    if (open) throw new TRPCError({ code: "CONFLICT", message: "Já existe um ciclo aberto." });
    const created = await openNewPeriod(db, orgId, ctx.user.id);
    await notifyEligibleStudents(db, orgId, created);
    return { success: true, period: created };
  }),

  /** Admin fecha o ciclo antecipadamente (quem não avaliou perde a chance). */
  closePeriod: protectedProcedure.input(z.object({ periodId: z.number() })).mutation(async ({ ctx, input }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    await db.update(professorEvaluationPeriods)
      .set({ status: "fechada" })
      .where(and(eq(professorEvaluationPeriods.id, input.periodId), eq(professorEvaluationPeriods.organizationId, ctx.user.organizationId!)));
    return { success: true };
  }),

  /** Relatório de gestão (RF-004) — avaliações com filtros + KPIs. */
  report: protectedProcedure.input(z.object({ periodId: z.number().optional() })).query(async ({ ctx, input }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) return { evaluations: [], kpis: { total: 0, avgGeral: 0, participantes: 0, elegiveis: 0 }, periods: [] };
    const orgId = ctx.user.organizationId!;

    const periods = await db.select().from(professorEvaluationPeriods)
      .where(eq(professorEvaluationPeriods.organizationId, orgId))
      .orderBy(desc(professorEvaluationPeriods.startDate)).limit(24);

    const evalWhere = input.periodId
      ? and(eq(professorEvaluations.organizationId, orgId), eq(professorEvaluations.periodId, input.periodId))
      : eq(professorEvaluations.organizationId, orgId);

    const rows = await db.select({
      id: professorEvaluations.id,
      periodId: professorEvaluations.periodId,
      periodStart: professorEvaluationPeriods.startDate,
      periodEnd: professorEvaluationPeriods.endDate,
      studentName: students.name,
      professorName: users.name,
      nota: professorEvaluations.nota,
      comentario: professorEvaluations.comentario,
      createdAt: professorEvaluations.createdAt,
    }).from(professorEvaluations)
      .leftJoin(professorEvaluationPeriods, eq(professorEvaluationPeriods.id, professorEvaluations.periodId))
      .leftJoin(students, eq(students.id, professorEvaluations.studentId))
      .leftJoin(users, eq(users.id, professorEvaluations.professorId))
      .where(evalWhere)
      .orderBy(desc(professorEvaluations.createdAt))
      .limit(500);

    const total = rows.length;
    const avgGeral = total > 0 ? rows.reduce((acc: number, r: any) => acc + r.nota, 0) / total : 0;
    const participantes = new Set(rows.map((r: any) => r.periodId + "-" + r.studentId)).size;

    // Elegíveis: alunos ativos com professor vinculado e conta no portal
    const [elig] = await db.select({ c: sql<number>`CAST(count(*) AS INT)` })
      .from(students)
      .where(and(
        eq(students.organizationId, orgId),
        eq(students.status, "ativo"),
        sql`${students.professorId} IS NOT NULL`,
        sql`${students.studentUserId} IS NOT NULL`,
      ));
    const elegiveis = Number(elig?.c ?? 0);

    return {
      evaluations: rows,
      periods,
      kpis: { total, avgGeral: Math.round(avgGeral * 10) / 10, participantes, elegiveis },
    };
  }),

  /** Ranking dos professores (RF-005): média por professor no ciclo (ou todos). */
  ranking: protectedProcedure.input(z.object({ periodId: z.number().nullable().optional() })).query(async ({ ctx, input }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;

    const rankWhere = input.periodId
      ? and(eq(professorEvaluations.organizationId, orgId), eq(professorEvaluations.periodId, input.periodId))
      : eq(professorEvaluations.organizationId, orgId);

    const rows = await db.select({
      professorId: professorEvaluations.professorId,
      name: users.name,
      avg: sql<number>`CAST(ROUND(AVG(${professorEvaluations.nota})::numeric, 1) AS FLOAT)`,
      count: sql<number>`CAST(count(*) AS INT)`,
    }).from(professorEvaluations)
      .leftJoin(users, eq(users.id, professorEvaluations.professorId))
      .where(rankWhere)
      .groupBy(professorEvaluations.professorId, users.name)
      .orderBy(desc(sql`AVG(${professorEvaluations.nota})`));

    return rows.map((r: any) => ({
      professorId: r.professorId,
      name: r.name ?? "Professor",
      avg: Math.round((Number(r.avg) || 0) * 10) / 10,
      count: Number(r.count) || 0,
      smallSample: (Number(r.count) || 0) < 3,
    }));
  }),

  /** Admin exclui avaliação (comentário ofensivo etc). */
  deleteEvaluation: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    await db.delete(professorEvaluations)
      .where(and(eq(professorEvaluations.id, input.id), eq(professorEvaluations.organizationId, ctx.user.organizationId!)));
    return { success: true };
  }),

  // ═══ ALUNO ═══

  /** Estado do ciclo para o aluno: pode avaliar? já avaliou? professor atual? */
  currentPeriod: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { open: false, alreadyRated: false, professorName: null, periodEnd: null, myEvaluations: [] };
    const orgId = ctx.user.organizationId!;
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then((r: any) => r[0]?.id));
    if (!studentId) return { open: false, alreadyRated: false, professorName: null, periodEnd: null, myEvaluations: [] };

    const today = todayISO();
    const [openPeriod] = await db.select().from(professorEvaluationPeriods)
      .where(and(
        eq(professorEvaluationPeriods.organizationId, orgId),
        eq(professorEvaluationPeriods.status, "aberta"),
        lte(professorEvaluationPeriods.startDate, today),
        gte(professorEvaluationPeriods.endDate, today),
      )).limit(1);

    const [student] = await db.select({
      professorId: students.professorId,
      professorName: users.name,
    }).from(students)
      .leftJoin(professores, eq(professores.userId, students.professorId))
      .leftJoin(users, eq(users.id, professores.userId))
      .where(and(eq(students.id, studentId), eq(students.organizationId, orgId))).limit(1);

    const my = await db.select({
      id: professorEvaluations.id,
      nota: professorEvaluations.nota,
      comentario: professorEvaluations.comentario,
      periodId: professorEvaluations.periodId,
      createdAt: professorEvaluations.createdAt,
    }).from(professorEvaluations)
      .where(and(eq(professorEvaluations.studentId, studentId), eq(professorEvaluations.organizationId, orgId)))
      .orderBy(desc(professorEvaluations.createdAt)).limit(12);

    const alreadyRated = openPeriod ? my.some((e: any) => e.periodId === openPeriod.id) : false;

    return {
      open: !!openPeriod && !!student?.professorId,
      alreadyRated,
      professorName: student?.professorName ?? null,
      periodEnd: openPeriod?.endDate ?? null,
      myEvaluations: my,
    };
  }),

  /** Aluno envia a avaliação (nota 1–5 + comentário opcional). */
  submit: studentProcedure.input(z.object({
    nota: z.number().int().min(1).max(5),
    comentario: z.string().max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then((r: any) => r[0]?.id));
    if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil de aluno incompleto." });

    const today = todayISO();
    const [openPeriod] = await db.select().from(professorEvaluationPeriods)
      .where(and(
        eq(professorEvaluationPeriods.organizationId, orgId),
        eq(professorEvaluationPeriods.status, "aberta"),
        lte(professorEvaluationPeriods.startDate, today),
        gte(professorEvaluationPeriods.endDate, today),
      )).limit(1);
    if (!openPeriod) throw new TRPCError({ code: "BAD_REQUEST", message: "O ciclo de avaliações está encerrado." });

    const [student] = await db.select({ professorId: students.professorId }).from(students)
      .where(and(eq(students.id, studentId), eq(students.organizationId, orgId))).limit(1);
    if (!student?.professorId) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não tem um professor vinculado para avaliar." });

    const [existing] = await db.select({ id: professorEvaluations.id }).from(professorEvaluations)
      .where(and(eq(professorEvaluations.periodId, openPeriod.id), eq(professorEvaluations.studentId, studentId))).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Você já avaliou neste ciclo." });

    await db.insert(professorEvaluations).values({
      organizationId: orgId,
      periodId: openPeriod.id,
      studentId,
      professorId: student.professorId,
      nota: input.nota,
      comentario: input.comentario?.trim() || null,
      createdAt: new Date(),
    });

    return { success: true };
  }),
});

/** Notifica alunos elegíveis (professor vinculado + conta no portal) que o ciclo abriu. */
async function notifyEligibleStudents(db: any, orgId: number, periodId: number): Promise<number> {
  try {
    const rows = await db.select({ studentUserId: students.studentUserId })
      .from(students)
      .where(and(
        eq(students.organizationId, orgId),
        eq(students.status, "ativo"),
        sql`${students.professorId} IS NOT NULL`,
        sql`${students.studentUserId} IS NOT NULL`,
      ));
    let sent = 0;
    for (const r of rows) {
      if (!r.studentUserId) continue;
      await db.insert(notifications).values({
        organizationId: orgId,
        userId: r.studentUserId,
        title: "⭐ Avalie seu professor",
        message: "O ciclo de avaliações está aberto! Dê uma nota ao seu professor e deixe seu feedback.",
        type: "info",
        actionUrl: "/aluno",
      });
      sent++;
    }
    void periodId;
    return sent;
  } catch {
    return 0; // notificação é best-effort
  }
}

/** Abre automaticamente um novo ciclo quando venceu o intervalo configurado. */
export async function processEvaluationCycleOpenings(db: any): Promise<void> {
  try {
    // 1. Fecha automaticamente ciclos cuja janela já venceu (senão ficariam
    //    "abertos" para sempre e bloqueariam a abertura do próximo ciclo)
    const today = todayISO();
    await db.update(professorEvaluationPeriods)
      .set({ status: "fechada" })
      .where(and(
        eq(professorEvaluationPeriods.status, "aberta"),
        lt(professorEvaluationPeriods.endDate, today),
      ));

    const orgs = await db.selectDistinct({ organizationId: settings.organizationId })
      .from(settings)
      .where(sql`${settings.professorEvalFrequency} IS NOT NULL AND ${settings.organizationId} IS NOT NULL`);
    for (const { organizationId } of orgs) {
      const orgId = Number(organizationId);
      if (!orgId) continue;
      const [open] = await db.select({ id: professorEvaluationPeriods.id }).from(professorEvaluationPeriods)
        .where(and(eq(professorEvaluationPeriods.organizationId, orgId), eq(professorEvaluationPeriods.status, "aberta"))).limit(1);
      if (open) continue;

      // Último ciclo (qualquer status) — respeita o intervalo da frequência
      const [last] = await db.select().from(professorEvaluationPeriods)
        .where(eq(professorEvaluationPeriods.organizationId, orgId))
        .orderBy(desc(professorEvaluationPeriods.startDate)).limit(1);

      const { frequency } = await getEvalConfig(db, orgId);
      const intervalMonths = FREQ_MONTHS[frequency] ?? 3;
      const due = last
        ? addMonthsISO(String(last.startDate).slice(0, 10), intervalMonths)
        : todayISO();
      if (due > todayISO()) continue; // ainda não venceu o intervalo

      const created = await openNewPeriod(db, orgId, 0);
      await notifyEligibleStudents(db, orgId, created.id);
    }
  } catch (err) {
    console.error("[Automation] Erro ao abrir ciclos de avaliação de professores:", err);
  }
}
