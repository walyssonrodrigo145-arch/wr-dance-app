import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, gte, ne, inArray, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  rankings,
  rankingParticipants,
  rankingScores,
  studentAchievements,
  students,
  lessons,
} from "../../drizzle/schema";
import type { Ranking } from "../../drizzle/schema";
import { RANKING_DEFAULT_PRIVACY, RANKING_DEFAULT_WEIGHTS } from "../../drizzle/schema";
import type { RankingPrivacySettings } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import {
  computeStandings,
  closeRanking,
  notifyRankingStart,
  resolveParticipants,
} from "../services/RankingEngine";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** §51/§52: alunos só leem. Toda escrita/visualização administrativa exige staff. */
function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === 'admin' || role === 'professor' || role === 'superadmin' || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

function isAdminUser(ctx: any): boolean {
  return ctx.user?.role === 'admin' || ctx.user?.role === 'superadmin' || ctx.user?.openId === ENV.ownerOpenId;
}

async function getRankingForStaff(db: any, ctx: any, rankingId: number): Promise<Ranking> {
  const orgId = ctx.user.organizationId!;
  const [ranking] = await db.select().from(rankings)
    .where(and(eq(rankings.id, rankingId), eq(rankings.organizationId, orgId)))
    .limit(1);
  if (!ranking) throw new TRPCError({ code: "NOT_FOUND", message: "Ranking não encontrado." });
  if (!isAdminUser(ctx) && ranking.userId !== ctx.user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este ranking." });
  }
  return ranking;
}

const weightsSchema = z.object({
  presenca: z.number().min(0).max(100).default(RANKING_DEFAULT_WEIGHTS.presenca),
  atividades: z.number().min(0).max(100).default(RANKING_DEFAULT_WEIGHTS.atividades),
  pratica: z.number().min(0).max(100).default(RANKING_DEFAULT_WEIGHTS.pratica),
  evolucao: z.number().min(0).max(100).default(RANKING_DEFAULT_WEIGHTS.evolucao),
  desafios: z.number().min(0).max(100).default(RANKING_DEFAULT_WEIGHTS.desafios),
}).default(RANKING_DEFAULT_WEIGHTS);

const privacySchema = z.object({
  showFullName: z.boolean().default(RANKING_DEFAULT_PRIVACY.showFullName),
  showAvatar: z.boolean().default(RANKING_DEFAULT_PRIVACY.showAvatar),
  showScores: z.boolean().default(RANKING_DEFAULT_PRIVACY.showScores),
  showEvolution: z.boolean().default(RANKING_DEFAULT_PRIVACY.showEvolution),
  showParticipants: z.boolean().default(RANKING_DEFAULT_PRIVACY.showParticipants),
  privateTopRange: z.number().min(1).max(100).default(RANKING_DEFAULT_PRIVACY.privateTopRange),
}).default(RANKING_DEFAULT_PRIVACY);

const baseFields = {
  name: z.string().min(2, "Informe o nome do ranking"),
  description: z.string().optional(),
  image: z.string().optional(),
  visibility: z.enum(["publico", "privado"]).default("publico"),
  privacySettings: privacySchema,
  criteriaWeights: weightsSchema,
  participantRule: z.enum(["todos", "instrumento", "nivel", "manual"]).default("todos"),
  instrumentId: z.number().nullable().optional(),
  level: z.string().nullable().optional(),
  participantStudentIds: z.array(z.number()).default([]),
  startDate: z.string(),
  endDate: z.string(),
};

// ── Router ─────────────────────────────────────────────────────────────────────

export const rankingsRouter = router({
  // ═══ ADMIN / PROFESSOR ═══

  list: protectedProcedure.input(z.object({
    status: z.enum(["rascunho", "agendado", "ativo", "encerrado", "cancelado", "todos"]).default("todos"),
  }).optional()).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    const isAdmin = isAdminUser(ctx);
    const rows = await db.select({
      id: rankings.id,
      name: rankings.name,
      description: rankings.description,
      status: rankings.status,
      visibility: rankings.visibility,
      startDate: rankings.startDate,
      endDate: rankings.endDate,
      participantRule: rankings.participantRule,
      history: rankings.history,
      createdBy: rankings.userId,
      createdAt: rankings.createdAt,
      participantCount: sql<number>`(SELECT CAST(count(*) AS INT) FROM ranking_participants rp WHERE rp."rankingId" = ${rankings.id})`,
    }).from(rankings)
      .where(and(
        eq(rankings.organizationId, orgId),
        isAdmin ? undefined : eq(rankings.userId, ctx.user.id),
        input?.status && input.status !== 'todos' ? eq(rankings.status, input.status) : undefined,
      ))
      .orderBy(desc(rankings.createdAt))
      .limit(200);
    return rows;
  }),

  listStudents: protectedProcedure.query(async ({ ctx }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    const isAdmin = isAdminUser(ctx);
    return db.select({ id: students.id, name: students.name, avatar: students.avatar, instrumentId: students.instrumentId, level: students.level })
      .from(students)
      .where(and(
        eq(students.organizationId, orgId),
        eq(students.status, 'ativo'),
        isAdmin ? undefined : eq(students.professorId, ctx.user.id),
      ))
      .orderBy(students.name)
      .limit(1000);
  }),

  create: protectedProcedure.input(z.object(baseFields)).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Datas inválidas." });
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A data final deve ser posterior à data inicial." });
    }
    if (input.participantRule === 'manual' && input.participantStudentIds.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos um aluno para a participação manual." });
    }

    const now = new Date();
    const status = startDate.getTime() > now.getTime() ? 'agendado' : 'ativo';

    const [created] = await db.insert(rankings).values({
      organizationId: orgId,
      userId: ctx.user.id,
      name: input.name,
      description: input.description ?? null,
      image: input.image ?? null,
      status,
      visibility: input.visibility,
      privacySettings: input.privacySettings,
      criteriaWeights: input.criteriaWeights,
      participantRule: input.participantRule,
      instrumentId: input.instrumentId ?? null,
      level: input.level ?? null,
      participantStudentIds: input.participantStudentIds,
      startDate,
      endDate,
    }).returning({ id: rankings.id });

    const [ranking] = await db.select().from(rankings).where(eq(rankings.id, created.id)).limit(1);
    if (status === 'ativo') {
      await resolveParticipants(db, ranking);
      notifyRankingStart(ranking).catch(() => {});
    }
    return { success: true, id: created.id, status };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["rascunho", "agendado", "ativo", "encerrado", "cancelado"]).optional(),
    ...baseFields,
  })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const current = await getRankingForStaff(db, ctx, input.id);
    if (current.status === 'encerrado') {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Rankings encerrados não podem ser alterados." });
    }

    const patch: any = {
      name: input.name ?? current.name,
      description: input.description !== undefined ? input.description : current.description,
      image: input.image !== undefined ? input.image : current.image,
      visibility: input.visibility ?? current.visibility,
      privacySettings: input.privacySettings ?? current.privacySettings,
      criteriaWeights: input.criteriaWeights ?? current.criteriaWeights,
      participantRule: input.participantRule ?? current.participantRule,
      instrumentId: input.instrumentId !== undefined ? input.instrumentId : current.instrumentId,
      level: input.level !== undefined ? input.level : current.level,
      participantStudentIds: input.participantStudentIds ?? current.participantStudentIds,
      updatedAt: new Date(),
    };
    if (input.startDate) {
      const d = new Date(input.startDate);
      if (isNaN(d.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Data inicial inválida." });
      patch.startDate = d;
    }
    if (input.endDate) {
      const d = new Date(input.endDate);
      if (isNaN(d.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Data final inválida." });
      if (d.getTime() <= (patch.startDate ? new Date(patch.startDate).getTime() : new Date(current.startDate).getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A data final deve ser posterior à data inicial." });
      }
      patch.endDate = d;
    }

    let becameActive = false;
    if (input.status && input.status !== current.status) {
      if (input.status === 'encerrado') {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use a ação 'Encerrar ranking' para encerrar com cálculo de resultado." });
      }
      patch.status = input.status;
      becameActive = input.status === 'ativo' && current.status !== 'ativo';
    }

    await db.update(rankings).set(patch).where(eq(rankings.id, input.id));
    const [updated] = await db.select().from(rankings).where(eq(rankings.id, input.id)).limit(1);

    if (becameActive && updated) {
      await resolveParticipants(db, updated);
      notifyRankingStart(updated).catch(() => {});
    }
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    await getRankingForStaff(db, ctx, input.id);
    await db.delete(rankingScores).where(eq(rankingScores.rankingId, input.id));
    await db.delete(rankingParticipants).where(eq(rankingParticipants.rankingId, input.id));
    await db.delete(studentAchievements).where(eq(studentAchievements.rankingId, input.id));
    await db.delete(rankings).where(eq(rankings.id, input.id));
    return { success: true };
  }),

  /** Encerramento manual com cálculo de resultado (§48). */
  encerrar: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const ranking = await getRankingForStaff(db, ctx, input.id);
    if (ranking.status === 'encerrado') {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ranking já está encerrado." });
    }
    await closeRanking(input.id);
    return { success: true };
  }),

  /** Classificação completa (staff) — igual à visão do aluno, sem filtro de privacidade. */
  standings: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return { ranking: null, standings: [] };
    const ranking = await getRankingForStaff(db, ctx, input.id);
    const standings = ranking.status === 'encerrado'
      ? await (async () => {
          const rows = await db.select({
            studentId: rankingParticipants.studentId,
            finalPosition: rankingParticipants.finalPosition,
            finalScore: rankingParticipants.finalScore,
            name: students.name,
            avatar: students.avatar,
          }).from(rankingParticipants)
            .leftJoin(students, eq(rankingParticipants.studentId, students.id))
            .where(eq(rankingParticipants.rankingId, input.id));
          return rows
            .sort((a: any, b: any) => (a.finalPosition ?? 999) - (b.finalPosition ?? 999))
            .map((r: any, i: number) => ({
              studentId: r.studentId, name: r.name ?? "Aluno", avatar: r.avatar ?? null,
              total: r.finalScore ?? 0, position: r.finalPosition ?? i + 1, shared: false,
              adjustments: 0,
              breakdown: {
                presenca: { raw: 0, points: 0, weighted: 0 },
                atividades: { raw: 0, points: 0, weighted: 0 },
                pratica: { raw: 0, points: 0, weighted: 0 },
                evolucao: { raw: 0, points: 0, weighted: 0 },
                desafios: { raw: 0, points: 0, weighted: 0 },
              },
              joinedAt: new Date(0),
            }));
        })()
      : await computeStandings(ranking);
    return { ranking, standings };
  }),

  /** Auditoria de pontuação (§46) — breakdown interno por critério. Nunca exposto ao aluno. */
  auditoria: protectedProcedure.input(z.object({ rankingId: z.number(), studentId: z.number() })).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return null;
    const ranking = await getRankingForStaff(db, ctx, input.rankingId);
    const standings = await computeStandings(ranking);
    const row = standings.find((s) => s.studentId === input.studentId);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não participa deste ranking." });
    const ajustes = await db.select().from(rankingScores)
      .where(and(eq(rankingScores.rankingId, input.rankingId), eq(rankingScores.studentId, input.studentId)))
      .orderBy(desc(rankingScores.createdAt));
    // Medalhas virtuais do aluno (todas)
    const medalhas = await db.select({
      id: studentAchievements.id,
      badge: studentAchievements.badge,
      title: studentAchievements.title,
      awardedAt: studentAchievements.awardedAt,
    }).from(studentAchievements)
      .where(and(eq(studentAchievements.studentId, input.studentId), eq(studentAchievements.organizationId, ctx.user.organizationId!)))
      .orderBy(desc(studentAchievements.awardedAt))
      .limit(12);
    return { studentId: input.studentId, breakdown: row.breakdown, adjustments: row.adjustments, total: row.total, position: row.position, ajustes, medalhas };
  }),

  /** Concede medalha virtual manual (staff) — com trilha via createdBy. */
  concederMedalha: protectedProcedure.input(z.object({
    studentId: z.number(),
    title: z.string().min(2, "Descreva a medalha").max(120),
    description: z.string().max(300).optional(),
    rankingId: z.number().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const [student] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
      .limit(1);
    if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });
    await db.insert(studentAchievements).values({
      organizationId: orgId,
      studentId: input.studentId,
      rankingId: input.rankingId ?? null,
      badge: "manual",
      title: input.title,
      description: input.description ?? null,
      awardedAt: new Date(),
    });
    return { success: true };
  }),

  /**
   * TOP 5 — RANKING GERAL: agrega pontos de TODOS os rankings ativos dentro do
   * período selecionado, com filtros reais (turma/instrumento). A pontuação de
   * cada ranking é recalculada com o período clampado à janela escolhida.
   */
  generalStandings: protectedProcedure.input(z.object({
    period: z.enum(["mes", "trimestre", "semestre", "todos"]).default("todos"),
    turma: z.string().optional(),
    instrumentId: z.number().nullable().optional(),
  })).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return { rows: [], turmas: [] };
    const orgId = ctx.user.organizationId!;
    const now = new Date();

    // Janela do período (fuso de Brasília para consistência com o resto do sistema)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let periodStart: Date | null = monthStart;
    if (input.period === "trimestre") periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (input.period === "semestre") periodStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    if (input.period === "todos") periodStart = null;

    // Turmas reais da organização (aulas do tipo 'turma')
    const turmaRows = await db.selectDistinct({ title: lessons.title })
      .from(lessons)
      .where(and(eq(lessons.organizationId, orgId), eq(lessons.lessonType, "turma")));

    // Filtro por turma: alunos que têm aula nessa turma
    let turmaStudentIds: Set<number> | null = null;
    if (input.turma) {
      const members = await db.select({ studentId: lessons.studentId })
        .from(lessons)
        .where(and(eq(lessons.organizationId, orgId), eq(lessons.lessonType, "turma"), eq(lessons.title, input.turma)));
      turmaStudentIds = new Set(members.map((m: any) => m.studentId).filter(Boolean));
    }

    const active = await db.select().from(rankings)
      .where(and(eq(rankings.organizationId, orgId), eq(rankings.status, "ativo")));

    // Agrega por aluno somando os critérios de cada ranking dentro da janela
    interface Agg { total: number; presenca: number; atividades: number; pratica: number; evolucao: number; rankings: Set<string>; }
    const agg = new Map<number, Agg>();
    for (const ranking of active) {
      const clampedStart = periodStart ? new Date(Math.max(new Date(ranking.startDate).getTime(), periodStart.getTime())) : new Date(ranking.startDate);
      const clampedEnd = now < new Date(ranking.endDate) ? now : new Date(ranking.endDate);
      if (clampedStart >= clampedEnd) continue;
      const standings = await computeStandings({ ...ranking, startDate: clampedStart, endDate: clampedEnd });
      for (const s of standings) {
        const cur = agg.get(s.studentId) ?? { total: 0, presenca: 0, atividades: 0, pratica: 0, evolucao: 0, rankings: new Set<string>() };
        cur.total += s.total;
        cur.presenca += s.breakdown.presenca.raw;
        cur.atividades += s.breakdown.atividades.raw;
        cur.pratica += s.breakdown.pratica.raw;
        cur.evolucao += s.breakdown.evolucao.raw;
        cur.rankings.add(ranking.name);
        agg.set(s.studentId, cur);
      }
    }

    if (agg.size === 0) return { rows: [], turmas: turmaRows.map((t: any) => t.title) };

    // Dados dos alunos (para filtros e exibição)
    const ids = Array.from(agg.keys());
    const studentRows = await db.select({
      id: students.id,
      name: students.name,
      avatar: students.avatar,
      instrumentId: students.instrumentId,
      level: students.level,
    }).from(students).where(inArray(students.id, ids));
    const studentMap = new Map(studentRows.map((s: any) => [s.id, s]));

    // Aplica filtros
    let entries = Array.from(agg.entries());
    if (turmaStudentIds) entries = entries.filter(([sid]) => turmaStudentIds!.has(sid));
    if (input.instrumentId) {
      entries = entries.filter(([sid]) => studentMap.get(sid)?.instrumentId === input.instrumentId);
    }

    // Ordena com a mesma cascata de desempate do motor
    entries.sort(([, a], [, b]) =>
      b.total - a.total ||
      b.atividades - a.atividades ||
      b.pratica - a.pratica ||
      b.evolucao - a.evolucao ||
      b.presenca - a.presenca
    );

    const rows = entries.map(([studentId, a], idx) => {
      const st = studentMap.get(studentId);
      const prev = entries[idx - 1]?.[1];
      const tied = prev && prev.total === a.total && prev.atividades === a.atividades && prev.pratica === a.pratica && prev.evolucao === a.evolucao && prev.presenca === a.presenca;
      return {
        studentId,
        position: tied ? -1 : 0, // preenchido abaixo
        shared: !!tied,
        total: a.total,
        name: st?.name ?? "Aluno",
        avatar: st?.avatar ?? null,
        instrumentId: st?.instrumentId ?? null,
        level: st?.level ?? null,
        breakdown: { presenca: a.presenca, atividades: a.atividades, pratica: a.pratica, evolucao: a.evolucao },
        rankings: Array.from(a.rankings),
      };
    });
    // Posições com empate técnico
    let lastPos = 0;
    rows.forEach((r, idx) => {
      if (r.shared && idx > 0) r.position = lastPos;
      else { lastPos = idx + 1; r.position = lastPos; }
    });

    return { rows, turmas: turmaRows.map((t: any) => t.title) };
  }),

  /** Ajuste manual/bônus com trilha de auditoria (§47). */
  ajuste: protectedProcedure.input(z.object({
    rankingId: z.number(),
    studentId: z.number(),
    points: z.number().min(-10000).max(10000),
    reason: z.string().min(3, "Descreva o motivo do ajuste"),
    source: z.enum(["bonus", "ajuste"]).default("ajuste"),
  })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    await getRankingForStaff(db, ctx, input.rankingId);
    const [participant] = await db.select({ id: rankingParticipants.id })
      .from(rankingParticipants)
      .where(and(eq(rankingParticipants.rankingId, input.rankingId), eq(rankingParticipants.studentId, input.studentId)))
      .limit(1);
    if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não participa deste ranking." });
    await db.insert(rankingScores).values({
      organizationId: ctx.user.organizationId,
      rankingId: input.rankingId,
      studentId: input.studentId,
      source: input.source,
      points: input.points,
      reason: input.reason,
      createdBy: ctx.user.id,
      createdAt: new Date(),
    });
    return { success: true };
  }),

  /** Histórico de rankings encerrados (§26). */
  historic: protectedProcedure.query(async ({ ctx }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    return db.select({
      id: rankings.id,
      name: rankings.name,
      startDate: rankings.startDate,
      endDate: rankings.endDate,
      history: rankings.history,
      closedAt: rankings.closedAt,
      participantCount: sql<number>`(SELECT CAST(count(*) AS INT) FROM ranking_participants rp WHERE rp."rankingId" = ${rankings.id})`,
    }).from(rankings)
      .where(and(eq(rankings.organizationId, orgId), eq(rankings.status, 'encerrado')))
      .orderBy(desc(rankings.endDate))
      .limit(50);
  }),

  // ═══ ALUNO (leitura — §50/§51) ═══

  /** Card "Meu Ranking" do dashboard (§4) + lista de competições do aluno. */
  myRankings: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then(r => r[0]?.id));
    if (!studentId) return [];

    const participations = await db.select({
      rankingId: rankings.id,
      name: rankings.name,
      status: rankings.status,
      visibility: rankings.visibility,
      startDate: rankings.startDate,
      endDate: rankings.endDate,
      image: rankings.image,
      finalPosition: rankingParticipants.finalPosition,
      finalScore: rankingParticipants.finalScore,
      previousPosition: rankingParticipants.previousPosition,
      lastPosition: rankingParticipants.lastPosition,
      totalParticipants: sql<number>`(SELECT CAST(count(*) AS INT) FROM ranking_participants rp2 WHERE rp2."rankingId" = ${rankings.id})`,
    }).from(rankingParticipants)
      .innerJoin(rankings, eq(rankings.id, rankingParticipants.rankingId))
      .where(and(
        eq(rankingParticipants.studentId, studentId),
        eq(rankings.organizationId, orgId),
        inArray(rankings.status, ['ativo', 'agendado', 'encerrado']),
      ))
      .orderBy(desc(rankings.endDate))
      .limit(20);

    // Para rankings ativos, calcula posição/pontuação correntes (derivada)
    const detailed = await Promise.all(participations.map(async (p: any) => {
      if (p.status !== 'ativo') {
        return { ...p, position: p.finalPosition, score: p.finalScore, positionDiff: null };
      }
      const [ranking] = await db.select().from(rankings).where(eq(rankings.id, p.rankingId)).limit(1);
      if (!ranking) return { ...p, position: null, score: null, positionDiff: null };
      const standings = await computeStandings(ranking);
      const mine = standings.find((s) => s.studentId === studentId);
      const diff = mine && p.previousPosition ? p.previousPosition - mine.position : null;
      return { ...p, position: mine?.position ?? null, score: mine?.total ?? 0, positionDiff: diff };
    }));

    return detailed;
  }),

  /**
   * Ranking completo do aluno (§5-§8) com privacidade aplicada (§31/§32).
   * Apenas participantes visualizam (público ou privado).
   */
  getStandings: studentProcedure.input(z.object({ rankingId: z.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const orgId = ctx.user.organizationId!;
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then(r => r[0]?.id));
    if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado" });

    const [ranking] = await db.select().from(rankings)
      .where(and(eq(rankings.id, input.rankingId), eq(rankings.organizationId, orgId)))
      .limit(1);
    if (!ranking) throw new TRPCError({ code: "NOT_FOUND", message: "Ranking não encontrado." });

    const [myParticipation] = await db.select()
      .from(rankingParticipants)
      .where(and(eq(rankingParticipants.rankingId, ranking.id), eq(rankingParticipants.studentId, studentId)))
      .limit(1);
    if (!myParticipation) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa deste ranking." });
    }

    const privacy: RankingPrivacySettings = { ...RANKING_DEFAULT_PRIVACY, ...(ranking.privacySettings ?? {}) };

    // Encerrado: resultado final congelado (§48)
    if (ranking.status === 'encerrado') {
      const finals = await db.select({
        studentId: rankingParticipants.studentId,
        finalPosition: rankingParticipants.finalPosition,
        finalScore: rankingParticipants.finalScore,
        name: students.name,
        avatar: students.avatar,
      }).from(rankingParticipants)
        .leftJoin(students, eq(rankingParticipants.studentId, students.id))
        .where(eq(rankingParticipants.rankingId, ranking.id));
      const sorted = finals.sort((a: any, b: any) => (a.finalPosition ?? 999) - (b.finalPosition ?? 999));
      const masked = sorted.map((r: any) => ({
        studentId: r.studentId,
        position: r.finalPosition ?? 0,
        score: r.finalScore ?? 0,
        name: r.studentId === studentId || privacy.showParticipants ? (privacy.showFullName ? (r.name ?? "Aluno") : (r.name ?? "A").split(" ")[0]) : "•••",
        avatar: privacy.showAvatar ? (r.avatar ?? null) : null,
        isMe: r.studentId === studentId,
        evolution: null as number | null,
      }));
      return {
        ranking: {
          id: ranking.id, name: ranking.name, description: ranking.description,
          status: ranking.status, visibility: ranking.visibility,
          startDate: ranking.startDate, endDate: ranking.endDate,
          image: ranking.image, history: ranking.history,
        },
        privacy,
        participantsCount: sorted.length,
        myPosition: myParticipation.finalPosition,
        myScore: myParticipation.finalScore,
        myEvolution: null,
        proximity: null,
        rows: privacy.showParticipants || ranking.visibility === 'publico' ? masked : masked.filter((r: any) => r.isMe),
      };
    }

    // Ativo/agendado: classificação corrente derivada
    const standings = await computeStandings(ranking);
    const mine = standings.find((s) => s.studentId === studentId);
    if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa deste ranking." });

    const diff = myParticipation.previousPosition ? myParticipation.previousPosition - mine.position : null;

    // Proximidade do colocado anterior (§21) — sem expor dados sensíveis
    const idx = standings.findIndex((s) => s.studentId === studentId);
    const ahead = idx > 0 ? standings[idx - 1] : null;
    const proximity = ahead && ahead.total > mine.total
      ? { targetPosition: ahead.position, missingPoints: ahead.total - mine.total }
      : null;

    const maskName = (name: string, isMe: boolean) =>
      isMe ? "Você" : (privacy.showFullName ? name : name.split(" ")[0]);

    const rows = standings.map((s) => ({
      studentId: s.studentId,
      position: s.position,
      score: privacy.showScores || s.studentId === studentId ? s.total : null,
      name: maskName(s.name, s.studentId === studentId),
      avatar: privacy.showAvatar ? s.avatar : null,
      isMe: s.studentId === studentId,
      evolution: privacy.showEvolution ? null : undefined,
      shared: s.shared,
    }));

    // Privado: aluno vê apenas os próprios dados + faixa opcional (§8/§31)
    let visibleRows = rows;
    let topRangeNote: string | null = null;
    if (ranking.visibility === 'privado') {
      visibleRows = rows.filter((r: any) => r.isMe);
      if (mine.position <= privacy.privateTopRange) {
        topRangeNote = `Você está entre os ${privacy.privateTopRange} melhores.`;
      }
    }

    return {
      ranking: {
        id: ranking.id, name: ranking.name, description: ranking.description,
        status: ranking.status, visibility: ranking.visibility,
        startDate: ranking.startDate, endDate: ranking.endDate,
        image: ranking.image, history: null,
      },
      privacy,
      participantsCount: standings.length,
      myPosition: mine.position,
      myScore: mine.total,
      myEvolution: diff,
      proximity,
      topRangeNote,
      rows: visibleRows,
    };
  }),

  /** Medalhas e conquistas do aluno (§25/§27). */
  myBadges: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then(r => r[0]?.id));
    if (!studentId) return [];
    return db.select({
      id: studentAchievements.id,
      badge: studentAchievements.badge,
      title: studentAchievements.title,
      description: studentAchievements.description,
      rankingId: studentAchievements.rankingId,
      awardedAt: studentAchievements.awardedAt,
    }).from(studentAchievements)
      .where(and(eq(studentAchievements.studentId, studentId), eq(studentAchievements.organizationId, orgId)))
      .orderBy(desc(studentAchievements.awardedAt))
      .limit(50);
  }),

  /** Métricas do hero da aba Rankings (admin/professor) — valores reais derivados. */
  stats: protectedProcedure.query(async ({ ctx }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return { alunosParticipando: 0, alunosDelta: 0, pontosDistribuidos: 0, pontosDelta: 0, competicoesRealizadas: 0, competicoesDelta: 0, engajamento: 0, engajamentoDelta: 0 };
    const orgId = ctx.user.organizationId!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const active = await db.select().from(rankings)
      .where(and(eq(rankings.organizationId, orgId), eq(rankings.status, 'ativo')));
    const [{ count: encerradosCount }] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
      .from(rankings)
      .where(and(eq(rankings.organizationId, orgId), eq(rankings.status, 'encerrado')));
    const [{ count: criadasNoMes }] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
      .from(rankings)
      .where(and(
        eq(rankings.organizationId, orgId),
        gte(rankings.createdAt, monthStart),
        ne(rankings.status, 'rascunho'),
      ));

    let pontosDistribuidos = 0;
    let pontosDelta = 0;
    const participantIds = new Set<number>();

    for (const ranking of active) {
      const standings = await computeStandings(ranking);
      for (const s of standings) {
        participantIds.add(s.studentId);
        pontosDistribuidos += s.total;
      }
      // Pontos acumulados no mês corrente (período clampado ao mês)
      const clampedStart = new Date(Math.max(new Date(ranking.startDate).getTime(), monthStart.getTime()));
      const clampedEnd = now < new Date(ranking.endDate) ? now : new Date(ranking.endDate);
      if (clampedStart < clampedEnd) {
        const monthStandings = await computeStandings({ ...ranking, startDate: clampedStart, endDate: clampedEnd });
        pontosDelta += monthStandings.reduce((acc, s) => acc + s.total, 0);
      }
    }

    let alunosDelta = 0;
    if (active.length > 0) {
      const novos = await db.select({ studentId: rankingParticipants.studentId })
        .from(rankingParticipants)
        .where(and(
          inArray(rankingParticipants.rankingId, active.map((r) => r.id)),
          gte(rankingParticipants.joinedAt, monthStart),
        ));
      alunosDelta = new Set(novos.map((n: any) => n.studentId)).size;
    }

    const [{ count: activeStudentsCount }] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
      .from(students)
      .where(and(eq(students.organizationId, orgId), eq(students.status, 'ativo')));

    const totalStudents = Number(activeStudentsCount ?? 0);
    const engajamento = totalStudents > 0 ? Math.round((participantIds.size / totalStudents) * 100) : 0;
    const engajamentoDelta = totalStudents > 0 ? Math.round((alunosDelta / totalStudents) * 100) : 0;

    return {
      alunosParticipando: participantIds.size,
      alunosDelta,
      pontosDistribuidos,
      pontosDelta,
      competicoesRealizadas: Number(encerradosCount ?? 0),
      competicoesDelta: Number(criadasNoMes ?? 0),
      engajamento,
      engajamentoDelta,
    };
  }),

  /** Feed de atividades recentes (ranking criado/encerrado + conquistas). */
  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;

    const rankingRows = await db.select({
      id: rankings.id,
      name: rankings.name,
      status: rankings.status,
      createdAt: rankings.createdAt,
      closedAt: rankings.closedAt,
      history: rankings.history,
    }).from(rankings)
      .where(eq(rankings.organizationId, orgId))
      .orderBy(desc(rankings.createdAt))
      .limit(15);

    const badgeRows = await db.select({
      id: studentAchievements.id,
      badge: studentAchievements.badge,
      title: studentAchievements.title,
      studentName: students.name,
      awardedAt: studentAchievements.awardedAt,
    }).from(studentAchievements)
      .leftJoin(students, eq(studentAchievements.studentId, students.id))
      .where(eq(studentAchievements.organizationId, orgId))
      .orderBy(desc(studentAchievements.awardedAt))
      .limit(10);

    const events: Array<{ type: string; title: string; description: string; at: string }> = [];
    for (const r of rankingRows) {
      if (r.status === 'encerrado') {
        const winner = (r.history as any)?.podium?.[0];
        events.push({
          type: 'vencedor',
          title: winner ? `${winner.name} conquistou o 1º lugar` : `Ranking encerrado`,
          description: winner ? r.name : r.name,
          at: (r.closedAt ?? r.createdAt).toISOString(),
        });
      } else if (r.status !== 'rascunho') {
        events.push({
          type: 'competicao',
          title: `Nova competição criada`,
          description: r.name,
          at: new Date(r.createdAt).toISOString(),
        });
      }
    }
    for (const b of badgeRows) {
      events.push({
        type: 'conquista',
        title: `${b.studentName ?? "Aluno"} — ${b.title}`,
        description: 'Conquista desbloqueada',
        at: new Date(b.awardedAt).toISOString(),
      });
    }

    return events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6);
  }),

});
