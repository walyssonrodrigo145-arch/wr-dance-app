// 📣 Changelog versionado do DancePro (FONTE ÚNICA das "Novidades").
//
// COMO MANTER (100% automático — sem cadastro no sistema):
// Ao lançar uma funcionalidade, adicione um objeto `Release` NO TOPO da lista
// (mais recente primeiro). Use `version` única (recomendado: AAAA.MM.DD ou semver)
// e `date` no formato YYYY-MM-DD. O app lê daqui e mostra badge + modal + histórico.
//
// Nada precisa ser cadastrado no banco: o conteúdo é este arquivo; só o estado
// de "já vi" é persistido por usuário (users.lastSeenReleaseVersion).

export type ReleaseItemType = "novo" | "melhoria" | "correcao";

export interface ReleaseItem {
  type: ReleaseItemType;
  title: string;
  description?: string;
}

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary?: string;
  items: ReleaseItem[];
}

export const RELEASES: Release[] = [
  {
    version: "2026.09.16.7",
    date: "2026-09-16",
    title: "Saldo das contas de pagamento no Financeiro",
    summary: "Veja na hora quanto há na conta onde o checkout recebe — Asaas e Mercado Pago — direto no topo do Financeiro.",
    items: [
      { type: "novo", title: "Card Saldo nos gateways", description: "O Financeiro mostra o saldo disponível da conta Asaas (finance/balance) e do Mercado Pago, com botão de atualizar e horário da última consulta." },
      { type: "melhoria", title: "Transparência por gateway", description: "Quando um gateway não está conectado ou a consulta falha, o card explica (não configurado / indisponível). A InfinitePay não possui API pública de saldo — o card indica que ela oferece apenas conciliação." },
    ],
  },
  {
    version: "2026.09.16.6",
    date: "2026-09-16",
    title: "PIX na hora na Loja e Vendas da Loja no Financeiro",
    summary: "Gere o PIX copia-e-cola da venda e receba na hora — com Asaas, Mercado Pago ou InfinitePay — e acompanhe tudo na nova aba Vendas da Loja do Financeiro, entrando no saldo líquido.",
    items: [
      { type: "novo", title: "Cobrar a venda com PIX na hora", description: "Na aba Vendas da Loja, clique em Cobrar e gere o PIX copia e cola (com QR Code) para o aluno pagar na hora — pelos três gateways: Asaas, Mercado Pago e InfinitePay." },
      { type: "novo", title: "Chave PIX como alternativa", description: "Sem gateway conectado, a Loja gera o PIX copia e cola direto da chave PIX da escola (baixa manual)." },
      { type: "novo", title: "Baixa automática do pagamento", description: "Quando o PIX cai, o sistema marca a venda como paga sozinho (Asaas, Mercado Pago e InfinitePay) e avisa a escola." },
      { type: "novo", title: "Aba Vendas da Loja no Financeiro", description: "Tudo que é vendido entra automaticamente: total vendido, recebido e a receber do mês. As vendas pagas já somam no Saldo Geral Líquido." },
    ],
  },
  {
    version: "2026.09.16.5",
    date: "2026-09-16",
    title: "Venda direta na Loja e regras de venda configuráveis",
    summary: "A Loja agora vende (não só empresta) com estoque, desconto e pagamento, e a escola define as regras de venda em Configurações → Loja.",
    items: [
      { type: "novo", title: "Vender direto na Loja", description: "Botão Vender em cada produto e no topo da Loja: escolha o aluno, a quantidade, o desconto (se liberado) e a forma de pagamento. Estoque e total calculados na hora." },
      { type: "novo", title: "Aba Vendas na Loja", description: "Todas as vendas em um só lugar, com filtro de status, marcação de pago e cancelamento (cancelar devolve a peça ao estoque)." },
      { type: "novo", title: "Regras de venda (Configurações → Loja)", description: "Ligue/desligue: vender na Loja, vender no evento, pagar junto da mensalidade, cobrança avulsa, venda sob encomenda, vender só para aluno ativo e desconto máximo. O sistema aplica as regras em toda venda." },
      { type: "melhoria", title: "Venda sob encomenda", description: "Quando o estoque acaba, a venda pode ser registrada como sob encomenda (se a regra permitir) e fica sinalizada na lista." },
    ],
  },
  {
    version: "2026.09.16.4",
    date: "2026-09-16",
    title: "Loja do figurino dentro do evento",
    summary: "Cada evento agora tem a própria loja: venda figurinos do acervo para os participantes, com quantidade, estoque em tempo real e controle de pagamento.",
    items: [
      { type: "novo", title: "Loja do evento", description: "Dentro do evento, ofereça os produtos vendáveis da Loja para os participantes — com quantidade maior que 1 e estoque atualizado automaticamente." },
      { type: "novo", title: "Preço de venda na Loja", description: "Na Loja, cada produto ganhou preço de venda e a opção 'disponível para venda' (o que é só empréstimo fica fora da loja)." },
      { type: "melhoria", title: "Controle das vendas", description: "Acompanhe as vendas do evento com status (pendente, paga, cancelada), forma de pagamento (junto da mensalidade ou cobrança avulsa) e total vendido." },
      { type: "melhoria", title: "Minhas compras no portal", description: "O aluno vê no portal as compras feitas na Loja (inclusive as do evento) com status e valor." },
    ],
  },
  {
    version: "2026.09.16.3",
    date: "2026-09-16",
    title: "Turmas por faixa etária e turno, múltiplos planos e Loja",
    summary: "Turmas com idade recomendada e turnos personalizáveis, bloqueio de choque de horário do aluno, mais de um plano por aluno (individual + turma) e a aba Figurinos virou Loja.",
    items: [
      { type: "novo", title: "Turma por faixa etária", description: "Defina idade mínima e máxima na turma (ex.: 6 a 9 anos) e o sistema alerta no cadastro quando o aluno está fora da faixa." },
      { type: "novo", title: "Turnos personalizáveis", description: "Em Configurações → Escola, monte os turnos da sua escola (Manhã, Tarde, Noite…) e use-os nas turmas e matrículas." },
      { type: "novo", title: "Sem choque de horário do aluno", description: "O sistema bloqueia matricular o mesmo aluno em duas turmas/matrículas no mesmo dia e horário." },
      { type: "novo", title: "Mais de um plano ao mesmo tempo", description: "No cadastro do aluno, adicione matrículas extras (ex.: Ballet 2x + Jazz 1x + Aula Particular), com valor mensal somado automaticamente à mensalidade." },
      { type: "melhoria", title: "Aula individual + aula em turma", description: "Cada matrícula adicional pode ser em turma, individual ou online — permitindo as duas modalidades juntas." },
      { type: "melhoria", title: "Trazer alunos para o evento por filtro", description: "No evento, adicione participantes por turma, modalidade ou coreografia, com seleção em massa e aviso de quem já está no evento." },
      { type: "melhoria", title: "Aba Figurinos agora é Loja", description: "Menu da escola e do aluno renomeados para Loja — a base para venda de produtos e figurinos." },
    ],
  },
  {
    version: "2026.09.16.2",
    date: "2026-09-16",
    title: "Turma no cadastro do aluno e Rankings com linguagem de dança",
    summary: "Cadastre o aluno já escolhendo a turma da modalidade dele (com lista de espera automática) e o módulo de Rankings agora fala a língua da dança.",
    items: [
      { type: "novo", title: "Turma no cadastro do aluno", description: "Ao escolher a modalidade, aparecem só as turmas daquela dança, com vagas em tempo real. Turma lotada? O aluno entra automaticamente na lista de espera — e sobe sozinho quando abrir vaga." },
      { type: "melhoria", title: "Trocar ou remover turma pela edição", description: "No cadastro do aluno também é possível ver a turma atual, trocar de turma (libera a vaga e promove a fila) ou deixar 'Sem turma' para definir depois." },
      { type: "melhoria", title: "Rankings com linguagem de dança", description: "Critérios agora são Frequência, Metas, Ensaios em casa, Evolução técnica e Desafios — e a participação passa a ser 'Por modalidade', sem termos de escola de música." },
      { type: "melhoria", title: "Desafios de dança", description: "Exemplos e textos dos desafios atualizados: performance em vídeo da coreografia, quiz de passos e metas de ensaio (sem referências a instrumentos)." },
    ],
  },
  {
    version: "2026.09.16.1",
    date: "2026-09-16",
    title: "Menu do Portal do Aluno por categorias",
    summary: "O menu do aluno ficou compacto: agora tem as mesmas repartições com accordion do painel da escola, em vez de uma lista corrida e extensa.",
    items: [
      { type: "melhoria", title: "Menu organizado em repartições", description: "PRINCIPAL, MEU PROGRESSO, DANÇA & PALCO, RELACIONAMENTO, FINANCEIRO e CONTA — clique na categoria para abrir ou recolher, e a categoria da página atual abre automaticamente." },
      { type: "melhoria", title: "Preferência salva", description: "O aluno abre e fecha as categorias e o sistema lembra da próxima vez, igual ao menu da escola." },
    ],
  },
  {
    version: "2026.09.15.3",
    date: "2026-09-15",
    title: "Coreografias, Eventos, Figurinos, Turmas e mais",
    summary: "O DancePro agora cobre a operação completa de palco: coreografias com elenco, eventos/espetáculos com autorização de imagem, acervo de figurinos com empréstimos, turmas com vagas e lista de espera, saúde do bailarino e pesquisa de satisfação (NPS).",
    items: [
      { type: "novo", title: "Coreografias com elenco", description: "Cadastre cada coreografia com modalidade, nível, formação (solo/duo/grupo), trilha, vídeo de marcação do YouTube e escale os alunos. Acompanhe o % de domínio de cada bailarino. O aluno vê suas coreografias no portal." },
      { type: "novo", title: "Eventos & Espetáculos", description: "Organize recitais, festivais, competições e workshops: programa com ordem de apresentação, participantes e controle de autorização de imagem/participação (recomendado para menores). O aluno confirma presença pelo portal." },
      { type: "novo", title: "Figurinos & Estoque", description: "Acervo de figurinos com tipo, tamanho, cor, estado e custo. Empréstimo por aluno/coreografia com data de devolução, alerta de atrasados e disponibilidade em tempo real. O aluno vê os figurinos em sua posse." },
      { type: "novo", title: "Turmas & Vagas com lista de espera", description: "Turmas fixas com grade semanal (dias + horário), capacidade e fila de espera. Quando uma vaga abre, o próximo da fila é promovido automaticamente. O aluno acompanha suas turmas no portal." },
      { type: "novo", title: "Saúde & Condicionamento Físico", description: "Nas abas do Progresso do aluno: avaliações periódicas com peso, altura, flexibilidade, condicionamento e histórico de lesões/restrições." },
      { type: "novo", title: "Satisfação (NPS)", description: "O aluno responde de 0 a 10 pelo portal (com comentário opcional) e a escola acompanha o NPS, promotores/detratores e respostas — também é possível registrar respostas recebidas por WhatsApp ou presencialmente." },
      { type: "novo", title: "Mensagens no Portal do Aluno", description: "O aluno agora conversa diretamente com seu professor pela aba Mensagens, respeitando as permissões do portal." },
      { type: "correcao", title: "Menu do professor respeita permissões", description: "O menu lateral e a barra mobile agora ocultam as páginas que o professor não tem permissão de acessar (antes o item aparecia e só a página bloqueava)." },
      { type: "correcao", title: "Notas Fiscais acessíveis", description: "A tela de NFS-e (Focus NFe) aparecia apenas internamente — agora há a rota /notas-fiscais e as abas Salas & Tablados e Notas Fiscais em Configurações." },
      { type: "correcao", title: "Recuperação de senha por e-mail", description: "O botão 'Esqueceu?' agora funciona: o usuário informa o e-mail e recebe um link seguro (1h) para criar uma nova senha." },
      { type: "correcao", title: "Robustez dos novos módulos", description: "Editar coreografia/figurino não apaga mais descrição/foto, datas aparecem sem deslocamento de fuso, o slider de domínio não dispara requisições em excesso e o NPS tem limite anti-spam." },
    ],
  },
  {
    version: "2026.09.15.2",
    date: "2026-09-15",
    title: "✨ Especialização de Dança & Correção de Relatórios",
    summary: "Separação inteligente das abas de relatórios e especialização de metas corporais e coreográficas.",
    items: [
      { type: "correcao", title: "Separação das Abas de Relatórios", description: "Corrigida duplicidade das abas de Modalidades: agora divididas em 'Formato de Aula' (Individual vs Turma) e 'Estilos & Ritmos' (Ballet, Jazz, Forró, etc.)." },
      { type: "melhoria", title: "Metas de Dança & Objetivos Corporais", description: "Metas no painel de progresso agora focam em postura, piruetas, flexibilidade e domínio coreográfico." },
      { type: "melhoria", title: "Dashboard do Aluno 100% Dança", description: "Remoção de referências residuais e foco total em trilhas, coreografias e constância nos ensaios." },
    ],
  },
  {
    version: "2026.09.15",
    date: "2026-09-15",
    title: "🩰 DancePro — Rebranding Completo",
    summary: "O sistema foi totalmente adaptado para escolas de dança. Todos os textos, ícones e termos foram atualizados.",
    items: [
      { type: "novo", title: "Rebranding completo para DancePro", description: "Todos os textos, ícones e referências de escola de música foram substituídos pelo contexto de escola de dança." },
      { type: "melhoria", title: "Modalidades substituem Instrumentos", description: "Labels, filtros, relatórios e rankings agora usam 'Modalidade' no lugar de 'Instrumento'." },
      { type: "melhoria", title: "Portal do Aluno adaptado para dança", description: "Metrônomo e BPM removidos. Repertório virou Coreografias. Instrumento Principal virou Modalidade Principal." },
      { type: "melhoria", title: "Salas adaptadas para escola de dança", description: "Placeholders das salas agora refletem tablados, barras, espelhos e equipamentos de dança." },
      { type: "melhoria", title: "Leads e Marketing atualizados", description: "Modalidades de dança (Ballet, Forró, Zumba, Hip-Hop, Salsa) substituem instrumentos musicais nos funis de vendas." },
    ],
  },
  {
    version: "2026.09.16",
    date: "2026-09-15",
    title: "DancePro — Sistema de Gestão para Escolas e Estúdios de Dança",
    summary: "Plataforma especializada e desacoplada com vocabulário de ritmos, modalidades, coreografias, salas de ensaio e tablados.",
    items: [
      { type: "novo", title: "Modalidades & Ritmos", description: "Cadastro e gestão de modalidades de dança (Ballet, Jazz, Hip Hop, Dança de Salão, Dança Urbana, etc.) com cores e ícones na grade." },
      { type: "novo", title: "Salas de Ensaio & Tablados", description: "Espaços adaptados com controle de capacidade por m², salas com espelho, piso flutuante e relatórios de ocupação." },
      { type: "melhoria", title: "Portal do Aluno e Vocabulário", description: "Terminologia 100% voltada a dança: trilhas sonoras, desafios coreográficos e acompanhamento da evolução corporal e técnica." },
    ],
  },
  {
    version: "2026.09.15.1",
    date: "2026-09-15",
    title: "Renovação pelo portal e avaliações de professores",
    summary: "Aluno renova o contrato com 1 toque (vigência pelo plano) e pode avaliar seu professor — nota sigilosa para a administração.",
    items: [
      { type: "novo", title: "Renovar contrato pelo portal", description: "No portal do aluno, quando o contrato está perto do fim aparece o botão 'Renovar contrato' — o novo contrato já sai com a duração e o valor do plano cadastrado, sem trabalho manual para o professor." },
      { type: "novo", title: "Avalie seu professor", description: "De tempos em tempos o portal convida você a dar uma nota de 1 a 5 (com comentário opcional) ao seu professor. Sua avaliação é sigilosa: apenas a administração da escola tem acesso." },
      { type: "novo", title: "Relatório e ranking para a escola", description: "No painel do administrador (Professores → Avaliações): relatório completo com filtros e ranking dos professores, do melhor ao pior, para decisões de gestão." },
    ],
  },
  {
    version: "2026.09.14.2",
    date: "2026-09-14",
    title: "Nova aba Resultados no Portal do Aluno",
    summary: "Histórico completo de desafios, medalhas e rankings em um só lugar — e o painel do aluno mais limpo.",
    items: [
      { type: "novo", title: "Aba Resultados", description: "No portal do aluno, o menu agora tem a aba Resultados: todo o histórico de desafios avaliados (com feedback do professor), medalhas conquistadas e competições de ranking em que participou." },
      { type: "melhoria", title: "Painel do aluno mais limpo", description: "Desafios encerrados não poluem mais o painel do aluno — só os desafios ativos aparecem. O histórico completo ficou na aba Resultados." },
      { type: "melhoria", title: "Feedback no lugar certo", description: "A notificação de avaliação de desafio agora leva direto para a aba Resultados." },
    ],
  },
  {
    version: "2026.09.14.1",
    date: "2026-09-14",
    title: "Ajustes no Relatório de Salas (mobile)",
    summary: "Modal do relatório de ocupação com navegação corrigida no celular.",
    items: [
      { type: "correcao", title: "Botão X fixo no relatório", description: "O botão de fechar não rola junto com o conteúdo e não sobrepõe mais o título." },
      { type: "correcao", title: "Tabela com rolagem lateral", description: "No celular, arraste a tabela do relatório para o lado para ver todas as colunas (Agendadas e Ocupação), sem dados cortados." },
      { type: "correcao", title: "Trava de cards do dashboard", description: "No cadastro do professor, o admin agora vê e marca quais cards do dashboard o professor pode acessar (seção Cards do Dashboard)." },
      { type: "correcao", title: "Vídeo do desafio assistível", description: "O professor consegue assistir/ouvir o vídeo ou áudio enviado pelo aluno na resposta do desafio, direto no painel de respostas." },
      { type: "melhoria", title: "Limpeza automática de mídia", description: "Ao encerrar ou excluir um desafio, os vídeos/imagens enviados pelos alunos são removidos do servidor — economiza espaço sem perder pontos e feedback." },
    ],
  },
  {
    version: "2026.09.14",
    date: "2026-09-14",
    title: "Dashboard inteligente e Financeiro mais claro",
    summary: "Novos cards no painel, desconto antecipado registrado corretamente e controles de privacidade.",
    items: [
      { type: "novo", title: "Horários Livres do Dia", description: "Veja no dashboard as vagas de hoje, com filtro por professor e por sala." },
      { type: "novo", title: "Salas ao Vivo (24h)", description: "Status em tempo quase real das salas de estúdio: livre, ocupada, manutenção." },
      { type: "novo", title: "Dashboard personalizável", description: "Escolha, em Configurações → Aparência, quais cards quer ver." },
      { type: "novo", title: "Botão Olhinho", description: "Oculta os valores financeiros no Dashboard e no Financeiro com um clique." },
      { type: "novo", title: "Card Desconto Concedido", description: "No Financeiro, veja quanto de desconto por pagamento antecipado foi dado no mês." },
      { type: "melhoria", title: "Desconto registrado corretamente", description: "Ao dar baixa ou gerar a cobrança, o valor pago com desconto é gravado junto do valor cheio da mensalidade." },
      { type: "melhoria", title: "Configurações mais enxutas", description: "A aba Professores saiu das Configurações (já está no menu lateral)." },
    ],
  },
];

export const LATEST_RELEASE_VERSION: string = RELEASES[0]?.version ?? "";

/** Lançamento mais recente (ou null se não houver nenhum). */
export function getLatestRelease(): Release | null {
  return RELEASES[0] ?? null;
}

/** Versão que o usuário ainda não viu (última), ou null se está em dia. */
export function getUnseenRelease(lastSeenVersion: string | null | undefined): Release | null {
  const latest = getLatestRelease();
  if (!latest) return null;
  if (lastSeenVersion === latest.version) return null;
  return latest;
}

export function hasUnseenRelease(lastSeenVersion: string | null | undefined): boolean {
  return getUnseenRelease(lastSeenVersion) !== null;
}
