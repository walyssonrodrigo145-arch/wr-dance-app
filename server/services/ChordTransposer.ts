// ─── ChordTransposer (PRD Cifra — RN-003/RN-007) ─────────────────────────────
// Serviço PURO e testável: transposição de cifras (texto) acorde a acorde.
// Regras:
// - Apenas linhas "de acordes" são transpostas (heurística: maioria dos tokens
//   casa com o padrão de acorde) — letras copiadas junto nunca são corrompidas.
// - Marcadores de seção ([Intro], [Refrão]) são preservados intactos.
// - Enarmônicos: raiz escrita com "b" usa tabela de bemóis; resto, sustenidos.
// - Baixo invertido (C/G) transpõe raiz E baixo.

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const ROOT_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Caracteres válidos no "corpo" do acorde (qualidade/extensões). Palavras comuns ("bre", "te") são rejeitadas. */
const QUALITY_CHARS = /^[0-9#bMmajindsu()Δ°ø+\-]*$/;

export interface ParsedChord {
  root: string;     // ex: "C#", "Bb"
  quality: string;  // ex: "m7", "7M", "sus4", "" 
  bass?: string;    // ex: "G" em C/G
}

/** Faz parse de um token de acorde. Retorna null quando não é acorde. */
export function parseChordToken(token: string): ParsedChord | null {
  const t = token.trim();
  if (!t || t.length > 12) return null;
  const m = t.match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!m) return null;
  const [, rootLetter, accidental, quality = "", bass] = m;
  if (quality && !QUALITY_CHARS.test(quality)) return null;
  // Acorde precisa de qualidade vazia OU qualidade que faça sentido (não só ")" sozinho)
  if (quality === ")" || quality === "(") return null;
  const root = rootLetter + (accidental || "");
  return { root, quality, bass: bass || undefined };
}

function transposeRoot(root: string, semitones: number, preferFlat: boolean): string {
  const letter = root[0];
  const accidental = root.slice(1);
  const pc = (ROOT_PC[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + semitones + 120) % 12;
  // Enarmônicos: se a raiz original era escrita com bemol, mantém preferência por bemóis
  const table = accidental === "b" || (preferFlat && !accidental) ? FLAT : SHARP;
  return table[pc];
}

/** Transpõe UM acorde. Preferência de enarmônico herdada da raiz original. */
export function transposeChordName(name: string, semitones: number): string {
  const parsed = parseChordToken(name);
  if (!parsed) return name;
  if (semitones === 0) return name;
  const preferFlat = parsed.root.includes("b");
  const root = transposeRoot(parsed.root, semitones, preferFlat);
  const bass = parsed.bass ? transposeRoot(parsed.bass, semitones, preferFlat) : undefined;
  return root + parsed.quality + (bass ? "/" + bass : "");
}

/** Token é marcador de seção? ([Intro], [Refrão], [Solo A]) */
function isSectionMarker(token: string): boolean {
  return /^\[[^\]]*\]$/.test(token.trim());
}

/**
 * Uma linha é "linha de acordes" se contém pelo menos 1 token de acorde
 * E pelo menos 60% dos tokens (fora marcadores) são acordes.
 * Assim, letras coladas junto à cifra nunca são transpostas por engano.
 */
function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let chordCount = 0;
  let regularCount = 0;
  for (const tk of tokens) {
    if (isSectionMarker(tk)) continue;
    regularCount++;
    if (parseChordToken(tk)) chordCount++;
  }
  if (regularCount === 0) return false;
  return chordCount >= 1 && chordCount / regularCount >= 0.6;
}

/**
 * Transpõe a cifra inteira. Linhas de letra/poesia passam intactas;
 * apenas linhas de acordes são alteradas.
 */
export function transposeChordSheet(sheet: string, semitones: number): string {
  const s = Math.max(-11, Math.min(11, Math.round(semitones)));
  if (!sheet || s === 0) return sheet ?? "";
  return sheet
    .split("\n")
    .map((line) => {
      if (!isChordLine(line)) return line;
      return line.split(/(\s+)/).map((part) => {
        if (/^\s*$/.test(part) || isSectionMarker(part)) return part;
        const parsed = parseChordToken(part);
        if (!parsed) return part;
        return transposeChordName(part, s);
      }).join("");
    })
    .join("\n");
}

/** Extrai os nomes de acorde presentes no texto (para casar com diagramas). */
export function extractChordNames(sheet: string): string[] {
  const names = new Set<string>();
  for (const line of sheet.split("\n")) {
    for (const tk of line.trim().split(/\s+/)) {
      if (parseChordToken(tk)) names.add(tk);
    }
  }
  return Array.from(names);
}
