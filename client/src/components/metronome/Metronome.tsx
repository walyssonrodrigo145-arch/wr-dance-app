import { useSyncExternalStore, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Play, Pause, RotateCcw, Minus, Plus, ChevronDown, Music2 } from "lucide-react";
import {
  metronome, TIME_SIGNATURES, MIN_BPM, MAX_BPM,
  type MetronomeState, type TimeSignature,
} from "@/lib/metronomeEngine";

const BPM_PRESETS = [40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200];

/**
 * PRD 03 — Metrônomo (§41-§52). Componente reutilizável (painel/widget).
 * Usa a instância única `metronome` — nunca múltiplos loops de áudio.
 */
export function Metronome({ className, compact = false }: { className?: string; compact?: boolean }) {
  const state: MetronomeState = useSyncExternalStore(metronome.subscribe, metronome.getState);
  const [showPresets, setShowPresets] = useState(false);
  // FIX (Caça-Bug): input controlado direto no engine clampava a cada tecla
  // (digitar "80" virava 40). Estado local só commita no blur/Enter.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);

  const commitBpmDraft = () => {
    if (bpmDraft !== null) {
      const n = parseInt(bpmDraft, 10);
      if (!Number.isNaN(n)) metronome.setBpm(n);
      setBpmDraft(null);
    }
  };

  return (
    <div
      className={cn(
        "rounded-3xl border border-white/15 bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-2xl shadow-indigo-600/30 overflow-hidden",
        className
      )}
      role="region"
      aria-label="Metrônomo"
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-200 flex items-center gap-1.5">
            <Music2 size={12} /> Metrônomo
          </p>
          <select
            value={state.timeSignature}
            onChange={(e) => metronome.setTimeSignature(e.target.value as TimeSignature)}
            aria-label="Assinatura rítmica"
            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-[10px] font-black uppercase outline-none cursor-pointer [&>option]:text-slate-900"
          >
            {TIME_SIGNATURES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* BPM display */}
        <div className="text-center">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-black tabular-nums leading-none">{state.bpm}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">BPM</span>
          </div>
        </div>

        {/* Indicador visual do pulso (§44) — primeiro tempo diferenciado */}
        <div className="flex items-center justify-center gap-2 py-1" aria-label={`Pulso ${state.beat + 1} de ${state.beatsPerBar}`}>
          {Array.from({ length: state.beatsPerBar }).map((_, i) => {
            const isCurrent = state.playing && state.beat === i;
            const isFirst = i === 0;
            return (
              <span
                key={i}
                className={cn(
                  "rounded-full transition-all duration-75",
                  isFirst ? "w-3.5 h-3.5" : "w-2.5 h-2.5",
                  isCurrent
                    ? isFirst
                      ? "bg-amber-300 scale-125 shadow-[0_0_12px_rgba(252,211,77,0.9)]"
                      : "bg-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                    : isFirst
                      ? "bg-amber-300/40"
                      : "bg-white/25"
                )}
              />
            );
          })}
        </div>

        {/* Controles Play/Pause/Reset (§41) */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => metronome.reset()}
            aria-label="Resetar metrônomo"
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            onClick={() => metronome.toggle()}
            aria-label={state.playing ? "Pausar metrônomo" : "Iniciar metrônomo"}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 cursor-pointer hover:scale-105",
              state.playing
                ? "bg-amber-400 hover:bg-amber-300 text-indigo-900 shadow-lg shadow-amber-400/40"
                : "bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg shadow-white/30"
            )}
          >
            {state.playing ? <Pause size={26} className="fill-current" /> : <Play size={26} className="fill-current translate-x-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowPresets((v) => !v)}
            aria-label="Valores predefinidos de BPM"
            className={cn(
              "w-11 h-11 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer",
              showPresets ? "bg-white/25 border-white/40" : "bg-white/10 hover:bg-white/20 border-white/20"
            )}
          >
            <ChevronDown size={17} className={cn("transition-transform", showPresets && "rotate-180")} />
          </button>
        </div>

        {/* BPM: -, input, + (§42) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => metronome.setBpm(state.bpm - 1)}
            aria-label="Diminuir BPM"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Minus size={15} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpmDraft ?? String(state.bpm)}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={commitBpmDraft}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="BPM"
            className="flex-1 h-10 rounded-xl bg-white/10 border border-white/20 text-center text-sm font-black tabular-nums outline-none focus:ring-2 focus:ring-white/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => metronome.setBpm(state.bpm + 1)}
            aria-label="Aumentar BPM"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* Slider */}
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={state.bpm}
          onChange={(e) => metronome.setBpm(Number(e.target.value))}
          aria-label="Controle deslizante de BPM"
          className="w-full h-2 rounded-full appearance-none bg-white/20 cursor-pointer accent-amber-300
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-300 [&::-webkit-slider-thumb]:shadow-md"
        />

        {/* Presets (§42) */}
        {showPresets && !compact && (
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {BPM_PRESETS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => metronome.setBpm(b)}
                className={cn(
                  "h-7 rounded-lg text-[10px] font-black transition-all cursor-pointer border",
                  state.bpm === b
                    ? "bg-white text-indigo-700 border-white"
                    : "bg-white/10 hover:bg-white/20 text-indigo-100 border-white/15"
                )}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Painel flutuante do metrônomo — usado no Plano Diário do aluno (§40/§50). */
export function FloatingMetronome() {
  const [open, setOpen] = useState(false);
  const state: MetronomeState = useSyncExternalStore(metronome.subscribe, metronome.getState);

  // FIX (Caça-Bug): ao sair da página (componente desmonta) o engine singleton
  // continuaria tocando sem nenhum controle acessível — pausa automática.
  useEffect(
    () => () => {
      if (metronome.getState().playing) metronome.pause();
    },
    []
  );

  return (
    <>
      {open && (
        <div className="fixed z-50 bottom-24 right-4 w-[280px] sm:w-[300px] animate-in zoom-in-95 fade-in duration-200">
          <Metronome />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar metrônomo" : "Abrir metrônomo"}
        className={cn(
          "fixed z-50 bottom-20 right-4 w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all active:scale-95 cursor-pointer",
          state.playing
            ? "bg-amber-400 text-indigo-900 shadow-amber-400/40"
            : "bg-indigo-600 text-white shadow-indigo-600/40 hover:bg-indigo-700"
        )}
      >
        <Music2 size={20} />
        {state.playing && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />}
      </button>
    </>
  );
}
