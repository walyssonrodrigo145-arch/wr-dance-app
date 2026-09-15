import { debugLog } from "./logger";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // ── Bloqueio de Inadimplência na API (Segurança Extra) ──
  if (!path.startsWith('platform.') && !path.startsWith('auth.') && !path.startsWith('publicData.')) {
    if ((ctx.user.role === 'admin' || ctx.user.role === 'professor') && ctx.user.organizationId) {
      const db = await import("../db").then(m => m.getDb());
      if (db) {
        const { organizations } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const [org] = await db.select({ 
          subscriptionStatus: organizations.subscriptionStatus,
          trialEndsAt: organizations.trialEndsAt 
        }).from(organizations).where(eq(organizations.id, ctx.user.organizationId)).limit(1);

        if (org) {
          const trialEndsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
          const isHardBlocked = trialEndsAt ? trialEndsAt < new Date() : false;
          const isSubscriptionActive = org.subscriptionStatus === "active";
          
          const hasAccess = isSubscriptionActive || (trialEndsAt && !isHardBlocked);
          
          if (!hasAccess) {
            throw new TRPCError({ 
              code: "FORBIDDEN", 
              message: "Acesso bloqueado: Assinatura pendente ou Trial expirado." 
            });
          }
        }
      }
    }
  }

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
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

import { ENV } from "./env";

export const professorProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'professor' && ctx.user.role !== 'admin' && ctx.user.openId !== ENV.ownerOpenId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a professores e administradores" });
    }

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
    const { ctx, next } = opts;

    if (!ctx.user) {
      console.warn("[studentProcedure] No user in context");
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
    }

    if (ctx.user.role !== 'aluno' && ctx.user.role !== 'admin') {
      console.warn(`[studentProcedure] Access denied for user ${ctx.user.id} with role ${ctx.user.role}`);
      throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a alunos" });
    }
    
    debugLog(`[studentProcedure] Access granted for student ${ctx.user.name} (studentId: ${ctx.user.studentId})`);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
