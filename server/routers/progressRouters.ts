import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { fcmRouter } from "../fcmRouter";
import { publicProcedure, protectedProcedure, professorProcedure, studentProcedure, router } from "../_core/trpc";
import { slotAdvanceRouter } from "../slotAdvanceRouter";
import {
  getDashboardStats,
  getMonthlyStats,
  getStudentsWithInstrument,
  getRecentLessons,
  getInstrumentsWithCount,
  getLessonsByDayOfWeek,
  getDb,
  getSettingsByUserId,
  upsertSettings,
  updateUserProfile,
  getExperimentalStats,
} from "../db";
import { organizations, users, students, lessons, instruments, reminders, reminderTemplates, paymentDues, asaasCustomers, settings, studentGoals, studentTimeline, studentFiles, announcements, chatMessages, rescheduleRequests, studentEvolution, aiConversations, aiMessages, aiDocuments, expenses, dailyStudyPlans, notifications, professores, professorPayments, attendanceTokens, attendanceLogs, contracts, fileComments, studioRooms, schoolIntegrations, contractTemplates, contractEvents, crmLeads, crmGoals, crmActivities, fiscalCompanies, fiscalInvoices, fiscalServices, fiscalJobs, fiscalLogs, aiPrompts, aiSpecialists } from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lt, lte, asc, ne, or, inArray, aliasedTable, ilike, isNull } from "drizzle-orm";
import { notifyOwner, notifyUser } from "../_core/notification";
import { handleDbError } from "../utils/error_handler";
import { TRPCError } from "@trpc/server";

import crypto from "crypto";
import { createAsaasCustomer, createAsaasCharge, deleteAsaasCharge, getAsaasPixQrCode } from "../utils/asaas";
import { buildUserContext } from "../utils/aiContext";
import { getSystemPrompt, buildLessonPlanPrompt, buildProgressInsightPrompt, buildNextTopicPrompt, buildPlanOutputSchema, buildGoalScopeRule, buildGoalScopeBlock, buildLevelLanguageRule, AI_PROMPT_VERSIONS } from "../utils/aiPrompts";
import { callGemini, genAI } from "../utils/gemini";
import { BillingEngine } from "../services/BillingEngine";
import { sendWhatsAppMessage, startWhatsAppSession, getWhatsAppSessionStatus, logoutWhatsAppSession } from "../utils/whatsapp";
import { nanoid } from "nanoid";
import { sdk } from "../_core/sdk";
import { sendVerificationEmail, sendSimpleEmail } from "../_core/email";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import { superAdminRouter } from "../superAdminRouter";
import { pairingActiveSessions } from "../automationJob";
import { checkFileMagicBytes } from "../utils/fileSecurity";
import { reportEngineRouter } from "../reportEngineRouter";
import { marketingRouter } from "../marketingRouter";
import { analyticsRouter } from "../analyticsRouter";
import { crmRouter } from "../crmRouter";
import { studioRoomsRouter } from "../studioRoomsRouter";
import { enrollmentRouter } from "../enrollmentRouter";
import { advancedAiRouter } from "../advancedAiRouter";
import { chatbotFlowRouter } from "../chatbotFlowRouter";
import { schoolAiRouter } from "../schoolAiRouter";
import { fiscalRouter } from "../fiscalRouter";
import { FiscalService } from "../services/fiscal/FiscalService";
import { loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract } from "./helpers";
import { getInstrumentContext } from "../utils/instrumentContexts";
import { resolveSpecialist, buildSpecialistPromptBlock, validatePlanText, validatePlanTextForInstrument, validateBeginnerLanguage, BEGINNER_JARGON_TERMS, getSpecialistById } from "../services/InstrumentSpecialistService";
import { buildCustomSpecialistPromptBlock } from "../services/CustomSpecialistService";
import { renderPromptVariables, defaultPromptVariables } from "../services/PromptVariables";
import { resolveAiCredentials } from "../utils/aiProvider";
import { studentPedagogicalMemory } from "../../drizzle/schema";
export const progressRouters = {
  progress: router({
    getGoals: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(studentGoals)
        .where(and(
          eq(studentGoals.organizationId, orgId),
          isUserAdmin ? undefined : eq(studentGoals.userId, ctx.user.id), 
          eq(studentGoals.studentId, input.studentId)
        ))
        .orderBy(asc(studentGoals.targetDate));
    }),
    createGoal: protectedProcedure.input(z.object({
      studentId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      targetDate: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      // Security: verify student ownership
      const [ownedStudent] = await db.select({ id: students.id }).from(students)
        .where(and(
          eq(students.id, input.studentId as number), 
          eq(students.organizationId, orgId), 
          isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ))
        .limit(1);
      
      if (!ownedStudent) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O aluno selecionado não existe ou não pertence ao seu perfil." });
      }

      await db.insert(studentGoals).values({
        organizationId: orgId,
        userId: ctx.user.id,
        studentId: input.studentId,
        title: input.title,
        description: input.description,
        targetDate: input.targetDate,
      });
      return { success: true };
    }),
    updateGoal: protectedProcedure.input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['pendente', 'concluida']).optional(),
      targetDate: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const { id, ...data } = input;
      const updateData: any = { ...data, updatedAt: new Date() };
      if (data.status === 'concluida') updateData.completedAt = new Date();
      else if (data.status === 'pendente') updateData.completedAt = null;
      await db.update(studentGoals).set(updateData).where(and(eq(studentGoals.id, id), eq(studentGoals.organizationId, orgId), eq(studentGoals.userId, ctx.user.id)));
      return { success: true };
    }),
    deleteGoal: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.delete(studentGoals).where(and(eq(studentGoals.id, input.id), eq(studentGoals.organizationId, orgId), eq(studentGoals.userId, ctx.user.id)));
      return { success: true };
    }),
    getTimeline: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(studentTimeline)
        .where(and(
          eq(studentTimeline.organizationId, orgId),
          isUserAdmin ? undefined : eq(studentTimeline.userId, ctx.user.id), 
          eq(studentTimeline.studentId, input.studentId)
        ))
        .orderBy(desc(studentTimeline.achievedAt));
    }),
    createTimelineEvent: protectedProcedure.input(z.object({
      studentId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      category: z.enum(['tecnica', 'teoria', 'repertorio', 'geral']).default('geral'),
      grade: z.string().optional(),
      achievedAt: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      // Security: verify student ownership
      const [ownedStudent] = await db.select({ id: students.id }).from(students)
        .where(and(
          eq(students.id, input.studentId as number), 
          eq(students.organizationId, orgId), 
          isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ))
        .limit(1);
      
      if (!ownedStudent) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O aluno selecionado não existe ou não pertence ao seu perfil." });
      }

      await db.insert(studentTimeline).values({
        organizationId: orgId,
        userId: ctx.user.id,
        studentId: input.studentId,
        title: input.title,
        description: input.description,
        category: input.category,
        grade: input.grade,
        achievedAt: new Date(input.achievedAt),
      });
      return { success: true };
    }),
    updateTimelineEvent: protectedProcedure.input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(['tecnica', 'teoria', 'repertorio', 'geral']).optional(),
      grade: z.string().optional(),
      achievedAt: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.achievedAt) updateData.achievedAt = new Date(data.achievedAt);
      await db.update(studentTimeline).set(updateData).where(and(eq(studentTimeline.id, id), eq(studentTimeline.organizationId, orgId), eq(studentTimeline.userId, ctx.user.id)));
      return { success: true };
    }),
    deleteTimelineEvent: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      await db.delete(studentTimeline).where(and(eq(studentTimeline.id, input.id), eq(studentTimeline.organizationId, orgId), eq(studentTimeline.userId, ctx.user.id)));
      return { success: true };
    }),
    getSummary: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const timelineEvents = await db.select().from(studentTimeline).where(and(eq(studentTimeline.studentId, input.studentId), eq(studentTimeline.userId, ctx.user.id)));
      const studentLessons = await db.select().from(lessons).where(and(eq(lessons.studentId, input.studentId as number), eq(lessons.userId, ctx.user.id)));
      
      const grades = timelineEvents.map(e => e.grade).filter(g => g !== null).map(Number);
      const averageGrade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
      
      const completedLessons = studentLessons.filter(l => l.status === 'concluida');
      const missedLessons = studentLessons.filter(l => l.status === 'falta');
      
      const frequency = (completedLessons.length + missedLessons.length) > 0 
        ? (completedLessons.length / (completedLessons.length + missedLessons.length)) * 100 
        : 100;
        
      const totalTimeMinutes = completedLessons.reduce((acc, lesson) => acc + (lesson.duration || 60), 0);
        
      return {
        averageGrade: Number(averageGrade.toFixed(1)),
        completedCount: completedLessons.length,
        frequency: Math.round(frequency),
        totalTimeMinutes,
        lastLesson: completedLessons.length > 0 ? completedLessons.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0].scheduledAt : null
      };
    }),
    generateAIInsight: protectedProcedure.input(z.object({ studentId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId as number), eq(students.organizationId, orgId)));
      if (!student) throw new Error("Aluno não encontrado");
      const pastLessons = await db.select().from(lessons).where(and(eq(lessons.studentId, input.studentId as number), eq(lessons.organizationId, orgId), eq(lessons.status, 'concluida'))).limit(10).orderBy(desc(lessons.scheduledAt));
      const goals = await db.select().from(studentGoals).where(and(eq(studentGoals.studentId, input.studentId), eq(studentGoals.organizationId, orgId)));
      
      // ── Especialista (RF-006) — RF-001/RF-011 (PRD_PROMPTS_IA_CONSOLIDADOS) ──
      let specialistBlock = "";
      let instrumentNameForValidation: string | null = null;
      let instrumentCategoryForValidation: string = "geral";
      if (student.instrumentId) {
        try {
          const [instr] = await db.select({ name: instruments.name, category: instruments.category }).from(instruments).where(eq(instruments.id, student.instrumentId)).limit(1);
          if (instr) {
            instrumentNameForValidation = instr.name;
            instrumentCategoryForValidation = instr.category || "geral";
            const sp = resolveSpecialist(instr.name, instr.category || "geral");
            specialistBlock = `\n[ESPECIALISTA: ${sp.displayName} (${sp.id}) — Terminologia: ${sp.terminology.slice(0,6).join(", ")} | PROIBIDO: ${sp.forbiddenTerms.slice(0,5).join(", ")}]\nGlossário: ${Object.entries(sp.glossary).map(([k,v])=>`${k}=${v.slice(0,80)}`).join(" | ")}\n`;
          }
        } catch (specErr: any) {
          console.warn("[generateAIInsight] Falha não impeditiva ao montar bloco de especialista:", specErr?.message || specErr);
        }
      }
      const prompt = buildProgressInsightPrompt({
        specialistBlock,
        studentName: student.name,
        studentLevel: student.level,
        pastLessonsCount: pastLessons.length,
        goalsCount: goals.length,
      });
      
      try {
        const { callGemini } = await import("../utils/gemini");
        const { getSettingsByUserId } = await import("../db");
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        const creds = resolveAiCredentials(settingsData);
        const apiKey = creds.apiKey;
        const model = creds.model;
        
        const responseText = await callGemini([{ role: 'user', content: prompt }], undefined, false, apiKey, model, 0.5, {
          organizationId: orgId,
          userId: ctx.user.id,
          feature: "insight_progresso",
          promptVersion: AI_PROMPT_VERSIONS.insightProgresso,
        });

        // RF-006: validação de terminologia apenas como aviso (não bloqueante — texto livre)
        if (instrumentNameForValidation) {
          try {
            const validation = validatePlanTextForInstrument(responseText, instrumentNameForValidation, instrumentCategoryForValidation);
            if (!validation.passed) {
              console.warn("[generateAIInsight] Aviso de terminologia (não bloqueante):", validation.found.slice(0, 3));
            }
          } catch (valErr: any) {
            console.warn("[generateAIInsight] Falha não impeditiva na validação de terminologia:", valErr?.message || valErr);
          }
        }

        return { insight: responseText.trim(), source: "ai" as const };
      } catch (e) {
        console.error("Erro ao gerar insight:", e);
        // RF-011: fallback honesto — o client indica que o texto NÃO veio da IA
        return { insight: "O aluno tem se saído bem nas últimas aulas. Foco em melhorar a constância na prática diária e avançar nas metas de repertório.", source: "fallback" as const }; // Fallback
      }
    }),
    suggestNextLessonTopic: protectedProcedure.input(z.object({ studentId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      
      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      if (!student) throw new Error("Aluno não encontrado");
      
      const pastLessons = await db.select().from(lessons).where(and(eq(lessons.studentId, input.studentId), eq(lessons.organizationId, orgId), eq(lessons.status, 'concluida'))).limit(5).orderBy(desc(lessons.scheduledAt));
      const goals = await db.select().from(studentGoals).where(and(eq(studentGoals.studentId, input.studentId), eq(studentGoals.organizationId, orgId)));
      const timeline = await db.select().from(studentTimeline).where(and(eq(studentTimeline.studentId, input.studentId), eq(studentTimeline.organizationId, orgId))).limit(10).orderBy(desc(studentTimeline.achievedAt));

      const timelineText = timeline.map(t => "[" + t.category + "] " + t.title + " - " + t.description).join(" | ");

      let specialistBlock = "";
      let instrumentNameForValidation: string | null = null;
      let instrumentCategoryForValidation: string = "geral";
      if (student.instrumentId) {
        try {
          const [instr] = await db.select({ name: instruments.name, category: instruments.category }).from(instruments).where(eq(instruments.id, student.instrumentId)).limit(1);
          if (instr) {
            instrumentNameForValidation = instr.name;
            instrumentCategoryForValidation = instr.category || "geral";
            const sp = resolveSpecialist(instr.name, instr.category || "geral");
            specialistBlock = `\n[ESPECIALISTA: ${sp.displayName} (${sp.id}) — Respeite terminologia de ${sp.displayName}. PROIBIDO: ${sp.forbiddenTerms.slice(0,5).join(", ")}]\n`;
          }
        } catch (specErr: any) {
          console.warn("[suggestNextLessonTopic] Falha não impeditiva ao montar bloco de especialista:", specErr?.message || specErr);
        }
      }
      const prompt = buildNextTopicPrompt({
        specialistBlock,
        studentName: student.name,
        studentLevel: student.level,
        pastLessonsCount: pastLessons.length,
        goalsTitles: goals.map(g => g.title),
        timelineText,
      });
      
      try {
        const { callGemini } = await import("../utils/gemini");
        const { getSettingsByUserId } = await import("../db");
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        const creds = resolveAiCredentials(settingsData);
        const apiKey = creds.apiKey;
        const model = creds.model;
        const responseText = await callGemini([{ role: 'user', content: prompt }], undefined, false, apiKey, model, 0.5, {
          organizationId: orgId,
          userId: ctx.user.id,
          feature: "proximo_topico",
          promptVersion: AI_PROMPT_VERSIONS.proximoTopico,
        });

        // RF-006: validação de terminologia apenas como aviso (não bloqueante)
        if (instrumentNameForValidation) {
          try {
            const validation = validatePlanTextForInstrument(responseText, instrumentNameForValidation, instrumentCategoryForValidation);
            if (!validation.passed) {
              console.warn("[suggestNextLessonTopic] Aviso de terminologia (não bloqueante):", validation.found.slice(0, 3));
            }
          } catch (valErr: any) {
            console.warn("[suggestNextLessonTopic] Falha não impeditiva na validação de terminologia:", valErr?.message || valErr);
          }
        }

        return { suggestion: responseText.trim() };
      } catch (e: any) {
        throw new Error("Erro ao sugerir tópico com a IA: " + e.message);
      }
    }),

    uploadMethodologyPdf: protectedProcedure.input(z.object({
      studentId: z.number(),
      filename: z.string(),
      pdfBase64: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      
      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      if (!student) throw new Error("Aluno não encontrado");

      try {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const buffer = Buffer.from(input.pdfBase64.replace(/^data:application\/pdf;base64,/, ""), 'base64');
        const data = await pdfParse(buffer);
        
        await db.update(students).set({
          methodologyFilename: input.filename,
          methodologyText: data.text
        }).where(eq(students.id, student.id));

        return { success: true };
      } catch (e: any) {
        throw new Error("Erro ao processar PDF: " + e.message);
      }
    }),

    removeMethodology: protectedProcedure.input(z.object({
      studentId: z.number()
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return;
      const orgId = ctx.user.organizationId!;
      await db.update(students).set({
        methodologyFilename: null,
        methodologyText: null
      }).where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      return { success: true };
    }),

    generateNextLessonPlan: protectedProcedure.input(z.object({ studentId: z.number(), topic: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      
      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      if (!student) throw new Error("Aluno não encontrado");
      
      const pastLessons = await db.select().from(lessons).where(and(eq(lessons.studentId, input.studentId), eq(lessons.organizationId, orgId), eq(lessons.status, 'concluida'))).limit(5).orderBy(desc(lessons.scheduledAt));
      const goals = await db.select().from(studentGoals).where(and(eq(studentGoals.studentId, input.studentId), eq(studentGoals.organizationId, orgId)));
      const timeline = await db.select().from(studentTimeline).where(and(eq(studentTimeline.studentId, input.studentId), eq(studentTimeline.organizationId, orgId))).limit(10).orderBy(desc(studentTimeline.achievedAt));

      const timelineText = timeline.map(t => "[" + t.category + "] " + t.title + " - " + t.description).join(" | ");

      let specialistBlock2 = "";
      let instrumentNameForValidation: string | null = null;
      let instrumentCategoryForValidation: string = "geral";
      if (student.instrumentId) {
        try {
          const [instr2] = await db.select({ name: instruments.name, category: instruments.category }).from(instruments).where(eq(instruments.id, student.instrumentId)).limit(1);
          if (instr2) {
            instrumentNameForValidation = instr2.name;
            instrumentCategoryForValidation = instr2.category || "geral";
            const sp2 = resolveSpecialist(instr2.name, instr2.category || "geral");
            specialistBlock2 = `\n[ESPECIALISTA: ${sp2.displayName} (${sp2.id})]\n${sp2.systemPrompt}\nGlossário: ${Object.entries(sp2.glossary).map(([k,v])=>`${k}=${v.slice(0,80)}`).join(" | ")}\nPROIBIDO: ${sp2.forbiddenTerms.slice(0,6).join(", ")}\nTerminologia correta: ${sp2.terminology.slice(0,8).join(", ")}\n`;
          }
        } catch (specErr: any) {
          console.warn("[generateNextLessonPlan] Falha não impeditiva ao montar bloco de especialista:", specErr?.message || specErr);
        }
      }
      // RF-005 (PRD): builder central corrige duplicação da instrução "Decida o próximo
      // assunto" e injeta a data de hoje; demais seções em copy fiel.
      const prompt = buildLessonPlanPrompt({
        specialistBlock: specialistBlock2,
        studentName: student.name,
        studentLevel: student.level,
        methodologyText: student.methodologyText,
        pastLessonsCount: pastLessons.length,
        goalsTitles: goals.map(g => g.title),
        timelineText,
        topic: input.topic,
      });
      
      try {
        const { callGemini } = await import("../utils/gemini");
        const { getSettingsByUserId } = await import("../db");
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        const creds = resolveAiCredentials(settingsData);
        const apiKey = creds.apiKey;
        const model = creds.model;
        let responseText = await callGemini([{ role: 'user', content: prompt }], undefined, false, apiKey, model, 0.5, {
          organizationId: orgId,
          userId: ctx.user.id,
          feature: "plano_aula",
          promptVersion: AI_PROMPT_VERSIONS.planoAula,
        });

        // RF-006 (PRD): validação de contaminação de terminologia com 1 retry
        if (instrumentNameForValidation) {
          try {
            const validation = validatePlanTextForInstrument(responseText, instrumentNameForValidation, instrumentCategoryForValidation);
            if (!validation.passed) {
              console.warn("[generateNextLessonPlan] Contaminação detectada, retry com instrução reforçada:", validation.found.slice(0, 3));
              const retryPrompt = `${prompt}\n\nATENÇÃO: A tentativa anterior usou termos de OUTRO instrumento (${validation.found.slice(0,3).join(", ")}). Reescreva o plano completo usando APENAS terminologia de ${instrumentNameForValidation}.`;
              responseText = await callGemini([{ role: 'user', content: retryPrompt }], undefined, false, apiKey, model, 0.5, {
                organizationId: orgId,
                userId: ctx.user.id,
                feature: "plano_aula_retry",
                promptVersion: AI_PROMPT_VERSIONS.planoAula,
              });
              const revalidation = validatePlanTextForInstrument(responseText, instrumentNameForValidation, instrumentCategoryForValidation);
              if (!revalidation.passed) {
                throw new Error(`O plano gerado conteve termos de outro instrumento (${revalidation.found.slice(0,3).join(", ")}). Gere novamente.`);
              }
            }
          } catch (valErr: any) {
            if (valErr instanceof Error && valErr.message.includes("termos de outro instrumento")) throw valErr;
            console.warn("[generateNextLessonPlan] Falha não impeditiva na validação de terminologia:", valErr?.message || valErr);
          }
        }

        return { plan: responseText };
      } catch (e: any) {
        throw new Error("Erro ao gerar plano de aula com a IA: " + e.message);
      }
    }),

    generateDailyStudyPlan: protectedProcedure.input(z.object({
      studentId: z.number(),
      targetMinutes: z.number().min(10).max(120).optional().default(30),
      teacherNotes: z.string().max(500).optional(),
      planMode: z.enum(["direto", "didatico", "desafio"]).optional().default("direto"),
      // Duração da série em dias (PRD: 5, 10 ou 15)
      daysCount: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional().default(5),
      // 2 opções de escopo: "somente_metas" (estrito, padrão) | "metas_complementares" (metas + assuntos na mesma linha)
      goalScope: z.enum(["somente_metas", "metas_complementares"]).optional().default("somente_metas"),
      // PRD 02 — especialista escolhido pelo professor na etapa de seleção.
      // Formato: "builtin:<chave>" (especialista padrão) | "custom:<id>" (personalizado da escola) | ausente (auto por instrumento)
      specialistRef: z.string().max(80).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const totalMinutes = input.targetMinutes ?? 30;
      const planMode = input.planMode || "direto";
      const goalScope = input.goalScope || "somente_metas";
      const daysCount = input.daysCount ?? 5;
      const goalScopeRule = buildGoalScopeRule(goalScope);
      const goalScopeBlock = buildGoalScopeBlock(goalScope);

      // ── 1. BUSCA DO ALUNO (com isolamento por organização) ──────────────────
      const [student] = await db
        .select()
        .from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado ou sem permissão de acesso." });
      }

      // ── 2. BUSCA DO INSTRUMENTO ──────────────────────────────────────────────
      let instrumentName = "instrumento não especificado";
      let instrumentCategory = "geral";
      if (student.instrumentId) {
        const [instrument] = await db
          .select({ name: instruments.name, category: instruments.category })
          .from(instruments)
          .where(eq(instruments.id, student.instrumentId));
        if (instrument) {
          instrumentName = instrument.name;
          instrumentCategory = (instrument.category || "geral").toLowerCase();
        }
      }

      // ── 3. CONTEXTO PEDAGÓGICO DO INSTRUMENTO — IA ESPECIALISTA (RF-001/RF-002/RF-003) ──
      // PRD 02 §23: o professor escolhe o especialista responsável pelo plano.
      // Token control (§27): APENAS o especialista selecionado entra no prompt.
      let specialist = resolveSpecialist(instrumentName, instrumentCategory);
      let customSpecialistRow: typeof aiSpecialists.$inferSelect | null = null;
      if (input.specialistRef?.startsWith("custom:")) {
        const customId = Number(input.specialistRef.slice("custom:".length));
        if (Number.isInteger(customId) && customId > 0) {
          const [row] = await db
            .select()
            .from(aiSpecialists)
            .where(and(eq(aiSpecialists.id, customId), eq(aiSpecialists.organizationId, orgId)))
            .limit(1);
          if (row) {
            if (row.active === false) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Este especialista personalizado está inativo." });
            }
            customSpecialistRow = row;
            // Base "geral": sem termos proibidos cruzados (o especialista personalizado define o seu escopo)
            specialist = { ...getSpecialistById("geral"), id: "geral" as const, displayName: row.name };
          }
        }
      } else if (input.specialistRef?.startsWith("builtin:")) {
        const builtinKey = input.specialistRef.slice("builtin:".length);
        specialist = getSpecialistById(builtinKey as Parameters<typeof getSpecialistById>[0]);
      }
      const instrContext = specialist; // compat: specialist estende InstrumentContext
      let specialistPromptBlock = customSpecialistRow
        ? buildCustomSpecialistPromptBlock(customSpecialistRow)
        : buildSpecialistPromptBlock(specialist, planMode as any);

      // PRD 02 §28/§33 — Prompt gerenciado (versionado) da escola sobrescreve o bloco do especialista
      try {
        const [managedPrompt] = await db
          .select()
          .from(aiPrompts)
          .where(
            and(
              eq(aiPrompts.organizationId, orgId),
              eq(aiPrompts.active, true),
              eq(aiPrompts.type, "especialista"),
              customSpecialistRow
                ? eq(aiPrompts.specialistId, customSpecialistRow.id)
                : eq(aiPrompts.specialistKey, specialist.id)
            )
          )
          .limit(1);
        if (managedPrompt) {
          const settingsForVars = await getSettingsByUserId(orgId, ctx.user.id);
          specialistPromptBlock = renderPromptVariables(
            managedPrompt.content,
            defaultPromptVariables({
              alunoInstrumento: instrumentName,
              alunoNivel: (student.level as string) || "iniciante",
              professorNome: ctx.user.name || undefined,
              escolaNome: (settingsForVars as any)?.schoolName || undefined,
            })
          );
        }
      } catch (managedErr) {
        console.warn("[generateDailyStudyPlan] Falha não impeditiva ao carregar prompt gerenciado:", managedErr);
      }

      const studentLevel = student.level || "iniciante";
      const levelKey = ((studentLevel as string) === "avancado" || (studentLevel as string) === "avançado")
        ? "avancado"
        : ((studentLevel as string) === "intermediario" || (studentLevel as string) === "intermediário")
          ? "intermediario"
          : "iniciante";

      const levelHint = instrContext.levelHints[levelKey];
      const terminologyBlock = instrContext.terminology.length > 0
        ? `Termos CORRETOS para este instrumento: ${instrContext.terminology.join(", ")}.`
        : "";
      const forbiddenBlock = instrContext.forbiddenTerms.length > 0
        ? `PROIBIDO usar estes termos (são de outros instrumentos): ${instrContext.forbiddenTerms.join(", ")}.`
        : "";

      // ── 4. BUSCA PARALELA DE DADOS DE CONTEXTO ──────────────────────────────
      const [pastLessons, goals, timeline, pedagogicalMemoryRows] = await Promise.all([
        db.select({
          title: lessons.title,
          notes: lessons.notes,
          rating: lessons.rating,
          scheduledAt: lessons.scheduledAt,
        })
          .from(lessons)
          .where(and(
            eq(lessons.studentId, input.studentId),
            eq(lessons.organizationId, orgId),
            eq(lessons.status, "concluida")
          ))
          .orderBy(desc(lessons.scheduledAt))
          .limit(5), // RF-004 (PRD_OTIMIZACAO_PLANO_DIARIO): 10 → 5

        db.select()
          .from(studentGoals)
          .where(and(
            eq(studentGoals.studentId, input.studentId),
            eq(studentGoals.organizationId, orgId),
            eq(studentGoals.status, "pendente")
          )),

        db.select({
          title: studentTimeline.title,
          category: studentTimeline.category,
          description: studentTimeline.description,
          grade: studentTimeline.grade,
        })
          .from(studentTimeline)
          .where(and(
            eq(studentTimeline.studentId, input.studentId),
            eq(studentTimeline.organizationId, orgId)
          ))
          .orderBy(desc(studentTimeline.achievedAt))
          .limit(5), // RF-004: 10 → 5

        db.select()
          .from(studentPedagogicalMemory)
          .where(and(
            eq(studentPedagogicalMemory.studentId, input.studentId),
            eq(studentPedagogicalMemory.organizationId, orgId)
          ))
          .limit(1)
          .catch((err) => {
            console.warn("[generateDailyStudyPlan] Falha não impeditiva ao consultar studentPedagogicalMemory:", err?.message || err);
            return [];
          }),
      ]);

      // ── 5. FORMATAÇÃO DOS DADOS DE CONTEXTO ─────────────────────────────────
      const hasGoals = goals.length > 0;
      const weeklyGoalsText = hasGoals
        ? goals.map((g, idx) => `[META ${idx + 1}] ${g.title}${g.description ? `\n   Descrição/Detalhes da meta: ${g.description}` : ""}`).join("\n")
        : "⚠️ NENHUMA META CADASTRADA. Use SOMENTE a OBSERVAÇÃO DO PROFESSOR (abaixo) como roteiro. Se ela também estiver vazia, limite-se ao essencial do instrumento e nível, sem introduzir repertório, música ou técnica não solicitada.";

      const lessonsText = pastLessons.length > 0
        ? pastLessons.map(l =>
            `- "${l.title}"` +
            (l.rating ? ` (nota: ${l.rating}/5)` : "") +
            (l.notes ? ` | obs: ${l.notes}` : "")
          ).join("\n")
        : "Nenhuma aula concluída registrada ainda.";

      const timelineText = timeline.length > 0
        ? timeline.map(t =>
            `[${t.category}] ${t.title}` +
            (t.grade ? ` (nota: ${t.grade})` : "") +
            (t.description ? ` — ${t.description}` : "")
          ).join("\n")
        : "Nenhum registro de conquistas anteriores.";

      let pedagogicalMemoryBlock = "";
      const mem = pedagogicalMemoryRows[0];
      if (mem) {
        let strongPoints: string[] = [];
        let weakPoints: string[] = [];
        let repertoireLearning: string[] = [];
        try {
          strongPoints = JSON.parse(mem.strongPoints || "[]") as string[];
          weakPoints = JSON.parse(mem.weakPoints || "[]") as string[];
          repertoireLearning = JSON.parse(mem.repertoireLearning || "[]") as string[];
        } catch (parseErr) {
          console.warn("[generateDailyStudyPlan] Erro ao parsear JSON da memória pedagógica:", parseErr);
        }

        if (strongPoints.length > 0 || weakPoints.length > 0 || repertoireLearning.length > 0) {
          // RF-004 (PRD_OTIMIZACAO_PLANO_DIARIO): listas truncadas a 5 itens
          pedagogicalMemoryBlock = `
# 🧠 MEMÓRIA PEDAGÓGICA (Ajuste a dificuldade técnica da meta)
- Pontos fortes: ${strongPoints.slice(0, 5).length > 0 ? strongPoints.slice(0, 5).join(", ") : "Não identificados"}
- Dificuldades recorrentes: ${weakPoints.slice(0, 5).length > 0 ? weakPoints.slice(0, 5).join(", ") : "Não identificadas"}
- Repertório em aprendizado: ${repertoireLearning.slice(0, 5).length > 0 ? repertoireLearning.slice(0, 5).join(", ") : "Nenhum registrado"}
${mem.pedagogicalDirectives ? `- Diretriz pedagógica: ${mem.pedagogicalDirectives}` : ""}
`;
        }
      }

      const instrumentWarning = !student.instrumentId
        ? "\n⚠️ ATENÇÃO: Instrumento não cadastrado no perfil. Crie um plano genérico de desenvolvimento musical.\n"
        : "";
      const goalsWarning = !hasGoals
        ? "\n⚠️ ATENÇÃO: Nenhuma meta cadastrada. No campo 'importantMessage', oriente o professor a cadastrar as metas do aluno na aba Progresso.\n"
        : "";
      const teacherNotesBlock = input.teacherNotes
        ? `\n# 📝 ROTEIRO / OBSERVAÇÃO DO PROFESSOR (FONTE PRINCIPAL DO CONTEÚDO)\n"${input.teacherNotes.substring(0, 500)}"\n`
        : "";

      // ── 6. CÁLCULO DOS BLOCOS DE TEMPO (6 BLOCOS — PRD RF-013) ─────────────
      // Progressão: Revisão → Aquecimento → Técnica → Conceito → Aplicação → Desafio
      const revisaoMin  = Math.max(1, Math.round(totalMinutes * 0.10));
      const warmMin     = Math.max(2, Math.round(totalMinutes * 0.15));
      const tecnicaMin  = Math.max(3, Math.round(totalMinutes * 0.30));
      const conceitoMin = Math.max(2, Math.round(totalMinutes * 0.15));
      const aplicacaoMin = Math.max(2, Math.round(totalMinutes * 0.20));
      const desafioMin  = Math.max(1, Math.round(totalMinutes * 0.10));
      // Garante que a soma fecha exatamente em totalMinutes
      const sumBlocks = revisaoMin + warmMin + tecnicaMin + conceitoMin + aplicacaoMin + desafioMin;
      const adjustedTecnicaMin = tecnicaMin + (totalMinutes - sumBlocks); // absorve arredondamentos


      // ── 7. DEFINIÇÃO DO ESTILO POR MODO (3 MODOS) ──────────────────────────
      let modeInstruction = "";
      if (planMode === "didatico") {
        modeInstruction = `
# 📖 MODO ESCOLHIDO: DIDÁTICO & DETALHADO (PASSO A PASSO GUIADO)
- ESTILO: Professor particular atencioso e detalhista na postura, curvatura dos dedos e anatomia dos movimentos.
- Formato: Explique o "como fazer" e o "porquê" de cada movimento.
- Pontos da Prática Principal:
  * Ponto 1: Posição detalhada, alinhamento de pulsos/ombros e apoio do instrumento.
  * Ponto 2: Teste de clareza sonora tecla/corda por tecla e o que escutar.
  * Ponto 3: Correção de erro comum (como evitar som abafado ou tensão nos tendões).
- Desafio: Teste de precisão técnica e postura relaxada.`;
      } else if (planMode === "desafio") {
        modeInstruction = `
# 🎸 MODO ESCOLHIDO: DESAFIO & RITMO (LEVADAS E PERFORMANCE)
- ESTILO: Dinâmico, enérgico, focado em levadas rítmicas reais e treinos de velocidade e resistência.
- Formato: Foco em grooves e padrões rítmicos.
- Pontos da Prática Principal:
  * Ponto 1: Levada rítmica aplicada (Pop 4/4, Balada 6/8, Dedilhado ou Batida) sobre a meta.
  * Ponto 2: Treino de troca com aceleração gradual de BPM (ex: começar a 50 BPM, subir para 70 BPM e finalizar a 85 BPM).
  * Ponto 3: Independência e dinâmica (ex: baixo sustentado na esquerda + levada rítmica na direita).
- Desafio: Tocar a sequência em loop por múltiplos compassos sem interrupções.`;
      } else {
        // Modo Padrão: "direto"
        modeInstruction = `
# ⚡ MODO ESCOLHIDO: DIRETO & PRÁTICO (CHECKLIST RÁPIDO - PADRÃO)
- ESTILO: Frases curtas de 1 linha (máximo 12 a 15 palavras por ponto).
- ZERO PARÁGRAFOS OU EXPLICAÇÕES TEÓRICAS LONGAS. Formato de comandos diretos e objetivos.
- Os 3 pontos detalham o MESMO conteúdo do roteiro — não introduzem assunto novo.
- Pontos da Prática Principal:
  * Ponto 1: Ação objetiva sobre o material do roteiro (ex.: posição/dedos do acorde citado).
  * Ponto 2: Repetição de um trecho do roteiro com alvo claro (ex.: "Repita a troca 10 vezes devagar."). Metrônomo/BPM SÓ se o roteiro pedir.
  * Ponto 3: Detalhe de execução/limpeza do próprio roteiro (ex.: "Confira se todas as cordas soam limpas.").
- Desafio: 1 frase curta com meta mensurável sobre o roteiro (ex.: "Toque a sequência inteira sem parar.").`;
      }

      // ── 8. JSON SCHEMA DE SAÍDA — COMPACTO (PRD_OTIMIZACAO_PLANO_DIARIO RF-003) ──
      const jsonSchemaFormat = buildPlanOutputSchema({
        totalMinutes,
        daysCount,
        durations: {
          revisao: revisaoMin,
          warm: warmMin,
          tecnica: adjustedTecnicaMin,
          conceito: conceitoMin,
          aplicacao: aplicacaoMin,
          desafio: desafioMin,
        },
      });

      // ── 10. CONSTRUÇÃO DO PROMPT — STATIC-FIRST (PRD_OTIMIZACAO_PLANO_DIARIO RF-006) ──
      // Blocos estáticos primeiro (cacheáveis), dados dinâmicos do aluno por último.
      // RF-005: bloco fixo de técnica só quando NÃO há especialista mapeado.
      const levelLanguageRule = buildLevelLanguageRule(studentLevel);
      const techniqueRulesBlock = specialist.id === "geral" ? `
### REGRAS DE TÉCNICA POR MODALIDADE (DANÇA):
- **Ballet:** alinhamento, en dehors, barra/centro, equilíbrio e preparação de giro. NUNCA sugerir pontas sem avaliação física.
- **Jazz:** isolamentos, deslocamentos, giros e interpretação com dinâmica.
- **Urbanas:** fundamentos (bounce, rock, groove), footwork e musicalidade. Power moves só para avançados e com colchão.
- **Salão:** condução clara, passo básico e tempo forte correto; nunca puxar o par.
- **Sapateado:** clareza de som antes de velocidade; aquecer tornozelos.
- **Contemporâneo:** peso, respiração, níveis e queda controlada com colchão.
- **Kids:** lúdico, blocos curtos, coordenação — nunca alongamento passivo forçado.
- **Fitness:** progressão de intensidade, versão sem impacto para iniciantes.
` : "";

      const prompt = `# 💃 DancePro AI — Treino de ${instrumentName.toUpperCase()}

Você é um professor especialista em **${instrumentName}** (nível: **${studentLevel}**) — Especialista: ${specialist.displayName} (${specialist.id}).
Sua missão é criar uma rotina de treino diário de ${daysCount} dias focada **EXCLUSIVAMENTE no ROTEIRO DO PROFESSOR** (metas + observação, seção DADOS DO ALUNO no final).

# 🎯 FIO CONDUTOR ÚNICO (REGRA MÁXIMA — ANTI-CONTEÚDO ALEATÓRIO)
- O plano inteiro nasce SOMENTE do que o professor pediu: as METAS CADASTRADAS e a OBSERVAÇÃO DO PROFESSOR (se houver). Trate isso como um ROTEIRO FECHADO.
- Se o professor citou uma coreografia, uma sequência de passos, uma música/trilha ou um objetivo específico, use EXATAMENTE esses — repita-os literalmente em todos os dias.
- Os 6 blocos do dia NÃO são temas diferentes: são FATIAS DE TEMPO do MESMO conteúdo do roteiro. Ex.: Revisão = rever o material citado; Aquecimento = preparar o corpo para o material; Técnica = aperfeiçoar o detalhe citado; Musicalidade = entender tempo/contagem e expressão do material; Aplicação = executar o material; Desafio = executar com um critério mensurável.
- PROIBIDO introduzir assunto que o professor NÃO pediu: outra coreografia, outra música, passos de outra modalidade, técnica não mencionada e aquecimentos genéricos desconectados.
- Na dúvida, REPITA e APROFUNDE o conteúdo pedido em vez de inventar conteúdo novo.
---
${modeInstruction}
---
${specialistPromptBlock}

# 💃 DIRETRIZES TÉCNICAS PARA: ${instrumentName.toUpperCase()}
${terminologyBlock}
${forbiddenBlock}

# 🧠 Dica de Nível (${studentLevel}): ${levelHint}
${levelLanguageRule}${techniqueRulesBlock}---

# 📈 PROGRESSÃO DOS ${daysCount} DIAS (SOBRE O MESMO ROTEIRO — NUNCA TROCA DE TEMA):
Cada dia aprofunda o MESMO conteúdo do roteiro, evoluindo apenas a execução:
- **Dia 1:** Entender o material e executá-lo devagar, com atenção (ex.: passos marcados, contagem em voz alta).
- **Dia 2:** Isolar a maior dificuldade do roteiro (ex.: a transição entre dois passos) e repetir.
- **Dia 3:** Juntar o roteiro completo (ex.: a sequência inteira) mantendo a qualidade.
- **Dia 4:** Ganhar fluidez/velocidade no roteiro sem perder a limpeza e a musicalidade.
- **Dia 5:** Executar o roteiro de ponta a ponta como se fosse a apresentação, sem parar.
- **Dias 6 a ${daysCount}:** repita o ciclo aprofundando o MESMO roteiro (mais repetição, menos pausa, mais precisão).

---

# ⏱️ TEMPO DIÁRIO: ${totalMinutes} MINUTOS POR DIA (6 BLOCOS)
- Revisão: **${revisaoMin} min** (10%)
- Aquecimento: **${warmMin} min** (15%)
- Técnica: **${adjustedTecnicaMin} min** (30%)
- Musicalidade: **${conceitoMin} min** (15%)
- Aplicação: **${aplicacaoMin} min** (20%)
- Desafio: **${desafioMin} min** (10%)
A soma DEVE ser exatamente ${totalMinutes} min em todos os dias. Os 6 blocos dividem o MESMO roteiro: cada bloco é uma FATIA DE TEMPO do conteúdo pedido, não um assunto novo.

---

# ⚠️ REGRAS ABSOLUTAS:
1. **NUNCA COLOQUE NOME DE ALUNO/PESSOA NO PLANO.** Use linguagem direta e impessoal.
2. **NUNCA USE SUBTÍTULOS GENÉRICOS OU METALINGUAGEM.** Crie subtítulos técnicos de dança reais.
${goalScopeRule}
4. **TODOS OS EXERCÍCIOS DEVEM SER ESPECÍFICOS PARA ${instrumentName.toUpperCase()}.**
5. **OBRIGATÓRIO: 6 BLOCOS DE EXERCÍCIO POR DIA** (Revisão, Aquecimento, Técnica, Musicalidade, Aplicação, Desafio).
6. **RESPEITE OS LIMITES DE CONCISÃO** do formato de saída (subtitle até 8 palavras, points até 12 palavras).
7. **SEGURANÇA EM PRIMEIRO LUGAR:** nunca proponha exercício de risco (acrobacia, queda de altura, pontas) sem supervisão; inclua aquecimento em todo dia.

---

${jsonSchemaFormat}

---

# 🎯 DADOS DO ALUNO (FIO CONDUTOR EXCLUSIVO E OBRIGATÓRIO)
${goalScopeBlock}## METAS DA SEMANA:
${weeklyGoalsText}
${goalsWarning}${teacherNotesBlock}${pedagogicalMemoryBlock}# 📚 HISTÓRICO DE AULAS (Referência de nível)
${lessonsText}`;

      // ── 9. CHAMADA À IA E PARSING DEFENSIVO (respeita aiProvider gemini|groq|opencode) ──
      try {
        const { callGemini } = await import("../utils/gemini");
        const { getSettingsByUserId } = await import("../db");
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        const creds = resolveAiCredentials(settingsData);
        const apiKey = creds.apiKey;
        const model = creds.model;

        if (!apiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Chave de API da IA não configurada. Acesse Configurações > Inteligência Artificial.",
          });
        }

        // ── 9.1 GERAÇÃO COM VALIDAÇÃO E RETRY (RF-005) ───────────────────────
        let parsedPlan: any = null;
        let lastValidation: { passed: boolean; found: string[] } | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const promptForAttempt =
            attempt === 0
              ? prompt
              : `${prompt}\n\n${lastValidation?.found?.some(f => BEGINNER_JARGON_TERMS.includes(f))
                  ? `⚠️ CORREÇÃO DE LINGUAGEM (ALUNO INICIANTE): A tentativa anterior usou jargão avançado (${(lastValidation?.found || []).slice(0, 5).join(", ")}). Reescreva TODO o plano em linguagem de iniciante — substitua por: "as notas do acorde", "as notas por baixo", "junto com a música", "toque o acorde com 3 notas". Siga a meta À RISCA.`
                  : `${specialist.retryInstruction}\nTermos proibidos detectados na tentativa anterior: ${(lastValidation?.found || []).join(", ")} — REMOVA-OS completamente e use apenas terminologia de ${specialist.displayName}.`}`;

          // RF-008 (PRD_OTIMIZACAO_PLANO_DIARIO): 120s para geração pesada + telemetria de tokens
          const responseText = await callGemini([{ role: "user", content: promptForAttempt }], undefined, true, apiKey, model, 0.2, {
            organizationId: orgId,
            userId: ctx.user.id,
            feature: "plano_diario",
            promptVersion: AI_PROMPT_VERSIONS.planoDiario,
            isJson: true,
            timeoutMs: 120_000,
          });

          // Parsing defensivo: tenta JSON direto, depois extrai bloco JSON por regex
          let cleanedText = responseText.trim();
          cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

          let candidate: any;
          try {
            candidate = JSON.parse(cleanedText);
          } catch {
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                candidate = JSON.parse(jsonMatch[0]);
              } catch {
                if (attempt === 0) continue; // tenta retry
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "A IA retornou um plano em formato inválido. Tente gerar novamente.",
                });
              }
            } else {
              if (attempt === 0) continue;
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "A IA retornou um plano em formato inválido. Tente gerar novamente.",
              });
            }
          }

          if (!candidate || !Array.isArray(candidate.days) || candidate.days.length === 0) {
            if (attempt === 0) continue;
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "A IA não gerou os dias de treino corretamente. Tente gerar novamente.",
            });
          }

          if (candidate.days.length < daysCount) {
            if (attempt === 0) {
              console.warn(`[InstrumentSpecialist] Tentativa ${attempt + 1} gerou apenas ${candidate.days.length} dias (esperado ${daysCount}) — retry`);
              continue;
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `A IA gerou apenas ${candidate.days.length} dia(s) de treino (esperado: ${daysCount}). Tente gerar novamente.`,
            });
          }

          // ── Validador pós-geração: detecta contaminação cruzada ──
          const validation = validatePlanText(JSON.stringify(candidate), specialist.id);
          if (!validation.passed) {
            console.warn(`[InstrumentSpecialist] Validação falhou (attempt ${attempt + 1}, ${specialist.id}):`, validation.found, "modalidade=", instrumentName);
            lastValidation = validation;
            if (attempt === 0) continue; // retry com instrução reforçada
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `O plano gerado conteve termos de outra modalidade (${validation.found.slice(0, 3).join(", ")}). Tente reformular a meta ou gere novamente.`,
            });
          }

          // ── Validador de linguagem por nível: INICIANTE sem jargão avançado ──
          const langValidation = validateBeginnerLanguage(JSON.stringify(candidate), studentLevel);
          if (!langValidation.passed) {
            console.warn(`[BeginnerLanguage] Jargão avançado detectado (attempt ${attempt + 1}):`, langValidation.found.slice(0, 4));
            lastValidation = { passed: false, found: langValidation.found };
            if (attempt === 0) continue; // retry com instrução reforçada
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `O plano usou termos técnicos avançados para um aluno INICIANTE (${langValidation.found.slice(0, 3).join(", ")}). Tente gerar novamente.`,
            });
          }

          // Sucesso: passou nas camadas de validação
          if (attempt > 0) console.warn(`[InstrumentSpecialist] Retry bem-sucedido (${specialist.id}) na tentativa ${attempt + 1}`);
          else console.warn(`[InstrumentSpecialist] Validação passou (${specialist.id}) — termos proibidos: 0`);
          parsedPlan = candidate;
          break;
        }


        if (!parsedPlan) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "A IA não gerou um plano válido após validação. Tente gerar novamente.",
          });
        }

        // Garante campos de rastreabilidade
        parsedPlan.instrument = parsedPlan.instrument || instrumentName;
        parsedPlan.level = parsedPlan.level || studentLevel;
        parsedPlan.planMode = planMode;
        parsedPlan.goalScope = goalScope;

        // Aviso de metas ou instrumento não configurados no campo importantMessage
        if (!hasGoals) {
          parsedPlan.importantMessage =
            (parsedPlan.importantMessage || "") +
            " ⚠️ Professor: cadastre as metas deste aluno na aba Progresso para personalizar o treino nos 5 dias.";
        }
        if (!student.instrumentId) {
          parsedPlan.importantMessage =
            (parsedPlan.importantMessage || "") +
            " ⚠️ Professor: cadastre o instrumento deste aluno para planos mais precisos.";
        }

        const finalPlanText = JSON.stringify(parsedPlan);

        // ── 10. PERSISTÊNCIA NO BANCO (como rascunho) ──────────────────────────
        const [inserted] = await db
          .insert(dailyStudyPlans)
          .values({
            organizationId: orgId,
            studentId: input.studentId,
            teacherId: ctx.user.id,
            planText: finalPlanText,
            status: "ativo",
            publishedStatus: "rascunho",
            daysCompleted: JSON.stringify(Array(daysCount).fill(false)),
          })
          .returning({ id: dailyStudyPlans.id });

        return { plan: finalPlanText, planId: inserted.id };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao gerar plano de estudo com a IA: " + (e.message || "Erro desconhecido"),
        });
      }
    }),


    getActiveStudyPlan: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [plan] = await db.select()
        .from(dailyStudyPlans)
        .where(and(
          eq(dailyStudyPlans.studentId, ctx.user.studentId!), 
          eq(dailyStudyPlans.status, 'ativo'),
          eq(dailyStudyPlans.publishedStatus, 'publicado')
        ))
        .orderBy(desc(dailyStudyPlans.createdAt))
        .limit(1);
      return plan || null;
    }),

    toggleStudyPlanDay: studentProcedure.input(z.object({ planId: z.number(), dayIndex: z.number().min(0).max(14), timeSpentSeconds: z.number().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [plan] = await db.select().from(dailyStudyPlans).where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.studentId, ctx.user.studentId!)));
      if (!plan) throw new Error("Plano não encontrado");

      let planDays = 5;
      try {
        const pt = JSON.parse((plan.planText as string) || "{}");
        if (Array.isArray(pt.days) && pt.days.length > 0) planDays = pt.days.length;
      } catch { /* mantém 5 */ }

      const parsedDays = JSON.parse((plan.daysCompleted as string) || "[]");
      const daysCompleted = Array.isArray(parsedDays) ? parsedDays.map(Boolean) : [];
      
      const parsedTime = JSON.parse((plan.daysTimeSpent as string) || "[]");
      const daysTimeSpent = Array.isArray(parsedTime) ? parsedTime.map(Number) : [];
      
      // Ensure it always has exactly 5 days
      while (daysCompleted.length < planDays) daysCompleted.push(false);
      if (daysCompleted.length > planDays) daysCompleted.length = planDays;

      while (daysTimeSpent.length < planDays) daysTimeSpent.push(0);
      if (daysTimeSpent.length > planDays) daysTimeSpent.length = planDays;

      if (input.dayIndex >= 0 && input.dayIndex < planDays) {
        daysCompleted[input.dayIndex] = !daysCompleted[input.dayIndex];
        if (daysCompleted[input.dayIndex] && input.timeSpentSeconds) {
          daysTimeSpent[input.dayIndex] = input.timeSpentSeconds;
        } else if (!daysCompleted[input.dayIndex]) {
          daysTimeSpent[input.dayIndex] = 0;
        }
      }

      // Check if all 5 days are actually true
      const allCompleted = daysCompleted.every(Boolean);

      await db.update(dailyStudyPlans)
        .set({ 
          daysCompleted: JSON.stringify(daysCompleted),
          daysTimeSpent: JSON.stringify(daysTimeSpent),
          updatedAt: new Date(),
          ...(allCompleted ? { completedAt: new Date() } : {})
        })
        .where(eq(dailyStudyPlans.id, plan.id));

      if (allCompleted) {
        // Envia notificação no painel do professor (Semana completa)
        await db.insert(notifications).values({
          organizationId: plan.organizationId,
          userId: plan.teacherId,
          title: "Semana Gabaritada! 🎸",
          message: `O aluno ${ctx.user.name} concluiu os 5 dias de treino do plano de estudos!`,
          type: "success",
          actionUrl: `/alunos/${ctx.user.studentId}`,
        });

        // Envia notificação PUSH para o aparelho do professor (Sem await para não travar a resposta)
        notifyUser(plan.teacherId, {
          title: "Semana Gabaritada! 🎸",
          content: `O aluno ${ctx.user.name} concluiu os 5 dias de treino do plano de estudos!`,
        }).catch(e => console.error("Falha ao enviar push notification:", e));
      } else if (input.dayIndex >= 0 && input.dayIndex < 5 && daysCompleted[input.dayIndex]) {
        // Envia notificação diária quando o aluno marca um dia
        await db.insert(notifications).values({
          organizationId: plan.organizationId,
          userId: plan.teacherId,
          title: "Treino Concluído! 🎸",
          message: `O aluno ${ctx.user.name} concluiu o treino do dia!`,
          type: "success",
          actionUrl: `/alunos/${ctx.user.studentId}`,
        });

        notifyUser(plan.teacherId, {
          title: "Treino Concluído! 🎸",
          content: `O aluno ${ctx.user.name} concluiu o treino do dia!`,
        }).catch(e => console.error("Falha ao enviar push notification:", e));
      }

      return { success: true, allCompleted };
    }),

    editStudyPlanText: studentProcedure.input(z.object({ planId: z.number(), planText: z.string() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [plan] = await db.select().from(dailyStudyPlans).where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.studentId, ctx.user.studentId!)));
      if (!plan) throw new Error("Plano não encontrado");

      await db.update(dailyStudyPlans)
        .set({ planText: input.planText, updatedAt: new Date() })
        .where(eq(dailyStudyPlans.id, plan.id));

      return { success: true };
    }),

    publishStudyPlan: protectedProcedure.input(z.object({ planId: z.number(), studentId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;

      // MÉDIO-13 FIX: Validar que o studentId pertence ao professor que está publicando.
      // Sem isso, um professor poderia invalidar planos de alunos de outros professores.
      const [ownedStudent] = await db.select({ id: students.id })
        .from(students)
        .where(and(
          eq(students.id, input.studentId),
          eq(students.organizationId, orgId),
          isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ))
        .limit(1);

      if (!ownedStudent) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Você não tem permissão para publicar planos deste aluno.'
        });
      }

      // Invalida planos antigos do aluno (publicados e ativos) — apenas desta organização
      await db.update(dailyStudyPlans)
        .set({ status: 'inativo' })
        .where(and(
          eq(dailyStudyPlans.studentId, input.studentId),
          eq(dailyStudyPlans.organizationId, orgId),
          eq(dailyStudyPlans.status, 'ativo'),
          eq(dailyStudyPlans.publishedStatus, 'publicado')
        ));

      // Publica o plano atual
      await db.update(dailyStudyPlans)
        .set({ publishedStatus: 'publicado' })
        .where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.organizationId, orgId)));

      return { success: true };
    }),

    updateStudyPlan: protectedProcedure.input(z.object({ planId: z.number(), planText: z.string() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      try {
        JSON.parse(input.planText);
      } catch (e) {
        throw new Error("O plano editado não é um JSON válido. Verifique se as aspas e chaves estão corretas.");
      }

      // ── Validação de especialista ao editar (RF-013) ──
      try {
        const [existingPlan] = await db.select({ studentId: dailyStudyPlans.studentId }).from(dailyStudyPlans).where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.organizationId, orgId))).limit(1);
        if (existingPlan) {
          const [stu] = await db.select({ instrumentId: students.instrumentId }).from(students).where(and(eq(students.id, existingPlan.studentId), eq(students.organizationId, orgId))).limit(1);
          if (stu?.instrumentId) {
            const [instr] = await db.select({ name: instruments.name, category: instruments.category }).from(instruments).where(eq(instruments.id, stu.instrumentId)).limit(1);
            if (instr) {
              const specialist = resolveSpecialist(instr.name, instr.category || "geral");
              const validation = validatePlanText(input.planText, specialist.id);
              if (!validation.passed) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Seu plano contém termos de outro instrumento: ${validation.found.slice(0,3).join(", ")}. Corrija antes de salvar.` });
              }
            }
          }
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        console.warn("[updateStudyPlan] falha na validação de especialista (não bloqueante):", e?.message);
      }

      await db.update(dailyStudyPlans)
        .set({ planText: input.planText, updatedAt: new Date() })
        .where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.organizationId, orgId)));

      return { success: true };
    }),

    unpublishStudyPlan: protectedProcedure.input(z.object({ planId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      await db.update(dailyStudyPlans)
        .set({ publishedStatus: 'rascunho' })
        .where(and(eq(dailyStudyPlans.id, input.planId), eq(dailyStudyPlans.organizationId, orgId)));

      return { success: true };
    }),

    deleteStudyPlan: protectedProcedure.input(z.object({ planId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      await db.delete(dailyStudyPlans)
        .where(and(
          eq(dailyStudyPlans.id, input.planId),
          eq(dailyStudyPlans.organizationId, orgId)
        ));

      return { success: true };
    }),

    getStudentPlanHistory: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      const history = await db.select()
        .from(dailyStudyPlans)
        .where(and(
          eq(dailyStudyPlans.studentId, input.studentId),
          eq(dailyStudyPlans.organizationId, orgId)
        ))
        .orderBy(desc(dailyStudyPlans.createdAt));

      return history;
    }),

    getStudentPlanForTeacher: protectedProcedure.input(z.object({ studentId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      const [plan] = await db.select()
        .from(dailyStudyPlans)
        .where(and(
          eq(dailyStudyPlans.studentId, input.studentId),
          eq(dailyStudyPlans.organizationId, orgId),
          eq(dailyStudyPlans.status, 'ativo')
        ))
        .orderBy(desc(dailyStudyPlans.createdAt))
        .limit(1);

      return plan || null;
    }),


    sendPlanViaWhatsApp: protectedProcedure.input(z.object({ 
      studentId: z.number(), 
      planText: z.string(),
      type: z.enum(["aula", "diario"])
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      
      const [student] = await db.select().from(students).where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)));
      if (!student) throw new Error("Aluno não encontrado");

      // FIX: Tenta primeiro o telefone do aluno; se não tiver, usa o do responsável.
      // Nunca envia para os dois ao mesmo tempo.
      const targetPhone = student.phone?.trim() || student.guardianPhone?.trim() || null;
      const sendingToGuardian = !student.phone?.trim() && !!student.guardianPhone?.trim();

      if (!targetPhone) {
        throw new Error("Este aluno não tem telefone cadastrado e nem o do responsável. Cadastre um número em Alunos > Editar.");
      }
      
      const [userSettings] = await db.select().from(settings).where(eq(settings.userId, ctx.user.id));
      const botUrl = userSettings?.whatsappBotUrl || process.env.EVOLUTION_API_URL || "http://179.197.76.174:8080";
      const botToken = userSettings?.whatsappBotToken || process.env.EVOLUTION_API_KEY || "minha_chave_secreta_123";

      // Saudão diferenciada: se for para o responsável, menciona o nome do aluno
      const saudacao = sendingToGuardian
        ? (input.type === "aula"
            ? `Olá! Segue o plano de aula de ${student.name} 🎸\n\n`
            : `Olá! Aqui está o cronograma de treino de ${student.name} para essa semana 📅👇\n\n`)
        : (input.type === "aula" 
            ? `Olá ${student.name}! Preparado para a nossa próxima aula? 🎸 Aqui está o que vamos fazer:\n\n`
            : `Olá ${student.name}! Aqui está o seu cronograma de treino para arrebentar essa semana! 📅👇\n\n`);

      let formattedPlanText = input.planText;
      if (input.type === "diario") {
        try {
          const planData = JSON.parse(input.planText);
          let text = `🎯 *Objetivo da semana*: ${planData.weeklyGoal || "Praticar"}\n\n`;
          planData.days?.forEach((day: any) => {
            text += `📅 *${day.dayName}*: ${day.focus?.title}\n`;
            day.exercises?.forEach((ex: any) => {
               text += `  🔹 ${ex.title} (${ex.duration})\n`;
               ex.points?.forEach((p: string) => { text += `    - ${p}\n` });
            });
            text += `\n`;
          });
          if (planData.importantMessage) {
            text += `💡 *Dica*: ${planData.importantMessage}\n`;
          }
          formattedPlanText = text;
        } catch (e) {
          // Caso não seja um JSON (planos antigos), usa o texto original
        }
      }

      const finalMessage = saudacao + formattedPlanText;

      const { sendWhatsAppMessage } = await import("../utils/whatsapp");
      const result = await sendWhatsAppMessage({
        url: botUrl,
        token: botToken,
        phone: targetPhone,
        message: finalMessage,
        sessionId: `prof_${ctx.user.id}`
      });

      if (!result.success) {
        throw new Error("Falha ao enviar mensagem pelo robô: " + result.error);
      }

      return { 
        success: true,
        sentTo: sendingToGuardian ? "guardian" : "student"
      };
    }),
  }),

  musicLibrary: router({
    list: protectedProcedure.input(z.object({ 
      studentId: z.number(),
      category: z.string().optional(),
      search: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;
      let whereClause = and(
        eq(studentFiles.organizationId, orgId),
        eq(studentFiles.userId, ctx.user.id),
        eq(studentFiles.studentId, input.studentId)
      );

      if (input.category && input.category !== 'todos') {
        whereClause = and(whereClause, eq(studentFiles.category, input.category as any));
      }

      if (input.search) {
        whereClause = and(whereClause, sql`LOWER(${studentFiles.fileName}) LIKE ${`%${input.search.toLowerCase()}%`}`);
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.select().from(studentFiles)
        .where(whereClause)
        .orderBy(desc(studentFiles.createdAt));
    }),

    create: protectedProcedure.input(z.object({
      studentId: z.number(),
      fileName: z.string(),
      fileType: z.string(),
      category: z.enum(['imagem', 'video', 'pdf', 'audio', 'documento']),
      folder: z.string().optional(),
      fileUrl: z.string(),
      thumbnailUrl: z.string().optional(),
      comments: z.string().optional(),
      size: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;

      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      // Security: verify student ownership
      const [ownedStudent] = await db.select({ id: students.id }).from(students)
        .where(and(
          eq(students.id, input.studentId as number), 
          eq(students.organizationId, orgId), 
          isUserAdmin ? undefined : eq(students.professorId, ctx.user.id)
        ))
        .limit(1);
      
      if (!ownedStudent) {
        throw new TRPCError({ code: "FORBIDDEN", message: "O aluno selecionado não existe ou não pertence ao seu perfil." });
      }

      await db.insert(studentFiles).values({
        organizationId: orgId,
        userId: ctx.user.id,
        studentId: input.studentId,
        fileName: input.fileName,
        fileType: input.fileType,
        category: input.category,
        folder: input.folder,
        fileUrl: input.fileUrl,
        thumbnailUrl: input.thumbnailUrl,
        comments: input.comments,
        size: input.size,
      });
      
      return { success: true };
    }),

    upload: protectedProcedure.input(z.object({
      fileName: z.string(),
      fileType: z.string(),
      base64Data: z.string(),
      thumbnailData: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId!;

      // CRÍTICO-05 FIX: Validação de MIME type e extensão por whitelist explícita.
      // Impede upload de arquivos executáveis (PHP, JS no servidor, EXE, etc.)
      // mesmo que renomeados com extensão segura.
      const ALLOWED_MIME_TYPES = new Set([
        // Imagens
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        // Áudio
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/m4a', 'audio/mp4',
        // Vídeo
        'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/avi', 'video/mov',
        // Documentos
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        // Texto
        'text/plain',
      ]);

      const ALLOWED_EXTENSIONS = new Set([
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
        'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a',
        'mp4', 'webm', 'mov', 'avi',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
      ]);

      // TAMANHO MÁXIMO POR TIPO (em bytes)
      const SIZE_LIMITS: Record<string, number> = {
        'image': 10 * 1024 * 1024,  // 10MB para imagens
        'audio': 50 * 1024 * 1024,  // 50MB para áudio
        'video': 200 * 1024 * 1024, // 200MB para vídeo
        'application': 20 * 1024 * 1024, // 20MB para documentos
        'text': 5 * 1024 * 1024,    // 5MB para texto
      };

      // Verificar extensão
      const ext = input.fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tipo de arquivo não permitido: .${ext}. Formatos aceitos: imagens, áudio, vídeo, PDF e documentos Office.`
        });
      }

      // Verificar MIME type declarado
      const normalizedMime = input.fileType.toLowerCase().split(';')[0].trim();
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tipo de conteúdo não permitido: ${input.fileType}.`
        });
      }

      // Decodificar e verificar tamanho
      const base64 = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
      const buffer = Buffer.from(base64, 'base64');

      // Verificar tamanho máximo por categoria de tipo
      const mimeCategory = normalizedMime.split('/')[0];
      const maxSize = SIZE_LIMITS[mimeCategory] || (10 * 1024 * 1024); // padrão 10MB
      if (buffer.length > maxSize) {
        const maxMb = Math.round(maxSize / (1024 * 1024));
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Arquivo muito grande. Tamanho máximo para ${mimeCategory}: ${maxMb}MB.`
        });
      }

      // CRÍTICO-05 FIX: Verificação de magic bytes (assinatura do arquivo binário).
      // Garante que o conteúdo real corresponde ao tipo declarado, mesmo que renomeado.
      const fileSignatureValid = checkFileMagicBytes(buffer, normalizedMime);
      if (!fileSignatureValid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'O conteúdo do arquivo não corresponde ao tipo declarado. Upload bloqueado por segurança.'
        });
      }

      // Strong sanitization: replace the entire file name with a UUID to prevent path traversal or script execution
      const uuid = crypto.randomUUID();
      const baseKey = `music-library/${orgId}/${ctx.user.id}/${Date.now()}-${uuid}.${ext}`;

      // Upload do arquivo principal (MIME type sanitizado — usa o declarado após validação)
      const { url } = await storagePut(baseKey, buffer, normalizedMime);

      let thumbnailUrl: string | undefined = undefined;
      // Upload da thumbnail se fornecida
      if (input.thumbnailData) {
        const thumbBase64 = input.thumbnailData.includes(',') ? input.thumbnailData.split(',')[1] : input.thumbnailData;
        const thumbBuffer = Buffer.from(thumbBase64, 'base64');

        // Limitar thumbnail a 5MB
        if (thumbBuffer.length > 5 * 1024 * 1024) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Thumbnail muito grande. Máximo: 5MB.' });
        }

        const thumbKey = `${baseKey}-thumb.jpg`;
        const thumbResult = await storagePut(thumbKey, thumbBuffer, 'image/jpeg');
        thumbnailUrl = thumbResult.url;
      }
      
      return { url, thumbnailUrl };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      comments: z.string().optional(),
      fileName: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const { id, ...data } = input;
      await db.update(studentFiles)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(studentFiles.id, id), eq(studentFiles.userId, ctx.user.id)));
      
      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const orgId = ctx.user.organizationId!;
      await db.delete(studentFiles)
        .where(and(eq(studentFiles.id, input.id), eq(studentFiles.organizationId, orgId), eq(studentFiles.userId, ctx.user.id)));
      
      return { success: true };
    }),

    getFileUrl: protectedProcedure.input(z.object({ fileId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const orgId = ctx.user.organizationId!;
      const isSuperAdmin = (ctx.user.role as string) === 'superadmin' || ctx.user.openId === ENV.ownerOpenId;

      const [file] = await db.select({
        id: studentFiles.id,
        fileUrl: studentFiles.fileUrl,
        fileName: studentFiles.fileName,
        organizationId: studentFiles.organizationId
      })
      .from(studentFiles)
      .where(
        isSuperAdmin
          ? eq(studentFiles.id, input.fileId)
          : and(eq(studentFiles.id, input.fileId), eq(studentFiles.organizationId, orgId))
      )
      .limit(1);

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
      }

      const rawUrl: string = file.fileUrl ?? "";
      const isLocal = rawUrl.startsWith("/uploads/") || rawUrl.match(/https?:\/\/[^/]+\/uploads\//);
      if (!isLocal) {
        return { url: rawUrl, fileNotFound: false };
      }

      const relKey = rawUrl.replace(/^https?:\/\/[^/]+\/uploads\//, "").replace(/^\/uploads\//, "");
      const { existsSync } = await import("fs");
      const { resolve } = await import("path");
      const absPath = resolve(process.cwd(), "uploads", relKey);
      if (!existsSync(absPath)) {
        return { url: "", fileNotFound: true };
      }

      const { createFileToken } = await import("../_core/fileTokens");
      const token = createFileToken(relKey);
      const fileName = encodeURIComponent(file.fileName ?? relKey.split("/").pop() ?? "arquivo");
      const url = `/uploads-token/${token}/${fileName}`;

      return { url, fileNotFound: false };
    }),
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      return getDashboardStats(orgId, isUserAdmin ? undefined : ctx.user.id);
    }),
    getMonthlyStats: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const stats = await getMonthlyStats(orgId, isUserAdmin ? undefined : ctx.user.id, 12);
      return stats;
    }),
    getExperimentalStats: protectedProcedure.input(z.object({ 
      month: z.number().optional(), 
      year: z.number().optional() 
    }).optional()).query(async ({ ctx, input }) => {
        const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
        const orgId = ctx.user.organizationId!;
        return getExperimentalStats(orgId, isUserAdmin ? undefined : ctx.user.id, input?.month, input?.year);
    }),
    getLessonsByDay: protectedProcedure.query(async ({ ctx }) => {
      const isUserAdmin = ctx.user.role === 'admin' || ctx.user.openId === ENV.ownerOpenId;
      const orgId = ctx.user.organizationId!;
      const data = await getLessonsByDayOfWeek(orgId, isUserAdmin ? undefined : ctx.user.id);
      return data;
    }),
  }),

};
