// ─── Conteúdo SEO público do DancePro (fonte única: páginas + sitemap) ───────
// Tudo 100% automático: as páginas /funcionalidades, /para, /comparar, /blog e
// /glossario saem daqui. Mantenha slugs únicos e descrições de 120–160 chars.

export interface SeoFeature {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
}

export interface SeoSegment {
  slug: string;
  title: string;
  painPoint: string;
  description: string;
  bullets: string[];
}

export interface SeoComparison {
  slug: string;
  title: string;
  against: string;
  intro: string;
  rows: Array<{ criterion: string; dancepro: string; other: string }>;
}

export interface SeoBlogSection {
  heading: string;
  body: string;
}

export interface SeoBlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readMinutes: number;
  sections: SeoBlogSection[];
}

export interface SeoGlossaryTerm {
  term: string;
  definition: string;
}

export const SEO_FEATURES: SeoFeature[] = [
  {
    slug: "turmas-e-chamada",
    title: "Turmas, grade e chamada por turma",
    subtitle: "A grade da turma vira a agenda da escola",
    description:
      "Monte a grade semanal da turma e o DancePro gera as aulas do período. A chamada sai da lista de matriculadas, com presença por aluna e crédito de reposição.",
    bullets: [
      "Grade semanal (dias, horário, sala, professor) gera as aulas do período em 1 clique",
      "Chamada por turma com Presente, Ausente e Justificado — no celular do professor ou na recepção",
      "Incluir aluna extra na aula (reposição/visitante) sem mexer na matrícula",
      "Lista de espera com promoção automática quando abre vaga",
    ],
  },
  {
    slug: "financeiro-e-pix",
    title: "Financeiro com PIX, boleto e lembretes",
    subtitle: "Mensalidade em dia sem cobrar uma a uma",
    description:
      "Cobre por PIX, boleto ou cartão, receba com conciliação automática e acompanhe inadimplência em tempo real. Lembretes de cobrança saem sozinhos pelo WhatsApp.",
    bullets: [
      "PIX copia e cola e boleto gerados na hora (Asaas, Mercado Pago e InfinitePay)",
      "Baixa automática quando o pagamento cai, com comprovante no histórico",
      "Painel de inadimplência e fluxo de caixa com receitas, despesas e loja",
      "Juros, multa e desconto calculados pela regra da escola",
    ],
  },
  {
    slug: "rematricula",
    title: "Rematrícula do período em uma tela",
    subtitle: "Feche o semestre sem planilha",
    description:
      "Renove as matrículas em lote: o DancePro gera as mensalidades do novo ciclo e as aulas da grade. Quem não renova sai da turma e libera a vaga automaticamente.",
    bullets: [
      "Selecione turmas e alunas que renovam; o resto é automático",
      "Mensalidades do novo período geradas sem duplicar nada",
      "Quem não renovar é inativado e a vaga vai para a lista de espera",
      "Histórico completo por período e turma",
    ],
  },
  {
    slug: "figurino-e-espetaculo",
    title: "Figurino, loja e espetáculo",
    subtitle: "Tudo que envolve o palco em um só lugar",
    description:
      "Controle estoque de figurino, vendas na loja, eventos e espetáculos com autorização de imagem e coreografias por turma. Nada mais perdido em conversas separadas.",
    bullets: [
      "Loja com estoque, regras de venda e venda para aluna ou para fora",
      "Eventos com lista de participantes e autorização de imagem/participação",
      "Coreografias vinculadas à turma e ao figurino",
      "Cobrança de figurino e taxa de espetáculo pelo financeiro",
    ],
  },
  {
    slug: "portal-do-aluno",
    title: "Portal da aluna e do responsável",
    subtitle: "Menos dúvida no WhatsApp, mais autonomia",
    description:
      "A aluna vê grade, presenças, materiais, coreografias, pagamentos e avisos. O responsável acompanha a frequência e o financeiro pelo celular.",
    bullets: [
      "Grade e próximas aulas com sala e professor",
      "Presenças, reposições e evolução registradas",
      "Pagamentos com PIX/comprovante direto no portal",
      "Avisos e materiais da turma sem grupo de WhatsApp",
    ],
  },
  {
    slug: "ia-pedagogica",
    title: "IA pedagógica por modalidade de dança",
    subtitle: "Planos de aula que falam ballet, jazz e urbanas",
    description:
      "A IA do DancePro monta planos diários com aquecimento, centro, diagonal e coreografia para cada modalidade, respeitando nível e segurança.",
    bullets: [
      "Especialistas por modalidade (ballet, jazz, urbanas, salão, sapateado, contemporâneo, kids, fitness)",
      "Plano diário com Musicalidade, segurança e progressão",
      "Sugestões para aluna específica com base no histórico",
      "Relatórios pedagógicos prontos para mostrar à família",
    ],
  },
];

export const SEO_SEGMENTS: SeoSegment[] = [
  { slug: "escola-de-ballet", title: "Sistema para escola de Ballet", painPoint: "Grade rígida, sapatilha por fase e disciplina de presença", description: "Organize turmas por nível (baby, infantil, juvenil, adulto), acompanhe frequência e importe a carteira que já existe na planilha.", bullets: ["Turmas por nível e faixa etária", "Rematrícula por período", "Frequência e boletim por aluna"] },
  { slug: "escola-de-jazz", title: "Sistema para escola de Jazz", painPoint: "Muitas modalidades, figurino e espetáculo de fim de ano", description: "Jazz, lyrical e teatro musical convivem com turmas, ensaios e figurinos controlados no mesmo painel.", bullets: ["Turmas e ensaios na mesma agenda", "Figurino com estoque e venda", "Eventos com autorização de imagem"] },
  { slug: "dancas-urbanas", title: "Sistema para Danças Urbanas", painPoint: "Turmas que enchem rápido e aulas experimentais", description: "Hip hop, breaking e house com lista de espera automática, aula experimental e PIX na hora da matrícula.", bullets: ["Vagas e fila em tempo real", "Aula experimental com conversão", "PIX/loja para tênis e bonés"] },
  { slug: "danca-de-salao", title: "Sistema para Dança de Salão", painPoint: "Casais, aulas particulares e ritmos variados", description: "Forró, samba de gafieira e bolero com turmas por ritmo, aulas particulares e cobrança automática.", bullets: ["Turmas por ritmo e nível", "Particulares com plano próprio", "Cobrança recorrente sem esforço"] },
  { slug: "sapateado", title: "Sistema para Sapateado", painPoint: "Turmas pequenas e nível técnico alto", description: "Controle frequência e evolução por aluna, com planos de aula específicos de sapateado e reposições organizadas.", bullets: ["Chamada e reposição", "IA especialista em sapateado", "Relatórios de evolução"] },
  { slug: "danca-contemporanea", title: "Sistema para Dança Contemporânea", painPoint: "Composição, ensaios extra e processos criativos", description: "Gerencie workshops, ensaios extra e projetos, com portal da aluna e materiais da coreografia.", bullets: ["Ensaios e aulas extras", "Materiais por turma", "Convites e avisos no portal"] },
  { slug: "danca-infantil", title: "Sistema para Dança Infantil", painPoint: "Responsável, pagamento e autorização de imagem", description: "Cadastro com responsável, comunicados para a família, autorizações de imagem e cobrança para o responsável.", bullets: ["Responsável obrigatório", "Avisos e autorizações", "Cobrança e recibo para a família"] },
  { slug: "ritmos-e-fitness", title: "Sistema para Ritmos e Fit Dance", painPoint: "Alta rotatividade e pagamento avulso", description: "Aulas avulsas, planos mensais e pacotes com controle de frequência — ideal para fit dance, zumba e ritmos.", bullets: ["Planos e pacotes flexíveis", "Frequência por aluna", "Retenção com avisos automáticos"] },
];

export const SEO_COMPARISONS: SeoComparison[] = [
  {
    slug: "planilha",
    title: "DancePro ou planilha?",
    against: "planilhas de Excel/Google",
    intro: "A planilha resolve por um tempo, mas ninguém avisa quem faltou, quanto está em atraso ou quem está na fila da turma.",
    rows: [
      { criterion: "Chamada do dia", dancepro: "Por turma, no celular, com frequência e reposição automáticas", other: "Coluna de X por aula, sem histórico confiável" },
      { criterion: "Mensalidade", dancepro: "PIX/boleto e baixa automática com inadimplência em tempo real", other: "Controle manual de quem pagou" },
      { criterion: "Vagas e fila", dancepro: "Turma com capacidade, lista de espera e promoção automática", other: "Anotação em outra aba ou caderno" },
      { criterion: "Rematrícula", dancepro: "Uma tela gera mensalidades e aulas do novo ciclo", other: "Refazer a planilha inteira todo semestre" },
    ],
  },
  {
    slug: "sistema-de-academia",
    title: "DancePro ou sistema de academia?",
    against: "sistemas genéricos de academia",
    intro: "Sistema de academia controla acesso e plano, mas não entende turma, nível, figurino, espetáculo e rematrícula.",
    rows: [
      { criterion: "Turma x matrícula de academia", dancepro: "Turma com grade semanal, nível, faixa etária e chamada", other: "Matrícula vinculada a sala/horário fixo" },
      { criterion: "Chamada", dancepro: "Presença por aluna com reposição e justificativa", other: "Check-in de catraca, sem visão pedagógica" },
      { criterion: "Figurino e espetáculo", dancepro: "Estoque, venda, eventos e autorização de imagem", other: "Não existe" },
      { criterion: "Pedagógico", dancepro: "Planos de aula por modalidade e evolução da aluna", other: "Não existe" },
    ],
  },
];

export const SEO_BLOG: SeoBlogPost[] = [
  {
    slug: "como-aumentar-rematriculas",
    title: "Como aumentar a rematrícula da escola de dança (sem virar cobrança chata)",
    excerpt: "A rematrícula começa no primeiro dia de aula, não no mês do vencimento. Veja o passo a passo que escolas organizadas usam para renovar de 70% a mais.",
    date: "2026-09-10",
    readMinutes: 6,
    sections: [
      { heading: "Mostre presença antes de pedir renovação", body: "Família que vê frequência e evolução diz sim mais fácil. Envie um resumo do período: presenças, reposições e o que a aluna evoluiu. No DancePro isso sai do relatório da turma em dois cliques." },
      { heading: "Avise antes, sempre antes", body: "Avisar o valor e as datas com 30 dias de antecedência reduz o atrito. Use comunicados e lembretes automáticos para o responsável, com a opção de PIX na hora." },
      { heading: "Facilite o pagamento", body: "Quem paga no dia da decisão renova mais. Gere PIX ou boleto com vencimento para o mês do ciclo e deixe o comprovante no portal." },
      { heading: "Trate quem não renovou", body: "Nem todo não é um não. Liste quem não renovou, entenda o motivo (horário? valor? modalidade?) e ofereça troca de turma ou plano antes de liberar a vaga." },
    ],
  },
  {
    slug: "reduzir-inadimplencia-danca",
    title: "Inadimplência na escola de dança: 5 ajustes que funcionam",
    excerpt: "Cobrar não precisa ser desconfortável. Estes cinco ajustes reduzem atraso sem desgastar a relação com a família.",
    date: "2026-09-03",
    readMinutes: 5,
    sections: [
      { heading: "1. Vencimento único e claro", body: "Defina o dia de vencimento por plano e deixe visível no portal. Mude o padrão: dia 10 evita a correria do dia 5." },
      { heading: "2. Lembrete antes, não depois", body: "Um lembrete 3 dias antes resolve mais que três cobranças depois. Automatize o aviso por WhatsApp e e-mail." },
      { heading: "3. PIX na hora", body: "Quanto mais fricção, mais atraso. PIX copia e cola com baixa automática resolve no mesmo dia." },
      { heading: "4. Regra de juros e multa igual para todos", body: "Aplique a mesma regra do contrato no sistema; o cálculo sai igual para toda família e evita discussão." },
      { heading: "5. Frequência em risco", body: "Aluna que falta muito atrasa pagamento e sai. Use a lista de presença para agir antes: ligue, ofereça reposição e mostre evolução." },
    ],
  },
  {
    slug: "espetaculo-de-fim-de-ano-organizado",
    title: "Espetáculo de fim de ano: cronograma para não enlouquecer",
    excerpt: "Figurino, autorização de imagem, ensaio geral e ingressos. O cronograma enxuto que salva dezembro da sua equipe.",
    date: "2026-08-27",
    readMinutes: 7,
    sections: [
      { heading: "6 meses antes: tema, turmas e coreografias", body: "Defina tema e vincule cada coreografia à turma dentro do sistema — assim toda equipe enxerga a mesma informação." },
      { heading: "4 meses antes: figurino e medidas", body: "Liste figurino por coreografia, registre medidas e abra a venda na loja (com estoque) para a família comprar sem fila no WhatsApp." },
      { heading: "2 meses antes: autorizações e ensaios", body: "Envie a autorização de imagem/participação pelo evento e marque os ensaios extras na agenda da turma." },
      { heading: "1 mês antes: ingressos e logística", body: "Organize ingressos, horários de camarim e lista de presença do ensaio geral. No dia, faça a chamada de palco pelo celular." },
    ],
  },
];

export const SEO_GLOSSARY: SeoGlossaryTerm[] = [
  { term: "Barra", definition: "Exercício de aquecimento feito na barra fixa do estúdio; no ballet abre a aula com pliés, tendus e rond de jambe." },
  { term: "Centro", definition: "Parte da aula em que os exercícios saem da barra e acontecem no meio do estúdio, trabalhando equilíbrio e transferência de peso." },
  { term: "Diagonal", definition: "Sequência executada da diagonal do estúdio, muito usada em jazz e ballet para deslocamento e giros." },
  { term: "Sapatilha de ponta", definition: "Sapatilha de ballet com caixa rígida usada quando a aluna tem força e alinhamento suficientes para dançar en pointe." },
  { term: "Meia-ponta", definition: "Elevação feita sobre o metatarso, com o pé esticado, sem o apoio da ponta." },
  { term: "Plié", definition: "Dobrar os joelhos com rotação externa das pernas, mantendo o alinhamento dos pés com os joelhos." },
  { term: "En dehors", definition: "Rotação externa das pernas a partir do quadril, princípio base do ballet clássico." },
  { term: "Ensaiar", definition: "Repetir a coreografia com marcação e depois em intensidade total, ajustando formação e marcação de palco." },
  { term: "Marca", definition: "Fazer a coreografia em intensidade baixa, só marcando os movimentos e as posições." },
  { term: "Coreografia", definition: "Sequência de movimentos criada para uma música, atribuída a uma turma ou aluna e apresentada no espetáculo." },
  { term: "Ensaio geral", definition: "Último ensaio completo antes da apresentação, no palco ou no estúdio com figurino e formação final." },
  { term: "Figurino", definition: "Roupa da apresentação, geralmente definida por coreografia, com controle de medidas, estoque e venda." },
  { term: "Reposição", definition: "Aula usada para repor uma falta justificada; no DancePro gera crédito com validade e agendamento em turma compatível." },
  { term: "Rematrícula", definition: "Renovação da matrícula para o próximo período ou ciclo, com novas aulas e mensalidades geradas." },
  { term: "Lista de espera", definition: "Fila de alunas aguardando vaga em turma lotada, com promoção automática quando uma vaga abre." },
  { term: "Faixa etária", definition: "Faixa de idade admitida pela turma (ex.: 6 a 9 anos), usada para evitar matrícula em turma incompatível." },
  { term: "Nível", definition: "Classificação técnica da turma ou da aluna (iniciante, intermediário, avançado) que orienta progressão e plano de aula." },
  { term: "Tablado", definition: "Palco de madeira onde acontecem ensaios e apresentações; no sistema aparece como tipo de sala." },
  { term: "Aquecimento", definition: "Primeira parte da aula, obrigatória, que prepara corpo e articulações para o esforço." },
  { term: "Musicalidade", definition: "Trabalho de tempo, contagem e intenção musical do movimento, usado nos planos diários." },
];

/** Todos os caminhos públicos (alimenta o sitemap.xml). */
export const SEO_PATHS: string[] = [
  "/",
  "/funcionalidades",
  ...SEO_FEATURES.map((f) => `/funcionalidades/${f.slug}`),
  "/para",
  ...SEO_SEGMENTS.map((s) => `/para/${s.slug}`),
  "/comparar",
  ...SEO_COMPARISONS.map((c) => `/comparar/${c.slug}`),
  "/blog",
  ...SEO_BLOG.map((b) => `/blog/${b.slug}`),
  "/glossario",
  "/indique",
];

export const getSeoFeature = (slug: string) => SEO_FEATURES.find((f) => f.slug === slug);
export const getSeoSegment = (slug: string) => SEO_SEGMENTS.find((s) => s.slug === slug);
export const getSeoComparison = (slug: string) => SEO_COMPARISONS.find((c) => c.slug === slug);
export const getSeoBlogPost = (slug: string) => SEO_BLOG.find((b) => b.slug === slug);
