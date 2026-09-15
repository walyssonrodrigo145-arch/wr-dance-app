// ─── Repertório do Aluno (PRD Repertório) ────────────────────────────────────
// Professor cadastra músicas via link do YouTube na aba "Repertório" do Progresso;
// o aluno executa com player embutido no portal (Materiais), sem sair do MusicPro.
// RN: professor só gerencia alunos dele (students.professorId); aluno só altera
// viewedAt/learnedAt do próprio repertório; iframe usa apenas IDs validados.

import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { professorProcedure, protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { studentRepertoire, students, notifications, users, type ChordDiagram } from "../../drizzle/schema";
import { handleDbError } from "../utils/error_handler";
import { extractYoutubeRef } from "../utils/youtubeUrl";
import { transposeChordSheet, transposeChordName, extractChordNames } from "../services/ChordTransposer";
import { fetchCifraHtml, parseCifraHtml, checkImportRateLimit, isCifraClubUrl } from "../services/CifraClubImporter";
import { getSettingsByUserId } from "../db";
import { ENV } from "../_core/env";

function isUserAdmin(ctx: { role: string; openId?: string | null }): boolean {
  return ctx.role === "admin" || ctx.openId === ENV.ownerOpenId;
}

// Campos de cifra compartilhados entre create/update (PRD Cifra — RN-001/RN-007)
const chordFieldsInput = {
  // Texto plano de acordes/estrutura — NUNCA letra (RN-007)
  chordSheet: z.string().max(50_000).optional(),
  chordKey: z.string().max(4).optional(),
  cifraclubUrl: z.string().max(2000).optional(),
  chordDiagrams: z
    .array(z.object({ name: z.string().max(20), mount: z.string().max(30), tuning: z.string().max(30) }))
    .max(40)
    .optional(),
};

function sanitizeChordFields(input: {
  chordSheet?: string;
  chordKey?: string;
  cifraclubUrl?: string;
  chordDiagrams?: { name: string; mount: string; tuning: string }[];
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.chordSheet !== undefined) {
    data.chordSheet = input.chordSheet.trim() === "" ? null : input.chordSheet.replace(/\r\n/g, "\n").slice(0, 50_000);
  }
  if (input.chordKey !== undefined) {
    data.chordKey = input.chordKey.trim() === "" ? null : input.chordKey.trim().slice(0, 4);
  }
  if (input.cifraclubUrl !== undefined) {
    if (input.cifraclubUrl.trim() === "") {
      data.cifraclubUrl = null;
    } else if (isCifraClubUrl(input.cifraclubUrl)) {
      data.cifraclubUrl = input.cifraclubUrl.trim();
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "URL inválida — use um link de cifraclub.com.br" });
    }
  }
  if (input.chordDiagrams !== undefined) {
    data.chordDiagrams = input.chordDiagrams.length === 0 ? null : input.chordDiagrams;
  }
  return data;
}

/** Escopo comum: professor só acessa repertório dos seus alunos (admin: todos). */
async function getOwnedRepertoireRow(db: any, orgId: number, id: number, ctx: { id: number; role: string; openId?: string | null }) {
  const [row] = await db
    .select({
      id: studentRepertoire.id,
      studentId: studentRepertoire.studentId,
      title: studentRepertoire.title,
      youtubeUrl: studentRepertoire.youtubeUrl,
      videoId: studentRepertoire.videoId,
      playlistId: studentRepertoire.playlistId,
      description: studentRepertoire.description,
      position: studentRepertoire.position,
      viewedAt: studentRepertoire.viewedAt,
      learnedAt: studentRepertoire.learnedAt,
      professorId: students.professorId,
    })
    .from(studentRepertoire)
    .leftJoin(students, eq(studentRepertoire.studentId, students.id))
    .where(
      and(
        eq(studentRepertoire.id, id),
        eq(studentRepertoire.organizationId, orgId),
        isUserAdmin(ctx) ? undefined : eq(students.professorId, ctx.id)
      )
    )
    .limit(1);
  return row ?? null;
}

export const repertoireRouters = {
  repertoire: router({
    // ── PROFESSOR ────────────────────────────────────────────────────────────
    list: professorProcedure
      .input(z.object({ studentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const isAdmin = isUserAdmin(ctx.user);
        const rows = await db
          .select()
          .from(studentRepertoire)
          .where(
            and(
              eq(studentRepertoire.organizationId, orgId),
              eq(studentRepertoire.studentId, input.studentId)
            )
          )
          .orderBy(asc(studentRepertoire.position), asc(studentRepertoire.id))
          .limit(100);
        console.log(`[Repertoire] list: user=${ctx.user.id}(${ctx.user.role}) org=${orgId} studentId=${input.studentId} rows=${rows.length}`);
        // RN-002: professor só lista repertório de alunos sob sua responsabilidade
        if (isAdmin) return rows;
        const [student] = await db
          .select({ professorId: students.professorId })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
          .limit(1);
        if (!student || student.professorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
        }
        return rows;
      }),

    create: professorProcedure
      .input(
        z.object({
          studentId: z.number(),
          youtubeUrl: z.string().min(5).max(2000),
          title: z.string().max(255).optional(),
          description: z.string().max(2000).optional(),
          ...chordFieldsInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const isAdmin = isUserAdmin(ctx.user);

          // RN-002: vínculo professor-aluno (admin acessa todos)
          const [student] = await db
            .select({ id: students.id, name: students.name, professorId: students.professorId, studentUserId: students.studentUserId })
            .from(students)
            .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
            .limit(1);
          if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });
          if (!isAdmin && student.professorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
          }

          // RN-005: extração server-side — iframe nunca recebe URL crua
          const ref = extractYoutubeRef(input.youtubeUrl);
          if (!ref) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Link do YouTube não reconhecido. Use o formato youtube.com/watch?v=..., youtu.be/... ou um link de playlist.",
            });
          }

          // RN-003: anti-duplicação por vídeo/aluno
          if (ref.videoId) {
            const [dup] = await db
              .select({ id: studentRepertoire.id })
              .from(studentRepertoire)
              .where(and(eq(studentRepertoire.studentId, input.studentId), eq(studentRepertoire.videoId, ref.videoId)))
              .limit(1);
            if (dup) {
              throw new TRPCError({ code: "CONFLICT", message: "Esta música já está no repertório deste aluno." });
            }
          }

          const [posRow] = await db
            .select({ maxPos: sql<number | null>`max(${studentRepertoire.position})` })
            .from(studentRepertoire)
            .where(and(eq(studentRepertoire.organizationId, orgId), eq(studentRepertoire.studentId, input.studentId)));
          const position = (posRow?.maxPos ?? -1) + 1;

          const [created] = await db
            .insert(studentRepertoire)
            .values({
              organizationId: orgId,
              studentId: input.studentId,
              createdByUserId: ctx.user.id,
              title: input.title?.trim() || `Música ${position + 1}`,
              youtubeUrl: input.youtubeUrl.trim(),
              videoId: ref.videoId,
              playlistId: ref.playlistId,
              description: input.description?.trim() || null,
              position,
              ...sanitizeChordFields(input),
            })
            .returning({ id: studentRepertoire.id });

          // Caça-Bug: students.studentUserId pode ser ÓRFÃO (user deletado).
          // Resolve o user REAL do aluno via users.studentId (fonte da verdade).
          let notifyUserId: number | null = student.studentUserId ?? null;
          const [realStudentUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.studentId, input.studentId), eq(users.role, "aluno")))
            .orderBy(desc(users.lastSignedIn))
            .limit(1);
          if (realStudentUser) notifyUserId = realStudentUser.id;

          // Notificação best-effort (padrão RN-003 do projeto)
          if (notifyUserId) {
            try {
              await db.insert(notifications).values({
                organizationId: orgId,
                userId: notifyUserId,
                title: "🎵 Nova música no seu repertório",
                message: `${input.title?.trim() || "Uma nova música"} foi adicionada pelo seu professor. Veja na aba Materiais.`,
                type: "info",
                actionUrl: "/aluno/materiais",
              });
              const { notifyUser } = await import("../_core/notification");
              await notifyUser(notifyUserId, {
                title: "🎵 Nova música no seu repertório",
                content: "Seu professor adicionou uma nova música. Ouça na aba Materiais!",
                url: "/aluno/materiais",
              }).catch(() => {});
            } catch (e) {
              console.error("[Repertoire] Falha não impeditiva ao notificar aluno:", e);
            }
          }

          // Autor do cadastro também recebe confirmação com o DESTINO da música (anti-ambiguidade)
          try {
            await db.insert(notifications).values({
              organizationId: orgId,
              userId: ctx.user.id,
              title: "🎵 Música adicionada",
              message: `"${input.title?.trim() || "Música"}" entrou no repertório de ${student.name}.`,
              type: "success",
            });
          } catch { /* best-effort */ }

          return { success: true, id: created.id, studentName: student.name };
        } catch (error) {
          return handleDbError(error, "adicionar a música ao repertório");
        }
      }),

    update: professorProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().max(255).optional(),
          description: z.string().max(2000).optional(),
          youtubeUrl: z.string().min(5).max(2000).optional(),
          ...chordFieldsInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const row = await getOwnedRepertoireRow(db, orgId, input.id, ctx.user);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada ou sem permissão." });

          const updateData: Record<string, unknown> = { updatedAt: new Date() };
          if (input.title !== undefined) updateData.title = input.title.trim() || row.title;
          if (input.description !== undefined) updateData.description = input.description.trim() || null;
          if (input.youtubeUrl !== undefined && input.youtubeUrl.trim() !== row.youtubeUrl) {
            const ref = extractYoutubeRef(input.youtubeUrl);
            if (!ref) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Link do YouTube não reconhecido." });
            }
            if (ref.videoId && ref.videoId !== row.videoId) {
              const [dup] = await db
                .select({ id: studentRepertoire.id })
                .from(studentRepertoire)
                .where(and(eq(studentRepertoire.studentId, row.studentId), eq(studentRepertoire.videoId, ref.videoId)))
                .limit(1);
              if (dup && dup.id !== row.id) {
                throw new TRPCError({ code: "CONFLICT", message: "Esta música já está no repertório deste aluno." });
              }
            }
            updateData.youtubeUrl = input.youtubeUrl.trim();
            updateData.videoId = ref.videoId;
            updateData.playlistId = ref.playlistId;
          }

          Object.assign(updateData, sanitizeChordFields(input));

          await db
            .update(studentRepertoire)
            .set(updateData)
            .where(and(eq(studentRepertoire.id, input.id), eq(studentRepertoire.organizationId, orgId)));
          return { success: true };
        } catch (error) {
          return handleDbError(error, "editar a música do repertório");
        }
      }),

    /** Exclusão definitiva (decisão do produto: some de vez, sem histórico). */
    delete: professorProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const row = await getOwnedRepertoireRow(db, orgId, input.id, ctx.user);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada ou sem permissão." });
        await db.delete(studentRepertoire).where(and(eq(studentRepertoire.id, input.id), eq(studentRepertoire.organizationId, orgId)));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "excluir a música do repertório");
      }
    }),

    /** Reordenação simples: troca de posição com o vizinho (subir/descer). */
    move: professorProcedure
      .input(z.object({ id: z.number(), direction: z.enum(["up", "down"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const row = await getOwnedRepertoireRow(db, orgId, input.id, ctx.user);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada ou sem permissão." });

          const all = await db
            .select({ id: studentRepertoire.id, position: studentRepertoire.position })
            .from(studentRepertoire)
            .where(and(eq(studentRepertoire.organizationId, orgId), eq(studentRepertoire.studentId, row.studentId)))
            .orderBy(asc(studentRepertoire.position), asc(studentRepertoire.id));

          const idx = all.findIndex((r: any) => r.id === input.id);
          const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
          if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) {
            return { success: true, moved: false };
          }
          const a = all[idx];
          const b = all[swapIdx];
          await db.update(studentRepertoire).set({ position: b.position, updatedAt: new Date() }).where(eq(studentRepertoire.id, a.id));
          await db.update(studentRepertoire).set({ position: a.position, updatedAt: new Date() }).where(eq(studentRepertoire.id, b.id));
          return { success: true, moved: true };
        } catch (error) {
          return handleDbError(error, "reordenar o repertório");
        }
      }),

    // ── ALUNO (RN-004: só viewed/learned do próprio repertório) ──────────────
    my: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      if (!ctx.user.studentId) return [];
      const rows = await db
        .select({
          id: studentRepertoire.id,
          title: studentRepertoire.title,
          // Link público da própria música — alimenta o fallback "Abrir no YouTube"
          // do portal quando o embed falha (ex: Erro 153 / embed desabilitado).
          youtubeUrl: studentRepertoire.youtubeUrl,
          videoId: studentRepertoire.videoId,
          playlistId: studentRepertoire.playlistId,
          description: studentRepertoire.description,
          position: studentRepertoire.position,
          viewedAt: studentRepertoire.viewedAt,
          learnedAt: studentRepertoire.learnedAt,
          createdAt: studentRepertoire.createdAt,
          // Flags leves — conteúdo pesado da cifra vem só no getChord
          hasChord: sql<boolean>`(${studentRepertoire.chordSheet} is not null)`.as("hasChord"),
          hasCifraClubUrl: sql<boolean>`(${studentRepertoire.cifraclubUrl} is not null)`.as("hasCifraClubUrl"),
        })
        .from(studentRepertoire)
        .where(
          and(
            eq(studentRepertoire.organizationId, orgId),
            eq(studentRepertoire.studentId, ctx.user.studentId),
            eq(studentRepertoire.active, true)
          )
        )
        .orderBy(asc(studentRepertoire.position), asc(studentRepertoire.id))
        .limit(50);
      console.log(`[Repertoire] my: user=${ctx.user.id} org=${orgId} studentId=${ctx.user.studentId} rows=${rows.length}`);
      return rows;
    }),

    markViewed: studentProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      if (!ctx.user.studentId) return { success: false };
      const [row] = await db
        .select({ id: studentRepertoire.id, studentId: studentRepertoire.studentId, viewedAt: studentRepertoire.viewedAt })
        .from(studentRepertoire)
        .where(
          and(
            eq(studentRepertoire.id, input.id),
            eq(studentRepertoire.organizationId, orgId),
            eq(studentRepertoire.studentId, ctx.user.studentId)
          )
        )
        .limit(1);
      // Guard explícito em JS (defesa em profundidade além do WHERE)
      if (!row || row.studentId !== ctx.user.studentId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada." });
      }
      if (!row.viewedAt) {
        await db
          .update(studentRepertoire)
          .set({ viewedAt: new Date(), updatedAt: new Date() })
          .where(eq(studentRepertoire.id, row.id));
      }
      return { success: true };
    }),

    /** Toggle "Aprendida" — NÃO bloqueia reescuta (decisão do produto). */
    toggleLearned: studentProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      if (!ctx.user.studentId) return { success: false, learned: false };
      const [row] = await db
        .select({ id: studentRepertoire.id, studentId: studentRepertoire.studentId, learnedAt: studentRepertoire.learnedAt })
        .from(studentRepertoire)
        .where(
          and(
            eq(studentRepertoire.id, input.id),
            eq(studentRepertoire.organizationId, orgId),
            eq(studentRepertoire.studentId, ctx.user.studentId)
          )
        )
        .limit(1);
      // Guard explícito em JS (defesa em profundidade além do WHERE)
      if (!row || row.studentId !== ctx.user.studentId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada." });
      }
      const learned = !row.learnedAt;
      await db
        .update(studentRepertoire)
        .set({ learnedAt: learned ? new Date() : null, updatedAt: new Date() })
        .where(eq(studentRepertoire.id, row.id));
      return { success: true, learned };
    }),

    /**
     * Move a música para o repertório de OUTRO aluno (correção de destino).
     * Professor precisa ser dono do aluno de origem E do destino (admin: ambos).
     * Anti-duplicação: o mesmo vídeo não pode existir 2x no repertório do destino.
     */
    moveToStudent: professorProcedure
      .input(z.object({ id: z.number(), targetStudentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const isAdmin = isUserAdmin(ctx.user);

          const row = await getOwnedRepertoireRow(db, orgId, input.id, ctx.user);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada ou sem permissão." });
          if (row.studentId === input.targetStudentId) {
            return { success: true, moved: false };
          }

          // Dono do aluno DESTINO (admin bypass)
          const [target] = await db
            .select({ id: students.id, name: students.name, professorId: students.professorId })
            .from(students)
            .where(and(eq(students.id, input.targetStudentId), eq(students.organizationId, orgId)))
            .limit(1);
          if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno de destino não encontrado." });
          if (!isAdmin && target.professorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre o aluno de destino." });
          }

          // Anti-duplicação no destino (RN-003)
          if (row.videoId) {
            const [dup] = await db
              .select({ id: studentRepertoire.id })
              .from(studentRepertoire)
              .where(and(eq(studentRepertoire.studentId, input.targetStudentId), eq(studentRepertoire.videoId, row.videoId)))
              .limit(1);
            if (dup) {
              throw new TRPCError({ code: "CONFLICT", message: `Este vídeo já está no repertório de ${target.name}.` });
            }
          }

          const [posRow] = await db
            .select({ maxPos: sql<number | null>`max(${studentRepertoire.position})` })
            .from(studentRepertoire)
            .where(and(eq(studentRepertoire.organizationId, orgId), eq(studentRepertoire.studentId, input.targetStudentId)));
          const position = (posRow?.maxPos ?? -1) + 1;

          await db
            .update(studentRepertoire)
            .set({ studentId: input.targetStudentId, position, viewedAt: null, learnedAt: null, updatedAt: new Date() })
            .where(and(eq(studentRepertoire.id, row.id), eq(studentRepertoire.organizationId, orgId)));

          // Notifica o novo aluno (user real via users.studentId — fonte da verdade)
          try {
            const [realUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.studentId, input.targetStudentId), eq(users.role, "aluno")))
              .orderBy(desc(users.lastSignedIn))
              .limit(1);
            if (realUser) {
              await db.insert(notifications).values({
                organizationId: orgId,
                userId: realUser.id,
                title: "🎵 Nova música no seu repertório",
                message: `${row.title} foi adicionada pelo seu professor. Veja na aba Materiais.`,
                type: "info",
                actionUrl: "/aluno/materiais",
              });
            }
          } catch (e) {
            console.error("[Repertoire] Falha não impeditiva ao notificar destino:", e);
          }

          return { success: true, moved: true, targetName: target.name };
        } catch (error) {
          return handleDbError(error, "mover a música para outro aluno");
        }
      }),

    /** src do iframe para o client — construído a partir dos IDs validados. */
    embed: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [row] = await db
          .select({
            videoId: studentRepertoire.videoId,
            playlistId: studentRepertoire.playlistId,
            studentId: studentRepertoire.studentId,
            professorId: students.professorId,
            studentUserId: students.studentUserId,
          })
          .from(studentRepertoire)
          .leftJoin(students, eq(studentRepertoire.studentId, students.id))
          .where(and(eq(studentRepertoire.id, input.id), eq(studentRepertoire.organizationId, orgId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada." });
        // Permissão: dono do aluno (professor), admin, ou o próprio aluno
        const isOwner =
          isUserAdmin(ctx.user) ||
          row.professorId === ctx.user.id ||
          (ctx.user.role === "aluno" && ctx.user.studentId === row.studentId) ||
          row.studentUserId === ctx.user.id;
        if (!isOwner) throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
        // src montada APENAS a partir dos IDs persistidos (RN-005 — nunca da URL crua)
        // Host padrão youtube.com — nocookie disparava "Erro 153" no player
        const src = row.videoId
          ? `https://www.youtube.com/embed/${row.videoId}?rel=0&playsinline=1${row.playlistId ? `&list=${row.playlistId}` : ""}`
          : row.playlistId
            ? `https://www.youtube.com/embed/videoseries?list=${row.playlistId}&rel=0&playsinline=1`
            : null;
        if (!src) throw new TRPCError({ code: "BAD_REQUEST", message: "Link sem vídeo/playlist válido." });
        return { src };
      }),

    // ── CIFRA (PRD Cifra) ─────────────────────────────────────────────────────
    /** Lê a cifra armazenada (professor dono, admin ou o próprio aluno). */
    getChord: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      const [row] = await db
        .select({
          chordSheet: studentRepertoire.chordSheet,
          chordKey: studentRepertoire.chordKey,
          chordDiagrams: studentRepertoire.chordDiagrams,
          cifraclubUrl: studentRepertoire.cifraclubUrl,
          studentId: studentRepertoire.studentId,
          professorId: students.professorId,
          studentUserId: students.studentUserId,
        })
        .from(studentRepertoire)
        .leftJoin(students, eq(studentRepertoire.studentId, students.id))
        .where(and(eq(studentRepertoire.id, input.id), eq(studentRepertoire.organizationId, orgId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada." });
      const isOwner =
        isUserAdmin(ctx.user) ||
        row.professorId === ctx.user.id ||
        (ctx.user.role === "aluno" && ctx.user.studentId === row.studentId) ||
        row.studentUserId === ctx.user.id;
      if (!isOwner) throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
      return {
        chordSheet: row.chordSheet,
        chordKey: row.chordKey,
        diagrams: row.chordDiagrams ?? [],
        cifraclubUrl: row.cifraclubUrl,
      };
    }),

    /** Transposição server-side (RN-003) — o aluno só envia o semitom. Com cache. */
    transposeChord: protectedProcedure
      .input(z.object({ id: z.number(), semitons: z.number().int().min(-11).max(11) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [row] = await db
          .select({
            chordSheet: studentRepertoire.chordSheet,
            chordKey: studentRepertoire.chordKey,
            chordDiagrams: studentRepertoire.chordDiagrams,
            studentId: studentRepertoire.studentId,
            professorId: students.professorId,
            studentUserId: students.studentUserId,
          })
          .from(studentRepertoire)
          .leftJoin(students, eq(studentRepertoire.studentId, students.id))
          .where(and(eq(studentRepertoire.id, input.id), eq(studentRepertoire.organizationId, orgId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Música não encontrada." });
        const isOwner =
          isUserAdmin(ctx.user) ||
          row.professorId === ctx.user.id ||
          (ctx.user.role === "aluno" && ctx.user.studentId === row.studentId) ||
          row.studentUserId === ctx.user.id;
        if (!isOwner) throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão sobre este aluno." });
        if (!row.chordSheet) return { chordSheet: "", chordKey: row.chordKey, diagrams: [] };

        const cacheKey = `${input.id}:${input.semitons}`;
        let transposed = transposeCache.get(cacheKey);
        if (!transposed) {
          transposed = transposeChordSheet(row.chordSheet, input.semitons);
          if (transposeCache.size > 300) transposeCache.clear();
          transposeCache.set(cacheKey, transposed);
        }
        const key = row.chordKey ? transposeChordName(row.chordKey, input.semitons) : row.chordKey;
        // Diagramas dos acordes presentes na cifra JÁ transposta
        const presentNames = new Set(extractChordNames(transposed));
        const diagrams = (row.chordDiagrams ?? []).filter((d) => presentNames.has(d.name));
        return { chordSheet: transposed, chordKey: key, diagrams };
      }),

    /**
     * Importa cifra do Cifra Club (RF-006): professor cola a URL, o server
     * extrai SÓ acordes/tom/estrutura/diagramas — a letra é descartada (RN-007).
     * Retorna os dados para preview; o professor salva via update/create.
     */
    importCifraClub: professorProcedure
      .input(z.object({ url: z.string().min(10).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;

        // Flag da escola (RN-008) — default ON, pode ser desligado por linha de config
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        if (settingsData && (settingsData as any).cifraClubImportEnabled === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Importação do Cifra Club desativada para esta escola." });
        }

        if (!isCifraClubUrl(input.url)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "URL inválida — use um link de cifraclub.com.br" });
        }

        const limit = checkImportRateLimit(orgId);
        if (!limit.ok) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas importações seguidas. Tente novamente mais tarde." });
        }

        let html: string;
        try {
          html = await fetchCifraHtml(input.url.trim());
        } catch (e: any) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Não foi possível acessar a cifra no Cifra Club agora. Copie e cole manualmente (aba Cifra).",
          });
        }
        const parsed = parseCifraHtml(html);
        if (!parsed) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message: "Não foi possível extrair os acordes desta página — confira se o link é de uma cifra. Você pode copiar e colar manualmente.",
          });
        }
        return { ...parsed, sourceUrl: input.url.trim() };
      }),
  }),
};

// Cache em memória das transposições (server restart limpa — aceitável)
const transposeCache = new Map<string, string>();
