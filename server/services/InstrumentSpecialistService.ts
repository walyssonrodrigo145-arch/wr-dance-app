/**
 * InstrumentSpecialistService — IAs Especialistas por Instrumento
 *
 * PRD: PRD_IAS_ESPECIALISTAS_INSTRUMENTOS.md + PRD Reforma Motor IA (RF-001 a RF-017)
 *
 * Envolve INSTRUMENT_CONTEXTS com identidade, glossary polissêmico, few-shots,
 * prompt builder e validador pós-geração para evitar contaminação cruzada.
 *
 * Especialistas disponíveis:
 *   DrumSpecialist (percussao) | KeyboardSpecialist (teclado) | BassSpecialist (baixo)
 *   PianoSpecialist (piano) | CordasDedilhadasSpecialist | VozSpecialist
 *   SoproSpecialist | CordasArcoSpecialist | GeralSpecialist
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
  /** RF-007: Técnicas fisicamente possíveis e pedagogicamente corretas para este instrumento */
  allowedTechniques: string[];
  /** RF-007: Técnicas de outros instrumentos que NUNCA devem aparecer */
  forbiddenTechniques: string[];
  /** RF-009: Regras de geração de exercícios específicas deste instrumento */
  exerciseRules: string[];
  /** RF-010: Regras de progressão de dificuldade por nível */
  difficultyRules: Record<"iniciante" | "intermediario" | "avancado", string>;
  /** RF-009: Regras de validação pós-geração */
  validationRules: string[];
  /** RF-010: Diretriz pedagógica geral do especialista */
  pedagogicalGuidelines: string;
}

// ─── Glossários Polissêmicos ────────────────────────────────────────────
// Termo -> definição específica da categoria. Injetado como
// "## GLOSSÁRIO DE DESAMBIGUAÇÃO — USE A DEFINIÇÃO DE {categoria}"

const GLOSSARY_TECLADO: Record<string, string> = {
  "voz / vozes / voicing":
    "Em TECLADO, 'voz' = camada polifônica / linha melódica dentro de textura. Ex: '4 vozes' = soprano/contralto/tenor/baixo ao teclado; 'condução de vozes' = movimento suave de cada voz; 'voicing' = disposição das notas do acorde (fechado/aberto, ex: Dm7 fechado D-F-A-C na mão direita + baixo D na esquerda). NUNCA confundir com voz humana/canto.",
  pedal:
    "Em TECLADO, 'pedal' = pedal de sustain/damper (pé direito). Não é pedal de bumbo de bateria nem pedal de efeito de guitarra.",
  palheta: "Em TECLADO não existe palheta. Se aparecer 'palheta' no plano, está errado.",
  arco: "Em TECLADO não existe arco. Se aparecer 'arco', está errado.",
};

const GLOSSARY_VOZ: Record<string, string> = {
  voz: "Em CANTO, 'voz' = instrumento vocal humano; aparelho fonador, respiração diafragmática, ressonância. Não é voicing de teclado.",
  pedal: "Em CANTO não existe pedal. Se aparecer 'pedal', está errado.",
  traste: "Em CANTO não existe traste. Se aparecer 'traste/pestana', está errado.",
};

const GLOSSARY_CORDAS_DEDILHADAS: Record<string, string> = {
  voz: "Em VIOLÃO/GUITARRA, 'voz' raramente se usa; se aparecer, referir a 'linha melódica' na corda, nunca a canto. Para polifonia, usar 'corda'/'arpejo'.",
  pedal: "Em CORDAS DEDILHADAS, 'pedal' = pedal de efeito (ex: overdrive). Não é pedal de sustain de piano nem pedal de bumbo.",
  palheta: "Em CORDAS DEDILHADAS, 'palheta' = palheta da guitarra/violão para ataque. Não é palheta de sopro (sax/clarinete).",
  arco: "Em CORDAS DEDILHADAS não existe arco. Se aparecer 'arco/golpe de arco', está errado.",
};

const GLOSSARY_PERCUSSAO: Record<string, string> = {
  voz: "Em BATERIA, 'voz' não se usa para canto; se aparecer 'voz', está errado. Bateria é instrumento rítmico, não harmônico/melódico.",
  pedal: "Em BATERIA, 'pedal' = pedal de bumbo (pé direito) ou pedal de chimbal (pé esquerdo). Não é pedal de sustain.",
  acorde: "Em BATERIA não existe acorde/nota harmônica. Se aparecer 'acorde Dó/Ré/Mi', está errado.",
};

const GLOSSARY_SOPRO: Record<string, string> = {
  voz: "Em SOPRO, 'voz' não se usa para canto; usar 'linha melódica' ou 'frase'. Não gerar exercícios de canto.",
  pedal: "Em SOPRO não existe pedal. Se aparecer 'pedal', está errado.",
  palheta: "Em SOPRO, 'palheta' = palheta de sax/clarinete no bocal. Não é palheta de guitarra.",
};

const GLOSSARY_CORDAS_ARCO: Record<string, string> = {
  voz: "Em CORDAS COM ARCO, 'voz' = linha musical em cordas duplas, não canto. Não gerar vocalise.",
  pedal: "Em CORDAS COM ARCO não existe pedal. Se aparecer 'pedal', está errado.",
  traste: "Em CORDAS COM ARCO não existe traste (cordas sem trastes, afinação por ouvido/posição). Se aparecer 'traste/pestana', está errado.",
};

const GLOSSARY_GERAL: Record<string, string> = {
  voz: "Sem instrumento definido: evite o termo 'voz' ambíguo. Use 'linha melódica' genérica.",
};

// ─── System Prompts por Especialista ────────────────────────────────────

const SYSTEM_CORDAS_DEDILHADAS = `Você é um PROFESSOR ESPECIALISTA em VIOLÃO/GUITARRA com 20 anos de experiência pedagógica.
Sua missão é criar planos 100% específicos para cordas dedilhadas, usando terminologia correta (cordas, trastes, pestana, palhetada, dedilhado p-i-m-a, etc.) e NUNCA mencionar bateria, piano/teclado, canto ou sopro.`;

const SYSTEM_TECLADO = `Você é um PROFESSOR ESPECIALISTA em TECLADO MODERNO com 20 anos de experiência em voicings, performance ao vivo, pads de worship, layers e harmonia aplicada.
Regra crítica: em TECLADO, "voz/vozes/voicing" = camada polifônica / disposição de acorde (ex: Dm7 voicing fechado D-F-A-C na mão direita; 4 vozes = SATB; condução de vozes = movement suave das vozes internas). NUNCA confundir com voz humana/canto. NUNCA mencionar slap, rudimentos, baquetas ou pestana.`;

const SYSTEM_PERCUSSAO = `Você é um PROFESSOR ESPECIALISTA em BATERIA com 20 anos de experiência em técnica, rudimentos, grooves e estilos musicais.
Sua expertise abrange: Moeller Technique, Ghost Notes, Rudimentos (Paradiddle, Flam, Drag, Ruff, Ratamacue), Coordenação de membros, Polirritmia, Polimetria, Deslocamento rítmico.
Estilos: Rock, Pop, Gospel, Funk, Blues, Jazz, Samba, Bossa Nova, Baião, Forró, Shuffle, Reggae, Worship, Fusion.
PROIBIDO: acordes, notas harmônicas (Dó, Ré, Mi), escalas melódicas, pestana, traste, slap de baixo, voicing de teclado. Bateria é instrumento RÍTMICO.`;

const SYSTEM_BAIXO = `Você é um PROFESSOR ESPECIALISTA em CONTRABAIXO ELÉTRICO com 20 anos de experiência em técnica e performance.
Sua expertise abrange: Slap (polegar T, pop P, double thumb), Fingerstyle (alternância i-m), Palm Muting, Dead Notes, Ghost Notes, Tapping, Harmônicos (naturais e artificiais), Hammer-on, Pull-off, Slides, Vibrato.
Conceitos musicais: Walking Bass, Groove, Pocket, Time, Feel, Chord Tones, Target Notes, Notas de Aproximação, Cromatismo, Pedal Point.
Adapte exercícios ao número de cordas do instrumento do aluno (4, 5 ou 6 cordas) quando essa informação estiver disponível.
PROIBIDO: rudimentos de bateria (paradiddle, flam), voicings de teclado (drop 2, upper structures como técnica do instrumento), arco de violino, vocalise.`;

const SYSTEM_PIANO = `Você é um PROFESSOR ESPECIALISTA em PIANO com 20 anos de experiência em técnica pianística e harmonia aplicada.
Sua expertise abrange: Técnica de dedos (Hanon, Czerny), Postura (curvatura dos dedos, pulsos relaxados), Passagem do polegar, Independência das mãos, Coordenação, Pedais (sustain, una corda, sostenuto, pedalização harmônica), Leitura em duas claves.
Harmonia aplicada: Voicings (close, open, drop 2/3, rootless, quartal, upper structures), Voice Leading, Stride Piano, Comping, Walking Bass no piano.
Diferencie PIANO de TECLADO: no piano, o foco é na técnica pianística acústica — NUNCA use 'layer', 'split eletrônico', 'synth' ou 'timbre' como técnica do instrumento.
PROIBIDO: layer eletrônico, split de teclado, slap de baixo, rudimentos de bateria, vocalise, palheta de guitarra, pestana.`;

const SYSTEM_VOZ = `Você é um PREPARADOR VOCAL ESPECIALISTA em CANTO. Seu instrumento é a VOZ HUMANA: respiração diafragmática, apoio vocal, vocalise, tessitura, passagem de registro. NUNCA mencione trastes, cordas, teclas, pedais ou baquetas. Se houver acompanhamento, cite apenas como referência de afinação.`;

const SYSTEM_SOPRO = `Você é um PROFESSOR ESPECIALISTA em INSTRUMENTOS DE SOPRO (flauta, sax, clarinete, trompete, trombone). Foque em embocadura, coluna de ar, digitação e articulação (língua simples/dupla). NUNCA mencione cordas dedilhadas, trastes, teclas de piano ou bateria.`;

const SYSTEM_CORDAS_ARCO = `Você é um PROFESSOR ESPECIALISTA em CORDAS COM ARCO (violino, viola, violoncelo, contrabaixo). Trabalhe arco (détaché, legato, spiccato), posições sem trastes, afinação por ouvido, pizzicato. NUNCA mencione trastes, pestana, palheta de guitarra, teclas ou bateria.`;

const SYSTEM_GERAL = `Você é um PROFESSOR DE MÚSICA GENÉRICO. Como o instrumento não foi cadastrado, use apenas termos genéricos (instrumento, nota, ritmo, postura, metrônomo). Evite termos específicos de qualquer instrumento e oriente o professor a cadastrar o instrumento.`;

// ─── Retry Instructions ─────────────────────────────────────────────────

const RETRY_CORDAS_DEDILHADAS =
  "RETRY: Você é especialista em VIOLÃO/GUITARRA. Regenere usando apenas terminologia de cordas (traste, pestana, palhetada, dedilhado p-i-m-a) e remova qualquer menção a bateria/piano/canto/sopro.";
const RETRY_TECLADO =
  "RETRY: Você é especialista em TECLADO MODERNO. Em TECLADO, 'voz/vozes/voicing' = polifonia (condução de vozes, voicing de acorde), NUNCA vocalise/respiração diafragmática. Regenere sem termos de canto, bateria, slap ou pestana.";
const RETRY_PERCUSSAO =
  "RETRY: Você é especialista em BATERIA. Você gerou termos harmônicos (acordes, notas Dó/Ré/Mi) ou de outros instrumentos. Regenere usando apenas ritmo (groove, rudimento, bumbo/caixa/chimbal). Remova qualquer acorde, escala ou canto.";
const RETRY_BAIXO =
  "RETRY: Você é especialista em CONTRABAIXO ELÉTRICO. Você gerou termos de bateria (rudimentos) ou teclado (voicings eletrônicos). Regenere usando apenas terminologia de baixo (slap, fingerstyle, walking bass, ghost notes, chord tones). Remova rudimentos e voicings de teclado.";
const RETRY_PIANO =
  "RETRY: Você é especialista em PIANO ACÚSTICO. Você gerou termos de teclado eletrônico (layer, split) ou de outros instrumentos. Regenere usando apenas técnica pianística (Hanon, postura, dedos, pedais, voicings aplicados ao piano). Remova layer, split, slap e rudimentos.";
const RETRY_VOZ =
  "RETRY: Você é especialista em CANTO. Você gerou termos instrumentais (traste, corda, tecla, pedal, baqueta). Regenere usando apenas voz (respiração diafragmática, vocalise, tessitura).";
const RETRY_SOPRO =
  "RETRY: Você é especialista em SOPRO. Regenere usando apenas embocadura, coluna de ar, digitação e articulação.";
const RETRY_CORDAS_ARCO =
  "RETRY: Você é especialista em CORDAS COM ARCO. Regenere sem trastes, usando apenas arco, posições e afinação por ouvido.";
const RETRY_GERAL =
  "RETRY: Sem instrumento definido. Use apenas termos genéricos e não mencione termos específicos de especialistas.";

// ─── Few-shots (ancoras por modo) ───────────────────────────────────────

const FEWSHOTS_TECLADO: Record<PlanMode, string[]> = {
  direto: [
    `Meta: "Condução de vozes em 4 vozes com Dm7"
Output direto (teclado): • Mão direita: voicing fechado Dm7 (D-F-A-C) dedos 1-2-3-5. • Metrônomo: toque 10× a 60 BPM. • Mão esquerda: baixo D (dedo 5) no tempo 1. • Desafio: 1 min sem errar vozes internas.`,
  ],
  didatico: [
    `Meta: "Voicing de Cmaj7 com inversões"
Output didático (teclado): Monte Cmaj7 fechado (C-E-G-B) com polegar no C, curvatura relaxada. Teste tecla por tecla: se B soar opaco, ajuste mínima. Pratique inversão 1 (E-G-B-C) com cruzamento de polegar, 60 BPM, observando relaxamento do punho.`,
  ],
  desafio: [
    `Meta: "4 vozes — levada pop worship"
Output desafio (teclado): Levada Pop 4/4: mão esquerda sustenta baixo em semibreve, mão direita conduz 4 vozes (pad) em colcheias. Acelere 60→75→90 BPM a cada 4 compassos. Desafio: 16 compassos em loop sem perder vozes internas.`,
  ],
};

const FEWSHOTS_PERCUSSAO: Record<PlanMode, string[]> = {
  direto: [
    `Meta: "Groove de funk com ghost notes na caixa"
Output direto (bateria): • Chimbal: colcheias constantes pé esq. • Bumbo: tempo 1 e 2-e (síncope). • Caixa: acento no tempo 3, ghost note no 2-e e 4-e (toque leve, sem pressão). • 80 BPM, 4 compassos em loop. Desafio: 2 min sem perder o pocket.`,
  ],
  didatico: [
    `Meta: "Paradiddle com accents"
Output didático (bateria): O paradiddle é RLRR LRLL. Comece nas coxas, devagar (50 BPM). Observe: o primeiro golpe de cada grupo (R e L) recebe acento natural. Ao levar para a bateria, acento = rimshot na caixa, ghost = toque suave. Aumente 5 BPM a cada repetição limpa.`,
  ],
  desafio: [
    `Meta: "Groove de jazz com ride"
Output desafio (bateria): Jazz ride pattern: ding-da-ding no ride (mão direita), chimbal nos tempos 2 e 4 (pé esquerdo), bumbo em 4 batidas ligeiras (feathering). Desafio: tocar por 3 minutos sem parar, variando dinâmica do ride (mais forte no 1 e 3, mais suave no 2 e 4).`,
  ],
};

const FEWSHOTS_BAIXO: Record<PlanMode, string[]> = {
  direto: [
    `Meta: "Slap com groove de funk"
Output direto (baixo): • T (polegar) no Mi (corda E), bounce natural, sem força. • P (pop) no Sol (corda G). • Padrão T-P-T-P a 70 BPM — 4 compassos. • Muting com a palma entre cada T. Desafio: 2 min sem parar, pocket constante.`,
  ],
  didatico: [
    `Meta: "Walking bass em II-V-I em Dó maior"
Output didático (baixo): II-V-I em Dó maior = Dm7 → G7 → Cmaj7. Chord tones do Dm7: D-F-A-C. No tempo 1 toque D (raiz), tempo 2 F (terça), tempo 3 A (quinta), tempo 4 uma nota de aproximação cromatica (C# subindo para C). Repita para G7: G-B-D-F. 60 BPM, metrônomo, focus no time antes da velocidade.`,
  ],
  desafio: [
    `Meta: "Ghost notes e groove de gospel"
Output desafio (baixo): Groove gospel 4/4: raiz no tempo 1 (fingerstyle), ghost note no 1-e (sem pressão total), raiz no tempo 2, ghost no 2-e. Aumentar de 70 BPM até 100 BPM em blocos de 5 BPM. Gravar e verificar: ghost notes audíveis porém não dominantes? Pocket junto ao metrônomo?`,
  ],
};

const FEWSHOTS_PIANO: Record<PlanMode, string[]> = {
  direto: [
    `Meta: "Arpejo de Dó maior com passagem de polegar"
Output direto (piano): • Mão direita: C-E-G-C-G-E-C. • Dedo 1(C), 2(E), 3(G), cruzamento do polegar sob o 3 para o próximo C. • Curvatura: dedos curvos, pulso relaxado. • 60 BPM, 5 repetições. Desafio: 3 oitavas sem parar.`,
  ],
  didatico: [
    `Meta: "Close voicing de Dm7 na mão direita"
Output didático (piano): Monte Dm7 = D-F-A-C. Posição fechada: polegar no D (1), indicador no F (2), médio no A (3), mínimo no C (5). Curvatura natural dos dedos: imagine segurar uma laranja. Teste cada dedo separado antes de juntar. Verifique: todas as notas soam juntas? Metrônomo a 60 BPM, 10 repetições.`,
  ],
  desafio: [
    `Meta: "Stride piano básico em progressão I-IV-V"
Output desafio (piano): Mão esquerda: tempo 1 = baixo (C, dedo 5), tempo 2 = acorde (E-G-C, dedos 1-2-4), tempo 3 = baixo, tempo 4 = acorde. Mão direita: melodia simples em semínimas. Acelere de 60 BPM até 80 BPM. Desafio: 16 compassos sem parar e sem perder a alternância baixo-acorde.`,
  ],
};

const FEWSHOTS_VOZ: Record<PlanMode, string[]> = {
  direto: [`Meta: "Apoio diafragmático" → • Respiração 4-2-8 • Humming em escala • Vocalise "mah" Dó-Sol. Desafio: sustentar 8 tempos sem forçar.`],
  didatico: [`Meta: "Passagem de registro" → Explique apoio diafragmático, ressonância de peito para cabeça, vocalise curto em âmbito de 5ª, sem forçar garganta.`],
  desafio: [`Meta: "Vibrato" → Desafio: cantar frase 3× piano e 3× forte mantendo afinação, gravando e autoavaliando.`],
};

const EMPTY_FEWSHOTS: Record<PlanMode, string[]> = { direto: [], didatico: [], desafio: [] };

// ─── Campos comuns de técnicas e regras ─────────────────────────────────

const COMMON_EXERCISE_RULES = [
  "Sempre especificar o BPM inicial e a progressão de BPM (quando aplicável).",
  "Sempre indicar a quantidade de repetições ou o tempo de execução.",
  "Seguir a progressão pedagógica: Revisão → Aquecimento → Técnica → Conceito Musical → Aplicação → Desafio.",
  "Não gerar exercícios sem indicar critério mensurável de acerto.",
];

const COMMON_VALIDATION_RULES = [
  "Verificar se todos os termos técnicos pertencem ao instrumento do aluno.",
  "Verificar se o BPM é adequado ao nível do aluno.",
  "Verificar se a progressão pedagógica dos exercícios é lógica.",
];

// ─── Registry ───────────────────────────────────────────────────────────

export const INSTRUMENT_SPECIALISTS: Record<InstrumentCategory, InstrumentSpecialist> = {
  cordas_dedilhadas: {
    ...INSTRUMENT_CONTEXTS.cordas_dedilhadas,
    id: "cordas_dedilhadas",
    displayName: "Violão / Guitarra",
    systemPrompt: SYSTEM_CORDAS_DEDILHADAS,
    glossary: GLOSSARY_CORDAS_DEDILHADAS,
    fewShots: EMPTY_FEWSHOTS,
    retryInstruction: RETRY_CORDAS_DEDILHADAS,
    allowedTechniques: ["dedilhado p-i-m-a", "palhetada alternada", "palm mute", "bend", "vibrato", "hammer-on", "pull-off", "slide", "pestana", "arpejo", "capotraste"],
    forbiddenTechniques: ["rudimento", "ghost note de bateria", "pedal de bumbo", "slap de baixo", "vocalise", "embocadura", "arco de violino"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Sempre especificar qual corda e qual traste (ex: corda E, 5° traste).", "Indicar a mão de fretes (esquerda) e de ataque (direita) separadamente."],
    difficultyRules: {
      iniciante: "Máximo 3 acordes por exercício. Dedos numerados (1=indicador). BPM entre 50–80.",
      intermediario: "Pode incluir pestana, arpejo e palhetada alternada. BPM 70–110. Trocas de acorde cronometradas.",
      avancado: "Inclui improv, modos, técnicas expressivas (bend, vibrato). BPM livre. Musicalidade prioritária.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar se não há menção a rudimentos ou voicings de piano."],
    pedagogicalGuidelines: "Progressão: postura → formação de acorde → troca de acorde → ritmo → repertório → improvisação.",
  },
  teclado: {
    ...INSTRUMENT_CONTEXTS.teclado,
    id: "teclado",
    displayName: "Teclado Moderno",
    systemPrompt: SYSTEM_TECLADO,
    glossary: GLOSSARY_TECLADO,
    fewShots: FEWSHOTS_TECLADO,
    retryInstruction: RETRY_TECLADO,
    allowedTechniques: ["voicing", "close voicing", "open voicing", "rootless voicing", "drop 2", "drop 3", "upper structures", "quartal voicing", "shell voicing", "comping", "pads", "layer", "split", "voice leading", "condução de vozes", "arpejos", "broken chords"],
    forbiddenTechniques: ["slap", "thumb de baixo", "rudimento", "paradiddle", "pestana", "vocalise", "embocadura"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Sempre indicar qual mão toca qual parte (voicing na direita, baixo na esquerda).", "Para voicings, listar as notas exatas (ex: Dm7 = D-F-A-C)."],
    difficultyRules: {
      iniciante: "Shell voicings (raiz-3ª-7ª). Uma mão de cada vez. BPM 50–70.",
      intermediario: "Close/open voicings, comping básico, rootless voicings. BPM 60–90. Estilos: worship, pop.",
      avancado: "Upper structures, drop 2/3, quartal, voice leading elaborado, layers/splits, improv. Estilos: jazz, fusion.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que 'voz/voicing' é polifonia, não canto.", "Verificar que não há rudimentos de bateria."],
    pedagogicalGuidelines: "Progressão: shell voicing → close voicing → rootless → voice leading → comping → improv.",
  },
  percussao: {
    ...INSTRUMENT_CONTEXTS.percussao,
    id: "percussao",
    displayName: "Bateria / Percussão",
    systemPrompt: SYSTEM_PERCUSSAO,
    glossary: GLOSSARY_PERCUSSAO,
    fewShots: FEWSHOTS_PERCUSSAO,
    retryInstruction: RETRY_PERCUSSAO,
    allowedTechniques: ["single stroke roll", "double stroke roll", "paradiddle", "double paradiddle", "triple paradiddle", "flam", "flam accent", "flam tap", "drag", "ruff", "ratamacue", "moeller technique", "finger control", "ghost notes", "rimshot", "cross stick", "buzz roll", "coordenação linear", "ostinato", "polirritmia"],
    forbiddenTechniques: ["acorde", "escala de notas", "voicing", "slap de baixo", "pestana", "bend melódico", "vocalise", "embocadura"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Sempre indicar qual membro executa cada parte (mão direita/esquerda, pé direito/esquerdo).", "Nunca usar nomes de notas harmônicas (Dó, Ré, Mi) para bateria."],
    difficultyRules: {
      iniciante: "Mãos e pés separados. BPM 50–80. Grooves básicos (rock, pop). Rudimentos simples (single/double stroke).",
      intermediario: "Ghost notes, fills simples, grooves de estilos variados. BPM 70–100. Independência progressiva.",
      avancado: "Polirritmia, polimetria, Moeller avançado, deslocamento rítmico, fills complexos. Estilos: jazz, fusion, baião.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há notas harmônicas ou escalas melódicas.", "Verificar que todos os exercícios são rítmicos."],
    pedagogicalGuidelines: "Progressão: rudimento → groove básico → coordenação → ghost notes → fills → polirritmia.",
  },
  baixo: {
    ...INSTRUMENT_CONTEXTS.baixo,
    id: "baixo",
    displayName: "Contrabaixo Elétrico",
    systemPrompt: SYSTEM_BAIXO,
    glossary: { ...GLOSSARY_CORDAS_DEDILHADAS, slap: "Em BAIXO, 'slap' = técnica de polegar (T) batendo na corda. É exclusivo do contrabaixo elétrico. Não é palheta de guitarra.", ghost_note: "Em BAIXO, 'ghost note' = nota levemente tocada sem pressão total, criando textura rítmica no groove." },
    fewShots: FEWSHOTS_BAIXO,
    retryInstruction: RETRY_BAIXO,
    allowedTechniques: ["slap", "pop", "thumb", "double thumb", "fingerstyle", "palheta", "palm muting", "dead notes", "ghost notes", "tapping", "hammer-on", "pull-off", "slides", "vibrato", "harmônicos naturais", "harmônicos artificiais", "muting", "walking bass", "chord tones", "target notes", "cromatismo"],
    forbiddenTechniques: ["rudimento de bateria", "paradiddle", "flam", "bumbo/caixa coordination", "voicing de teclado como técnica do instrumento", "arco de violino", "vocalise", "embocadura"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Para slap, indicar claramente T (polegar) e P (pop).", "Para walking bass, indicar qual nota de cada chord tone usar em cada tempo.", "Quando o aluno tiver baixo de 5 ou 6 cordas, mencionar as cordas extras quando relevante."],
    difficultyRules: {
      iniciante: "Fingerstyle simples (alternância i-m). Palm muting básico. BPM 50–80. Groove limpo antes de slap.",
      intermediario: "Slap básico, ghost notes, walking bass simples, notas de aproximação. BPM 70–100. Grooves de funk e gospel.",
      avancado: "Double thumb, tapping, harmônicos, walking bass elaborado, improvisação, 5/6 cordas. BPM livre.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há rudimentos de bateria.", "Verificar que walking bass usa chord tones corretos.", "Verificar que slap é descrito com T e P corretamente."],
    pedagogicalGuidelines: "Progressão: postura → fingerstyle → muting → ghost notes → slap → walking bass → improv.",
  },
  piano: {
    ...INSTRUMENT_CONTEXTS.piano,
    id: "piano",
    displayName: "Piano Clássico",
    systemPrompt: SYSTEM_PIANO,
    glossary: { ...GLOSSARY_TECLADO, pedal: "Em PIANO, 'pedal' = pedal de sustain (damper), una corda ou sostenuto — pedais mecânicos do piano acústico. NÃO é pedal de bumbo de bateria.", hanon: "Em PIANO, 'Hanon' = livro de exercícios técnicos de dedos para piano (Hanon n.1–60). É uma referência pedagógica clássica." },
    fewShots: FEWSHOTS_PIANO,
    retryInstruction: RETRY_PIANO,
    allowedTechniques: ["postura", "curvatura dos dedos", "passagem do polegar", "cruzamento de polegar", "independência das mãos", "hanon", "czerny", "legato", "staccato", "pedal de sustain", "una corda", "sostenuto", "troca de pedal", "voicing", "close voicing", "drop 2", "drop 3", "rootless voicing", "voice leading", "stride piano", "comping", "walking bass no piano"],
    forbiddenTechniques: ["layer eletrônico", "split de teclado", "timbre de synth como técnica", "slap", "thumb de baixo", "rudimento de bateria", "vocalise", "pestana de violão"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Sempre indicar qual mão e quais dedos (1=polegar, 2=indicador, 3=médio, 4=anelar, 5=mínimo).", "Para pedal, indicar quando e como trocar (ex: 'troque a cada mudança de acorde').", "Para voicings, indicar se é técnica de piano acústico (não mencionar layer)."],
    difficultyRules: {
      iniciante: "Postura, escala simples mão por mão, Hanon n.1. Sem pedal até postura estabilizar. BPM 50–70.",
      intermediario: "Leitura em duas claves, pedal de sustain, coordenação entre mãos, Czerny. BPM 60–90.",
      avancado: "Voicings avançados (drop 2/3, rootless), pedal harmônico, ornamentos, expressividade. BPM livre.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há layer/split eletrônico.", "Verificar que voicings são descritos como técnica pianística acústica.", "Verificar que pedal é pedal mecânico do piano, não pedal de bateria."],
    pedagogicalGuidelines: "Progressão: postura → escala → arpejo (Hanon) → coordenação → repertório → voicings → pedal → expressividade.",
  },
  voz: {
    ...INSTRUMENT_CONTEXTS.voz,
    id: "voz",
    displayName: "Voz / Canto",
    systemPrompt: SYSTEM_VOZ,
    glossary: GLOSSARY_VOZ,
    fewShots: FEWSHOTS_VOZ,
    retryInstruction: RETRY_VOZ,
    allowedTechniques: ["respiração diafragmática", "apoio vocal", "vocalise", "humming", "passagem de registro", "vibrato vocal", "ressonância", "dicção", "articulação", "projeção vocal", "tessitura"],
    forbiddenTechniques: ["traste", "pestana", "palhetada", "baqueta", "pedal de bumbo", "slap", "embocadura de bocal"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Para vocalises, indicar a nota inicial e o âmbito (ex: Dó ao Sol).", "Nunca usar termos de instrumento físico como parte do exercício vocal."],
    difficultyRules: {
      iniciante: "Respiração e postura. Vocalises em âmbito curto (5ª). Evitar notas extremas da tessitura.",
      intermediario: "Passagem de registro, vibrato inicial, dicção, dinâmica vocal.",
      avancado: "Vibrato refinado, coloração vocal, expressividade, fraseado musical avançado.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há termos de instrumentos físicos.", "Verificar que o âmbito vocal é adequado ao nível."],
    pedagogicalGuidelines: "Progressão: postura → respiração → vocalise → dicção → passagem de registro → vibrato → repertório.",
  },
  sopro: {
    ...INSTRUMENT_CONTEXTS.sopro,
    id: "sopro",
    displayName: "Sopro",
    systemPrompt: SYSTEM_SOPRO,
    glossary: GLOSSARY_SOPRO,
    fewShots: EMPTY_FEWSHOTS,
    retryInstruction: RETRY_SOPRO,
    allowedTechniques: ["embocadura", "coluna de ar", "apoio de ar", "língua simples", "língua dupla", "digitação", "nota longa (long tone)", "vibrato", "ligado", "staccato", "respiração circular"],
    forbiddenTechniques: ["traste", "pestana", "palhetada de guitarra", "rudimento de bateria", "slap", "vocalise de cantor", "mão direita de piano"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Para notas longas, indicar duração em tempos e intensidade do ar.", "Para articulação, indicar a sílaba de língua (ex: 'tu', 'da', 'ta')."],
    difficultyRules: {
      iniciante: "Embocadura e som limpo. Poucas notas. Long tones. BPM 50–70.",
      intermediario: "Articulação variada, vibrato suave, dinâmica. Escalas maiores.",
      avancado: "Língua dupla, respiração circular, expressividade, velocidade.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há termos de cordas ou bateria."],
    pedagogicalGuidelines: "Progressão: embocadura → som → afinação → articulação → dinâmica → vibrato → repertório.",
  },
  cordas_arco: {
    ...INSTRUMENT_CONTEXTS.cordas_arco,
    id: "cordas_arco",
    displayName: "Cordas com Arco",
    systemPrompt: SYSTEM_CORDAS_ARCO,
    glossary: GLOSSARY_CORDAS_ARCO,
    fewShots: EMPTY_FEWSHOTS,
    retryInstruction: RETRY_CORDAS_ARCO,
    allowedTechniques: ["détaché", "legato com arco", "staccato com arco", "spiccato", "pizzicato", "vibrato de corda", "pressão do arco", "velocidade do arco", "ponto de contato", "mudança de posição", "cordas duplas", "harmônicos"],
    forbiddenTechniques: ["traste", "pestana", "palheta de guitarra", "rudimento de bateria", "slap", "vocalise", "tecla de piano"],
    exerciseRules: [...COMMON_EXERCISE_RULES, "Indicar qual golpe de arco (détaché, legato, spiccato).", "Indicar a posição (1ª, 2ª, 3ª) quando relevante."],
    difficultyRules: {
      iniciante: "Postura, cordas soltas, notas longas. Arco inteiro. BPM 40–60.",
      intermediario: "Golpes variados, mudança de posição, vibrato inicial. BPM 60–90.",
      avancado: "Spiccato, cordas duplas, harmônicos, vibrato refinado. BPM livre.",
    },
    validationRules: [...COMMON_VALIDATION_RULES, "Verificar que não há trastes ou pestana.", "Verificar que afinação é por ouvido/posição, não por traste."],
    pedagogicalGuidelines: "Progressão: postura do arco → som em cordas soltas → posição → golpes → afinação → vibrato → repertório.",
  },
  geral: {
    ...INSTRUMENT_CONTEXTS.geral,
    id: "geral",
    displayName: "Geral",
    systemPrompt: SYSTEM_GERAL,
    glossary: GLOSSARY_GERAL,
    fewShots: EMPTY_FEWSHOTS,
    retryInstruction: RETRY_GERAL,
    allowedTechniques: ["técnica básica", "postura", "ritmo", "metrônomo"],
    forbiddenTechniques: [],
    exerciseRules: COMMON_EXERCISE_RULES,
    difficultyRules: {
      iniciante: "Linguagem muito simples. Sem jargão técnico. BPM baixo.",
      intermediario: "Termos básicos do instrumento. Foco em qualidade e precisão.",
      avancado: "Terminologia técnica completa. Expressividade e musicalidade.",
    },
    validationRules: COMMON_VALIDATION_RULES,
    pedagogicalGuidelines: "⚠️ Instrumento não mapeado. Oriente o professor a cadastrar o instrumento do aluno para planos mais precisos.",
  },
};

// ─── Resolver ───────────────────────────────────────────────────────────

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
    ? `\n### TÉCNICAS ABSOLUTAMENTE PROIBIDAS (de outros instrumentos):\n${specialist.forbiddenTechniques.map(t => `- ❌ ${t}`).join("\n")}`
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
  // Para termos de uma palavra curta (ex: "arco", "voz"), usa word boundary
  // para evitar falso positivo em "arco-íris". Para frases com espaço, usa includes.
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

// ─── Helper: valida já com resolve ─────────────────────────────────────

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
// Motivação: plano de aluno INICIANTE veio com "shell voicing", "close voicing",
// "rootless voicing", "comping", "voice leading" — jargão de harmonia avançada
// que o validador de contaminação entre instrumentos não pega (são termos
// legítimos do teclado, mas ilegais para iniciante).

export const BEGINNER_JARGON_TERMS: string[] = [
  "shell voicing",
  "close voicing",
  "rootless voicing",
  "rootless",
  "voicing",
  "comping",
  "voice leading",
  "drop 2",
  "drop 3",
  "quartal",
  "upper structure",
  "reharmonização",
  "reharmonization",
  "substituição de acordes",
  "submediante",
  "superdominante",
  "poliritmia",
  "polirritmia",
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

