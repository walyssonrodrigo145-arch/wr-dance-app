import { useState } from "react";
import { Play, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoThumb } from "@/components/ui/VideoThumb";

/**
 * Player de YouTube com CAPA antes do iframe (thumbnail facade — Erro 153).
 * Mostra a capa oficial do vídeo (cascata maxres → hqdefault → mqdefault via
 * VideoThumb, com gradiente sempre renderizado atrás) com botão play e SÓ
 * monta o iframe após o clique. Benefícios:
 * 1. Nunca fica fundo branco/vazio — antes do play sempre há capa ou placeholder;
 * 2. O iframe carrega sob gesto do usuário, atenuando erros de embed (Erro 153)
 *    e evitando pré-carga em massa de players;
 * 3. Se o embed falhar, os fallbacks fora do componente continuam disponíveis
 *    (player alternativo / abrir no YouTube).
 * Sem videoId (playlist) usa placeholder gradiente; sem src válido mostra
 * mensagem controlada no lugar do play.
 */
export function VideoFacade({
  videoId,
  title,
  embedSrc,
  className,
}: {
  videoId: string | null;
  title: string;
  embedSrc: string | null;
  className?: string;
}) {
  const [started, setStarted] = useState(false);

  return (
    <div className={cn("relative w-full aspect-video rounded-2xl overflow-hidden bg-black", className)}>
      {!started ? (
        embedSrc ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-500/25 to-rose-600/25">
              <Youtube size={36} className="text-pink-500/60" />
            </div>
            {videoId && (
              <VideoThumb
                videoId={videoId}
                alt={title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => setStarted(true)}
              aria-label={`Reproduzir ${title}`}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/25 transition-colors cursor-pointer group/facade"
            >
              <span className="w-16 h-16 rounded-full bg-white/95 text-pink-600 flex items-center justify-center shadow-2xl transition-transform duration-300 group-hover/facade:scale-110 active:scale-95">
                <Play size={26} className="fill-current translate-x-0.5" />
              </span>
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Link sem vídeo/playlist válido — avise seu professor.
          </div>
        )
      ) : embedSrc ? (
        <iframe
          key={embedSrc}
          src={embedSrc}
          title={title || "Player de música"}
          // Erro 153: o YouTube exige receber o Referer do site que embute.
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      ) : null}
    </div>
  );
}
