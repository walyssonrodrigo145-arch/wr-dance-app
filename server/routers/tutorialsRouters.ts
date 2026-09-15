// ─── Tutoriais do Sistema (PRD Tutoriais) ─────────────────────────────────────
// Vídeos do YouTube que explicam as funcionalidades do MusicPro.
// Gestão EXCLUSIVA do Superadmin (create/update/delete/move); leitura para
// admin/professor (aba "Tutoriais"). Mesmo mecanismo do Repertório:
// extractYoutubeRef server-side (RN-005: iframe só recebe IDs validados),
// player via VideoFacade/VideoThumb no client (Erro 153 tratado).

import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { systemTutorials } from "../../drizzle/schema";
import { handleDbError } from "../utils/error_handler";
import { extractYoutubeRef } from "../utils/youtubeUrl";
import { isSuperAdmin } from "../superAdminRouter";
import { ENV } from "../_core/env";

function isStaff(ctx: { role: string; openId?: string | null }): boolean {
  return ["admin", "professor", "superadmin"].includes(ctx.role) || ctx.openId === ENV.ownerOpenId;
}

export const tutorialsRouters = {
  tutorials: router({
  /** Lista os tutoriais ATIVOS para admin/professor (aba "Tutoriais"). */
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!isStaff(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar os tutoriais." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const rows = await db
      .select({
        id: systemTutorials.id,
        title: systemTutorials.title,
        youtubeUrl: systemTutorials.youtubeUrl,
        videoId: systemTutorials.videoId,
        playlistId: systemTutorials.playlistId,
        description: systemTutorials.description,
        category: systemTutorials.category,
        position: systemTutorials.position,
        createdAt: systemTutorials.createdAt,
      })
      .from(systemTutorials)
      .where(eq(systemTutorials.isActive, true))
      .orderBy(asc(systemTutorials.position), asc(systemTutorials.id))
      .limit(100);
    console.log(`[Tutorials] list: user=${ctx.user.id}(${ctx.user.role}) rows=${rows.length}`);
    return rows;
  }),

  /** Lista TODOS (ativos e inativos) — apenas para o master panel. */
  listAll: isSuperAdmin.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return await db
      .select()
      .from(systemTutorials)
      .orderBy(asc(systemTutorials.position), asc(systemTutorials.id))
      .limit(200);
  }),

  create: isSuperAdmin
    .input(
      z.object({
        youtubeUrl: z.string().min(5).max(2000),
        title: z.string().max(255).optional(),
        description: z.string().max(2000).optional(),
        category: z.string().max(60).optional(),
        position: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // RN-002: extração server-side — iframe nunca recebe URL crua
        const ref = extractYoutubeRef(input.youtubeUrl);
        if (!ref) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Link do YouTube não reconhecido. Use o formato youtube.com/watch?v=..., youtu.be/... ou um link de playlist.",
          });
        }

        const [posRow] = await db
          .select({ maxPos: sql<number | null>`max(${systemTutorials.position})` })
          .from(systemTutorials);
        const position = input.position ?? (posRow?.maxPos ?? -1) + 1;

        const [created] = await db
          .insert(systemTutorials)
          .values({
            title: input.title?.trim() || `Tutorial ${position + 1}`,
            youtubeUrl: input.youtubeUrl.trim(),
            videoId: ref.videoId,
            playlistId: ref.playlistId,
            description: input.description?.trim() || null,
            category: input.category?.trim() || "Geral",
            position,
            isActive: input.isActive ?? true,
            createdByUserId: ctx.user.id,
          })
          .returning({ id: systemTutorials.id });

        console.log(`[Tutorials] create: by=${ctx.user.id} id=${created.id} video=${ref.videoId ?? ref.playlistId}`);
        return { success: true, id: created.id };
      } catch (error) {
        return handleDbError(error, "criar o tutorial");
      }
    }),

  update: isSuperAdmin
    .input(
      z.object({
        id: z.number().int(),
        youtubeUrl: z.string().min(5).max(2000).optional(),
        title: z.string().max(255).optional(),
        description: z.string().max(2000).optional(),
        category: z.string().max(60).optional(),
        position: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [row] = await db.select().from(systemTutorials).where(eq(systemTutorials.id, input.id)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tutorial não encontrado." });

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (input.title !== undefined) updateData.title = input.title.trim() || row.title;
        if (input.description !== undefined) updateData.description = input.description.trim() || null;
        if (input.category !== undefined) updateData.category = input.category.trim() || "Geral";
        if (input.position !== undefined) updateData.position = input.position;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.youtubeUrl !== undefined && input.youtubeUrl.trim() !== row.youtubeUrl) {
          const ref = extractYoutubeRef(input.youtubeUrl);
          if (!ref) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Link do YouTube não reconhecido." });
          }
          updateData.youtubeUrl = input.youtubeUrl.trim();
          updateData.videoId = ref.videoId;
          updateData.playlistId = ref.playlistId;
        }

        await db.update(systemTutorials).set(updateData).where(eq(systemTutorials.id, input.id));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "editar o tutorial");
      }
    }),

  /** Exclusão definitiva (decisão do produto: some de vez, sem histórico). */
  delete: isSuperAdmin
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [row] = await db.select({ id: systemTutorials.id }).from(systemTutorials).where(eq(systemTutorials.id, input.id)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tutorial não encontrado." });
        await db.delete(systemTutorials).where(eq(systemTutorials.id, input.id));
        console.log(`[Tutorials] delete: id=${input.id}`);
        return { success: true };
      } catch (error) {
        return handleDbError(error, "excluir o tutorial");
      }
    }),

  /** Reordenação simples: troca de posição com o vizinho (subir/descer). */
  move: isSuperAdmin
    .input(z.object({ id: z.number().int(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const all = await db
          .select({ id: systemTutorials.id, position: systemTutorials.position })
          .from(systemTutorials)
          .orderBy(asc(systemTutorials.position), asc(systemTutorials.id));

        const idx = all.findIndex((r: any) => r.id === input.id);
        const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
        if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) {
          return { success: true, moved: false };
        }
        const a = all[idx];
        const b = all[swapIdx];
        await db.update(systemTutorials).set({ position: b.position, updatedAt: new Date() }).where(eq(systemTutorials.id, a.id));
        await db.update(systemTutorials).set({ position: a.position, updatedAt: new Date() }).where(eq(systemTutorials.id, b.id));
        return { success: true, moved: true };
      } catch (error) {
        return handleDbError(error, "reordenar o tutorial");
      }
    }),
  }),
};