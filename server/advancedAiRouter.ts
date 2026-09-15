import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getSettingsByUserId } from "./db";
import {
  students,
  lessons,
  studentEvolution,
  studentTimeline,
  dailyStudyPlans,
  studentPedagogicalMemory,
  scheduleOptimizationLogs,
  studioRooms,
  professores,
  users,
  instruments
} from "../drizzle/schema";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { resolveAiCredentials } from "./utils/aiProvider";
import { callAiJson } from "./utils/aiJson";
import { buildPedagogicalMemoryPrompt, buildSmartSchedulePrompt, AI_PROMPT_VERSIONS } from "./utils/aiPrompts";

// Schemas zod dos contratos JSON (RF-003 — PRD_PROMPTS_IA_CONSOLIDADOS)
const pedagogicalMemorySchema = z.object({
  summary: z.string().default(""),
  strongPoints: z.array(z.string()).default([]),
  weakPoints: z.array(z.string()).default([]),
  repertoireMastered: z.array(z.string()).default([]),
  repertoireLearning: z.array(z.string()).default([]),
  nextLessonPlan: z.object({
    title: z.string().default(""),
    warmup: z.string().default(""),
    technicalFocus: z.string().default(""),
    repertoirePractice: z.string().default(""),
    homework: z.string().default(""),
  }).default({ title: "", warmup: "", technicalFocus: "", repertoirePractice: "", homework: "" }),
  pedagogicalDirectives: z.string().default(""),
});

const smartScheduleSchema = z.object({
  totalOptimized: z.number().default(0),
  conflictsResolved: z.number().default(0),
  recommendations: z.array(z.string()).default([]),
  optimizedLessons: z.array(z.object({
    lessonId: z.number(),
    studentName: z.string().default(""),
    originalScheduledAt: z.string().default(""),
    proposedScheduledAt: z.string(),
    proposedStudioRoomId: z.number().nullable().default(null),
    proposedStudioRoomName: z.string().default(""),
    reason: z.string().default(""),
  })).default([]),
});

export const advancedAiRouter = router({
  // ─── OPÇÃO 4: MEMÓRIA PEDAGÓGICA CONTÍNUA DO ALUNO ────────────────────────

  /**
   * Obtém a memória pedagógica contínua do aluno (pontos fortes, fracos, repertório e diretrizes).
   */
  getPedagogicalMemory: protectedProcedure
    .input(z.object({ studentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });
      const orgId = ctx.user.organizationId!;

      const memory = await db
        .select()
        .from(studentPedagogicalMemory)
        .where(and(eq(studentPedagogicalMemory.studentId, input.studentId), eq(studentPedagogicalMemory.organizationId, orgId)))
        .limit(1)
        .then((rows) => rows[0])
        .catch((err) => {
          console.warn("[getPedagogicalMemory] Falha ao consultar memória pedagógica:", err?.message || err);
          return null;
        });

      if (!memory) {
        return {
          studentId: input.studentId,
          strongPoints: [],
          weakPoints: [],
          repertoireMastered: [],
          repertoireLearning: [],
          pedagogicalDirectives: "Nenhuma análise prévia gerada. Clique em 'Analisar e Gerar Plano com IA' para compilar a memória histórica deste aluno.",
          lastAiAnalysisAt: null,
        };
      }

      let strongPoints: string[] = [];
      let weakPoints: string[] = [];
      let repertoireMastered: string[] = [];
      let repertoireLearning: string[] = [];

      try {
        strongPoints = JSON.parse(memory.strongPoints || "[]");
        weakPoints = JSON.parse(memory.weakPoints || "[]");
        repertoireMastered = JSON.parse(memory.repertoireMastered || "[]");
        repertoireLearning = JSON.parse(memory.repertoireLearning || "[]");
      } catch (parseErr) {
        console.warn("[getPedagogicalMemory] Erro ao parsear JSON da memória:", parseErr);
      }

      return {
        ...memory,
        strongPoints,
        weakPoints,
        repertoireMastered,
        repertoireLearning,
      };
    }),

  /**
   * Gera o Plano da Próxima Aula baseado nos últimos 6 meses de histórico e atualiza a Memória Pedagógica.
   */
  generateSmartLessonPlan: protectedProcedure
    .input(z.object({ studentId: z.number(), focusNotes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });
      const orgId = ctx.user.organizationId!;

      // 1. Buscar Dados do Aluno
      const [student] = await db
        .select()
        .from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
        .limit(1);

      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

      // 2. Buscar Histórico dos últimos 6 meses (Aulas, Evoluções e Timeline)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const recentLessons = await db
        .select({ title: lessons.title, notes: lessons.notes, rating: lessons.rating, scheduledAt: lessons.scheduledAt })
        .from(lessons)
        .where(and(eq(lessons.studentId, input.studentId), gte(lessons.scheduledAt, sixMonthsAgo)))
        .orderBy(desc(lessons.scheduledAt))
        .limit(15);

      const recentEvolutions = await db
        .select()
        .from(studentEvolution)
        .where(eq(studentEvolution.studentId, input.studentId))
        .orderBy(desc(studentEvolution.recordedAt))
        .limit(5);

      const timelineItems = await db
        .select({ title: studentTimeline.title, category: studentTimeline.category, description: studentTimeline.description })
        .from(studentTimeline)
        .where(eq(studentTimeline.studentId, input.studentId))
        .orderBy(desc(studentTimeline.achievedAt))
        .limit(10);

      // 3. Montar Prompt contextualizado (RF-001: builder central, copy fiel)
      const prompt = buildPedagogicalMemoryPrompt({
        studentName: student.name,
        studentLevel: student.level || "iniciante",
        teacherNotes: student.notes,
        focusNotes: input.focusNotes,
        recentLessonsLines: recentLessons.map(l => `- [${l.scheduledAt?.toISOString().slice(0, 10)}] ${l.title} (Nota: ${l.rating || 'N/A'}) | Obs: ${l.notes || 'Sem anotação'}`).join("\n"),
        recentEvolutionsLines: recentEvolutions.map(e => `- Técnica: ${e.technical}/10 | Ritmo: ${e.rhythm}/10 | Harmonia: ${e.harmony}/10 | Leitura: ${e.reading}/10`).join("\n"),
        timelineLines: timelineItems.map(t => `- [${t.category}] ${t.title}: ${t.description || ''}`).join("\n"),
      });

      const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
      const creds = resolveAiCredentials(settingsData);

      // RF-003: contrato JSON padronizado (JSON mode + zod + retry com budget)
      const parsed = await callAiJson({
        prompt,
        schema: pedagogicalMemorySchema,
        credentials: creds,
        feature: "memoria_pedagogica",
        promptVersion: AI_PROMPT_VERSIONS.memoriaPedagogica,
        organizationId: orgId,
        userId: ctx.user.id,
      });

      // 4. Salvar ou Atualizar na Memória Pedagógica Contínua
      const existingMem = await db
        .select({ id: studentPedagogicalMemory.id })
        .from(studentPedagogicalMemory)
        .where(eq(studentPedagogicalMemory.studentId, input.studentId))
        .limit(1);

      if (existingMem.length > 0) {
        await db
          .update(studentPedagogicalMemory)
          .set({
            strongPoints: JSON.stringify(parsed.strongPoints || []),
            weakPoints: JSON.stringify(parsed.weakPoints || []),
            repertoireMastered: JSON.stringify(parsed.repertoireMastered || []),
            repertoireLearning: JSON.stringify(parsed.repertoireLearning || []),
            pedagogicalDirectives: parsed.pedagogicalDirectives || "",
            lastAiAnalysisAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(studentPedagogicalMemory.id, existingMem[0].id));
      } else {
        await db.insert(studentPedagogicalMemory).values({
          organizationId: orgId,
          studentId: input.studentId,
          strongPoints: JSON.stringify(parsed.strongPoints || []),
          weakPoints: JSON.stringify(parsed.weakPoints || []),
          repertoireMastered: JSON.stringify(parsed.repertoireMastered || []),
          repertoireLearning: JSON.stringify(parsed.repertoireLearning || []),
          pedagogicalDirectives: parsed.pedagogicalDirectives || "",
          lastAiAnalysisAt: new Date(),
        });
      }

      return parsed;
    }),

  // ─── OPÇÃO 6: OTIMIZADOR AUTOMÁTICO DE GRADE & SALAS (SMART SCHEDULING) ───

  /**
   * Analisa conflitos e gera uma sugestão de grade otimizada usando IA.
   */
  generateSmartSchedule: protectedProcedure
    .input(
      z.object({
        targetDate: z.string(), // YYYY-MM-DD
        daysCount: z.number().default(7),
        preferences: z.string().optional(), // ex: "Evitar aulas de bateria após as 18h na Sala 1"
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });
      const orgId = ctx.user.organizationId!;

      // 1. Buscar Professores, Salas, Instrumentos e Alunos Ativos
      const activeStudents = await db
        .select({ id: students.id, name: students.name, level: students.level, instrumentId: students.instrumentId })
        .from(students)
        .where(and(eq(students.organizationId, orgId), eq(students.status, "ativo")));

      const rooms = await db
        .select({ id: studioRooms.id, name: studioRooms.name })
        .from(studioRooms)
        .where(and(eq(studioRooms.organizationId, orgId), eq(studioRooms.active, true)));

      const activeInstruments = await db
        .select({ id: instruments.id, name: instruments.name })
        .from(instruments)
        .where(eq(instruments.organizationId, orgId));

      const startDate = new Date(input.targetDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + input.daysCount);

      // Buscar aulas agendadas no período para ajustar
      const existingLessons = await db
        .select({
          id: lessons.id,
          title: lessons.title,
          studentId: lessons.studentId,
          scheduledAt: lessons.scheduledAt,
          duration: lessons.duration,
          studioRoomId: lessons.studioRoomId,
          instrumentId: lessons.instrumentId,
        })
        .from(lessons)
        .where(and(eq(lessons.organizationId, orgId), gte(lessons.scheduledAt, startDate), eq(lessons.status, "agendada")));

      // RF-008: cap de 300 aulas serializadas com aviso explícito
      const MAX_SCHEDULE_LESSONS = 300;
      const lessonsTruncated = existingLessons.length > MAX_SCHEDULE_LESSONS;
      const lessonsJson = JSON.stringify(existingLessons.slice(0, MAX_SCHEDULE_LESSONS));

      const prompt = buildSmartSchedulePrompt({
        targetDate: input.targetDate,
        daysCount: input.daysCount,
        roomsJson: JSON.stringify(rooms),
        instrumentsJson: JSON.stringify(activeInstruments),
        preferences: input.preferences,
        lessonsJson,
        lessonsTruncated,
      });

      const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
      const creds = resolveAiCredentials(settingsData);

      // RF-003: contrato JSON padronizado (JSON mode + zod + retry com budget)
      const parsed = await callAiJson({
        prompt,
        schema: smartScheduleSchema,
        credentials: creds,
        feature: "smart_schedule",
        promptVersion: AI_PROMPT_VERSIONS.smartSchedule,
        organizationId: orgId,
        userId: ctx.user.id,
      });

      // Registrar o log de otimização gerado no banco
      const [log] = await db
        .insert(scheduleOptimizationLogs)
        .values({
          organizationId: orgId,
          userId: ctx.user.id,
          inputConstraints: JSON.stringify({ targetDate: input.targetDate, daysCount: input.daysCount, preferences: input.preferences }),
          proposedSchedule: JSON.stringify(parsed),
          status: "pending",
        })
        .returning({ id: scheduleOptimizationLogs.id });

      return {
        logId: log.id,
        ...parsed,
      };
    }),

  /**
   * Aplica a grade otimizada aprovada pelo usuário no banco de dados.
   */
  applySmartSchedule: protectedProcedure
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database error" });
      const orgId = ctx.user.organizationId!;

      const [log] = await db
        .select()
        .from(scheduleOptimizationLogs)
        .where(and(eq(scheduleOptimizationLogs.id, input.logId), eq(scheduleOptimizationLogs.organizationId, orgId)))
        .limit(1);

      if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Registro de otimização não encontrado" });
      if (log.status === "applied") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta otimização já foi aplicada previamente" });

      const proposed = JSON.parse(log.proposedSchedule);
      const items = proposed.optimizedLessons || [];

      let updatedCount = 0;
      for (const item of items) {
        if (!item.lessonId) continue;
        await db
          .update(lessons)
          .set({
            scheduledAt: new Date(item.proposedScheduledAt),
            studioRoomId: item.proposedStudioRoomId || null,
            updatedAt: new Date(),
          })
          .where(and(eq(lessons.id, item.lessonId), eq(lessons.organizationId, orgId)));
        updatedCount++;
      }

      await db
        .update(scheduleOptimizationLogs)
        .set({ status: "applied", appliedAt: new Date() })
        .where(eq(scheduleOptimizationLogs.id, input.logId));

      return { success: true, updatedLessons: updatedCount };
    }),
});
