// ─── Catálogo de Planos & Bolsas da Escola (comercial) ───────────────────────
// Multi-tenant: cada escola cria os próprios planos/bolsas com os valores que
// quiser. Aparece em Configurações > Planos & Bolsas e no cadastro de alunos.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { schoolPlans, students } from "../../drizzle/schema";
import { ENV } from "../_core/env";

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === 'admin' || role === 'professor' || role === 'superadmin' || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

const planInput = z.object({
  nome: z.string().min(2, "Informe o nome do plano").max(120),
  aulasPorSemana: z.number().min(1).max(7).default(1),
  duracaoMeses: z.number().min(1).max(60).default(1),
  isBolsa: z.boolean().default(true),
  valorMensal: z.number().min(0).max(100000),
  valorCheio: z.number().min(0).max(100000).nullable().optional(),
  taxaInscricao: z.number().min(0).max(100000).default(0),
  diasLimite: z.string().max(20).default("10,20"),
  descricao: z.string().max(500).optional().nullable(),
  ativo: z.boolean().default(true),
});

/**
 * Sanitiza o CSV de dias limite: mantém apenas dígitos separados por vírgula,
 * clampa cada dia para 1–31, remove vazios/duplicados (ex.: "10, 20" | "10 20"
 * | "abc" → "10,20"). Sem isso, um dia como 1020 geraria faturas com data
 * inválida no Postgres.
 */
function sanitizeDiasLimite(raw: string): string {
  const dias = raw
    .split(",")
    .map((d) => parseInt(d.replace(/\D/g, ""), 10))
    .filter((d) => Number.isFinite(d) && d >= 1 && d <= 31);
  const unique = Array.from(new Set(dias)).sort((a, b) => a - b);
  return unique.length > 0 ? unique.join(",") : "10,20";
}

/** Valida que o plano pertence à organização (integridade do vínculo aluno↔plano). */
export async function assertPlanInOrg(db: any, orgId: number, planId: number | null | undefined) {
  if (planId == null) return;
  const [plan] = await db.select({ id: schoolPlans.id }).from(schoolPlans)
    .where(and(eq(schoolPlans.id, planId), eq(schoolPlans.organizationId, orgId)))
    .limit(1);
  if (!plan) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Plano selecionado não existe nesta escola." });
  }
}

export const schoolPlansRouter = router({
  list: protectedProcedure.input(z.object({ somenteAtivos: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) return [];
    const orgId = ctx.user.organizationId!;
    return db.select().from(schoolPlans)
      .where(and(
        eq(schoolPlans.organizationId, orgId),
        input?.somenteAtivos ? eq(schoolPlans.ativo, true) : undefined,
      ))
      .orderBy(asc(schoolPlans.aulasPorSemana), asc(schoolPlans.duracaoMeses));
  }),

  create: protectedProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const [created] = await db.insert(schoolPlans).values({
      organizationId: orgId,
      nome: input.nome,
      aulasPorSemana: input.aulasPorSemana,
      duracaoMeses: input.duracaoMeses,
      isBolsa: input.isBolsa,
      valorMensal: input.valorMensal.toFixed(2),
      valorCheio: input.valorCheio != null ? input.valorCheio.toFixed(2) : null,
      taxaInscricao: input.taxaInscricao.toFixed(2),
      diasLimite: sanitizeDiasLimite(input.diasLimite),
      descricao: input.descricao ?? null,
      ativo: input.ativo,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: schoolPlans.id });
    return { success: true, id: created.id };
  }),

  update: protectedProcedure.input(z.object({ id: z.number() }).extend(planInput.shape)).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const [existing] = await db.select({ id: schoolPlans.id }).from(schoolPlans)
      .where(and(eq(schoolPlans.id, input.id), eq(schoolPlans.organizationId, orgId)))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
    await db.update(schoolPlans).set({
      nome: input.nome,
      aulasPorSemana: input.aulasPorSemana,
      duracaoMeses: input.duracaoMeses,
      isBolsa: input.isBolsa,
      valorMensal: input.valorMensal.toFixed(2),
      valorCheio: input.valorCheio != null ? input.valorCheio.toFixed(2) : null,
      taxaInscricao: input.taxaInscricao.toFixed(2),
      diasLimite: sanitizeDiasLimite(input.diasLimite),
      descricao: input.descricao ?? null,
      ativo: input.ativo,
      updatedAt: new Date(),
    }).where(eq(schoolPlans.id, input.id));
    return { success: true };
  }),

  /** Exclui apenas planos sem alunos vinculados; caso contrário arquivar via update ativo=false. */
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    assertStaff(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
    const orgId = ctx.user.organizationId!;
    const [existing] = await db.select({ id: schoolPlans.id }).from(schoolPlans)
      .where(and(eq(schoolPlans.id, input.id), eq(schoolPlans.organizationId, orgId)))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });

    const [{ count: emUso }] = await db.select({ count: sql<number>`CAST(count(*) AS INT)` })
      .from(students)
      .where(and(eq(students.organizationId, orgId), eq(students.schoolPlanId, input.id)));

    if (Number(emUso) > 0) {
      // Arquiva em vez de excluir — preserva histórico financeiro dos alunos
      await db.update(schoolPlans).set({ ativo: false, updatedAt: new Date() }).where(eq(schoolPlans.id, input.id));
      return { success: true, archived: true, message: "Plano em uso por alunos — arquivado (inativo)." };
    }
    await db.delete(schoolPlans).where(eq(schoolPlans.id, input.id));
    return { success: true, archived: false };
  }),
});
