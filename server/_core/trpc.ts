import { debugLog } from "./logger";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Rotas que nunca são bloqueadas pelo paywall (billing/cadastro/super admin).
const SUBSCRIPTION_GUARD_SKIP = ['platform.', 'auth.', 'publicData.', 'superAdmin.'];

/**
 * Paywall de assinatura (AUDITORIA P0-11): aplicado a TODOS os procedimentos
 * autenticados (admin/professor/aluno), não só ao protectedProcedure.
 * Super admin/owner nunca é bloqueado; impersonation segue as regras da escola.
 */
async function assertOrgSubscriptionAccess(ctx: TrpcContext, path: string) {
  const user = ctx.user;
  if (!user || !user.organizationId) return;
  if (SUBSCRIPTION_GUARD_SKIP.some((p) => path.startsWith(p))) return;

  const email = (user.email || "").toLowerCase().trim();
  if (user.openId === ENV.ownerOpenId) return;
  if (email && ENV.superAdminEmails.map((e) => e.toLowerCase().trim()).includes(email)) return;
  if (user.role !== 'admin' && user.role !== 'professor' && user.role !== 'aluno') return;

  const db = await import("../db").then(m => m.getDb());
  if (!db) return;
  const { organizations } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const [org] = await db.select({
    subscriptionStatus: organizations.subscriptionStatus,
    trialEndsAt: organizations.trialEndsAt,
  }).from(organizations).where(eq(organizations.id, user.organizationId)).limit(1);

  if (org) {
    const trialEndsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
    const isHardBlocked = trialEndsAt ? trialEndsAt < new Date() : false;
    const isSubscriptionActive = org.subscriptionStatus === "active";
    const hasAccess = isSubscriptionActive || (trialEndsAt && !isHardBlocked);
    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Acesso bloqueado: Assinatura pendente ou Trial expirado.",
      });
    }
  }
}

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  await assertOrgSubscriptionAccess(ctx, path);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    await assertOrgSubscriptionAccess(ctx, path);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const professorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path } = opts;

    if (!ctx.user || (ctx.user.role !== 'professor' && ctx.user.role !== 'admin' && ctx.user.openId !== ENV.ownerOpenId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a professores e administradores" });
    }

    await assertOrgSubscriptionAccess(ctx, path);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const studentProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path } = opts;

    if (!ctx.user) {
      console.warn("[studentProcedure] No user in context");
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
    }

    if (ctx.user.role !== 'aluno' && ctx.user.role !== 'admin') {
      console.warn(`[studentProcedure] Access denied for user ${ctx.user.id} with role ${ctx.user.role}`);
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a alunos" });
    }

    await assertOrgSubscriptionAccess(ctx, path);

    debugLog(`[studentProcedure] Access granted for student ${ctx.user.name} (studentId: ${ctx.user.studentId})`);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
