/**
 * INSTRUMENT_CONTEXTS
 *
 * Mapa estático de contextos pedagógicos por categoria de instrumento.
 * Usado pelo gerador de Plano Diário de Estudos para garantir que
 * o prompt da IA use terminologia correta para cada instrumento.
 *
 * Categorias suportadas:
 *   cordas_dedilhadas | teclado | percussao | voz | sopro | cordas_arco | geral
 */

export interface InstrumentContext {
  /** Termos técnicos corretos e esperados para este instrumento */
  terminology: string[];
  /** Termos de outros instrumentos que NÃO devem aparecer neste plano */
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
  /** Instrução extra para a IA sobre este instrumento */
  extraInstruction: string;
}

export type InstrumentCategory =
  | "cordas_dedilhadas"
  | "teclado"
  | "percussao"
  | "baixo"
  | "piano"
  | "voz"
  | "sopro"
  | "cordas_arco"
  | "geral";

export const INSTRUMENT_CONTEXTS: Record<InstrumentCategory, InstrumentContext> = {
  // ─── CORDAS DEDILHADAS: Violão, Guitarra, Baixo, Ukulele, Cavaquinho ─────
  cordas_dedilhadas: {
    terminology: [
      "cordas",
      "trastes",
      "pestana",
      "dedilhado",
      "palhetada",
      "acorde",
      "escala",
      "arpejo",
      "afinação",
      "braço do instrumento",
      "captador",
      "corpo do instrumento",
      "ponte",
      "capotraste",
      "slides",
      "bend",
      "vibrato",
      "ligado ascendente (hammer-on)",
      "ligado descendente (pull-off)",
    ],
    forbiddenTerms: [
      "bumbum", "caixa", "chimbal", "bumbo", "prato", "rudimento",
      "pedal de bumbo", "hi-hat",
      "mão esquerda e mão direita separadas para cada pauta",
      "nota grave na clave de fá",
      "vocalise", "projeção vocal", "dicção", "respiração diafragmática",
      "embocadura", "língua dupla",
      "arco", "golpe de arco", "pizzicato",
    ],
    warmupDescription: "Exercícios de aquecimento dos dedos no braço do instrumento, sem pressionar as cordas com força excessiva",
    warmupExamples: [
      "Exercício cromático (1-2-3-4) no braço, subindo e descendo os trastes devagar",
      "Abrir e fechar os dedos da mão de fretes lentamente sobre uma superfície plana",
      "Tocar as cordas soltas alternando dedos indicador e médio (ou palheta) em ritmo lento e constante",
    ],
    technicalFocusExamples: [
      "Formação e troca limpa de acordes",
      "Desenvolvimento da pestana (dedo índice cobrindo todas as cordas em um traste)",
      "Palhetada alternada em velocidade controlada",
      "Dedilhado padrão (p-i-m-a) nas cordas",
      "Leitura de tablatura",
      "Técnica de palm mute (abafamento com a palma)",
    ],
    challengeExamples: [
      "Trocar entre dois acordes sem parar o ritmo em X segundos",
      "Tocar um riff ou trecho de música do início ao fim sem errar",
      "Gravar 30 segundos tocando e ouvir para identificar erros",
    ],
    levelHints: {
      iniciante:
        "Use linguagem muito simples. Diga exatamente quais dedos usar (indicador, médio, anelar, mínimo). Evite termos técnicos em inglês. Descreva a postura da mão. Limite a 2-3 acordes por exercício.",
      intermediario:
        "Pode usar termos como 'palhetada alternada', 'pestana', 'arpejo'. Foque na limpeza do som e troca fluida entre acordes. Introduza posições além da primeira posição.",
      avancado:
        "Use terminologia técnica completa. Foque em velocidade, expressividade, dinâmica e musicalidade. Pode incluir improvisação sobre escalas e progressões.",
    },
    extraInstruction:
      "NUNCA mencione termos de bateria, piano ou instrumentos de sopro. Todos os exercícios devem ser realizados com o instrumento de cordas.",
  },

  // ─── TECLADO / TECLADO MODERNO ────────────────────────────────────────────
  teclado: {
    terminology: [
      // Técnica de mão
      "mão direita", "mão esquerda", "posição dos dedos", "dedilhado",
      "legato", "staccato", "acentuação", "articulação",
      "dinâmica (piano, forte, mezzoforte)", "controle de expressão",
      // Harmonia aplicada
      "voicing", "close voicing", "open voicing", "spread voicing", "rootless voicing",
      "quartal voicing", "upper structures", "shell voicings", "cluster",
      "drop 2", "drop 3", "condução de vozes", "voice leading",
      "voz / vozes (camada polifônica)", "4 vozes (soprano, contralto, tenor, baixo)",
      // Técnicas de acompanhamento
      "pads", "comping", "acompanhamento rítmico", "arpejos", "broken chords",
      "baixo na mão esquerda", "acordes na mão direita",
      // Timbres e configuração eletrônica
      "timbre", "layer", "split", "piano", "órgão", "lead", "synth", "strings",
      "pedal de sustain", "velocity", "sustain",
      // Música e contexto
      "escala", "arpejo", "oitava", "tecla", "nota", "compasso",
      // Estilos
      "worship", "gospel", "pop", "rock", "mpb", "jazz", "música congregacional",
    ],
    forbiddenTerms: [
      "acorde com pestana", "traste", "corda solta", "palheta", "palm mute",
      "bumbo", "caixa", "chimbal", "rudimento", "pedal de bumbo",
      "vocalise de cantor", "projeção vocal", "dicção", "respiração diafragmática",
      "embocadura", "arco de violino", "pizzicato",
      "slap", "thumb", "fingerstyle de baixo", "ghost note de baixo",
    ],
    warmupDescription: "Escala na posição de cinco dedos com cada mão separadamente + voicing fechado devagar",
    warmupExamples: [
      "Escala de Dó maior (ou tonalidade da meta) — mão direita devagar, nota por nota",
      "Mesma escala — mão esquerda devagar",
      "Shell voicing (1ª-3ª-7ª) do acorde da meta — monte lentamente, tecla por tecla",
      "Broken chords em arpejo ascendente/descendente da tonalidade — ambas as mãos",
    ],
    technicalFocusExamples: [
      "Voicing fechado (close voicing) na mão direita: ex. Dm7 = D-F-A-C com dedos 1-2-3-5",
      "Rootless voicing: acorde sem fundamental, mão esq. no baixo, mão dir. nas tensões",
      "Upper structures: tríade no topo sobre acorde dominante na esquerda",
      "Condução de vozes (voice leading): movimento suave entre acordes, vozes internas mínimas",
      "Comping: mão direita marca acordes em síncope enquanto esquerda sustenta baixo",
      "Layer / Split: configurar dois timbres separados (ex: piano grave + pad agudo)",
    ],
    challengeExamples: [
      "Tocar progressão II-V-I com rootless voicings em 3 tonalidades sem parar",
      "Improvisar pads de worship em 4 vozes por 2 minutos mantendo voice leading",
      "Executar comping de jazz (mão dir. síncope) com walking bass simplificado na esq.",
    ],
    levelHints: {
      iniciante:
        "Use linguagem simples. Explique mão direita e esquerda separadamente. Comece com shell voicings (raiz-3ª-7ª). Evite termos eletrônicos complexos. Dedos: 1=polegar, 2=indicador, 3=médio, 4=anelar, 5=mínimo.",
      intermediario:
        "Introduza close e open voicing, rootless voicings básicos, condução de vozes. Trabalhe dinâmica, articulação e coordenação entre as mãos. Contextos: worship, pop, gospel.",
      avancado:
        "Explore upper structures, quartal voicing, drop 2/3, spread voicings, comping sofisticado, layers/splits avançados. Foque em voice leading musical e performance ao vivo.",
    },
    extraInstruction:
      "Em TECLADO: 'voz/vozes/voicing' = camada polifônica / disposição do acorde (ex: 4 vozes = SATB; voicing = Dm7 fechado D-F-A-C na mão direita). NUNCA confundir com canto/vocalise. NUNCA usar termos de bateria (bumbo, caixa, chimbal) ou de baixo (slap, thumb). Descreva qual mão usa qual timbre quando for relevante.",
  },

  // ─── PERCUSSÃO / BATERIA ──────────────────────────────────────────────────
  percussao: {
    terminology: [
      // Peças da bateria
      "bumbo", "caixa", "chimbal (hi-hat)", "prato de condução", "prato de ataque (crash)",
      "prato de ride", "tons (tom-tom)", "surdo",
      // Técnicas de mão
      "baqueta", "moeller technique", "finger control", "wrist technique", "rebound",
      "ghost notes", "rimshot", "cross stick", "buzz roll", "open roll", "closed roll",
      // Pés
      "pedal de bumbo", "pedal do chimbal", "pé direito", "pé esquerdo",
      // Rudimentos
      "rudimento", "single stroke roll", "double stroke roll", "paradiddle", "double paradiddle",
      "triple paradiddle", "flam", "flam accent", "flam tap", "drag", "ruff", "ratamacue",
      // Rítmica
      "groove", "fill (virada)", "ostinato", "compasso", "subdivisão", "semicolcheia",
      "tercina", "quiáltera", "síncope", "deslocamento rítmico", "polirritmia", "polimetria",
      "independência de membros", "coordenação linear",
      // Estilos
      "rock", "pop", "gospel", "funk", "blues", "jazz", "samba", "bossa nova",
      "baião", "forró", "shuffle", "reggae", "worship", "fusion",
      // Controle
      "BPM", "metrônomo", "dinâmica", "resistência", "velocidade",
    ],
    forbiddenTerms: [
      "acorde", "nota harmônica", "Dó", "Ré", "Mi", "Fá", "Sol", "Lá", "Si",
      "pestana", "traste", "corda solta", "palheta", "dedilhado",
      "bend", "vibrato melódico", "hammer-on", "pull-off", "slap de baixo",
      "vocalise", "projeção vocal", "respiração diafragmática",
      "embocadura", "arco de violino", "pizzicato",
      "voicing", "voice leading", "inversão de acorde",
    ],
    warmupDescription: "Rudimentos básicos com mãos e pés separados, usando Moeller Technique para relaxamento, em BPM lento",
    warmupExamples: [
      "Single Stroke Roll (RLRL) nas coxas — 2 min devagar, foco em rebound natural",
      "Double Stroke Roll (RRLL) — pulso relaxado, deixar a baqueta ricocheteando (rebound)",
      "Bumbo em semínimas + chimbal em colcheias (pé esquerdo) — 60 BPM por 1 min",
      "Paradiddle (RLRR LRLL) nas coxas — devagar, contando em voz alta",
    ],
    technicalFocusExamples: [
      "Groove de rock com bumbo nos tempos 1 e 3, caixa nos tempos 2 e 4, chimbal em colcheias",
      "Ghost notes na caixa: toques suaves intermediários entre os acentos principais",
      "Independência: chimbal em semínimas (pé esq.), bumbo em padrão sincopado",
      "Moeller Technique: movimento de chicote do pulso para economia de energia",
      "Polirritmia 3 contra 2: mão direita em tercinas, mão esquerda em colcheias",
      "Fill de 4 compassos pelos tons + reentrada precisa no groove",
    ],
    challengeExamples: [
      "Tocar groove de funk com ghost notes por 3 min a 80 BPM sem perder o bolso",
      "Executar paradiddle com accents deslocados (acento no segundo golpe) a 100 BPM",
      "Gravar groove + fill e ouvir para verificar precisão rítmica e dinâmica",
    ],
    levelHints: {
      iniciante:
        "Comece com mãos e pés separados. Explique cada peça da bateria por nome (bumbo, caixa, chimbal). Use metrônomo a 60–80 BPM. Foque em regularidade antes da velocidade. Evite fills nos primeiros exercícios.",
      intermediario:
        "Introduza ghost notes, fills simples e grooves de estilos variados (rock, samba, funk). Trabalhe independência de membros. Aumente BPM em blocos de 5. Instrua subdivisões e controle de dinâmica.",
      avancado:
        "Explore polirritmia, polimetria, deslocamento rítmico, Moeller Technique avançado e leitura de partitura de bateria. Estilos: jazz, fusion, baião. Foque em dinâmica expressiva e fills complexos.",
    },
    extraInstruction:
      "NUNCA mencione notas musicais (Dó, Ré, Mi...), acordes, escalas ou qualquer conteúdo harmônico/melódico. A bateria é instrumento RÍTMICO. Todos os exercícios envolvem ritmo, tempo, coordenação, dinâmica e técnica de mão/pé. NUNCA use termos como 'bend', 'slap de baixo', 'voicing' ou 'pestana'.",
  },

  // ─── VOZ / CANTO ─────────────────────────────────────────────────────────
  voz: {
    terminology: [
      "respiração diafragmática",
      "apoio vocal",
      "projeção vocal",
      "vocalise",
      "dicção",
      "articulação",
      "afinação",
      "tessitura",
      "passagem de registro",
      "voz de peito",
      "voz de cabeça",
      "falsete",
      "vibrato vocal",
      "ressonância",
      "aquecimento vocal",
      "resfriamento vocal",
      "frase musical",
      "dinâmica vocal (piano, forte)",
      "postura corporal para o canto",
    ],
    forbiddenTerms: [
      "traste", "corda solta", "acorde com pestana", "palheta", "palm mute",
      "bumbum", "caixa", "chimbal", "rudimento", "pedal de bumbo",
      "arco", "golpe de arco", "pizzicato",
      "embocadura de bocal", "língua dupla",
    ],
    warmupDescription: "Aquecimento vocal com exercícios de respiração e vocalises curtos em tons confortáveis",
    warmupExamples: [
      "Respiração diafragmática: inspirar em 4 tempos, segurar 2, soltar em 8",
      "Humming (cantarolar com boca fechada) em escala ascendente e descendente",
      "Vocalise com vogal 'mah' do Dó até o Sol e voltando",
    ],
    technicalFocusExamples: [
      "Afinação em escala maior",
      "Dicção e articulação de consoantes na letra",
      "Passagem de registro (voz de peito para voz de cabeça)",
      "Vibrato natural e controlado",
      "Dinâmica: cantar piano (suave) e forte com controle",
      "Projeção vocal sem forçar a garganta",
    ],
    challengeExamples: [
      "Cantar uma frase da música com olhos fechados, focando só na afinação",
      "Gravar um trecho do repertório e ouvir para identificar pontos de melhoria",
      "Cantar a mesma frase 3 vezes mais forte e 3 vezes mais suave mantendo afinação",
    ],
    levelHints: {
      iniciante:
        "Foque em respiração correta e postura corporal. Vocalises simples em âmbito curto. Evite notas extremas da tessitura. Linguagem simples, sem termos técnicos excessivos.",
      intermediario:
        "Introduza passagem de registro, vibrato inicial e trabalho de dicção. Repertório mais desafiador. Foque na afinação em intervalos maiores.",
      avancado:
        "Trabalhe expressividade, fraseado, vibrato refinado, coloração vocal e domínio da dinâmica completa. Inclua técnicas avançadas de acordo com o estilo.",
    },
    extraInstruction:
      "A voz é o instrumento. NUNCA mencione instrumento físico nas mãos (violão, teclas, baqueta). Todos os exercícios são para a voz, corpo e respiração. Se houver acompanhamento de instrumento, mencione apenas como referência de afinação.",
  },

  // ─── SOPROS: Flauta, Saxofone, Clarinete, Trompete, Trombone, etc. ───────
  sopro: {
    terminology: [
      "embocadura",
      "coluna de ar",
      "apoio de ar",
      "língua simples",
      "língua dupla",
      "articulação",
      "digitação",
      "chaves",
      "nota longa (long tone)",
      "afinação",
      "vibrato",
      "dinâmica (piano, forte)",
      "ligado",
      "staccato",
      "respiração circular (avançado)",
      "bocal",
      "palheta (sopros de palheta: sax, clarinete)",
      "registo (grave, médio, agudo)",
    ],
    forbiddenTerms: [
      "traste", "corda solta", "acorde com pestana", "palheta da guitarra",
      "bumbum", "caixa", "chimbal", "rudimento",
      "vocalise (termo de canto)", "projeção vocal do cantor",
      "mão direita e esquerda no teclado", "tecla",
      "arco", "pizzicato",
    ],
    warmupDescription: "Exercícios de embocadura e notas longas para aquecer o instrumento e a musculatura facial",
    warmupExamples: [
      "Notas longas (long tones): sustentar cada nota por 8 tempos com ar constante e controlado",
      "Escala de Dó maior (ou escala da meta) em semínimas no metrônomo em BPM lento",
      "Exercício de articulação: tocar a mesma nota repetindo a sílaba 'tu-tu-tu' com língua",
    ],
    technicalFocusExamples: [
      "Embocadura firme e estável nas notas agudas",
      "Suavidade nas ligações entre notas (legato)",
      "Articulação staccato clara e limpa",
      "Digitação rápida e precisa nas chaves",
      "Controle de dinâmica (crescendo e decrescendo numa mesma nota)",
      "Afinação comparada ao afinador eletrônico",
    ],
    challengeExamples: [
      "Tocar um trecho de música do início ao fim sem parar, focando na afinação",
      "Aumentar BPM em 5 a cada repetição sem perder a limpeza das notas",
      "Gravar um exercício e comparar afinação com o afinador",
    ],
    levelHints: {
      iniciante:
        "Foque na formação correta da embocadura e na produção de som limpo. Explique a respiração diafragmática adaptada ao sopro. Comece com poucas notas e escala simples.",
      intermediario:
        "Introduza articulação variada (legato e staccato), vibrato suave e controle de dinâmica. Trabalhe escalas maiores e repertório intermediário.",
      avancado:
        "Foque em expressividade, vibrato refinado, velocidade e técnicas avançadas como língua dupla e respiração circular.",
    },
    extraInstruction:
      "NUNCA mencione cordas, trastes, teclas de piano ou peças de bateria. Todos os exercícios devem envolver ar, embocadura, digitação e articulação específicas do instrumento de sopro.",
  },

  // ─── CORDAS COM ARCO: Violino, Viola, Violoncelo, Contrabaixo ────────────
  cordas_arco: {
    terminology: [
      "arco",
      "golpe de arco",
      "détaché",
      "legato com arco",
      "staccato com arco",
      "spiccato",
      "pressão do arco",
      "velocidade do arco",
      "crina do arco",
      "ponto de contato (corda vs. arco)",
      "mão esquerda (posição)",
      "mão direita (arco)",
      "corda",
      "posições (1ª, 2ª, 3ª posição...)",
      "vibrato de corda",
      "pizzicato",
      "escala",
      "afinação por ouvido",
      "bequadro, sustenido, bemol",
    ],
    forbiddenTerms: [
      "traste", "palheta da guitarra", "acorde com pestana",
      "bumbum", "caixa", "chimbal", "rudimento",
      "vocalise de cantor", "embocadura de sopro",
      "tecla", "pedal de piano",
    ],
    warmupDescription: "Exercícios de arco em cordas soltas e notas longas para aquecimento de mão direita e escala de posição para mão esquerda",
    warmupExamples: [
      "Notas longas nas cordas soltas: arco inteiro de ponta a talão, ouvindo a qualidade do som",
      "Escala de Ré maior (ou escala da meta) em 1ª posição, uma nota por arco, devagar",
      "Exercício de détaché suave: colcheia por colcheia na corda mais grave",
    ],
    technicalFocusExamples: [
      "Distribuição de arco (talão, meio, ponta) em diferentes golpes",
      "Afinação por ouvido na posição",
      "Vibrato suave e controlado",
      "Cruzamento de cordas sem ruído",
      "Golpes de arco: détaché, legato, staccato, spiccato",
      "Mudança de posição fluida",
    ],
    challengeExamples: [
      "Tocar um trecho de música do início ao fim com arco constante e afinação correta",
      "Gravar e comparar com referência gravada para identificar afinação e timbre",
      "Tocar pizzicato um trecho que normalmente é tocado com arco, focando na afinação",
    ],
    levelHints: {
      iniciante:
        "Foque na postura do arco e na produção de som limpo nas cordas soltas. Explique a diferença entre mão do arco e mão das posições. Use linguagem simples e muitos detalhes de postura.",
      intermediario:
        "Introduza golpes de arco variados, mudanças de posição e vibrato inicial. Trabalhe afinação em escalas e peças de repertório.",
      avancado:
        "Foque em expressividade, vibrato refinado, golpes de arco avançados, dinâmica e musicalidade. Pode incluir cordas duplas e harmônicos.",
    },
    extraInstruction:
      "NUNCA mencione trastes, teclas, palheta de guitarra ou peças de bateria. O instrumento tem arco e cordas sem trastes. A afinação é feita pelo ouvido e por posição dos dedos na corda, não por trastes.",
  },

  // ─── GENÉRICO (Fallback para instrumento não mapeado) ────────────────────
  geral: {
    terminology: [
      "instrumento",
      "nota",
      "ritmo",
      "melodia",
      "técnica",
      "postura",
      "dedos",
      "prática",
      "repetição",
      "metrônomo",
    ],
    forbiddenTerms: [],
    warmupDescription: "Exercício de aquecimento adequado ao instrumento do aluno",
    warmupExamples: [
      "Exercício de aquecimento muscular dos membros usados no instrumento",
      "Tocar notas ou sons simples em ritmo lento para aquecer",
    ],
    technicalFocusExamples: [
      "Técnica básica do instrumento",
      "Exercício de ritmo e tempo",
      "Repertório inicial do nível do aluno",
    ],
    challengeExamples: [
      "Tocar um trecho de música do início ao fim",
      "Repetir o exercício aumentando a velocidade gradualmente",
    ],
    levelHints: {
      iniciante:
        "Use linguagem muito simples, passo a passo, voltada para quem está começando. Evite jargão técnico excessivo.",
      intermediario:
        "Use linguagem natural com termos básicos do instrumento. Foque na qualidade do som e precisão técnica.",
      avancado:
        "Use terminologia técnica completa. Foque em refinamento, expressividade e musicalidade.",
    },
    extraInstruction:
      "⚠️ O instrumento deste aluno não está mapeado no sistema. Crie exercícios adequados ao instrumento mencionado no contexto, adaptando a linguagem ao nível do aluno.",
  },

  // ─── CONTRABAIXO ELÉTRICO ─────────────────────────────────────────────────
  baixo: {
    terminology: [
      // Técnicas de mão direita
      "slap", "pop", "thumb", "double thumb", "fingerstyle", "palheta", "palm muting",
      "dead notes", "ghost notes", "tapping",
      // Técnicas de mão esquerda
      "hammer-on", "pull-off", "slides", "vibrato", "harmônicos naturais",
      "harmônicos artificiais", "muting",
      // Conceitos musicais de baixo
      "walking bass", "groove", "pocket", "time", "feel", "condução de baixo",
      "notas de aproximação", "cromatismo", "arpejos", "escalas",
      "chord tones", "target notes", "pedal point",
      // Técnica de instrumento
      "alternância de dedos", "sincronização entre as mãos", "precisão rítmica",
      "resistência", "velocidade", "mudança de posição", "saltos de corda",
      "string crossing",
      // Configuração
      "4 cordas", "5 cordas", "6 cordas", "captador", "braço", "trastes", "escala do instrumento",
      "afinação", "BPM", "metrônomo",
    ],
    forbiddenTerms: [
      // Bateria
      "rudimento", "paradiddle", "flam", "bumbo", "caixa", "chimbal",
      "pedal de bumbo", "pedal do chimbal", "baqueta", "ghost note de bateria",
      "groove de bateria (bumbo-caixa)", "fill de bateria",
      // Teclado
      "voicing de teclado", "layer", "split de teclado", "synth pad",
      "mão direita de piano", "mão esquerda de piano",
      // Outros
      "vocalise", "embocadura", "arco de violino", "pizzicato de corda arco",
    ],
    warmupDescription: "Alternância de dedos indicador e médio em exercícios cromáticos no braço, slap básico devagar",
    warmupExamples: [
      "Cromático 1-2-3-4 no braço (indicador-médio-anelar-mínimo) — subindo e descendo, devagar",
      "Alternância i-m nas cordas soltas (E A D G) — 60 BPM, foco em igualdade de toque",
      "Slap básico: polegar (T) no Mi grave, bounce natural, sem força — 10 repetições",
      "Muting prático: tocar nota e abafar imediatamente com a palma ou os dedos",
    ],
    technicalFocusExamples: [
      "Slap + Pop: T no Mi, P no Sol — alternando, construindo groove sincopado",
      "Walking bass em II-V-I: notas de aproximação cromática, chord tones nos tempos fortes",
      "Ghost notes: toque leve entre notas principais, sem pressão total, criando textura rítmica",
      "Fingerstyle groove de funk: alternância i-m rápida com palm muting parcial",
      "Exercício de target notes: identifique a nota alvo de cada acorde e resolva por cromatismo",
      "Double thumb: thumb down + thumb up + pop — sequência rítmica progressiva",
    ],
    challengeExamples: [
      "Tocar groove de funk com slap por 3 minutos a 80 BPM sem perder o pocket",
      "Improvisar walking bass sobre progressão II-V-I por 2 minutos usando chord tones",
      "Gravar groove e avaliar: ghost notes audíveis? Pocket junto ao metrônomo?",
    ],
    levelHints: {
      iniciante:
        "Comece com fingerstyle simples (alternância i-m) e palm muting básico. Explique posição do polegar na traseira, curvatura dos dedos. BPM lento (60–80). Foque em groove limpo antes de slap.",
      intermediario:
        "Introduza slap básico, ghost notes, walking bass simples e exercícios de notas de aproximação. Trabalhe pocket e time com metrônomo. Expanda para grooves de funk e gospel.",
      avancado:
        "Explore double thumb, tapping, harmônicos, walking bass elaborado, polirritmia aplicada ao baixo, improvisação sobre standards. Adapte ao número de cordas do instrumento (5 ou 6 cordas quando aplicável).",
    },
    extraInstruction:
      "NUNCA use rudimentos de bateria (paradiddle, flam) nem voicings de teclado. Baixo é instrumento de cordas com trastes — exercícios envolvem técnica de mão direita (slap/fingerstyle), mão esquerda (hammer-on/pull-off) e conceitos musicais de baixo (walking bass, groove, pocket). Se o aluno tiver baixo de 5 ou 6 cordas, adapte os exercícios para incluir as cordas extras.",
  },

  // ─── PIANO CLÁSSICO / ACÚSTICO ────────────────────────────────────────────
  piano: {
    terminology: [
      // Técnica pianística
      "postura", "curvatura dos dedos", "independência das mãos", "coordenação",
      "técnica de dedos", "passagem do polegar", "cruzamento de polegar",
      "legato", "staccato", "acentuação", "articulação", "dinâmica",
      "controle de toque", "toque suave / toque firme",
      // Exercícios clássicos
      "hanon", "czerny", "escala", "arpejo",
      // Pedais
      "pedal de sustain (damper pedal)", "una corda", "sostenuto",
      "pedalização harmônica", "troca de pedal",
      // Harmonia aplicada ao piano
      "voicing", "close voicing", "open voicing", "drop 2", "drop 3",
      "shell voicings", "rootless voicings", "quartal harmony", "spread voicings",
      "upper structures", "inversão de acorde", "condução de vozes", "voice leading",
      // Técnicas de acompanhamento
      "acordes na mão direita", "baixo na mão esquerda", "arpejos", "broken chords",
      "acompanhamento rítmico", "walking bass no piano", "stride piano", "comping",
      // Leitura
      "pauta (clave de sol)", "pauta (clave de fá)", "leitura em duas claves",
      "nota", "tecla", "oitava", "compasso",
    ],
    forbiddenTerms: [
      // Teclado eletrônico
      "layer", "split de teclado", "synth", "pad eletrônico", "timbre de teclado",
      // Bateria
      "rudimento", "bumbo", "caixa", "chimbal", "baqueta",
      // Baixo
      "slap", "thumb", "fingerstyle de baixo", "ghost note de baixo",
      // Sopro/Voz
      "vocalise", "embocadura", "coluna de ar",
      // Cordas
      "pestana", "palhetada", "traste de violão", "palheta de guitarra",
    ],
    warmupDescription: "Exercícios de Hanon ou escala com cada mão separadamente + arpejo com passagem de polegar",
    warmupExamples: [
      "Hanon n.1: cada dedo independente em sequência ascendente e descendente — mão direita 60 BPM",
      "Mesma sequência com mão esquerda — atenção à curvatura dos dedos",
      "Arpejo de Dó maior em posição fechada — cruzamento de polegar suave e sem pular",
      "Escala da tonalidade da meta: ambas as mãos separadas, depois juntas",
    ],
    technicalFocusExamples: [
      "Passagem do polegar: mão direita na escala ascendente sem levantar os demais dedos",
      "Legato em 2 oitavas: notas conectadas sem buracos, pedal de sustain com troca harmônica",
      "Voicing fechado (close voicing) na mão direita: dedos 1-3-5 no acorde da meta",
      "Drop 2 na mão direita: nota do tenor para baixo uma oitava — textura aberta",
      "Stride piano simples: mão esq. alterna baixo (tempo forte) e acorde (contratempo)",
      "Troca de pedal harmônica: trocar o pedal de sustain a cada mudança de acorde",
    ],
    challengeExamples: [
      "Tocar escala em terças na mão direita — 2 oitavas em legato a 70 BPM",
      "Executar II-V-I com close voicing (mão dir.) + baixo (mão esq.) em 3 tonalidades",
      "Tocar trecho de repertório com pedal de sustain correto — gravar e avaliar pedalização",
    ],
    levelHints: {
      iniciante:
        "Foque em postura correta (curvatura dos dedos, pulsos relaxados), escala simples mão por mão, Hanon n.1. Explique clave de sol (mão direita) e clave de fá (mão esquerda). Sem pedal até postura estabilizar.",
      intermediario:
        "Introduza leitura em duas claves, uso do pedal de sustain, coordenação entre mãos, dinâmica (piano/forte). Trabalhe Czerny para velocidade de dedos e peças de repertório simples.",
      avancado:
        "Explore voicings (close, drop 2/3, rootless), técnica de pedal harmônico, velocity e controle expressivo. Foque em estilo e musicalidade além da técnica pura. Introduza ornamentos.",
    },
    extraInstruction:
      "Piano é instrumento acústico — NUNCA use 'layer', 'split eletrônico' ou 'timbre de teclado'. Trabalhe postura, dedos e pedais. Diferencie do teclado moderno: no piano, o foco é na técnica pianística clássica (Hanon, Czerny, postura, pedal harmônico) e harmonia aplicada ao instrumento acústico.",
  },
};

/**
 * Retorna o contexto pedagógico para um dado nome/categoria de instrumento.
 * Faz correspondência por categoria (campo do banco) ou por nome do instrumento.
 */
export function getInstrumentContext(
  instrumentName: string,
  instrumentCategory: string
): { context: InstrumentContext; resolvedCategory: InstrumentCategory } {
  const cat = instrumentCategory.toLowerCase().trim();
  const name = instrumentName.toLowerCase().trim();

  // Mapeamento por categoria (campo direto do banco)
  const categoryMap: Record<string, InstrumentCategory> = {
    // Contrabaixo / Baixo Elétrico — ESPECIALISTA DEDICADO
    baixo: "baixo",
    "baixo elétrico": "baixo",
    "contrabaixo elétrico": "baixo",
    "bass guitar": "baixo",
    "electric bass": "baixo",
    // Piano — ESPECIALISTA DEDICADO
    piano: "piano",
    "piano acústico": "piano",
    "piano clássico": "piano",
    // Cordas dedilhadas (violão, guitarra — sem baixo)
    cordas: "cordas_dedilhadas",
    "cordas dedilhadas": "cordas_dedilhadas",
    cordas_dedilhadas: "cordas_dedilhadas",
    violao: "cordas_dedilhadas",
    "violão": "cordas_dedilhadas",
    guitarra: "cordas_dedilhadas",
    ukulele: "cordas_dedilhadas",
    cavaquinho: "cordas_dedilhadas",
    bandolim: "cordas_dedilhadas",
    // Teclado / Teclado moderno
    teclado: "teclado",
    orgao: "teclado",
    "órgão": "teclado",
    "teclado/piano": "teclado",
    "keyboard": "teclado",
    // Percussão / Bateria
    percussao: "percussao",
    "percussão": "percussao",
    bateria: "percussao",
    // Voz / Canto
    voz: "voz",
    canto: "voz",
    vocal: "voz",
    "tecnica vocal": "voz",
    "técnica vocal": "voz",
    // Sopros
    sopros: "sopro",
    sopro: "sopro",
    flauta: "sopro",
    saxofone: "sopro",
    clarinete: "sopro",
    trompete: "sopro",
    trombone: "sopro",
    tuba: "sopro",
    oboa: "sopro",
    fagote: "sopro",
    // Cordas com arco
    "cordas com arco": "cordas_arco",
    cordas_arco: "cordas_arco",
    violino: "cordas_arco",
    viola: "cordas_arco",
    violoncelo: "cordas_arco",
    contrabaixo: "baixo",      // contrabaixo elétrico → BassSpecialist
    celo: "cordas_arco",
  };

  // Tenta categoria primeiro
  if (categoryMap[cat]) {
    const resolved = categoryMap[cat];
    return { context: INSTRUMENT_CONTEXTS[resolved], resolvedCategory: resolved };
  }

  // Tenta pelo nome do instrumento
  if (categoryMap[name]) {
    const resolved = categoryMap[name];
    return { context: INSTRUMENT_CONTEXTS[resolved], resolvedCategory: resolved };
  }

  // Detecção prioritária por nome: baixo elétrico antes de match parcial genérico
  if (name.includes("baixo") || name.includes("bass") || name.includes("contrabaixo")) {
    // Exclui violoncelo/contrabaixo de orquestra (cordas com arco): esses têm "arco" no nome
    if (!name.includes("arco") && !name.includes("orquestra") && !name.includes("acústico")) {
      return { context: INSTRUMENT_CONTEXTS["baixo"], resolvedCategory: "baixo" };
    }
  }

  // Tenta match parcial no nome
  for (const [key, resolved] of Object.entries(categoryMap)) {
    if (name.includes(key) || key.includes(name)) {
      return { context: INSTRUMENT_CONTEXTS[resolved], resolvedCategory: resolved };
    }
  }

  // Fallback genérico
  return { context: INSTRUMENT_CONTEXTS.geral, resolvedCategory: "geral" };
}
