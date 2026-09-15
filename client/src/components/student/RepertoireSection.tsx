import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Music, Award, Eye, Loader2, Youtube, FileText, Pause, Play, ZoomIn, ZoomOut, ExternalLink, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { VideoFacade } from "@/components/ui/VideoFacade";
import { VideoThumb } from "@/components/ui/VideoThumb";
import { youtubeEmbedSrc } from "@/lib/youtubeEmbed";

/**
 * PRD Repertório — Seção no portal do aluno (aba Materiais).
 * Player do YouTube EMBUTIDO + Cifra (só acordes — RN-007) com transposição,
 * autoscroll e diagramas. O aluno executa e estuda sem sair do MusicPro.
 */

// ─── Diagrama de acorde (SVG a partir do mount "X 0 2 0 1 0") ────────────────
function ChordDiagramBox({ name, mount }: { name: string; mount: string }) {
  const strings = mount.trim().split(/\s+/);
  const frets = strings.map((s) => (s === "X" || s.toUpperCase() === "X" ? null : parseInt(s, 10)));
  const numeric = frets.filter((f): f is number => f !== null && f > 0);
  const minFret = numeric.length ? Math.min(...numeric) : 1;
  const startFret = minFret > 1 ? minFret : 1;
  const endFret = Math.max(startFret + 4, numeric.length ? Math.max(...numeric) : startFret + 4);

  const x0 = 10, y0 = 24, w = 60, rows = endFret - startFret + 1;
  const rowH = 18;
  const sx = (i: number) => x0 + (i * w) / (strings.length - 1);

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border/40 bg-background/60 p-2 hover:border-pink-500/30 transition-all duration-300">
      <span className="text-[10px] font-black text-foreground">{name}</span>
      <svg width={80} height={y0 + rows * rowH + 8} viewBox={`0 0 80 ${y0 + rows * rowH + 8}`} aria-label={`Diagrama do acorde ${name}`}>
        {strings.map((s, i) => {
          const fret = frets[i];
          const label = s === "X" || s.toUpperCase() === "X" ? "×" : s === "0" ? "○" : "";
          return <text key={i} x={sx(i)} y={14} textAnchor="middle" fontSize="9" fill="currentColor" className="fill-muted-foreground">{label}</text>;
        })}
        {[...Array(rows + 1)].map((_, r) => (
          <line key={`h${r}`} x1={x0} y1={y0 + r * rowH} x2={x0 + w} y2={y0 + r * rowH} stroke="currentColor" strokeWidth={r === 0 ? 2.5 : 1} className="stroke-border" />
        ))}
        {strings.map((_, i) => (
          <line key={`v${i}`} x1={sx(i)} y1={y0} x2={sx(i)} y2={y0 + rows * rowH} stroke="currentColor" strokeWidth={1} className="stroke-border" />
        ))}
        {startFret > 1 && (
          <text x={x0 - 2} y={y0 + 12} fontSize="8" textAnchor="end" className="fill-muted-foreground">{startFret}</text>
        )}
        {frets.map((fret, i) => {
          if (fret === null || fret === 0) return null;
          const row = fret - startFret;
          if (row < 0 || row > rows) return null;
          return <circle key={`d${i}`} cx={sx(i)} cy={y0 + row * rowH + rowH / 2} r={4.5} className="fill-primary" />;
        })}
      </svg>
    </div>
  );
}

// ─── Visualizador de cifra ────────────────────────────────────────────────────
function ChordViewer({ musicId }: { musicId: number }) {
  const [semitons, setSemitons] = useState(0);
  const [fontSize, setFontSize] = useState(1.05); // rem
  const [autoScroll, setAutoScroll] = useState(false);
  const [speed, setSpeed] = useState(3);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: base, isLoading: isLoadingBase } = trpc.repertoire.getChord.useQuery({ id: musicId });
  const { data: transposed, isFetching: isTransposing } = trpc.repertoire.transposeChord.useQuery(
    { id: musicId, semitons },
    { enabled: semitons !== 0 }
  );

  // Caça-Bug: durante o fetch da nova transposição, `transposed` é undefined
  // (nova chave de cache) — mantém a cifra anterior visível em vez de flash vazio.
  const displayedSheet = semitons === 0
    ? base?.chordSheet
    : (transposed?.chordSheet ?? base?.chordSheet);
  const displayedKey = semitons === 0 ? base?.chordKey : (transposed?.chordKey ?? base?.chordKey);
  const diagrams = semitons === 0 ? (base?.diagrams ?? []) : (transposed?.diagrams ?? []);

  // Autoscroll suave via rAF (pausa automática ao desmontar/fechar)
  useEffect(() => {
    if (!autoScroll) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const el = scrollRef.current;
      if (el) {
        const delta = speed * 0.35 * ((t - last) / 16.7);
        el.scrollTop += delta;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setAutoScroll(false);
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, speed]);

  if (isLoadingBase) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={22} className="animate-spin text-pink-400" />
      </div>
    );
  }
  if (!base?.chordSheet) {
    return <p className="text-xs text-muted-foreground text-center py-8">Nenhuma cifra anexada a esta música.</p>;
  }

  return (
    <div className="space-y-2.5">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-card/60 backdrop-blur-md p-2 shadow-lg shadow-primary/5">
        {/* Transposição */}
        <div className="flex items-center gap-1 rounded-lg bg-background border border-border/50 px-1 py-0.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground pl-1">Tom</span>
          <button
            onClick={() => setSemitons((s) => Math.max(-11, s - 1))}
            aria-label="Diminuir meio tom"
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-all active:scale-95 cursor-pointer"
          >
            <ArrowDownRight size={13} />
          </button>
          <span className="text-[11px] font-black tabular-nums min-w-[34px] text-center">
            {displayedKey || "—"}{semitons !== 0 && <span className="text-[8px] text-pink-500 ml-0.5">({semitons > 0 ? "+" : ""}{semitons})</span>}
          </span>
          <button
            onClick={() => setSemitons((s) => Math.min(11, s + 1))}
            aria-label="Aumentar meio tom"
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-all active:scale-95 cursor-pointer"
          >
            <ArrowUpRight size={13} />
          </button>
        </div>

        {/* Fonte */}
        <div className="flex items-center gap-1 rounded-lg bg-background border border-border/50 px-1 py-0.5">
          <button onClick={() => setFontSize((f) => Math.max(0.85, +(f - 0.1).toFixed(2)))} aria-label="Diminuir fonte"
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-all active:scale-95 cursor-pointer"><ZoomOut size={13} /></button>
          <span className="text-[10px] font-bold w-8 text-center">{Math.round(fontSize * 100)}%</span>
          <button onClick={() => setFontSize((f) => Math.min(2, +(f + 0.1).toFixed(2)))} aria-label="Aumentar fonte"
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-all active:scale-95 cursor-pointer"><ZoomIn size={13} /></button>
        </div>

        {/* Autoscroll */}
        <div className="flex items-center gap-1.5 rounded-lg bg-background border border-border/50 px-2 py-0.5 ml-auto">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            aria-label={autoScroll ? "Pausar rolagem" : "Iniciar rolagem automática"}
            className={cn(
              "h-8 px-3 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all active:scale-95",
              autoScroll ? "bg-pink-600 text-white shadow-md shadow-pink-500/20" : "hover:bg-muted"
            )}
          >
            {autoScroll ? <Pause size={11} /> : <Play size={11} />}
            {autoScroll ? "Pausar" : "Rolagem"}
          </button>
          {autoScroll && (
            <input
              type="range" min={1} max={10} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              aria-label="Velocidade da rolagem"
              className="w-20 h-1.5 accent-pink-500"
            />
          )}
        </div>
      </div>

      {/* Cifra */}
      <div
        ref={scrollRef}
        className="max-h-[46vh] overflow-auto rounded-xl border border-border/50 bg-background/80 p-4 subtle-scrollbar relative"
      >
        {isTransposing && (
          <div className="absolute top-2 right-2"><Loader2 size={14} className="animate-spin text-pink-400" /></div>
        )}
        <pre
          className="whitespace-pre font-mono leading-relaxed text-foreground/90 select-text"
          style={{ fontSize: `${fontSize}rem` }}
        >
          {displayedSheet}
        </pre>
      </div>

      {/* Diagramas (apenas acordes presentes na cifra exibida) */}
      {diagrams.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {diagrams.map((d) => (
            <ChordDiagramBox key={d.name} name={d.name} mount={d.mount} />
          ))}
        </div>
      )}

      {/* Atribuição (RN-008) */}
      {base?.cifraclubUrl && (
        <a
          href={base.cifraclubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink size={11} />
          Cifra importada do Cifra Club · ver letra no original →
        </a>
      )}
    </div>
  );
}

// ─── Seção principal ──────────────────────────────────────────────────────────
export function RepertoireSection() {
  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.repertoire.my.useQuery();
  const [playing, setPlaying] = useState<any>(null);
  const [embedSrc, setEmbedSrc] = useState<string>("");
  const [showChord, setShowChord] = useState(false);
  // Caça-Bug (Erro 153): alterna entre hosts do YouTube quando um falha
  const [altHost, setAltHost] = useState(false);

  const markViewedMutation = trpc.repertoire.markViewed.useMutation();
  const toggleLearnedMutation = trpc.repertoire.toggleLearned.useMutation({
    onSuccess: (data) => {
      toast.success(data?.learned ? "Marcada como aprendida! 🎉" : "Marcação removida.");
      utils.repertoire.my.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar o status."),
  });

  // Caça-Bug: `playing` é um snapshot — após toggleLearned o botão ficava
  // obsoleto (e duplo clique desmarcava). Deriva sempre do item VIVO da query.
  const playingItem = useMemo(
    () => (playing ? items.find((i: any) => i.id === playing.id) ?? playing : null),
    [playing, items]
  );

  const openPlayer = (item: any) => {
    setPlaying(item);
    setShowChord(false);
    setAltHost(false); // reset: o host padrão é o compatível (Erro 153 era do nocookie)
    markViewedMutation.mutate({ id: item.id });
    // src montada SOMENTE a partir dos IDs persistidos (videoId validado pelo
    // parser server-side — nunca da URL crua). RN-005 do PRD.
    const src = youtubeEmbedSrc(item.videoId, item.playlistId);
    if (src) {
      setEmbedSrc(src);
    } else {
      setEmbedSrc("");
      toast.error("Este item não tem vídeo/playlist válido — avise seu professor.");
    }
  };

  // Caça-Bug (Erro 153): fallback self-service — troca o host do player em 1 clique
  const reloadAlt = (item: any) => {
    setAltHost(true);
    const src = youtubeEmbedSrc(item.videoId, item.playlistId, true);
    if (src) setEmbedSrc(src);
  };

  const learnedCount = items.filter((i: any) => i.learnedAt).length;

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-500/15 flex items-center justify-center text-pink-500 shadow-sm">
            <Music size={18} />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black tracking-tight text-foreground">🎵 Repertório</h2>
            <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Músicas que seu professor escolheu para você</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
            {learnedCount}/{items.length} aprendidas
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted/50" />
              <div className="p-3"><div className="h-3 w-2/3 bg-muted rounded" /></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-2xl border border-dashed border-border/40 bg-card/30">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-400 mb-3">
            <Youtube size={22} />
          </div>
          <p className="text-sm font-black text-foreground">Nenhuma música ainda</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1.5 max-w-[280px]">
            Quando seu professor adicionar músicas, elas aparecem aqui para você ouvir sem sair do app.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((item: any, idx: number) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.05, 0.4) }}
              onClick={() => openPlayer(item)}
              className={cn(
                "rounded-2xl border overflow-hidden text-left transition-all duration-500 hover:-translate-y-1 hover:shadow-xl group cursor-pointer",
                item.learnedAt
                  ? "border-emerald-500/40 bg-emerald-500/5 hover:shadow-emerald-500/10"
                  : "border-white/10 bg-card/60 backdrop-blur-md shadow-lg shadow-primary/5 hover:border-pink-500/40 hover:shadow-pink-500/10"
              )}
            >
              <div className="aspect-video bg-muted/50 relative overflow-hidden">
                {item.videoId ? (
                  <VideoThumb
                    videoId={item.videoId}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-rose-600/20">
                    <Youtube size={30} className="text-pink-500/60" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="w-10 h-10 rounded-full bg-white/90 text-pink-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg translate-y-1 group-hover:translate-y-0">
                    <Music size={17} />
                  </span>
                </div>
                {/* Badge Cifra */}
                {(item.hasChord || item.hasCifraClubUrl) && (
                  <span className="absolute top-1.5 right-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-600/90 text-white flex items-center gap-0.5">
                    <FileText size={8} /> Cifra
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-[11px] font-black text-foreground truncate">{item.title}</p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {!item.viewedAt && (
                    <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-pink-600 text-white">Nova</span>
                  )}
                  {item.viewedAt && !item.learnedAt && (
                    <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/90 text-white flex items-center gap-0.5">
                      <Eye size={8} /> Ouvida
                    </span>
                  )}
                  {item.learnedAt && (
                    <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/90 text-white flex items-center gap-0.5">
                      <Award size={8} /> Aprendida
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Player + Cifra (split no desktop, tabs no mobile) */}
      <ResponsiveDialog
        open={!!playingItem}
        onOpenChange={(o) => { if (!o) { setPlaying(null); setShowChord(false); } }}
        title={playingItem?.title || "Música"}
        description={playingItem?.description || "Executando pelo MusicPro"}
      >
        <div className="space-y-3 pt-1">
          {/* Toggle Música | Cifra */}
          {(playingItem?.hasChord || playingItem?.hasCifraClubUrl) && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/40 border border-border/40">
              <button
                onClick={() => setShowChord(false)}
                className={cn(
                  "h-9 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                  !showChord ? "bg-pink-600 text-white shadow-md shadow-pink-500/20" : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                <Music size={13} /> Música
              </button>
              <button
                onClick={() => setShowChord(true)}
                className={cn(
                  "h-9 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                  showChord ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                <FileText size={13} /> Cifra
              </button>
            </div>
          )}

          <div className={cn("gap-3", showChord && playingItem ? "grid lg:grid-cols-2" : "")}>
            {/* Player (capa antes do iframe — evita fundo branco/Erro 153 na abertura) */}
            <div className={cn(showChord && playingItem ? "hidden lg:block" : "")}>
              <VideoFacade
                key={playingItem?.id ?? "player"}
                videoId={playingItem?.videoId ?? null}
                title={playingItem?.title || "Player de música"}
                embedSrc={embedSrc || null}
              />
            </div>

            {/* Cifra (só desktop mostra junto; mobile = tab) */}
            {showChord && playingItem && (
              <div>
                <ChordViewer musicId={playingItem.id} />
              </div>
            )}
          </div>

          {playingItem && !showChord && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[10px] text-muted-foreground font-bold">
                  {playingItem.learnedAt ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <Award size={12} /> Marcada como aprendida — pode ouvir quantas vezes quiser!
                    </span>
                  ) : (
                    "Ouça com atenção e marque quando dominar."
                  )}
                </div>
                <button
                  onClick={() => toggleLearnedMutation.mutate({ id: playingItem.id })}
                  disabled={toggleLearnedMutation.isPending}
                  className={cn(
                    "h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 cursor-pointer",
                    playingItem.learnedAt
                      ? "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                  )}
                >
                  {toggleLearnedMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Award size={13} />}
                  {playingItem.learnedAt ? "Remover marcação" : "Marcar como aprendida"}
                </button>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {!altHost && (
                  <button
                    type="button"
                    onClick={() => reloadAlt(playingItem)}
                    className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
                    title="Se o vídeo mostrar erro (ex: 153), troque o host do player"
                  >
                    Erro no vídeo? Usar player alternativo
                  </button>
                )}
                {playingItem?.youtubeUrl && (
                  <a
                    href={playingItem.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink size={11} /> Abrir no YouTube →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}
