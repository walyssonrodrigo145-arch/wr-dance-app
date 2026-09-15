// ─── YouTube URL Parser (PRD Repertório) ─────────────────────────────────────
// Extração pura e testável de videoId/playlistId. RN-005: o iframe NUNCA
// recebe a URL crua do usuário — somente IDs validados por charset seguro.
// Aceita: watch?v=, youtu.be/, /shorts/, /embed/, /live/ e playlists (?list=).

export interface YoutubeRef {
  videoId: string | null;
  playlistId: string | null;
}

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

function sanitizeId(id: string | null | undefined, maxLen: number): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > maxLen || !SAFE_ID_RE.test(trimmed)) return null;
  return trimmed;
}

/** Retorna null quando a URL não é um link válido do YouTube. */
export function extractYoutubeRef(raw: string): YoutubeRef | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  let videoId: string | null = sanitizeId(url.searchParams.get("v"), 20);
  const listParam = url.searchParams.get("list");
  const playlistId = sanitizeId(listParam, 60);

  if (!videoId && host === "youtu.be") {
    videoId = sanitizeId(url.pathname.slice(1).split("/")[0], 20);
  }
  if (!videoId) {
    const shortsMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)/);
    if (shortsMatch) videoId = sanitizeId(shortsMatch[1], 20);
  }

  if (!videoId && !playlistId) return null;
  return { videoId, playlistId };
}

/** src do player (Caça-Bug: youtube-nocookie disparava Erro 153 — host padrão é o compatível). */
export function buildEmbedSrc(ref: YoutubeRef): string | null {
  if (ref.videoId) {
    const base = `https://www.youtube.com/embed/${ref.videoId}?rel=0&playsinline=1`;
    return ref.playlistId ? `${base}&list=${ref.playlistId}` : base;
  }
  if (ref.playlistId) {
    return `https://www.youtube.com/embed/videoseries?list=${ref.playlistId}&rel=0&playsinline=1`;
  }
  return null;
}

/** Miniatura oficial do YouTube (CDN pública). */
export function buildThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
