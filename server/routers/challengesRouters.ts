// ─── Desafios (PRD_RANKINGS §55) — professor cria, aluno responde, ───────────
// APROVAÇÃO OBRIGATÓRIA para pontuar. 6 tipos: performance | quiz | pratica |
// relampago | batalha | turma. Solto (rankingId null) aprovado → medalha;
// vinculado a ranking aprovado → rankingScores (source 'desafio').
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  schoolChallenges,
  challengeResponses,
  rankingParticipants,
  rankingScores,
  rankings,
  studentAchievements,
  students,
  lessons,
  notifications,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { notifyUser } from "../_core/notification";
import { storagePut } from "../storage";

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === 'admin' || role === 'professor' || role === 'superadmin' || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
}

/**
 * Remove do disco os arquivos de mídia (vídeo/áudio/imagem) das respostas de um desafio.
 * Chamado ao ENCERRAR (libera espaço — mídia avaliada não precisa mais ficar armazenada)
 * e ao EXCLUIR (antes as linhas eram apagadas mas os arquivos ficavam órfãos no volume).
 * Registros no banco são preservados (texto, pontos, feedback) — só o binário é removido.
 * Arquivos externos (Forge/S3) não são gerenciados aqui.
 */
async function deleteResponseMediaFiles(db: any, orgId: number, challengeId: number): Promise<number> {
  const rows = await db.select({ fileUrl: challengeResponses.fileUrl })
    .from(challengeResponses)
    .where(and(eq(challengeResponses.challengeId, challengeId), eq(challengeResponses.organizationId, orgId)));
  if (rows.length === 0) return 0;

  const fs = await import("fs");
  const pathMod = await import("path");
  const uploadsRoot = pathMod.resolve(process.cwd(), "uploads");
  let deleted = 0;
  for (const r of rows) {
    const raw: string | null = r.fileUrl;
    if (!raw) continue;
    const isLocal = raw.startsWith("/uploads/") || raw.match(/https?:\/\/[^/]+\/uploads\//);
    if (!isLocal) continue; // externo (Forge/S3): fora do nosso controle
    const relKey = raw.replace(/^https?:\/\/[^/]+\/uploads\//, "").replace(/^\/uploads\//, "");
    const absPath = pathMod.resolve(uploadsRoot, relKey);
    if (!absPath.startsWith(uploadsRoot)) continue; // path traversal
    try { fs.unlinkSync(absPath); deleted++; } catch { /* já removido — ignora */ }
  }
  return deleted;
}

async function resolveStudentId(db: any, ctx: any): Promise<number> {
  const orgId = ctx.user.organizationId!;
  const studentId = ctx.user.studentId
    ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then((r: any) => r[0]?.id));
  if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Perfil de aluno incompleto." });
  return studentId;
}

const quizQuestionSchema = z.object({
  q: z.string().min(1),
  opts: z.array(z.string()).min(2).max(6),
  correct: z.number().min(0).max(5),
});

const challengeInput = z.object({
  titulo: z.string().min(3, "Informe o título").max(160),
  descricao: z.string().max(2000).optional().nullable(),
  tipo: z.enum(["performance", "quiz", "pratica", "relampago", "batalha", "turma"]),
  pontos: z.number().min(1).max(10000).default(50),
  prazo: z.string().optional().nullable(),
  rankingId: z.number().nullable().optional(),
  turmaNome: z.string().max(120).optional().nullable(),
  batalhaStudentA: z.number().nullable().optional(),
  batalhaStudentB: z.number().nullable().optional(),
  quizQuestions: z.array(quizQuestionSchema).max(20).optional().nullable(),
  praticaMinutos: z.number().min(1).max(1000).optional().nullable(),
  praticaDias: z.number().min(1).max(60).optional().nullable(),
});

export const challengesRouter = router({
  // ═══ PROFESSOR/ADMIN ═══

  list: protectedProcedure.query(async ({ ctx }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    return db.select({
      id: schoolChallenges.id,
      titulo: schoolChallenges.titulo,
      descricao: schoolChallenges.descricao,
      tipo: schoolChallenges.tipo,
      pontos: schoolChallenges.pontos,
      prazo: schoolChallenges.prazo,
      rankingId: schoolChallenges.rankingId,
      rankingName: rankings.name,
      turmaNome: schoolChallenges.turmaNome,
      batalhaStudentA: schoolChallenges.batalhaStudentA,
      batalhaStudentB: schoolChallenges.batalhaStudentB,
      quizQuestions: schoolChallenges.quizQuestions,
      praticaMinutos: schoolChallenges.praticaMinutos,
      praticaDias: schoolChallenges.praticaDias,
      status: schoolChallenges.status,
      createdAt: schoolChallenges.createdAt,
      totalRespostas: sql<number>`(SELECT CAST(count(*) AS INT) FROM challenge_responses cr WHERE cr."challengeId" = ${schoolChallenges.id})`,
      pendentes: sql<number>`(SELECT CAST(count(*) AS INT) FROM challenge_responses cr WHERE cr."challengeId" = ${schoolChallenges.id} AND cr.status = 'enviado')`,
    }).from(schoolChallenges)
      .leftJoin(rankings, eq(schoolChallenges.rankingId, rankings.id))
      .where(eq(schoolChallenges.organizationId, orgId))
      .orderBy(desc(schoolChallenges.createdAt))
      .limit(100);
  }),

  create: protectedProcedure.input(challengeInput).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;

    if (input.tipo === "quiz" && (!input.quizQuestions || input.quizQuestions.length === 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Adicione ao menos uma pergunta ao quiz." });
    }
    if (input.tipo === "batalha" && (!input.batalhaStudentA || !input.batalhaStudentB)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione os 2 alunos da batalha." });
    }
    if (input.tipo === "batalha" && input.batalhaStudentA === input.batalhaStudentB) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione dois alunos diferentes para a batalha." });
    }
    if (input.tipo === "turma" && !input.turmaNome) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a turma do desafio." });
    }

    const [created] = await db.insert(schoolChallenges).values({
      organizationId: orgId,
      userId: ctx.user.id,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      tipo: input.tipo,
      pontos: input.pontos,
      prazo: input.prazo ? new Date(input.prazo) : null,
      rankingId: input.rankingId ?? null,
      turmaNome: input.tipo === "turma" ? input.turmaNome : null,
      batalhaStudentA: input.tipo === "batalha" ? input.batalhaStudentA : null,
      batalhaStudentB: input.tipo === "batalha" ? input.batalhaStudentB : null,
      quizQuestions: input.tipo === "quiz" ? JSON.stringify(input.quizQuestions) : null,
      praticaMinutos: input.tipo === "pratica" ? (input.praticaMinutos ?? 30) : null,
      praticaDias: input.tipo === "pratica" ? (input.praticaDias ?? 3) : null,
      status: "ativa",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: schoolChallenges.id, titulo: schoolChallenges.titulo, tipo: schoolChallenges.tipo, pontos: schoolChallenges.pontos, prazo: schoolChallenges.prazo, rankingId: schoolChallenges.rankingId });

    // Notifica alunos no escopo (com conta vinculada) — push não bloqueia
    (async () => {
      try {
        const challenge = { ...created, organizationId: orgId, turmaNome: input.tipo === "turma" ? input.turmaNome : null, batalhaStudentA: input.tipo === "batalha" ? input.batalhaStudentA : null, batalhaStudentB: input.tipo === "batalha" ? input.batalhaStudentB : null };
        const { studentUserIds } = await challengeAudience(db, challenge);
        for (const uid of studentUserIds.slice(0, 200)) {
          await db.insert(notifications).values({
            organizationId: orgId,
            userId: uid,
            title: "🎯 Novo Desafio!",
            message: `${created.titulo} vale ${created.pontos} pontos. Responda antes que o prazo acabe!`,
            type: "info",
            actionUrl: "/aluno",
          });
          notifyUser(uid, { title: "🎯 Novo Desafio!", content: `${created.titulo} vale ${created.pontos} pontos!`, url: "/aluno" }).catch(() => {});
        }
      } catch { /* notificação é best-effort */ }
    })();

    return { success: true, id: created.id };
  }),

  encerrar: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    await db.update(schoolChallenges).set({ status: "encerrada", updatedAt: new Date() })
      .where(and(eq(schoolChallenges.id, input.id), eq(schoolChallenges.organizationId, ctx.user.organizationId!)));
    // Libera espaço: mídias das respostas saem do disco (avaliação já concluída ou prazo vencido)
    const removedMedia = await deleteResponseMediaFiles(db, ctx.user.organizationId!, input.id);
    return { success: true, removedMedia };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    await deleteResponseMediaFiles(db, orgId, input.id);
    await db.delete(challengeResponses).where(and(eq(challengeResponses.challengeId, input.id), eq(challengeResponses.organizationId, orgId)));
    await db.delete(schoolChallenges).where(and(eq(schoolChallenges.id, input.id), eq(schoolChallenges.organizationId, orgId)));
    return { success: true };
  }),

  /** Respostas de um desafio (fila de avaliação do professor). */
  responses: protectedProcedure.input(z.object({ challengeId: z.number() })).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    return db.select({
      id: challengeResponses.id,
      studentId: challengeResponses.studentId,
      studentName: students.name,
      avatar: students.avatar,
      respostaTexto: challengeResponses.respostaTexto,
      fileUrl: challengeResponses.fileUrl,
      fileType: challengeResponses.fileType,
      respostasQuiz: challengeResponses.respostasQuiz,
      status: challengeResponses.status,
      pontos: challengeResponses.pontos,
      feedback: challengeResponses.feedback,
      createdAt: challengeResponses.createdAt,
    }).from(challengeResponses)
      .leftJoin(students, eq(challengeResponses.studentId, students.id))
      .where(and(eq(challengeResponses.challengeId, input.challengeId), eq(challengeResponses.organizationId, orgId)))
      .orderBy(desc(challengeResponses.createdAt))
      .limit(200);
  }),

  /** URL reproduzível da mídia de uma resposta (trava do admin). */
  mediaUrl: protectedProcedure.input(z.object({ responseId: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;

    const [response] = await db.select({
      fileUrl: challengeResponses.fileUrl,
      fileType: challengeResponses.fileType,
    }).from(challengeResponses)
      .where(and(eq(challengeResponses.id, input.responseId), eq(challengeResponses.organizationId, orgId)))
      .limit(1);
    if (!response || !response.fileUrl) throw new TRPCError({ code: "NOT_FOUND", message: "Resposta sem anexo." });

    // Arquivo externo (Forge/S3): URL pública — retorna direto
    const isLocal = response.fileUrl.startsWith("/uploads/") || response.fileUrl.match(/https?:\/\/[^/]+\/uploads\//);
    if (!isLocal) {
      return { url: response.fileUrl, fileType: response.fileType ?? "", fileNotFound: false };
    }

    // Arquivo local: verifica existência no disco antes de gerar token
    const relKey = response.fileUrl.replace(/^https?:\/\/[^/]+\/uploads\//, "").replace(/^\/uploads\//, "");
    const { existsSync } = await import("fs");
    const { resolve } = await import("path");
    const absPath = resolve(process.cwd(), "uploads", relKey);
    if (!existsSync(absPath)) {
      return { url: "", fileType: response.fileType ?? "", fileNotFound: true };
    }

    const { createFileToken } = await import("../_core/fileTokens");
    const token = createFileToken(relKey);
    const fileName = encodeURIComponent(relKey.split("/").pop() ?? "arquivo");
    return { url: `/uploads-token/${token}/${fileName}`, fileType: response.fileType ?? "", fileNotFound: false };
  }),

  /** Avaliação OBRIGATÓRIA: aprovar (com pontos + feedback) ou reprovar. */
  avaliar: protectedProcedure.input(z.object({
    responseId: z.number(),
    aprovado: z.boolean(),
    pontos: z.number().min(0).max(10000).optional(),
    feedback: z.string().max(1000).optional().nullable(),
  })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;

    const [response] = await db.select().from(challengeResponses)
      .where(and(eq(challengeResponses.id, input.responseId), eq(challengeResponses.organizationId, orgId)))
      .limit(1);
    if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Resposta não encontrada." });
    if (response.status !== "enviado") throw new TRPCError({ code: "BAD_REQUEST", message: "Resposta já avaliada." });

    const [challenge] = await db.select().from(schoolChallenges)
      .where(and(eq(schoolChallenges.id, response.challengeId), eq(schoolChallenges.organizationId, orgId)))
      .limit(1);
    if (!challenge) throw new TRPCError({ code: "NOT_FOUND", message: "Desafio não encontrado." });

    const pontos = input.aprovado ? (input.pontos ?? challenge.pontos) : 0;
    const status = input.aprovado ? "aprovado" : "reprovado";

    await db.update(challengeResponses).set({
      status,
      pontos: input.aprovado ? pontos : 0,
      feedback: input.feedback ?? null,
      avaliadoBy: ctx.user.id,
      avaliadoAt: new Date(),
    }).where(eq(challengeResponses.id, response.id));

    // Pontuação (APENAS aprovado): ranking → rankingScores; solto → medalha
    if (input.aprovado && challenge.rankingId) {
      await db.insert(rankingScores).values({
        organizationId: orgId,
        rankingId: challenge.rankingId,
        studentId: response.studentId,
        source: "desafio",
        points: pontos,
        reason: `Desafio aprovado: ${challenge.titulo}`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });
    } else if (input.aprovado) {
      const [existingBadge] = await db.select({ id: studentAchievements.id }).from(studentAchievements)
        .where(and(
          eq(studentAchievements.studentId, response.studentId),
          eq(studentAchievements.badge, "desafio"),
          eq(studentAchievements.challengeId, challenge.id),
        ))
        .limit(1);
      if (!existingBadge) {
        await db.insert(studentAchievements).values({
          organizationId: orgId,
          studentId: response.studentId,
          rankingId: null,
          challengeId: challenge.id,
          badge: "desafio",
          title: `🎯 ${challenge.titulo}`,
          description: `Desafio concluído — ${pontos} pontos`,
          awardedAt: new Date(),
        });
      }
    }

    // Notifica o aluno (se tiver conta vinculada)
    const [student] = await db.select({ studentUserId: students.studentUserId, name: students.name })
      .from(students).where(eq(students.id, response.studentId)).limit(1);
    if (student?.studentUserId) {
      const title = input.aprovado ? "🎯 Desafio Aprovado!" : "🎯 Desafio";
      const message = input.aprovado
        ? `Parabéns! Seu desafio "${challenge.titulo}" foi aprovado com ${pontos} pontos.${input.feedback ? ` Feedback: ${input.feedback}` : ""}`
        : `Seu desafio "${challenge.titulo}" não foi aprovado desta vez.${input.feedback ? ` Feedback: ${input.feedback}` : ""}`;
      await db.insert(notifications).values({
        organizationId: orgId,
        userId: student.studentUserId,
        title,
        message,
        type: input.aprovado ? "success" : "info",
        actionUrl: "/aluno/resultados",
      });
      notifyUser(student.studentUserId, { title, content: message, url: "/aluno/resultados" }).catch(() => {});
    }

    return { success: true, status, pontos };
  }),

  // ═══ ALUNO ═══

  /** Desafios no escopo do aluno (ranking que participa / turma / batalha / todos) + minha resposta. */
  myChallenges: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    const studentId = await resolveStudentId(db, ctx);

    // Escopo: (1) desafios soltos/turma do aluno, (2) batalhas onde é participante,
    // (3) desafios de rankings em que o aluno participa.
  const myRankingIds = (await db.select({ rid: rankingParticipants.rankingId })
    .from(rankingParticipants)
    .where(eq(rankingParticipants.studentId, studentId))).map((r: any) => r.rid);

  const myTurmas = (await db.selectDistinct({ title: lessons.title })
    .from(lessons)
    .where(and(eq(lessons.organizationId, orgId), eq(lessons.studentId, studentId), eq(lessons.lessonType, "turma")))).map((t: any) => t.title);

    const all = await db.select().from(schoolChallenges)
      .where(eq(schoolChallenges.organizationId, orgId))
      .orderBy(desc(schoolChallenges.createdAt))
      .limit(50);

    const inScope = all.filter((c) => {
      if (c.tipo === "batalha") return c.batalhaStudentA === studentId || c.batalhaStudentB === studentId;
      if (c.turmaNome) return myTurmas.includes(c.turmaNome);
      if (c.rankingId) return myRankingIds.includes(c.rankingId);
      return true; // solto: todos os alunos da escola
    });

    const myResponses = await db.select().from(challengeResponses)
      .where(and(eq(challengeResponses.studentId, studentId), eq(challengeResponses.organizationId, orgId)));
    const responseByChallenge = new Map(myResponses.map(r => [r.challengeId, r]));

    // Somente desafios ATIVOS no dashboard do aluno (limpo).
    // O histórico completo (avaliados/encerrados) vive na aba "Resultados" (myHistory).
    return inScope.filter((c: any) => c.status === "ativa").map((c: any) => {
      const mine = responseByChallenge.get(c.id) ?? null;
      let quizQuestions: any[] = [];
      if (c.tipo === "quiz" && c.quizQuestions) {
        try { quizQuestions = JSON.parse(c.quizQuestions); } catch { /* ignora */ }
      }
      return {
        id: c.id,
        titulo: c.titulo,
        descricao: c.descricao,
        tipo: c.tipo,
        pontos: c.pontos,
        prazo: c.prazo,
        rankingId: c.rankingId,
        praticaMinutos: c.praticaMinutos,
        praticaDias: c.praticaDias,
        quizQuestions,
        minhaResposta: mine ? {
          status: mine.status,
          pontos: mine.pontos,
          feedback: mine.feedback,
        } : null,
      };
    });
  }),

  /** Histórico completo de desafios do aluno (avaliados/encerrados) — aba "Resultados". */
  myHistory: studentProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    // Admin/aluno sem perfil vinculado → histórico vazio (mesma postura de myRankings/myBadges)
    const studentId = ctx.user.studentId
      ?? (await db.select({ id: students.id }).from(students).where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, orgId))).limit(1).then((r: any) => r[0]?.id));
    if (!studentId) return [];

    return db.select({
      id: challengeResponses.id,
      challengeId: challengeResponses.challengeId,
      titulo: schoolChallenges.titulo,
      tipo: schoolChallenges.tipo,
      pontosBase: schoolChallenges.pontos,
      rankingName: rankings.name,
      status: challengeResponses.status,
      pontos: challengeResponses.pontos,
      feedback: challengeResponses.feedback,
      respostaTexto: challengeResponses.respostaTexto,
      createdAt: challengeResponses.createdAt,
      avaliadoAt: challengeResponses.avaliadoAt,
    }).from(challengeResponses)
      .innerJoin(schoolChallenges, eq(schoolChallenges.id, challengeResponses.challengeId))
      .leftJoin(rankings, eq(rankings.id, schoolChallenges.rankingId))
      .where(and(eq(challengeResponses.studentId, studentId), eq(challengeResponses.organizationId, orgId)))
      .orderBy(desc(challengeResponses.createdAt))
      .limit(100);
  }),

  /** Upload de mídia da resposta (vídeo/áudio/imagem) — storage próprio. */
  uploadResponse: studentProcedure.input(z.object({
    fileName: z.string().max(255),
    fileType: z.string().max(100),
    base64Data: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const orgId = ctx.user.organizationId!;
    const base64 = input.base64Data.includes(",") ? input.base64Data.split(",")[1] : input.base64Data;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
    if (buffer.length > 60 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo maior que 60MB." });
    const ext = (input.fileName.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const key = `challenges/org_${orgId}/student_${ctx.user.studentId ?? ctx.user.id}/${nanoid(8)}.${ext}`;
    const { url } = await storagePut(key, buffer, input.fileType);
    return { url };
  }),

  /** Aluno submete a resposta (aprovação do professor é obrigatória para pontuar). */
  respond: studentProcedure.input(z.object({
    challengeId: z.number(),
    respostaTexto: z.string().max(2000).optional(),
    fileUrl: z.string().url().optional(),
    fileType: z.string().max(100).optional(),
    respostasQuiz: z.array(z.number()).optional(), // índice escolhido por pergunta
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const studentId = await resolveStudentId(db, ctx);

    const [challenge] = await db.select().from(schoolChallenges)
      .where(and(eq(schoolChallenges.id, input.challengeId), eq(schoolChallenges.organizationId, orgId), eq(schoolChallenges.status, "ativa")))
      .limit(1);
    if (!challenge) throw new TRPCError({ code: "NOT_FOUND", message: "Desafio não encontrado ou encerrado." });
    if (challenge.prazo && new Date() > new Date(challenge.prazo)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O prazo deste desafio já expirou." });
    }

    // Escopo (espelha myChallenges): batalha só entre os 2 participantes; turma só para membros;
    // ranking só para participantes. Desafio solto: todos os alunos da escola.
    if (challenge.tipo === "batalha") {
      if (challenge.batalhaStudentA !== studentId && challenge.batalhaStudentB !== studentId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa desta batalha." });
      }
    } else if (challenge.turmaNome) {
      const [turmaLesson] = await db.select({ id: lessons.id }).from(lessons)
        .where(and(eq(lessons.organizationId, orgId), eq(lessons.studentId, studentId), eq(lessons.lessonType, "turma"), eq(lessons.title, challenge.turmaNome)))
        .limit(1);
      if (!turmaLesson) throw new TRPCError({ code: "FORBIDDEN", message: "Este desafio é para outra turma." });
    } else if (challenge.rankingId) {
      const [part] = await db.select({ id: rankingParticipants.id }).from(rankingParticipants)
        .where(and(eq(rankingParticipants.rankingId, challenge.rankingId), eq(rankingParticipants.studentId, studentId)))
        .limit(1);
      if (!part) throw new TRPCError({ code: "FORBIDDEN", message: "Você não participa do ranking deste desafio." });
    }

    // Performance exige mídia (vídeo/áudio) — é a essência do tipo.
    if (challenge.tipo === "performance" && !input.fileUrl) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe um vídeo ou áudio da sua performance." });
    }

    const [existing] = await db.select({ id: challengeResponses.id }).from(challengeResponses)
      .where(and(eq(challengeResponses.challengeId, challenge.id), eq(challengeResponses.studentId, studentId)))
      .limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Você já respondeu este desafio. Aguarde a avaliação." });

    await db.insert(challengeResponses).values({
      organizationId: orgId,
      challengeId: challenge.id,
      studentId,
      respostaTexto: input.respostaTexto ?? null,
      fileUrl: input.fileUrl ?? null,
      fileType: input.fileType ?? null,
      respostasQuiz: input.respostasQuiz ? JSON.stringify(input.respostasQuiz) : null,
      status: "enviado",
      createdAt: new Date(),
    });

    // Notifica o professor criador (com o nome do aluno)
    const [responder] = await db.select({ name: students.name }).from(students)
      .where(eq(students.id, studentId)).limit(1);
    const studentFirstName = (responder?.name || "Um aluno").trim().split(/\s+/)[0];

    await db.insert(notifications).values({
      organizationId: orgId,
      userId: challenge.userId,
      title: "📥 Nova Resposta de Desafio",
      message: `${studentFirstName} respondeu o desafio "${challenge.titulo}". Avalie para pontuar!`,
      type: "info",
      actionUrl: "/rankings",
    });
    notifyUser(challenge.userId, { title: "📥 Nova Resposta de Desafio", content: `${studentFirstName} respondeu o desafio "${challenge.titulo}" — avalie para pontuar.`, url: "/rankings" }).catch(() => {});

    return { success: true };
  }),
});

/** Calcula o público de um desafio (alunos com conta vinculada para notificar). */
async function challengeAudience(db: any, challenge: any): Promise<{ studentUserIds: number[] }> {
  let studentIds: number[] = [];
  if (challenge.tipo === "batalha") {
    studentIds = [challenge.batalhaStudentA, challenge.batalhaStudentB].filter(Boolean);
  } else if (challenge.tipo === "turma" && challenge.turmaNome) {
    const rows = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.organizationId, challenge.organizationId), eq(students.status, 'ativo')));
    const all = rows.map((r: any) => r.id);
    const turmaMembers = await db.select({ studentId: lessons.studentId }).from(lessons)
      .where(and(eq(lessons.organizationId, challenge.organizationId), eq(lessons.lessonType, "turma"), eq(lessons.title, challenge.turmaNome)));
    const memberSet = new Set(turmaMembers.map((m: any) => m.studentId).filter(Boolean));
    studentIds = all.filter((id: number) => memberSet.has(id));
  } else if (challenge.rankingId) {
    const rows = await db.select({ studentId: rankingParticipants.studentId })
      .from(rankingParticipants).where(eq(rankingParticipants.rankingId, challenge.rankingId));
    studentIds = rows.map((r: any) => r.studentId);
  } else {
    const rows = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.organizationId, challenge.organizationId), eq(students.status, 'ativo')));
    studentIds = rows.map((r: any) => r.id);
  }
  if (studentIds.length === 0) return { studentUserIds: [] };
  const withAccount = await db.select({ id: students.id, studentUserId: students.studentUserId })
    .from(students)
    .where(and(inArray(students.id, studentIds), sql`${students.studentUserId} IS NOT NULL`));
  return { studentUserIds: withAccount.map((w: any) => w.studentUserId).filter(Boolean) };
}
