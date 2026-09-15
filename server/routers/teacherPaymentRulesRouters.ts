// ─── Regras de Cobrança de Professores (PRD Regras de Cobrança) ───────────────
// ADMIN/OWNER apenas. Versionamento: cada save cria NOVA versão (startDate) e
// encerra a anterior. O Simulador usa EXATAMENTE o mesmo motor da folha.

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import { teacherPaymentRules, teacherPaymentRuleConditions, teacherPaymentRuleCourses, instruments } from "../../drizzle/schema";
import { handleDbError } from "../utils/error_handler";
import { computeTeacherPayment, type ConditionLike, type CourseRuleLike, type LessonLike, type RuleLike } from "../services/TeacherPaymentEngine";

const conditionSchema = z.object({
  conditionType: z.string().max(40),
  enabled: z.boolean(),
  action: z.string().max(30),
  percentage: z.number().min(0).max(100).default(0),
  fixedAmount: z.number().min(0).default(0),
  minHours: z.number().int().min(0).nullable().optional(),
});

const courseRuleSchema = z.object({
  instrumentId: z.number().int().positive(),
  ruleType: z.enum(["por_aula", "percentual", "fixo_mensal", "hibrido"]),
  amountPerClass: z.number().min(0).default(0),
  percentage: z.number().min(0).max(100).default(0),
  fixedAmount: z.number().min(0).default(0),
});

const ruleInputSchema = z.object({
  teacherId: z.number().int().positive().nullable().optional(), // null = regra padrão da escola
  name: z.string().min(1).max(120),
  ruleType: z.enum(["por_aula", "percentual", "fixo_mensal", "hibrido"]),
  fixedAmount: z.number().min(0).default(0),
  amountPerClass: z.number().min(0).default(0),
  percentage: z.number().min(0).max(100).default(0),
  calculationBase: z.enum(["bruto", "recebido", "liquido", "manual"]).default("bruto"),
  manualBaseAmount: z.number().min(0).default(0),
  closingPeriod: z.enum(["semanal", "quinzenal", "mensal"]).default("mensal"),
  closingDay: z.number().int().min(1).max(31).default(30),
  paymentDay: z.number().int().min(1).max(31).default(5),
  paymentDaysAfter: z.number().int().min(0).default(0),
  isSchoolDefault: z.boolean().default(false),
  conditions: z.array(conditionSchema).max(20).default([]),
  courseRules: z.array(courseRuleSchema).max(20).default([]),
});

export const teacherPaymentRulesRouters = {
  teacherPaymentRules: router({
    /** Lista: regra vigente + histórico de versões de uma professora. */
    list: adminProcedure.input(z.object({ teacherId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const rules = await db
        .select()
        .from(teacherPaymentRules)
        .where(and(eq(teacherPaymentRules.organizationId, orgId), eq(teacherPaymentRules.teacherId, input.teacherId)))
        .orderBy(desc(teacherPaymentRules.startDate));

      const enriched = [];
      for (const rule of rules) {
        const conditions = await db
          .select()
          .from(teacherPaymentRuleConditions)
          .where(eq(teacherPaymentRuleConditions.ruleId, rule.id));
        const courses = await db
          .select()
          .from(teacherPaymentRuleCourses)
          .where(eq(teacherPaymentRuleCourses.ruleId, rule.id));
        enriched.push({ ...rule, conditions, courses });
      }
      return enriched;
    }),

    /** Regra PADRÃO da escola (teacherId null). */
    getDefault: adminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const orgId = ctx.user.organizationId!;
      const [rule] = await db
        .select()
        .from(teacherPaymentRules)
        .where(and(eq(teacherPaymentRules.organizationId, orgId), eq(teacherPaymentRules.isSchoolDefault, true)))
        .orderBy(desc(teacherPaymentRules.startDate))
        .limit(1);
      if (!rule) return null;
      const conditions = await db.select().from(teacherPaymentRuleConditions).where(eq(teacherPaymentRuleConditions.ruleId, rule.id));
      const courses = await db.select().from(teacherPaymentRuleCourses).where(eq(teacherPaymentRuleCourses.ruleId, rule.id));
      return { ...rule, conditions, courses };
    }),

    /** Salva como NOVA VERSÃO (encerra a anterior e cria a vigente a partir de hoje). */
    save: adminProcedure.input(ruleInputSchema).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        // Validações (RN: valores/percentuais coerentes)
        if (input.ruleType === "por_aula" && input.amountPerClass <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor por aula (maior que zero)." });
        }
        if (input.ruleType === "percentual" && input.percentage <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o percentual (maior que zero)." });
        }
        if (input.ruleType === "fixo_mensal" && input.fixedAmount <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor fixo mensal (maior que zero)." });
        }
        if (input.ruleType === "hibrido" && input.fixedAmount <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No modelo híbrido informe o valor fixo mensal (maior que zero)." });
        }
        if (input.isSchoolDefault && input.teacherId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Regra padrão da escola não pode ter professora vinculada." });
        }

        // Encerra a versão anterior ATIVA (mesma professora ou default)
        const prevWhere = input.isSchoolDefault
          ? and(eq(teacherPaymentRules.organizationId, orgId), eq(teacherPaymentRules.isSchoolDefault, true), eq(teacherPaymentRules.active, true))
          : and(eq(teacherPaymentRules.organizationId, orgId), eq(teacherPaymentRules.teacherId, input.teacherId!), eq(teacherPaymentRules.active, true));
        const [prev] = await db.select({ id: teacherPaymentRules.id }).from(teacherPaymentRules).where(prevWhere).limit(1);
        if (prev) {
          await db.update(teacherPaymentRules)
            .set({ endDate: new Date(Date.now() - 86_400_000), active: false, updatedAt: new Date() })
            .where(eq(teacherPaymentRules.id, prev.id));
        }

        const [created] = await db
          .insert(teacherPaymentRules)
          .values({
            organizationId: orgId,
            teacherId: input.isSchoolDefault ? null : (input.teacherId ?? null),
            name: input.name.trim(),
            ruleType: input.ruleType,
            fixedAmount: input.fixedAmount.toFixed(2),
            amountPerClass: input.amountPerClass.toFixed(2),
            percentage: input.percentage.toFixed(2),
            calculationBase: input.calculationBase,
            manualBaseAmount: input.manualBaseAmount.toFixed(2),
            closingPeriod: input.closingPeriod,
            closingDay: input.closingDay,
            paymentDay: input.paymentDay,
            paymentDaysAfter: input.paymentDaysAfter,
            isSchoolDefault: input.isSchoolDefault,
            active: true,
            startDate: new Date(),
            createdByUserId: ctx.user.id,
          })
          .returning({ id: teacherPaymentRules.id });

        for (const c of input.conditions) {
          await db.insert(teacherPaymentRuleConditions).values({
            ruleId: created.id,
            conditionType: c.conditionType,
            enabled: c.enabled,
            action: c.action,
            percentage: c.percentage.toFixed(2),
            fixedAmount: c.fixedAmount.toFixed(2),
            minHours: c.minHours ?? null,
          });
        }
        for (const cr of input.courseRules) {
          await db.insert(teacherPaymentRuleCourses).values({
            ruleId: created.id,
            instrumentId: cr.instrumentId,
            ruleType: cr.ruleType,
            amountPerClass: cr.amountPerClass.toFixed(2),
            percentage: cr.percentage.toFixed(2),
            fixedAmount: cr.fixedAmount.toFixed(2),
            startDate: new Date(),
          });
        }

        return { success: true, id: created.id };
      } catch (error) {
        return handleDbError(error, "salvar a regra de cobrança");
      }
    }),

    /** Ativa/desativa a regra vigente (não apaga histórico). */
    toggleActive: adminProcedure.input(z.object({ id: z.number().int(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [rule] = await db
          .select({ id: teacherPaymentRules.id })
          .from(teacherPaymentRules)
          .where(and(eq(teacherPaymentRules.id, input.id), eq(teacherPaymentRules.organizationId, orgId)))
          .limit(1);
        if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada." });
        await db.update(teacherPaymentRules).set({ active: input.active, updatedAt: new Date() }).where(eq(teacherPaymentRules.id, input.id));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "alterar a regra de cobrança");
      }
    }),

    /** Simulador — usa EXATAMENTE o motor da folha (sem gravar nada). */
    simulate: adminProcedure
      .input(
        z.object({
          rule: ruleInputSchema.omit({ teacherId: true, isSchoolDefault: true }),
          aulasRealizadas: z.number().int().min(0).default(0),
          reposicoes: z.number().int().min(0).default(0),
          faltasAluno: z.number().int().min(0).default(0),
          faltasProfessora: z.number().int().min(0).default(0),
          aulasExperimentais: z.number().int().min(0).default(0),
          cancelamentos: z.number().int().min(0).default(0),
          valorRecebidoMensalidades: z.number().min(0).default(0),
          valorBrutoMensalidades: z.number().min(0).default(0),
        })
      )
      .mutation(async ({ input }) => {
        const { rule, ...counts } = input;
        const now = new Date();
        const lessons: LessonLike[] = [];
        let id = 1;
        const push = (partial: Partial<LessonLike>) => lessons.push({
          id: id++, status: "concluida", lessonType: "individual", isExperimental: false,
          duration: 60, scheduledAt: now, studentId: 1, title: "Aula", ...partial,
        });
        for (let i = 0; i < counts.aulasRealizadas; i++) push({});
        for (let i = 0; i < counts.reposicoes; i++) push({ title: "Reposição" });
        for (let i = 0; i < counts.aulasExperimentais; i++) push({ isExperimental: true });
        for (let i = 0; i < counts.faltasAluno; i++) push({ status: "falta" });
        for (let i = 0; i < counts.faltasProfessora; i++) push({ status: "falta_professor" });
        for (let i = 0; i < counts.cancelamentos; i++) push({ status: "cancelada" });

        const conditions: ConditionLike[] = rule.conditions as ConditionLike[];
        const courseRules: CourseRuleLike[] = rule.courseRules as CourseRuleLike[];
        const memory = computeTeacherPayment(
          { id: 0, name: rule.name, ruleType: rule.ruleType, fixedAmount: rule.fixedAmount, amountPerClass: rule.amountPerClass, percentage: rule.percentage, calculationBase: rule.calculationBase, manualBaseAmount: rule.manualBaseAmount, startDate: now } as RuleLike,
          conditions,
          courseRules,
          {
            lessons,
            studentFees: { 1: counts.valorBrutoMensalidades },
            studentPaid: { 1: counts.valorRecebidoMensalidades },
            now,
          }
        );
        return memory;
      }),

    /** Instrumentos disponíveis para regras por instrumento. */
    getInstruments: adminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      return db
        .select({ id: instruments.id, name: instruments.name, category: instruments.category })
        .from(instruments)
        .where(eq(instruments.organizationId, orgId))
        .orderBy(instruments.name);
    }),
  }),
};
