// ─── Indique e Ganhe (programa de indicação do DancePro) ─────────────────────
// Cada escola tem um código/link. A escola indicada preenche o formulário
// público; quando ela se cadastra (mesmo e-mail), a indicação vira "convertida".
// O prêmio (mês grátis/crédito) é configurável e aplicado pela equipe DancePro.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { organizations, referrals } from "../drizzle/schema";
import { ENV } from "./_core/env";

function generateCode(name: string, orgId: number) {
  const base = (name || "escola")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "escola";
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}${orgId}${rand}`.slice(0, 16);
}

async function ensureOrgCode(db: any, orgId: number) {
  const [org] = await db.select({
    id: organizations.id,
    name: organizations.name,
    referralCode: organizations.referralCode,
  }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada." });
  if (org.referralCode) return { ...org, referralCode: org.referralCode as string };
  for (let i = 0; i < 5; i++) {
    const code = generateCode(org.name, org.id);
    const [dup] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.referralCode, code)).limit(1);
    if (dup) continue;
    await db.update(organizations).set({ referralCode: code, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    return { ...org, referralCode: code };
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível gerar o código de indicação." });
}

/** Marca a indicação como convertida quando a escola indicada se cadastra. */
export async function markReferralConvertedByEmail(db: any, email: string | null | undefined, newOrgId: number) {
  if (!db || !email) return;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized) return;
  try {
    const [pending] = await db.select({ id: referrals.id }).from(referrals)
      .where(and(sql`LOWER(${referrals.referredEmail}) = ${normalized}`, eq(referrals.status, "pendente")))
      .orderBy(desc(referrals.createdAt)).limit(1);
    if (!pending) return;
    await db.update(referrals).set({
      status: "convertido",
      referredOrganizationId: newOrgId,
      convertedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(referrals.id, pending.id));
  } catch (e) {
    console.warn("[referral] Falha ao marcar indicação convertida:", e);
  }
}

function assertAdmin(ctx: any) {
  const isAdmin = ctx.user?.role === "admin" || ctx.user?.openId === ENV.ownerOpenId;
  if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o administrador da escola acessa o programa de indicação." });
}

export const referralRouter = router({
  /** Página pública /indique: nome da escola que indicou (pelo código). */
  publicInfo: publicProcedure.input(z.object({ code: z.string().min(3).max(20) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [org] = await db.select({ name: organizations.name }).from(organizations)
      .where(eq(organizations.referralCode, input.code.trim().toLowerCase())).limit(1);
    return org ? { schoolName: org.name } : null;
  }),

  /** Cadastro público da indicação (lead). */
  publicRegister: publicProcedure.input(z.object({
    code: z.string().min(3).max(20),
    schoolName: z.string().trim().min(2).max(255),
    email: z.string().trim().email("E-mail inválido").max(255),
    phone: z.string().trim().max(30).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const code = input.code.trim().toLowerCase();
    const [org] = await db.select({ id: organizations.id, email: organizations.email }).from(organizations)
      .where(eq(organizations.referralCode, code)).limit(1);
    if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Código de indicação inválido." });

    const email = input.email.trim().toLowerCase();
    if (org.email && String(org.email).toLowerCase() === email) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode indicar a própria escola." });
    }
    const [dup] = await db.select({ id: referrals.id }).from(referrals)
      .where(and(
        eq(referrals.code, code),
        sql`LOWER(${referrals.referredEmail}) = ${email}`,
        sql`${referrals.status} <> 'expirado'`,
      )).limit(1);
    if (dup) throw new TRPCError({ code: "CONFLICT", message: "Esta escola já foi indicada com este e-mail." });

    await db.insert(referrals).values({
      referrerOrganizationId: org.id,
      code,
      referredName: input.schoolName.trim(),
      referredEmail: email,
      referredPhone: input.phone?.trim() || null,
    });
    return { success: true };
  }),

  /** Painel da escola (admin): código + link de indicação. */
  getMyCode: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) return null;
    const org = await ensureOrgCode(db, ctx.user.organizationId!);
    return {
      code: org.referralCode,
      link: `${ENV.appUrl || "https://dancepro.wrmusicpro.com.br"}/indique?code=${org.referralCode}`,
    };
  }),

  /** Painel da escola (admin): indicações recebidas. */
  list: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(referrals)
      .where(eq(referrals.referrerOrganizationId, ctx.user.organizationId!))
      .orderBy(desc(referrals.createdAt)).limit(200);
  }),

  /** Suporte DancePro: marca o prêmio como aplicado. */
  markCredited: protectedProcedure.input(z.object({
    id: z.number(),
    notes: z.string().max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    const isSuperAdmin = Boolean(ctx.user.email) && ENV.superAdminEmails.includes(String(ctx.user.email).toLowerCase().trim());
    if (!isSuperAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o suporte DancePro pode aplicar o prêmio." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    await db.update(referrals).set({
      status: "creditado",
      creditedAt: new Date(),
      notes: input.notes || null,
      updatedAt: new Date(),
    }).where(eq(referrals.id, input.id));
    return { success: true };
  }),
});
