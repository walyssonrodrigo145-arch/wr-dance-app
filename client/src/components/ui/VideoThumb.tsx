import { useState } from "react";
import { youtubeThumbUrl } from "@/lib/youtubeEmbed";

/**
 * Capa (thumbnail) do YouTube à prova de falha.
 * Cascata de qualidades da CDN oficial: maxres → hqdefault → mqdefault.
 * - maxres não existe em todos os vídeos (a cascata cobre);
 * - uma falha transitória de rede NÃO esconde a capa permanentemente
 *   (antes usava style.display="none" no onError, sem retry);
 * - se TODAS falharem, renderiza nada — o placeholder/gradiente do
 *   componente pai (sempre renderizado atrás) permanece visível.
 */
const QUALITIES = ["maxresdefault", "hqdefault", "mqdefault"] as const;

export function VideoThumb({
  videoId,
  alt,
  className,
}: {
  videoId: string;
  alt: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  if (idx >= QUALITIES.length) return null;
  return (
    <img
      src={youtubeThumbUrl(videoId, idx === 0)}
      alt={alt}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className={className}
    />
  );
}
