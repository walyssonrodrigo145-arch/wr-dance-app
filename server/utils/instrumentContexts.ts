/**
 * MODALITY_CONTEXTS — DancePro
 *
 * Mapa estático de contextos pedagógicos por MODALIDADE DE DANÇA.
 * Usado pelo gerador de Plano Diário/Estudos (IA) para garantir terminologia
 * correta, aquecimento seguro e evitar contaminação entre técnicas.
 *
 * Categorias suportadas:
 *   ballet | jazz | urbanas | salao | sapateado | contemporaneo | kids | fitness | geral
 */

export interface InstrumentContext {
  /** Termos técnicos corretos e esperados para esta modalidade */
  terminology: string[];
  /** Termos de outras modalidades que NÃO devem aparecer neste plano */
  forbiddenTerms: string[];
  /** Descrição do tipo de aquecimento adequado */
  warmupDescription: string;
  /** Exemplos de exercícios de aquecimento */
  warmupExamples: string[];
  /** Exemplos de focos técnicos típicos */
  technicalFocusExamples: string[];
  /** Exemplos de desafios práticos */
  challengeExamples: string[];
  /** Dicas de linguagem e abordagem para cada nível */
  levelHints: {
    iniciante: string;
    intermediario: string;
    avancado: string;
  };
  /** Instrução extra para a IA sobre esta modalidade */
  extraInstruction: string;
}

export type InstrumentCategory =
  | "ballet"
  | "jazz"
  | "urbanas"
  | "salao"
  | "sapateado"
  | "contemporaneo"
  | "kids"
  | "fitness"
  | "geral";

export const INSTRUMENT_CONTEXTS: Record<InstrumentCategory, InstrumentContext> = {
  // ─── BALLET CLÁSSICO / PONTAS / REPERTÓRIO ─────────────────────────────
  ballet: {
    terminology: [
      "postura", "alinhamento", "en dehors", "plié", "tendu", "dégagé",
      "rond de jambe", "battement", "piqué", "port de bras", "barra", "centro",
      "primeira posição", "quinta posição", "arabesque", "attitude",
      "sauté", "échappé", "passé", "equilíbrio", "épaulement",
    ],
    forbiddenTerms: [
      "sapateado", "bate-pé de sapateado", "freeze", "power move", "headspin",
      "passo de hip hop", "passo de forró", "condução de salão", "acrobacia aérea",
      "ponta (para iniciante)", "exercício de acrobacia sem supervisão",
    ],
    warmupDescription: "Aquecimento articulando pés, tornozelos e quadril antes da barra, com foco em alinhamento postural",
    warmupExamples: [
      "Rolamento de pés e tornozelos + movimentação de quadril, 5 min, com apoio leve na barra",
      "Alongamento suave de panturrilha e posterior de coxa + ativação do abdômen antes da barra",
    ],
    technicalFocusExamples: [
      "Alinhamento do corpo no plié e tendu (joelhos alinhados aos pés, quadril neutro)",
      "Controle do en dehors nas posições de base e equilíbrio no passé",
      "Preparação de giro simples com foco em cabeça de giro e tronco firme",
    ],
    challengeExamples: [
      "Executar a combinação da barra inteira sem pausas, mantendo o alinhamento",
      "Fazer 3 equilíbrios seguidos no passé (cada lado) com apenas 1 apoio",
    ],
    levelHints: {
      iniciante: "Explique cada posição pelo nome em português e use comparações simples (ex.: 'como se fosse um ímã no chão').",
      intermediario: "Use os nomes franceses com o movimento descrito; foque em precisão de alinhamento e musicalidade.",
      avancado: "Use terminologia clássica completa; foque em refinamento artístico, controle e amplitude segura.",
    },
    extraInstruction: "NUNCA sugira exercícios de pontas para alunas sem avaliação física; deixe claro que pontas exigem liberação do professor.",
  },

  // ─── JAZZ / LÍRICO / MUSICAL ───────────────────────────────────────────
  jazz: {
    terminology: [
      "isolamento de quadril", "isolação de ombros", "cabeça de jazz", "clean", "kick ball change",
      "pas de bourrée", "grapevine", "chassé", "pivot", "jazz square",
      "ondulação de tronco", "contração", "extensão", "energia", "precisão",
    ],
    forbiddenTerms: [
      "sapateado", "bate-pé", "fouetté de pontas", "barra clássica obrigatória",
      "condução a dois", "power move", "headspin", "acrobacia aérea sem supervisão",
    ],
    warmupDescription: "Aquecimento com isolamentos articulados (cabeça, ombros, quadril) e ativação de pernas antes dos deslocamentos",
    warmupExamples: [
      "Isolamento de cabeça, ombros e quadril por 4 músicas, uma articulação por vez",
      "Alongamento dinâmico de posteriores + ativação de panturrilha e core",
    ],
    technicalFocusExamples: [
      "Limpeza (clean) da combinação de pas de bourrée + chassé no tempo forte",
      "Ondulação de tronco contínua com controle respiratório",
      "Pivot preciso com manutenção do foco visual",
    ],
    challengeExamples: [
      "Gravar a combinação de 8 tempos em velocidade da música original",
      "Improvisar 30s usando 3 elementos aprendidos (isolamento, chassé, pivot)",
    ],
    levelHints: {
      iniciante: "Explique contagem em 8 tempo por tempo e faça o movimento por partes antes de juntar.",
      intermediario: "Trabalhe qualidade de movimento e dinâmica (forte/fraco) mantendo a contagem.",
      avancado: "Foque em interpretação, textura de movimento e variações de nível (chão/ar).",
    },
    extraInstruction: "Diferencie 'força' de 'tensão': pedir força demais gera lesão; oriente movimento com apoio ativo do core.",
  },

  // ─── DANÇAS URBANAS / HIP HOP / BREAKING / K-POP ───────────────────────
  urbanas: {
    terminology: [
      "bounce", "rock", "groove", "top rock", "footwork", "freeze",
      "wave", "pop", "lock", "isolation", "foundation", "musicalidade",
      "cypher", "batalha", "set", "flow",
    ],
    forbiddenTerms: [
      "en dehors clássico", "barra de ballet", "pontas", "sapateado",
      "condução de salão", "passo de forró", "acrobacia aérea sem supervisão",
      "power move (para iniciante)", "headspin (para iniciante)",
    ],
    warmupDescription: "Aquecimento articular com bounce e ativação de tornozelos, joelhos e ombros, preparando impacto",
    warmupExamples: [
      "Bounce básico por 3 músicas alternando rock lento e rápido",
      "Aquecimento de tornozelos, joelhos e quadril + ativação de ombros para waves",
    ],
    technicalFocusExamples: [
      "Groove constante com contratempo (musicalidade) sem perder o bounce",
      "Fundamento de top rock com postura e olhar presentes",
      "Isolamento de peito e cabeça para composição de wave",
    ],
    challengeExamples: [
      "Criar 1 set de 16 tempos com top rock + footwork + freeze de segurança",
      "Batalha amistosa: apresentar o set para o espelho sem perder o tempo",
    ],
    levelHints: {
      iniciante: "Ensine fundamento antes de estilo: bounce e musicalidade valem mais que movimento bonito.",
      intermediario: "Aumente dificuldade de footwork e transições, mantendo limpeza do groove.",
      avancado: "Trabalhe dinâmica, freestyle e variações de freeze com segurança.",
    },
    extraInstruction: "PROIBIDO ensinar power moves (headspin, windmill, flare) sem colchão, professor presente e aluno com base de força — risco altíssimo de lesão cervical.",
  },

  // ─── DANÇA DE SALÃO / A DOIS / FORRÓ / SAMBA / TANGO ───────────────────
  salao: {
    terminology: [
      "condução", "base", "dama", "cavalheiro", "giro simples", "marcha",
      "passo básico", "fechamento", "abertura", "troca de mão", "postura de par",
      "tempo forte", "contratempo", "musicalidade a dois",
    ],
    forbiddenTerms: [
      "en dehors de ballet", "barra clássica", "sapateado", "freeze", "power move",
      "headspin", "isolamento de hip hop", "pontas", "acrobacia aérea",
    ],
    warmupDescription: "Aquecimento individual de quadril e coluna + prática de condução sem música antes do par",
    warmupExamples: [
      "Mobilidade de quadril e coluna, 5 min, com foco em eixo e equilíbrio",
      "Caminhada no ritmo contando 1-2-3 sem música, depois com música lenta",
    ],
    technicalFocusExamples: [
      "Condução clara pela estrutura da mão/braço (sem empurrar a dama)",
      "Postura de par com eixo no próprio corpo e olhar disponível",
      "Passo básico com tempo forte correto e sem atropelar a música",
    ],
    challengeExamples: [
      "Dançar 1 música inteira sem perder o tempo e sem apertar a mão do par",
      "Trocar de par 3 vezes mantendo a condução clara",
    ],
    levelHints: {
      iniciante: "Separe papel de conduzir e ser conduzido(a); ensine o passo básico contando em voz alta.",
      intermediario: "Adicione giros e variações mantendo a condução simples e confortável.",
      avancado: "Trabalhe contramovimento, figuras encadeadas e interpretação musical a dois.",
    },
    extraInstruction: "Reforce consentimento e conforto: o par pode pedir pausa a qualquer momento; condução nunca é força.",
  },

  // ─── SAPATEADO / TAP ───────────────────────────────────────────────────
  sapateado: {
    terminology: [
      "flat", "ball", "heel", "toe", "shuffle", "flap", "ball change",
      "dig", "stamp", "stomp", "brush", "pickup", "clareza de som", "ritmo",
    ],
    forbiddenTerms: [
      "en dehors clássico obrigatório", "barra de ballet obrigatória", "freeze",
      "power move", "headspin", "condução de salão", "passo de forró",
    ],
    warmupDescription: "Aquecimento de tornozelos e pés + prática de sons lentos para clareza antes da velocidade",
    warmupExamples: [
      "Aquecimento de tornozelos e panturrilha, 4 min, seguido de flats e balls lentos",
      "Sequência lenta de shuffle + flap no centro, sem música, buscando som limpo",
    ],
    technicalFocusExamples: [
      "Clareza de som no shuffle: som separado do flap e sem arrastar o pé",
      "Peso distribuído corretamente entre ball e heel na troca de apoio",
      "Marcação rítmica em compassos de 4 tempos com palmas antes de sapatear",
    ],
    challengeExamples: [
      "Executar a sequência de 8 sons em 3 velocidades diferentes com som limpo",
      "Criar 1 frase de 4 tempos usando 3 sons aprendidos",
    ],
    levelHints: {
      iniciante: "Priorize som limpo em andamento lento; nunca acelere antes da clareza.",
      intermediario: "Aumente velocidade e adicione sincopas mantendo a postura ereta.",
      avancado: "Trabalhe dinâmica (piano/forte), a cappella e improvisação rítmica.",
    },
    extraInstruction: "Sapateado exige piso adequado e aquecimento de tornozelo — evite exercícios de impacto em piso duro sem orientação.",
  },

  // ─── CONTEMPORÂNEO / MODERNO / LÍRICO ──────────────────────────────────
  contemporaneo: {
    terminology: [
      "peso", "queda controlada", "gravidade", "contração", "release",
      "espiral", "fluxo", "níveis (chão/médio/alto)", "respiração", "eixo",
      "qualidade de movimento", "improvisação", "partitura de movimento",
    ],
    forbiddenTerms: [
      "barra clássica obrigatória", "en dehors rígido", "sapateado", "freeze",
      "power move", "headspin", "passo de forró", "acrobacia aérea sem supervisão",
    ],
    warmupDescription: "Aquecimento de coluna e respiração, explorando transferência de peso e contato com o chão",
    warmupExamples: [
      "Rolamentos de coluna + respiração diafragmática, 5 min, percebendo o peso do corpo",
      "Exploração de transferência de peso entre os pés em câmera lenta",
    ],
    technicalFocusExamples: [
      "Queda controlada com rolamento e subida sem travar a respiração",
      "Espiral de tronco mantendo eixo e olhar ativo",
      "Uso de níveis (chão → médio → alto) numa frase de movimento",
    ],
    challengeExamples: [
      "Criar uma partitura de 30s usando queda, espiral e mudança de nível",
      "Improvisar 1 min com pausas propositais e respiração audível",
    ],
    levelHints: {
      iniciante: "Comece pelo chão: segurança e rolamento antes de movimentos aéreos.",
      intermediario: "Trabalhe fluidez entre níveis e qualidade de movimento (peso/tempo).",
      avancado: "Aprofunde interpretação, contato-improvisação e assinatura autoral do movimento.",
    },
    extraInstruction: "SLAM/queda de peso só com colchão e progressão adequada; nunca peça queda de altura para iniciante.",
  },

  // ─── DANÇA INFANTIL / BABY CLASS / KIDS ────────────────────────────────
  kids: {
    terminology: [
      "brincadeira dançada", "historinha", "jogo rítmico", "pular", "girar",
      "esquerda e direita", "marcha", "equilíbrio", "coordenação", "espelho",
      "contagem com palmas", "alongamento divertido",
    ],
    forbiddenTerms: [
      "pontas", "en dehors extremo", "fouetté", "acrobacia aérea", "power move",
      "headspin", "salto com impacto", "alongamento passivo forçado",
    ],
    warmupDescription: "Aquecimento lúdico com música, imitação de animais e movimentos amplos, em blocos curtos",
    warmupExamples: [
      "Brincadeira 'siga o mestre' por 3 músicas: marchar, pular, girar devagar",
      "Aquecimento dos pés com história (ex.: 'pés de patinho') e alongamento leve",
    ],
    technicalFocusExamples: [
      "Coordenação de braços e pernas em marcha com palmas no tempo",
      "Equilíbrio em um pé com apoio visual (segurar a mão do professor)",
      "Noção de espaço: andar na linha/formação sem esbarrar nos colegas",
    ],
    challengeExamples: [
      "Dançar a coreografia da turma inteira sem parar, com sorriso e olhar para o público",
      "Criar 1 movimento novo para a historinha da aula",
    ],
    levelHints: {
      iniciante: "Use linguagem lúdica, blocos de 3-5 minutos e MUITA repetição positiva.",
      intermediario: "Introduza pequenas sequências de memória e trocas de formação.",
      avancado: "Aumente duração da sequência e precisão rítmica mantendo o caráter lúdico.",
    },
    extraInstruction: "Turmas kids: NUNCA alongamento passivo forçado nem movimentos de impacto; priorize coordenação, escuta musical e diversão.",
  },

  // ─── FITNESS & LIVRE / ZUMBA / ALONGAMENTO ─────────────────────────────
  fitness: {
    terminology: [
      "aquecimento cardiovascular", "condicionamento", "core", "amplitude",
      "mobilidade", "resistência", "alongamento ativo", "respiração",
      "intensidade", "recuperação", "frequência cardíaca", "hidratação",
    ],
    forbiddenTerms: [
      "en dehors clássico", "barra de ballet", "pontas", "sapateado",
      "freeze", "power move", "headspin", "condução de salão",
    ],
    warmupDescription: "Aquecimento progressivo do baixo para o alto impacto, com mobilidade articular completa",
    warmupExamples: [
      "Mobilidade de tornozelo, quadril e ombros + 5 min de cardio leve",
      "Sequência de ativação de core e glúteos antes da coreografia",
    ],
    technicalFocusExamples: [
      "Postura neutra e respiração durante a coreografia de alta intensidade",
      "Amplitude completa nos movimentos de agachamento e afundo",
      "Controle de intensidade por percepção de esforço (leve/moderado/intenso)",
    ],
    challengeExamples: [
      "Completar a coreografia inteira mantendo a técnica mesmo cansado(a)",
      "Fazer 2 blocos seguidos com controle de respiração e sem perder o tempo",
    ],
    levelHints: {
      iniciante: "Adapte impacto (versão sem salto) e priorize constância na execução.",
      intermediario: "Aumente volume e intensidade mantendo qualidade técnica.",
      avancado: "Trabalhe potência, resistência e variações de alta intensidade com recuperação planejada.",
    },
    extraInstruction: "Aula fitness não é consulta médica: oriente parar em caso de dor, tontura ou falta de ar e procurar avaliação profissional.",
  },

  // ─── GERAL / NÃO MAPEADA (dança) ───────────────────────────────────────
  geral: {
    terminology: [
      "aquecimento", "postura", "equilíbrio", "coordenação", "musicalidade",
      "contagem", "memória coreográfica", "alongamento", "expressão",
      "marcação", "coreografia", "ensaio",
    ],
    forbiddenTerms: [],
    warmupDescription: "Aquecimento geral de articulações (tornozelos, joelhos, quadril, coluna e ombros) antes da parte técnica",
    warmupExamples: [
      "Mobilidade articular completa, 5 min, dos pés à cabeça",
      "Alongamento ativo leve + ativação de core antes da coreografia",
    ],
    technicalFocusExamples: [
      "Postura e equilíbrio nas transições de peso",
      "Memorização de uma sequência curta com contagem em 8 tempos",
      "Musicalidade: marcar o tempo forte com o corpo",
    ],
    challengeExamples: [
      "Executar a sequência completa sem parar e sem perder a contagem",
      "Gravar a sequência em vídeo e comparar com a marcação do professor",
    ],
    levelHints: {
      iniciante: "Use linguagem simples, demonstre devagar e valide cada passo antes de juntar.",
      intermediario: "Aumente a velocidade e junte passos em combinações maiores.",
      avancado: "Refine qualidade de movimento, dinâmica e interpretação.",
    },
    extraInstruction: "Este aluno está em uma modalidade ainda não mapeada no sistema — crie exercícios coerentes com a modalidade informada no contexto, sempre focando técnica, musicalidade e segurança.",
  },
};

/** Normaliza texto para busca de palavras-chave (sem acentos, minúsculo). */
function normalizeKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve o contexto pedagógico a partir do nome da modalidade e/ou da
 * categoria cadastrada em Modalidades & Ritmos. Fallback = "geral" (dança).
 */
export function getInstrumentContext(
  instrumentName: string,
  instrumentCategory: string
): { context: InstrumentContext; resolvedCategory: InstrumentCategory } {
  const cat = normalizeKey(instrumentCategory);
  const name = normalizeKey(instrumentName);
  const source = `${cat} ${name}`;

  const rules: Array<{ category: InstrumentCategory; keys: string[] }> = [
    {
      category: "ballet",
      keys: ["ballet", "bale", "classico", "classica", "pontas", "repertorio", "danca classica"],
    },
    {
      category: "urbanas",
      keys: ["urbana", "urbanas", "urban", "hip hop", "hiphop", "street", "breaking", "breakdance", "popping", "locking", "house", "kpop", "k-pop", "funk", "dancehall", "dance hall", "passinho"],
    },
    {
      category: "salao",
      keys: ["salao", "a dois", "forro", "samba", "tango", "bolero", "salsa", "bachata", "zouk", "kizomba", "valsa", "gaucho", "pagode", "rasga", "danca de salao"],
    },
    {
      category: "sapateado",
      keys: ["sapateado", "tap", "claquete"],
    },
    {
      category: "jazz",
      keys: ["jazz", "lirico", "musical", "theatre", "teatro musical", "broadway"],
    },
    {
      category: "kids",
      keys: ["infantil", "kids", "baby", "baby class", "crianca", "danca infantil"],
    },
    {
      category: "fitness",
      keys: ["fitness", "livre", "zumba", "fitdance", "fit dance", "alongamento", "flexibilidade", "pilates", "ritmos", "condicionamento"],
    },
    {
      category: "contemporaneo",
      keys: ["contemporaneo", "contemporanea", "moderno", "moderna", "danca moderna", "improvisacao"],
    },
  ];

  for (const rule of rules) {
    if (rule.keys.some((key) => source.includes(key))) {
      return { context: INSTRUMENT_CONTEXTS[rule.category], resolvedCategory: rule.category };
    }
  }

  return { context: INSTRUMENT_CONTEXTS.geral, resolvedCategory: "geral" };
}
