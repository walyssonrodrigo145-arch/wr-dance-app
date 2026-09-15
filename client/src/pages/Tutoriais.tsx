import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { GraduationCap, Loader2, Play, ExternalLink, FolderOpen } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { VideoFacade } from "@/components/ui/VideoFacade";
import { VideoThumb } from "@/components/ui/VideoThumb";
import { youtubeEmbedSrc } from "@/lib/youtubeEmbed";

/**
 * PRD Tutoriais — Aba "Tutoriais" (professor/admin).
 * Lista os vídeos do YouTube cadastrados pelo Superadmin (master panel) que
 * explicam as funcionalidades do MusicPro. Player com capa antes do iframe
 * (VideoFacade — Erro 153) + fallbacks "player alternativo" e "Abrir no YouTube".
 */
export default function Tutoriais() {
  const { data: items = [], isLoading, error } = trpc.tutorials.list.useQuery();
  const [playing, setPlaying] = useState<any>(null);
  const [embedSrc, setEmbedSrc] = useState<string>("");
  const [altHost, setAltHost] = useState(false);

  const openPlayer = (item: any) => {
    setAltHost(false);
    const src = youtubeEmbedSrc(item.videoId, item.playlistId);
    if (src) {
      setEmbedSrc(src);
      setPlaying(item);
    } else {
      toast.error("Este tutorial não tem vídeo/playlist válido — avise o suporte.");
    }
  };

  const reloadAlt = (item: any) => {
    setAltHost(true);
    const src = youtubeEmbedSrc(item.videoId, item.playlistId, true);
    if (src) setEmbedSrc(src);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-500 shadow-sm">
            <GraduationCap size={20} />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-foreground">🎓 Tutoriais do Sistema</h2>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
              Aprenda a usar cada funcionalidade do MusicPro com nossos vídeos
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
            {items.length} vídeo(s)
          </span>
        )}
      </div>

      {/* Estados */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-black text-foreground">Não foi possível carregar os tutoriais</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[380px]">{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-2/3 bg-muted rounded" />
                <div className="h-2 w-1/2 bg-muted/70 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/40 bg-card/30">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3">
            <FolderOpen size={26} />
          </div>
          <p className="text-sm font-black text-foreground">Nenhum tutorial cadastrado ainda</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1.5 max-w-[300px]">
            Os vídeos de tutoriais publicados pelo suporte aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item: any, idx: number) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.05, 0.4) }}
              className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-md overflow-hidden shadow-2xl shadow-primary/5 hover:border-indigo-500/40 hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-500 group"
            >
              <div className="aspect-video bg-muted/50 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-purple-600/20">
                  <GraduationCap size={34} className="text-indigo-500/60" />
                </div>
                {item.videoId && (
                  <VideoThumb
                    videoId={item.videoId}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                <button
                  onClick={() => openPlayer(item)}
                  title="Assistir tutorial"
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span className="w-11 h-11 rounded-full bg-white/95 text-indigo-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl translate-y-1 group-hover:translate-y-0">
                    <Play size={18} className="fill-current translate-x-0.5" />
                  </span>
                </button>
                <span className="absolute top-2 left-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-600/90 text-white">
                  {item.category || "Geral"}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <h4 className="text-xs font-black text-foreground truncate">{item.title}</h4>
                {item.description && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{item.description}</p>
                )}
                <button
                  onClick={() => openPlayer(item)}
                  className="w-full h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Play size={12} className="fill-current" /> Assistir
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Player */}
      <ResponsiveDialog
        open={!!playing}
        onOpenChange={(o) => { if (!o) { setPlaying(null); setEmbedSrc(""); } }}
        title={playing?.title || "Tutorial"}
        description={playing?.category ? `Tutorial · ${playing.category}` : "Vídeo do MusicPro"}
      >
        <div className="space-y-3 pt-1">
          <VideoFacade
            key={playing?.id ?? "player"}
            videoId={playing?.videoId ?? null}
            title={playing?.title || "Tutorial"}
            embedSrc={embedSrc || null}
          />
          {playing?.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{playing.description}</p>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            {!altHost && (
              <button
                type="button"
                onClick={() => reloadAlt(playing)}
                className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
                title="Se o vídeo mostrar erro (ex: 153), troque o host do player"
              >
                Erro no vídeo? Usar player alternativo
              </button>
            )}
            {playing?.youtubeUrl && (
              <a
                href={playing.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink size={11} /> Abrir no YouTube →
              </a>
            )}
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
