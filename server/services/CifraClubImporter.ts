// ─── CifraClubImporter (PRD Cifra — RF-006/RN-007/RN-008) ────────────────────
// Importa do Cifra Club SOMENTE a estrutura harmônica: tom, seções e acordes
// (com diagramas). A LETRA É SEMPRE REMOVIDA — nunca é armazenada nem exibida.
// Parse puro (testável com fixture HTML); fetch identificado + timeout + rate limit.

import type { ChordDiagram } from "../../drizzle/schema";
import { sanitizeForPrompt } from "../utils/aiPrompts";

export interface ParsedCifra {
  chordSheet: string;
  chordKey: string | null;
  diagrams: ChordDiagram[];
}

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_SHEET_CHARS = 50_000;

/** Busca a página de cifra identificando o MusicPro (RN-008: uso razoável). */
export async function fetchCifraHtml(url: string, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MusicPro/1.0 (plataforma de escolas de musica; +https://wrmusicpro.com.br)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      throw new Error("Página muito grande");
    }
    return Buffer.from(buf).toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

/** Sanitiza texto de marcador de seção (ex: "[Refrão 2]"). */
function cleanSectionLabel(label: string): string {
  const s = sanitizeForPrompt(label, 60);
  return s.replace(/[\[\]]/g, "").trim();
}

/**
 * Parser PURO do HTML da página de cifra (estrutura verificada em 05/09/2026):
 * - Acordes: <pre data-chord-content> com <b data-chord-name="X"> por acorde
 * - Seções: texto entre [colchetes] dentro do pre
 * - Tom: bloco data-chord-config ("Tom: Em")
 * - Diagramas: <li data-chord-name="Am7"> ... data-mount="X 0 2 0 1 0" data-tuning="E A D G B E"
 * A LETRA (texto livre do pre) é descartada — nunca sai desta função.
 */
export function parseCifraHtml(html: string): ParsedCifra | null {
  if (!html || html.length < 50) return null;
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, " ");

  // ── Pre da cifra ──
  const preMatch = clean.match(/<pre[^>]*data-chord-content[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) return null;
  const pre = preMatch[1];

  // ── Linhas do pre (divs .kvMV) ──
  const segments = pre.split(/<div[^>]*class="[^"]*kvMV[^"]*"[^>]*>/i).slice(1);
  const outLines: string[] = [];
  let blankPending = false;

  for (const seg of segments) {
    const lineHtml = seg.split(/<\/div>/i)[0];
    // Acordes na ordem em que aparecem
    const chords: string[] = [];
    const chordRe = /<b[^>]*data-chord-name="([^"]+)"[^>]*>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = chordRe.exec(lineHtml)) !== null) {
      if (cm[1] && cm[1].length <= 12) chords.push(cm[1]);
    }
    // Marcadores de seção (texto entre [ ] após remover tags)
    const text = lineHtml.replace(/<[^>]+>/g, " ");
    const sections: string[] = [];
    const secRe = /\[([^\]]+)\]/g;
    let sm: RegExpExecArray | null;
    while ((sm = secRe.exec(text)) !== null) {
      const label = cleanSectionLabel(sm[1]);
      if (label) sections.push(label);
    }

    if (chords.length === 0 && sections.length === 0) {
      // linha sem conteúdo harmônico (era letra/espaço) — mantém 1 blank como separador
      if (!blankPending && outLines.length > 0) blankPending = true;
      continue;
    }
    if (blankPending && outLines.length > 0) {
      outLines.push("");
    }
    blankPending = false;
    const parts: string[] = [];
    for (const sec of sections) parts.push(`[${sec}]`);
    parts.push(...chords);
    outLines.push(parts.join(" "));
  }

  let chordSheet = outLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!chordSheet) return null;
  if (chordSheet.length > MAX_SHEET_CHARS) chordSheet = chordSheet.slice(0, MAX_SHEET_CHARS);

  // ── Tom (data-chord-config → "Tom: Em") — captura nota + acidente + qualidade (ex: "Em", "C#m", "Bb") ──
  let chordKey: string | null = null;
  const keyMatch =
    clean.match(/data-chord-config[^>]*>[\s\S]{0,400}?Tom[\s\S]{0,200}?<button[^>]*>\s*([A-G][#b]?[A-Za-z0-9]*)\s*</i) ||
    clean.match(/>Tom[^<]*(?:<!-- -->)?\s*:\s*<\/span>\s*<button[^>]*>\s*([A-G][#b]?[A-Za-z0-9]*)\s*</i);
  if (keyMatch && /^[A-G][#b]?[A-Za-z0-9]{0,3}$/.test(keyMatch[1])) {
    chordKey = keyMatch[1];
  }

  // ── Diagramas (li data-chord-name + data-mount + data-tuning) ──
  const diagrams: ChordDiagram[] = [];
  const seen = new Set<string>();
  const diagRe = /<li[^>]*data-chord-name="([^"]+)"[\s\S]{0,900}?data-mount="([^"]+)"\s+data-tuning="([^"]+)"/gi;
  let dm: RegExpExecArray | null;
  while ((dm = diagRe.exec(clean)) !== null && diagrams.length < 40) {
    const name = dm[1].trim();
    const mount = dm[2].trim();
    const tuning = dm[3].trim();
    if (!name || !/^[Xx0-9\s]+$/.test(mount) || seen.has(name)) continue;
    seen.add(name);
    diagrams.push({ name, mount, tuning });
  }

  return { chordSheet, chordKey, diagrams };
}

// ─── Rate limit por escola (RN-008: 20 imports/hora) — padrão helpers.loginAttempts ──
const importWindow = new Map<number, number[]>(); // orgId → timestamps
const IMPORT_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

export function checkImportRateLimit(orgId: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const stamps = (importWindow.get(orgId) || []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= IMPORT_LIMIT) {
    importWindow.set(orgId, stamps);
    return { ok: false, remaining: 0 };
  }
  stamps.push(now);
  importWindow.set(orgId, stamps);
  return { ok: true, remaining: IMPORT_LIMIT - stamps.length };
}

/** Valida se a URL é do Cifra Club (whitelist de host). */
export function isCifraClubUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host === "cifraclub.com.br" && u.protocol === "https:";
  } catch {
    return false;
  }
}
