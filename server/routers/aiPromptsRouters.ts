// ─── IA: Especialistas Personalizados + Gestão de Prompts Versionada (PRD 02) ──
// Especialistas padrão vivem em server/services/InstrumentSpecialistService.ts
// (hardcoded, imutáveis por escola). Aqui ficam os personalizados (ai_specialists)
// e a gestão de prompts com versionamento (ai_prompts + ai_prompt_versions).
// RN: só admin altera; chaves de API nunca saem do servidor.

import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb, getSettingsByUserId } from "../db";
import { adminProcedure, professorProcedure, router } from "../_core/trpc";
import { aiSpecialists, aiPrompts, aiPromptVersions } from "../../drizzle/schema";
import { handleDbError } from "../utils/error_handler";
import { resolveAiCredentials } from "../utils/aiProvider";
import { renderPromptVariables, defaultPromptVariables } from "../services/PromptVariables";
import { INSTRUMENT_SPECIALISTS } from "../services/InstrumentSpecialistService";

const BUILTIN_ICONS: Record<string, string> = {
  cordas_dedilhadas: "🎸",
  teclado: "🎹",
  percussao: "🥁",
  baixo: "🎸",
  piano: "🎹",
  voz: "🎤",
  sopro: "🎷",
  cordas_arco: "🎻",
  geral: "🎵",
};

export const aiSpecialistsRouters = {
  aiSpecialists: router({
    /** Lista mesclada: especialistas padrão + personalizados (usada na seleção do gerador). */
    listMerged: professorProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const builtins = Object.entries(INSTRUMENT_SPECIALISTS).map(([key, sp]) => ({
        ref: `builtin:${key}`,
        name: sp.displayName,
        area: key,
        icon: BUILTIN_ICONS[key] || "🎵",
        description: sp.pedagogicalGuidelines || "",
        source: "padrao" as const,
        active: true,
      }));
      if (!db) return builtins;
      const orgId = ctx.user.organizationId!;
      const rows = await db
        .select()
        .from(aiSpecialists)
        .where(eq(aiSpecialists.organizationId, orgId))
        .orderBy(desc(aiSpecialists.createdAt));
      const custom = rows.map((r) => ({
        ref: `custom:${r.id}`,
        name: r.name,
        area: r.area || "",
        icon: r.icon || "🎼",
        description: r.description || "",
        source: "personalizado" as const,
        active: r.active,
      }));
      return [...builtins, ...custom];
    }),

    /** Lista apenas os personalizados (tela de gestão). */
    list: professorProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      return db
        .select()
        .from(aiSpecialists)
        .where(eq(aiSpecialists.organizationId, orgId))
        .orderBy(desc(aiSpecialists.createdAt));
    }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          area: z.string().max(120).optional(),
          icon: z.string().max(50).optional(),
          description: z.string().max(2000).optional(),
          systemPrompt: z.string().max(8000).optional(),
          pedagogicalInstructions: z.string().max(8000).optional(),
          technicalKnowledge: z.string().max(8000).optional(),
          aiModel: z.string().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [created] = await db
            .insert(aiSpecialists)
            .values({
              organizationId: orgId,
              name: input.name.trim(),
              area: input.area?.trim() || null,
              icon: input.icon?.trim() || "🎼",
              description: input.description?.trim() || null,
              systemPrompt: input.systemPrompt?.trim() || null,
              pedagogicalInstructions: input.pedagogicalInstructions?.trim() || null,
              technicalKnowledge: input.technicalKnowledge?.trim() || null,
              aiModel: input.aiModel?.trim() || null,
              createdByUserId: ctx.user.id,
            })
            .returning({ id: aiSpecialists.id });
          return { success: true, id: created.id };
        } catch (error) {
          return handleDbError(error, "criar o especialista de IA");
        }
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(120).optional(),
          area: z.string().max(120).optional(),
          icon: z.string().max(50).optional(),
          description: z.string().max(2000).optional(),
          systemPrompt: z.string().max(8000).optional(),
          pedagogicalInstructions: z.string().max(8000).optional(),
          technicalKnowledge: z.string().max(8000).optional(),
          aiModel: z.string().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const { id, ...data } = input;
          const updateData: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(data)) {
            if (v !== undefined) updateData[k] = typeof v === "string" ? v.trim() : v;
          }
          const result = await db
            .update(aiSpecialists)
            .set(updateData)
            .where(and(eq(aiSpecialists.id, id), eq(aiSpecialists.organizationId, orgId)));
          if (((result as any)?.count ?? 1) === 0) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Especialista não encontrado." });
          }
          return { success: true };
        } catch (error) {
          return handleDbError(error, "atualizar o especialista de IA");
        }
      }),

    toggle: adminProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          await db
            .update(aiSpecialists)
            .set({ active: input.active, updatedAt: new Date() })
            .where(and(eq(aiSpecialists.id, input.id), eq(aiSpecialists.organizationId, orgId)));
          return { success: true };
        } catch (error) {
          return handleDbError(error, "alterar o especialista de IA");
        }
      }),

    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        // Prompts ligados ao especialista também são removidos (referência quebrada)
        const linkedPrompts = await db
          .select({ id: aiPrompts.id })
          .from(aiPrompts)
          .where(and(eq(aiPrompts.specialistId, input.id), eq(aiPrompts.organizationId, orgId)));
        if (linkedPrompts.length > 0) {
          await db
            .delete(aiPromptVersions)
            .where(inArray(aiPromptVersions.promptId, linkedPrompts.map((p) => p.id)));
          await db.delete(aiPrompts).where(and(eq(aiPrompts.specialistId, input.id), eq(aiPrompts.organizationId, orgId)));
        }
        await db.delete(aiSpecialists).where(and(eq(aiSpecialists.id, input.id), eq(aiSpecialists.organizationId, orgId)));
        return { success: true };
      } catch (error) {
        return handleDbError(error, "excluir o especialista de IA");
      }
    }),
  }),

  aiPrompts: router({
    list: professorProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const rows = await db
        .select()
        .from(aiPrompts)
        .where(eq(aiPrompts.organizationId, orgId))
        .orderBy(desc(aiPrompts.updatedAt));
      const customNames = new Map<number, string>();
      if (rows.some((r) => r.specialistId)) {
        const custom = await db
          .select({ id: aiSpecialists.id, name: aiSpecialists.name })
          .from(aiSpecialists)
          .where(eq(aiSpecialists.organizationId, orgId));
        custom.forEach((c) => customNames.set(c.id, c.name));
      }
      return rows.map((r) => ({
        ...r,
        specialistName: r.specialistId
          ? customNames.get(r.specialistId) || `Especialista #${r.specialistId}`
          : r.specialistKey
            ? INSTRUMENT_SPECIALISTS[r.specialistKey as keyof typeof INSTRUMENT_SPECIALISTS]?.displayName || r.specialistKey
            : null,
      }));
    }),

    listVersions: professorProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const orgId = ctx.user.organizationId!;
      return db
        .select()
        .from(aiPromptVersions)
        .where(and(eq(aiPromptVersions.promptId, input.id), eq(aiPromptVersions.organizationId, orgId)))
        .orderBy(desc(aiPromptVersions.version));
    }),

    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          type: z.enum(["especialista", "geral"]).optional().default("especialista"),
          specialistKey: z.string().max(60).optional(),
          specialistId: z.number().optional(),
          content: z.string().min(1).max(20000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [created] = await db
            .insert(aiPrompts)
            .values({
              organizationId: orgId,
              name: input.name.trim(),
              type: input.type,
              specialistKey: input.specialistKey?.trim() || null,
              specialistId: input.specialistId ?? null,
              content: input.content,
              version: 1,
              createdByUserId: ctx.user.id,
            })
            .returning({ id: aiPrompts.id });
          await db.insert(aiPromptVersions).values({
            organizationId: orgId,
            promptId: created.id,
            version: 1,
            content: input.content,
            createdByUserId: ctx.user.id,
          });
          return { success: true, id: created.id };
        } catch (error) {
          return handleDbError(error, "criar o prompt de IA");
        }
      }),

    /** Salvar conteúdo cria NOVA versão — versões anteriores nunca são apagadas. */
    save: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(120).optional(),
          content: z.string().min(1).max(20000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [prompt] = await db
            .select()
            .from(aiPrompts)
            .where(and(eq(aiPrompts.id, input.id), eq(aiPrompts.organizationId, orgId)))
            .limit(1);
          if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt não encontrado." });

          const contentChanged = input.content !== undefined && input.content !== prompt.content;
          const newVersion = contentChanged ? prompt.version + 1 : prompt.version;
          await db
            .update(aiPrompts)
            .set({
              name: input.name !== undefined ? input.name.trim() : prompt.name,
              content: contentChanged ? input.content! : prompt.content,
              version: newVersion,
              updatedAt: new Date(),
            })
            .where(and(eq(aiPrompts.id, prompt.id), eq(aiPrompts.organizationId, orgId)));
          if (contentChanged) {
            await db.insert(aiPromptVersions).values({
              organizationId: orgId,
              promptId: prompt.id,
              version: newVersion,
              content: input.content!,
              createdByUserId: ctx.user.id,
            });
          }
          return { success: true, version: newVersion };
        } catch (error) {
          return handleDbError(error, "salvar o prompt de IA");
        }
      }),

    toggle: adminProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          await db
            .update(aiPrompts)
            .set({ active: input.active, updatedAt: new Date() })
            .where(and(eq(aiPrompts.id, input.id), eq(aiPrompts.organizationId, orgId)));
          return { success: true };
        } catch (error) {
          return handleDbError(error, "alterar o prompt de IA");
        }
      }),

    duplicate: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const [prompt] = await db
          .select()
          .from(aiPrompts)
          .where(and(eq(aiPrompts.id, input.id), eq(aiPrompts.organizationId, orgId)))
          .limit(1);
        if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt não encontrado." });
        const [created] = await db
          .insert(aiPrompts)
          .values({
            organizationId: orgId,
            name: `${prompt.name} (cópia)`.slice(0, 120),
            type: prompt.type,
            specialistKey: prompt.specialistKey,
            specialistId: prompt.specialistId,
            content: prompt.content,
            version: 1,
            createdByUserId: ctx.user.id,
          })
          .returning({ id: aiPrompts.id });
        await db.insert(aiPromptVersions).values({
          organizationId: orgId,
          promptId: created.id,
          version: 1,
          content: prompt.content,
          createdByUserId: ctx.user.id,
        });
        return { success: true, id: created.id };
      } catch (error) {
        return handleDbError(error, "duplicar o prompt de IA");
      }
    }),

    /** Restaurar versão antiga cria uma versão nova com o mesmo conteúdo (histórico append-only). */
    restoreVersion: adminProcedure
      .input(z.object({ id: z.number(), version: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          const orgId = ctx.user.organizationId!;
          const [prompt] = await db
            .select()
            .from(aiPrompts)
            .where(and(eq(aiPrompts.id, input.id), eq(aiPrompts.organizationId, orgId)))
            .limit(1);
          if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt não encontrado." });
          const [versionRow] = await db
            .select()
            .from(aiPromptVersions)
            .where(and(eq(aiPromptVersions.promptId, prompt.id), eq(aiPromptVersions.version, input.version)))
            .limit(1);
          if (!versionRow) throw new TRPCError({ code: "NOT_FOUND", message: "Versão não encontrada." });
          const newVersion = prompt.version + 1;
          await db
            .update(aiPrompts)
            .set({ content: versionRow.content, version: newVersion, updatedAt: new Date() })
            .where(and(eq(aiPrompts.id, prompt.id), eq(aiPrompts.organizationId, orgId)));
          await db.insert(aiPromptVersions).values({
            organizationId: orgId,
            promptId: prompt.id,
            version: newVersion,
            content: versionRow.content,
            createdByUserId: ctx.user.id,
          });
          return { success: true, version: newVersion };
        } catch (error) {
          return handleDbError(error, "restaurar a versão do prompt");
        }
      }),

    /** Teste de prompt: gera resposta de amostra — NÃO grava plano nem altera o aluno. */
    test: professorProcedure
      .input(
        z.object({
          content: z.string().min(1).max(20000),
          alunoNome: z.string().max(120).optional(),
          instrumento: z.string().max(120).optional(),
          nivel: z.string().max(40).optional(),
          objetivo: z.string().max(500).optional(),
          contexto: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const orgId = ctx.user.organizationId!;
        const settingsData = await getSettingsByUserId(orgId, ctx.user.id);
        const creds = resolveAiCredentials(settingsData);
        if (!creds.apiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Chave de API da IA não configurada. Acesse Configurações > IA Assistente.",
          });
        }
        const rendered = renderPromptVariables(
          input.content,
          defaultPromptVariables({
            alunoNome: input.alunoNome,
            alunoInstrumento: input.instrumento,
            alunoNivel: input.nivel,
            alunoObjetivo: input.objetivo,
          })
        );
        const testUserPrompt = `CONTEXTO DE TESTE:
- Aluno: ${input.alunoNome || "não informado"}
- Instrumento: ${input.instrumento || "não informado"}
- Nível: ${input.nivel || "não informado"}
- Objetivo: ${input.objetivo || "não informado"}
- Contexto adicional: ${input.contexto || "nenhum"}

Com base nas diretrizes acima, gere UM exercício de exemplo em pt-BR, com título, 3 passos curtos e um BPM recomendado. Seja conciso (máximo 120 palavras). Esta é apenas uma resposta de TESTE.`;

        const { callGemini } = await import("../utils/gemini");
        const response = await callGemini(
          [{ role: "user", content: testUserPrompt }],
          rendered,
          false,
          creds.apiKey,
          creds.model,
          0.4,
          {
            organizationId: orgId,
            userId: ctx.user.id,
            feature: "prompt_test",
            isJson: false,
            timeoutMs: 60_000,
          }
        );
        return { response, renderedPromptPreview: rendered.slice(0, 2000) };
      }),
  }),
};
