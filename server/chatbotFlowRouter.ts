import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { chatbotFlows, settings, students, lessons, paymentDues } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

// ─── Tipos e Estruturas do Fluxo ──────────────────────────────────────────────
export const ChatbotOptionSchema = z.object({
  id: z.string(),
  order: z.number(),
  digit: z.string(), // "1", "2", "3", "0", "99", "A", etc.
  title: z.string(),
  icon: z.string().optional().default("MessageSquare"),
  actionType: z.enum(["system_action", "text_reply", "human_transfer", "close_chat"]),
  systemAction: z.enum([
    "minhas_aulas",
    "financeiro",
    "agendar_aula",
    "reagendar_aula",
    "indicar_amigo",
    "matricula_link",
  ]).optional(),
  customReply: z.string().optional().default(""),
  isActive: z.boolean().default(true),
});

export type ChatbotOption = z.infer<typeof ChatbotOptionSchema>;

export const ChatbotFlowSchema = z.object({
  id: z.number().optional(),
  flowType: z.enum(["aluno", "lead"]),
  name: z.string().optional(),
  welcomeMessage: z.string(),
  fallbackMessage: z.string(),
  humanMessage: z.string(),
  exitMessage: z.string(),
  options: z.array(ChatbotOptionSchema),
  isActive: z.number().default(1),
});

export type ChatbotFlowData = z.infer<typeof ChatbotFlowSchema>;

// ─── Presets Padrão do Sistema ────────────────────────────────────────────────
export function getDefaultFlow(flowType: "aluno" | "lead"): ChatbotFlowData {
  if (flowType === "aluno") {
    return {
      flowType: "aluno",
      name: "Fluxo de Alunos Matriculados",
      welcomeMessage:
        "Oi, *{nome_aluno}*! Que alegria te ver por aqui! 🎵😊\n\nComo posso te ajudar hoje na *{nome_escola}*?",
      fallbackMessage:
        "Desculpe, não entendi essa opção. Por favor, digite o número de uma das opções do menu ou digite *MENU* para reiniciar. 😊",
      humanMessage:
        "Claro! Chamei o professor para te atender. Aguarde um instante! 🎸👤\n\n_Quando quiser voltar ao robô automático no futuro, é só digitar *MENU*._",
      exitMessage:
        "Atendimento encerrado! 😊\n\nFoi um prazer falar com você. Se precisar de algo no futuro, é só mandar uma mensagem ou digitar *MENU*! 🎵👋",
      isActive: 1,
      options: [
        {
          id: "opt-1",
          order: 1,
          digit: "1",
          title: "Minhas Aulas",
          icon: "Calendar",
          actionType: "system_action",
          systemAction: "minhas_aulas",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-2",
          order: 2,
          digit: "2",
          title: "Financeiro & Mensalidades",
          icon: "DollarSign",
          actionType: "system_action",
          systemAction: "financeiro",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-3",
          order: 3,
          digit: "3",
          title: "Agendar uma Aula",
          icon: "Clock",
          actionType: "system_action",
          systemAction: "agendar_aula",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-4",
          order: 4,
          digit: "4",
          title: "Reagendar Aula",
          icon: "RefreshCw",
          actionType: "system_action",
          systemAction: "reagendar_aula",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-5",
          order: 5,
          digit: "5",
          title: "Indicar um Amigo",
          icon: "Gift",
          actionType: "system_action",
          systemAction: "indicar_amigo",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-0",
          order: 6,
          digit: "0",
          title: "Falar com o Professor",
          icon: "User",
          actionType: "human_transfer",
          customReply: "",
          isActive: true,
        },
        {
          id: "opt-99",
          order: 7,
          digit: "99",
          title: "Encerrar Atendimento",
          icon: "XCircle",
          actionType: "close_chat",
          customReply: "",
          isActive: true,
        },
      ],
    };
  }

  return {
    flowType: "lead",
    name: "Fluxo de Novos Contatos / Visitantes",
    welcomeMessage:
      "Olá! Seja muito bem-vindo(a) à *{nome_escola}*! 🎶\n\nFicamos felizes com seu contato! Aqui você encontra as melhores aulas de música. 😊\n\nComo posso te ajudar?",
    fallbackMessage:
      "Desculpe, não compreendi. Por favor, digite o número de uma das opções ou digite *MENU* para ver as opções! 👇",
    humanMessage:
      "Encaminhei sua solicitação para nossa equipe! Um atendente/professor entrará em contato em instantes. 🎵👤",
    exitMessage:
      "Atendimento encerrado! 😊\n\nFicamos à disposição para quando quiser iniciar suas aulas de música! Até logo! 🎶",
    isActive: 1,
    options: [
      {
        id: "lead-1",
        order: 1,
        digit: "1",
        title: "Quero me matricular / Cursos e Planos",
        icon: "BookOpen",
        actionType: "system_action",
        systemAction: "matricula_link",
        customReply:
          "Que alegria! 🎵 Venha fazer parte da nossa escola!\n\nAcesse nosso link oficial para conferir nossos cursos, planos e fazer sua matrícula online:\n👉 {link_matricula}\n\nOu digite 2 para falar diretamente com nossa equipe!",
        isActive: true,
      },
      {
        id: "lead-2",
        order: 2,
        digit: "2",
        title: "Falar com nossa equipe / Professor",
        icon: "MessageSquare",
        actionType: "human_transfer",
        customReply: "",
        isActive: true,
      },
      {
        id: "lead-99",
        order: 3,
        digit: "99",
        title: "Encerrar Atendimento",
        icon: "XCircle",
        actionType: "close_chat",
        customReply: "",
        isActive: true,
      },
    ],
  };
}

// ─── Router tRPC ─────────────────────────────────────────────────────────────
export const chatbotFlowRouter = router({
  // 1. Obter fluxos da organização (Aluno e Lead)
  getFlows: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    const orgId = ctx.user.organizationId!;

    const dbFlows = await db
      .select()
      .from(chatbotFlows)
      .where(eq(chatbotFlows.organizationId, orgId));

    const alunoDb = dbFlows.find((f) => f.flowType === "aluno");
    const leadDb = dbFlows.find((f) => f.flowType === "lead");

    let alunoFlow: ChatbotFlowData;
    if (alunoDb) {
      let parsedOptions: ChatbotOption[] = [];
      try {
        parsedOptions = alunoDb.options ? JSON.parse(alunoDb.options) : [];
      } catch {
        parsedOptions = getDefaultFlow("aluno").options;
      }
      alunoFlow = {
        id: alunoDb.id,
        flowType: "aluno",
        name: alunoDb.name || "Fluxo de Alunos Matriculados",
        welcomeMessage: alunoDb.welcomeMessage || getDefaultFlow("aluno").welcomeMessage,
        fallbackMessage: alunoDb.fallbackMessage || getDefaultFlow("aluno").fallbackMessage,
        humanMessage: alunoDb.humanMessage || getDefaultFlow("aluno").humanMessage,
        exitMessage: alunoDb.exitMessage || getDefaultFlow("aluno").exitMessage,
        options: parsedOptions,
        isActive: alunoDb.isActive,
      };
    } else {
      alunoFlow = getDefaultFlow("aluno");
    }

    let leadFlow: ChatbotFlowData;
    if (leadDb) {
      let parsedOptions: ChatbotOption[] = [];
      try {
        parsedOptions = leadDb.options ? JSON.parse(leadDb.options) : [];
      } catch {
        parsedOptions = getDefaultFlow("lead").options;
      }
      leadFlow = {
        id: leadDb.id,
        flowType: "lead",
        name: leadDb.name || "Fluxo de Novos Contatos / Visitantes",
        welcomeMessage: leadDb.welcomeMessage || getDefaultFlow("lead").welcomeMessage,
        fallbackMessage: leadDb.fallbackMessage || getDefaultFlow("lead").fallbackMessage,
        humanMessage: leadDb.humanMessage || getDefaultFlow("lead").humanMessage,
        exitMessage: leadDb.exitMessage || getDefaultFlow("lead").exitMessage,
        options: parsedOptions,
        isActive: leadDb.isActive,
      };
    } else {
      leadFlow = getDefaultFlow("lead");
    }

    const [userSettings] = await db
      .select({
        schoolName: settings.schoolName,
        whatsappAutoSend: settings.whatsappAutoSend,
        chatbotEnabled: settings.chatbotEnabled,
      })
      .from(settings)
      .where(eq(settings.userId, ctx.user.id))
      .limit(1);

    return {
      alunoFlow,
      leadFlow,
      schoolName: userSettings?.schoolName || "Escola de Música",
      chatbotEnabled: (userSettings as any)?.chatbotEnabled === 1,
    };
  }),

  // 2. Salvar / Atualizar fluxo
  saveFlow: protectedProcedure
    .input(ChatbotFlowSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      const [existing] = await db
        .select()
        .from(chatbotFlows)
        .where(
          and(
            eq(chatbotFlows.organizationId, orgId),
            eq(chatbotFlows.flowType, input.flowType)
          )
        )
        .limit(1);

      const optionsJson = JSON.stringify(input.options);

      if (existing) {
        await db
          .update(chatbotFlows)
          .set({
            name: input.name,
            welcomeMessage: input.welcomeMessage,
            fallbackMessage: input.fallbackMessage,
            humanMessage: input.humanMessage,
            exitMessage: input.exitMessage,
            options: optionsJson,
            isActive: input.isActive,
            updatedAt: new Date(),
          })
          .where(eq(chatbotFlows.id, existing.id));

        return { success: true, message: "Fluxo atualizado com sucesso!", id: existing.id };
      } else {
        const [created] = await db
          .insert(chatbotFlows)
          .values({
            organizationId: orgId,
            userId: ctx.user.id,
            flowType: input.flowType,
            name: input.name,
            welcomeMessage: input.welcomeMessage,
            fallbackMessage: input.fallbackMessage,
            humanMessage: input.humanMessage,
            exitMessage: input.exitMessage,
            options: optionsJson,
            isActive: input.isActive,
          })
          .returning();

        return { success: true, message: "Fluxo salvo com sucesso!", id: created.id };
      }
    }),

  // 3. Restaurar padrão do sistema
  resetDefaultFlow: protectedProcedure
    .input(z.object({ flowType: z.enum(["aluno", "lead"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const orgId = ctx.user.organizationId!;

      await db
        .delete(chatbotFlows)
        .where(
          and(
            eq(chatbotFlows.organizationId, orgId),
            eq(chatbotFlows.flowType, input.flowType)
          )
        );

      return {
        success: true,
        message: `Fluxo de ${input.flowType === "aluno" ? "Alunos" : "Visitantes"} restaurado para o padrão com sucesso!`,
        flow: getDefaultFlow(input.flowType),
      };
    }),

  // 4. Simulador do WhatsApp em tempo real
  simulate: protectedProcedure
    .input(
      z.object({
        flowType: z.enum(["aluno", "lead"]),
        input: z.string(),
        currentState: z.string().default("START"),
        flowData: ChatbotFlowSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { flowType, input: userInput, currentState, flowData } = input;
      const text = userInput.trim();
      const textUpper = text.toUpperCase();

      const schoolName = "Sua Escola de Música";
      const studentName = "Aluno Teste";

      const interpolate = (msg: string) => {
        return msg
          .replace(/\{nome_aluno\}/g, studentName)
          .replace(/\{primeiro_nome\}/g, "Aluno")
          .replace(/\{nome_escola\}/g, schoolName)
          .replace(/\{link_matricula\}/g, "https://wrmusicpro.com.br/matricula/escola-exemplo")
          .replace(/\{link_portal\}/g, "https://wrmusicpro.com.br/aluno")
          .replace(/\{telefone\}/g, "(11) 99999-9999");
      };

      // Resposta ao comando MENU ou START
      if (textUpper === "MENU" || textUpper === "START" || textUpper === "OI" || textUpper === "OLÁ") {
        const activeOptions = flowData.options.filter((o) => o.isActive);
        activeOptions.sort((a, b) => a.order - b.order);

        let menuText = interpolate(flowData.welcomeMessage) + "\n\n";
        for (const opt of activeOptions) {
          const digitEmoji = opt.digit === "0" ? "0️⃣" : opt.digit === "99" ? "9️⃣9️⃣" : `${opt.digit}️⃣`;
          menuText += `${digitEmoji}  ${opt.title}\n`;
        }
        menuText += "\n_Digite o número da opção desejada_ 👇";

        return {
          reply: menuText,
          nextState: flowType === "aluno" ? "MENU_ALUNO" : "MENU_NOVO",
          actionExecuted: "show_menu",
        };
      }

      // Comando de Encerrar
      if (text === "99" || textUpper === "SAIR" || textUpper === "ENCERRAR" || textUpper === "TCHAU") {
        return {
          reply: interpolate(flowData.exitMessage),
          nextState: "AGUARDANDO_MENU",
          actionExecuted: "close_chat",
        };
      }

      // Comando de Falar com Humano
      if (text === "0" || textUpper === "HUMANO" || textUpper === "PROFESSOR") {
        return {
          reply: interpolate(flowData.humanMessage),
          nextState: "PAUSED_HUMAN",
          actionExecuted: "human_transfer",
        };
      }

      // Busca opção correspondente pelo dígito ou pelo título
      const matchedOpt = flowData.options.find(
        (o) => o.isActive && (o.digit === text || o.title.toLowerCase() === text.toLowerCase())
      );

      if (matchedOpt) {
        if (matchedOpt.actionType === "text_reply") {
          return {
            reply: interpolate(matchedOpt.customReply || "Opção selecionada! Como posso te ajudar mais? Digite *MENU* para voltar."),
            nextState: "MENU_ALUNO",
            actionExecuted: "text_reply",
          };
        }

        if (matchedOpt.actionType === "human_transfer") {
          return {
            reply: interpolate(flowData.humanMessage),
            nextState: "PAUSED_HUMAN",
            actionExecuted: "human_transfer",
          };
        }

        if (matchedOpt.actionType === "close_chat") {
          return {
            reply: interpolate(flowData.exitMessage),
            nextState: "AGUARDANDO_MENU",
            actionExecuted: "close_chat",
          };
        }

        if (matchedOpt.actionType === "system_action") {
          switch (matchedOpt.systemAction) {
            case "minhas_aulas":
              return {
                reply: `📅 *Suas Próximas Aulas:*\n\n1️⃣ Terça-feira (18/08) às 15:00 - *Violão*\n2️⃣ Quinta-feira (20/08) às 15:00 - *Violão*\n\n_Para reagendar ou ver detalhes, acesse seu Portal do Aluno:_ https://wrmusicpro.com.br/aluno\n\nDigite *MENU* para ver mais opções.`,
                nextState: "MENU_ALUNO",
                actionExecuted: "system_minhas_aulas",
              };
            case "financeiro":
              return {
                reply: `💰 *Financeiro / Mensalidades:*\n\n✅ Mensalidade Agosto: *PAGA*\n⏳ Próxima mensalidade (Setembro): R$ 150,00 (Vence em 10/09)\n\n💳 *Chave PIX:* financeiro@escola.com.br\n\nDigite *MENU* para voltar.`,
                nextState: "MENU_ALUNO",
                actionExecuted: "system_financeiro",
              };
            case "agendar_aula":
              return {
                reply: `📆 *Agendamento de Aulas:*\n\nTemos os seguintes horários disponíveis nesta semana:\n1️⃣ Quarta-feira às 14:00\n2️⃣ Sexta-feira às 10:00\n3️⃣ Sexta-feira às 16:30\n\nDigite o número do horário desejado ou digite *0* para falar com a secretaria!`,
                nextState: "AGENDANDO",
                actionExecuted: "system_agendar",
              };
            case "reagendar_aula":
              return {
                reply: `🔄 *Reagendamento de Aula:*\n\nVocê pode solicitar a troca de horário diretamente pelo Portal do Aluno:\n👉 https://wrmusicpro.com.br/aluno/agenda\n\nOu digite *0* para que o professor veja um novo horário com você!`,
                nextState: "MENU_ALUNO",
                actionExecuted: "system_reagendar",
              };
            case "indicar_amigo":
              return {
                reply: `🎁 *Indique um Amigo e Ganhe Desconto!*\n\nIndique amigos para a *${schoolName}*. Quando seu amigo se matricular, você ganha 20% de desconto na sua próxima mensalidade!\n\nCompartilhe esse link com ele:\n👉 https://wrmusicpro.com.br/matricula/escola-exemplo?ref=aluno-teste`,
                nextState: "MENU_ALUNO",
                actionExecuted: "system_indicar",
              };
            case "matricula_link":
              return {
                reply: interpolate(matchedOpt.customReply || "👉 Acesse nosso portal de matrículas: https://wrmusicpro.com.br/matricula/escola-exemplo"),
                nextState: "MENU_NOVO",
                actionExecuted: "system_matricula",
              };
          }
        }
      }

      // Opção inválida -> Fallback
      return {
        reply: interpolate(flowData.fallbackMessage),
        nextState: currentState,
        actionExecuted: "fallback",
      };
    }),
});
