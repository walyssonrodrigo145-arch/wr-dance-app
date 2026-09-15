import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { LATEST_RELEASE_VERSION, hasUnseenRelease } from "@shared/releases";

// "Novidades" (What's New) — conteúdo 100% automático via shared/releases.ts.
// Só o estado "já vi" é persistido por usuário (users.lastSeenReleaseVersion).
// Público: admin e professor (alunos não veem).
const ALLOWED_ROLES = ["admin", "professor"];

export const releasesRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ALLOWED_ROLES.includes(ctx.user.role)) {
      return {
        isAllowed: false,
        lastSeenVersion: null as string | null,
        latestVersion: LATEST_RELEASE_VERSION,
        hasUnseen: false,
      };
    }

    const db = await getDb();
    let lastSeen: string | null = null;
    if (db && ctx.user.organizationId) {
      const [row] = await db
        .select({ v: users.lastSeenReleaseVersion })
        .from(users)
        .where(and(eq(users.id, ctx.user.id), eq(users.organizationId, ctx.user.organizationId)))
        .limit(1);
      lastSeen = row?.v ?? null;
    }

    return {
      isAllowed: true,
      lastSeenVersion: lastSeen,
      latestVersion: LATEST_RELEASE_VERSION,
      hasUnseen: hasUnseenRelease(lastSeen),
    };
  }),

  markSeen: protectedProcedure
    .input(z.object({ version: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_ROLES.includes(ctx.user.role)) {
        return { success: false as const };
      }
      const db = await getDb();
      if (!db || !ctx.user.organizationId) return { success: false as const };

      await db
        .update(users)
        .set({ lastSeenReleaseVersion: input.version, updatedAt: new Date() })
        .where(and(eq(users.id, ctx.user.id), eq(users.organizationId, ctx.user.organizationId)));

      return { success: true as const };
    }),
});
