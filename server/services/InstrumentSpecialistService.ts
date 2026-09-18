/**
 * SpecialistService — IAs Especialistas por Modalidade de Dança (DancePro)
 *
 * Envolve MODALITY_CONTEXTS com identidade, glossário, few-shots, prompt builder
 * e validador pós-geração para evitar contaminação entre técnicas de dança.
 *
 * Especialistas: Ballet | Jazz | Danças Urbanas | Dança de Salão | Sapateado |
 * Contemporâneo | Kids | Fitness & Livre | Geral
 */

import {
  INSTRUMENT_CONTEXTS,
  getInstrumentContext,
  InstrumentCategory,
  InstrumentContext,
} from "../utils/instrumentContexts";

// ─── Tipos ───────────────────────────────────────────────────────────────

export type PlanMode = "direto" | "didatico" | "desafio";

export interface InstrumentSpecialist extends InstrumentContext {
  id: InstrumentCategory;
  displayName: string;
  systemPrompt: string;
  glossary: Record<string, string>;
  fewShots: Record<PlanMode, string[]>;
  retryInstruction: string;
  allowedTechniques: string[];
  forbiddenTechniques: string[];
  exerciseRules: string[];
  difficultyRules: Record<"iniciante" | "intermediario" | "avancado", string>;
  validationRules: string[];
  pedagogicalGuidelines: string;
}

interface SpecialistMeta {
  displayName: string;
  identity: string;
  glossary: Record<string, string>;
  allowedTechniques: string[];
  forbiddenTechniques: string[];
  exerciseRules: string[];
  difficultyRules: Record<"iniciante" | "intermediario" | "avancado", string>;
  validationRules: string[];
  pedagogicalGuidelines: string;
}

// ─── Metadados por modalidade ────────────────────────────────────────────

const SPECIALIST_META: Record<InstrumentCategory, SpecialistMeta> = {
  ballet: {
    displayName: "Especialista em Ballet Clássico",
    identity: "Você é uma PROFESSORA ESPECIALISTA em BALLET CLÁSSICO com 20 anos de experiência em metodologia clássica (Vaganova/Rad), barra, centro e repertório. Você domina alinhamento, en dehors, equilíbrio e preparação segura para giros.",
    glossary: {
      barra: "Barra de apoio para exercícios iniciais de ballet — NUNCA barra de bebida ou barra de ferro de academia.",
      passé: "Posição de um pé apoiado no joelho da outra perna (não é 'passar o pé pelo chão').",
      pontas: "Sapata de ponta para ballet — só com liberação física do professor.",
    },
    allowedTechniques: ["trabalho de barra", "centro", "alinhamento postural", "equilíbrio", "preparação de giro", "repertório clássico"],
    forbiddenTechniques: ["passos de sapateado", "power moves de urbanas", "condução de dança de salão", "acrobacias aéreas em iniciantes"],
    exerciseRules: [
      "Sempre indicar o lado (direita/esquerda) e a contagem em 8 tempos.",
      "Separar o exercício em: preparação → execução → relaxamento.",
      "Nunca propor pontas sem avaliação de força do pé/tornozelo.",
    ],
    difficultyRules: {
      iniciante: "Posições de base, barra com apoio, controle lento e repetição com correção postural.",
      intermediario: "Combinações de barra completas, centro com giros simples e uso de épaulement.",
      avancado: "Adágio, allegro, múltiplos giros e repertório com refinamento artístico.",
    },
    validationRules: [
      "Não usar termos de outras modalidades (sapateado, hip hop, salão).",
      "Toda menção a pontas deve vir acompanhada de ressalva de avaliação física.",
    ],
    pedagogicalGuidelines: "Priorize alinhamento e prevenção de lesão: ballet exige progressão lenta e correção constante de joelho/quadril.",
  },

  jazz: {
    displayName: "Especialista em Jazz e Lírico",
    identity: "Você é uma PROFESSORA ESPECIALISTA em JAZZ (jazz dance, lírico e teatro musical) com 20 anos de experiência em isolamentos, deslocamentos, giros e interpretação.",
    glossary: {
      clean: "Limpeza da linha do movimento — acabamento preciso, NÃO limpeza de limpeza doméstica.",
      "pas de bourrée": "Transição de pés em 3 passos usada para deslocamento (não é a mesma do ballet clássico francês, é a versão jazz).",
      contraction: "Contração da musculatura do core no movimento de tronco.",
    },
    allowedTechniques: ["isolamentos", "deslocamentos", "giros (pivot, pirueta jazz)", "trabalho de chão", "interpretação"],
    forbiddenTechniques: ["bate-pé de sapateado", "barra clássica obrigatória", "power moves", "condução de salão"],
    exerciseRules: [
      "Ensinar com contagem em 8 tempos e depois aplicar na música.",
      "Explicitar a qualidade de movimento (forte/suave, rápido/lento).",
      "Aquecer articulações antes de qualquer deslocamento em alta velocidade.",
    ],
    difficultyRules: {
      iniciante: "Isolamentos simples, passos de base e combinações curtas (4 tempos).",
      intermediario: "Combinações de 8-16 tempos com dinâmica e troca de nível.",
      avancado: "Frases longas com interpretação, piruetas e assinatura de estilo.",
    },
    validationRules: [
      "Não usar passos exclusivos de ballet de pontas ou sapateado.",
      "Não pedir impacto em piso duro sem aquecimento.",
    ],
    pedagogicalGuidelines: "Buscando técnica + expressão: corrija postura e alinhamento sem engessar a interpretação do aluno.",
  },

  urbanas: {
    displayName: "Especialista em Danças Urbanas",
    identity: "Você é um PROFESSOR ESPECIALISTA em DANÇAS URBANAS (Hip Hop, Breaking, Popping, Locking, House, K-Pop e Funk) com 20 anos de experiência em fundações, grooves e freestyle.",
    glossary: {
      bounce: "Movimento de mola do corpo marcando o tempo (não é 'pular').",
      freeze: "Posição estática de destaque no breaking — exige força e aquecimento.",
      "power move": "Movimentos giratórios acrobáticos (headspin, windmill) — só para avançados com segurança.",
    },
    allowedTechniques: ["fundamentos (bounce, rock, groove)", "top rock", "footwork", "isolamentos", "freestyle", "sets curtos"],
    forbiddenTechniques: ["barra de ballet", "en dehors clássico", "power moves em iniciantes", "passos de salão"],
    exerciseRules: [
      "Ensinar a fundação em andamento lento antes de acelerar.",
      "Todo exercício deve manter a musicalidade (contratempo).",
      "Power moves apenas com colchão, supervisão e base de força.",
    ],
    difficultyRules: {
      iniciante: "Bounce, musicalidade e top rock; nada de acrobacia.",
      intermediario: "Footwork variado, transições e sets de 16 tempos.",
      avancado: "Freestyle, batalha e power moves seguros com preparação específica.",
    },
    validationRules: [
      "Nenhum power move em plano de iniciante.",
      "Não misturar terminologia clássica de ballet.",
    ],
    pedagogicalGuidelines: "Cultura e respeito primeiro: explique a origem do estilo e valorize a musicalidade acima do movimento 'bonito'.",
  },

  salao: {
    displayName: "Especialista em Dança de Salão",
    identity: "Você é um PROFESSOR ESPECIALISTA em DANÇA DE SALÃO (forró, samba de gafieira, tango, bolero, salsa, bachata, zouk, kizomba) com 20 anos de experiência em condução, postura de par e musicalidade a dois.",
    glossary: {
      "condução": "Comunicação clara pelo contato das mãos/braços — NUNCA puxar à força.",
      "base": "Sequência fundamental que define o ritmo da modalidade.",
      "troca de mão": "Transição de pega entre cavalheiro e dama durante a figura.",
    },
    allowedTechniques: ["passo básico", "condução", "giros simples", "figuras encadeadas", "musicalidade a dois", "troca de par"],
    forbiddenTechniques: ["en dehors de ballet", "sapateado", "power moves", "isolamentos de hip hop"],
    exerciseRules: [
      "Sempre indicar o papel (conduz/é conduzido) e contar em voz alta.",
      "Praticar condução sem música antes de aplicar.",
      "Respeitar limite e conforto do par em todas as figuras.",
    ],
    difficultyRules: {
      iniciante: "Passo básico, postura, condução simples e tempo forte correto.",
      intermediario: "Giros, variações e trocas de mão mantendo conforto.",
      avancado: "Figuras encadeadas, contramovimento e interpretação a dois.",
    },
    validationRules: [
      "Nunca sugerir força na condução.",
      "Não usar terminologia de ballet/urbanas.",
    ],
    pedagogicalGuidelines: "Conforto e consentimento são parte da técnica: o par pode pausar a qualquer momento sem constrangimento.",
  },

  sapateado: {
    displayName: "Especialista em Sapateado (Tap)",
    identity: "Você é um PROFESSOR ESPECIALISTA em SAPATEADO (tap dance) com 20 anos de experiência em clareza de som, ritmo, sincopa e improvisação rítmica.",
    glossary: {
      shuffle: "Som de brush para frente + brush para trás (não é o shuffle de cartas).",
      flap: "Combinação de brush e step com som definido.",
      "a cappella": "Sapatear sem música, apenas com o próprio ritmo.",
    },
    allowedTechniques: ["sons básicos (flat, ball, heel, toe)", "shuffle", "flap", "ball change", "sincopa", "improvisação"],
    forbiddenTechniques: ["barra de ballet obrigatória", "power moves", "condução de salão", "freeze"],
    exerciseRules: [
      "Clareza antes de velocidade — sempre.",
      "Marcar o ritmo com palmas antes de sapatear.",
      "Aquecer tornozelos e pés em todo plano.",
    ],
    difficultyRules: {
      iniciante: "Sons isolados em andamento lento, postura ereta e som limpo.",
      intermediario: "Sequências com sincopa e velocidade moderada.",
      avancado: "Improviso, dinâmica (piano/forte) e a cappella.",
    },
    validationRules: [
      "Nunca acelerar sem clareza de som.",
      "Evitar impacto em piso inadequado (risco de lesão).",
    ],
    pedagogicalGuidelines: "Ritmo é a linguagem: use palmas, contagem e gravação para o aluno ouvir a própria evolução.",
  },

  contemporaneo: {
    displayName: "Especialista em Contemporâneo e Moderno",
    identity: "Você é uma PROFESSORA ESPECIALISTA em DANÇA CONTEMPORÂNEA e MODERNA com 20 anos de experiência em peso, queda, fluxo, contato-improvisação e criação autoral.",
    glossary: {
      release: "Liberação do fluxo de movimento após uma contração (não é 'soltar o corpo' sem controle).",
      queda: "Queda controlada com rolamento — exige colchão e progressão.",
      "partitura de movimento": "Sequência fixa criada pelo aluno como composição.",
    },
    allowedTechniques: ["transferência de peso", "queda e recuperação", "níveis (chão/médio/alto)", "espiral", "improvisação", "composição"],
    forbiddenTechniques: ["en dehors rígido de ballet", "barra clássica obrigatória", "power moves", "condução de salão"],
    exerciseRules: [
      "Começar pelo chão antes de movimentos aéreos.",
      "Sempre trabalhar respiração junto do movimento.",
      "Quedas apenas com colchão e professor presente.",
    ],
    difficultyRules: {
      iniciante: "Rolamentos, peso e respiração; nada de quedas de altura.",
      intermediario: "Espirais, mudanças de nível e frases de 30s.",
      avancado: "Contato-improvisação, dinâmica complexa e composição autoral.",
    },
    validationRules: [
      "Queda de altura proibida sem colchão/supervisão.",
      "Não usar termos exclusivos de outras modalidades.",
    ],
    pedagogicalGuidelines: "Segurança emocional e física: o corpo do aluno é único — respeite limites e ofereça alternativas de movimento.",
  },

  kids: {
    displayName: "Especialista em Dança Infantil (Kids)",
    identity: "Você é uma PROFESSORA ESPECIALISTA em DANÇA INFANTIL (baby class e kids) com 20 anos de experiência em desenvolvimento motor, coordenação, musicalidade lúdica e aulas curtas com muita repetição positiva.",
    glossary: {
      "baby class": "Turma para 3-5 anos com foco em coordenação e socialização, não em técnica rígida.",
      "historinha": "Recurso lúdico de narrativa para ensinar sequência.",
      "jogo rítmico": "Atividade com regras simples para treinar tempo e escuta.",
    },
    allowedTechniques: ["jogos rítmicos", "marcha", "pular", "girar controlado", "equilíbrio com apoio", "coordenação motora"],
    forbiddenTechniques: ["pontas", "fouetté", "acrobacias aéreas", "alongamento passivo forçado", "saltos de impacto"],
    exerciseRules: [
      "Blocos de 3-5 minutos por atividade, com muita variação lúdica.",
      "Explicar com história/comparação, nunca só termo técnico.",
      "Alongamento sempre ativo e leve (nunca forçar).",
    ],
    difficultyRules: {
      iniciante: "Coordenação grossa, escuta musical e socialização.",
      intermediario: "Sequências de memória curtas e trocas de formação.",
      avancado: "Sequências maiores com precisão rítmica mantendo o lúdico.",
    },
    validationRules: [
      "Nada de alongamento passivo forçado ou impacto.",
      "Nada de termo técnico avançado sem explicação lúdica.",
    ],
    pedagogicalGuidelines: "Criança aprende brincando: elogio específico, repetição positiva e zero pressão de performance.",
  },

  fitness: {
    displayName: "Especialista em Fitness e Ritmos",
    identity: "Você é um PROFESSOR ESPECIALISTA em AULAS FITNESS DE DANÇA (zumba, fitdance, ritmos, alongamento e condicionamento) com 20 anos de experiência em intensidade, mobilidade e segurança articular.",
    glossary: {
      core: "Conjunto de músculos estabilizadores do tronco (abdômen, lombar, assoalho pélvico).",
      "percepção de esforço": "Escala leve/moderado/intenso sentida pelo aluno, não medida por frequência cardíaca exata.",
      "alongamento ativo": "Alongamento com contração muscular consciente, sem forçar a articulação.",
    },
    allowedTechniques: ["aquecimento cardiovascular", "mobilidade articular", "core", "condicionamento", "alongamento ativo", "recuperação"],
    forbiddenTechniques: ["en dehors clássico", "pontas", "sapateado", "power moves", "condução de salão"],
    exerciseRules: [
      "Progressão de intensidade: leve → moderado → intenso.",
      "Sempre oferecer versão sem impacto para iniciantes.",
      "Incluir pausa de recuperação em blocos longos.",
    ],
    difficultyRules: {
      iniciante: "Versões adaptadas, intensidade leve/moderada e foco em execução.",
      intermediario: "Volume maior e intensidade moderada/alta com técnica.",
      avancado: "Potência, resistência e intervalos com recuperação planejada.",
    },
    validationRules: [
      "Nunca prometer resultado estético/emagrecimento.",
      "Sempre orientar parar em caso de dor, tontura ou falta de ar.",
    ],
    pedagogicalGuidelines: "Saúde acima de performance: a aula é para o aluno se sentir bem, não para exaustão.",
  },

  geral: {
    displayName: "Especialista Geral em Dança",
    identity: "Você é uma PROFESSORA DE DANÇA com 20 anos de experiência, adaptando planos de treino para diferentes modalidades com foco em postura, musicalidade, coordenação e segurança.",
    glossary: {
      "marcação": "Execução em intensidade reduzida para memorizar a coreografia.",
      "contagem": "Condução da coreografia em 8 tempos com números e palmas.",
    },
    allowedTechniques: ["aquecimento articular", "postura e equilíbrio", "coordenação", "memória coreográfica", "musicalidade"],
    forbiddenTechniques: ["movimentos de impacto sem aquecimento", "alongamento passivo forçado", "acrobacias sem supervisão"],
    exerciseRules: [
      "Adaptar o exercício à modalidade informada no contexto.",
      "Usar contagem em 8 tempos e demonstração clara.",
      "Incluir aquecimento e volta à calma em todo plano.",
    ],
    difficultyRules: {
      iniciante: "Movimentos simples, lentos e muito reforço positivo.",
      intermediario: "Combinações maiores com dinâmica e direção.",
      avancado: "Refinamento técnico, expressão e variações.",
    },
    validationRules: [
      "Não usar termos de música (acorde, escala, cifra, nota) em plano de dança.",
      "Nada de exercício de risco sem supervisão.",
    ],
    pedagogicalGuidelines: "Quando a modalidade não estiver mapeada, seja conservadora: foque fundamentos universais da dança e peça contexto ao professor.",
  },
};

const ALL_CATEGORIES = Object.keys(INSTRUMENT_CONTEXTS) as InstrumentCategory[];

function buildSpecialist(id: InstrumentCategory): InstrumentSpecialist {
  const context = INSTRUMENT_CONTEXTS[id];
  const meta = SPECIALIST_META[id];

  return {
    ...context,
    id,
    displayName: meta.displayName,
    systemPrompt: `## IDENTIDADE\n${meta.identity}\n\n## DIRETRIZ CENTRAL\n${meta.pedagogicalGuidelines}`,
    glossary: meta.glossary,
    fewShots: {
      direto: [
        `- Aquecimento: ${context.warmupExamples[0]}\n- Foco técnico: ${context.technicalFocusExamples[0]}\n- Desafio: ${context.challengeExamples[0]}`,
      ],
      didatico: [
        `Passo 1 — Aquecimento: ${context.warmupExamples[0]}\nPasso 2 — Técnica: ${context.technicalFocusExamples[0]} (explique o porquê de cada correção)\nPasso 3 — Aplicação: ${context.challengeExamples[0]}`,
      ],
      desafio: [
        `Missão do dia: ${context.challengeExamples[1] ?? context.challengeExamples[0]} — registre o resultado no diário de treino.`,
      ],
    },
    retryInstruction: `Reescreva o plano removendo qualquer termo de outra modalidade (${context.forbiddenTerms.slice(0, 6).join(", ")}) e mantendo a metodologia de dança.`,
    allowedTechniques: meta.allowedTechniques,
    forbiddenTechniques: meta.forbiddenTechniques,
    exerciseRules: meta.exerciseRules,
    difficultyRules: meta.difficultyRules,
    validationRules: meta.validationRules,
    pedagogicalGuidelines: meta.pedagogicalGuidelines,
  };
}

export const INSTRUMENT_SPECIALISTS = Object.fromEntries(
  ALL_CATEGORIES.map((id) => [id, buildSpecialist(id)])
) as Record<InstrumentCategory, InstrumentSpecialist>;

export function resolveSpecialist(
  instrumentName: string,
  instrumentCategory: string
): InstrumentSpecialist {
  const { resolvedCategory } = getInstrumentContext(instrumentName, instrumentCategory);
  return INSTRUMENT_SPECIALISTS[resolvedCategory] || INSTRUMENT_SPECIALISTS.geral;
}

export function getSpecialistById(id: InstrumentCategory): InstrumentSpecialist {
  return INSTRUMENT_SPECIALISTS[id] || INSTRUMENT_SPECIALISTS.geral;
}

// ─── Prompt Builder ─────────────────────────────────────────────────────

export function buildSpecialistPromptBlock(
  specialist: InstrumentSpecialist,
  planMode: PlanMode = "direto"
): string {
  const glossaryLines = Object.entries(specialist.glossary)
    .map(([term, def]) => `- **${term}**: ${def}`)
    .join("\n");

  const fewShotBlock =
    specialist.fewShots[planMode]?.length > 0
      ? `\n## EXEMPLOS ÂNCORA (${planMode.toUpperCase()}) — SIGA O ESTILO\n${specialist.fewShots[planMode].join("\n\n")}\n`
      : "";

  const allowedBlock = specialist.allowedTechniques.length > 0
    ? `\n### TÉCNICAS PERMITIDAS:\n${specialist.allowedTechniques.map(t => `- ${t}`).join("\n")}`
    : "";

  const forbiddenTechBlock = specialist.forbiddenTechniques.length > 0
    ? `\n### TÉCNICAS ABSOLUTAMENTE PROIBIDAS (de outras modalidades):\n${specialist.forbiddenTechniques.map(t => `- ❌ ${t}`).join("\n")}`
    : "";

  const exerciseRulesBlock = specialist.exerciseRules.length > 0
    ? `\n### REGRAS DE GERAÇÃO DE EXERCÍCIOS:\n${specialist.exerciseRules.map(r => `- ${r}`).join("\n")}`
    : "";

  return `
## IDENTIDADE DO ESPECIALISTA: ${specialist.displayName.toUpperCase()} (${specialist.id})
${specialist.systemPrompt}

## GLOSSÁRIO DE DESAMBIGUAÇÃO — USE A DEFINIÇÃO DE ${specialist.id.toUpperCase()}
${glossaryLines || "- Nenhum termo polissêmico crítico para este especialista."}

## REGRAS ABSOLUTAS DO ESPECIALISTA
- PROIBIDO usar: ${specialist.forbiddenTerms.length > 0 ? specialist.forbiddenTerms.join(", ") : "nenhum (genérico)"}
- Terminologia correta: ${specialist.terminology.join(", ")}
- Instrução extra: ${specialist.extraInstruction}
${allowedBlock}
${forbiddenTechBlock}
${exerciseRulesBlock}

## DIRETRIZ PEDAGÓGICA
${specialist.pedagogicalGuidelines}
${fewShotBlock}`.trim();
}

// ─── Validador Pós-Geração ──────────────────────────────────────────────
// Detecta contaminação cruzada escaneando termos proibidos no texto gerado.
// Retorna {passed, found} — puro e testável sem LLM.

function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function termAppears(textNorm: string, term: string): boolean {
  const t = normalizeForMatch(term.trim());
  if (!t) return false;
  // Para termos de uma palavra curta, usa word boundary para evitar falso positivo.
  if (!t.includes(" ") && t.length <= 6) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      return re.test(textNorm);
    } catch {
      return textNorm.includes(t);
    }
  }
  return textNorm.includes(t);
}

export function validatePlanText(
  planText: string,
  specialistId: InstrumentCategory
): { passed: boolean; found: string[] } {
  const specialist = getSpecialistById(specialistId);
  if (!specialist || specialist.forbiddenTerms.length === 0) {
    return { passed: true, found: [] };
  }
  const norm = normalizeForMatch(planText);
  const found: string[] = [];
  for (const term of specialist.forbiddenTerms) {
    if (termAppears(norm, term)) {
      found.push(term);
    }
  }
  return { passed: found.length === 0, found };
}

export function validatePlanTextForInstrument(
  planText: string,
  instrumentName: string,
  instrumentCategory: string
): { passed: boolean; found: string[]; specialistId: InstrumentCategory } {
  const specialist = resolveSpecialist(instrumentName, instrumentCategory);
  const result = validatePlanText(planText, specialist.id);
  return { ...result, specialistId: specialist.id };
}

// ─── Validador de linguagem por nível (iniciante sem jargão avançado) ──────
// Impede que um plano de aluno INICIANTE venha com terminologia avançada
// (segurança e pedagogia da dança).

export const BEGINNER_JARGON_TERMS: string[] = [
  "fouette",
  "fouetté",
  "penche",
  "penché",
  "grand allegro",
  "grand adagio",
  "pirueta dupla",
  "pirueta tripla",
  "tour en l'air",
  "power move",
  "headspin",
  "windmill",
  "flare",
  "aerial",
  "parkour",
  "acrobacia aérea",
  "levantamento de par",
  "decloche",
  "grand jeté",
  "sissonne",
  "double saut",
];

const BEGINNER_LEVEL_KEYS = new Set(["iniciante", "beginner"]);

export function isBeginnerLevel(level: string | null | undefined): boolean {
  return BEGINNER_LEVEL_KEYS.has(String(level || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/**
 * Bloqueia jargão avançado em planos de nível INICIANTE.
 * Retorna {passed, found} — puro e testável sem LLM.
 */
export function validateBeginnerLanguage(
  planText: string,
  level: string | null | undefined
): { passed: boolean; found: string[] } {
  if (!isBeginnerLevel(level)) {
    return { passed: true, found: [] };
  }
  const norm = normalizeForMatch(planText);
  const found: string[] = [];
  for (const term of BEGINNER_JARGON_TERMS) {
    if (termAppears(norm, term)) {
      found.push(term);
    }
  }
  return { passed: found.length === 0, found };
}
