// ─── MetronomeEngine (PRD 03) ────────────────────────────────────────────────
// Engine singleton de metrônomo com Web Audio API e scheduler lookahead
// (preciso e leve — sem setInterval por batida). Garante UMA única instância
// de loop de áudio em toda a aplicação (§52).
// Estado observável via subscribe/getState (compatível com useSyncExternalStore).

export type TimeSignature = "2/4" | "3/4" | "4/4" | "6/8";

export const TIME_SIGNATURES: Array<{ value: TimeSignature; label: string; beats: number; subdivision: 1 | 2 }> = [
  { value: "2/4", label: "2/4", beats: 2, subdivision: 1 },
  { value: "3/4", label: "3/4", beats: 3, subdivision: 1 },
  { value: "4/4", label: "4/4", beats: 4, subdivision: 1 },
  { value: "6/8", label: "6/8", beats: 6, subdivision: 2 }, // cliques = colcheias (2 grupos de 3)
];

export const MIN_BPM = 40;
export const MAX_BPM = 208;

export interface MetronomeState {
  playing: boolean;
  bpm: number;
  /** Índice do pulso atual dentro do compasso (0-based, atualizado no tempo do áudio) */
  beat: number;
  timeSignature: TimeSignature;
  /** Total de pulsos por compasso conforme a assinatura */
  beatsPerBar: number;
}

type Accent = "strong" | "medium" | "normal";

const LOOKAHEAD_MS = 25;       // tick do scheduler
const SCHEDULE_AHEAD = 0.12;   // segundos agendados à frente

class MetronomeEngine {
  private audioCtx: AudioContext | null = null;
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private internalBeat = 0;
  private visualTimeouts = new Set<number>();

  private state: MetronomeState = {
    playing: false,
    bpm: 80,
    beat: 0,
    timeSignature: "4/4",
    beatsPerBar: 4,
  };

  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): MetronomeState => this.state;

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private setState(patch: Partial<MetronomeState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private signature() {
    return TIME_SIGNATURES.find((t) => t.value === this.state.timeSignature) || TIME_SIGNATURES[2];
  }

  /** Acentuação: primeiro tempo forte; em 6/8, o 4º clique (2º grupo) é médio. */
  private accentFor(beat: number): Accent {
    const sig = this.signature();
    if (beat === 0) return "strong";
    if (sig.value === "6/8" && beat === 3) return "medium";
    return "normal";
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.audioCtx = new Ctor();
      }
      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /** Clique curto (oscilador + envelope) — eficiente e sem travamentos. */
  private scheduleClick(beat: number, time: number) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    const accent = this.accentFor(beat);
    const freq = accent === "strong" ? 1760 : accent === "medium" ? 1320 : 1046;
    const gainValue = accent === "strong" ? 0.5 : accent === "medium" ? 0.35 : 0.25;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.08);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    // Indicador visual sincronizado com o tempo do áudio
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    const timeoutId = window.setTimeout(() => {
      this.visualTimeouts.delete(timeoutId);
      this.setState({ beat });
    }, delay);
    this.visualTimeouts.add(timeoutId);
  }

  private schedulerLoop = () => {
    const ctx = this.audioCtx;
    if (!ctx || !this.state.playing) return;
    const sig = this.signature();
    const interval = 60 / this.state.bpm / sig.subdivision;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleClick(this.internalBeat % sig.beats, this.nextNoteTime);
      this.nextNoteTime += interval;
      this.internalBeat = (this.internalBeat + 1) % sig.beats;
    }
  };

  /** Inicia (ou retoma) o metrônomo. Se bpm informado, ajusta antes. */
  start(bpm?: number) {
    if (bpm !== undefined) this.setBpm(bpm);
    if (this.state.playing) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Encerra QUALQUER loop anterior antes de iniciar novo (§52)
    this.stopScheduler(true);
    this.internalBeat = 0;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.setState({ playing: true, beat: 0 });
    this.schedulerId = window.setInterval(this.schedulerLoop, LOOKAHEAD_MS);
    this.schedulerLoop();
  }

  pause() {
    if (!this.state.playing) return;
    this.stopScheduler(false);
    this.setState({ playing: false });
  }

  toggle(bpm?: number) {
    if (this.state.playing) this.pause();
    else this.start(bpm);
  }

  /** Para tudo e zera o pulso para o tempo 1 (limpa timeouts visuais pendentes). */
  reset() {
    this.stopScheduler(true);
    this.setState({ playing: false, beat: 0 });
  }

  setBpm(bpm: number) {
    const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm) || MIN_BPM));
    if (clamped === this.state.bpm) return;
    this.setState({ bpm: clamped });
  }

  setTimeSignature(sig: TimeSignature) {
    const conf = TIME_SIGNATURES.find((t) => t.value === sig);
    if (!conf) return;
    this.stopScheduler(false);
    this.internalBeat = 0;
    this.setState({ timeSignature: sig, beatsPerBar: conf.beats, beat: 0, playing: false });
  }

  private stopScheduler(clearVisuals: boolean) {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (clearVisuals) {
      this.visualTimeouts.forEach((id) => window.clearTimeout(id));
      this.visualTimeouts.clear();
    }
  }
}

/** Instância única — usar SEMPRE esta em vez de criar novos engines (§52). */
export const metronome = new MetronomeEngine();
