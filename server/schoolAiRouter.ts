import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { schoolKnowledgeBase, settings } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { callGemini } from "./utils/gemini";
import { resolveAiCredentials } from "./utils/aiProvider";
import { buildSchoolKnowledgePrompt, buildKnowledgeContext, AI_PROMPT_VERSIONS } from "./utils/aiPrompts";

// ─── Tópicos Padrão Sugeridos para Escolas de Música ──────────────────────────
export const DEFAULT_SUGGESTED_TOPICS = [
  {
    title: "📍 Onde estamos & Localização",
    category: "localizacao",
    content:
      "Nossa escola fica localizada em fácil acesso no centro da cidade. Contamos com salas climatizadas, isolamento acústico e estacionamento/parada rápida para embarque e desembarque de alunos.",
  },
  {
    title: "👶 Idade Mínima & Musicalização Infantil",
    category: "faq_geral",
    content:
      "Atendemos crianças a partir de 3 a 4 anos com Musicalização Infantil (desenvolvimento rítmico, auditivo e motor de forma lúdica). Para instrumentos como violão, teclado, bateria e canto, a idade recomendada inicial é a partir de 6 a 7 anos, além de turmas completas para jovens e adultos de qualquer idade.",
  },
  {
    title: "🎸 Cursos Oferecidos & Metodologia",
    category: "cursos_precos",
    content:
      "Oferecemos aulas de Violão, Guitarra, Teclado/Piano, Bateria, Baixo, Canto/Técnica Vocal, Ukulele e Musicalização Infantil. Nossas aulas são 100% práticas desde o primeiro dia, unindo teoria musical aplicada ao repertório que o aluno mais gosta de ouvir e tocar.",
  },
  {
    title: "💰 Valores, Planos & Formas de Pagamento",
    category: "cursos_precos",
    content:
      "Temos planos mensais e recorrentes com valores acessíveis e materiais didáticos inclusos. Aceitamos PIX, Cartão de Crédito e Boleto Bancário. Para conferir a tabela completa de valores e garantir sua vaga com desconto promocional, acesse nossa página de matrícula online.",
  },
  {
    title: "⏰ Horários de Funcionamento & Sábados",
    category: "faq_geral",
    content:
      "Funcionamos de Segunda a Sexta das 08h às 21h e aos Sábados das 08h às 14h. As aulas são agendadas com horários fixos semanais de 50 a 60 minutos.",
  },
  {
    title: "🔄 Política de Faltas & Aulas de Reposição",
    category: "politicas",
    content:
      "Em caso de imprevisto, o aluno pode avisar com antecedência de no mínimo 2 a 4 horas pelo WhatsApp ou pelo Portal do Aluno para ter direito ao reagendamento da aula dentro do mês vigente.",
  },
];

export const schoolAiRouter = router({
  // 1. Listar tópicos da base de conhecimento da escola
  getKnowledgeBase: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    const orgId = ctx.user.organizationId!;

    let topics = await db
      .select()
      .from(schoolKnowledgeBase)
      .where(eq(schoolKnowledgeBase.organizationId, orgId))
      .orderBy(schoolKnowledgeBase.id);

    // Se a escola ainda não tiver tópicos, cria os padrões sugeridos automaticamente
    if (topics.length === 0) {
      for (const t of DEFAULT_SUGGESTED_TOPICS) {
        await db.insert(schoolKnowledgeBase).values({
          organizationId: orgId,
          userId: ctx.user.id,
          title: t.title,
          category: t.category,
          content: t.content,
          isActive: 1,
        });
      }

      topics = await db
        .select()
        .from(schoolKnowledgeBase)
        .where(eq(schoolKnowledgeBase.organizationId, orgId))
        .orderBy(schoolKnowledgeBase.id);
    }

    const [userSettings] = await db
      .select({
        schoolName: settings.schoolName,
        aiProvider: settings.aiProvider,
        pixKey: settings.pixKey,
      })
      .from(settings)
      .where(eq(settings.userId, ctx.user.id))
      .limit(1);

    return {
      topics,
      schoolName: userSettings?.schoolName || "Escola de Música",
    };
  }),

  // 2. Criar ou Atualizar tópico
  upsertTopic: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        title: z.string().min(2, "Título obrigatório"),
        category: z.string().default("faq_geral"),
        content: z.string().min(5, "Conteúdo obrigatório"),
        isActive: z.number().default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      if (input.id) {
        await db
          .update(schoolKnowledgeBase)
          .set({
            title: input.title,
            category: input.category,
            content: input.content,
            isActive: input.isActive,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schoolKnowledgeBase.id, input.id),
              eq(schoolKnowledgeBase.organizationId, orgId)
            )
          );

        return { success: true, message: "Tópico de conhecimento atualizado! ✅" };
      } else {
        const [created] = await db
          .insert(schoolKnowledgeBase)
          .values({
            organizationId: orgId,
            userId: ctx.user.id,
            title: input.title,
            category: input.category,
            content: input.content,
            isActive: input.isActive,
          })
          .returning();

        return { success: true, message: "Novo tópico adicionado à IA! ✅", id: created.id };
      }
    }),

  // 3. Excluir tópico
  deleteTopic: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      await db
        .delete(schoolKnowledgeBase)
        .where(
          and(
            eq(schoolKnowledgeBase.id, input.id),
            eq(schoolKnowledgeBase.organizationId, orgId)
          )
        );

      return { success: true, message: "Tópico removido." };
    }),

  // 4. Ativar / Desativar tópico
  toggleTopic: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      await db
        .update(schoolKnowledgeBase)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(
          and(
            eq(schoolKnowledgeBase.id, input.id),
            eq(schoolKnowledgeBase.organizationId, orgId)
          )
        );

      return { success: true };
    }),

  // 5. Testador / Simulador em tempo real da IA com a Base de Conhecimento (RAG)
  testAiResponse: protectedProcedure
    .input(
      z.object({
        question: z.string(),
        flowType: z.enum(["aluno", "lead"]).default("lead"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      // 1. Carrega configurações da escola
      let [userSettings] = await db
        .select({
          schoolName: settings.schoolName,
          aiProvider: settings.aiProvider,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          groqApiKey: settings.groqApiKey,
          groqModel: settings.groqModel,
          opencodeApiKey: (settings as any).opencodeApiKey,
          opencodeModel: (settings as any).opencodeModel,
          attendanceTone: settings.attendanceTone,
          attendancePersonaName: settings.attendancePersonaName,
          pixKey: settings.pixKey,
        })
        .from(settings)
        .where(eq(settings.userId, ctx.user.id))
        .limit(1);

      if (!userSettings?.groqApiKey && !userSettings?.geminiApiKey && !userSettings?.opencodeApiKey) {
        const [orgSettings] = await db
          .select({
            schoolName: settings.schoolName,
            aiProvider: settings.aiProvider,
            geminiApiKey: settings.geminiApiKey,
            geminiModel: settings.geminiModel,
            groqApiKey: settings.groqApiKey,
            groqModel: settings.groqModel,
            opencodeApiKey: (settings as any).opencodeApiKey,
            opencodeModel: (settings as any).opencodeModel,
            attendanceTone: settings.attendanceTone,
            attendancePersonaName: settings.attendancePersonaName,
            pixKey: settings.pixKey,
          })
          .from(settings)
          .where(eq(settings.organizationId, orgId))
          .limit(1);
        if (orgSettings) {
          userSettings = orgSettings;
        }
      }

      const schoolName = userSettings?.schoolName || "Nossa Escola de Música";

      // 2. Carrega tópicos ativos da Base de Conhecimento
      // RF-008: caps (20 tópicos × 4.000 chars) via helper único
      const activeTopics = await db
        .select()
        .from(schoolKnowledgeBase)
        .where(
          and(
            eq(schoolKnowledgeBase.organizationId, orgId),
            eq(schoolKnowledgeBase.isActive, 1)
          )
        );

      const knowledgeContext = buildKnowledgeContext(
        activeTopics.map(t => ({ title: t.title, content: t.content })),
        20,
        4000
      );

      const enrollmentLink = `${process.env.APP_URL || "https://wrmusicpro.com.br"}/matricula/${schoolName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

      // RF-004: fonte única da atendente (mesma personalidade/tom do atendimento real)
      const systemPrompt = buildSchoolKnowledgePrompt({
        schoolName,
        personaName: userSettings?.attendancePersonaName,
        tone: userSettings?.attendanceTone,
        knowledgeContext,
        enrollmentLink,
      });

      // RF-002: resolução unificada (suporta gemini|groq|opencode)
      const creds = resolveAiCredentials(userSettings);

      try {
        const response = await callGemini(
          [{ role: "user", content: input.question }],
          systemPrompt,
          false,
          creds.apiKey,
          creds.model,
          0.4,
          {
            organizationId: orgId,
            userId: ctx.user.id,
            feature: "atendente_teste",
            promptVersion: AI_PROMPT_VERSIONS.atendenteRAG,
          }
        );

        return {
          reply: response,
          usedTopicsCount: activeTopics.length,
          isError: false,
          error: null,
        };
      } catch (err: any) {
        console.error("[Test AI Error]:", err);
        return {
          reply: `⚠️ *Não foi possível consultar a IA no momento.* (${err.message})\n\n💡 *Dica:* Verifique se a sua chave de API e o modelo estão corretos na aba *Configurações > Inteligência Artificial*.\n\n--- Mensagem de Contingência Enviada ao Cliente ---\nOlá! Muito obrigado pelo interesse na *${schoolName}*! 🎵✨\n\nNossa equipe pedagógica terá enorme prazer em tirar todas as suas dúvidas sobre aulas, valores e horários disponíveis!\n\nVocê também pode conhecer nossos cursos e realizar sua matrícula online aqui: 👉 ${enrollmentLink}`,
          usedTopicsCount: activeTopics.length,
          isError: true,
          error: err.message,
        };
      }
    }),
});
