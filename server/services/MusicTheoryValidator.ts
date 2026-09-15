/**
 * MusicTheoryValidator — Camada Universal de Teoria Musical
 *
 * PRD: Secoes 7, 10, 14 — Validacao em Duas Camadas
 *
 * Responsavel por:
 * 1. Injetar orientacoes de teoria musical correta no prompt da IA (buildMusicTheoryPromptBlock)
 * 2. Validar pos-geracao se conceitos teoricos foram usados incorretamente (validateMusicTheoryConcepts)
 *
 * Esta camada e TRANSVERSAL — funciona para todos os instrumentos.
 * A IA especialista valida o instrumento; a teoria musical valida os conceitos universais.
 */

import type { InstrumentCategory } from "../utils/instrumentContexts";

// ─── Vocabulario de Teoria Musical Valida ───────────────────────────────────

export const MUSIC_THEORY_VOCABULARY: string[] = [
  // Escalas e modos
  "escala maior", "escala menor", "escala menor natural", "escala menor harmonica",
  "escala menor melodica", "pentatonica", "pentatonica maior", "pentatonica menor",
  "escala diminuta", "escala alterada", "escala de tons inteiros",
  "modo dorico", "modo frigio", "modo lidio", "modo mixolidio",
  "modo eolio", "modo locrio", "modos gregos",
  // Intervalos
  "intervalo", "segunda", "terca", "quarta", "quinta", "sexta", "setima", "oitava",
  "semitom", "tom inteiro",
  // Acordes
  "triade", "tetrade", "acorde maior", "acorde menor", "acorde dominante",
  "acorde diminuto", "acorde meio-diminuto", "acorde aumentado",
  "acorde suspenso", "sus2", "sus4", "acorde alterado",
  "inversao de acorde", "formacao de acorde", "campo harmonico",
  // Harmonia
  "funcao harmonica", "tonica", "subdominante", "dominante",
  "progressao harmonica", "cadencia", "cadencia autentica", "cadencia plagal",
  "II-V-I", "dominante secundario", "substituicao de tritono",
  "modulacao", "tonalidade", "centro tonal",
  // Ritmo e metrica
  "ritmo", "metrica", "compasso", "subdivisao", "sincope", "contratempo",
  "tercina", "quialtera", "semicolcheia", "colcheia", "seminima", "minima",
  // Leitura
  "partitura", "clave de sol", "clave de fa", "cifra", "tablatura",
];

// ─── Conceitos harmonicos proibidos em instrumentos ritmicos ─────────────────

const HARMONIC_FORBIDDEN_PERCUSSION: string[] = [
  "acorde de", "triade de", "tetrade", "campo harmonico",
  "escala de do", "escala de re", "escala de mi", "escala de fa",
  "escala de sol", "escala de la", "escala de si",
  "do maior", "re maior", "mi maior", "fa maior", "sol maior", "la maior", "si maior",
  "do menor", "re menor", "mi menor", "fa menor", "sol menor", "la menor", "si menor",
  "progressao de acordes", "ii-v-i", "dominante secundario",
  "tonalidade de", "centro tonal", "intervalo de terca", "intervalo de quinta", "voicing",
];

// ─── Restricoes de teoria por especialista ────────────────────────────────────

const INSTRUMENT_THEORY_RESTRICTIONS: Partial<Record<InstrumentCategory, string[]>> = {
  percussao: HARMONIC_FORBIDDEN_PERCUSSION,
};

// ─── Guidelines de teoria por especialista ────────────────────────────────────

const THEORY_GUIDELINES: Partial<Record<InstrumentCategory, string>> = {
  percussao: `## TEORIA MUSICAL APLICADA A BATERIA
A bateria e instrumento RITMICO. Conceitos de teoria validos:
- Metrica: compassos (4/4, 3/4, 6/8), subdivisoes (colcheias, semicolcheias, tercinas)
- Sincope e contratempo: posicionamento ritmico dos acentos
- Polirritmia: duas metricas simultaneas (ex: 3 contra 2)
- Dinamica: piano (suave), forte, crescendo, decrescendo — aplicados ao toque
PROIBIDO na bateria: acordes, escalas de notas, tonalidades, progressoes harmonicas.`,

  teclado: `## TEORIA MUSICAL APLICADA AO TECLADO
- Voicings: disposicao das notas do acorde (ex: Dm7 fechado = D-F-A-C)
- Voice leading: movimento minimo das vozes internas entre acordes
- Progressoes: II-V-I, progressoes de 4ths, cromaticas
- Campo harmonico: graus I II III IV V VI VII da tonalidade
- Tensoes: 9a, 11a, 13a nos acordes dominantes e nao-dominantes
REGRA CRITICA: 'voz/vozes' em teclado = polifonia/voicing, NUNCA canto.`,

  piano: `## TEORIA MUSICAL APLICADA AO PIANO
- Escalas e arpejos: sempre com tonalidade central identificada
- Inversoes de acorde: 1a, 2a e 3a inversao com baixo correto nomeado
- Voice leading: vozes da mao direita se movem por grau conjunto
- Cadencias: autentica (V-I), plagal (IV-I), meia-cadencia (I-V)
- Pedal de sustain: trocar a cada mudanca harmonica para evitar dissonancia`,

  baixo: `## TEORIA MUSICAL APLICADA AO CONTRABAIXO ELETRICO
- Chord tones: raiz (1), terca (3), quinta (5), setima (7) de cada acorde
- Target notes: nota de destino ao chegar em um novo acorde
- Cromatismo: aproximacao cromatica (meio tom acima ou abaixo) para a target note
- Walking bass: uma nota por tempo, priorizando chord tones nos tempos fortes
- Campo harmonico: graus da tonalidade para improvisar o groove
- Groove e pocket: nota certa + momento certo (feel, time)`,

  cordas_dedilhadas: `## TEORIA MUSICAL APLICADA AO VIOLAO/GUITARRA
- Campo harmonico: acordes nativos da tonalidade para composicao e improvisacao
- CAGED system: padroes de acorde em 5 posicoes no braco
- Pentatonica: escala de 5 notas mais usada na improvisacao
- Modos: dorico, mixolidio — os mais comuns no rock e no jazz/fusion`,

  voz: `## TEORIA MUSICAL APLICADA AO CANTO
- Tonalidade: o canto deve estar na tonalidade correta do arranjo
- Intervalos: saltos melodicos (3a, 5a, 8a) para treino de afinacao
- Escala base da musica: identificar e vocalizar a escala base
- Cadencias melodicas: frases com resolucao satisfatoria harmonica`,

  geral: `## TEORIA MUSICAL (GENERICA)
Use conceitos universais: escala, ritmo, compasso, afinacao, dinamica.
Adapte a teoria ao instrumento mencionado no contexto do aluno.`,
};

// ─── Funcoes Exportadas ───────────────────────────────────────────────────────

/**
 * Constroi o bloco de teoria musical para injetar no prompt da IA.
 * Retorna as diretrizes teoricas especificas do instrumento.
 */
export function buildMusicTheoryPromptBlock(specialistId: InstrumentCategory): string {
  const guideline = THEORY_GUIDELINES[specialistId] ?? THEORY_GUIDELINES.geral ?? "";
  return [
    "---",
    "## CAMADA DE TEORIA MUSICAL — VALIDACAO UNIVERSAL",
    guideline,
    "",
    "### REGRAS DE TEORIA MUSICAL GLOBAIS:",
    "1. Nunca mencione notas de forma harmonica para instrumentos ritmicos (bateria).",
    "2. Escalas/modos: nome correto (ex: escala de Do maior, nao escala maior de Do).",
    "3. Progressoes harmonicas: cifra correta (Am7, D7, Gmaj7) ou graus romanos (II-V-I).",
    "4. Subdivisoes: nomes corretos (colcheia, semicolcheia, tercina, quialtera).",
    "5. Dinamica: piano = suave, forte = intenso, mezzoforte, crescendo, decrescendo.",
    "6. Tonalidade: especifique maior ou menor (ex: Do maior, Re menor).",
    "---",
  ].join("\n");
}

/**
 * Valida se o plano usa conceitos de teoria musical de forma inadequada
 * para o instrumento especificado (segunda camada de validacao, pos-geracao).
 */
export function validateMusicTheoryConcepts(
  planText: string,
  specialistId: InstrumentCategory
): { passed: boolean; warnings: string[] } {
  const restrictions = INSTRUMENT_THEORY_RESTRICTIONS[specialistId];
  if (!restrictions || restrictions.length === 0) {
    return { passed: true, warnings: [] };
  }
  const norm = planText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const warnings: string[] = [];
  for (const term of restrictions) {
    const termNorm = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (norm.includes(termNorm)) {
      warnings.push(term);
    }
  }
  return { passed: warnings.length === 0, warnings };
}

/**
 * Extrai e lista os conceitos de teoria musical presentes no plano.
 * Util para debugging e logs pedagogicos.
 */
export function extractTheoryConcepts(planText: string): string[] {
  const norm = planText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const found: string[] = [];
  for (const concept of MUSIC_THEORY_VOCABULARY) {
    const conceptNorm = concept.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (norm.includes(conceptNorm)) {
      found.push(concept);
    }
  }
  return found;
}
