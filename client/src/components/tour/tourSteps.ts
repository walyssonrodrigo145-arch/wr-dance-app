import { Step } from "react-joyride";

export const tourSteps: Step[] = [
  // ─────────────────────────────────────────────
  // Dashboard Steps
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Vamos começar o nosso tour guiado! Aqui você terá uma visão geral de toda a plataforma MusicPro.",
    title: "Bem-vindo ao Tour! 🚀",
    skipBeacon: true,
    isFixed: true,
  },
  {
    target: ".tour-sidebar-desktop #tour-sidebar",
    placement: "right",
    content: "Aqui no menu lateral você encontra todas as áreas do sistema, como Dashboard, Alunos, Financeiro e muito mais.",
    title: "Menu Principal",
    skipBeacon: true,
    isFixed: true,
  },
  {
    target: "#tour-dashboard-stats",
    placement: "bottom",
    content: "Estes são os seus indicadores principais. Resumem como está a saúde da sua escola, como total de alunos ativos e inadimplentes.",
    title: "Visão Geral",
    skipBeacon: true,
  },
  {
    target: "#tour-dashboard-charts",
    placement: "bottom",
    content: "Acompanhe o crescimento da sua escola mês a mês através destes gráficos financeiros e de retenção.",
    title: "Gráficos",
    skipBeacon: true,
  },
  {
    target: "#tour-user-menu",
    placement: "left",
    content: "Aqui você acessa o seu perfil, configurações do sistema e a opção de sair.",
    title: "Seu Perfil",
    skipBeacon: true,
    isFixed: true,
  },

  // ─────────────────────────────────────────────
  // Transição → Financeiro
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Agora vamos conhecer a área Financeira. Clique em 'Próximo' para mudarmos de tela.",
    title: "Vamos para o Financeiro? 💰",
    skipBeacon: true,
    isFixed: true,
    data: { navigateTo: "/financeiro" },
  },

  // ─────────────────────────────────────────────
  // Financeiro Steps
  // ─────────────────────────────────────────────
  {
    target: "#tour-finance-cards",
    placement: "bottom",
    content: "Aqui você tem o controle total das suas finanças: saldo líquido do mês, com receitas e despesas consolidadas.",
    title: "Resumo Financeiro",
    skipBeacon: true,
  },
  {
    target: "#tour-finance-tabs",
    placement: "bottom",
    content: "Você pode alternar entre Emissões (mensalidades dos alunos) e Despesas da escola.",
    title: "Abas Financeiras",
    skipBeacon: true,
  },
  {
    target: "#tour-new-charge",
    placement: "bottom",
    content: "Use este botão sempre que precisar gerar uma nova cobrança ou lançamento de mensalidade.",
    title: "Nova Cobrança",
    skipBeacon: true,
    isFixed: true,
  },

  // ─────────────────────────────────────────────
  // Transição → Agenda (Aulas)
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Excelente! Que tal vermos como funciona a Agenda de aulas? Clique em 'Próximo' para ir até lá.",
    title: "Hora da Agenda 📅",
    skipBeacon: true,
    isFixed: true,
    data: { navigateTo: "/aulas" },
  },

  // ─────────────────────────────────────────────
  // Agenda Steps
  // ─────────────────────────────────────────────
  {
    target: "#tour-calendar-view",
    placement: "right",
    content: "Aqui fica o seu calendário de aulas. Você pode visualizar por dia, semana ou mês.",
    title: "Calendário",
    skipBeacon: true,
  },
  {
    target: "#tour-new-lesson",
    placement: "top",
    content: "Para marcar uma nova aula, basta clicar neste botão ou clicar diretamente em um horário vazio no calendário.",
    title: "Agendar Aula",
    skipBeacon: true,
    isFixed: true,
  },

  // ─────────────────────────────────────────────
  // Transição → Alunos
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Vamos dar uma olhada na gestão de Alunos agora? Clique em 'Próximo' para continuar.",
    title: "Gestão de Alunos 🎓",
    skipBeacon: true,
    isFixed: true,
    data: { navigateTo: "/alunos" },
  },

  // ─────────────────────────────────────────────
  // Alunos Steps
  // ─────────────────────────────────────────────
  {
    // Mudado de "top" para "right" — o elemento ocupa a parte superior da tela
    // e "top" fazia o tooltip sair do viewport (cortado no topo)
    target: "#tour-students-list",
    placement: "right",
    content: "Nesta tabela ficam todos os seus alunos. Você pode pesquisar pelo nome e filtrar por status.",
    title: "Lista de Alunos",
    skipBeacon: true,
  },
  {
    target: "#tour-new-student",
    placement: "bottom",
    content: "Para cadastrar um novo aluno e enviar o acesso ao aplicativo, utilize este botão.",
    title: "Novo Aluno",
    skipBeacon: true,
    isFixed: true,
  },

  // ─────────────────────────────────────────────
  // Transição → Automações
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Agora vamos ver uma das áreas mais poderosas do sistema: as Automações de mensagens! Clique em 'Próximo' para continuar.",
    title: "Automações ⚡",
    skipBeacon: true,
    isFixed: true,
    data: { navigateTo: "/automacoes" },
  },

  // ─────────────────────────────────────────────
  // Automações Steps
  // ─────────────────────────────────────────────
  {
    target: "#tour-auto-header",
    placement: "bottom",
    content: "Aqui você gerencia todas as mensagens automáticas do sistema. Use o botão 'Criar Nova Regra' para personalizar seus próprios gatilhos.",
    title: "Automações de Mensagens",
    skipBeacon: true,
  },
  {
    target: "#tour-auto-toggle",
    placement: "bottom",
    content: "Este é o coração das automações: o Robô. Quando ligado, ele varre automaticamente todas as regras e dispara as mensagens no horário certo para os seus alunos.",
    title: "Robô de Automação 🤖",
    skipBeacon: true,
  },
  {
    target: "#tour-auto-stats",
    placement: "bottom",
    content: "Aqui você acompanha o desempenho das automações: total de mensagens enviadas, automações ativas e a taxa de entrega.",
    title: "Estatísticas",
    skipBeacon: true,
  },
  {
    target: "#tour-auto-rules",
    placement: "bottom",
    content: "Estas são as regras padrão do sistema. Cada uma é um gatilho automático — como cobranças vencidas, aniversários e lembretes de aula. Você pode editar o texto e o timing de cada uma.",
    title: "Regras de Automação",
    skipBeacon: true,
  },

  // ─────────────────────────────────────────────
  // Final Step
  // ─────────────────────────────────────────────
  {
    target: "body",
    placement: "center",
    content: "Isso é tudo por enquanto! Explore a plataforma e, se precisar rever este tour, você pode acessá-lo na área de Configurações > Ajuda.",
    title: "Tour Concluído! 🎉",
    skipBeacon: true,
    isFixed: true,
  },
];
