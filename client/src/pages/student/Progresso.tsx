import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Award, Loader2, BookOpen,
  ChevronLeft, ChevronRight, CalendarDays, Music,
  Timer, Guitar, PenTool, Star, Play, Pause,
  Sparkles, Target, Music2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { EditStudyPlanModal } from "@/components/modals/EditStudyPlanModal";
import { FloatingMetronome } from "@/components/metronome/Metronome";
import { metronome } from "@/lib/metronomeEngine";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Exercise {
  title: string;
  subtitle?: string;
  duration?: string;
  points?: string[];
  icon?: string;
  bpm?: number;
}

interface DayPlan {
  dayName: string;
  focus?: { title: string; description: string };
  exercises?: Exercise[];
}

interface StudyPlan {
  weeklyGoal?: string;
  importantMessage?: string;
  days: DayPlan[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePlanData(planText: string | null | undefined): StudyPlan | null {
  if (!planText) return null;
  try {
    let cleanText = planText.trim();
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleanText);
    if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;
    return parsed as StudyPlan;
  } catch (e) {
    console.error("Erro ao fazer parse do plano:", e);
    return null;
  }
}

function parseDaysCompleted(raw: any): boolean[] {
  if (!raw) return [false, false, false, false, false];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.map(Boolean);
    }
  } catch (e) {
    return [false, false, false, false, false];
  }
  return [false, false, false, false, false];
}

function parseDaysTimeSpent(raw: any): number[] {
  if (!raw) return [0, 0, 0, 0, 0];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      const arr = parsed.map(Number);
      while (arr.length < 5) arr.push(0);
      return arr;
    }
    return [0, 0, 0, 0, 0];
  } catch (e) {
    return [0, 0, 0, 0, 0];
  }
}

const ExerciseIcon = ({ icon, title }: { icon?: string; title?: string }) => {
  const cls = "text-indigo-600";
  const sz = 22;
  // RF-002 (PRD_OTIMIZACAO_PLANO_DIARIO): deriva o ícone pelo título do bloco
  const t = (title || "").toLowerCase();
  const derived = t.startsWith("revis") ? "revisao"
    : t.startsWith("aquec") ? "music"
    : t.startsWith("téc") || t.startsWith("tec") ? "star"
    : t.startsWith("conceit") ? "conceito"
    : t.startsWith("aplic") ? "play"
    : t.startsWith("desaf") ? "pen"
    : null;
  switch (icon || derived) {
    case "metronome": return <Timer size={sz} className={cls} />;
    case "guitar":   return <Guitar size={sz} className={cls} />;
    case "pen":      return <PenTool size={sz} className={cls} />;
    case "star":     return <Star size={sz} className={cls} />;
    case "play":     return <Play size={sz} className={cls} />;
    default:         return <Music size={sz} className={cls} />;
  }
}

// ─── Modal de Detalhes do Exercício ──────────────────────────────────────────
interface ExerciseDetailModalProps {
  exercise: Exercise | null;
  dayFocus?: string;
  onClose: () => void;
}

function ExerciseDetailModal({ exercise, dayFocus, onClose }: ExerciseDetailModalProps) {
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

  const detailsMutation = trpc.studentPortal.getExerciseDetails.useMutation({
    onSuccess: (data) => setAiExplanation(data.explanation),
    onError: (e) => toast.error("Não foi possível gerar a explicação: " + e.message),
  });

  // Reset ao abrir um novo exercício
  useEffect(() => {
    setAiExplanation(null);
  }, [exercise?.title]);

  if (!exercise) return null;

  const handleGenerateDetails = () => {
    detailsMutation.mutate({
      exerciseTitle: exercise.title,
      exerciseSubtitle: exercise.subtitle,
      exercisePoints: exercise.points,
      dayFocus: dayFocus,
    });
  };

  return (
    <Dialog open={!!exercise} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl border-0 shadow-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10">
            <Star size={120} className="translate-x-8 -translate-y-8" />
          </div>
          <DialogHeader>
            <div className="flex items-start gap-3 relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-sm">
                <ExerciseIcon icon={exercise.icon} title={exercise.title} />
              </div>
              <div>
                <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">
                  Detalhes do Exercício
                </p>
                <DialogTitle className="text-white font-black text-xl leading-tight">
                  {exercise.title}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Instrução base */}
          {exercise.subtitle && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Instrução</p>
              <p className="text-slate-700 font-medium leading-relaxed">{exercise.subtitle}</p>
            </div>
          )}

          {/* Pontos de atenção */}
          {exercise.points && exercise.points.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pontos de atenção</p>
              <ul className="space-y-2">
                {exercise.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Duração */}
          {exercise.duration && (
            <div className="bg-indigo-50 rounded-xl p-3 flex items-center gap-3">
              <Timer size={18} className="text-indigo-500 shrink-0" />
              <p className="text-sm font-bold text-indigo-700">
                Tempo sugerido: <span className="text-indigo-600">{exercise.duration}</span>
              </p>
            </div>
          )}

          {/* PRD 03 — BPM recomendado do exercício (§46) */}
          {typeof exercise.bpm === "number" && exercise.bpm > 0 && (
            <div className="bg-violet-50 rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-black text-violet-700 flex items-center gap-2">
                <Music2 size={16} className="text-violet-500" /> BPM recomendado: {exercise.bpm}
              </span>
              <button
                type="button"
                onClick={() => {
                  metronome.start(exercise.bpm);
                  toast.success(`Metrônomo iniciado em ${exercise.bpm} BPM`);
                }}
                className="ml-auto h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Play size={13} className="fill-current" /> Iniciar em {exercise.bpm} BPM
              </button>
            </div>
          )}

          {/* Explicação da IA (Chat Bubble Style) */}
          <AnimatePresence>
            {aiExplanation && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="mt-6 flex flex-col gap-2"
              >
                <div className="flex items-center gap-3 ml-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md">
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Professor IA</p>
                </div>
                <div className="bg-white border border-slate-200/60 shadow-lg shadow-slate-200/20 rounded-[2rem] rounded-tl-sm p-6 relative">
                  <p className="text-slate-600 leading-relaxed whitespace-pre-wrap text-[15px]">
                    {aiExplanation.replace(/\*\*/g, '').replace(/\*/g, '')}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Botão de gerar explicação IA */}
          {!aiExplanation && (
            <Button
              onClick={handleGenerateDetails}
              disabled={detailsMutation.isPending}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
            >
              {detailsMutation.isPending ? (
                <><Loader2 size={16} className="mr-2 animate-spin" /> Gerando explicação...</>
              ) : (
                <><Sparkles size={16} className="mr-2" /> Gerar explicação detalhada com IA</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function StudentProgress() {
  const utils = trpc.useContext();
  const { data: activePlan, isLoading: isPlanLoading, refetch: refetchPlan } =
    trpc.progress.getActiveStudyPlan.useQuery();

  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [isTraining, setIsTraining] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [runningAt, setRunningAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  // ── CRONÔMETRO COM PAUSA/RETOMADA ──────────────────────────────────────────
  // Antes: ao sair da plataforma o tempo era PERDIDO (estado em memória + interval
  // morto no unmount). Agora: a sessão parcial é persistida em localStorage por
  // plano+dia; ao sair (aba oculta/navegação) o treino é PAUSADO automaticamente
  // e ao voltar o aluno retoma de onde parou, pausando/despausando à vontade.
  const sessionKey = useCallback((planId: number, day: number) => `mp_training_${planId}_${day}`, []);
  const totalSessionSeconds = sessionSeconds + (runningAt ? Math.floor((Date.now() - runningAt) / 1000) : 0);

  // Refs para acessar o tempo corrente em listeners/effects sem recriá-los
  const totalRef = useRef(0);
  totalRef.current = totalSessionSeconds;
  const runningRef = useRef<number | null>(null);
  runningRef.current = runningAt;
  const planIdRef = useRef<number | null>(null);
  planIdRef.current = activePlan?.id ?? null;
  const dayRef = useRef(0);
  dayRef.current = selectedDay;
  const prevPlanIdRef = useRef<number | null>(null);

  const persistSession = useCallback((planId: number | null, day: number, secs: number) => {
    if (planId == null) return;
    try {
      if (secs > 0) localStorage.setItem(sessionKey(planId, day), String(secs));
      else localStorage.removeItem(sessionKey(planId, day));
    } catch { /* storage indisponível */ }
  }, [sessionKey]);

  // Carrega sessão salva ao abrir a página/trocar de dia; persiste a anterior na troca
  useEffect(() => {
    const planId = activePlan?.id ?? null;
    const day = selectedDay;

    // Plano trocou → volta para o dia 1 (comportamento original)
    if (prevPlanIdRef.current !== null && prevPlanIdRef.current !== planId) {
      setSelectedDay(0);
    }
    prevPlanIdRef.current = planId;

    setIsTraining(false);
    setRunningAt(null);
    let restored = 0;
    if (planId != null) {
      try {
        const raw = localStorage.getItem(sessionKey(planId, day));
        restored = raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
      } catch { restored = 0; }
    }
    setSessionSeconds(restored);
    // Dia já concluído: limpa resíduo de sessão
    const completed = parseDaysCompleted(activePlan?.daysCompleted as string | undefined);
    if (planId != null && completed[day] && restored > 0) {
      try { localStorage.removeItem(sessionKey(planId, day)); } catch {}
      setSessionSeconds(0);
    }
    // Cleanup (troca de dia/plano ou saída da página): persiste a sessão do
    // plano/dia ANTERIOR usando os valores capturados no closure.
    return () => {
      if (planId != null && totalRef.current > 0) {
        persistSession(planId, day, totalRef.current);
      }
    };
  }, [activePlan?.id, selectedDay, sessionKey, persistSession]);

  // Tick de render (1s) enquanto o treino está rodando
  useEffect(() => {
    if (!isTraining) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isTraining]);

  // Persistência periódica (5s) — protege contra crash/fechamento forçado do app
  useEffect(() => {
    if (!isTraining) return;
    const interval = setInterval(() => {
      const planId = planIdRef.current;
      if (planId != null) persistSession(planId, dayRef.current, totalRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [isTraining, persistSession]);

  // PAUSA AUTOMÁTICA ao sair da plataforma (aba oculta / app em segundo plano)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && runningRef.current != null) {
        const total = totalRef.current;
        setSessionSeconds(total);
        setRunningAt(null);
        setIsTraining(false);
        persistSession(planIdRef.current, dayRef.current, total);
      }
    };
    const onPageHide = () => {
      if (planIdRef.current != null) persistSession(planIdRef.current, dayRef.current, totalRef.current);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [persistSession]);

  const handlePauseTraining = () => {
    setSessionSeconds(totalSessionSeconds);
    setRunningAt(null);
    setIsTraining(false);
    persistSession(activePlan?.id ?? null, selectedDay, totalSessionSeconds);
  };

  const handleResumeTraining = () => {
    setRunningAt(Date.now());
    setIsTraining(true);
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const toggleDayMutation = trpc.progress.toggleStudyPlanDay.useMutation({
    onMutate: async ({ dayIndex }) => {
      await utils.progress.getActiveStudyPlan.cancel();
      const prevData = utils.progress.getActiveStudyPlan.getData();
      
      if (prevData) {
        const parsedDays = JSON.parse((prevData.daysCompleted as string) || "[]");
        const days = Array.isArray(parsedDays) ? parsedDays.map(Boolean) : [];
        while (days.length <= dayIndex) days.push(false);

        const parsedTime = JSON.parse((prevData.daysTimeSpent as string) || "[]");
        const times = Array.isArray(parsedTime) ? parsedTime.map(Number) : [];
        while (times.length <= dayIndex) times.push(0);

        days[dayIndex] = true;
        times[dayIndex] = totalRef.current;

        utils.progress.getActiveStudyPlan.setData(undefined, {
          ...prevData,
          daysCompleted: JSON.stringify(days),
          daysTimeSpent: JSON.stringify(times)
        });
      }
      return { prevData };
    },
    onError: (err, newTodo, context) => {
      if (context?.prevData) {
        utils.progress.getActiveStudyPlan.setData(undefined, context.prevData);
      }
      toast.error("Erro ao registrar treino: " + err.message);
    },
    onSettled: () => {
      utils.progress.getActiveStudyPlan.invalidate();
    },
    onSuccess: (data) => {
      // Treino concluído: limpa a sessão parcial persistida
      if (activePlan) persistSession(activePlan.id, selectedDay, 0);
      setSessionSeconds(0);
      setRunningAt(null);
      if (data.allCompleted) toast.success("Parabéns! Você gabaritou a semana! 🎉 Seu professor foi notificado!");
      else toast.success("Treino do dia atualizado!");
    },
  });

  const planData = useMemo(() => parsePlanData(activePlan?.planText), [activePlan?.planText]);
  const daysCompleted = useMemo(
    () => parseDaysCompleted(activePlan?.daysCompleted as string | undefined),
    [activePlan?.daysCompleted]
  );
  const daysTimeSpent = useMemo(
    () => parseDaysTimeSpent((activePlan as any)?.daysTimeSpent),
    [(activePlan as any)?.daysTimeSpent]
  );

  if (isPlanLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const totalDays = planData?.days?.length || 1;
  const safeDayIndex = Math.min(selectedDay, totalDays - 1);
  const currentDayData = planData?.days[safeDayIndex];
  const isCurrentDayCompleted = planData ? Boolean(daysCompleted[safeDayIndex]) : false;
  const isPlanFinished = activePlan?.status === "inativo";

  const handleStartTraining = () => {
    if (isPlanFinished || isCurrentDayCompleted) return;
    // Continua de onde parou (sessão restaurada do localStorage) ou inicia do zero
    handleResumeTraining();
  };

  const handleFinishTraining = () => {
    if (isPlanFinished || toggleDayMutation.isPending || !activePlan) return;
    const total = totalSessionSeconds;
    setIsTraining(false);
    setRunningAt(null);
    setSessionSeconds(total);
    toggleDayMutation.mutate({ planId: activePlan.id, dayIndex: safeDayIndex, timeSpentSeconds: total });
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 font-sans text-slate-800 subtle-scrollbar overflow-x-hidden">
      {/* PRD 03 — Metrônomo flutuante disponível durante todo o estudo */}
      <FloatingMetronome />

      {/* Modal de Detalhes */}
      <ExerciseDetailModal
        exercise={selectedExercise}
        dayFocus={currentDayData?.focus?.title}
        onClose={() => setSelectedExercise(null)}
      />

      {/* Modal de Edição */}
      <EditStudyPlanModal
        planId={activePlan?.id || null}
        initialText={activePlan?.planText || ""}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />

      {/* Header Minimal */}
      <div className="pt-6 px-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full bg-white shadow-sm hover:bg-slate-100" onClick={() => window.history.back()}>
            <ChevronLeft size={20} className="text-slate-600" />
          </Button>
          <h1 className="text-lg font-black tracking-widest text-slate-800 uppercase">Meu Progresso</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="px-6 mt-6">
        {!activePlan || !planData ? (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-white border border-slate-100 rounded-3xl shadow-sm mt-4">
             <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center mb-4">
               <BookOpen size={28} className="text-indigo-400" />
             </div>
             <h3 className="text-sm font-black tracking-tight text-slate-800 mb-2 uppercase">Nenhum plano ativo</h3>
             <p className="text-[11px] text-slate-500 leading-relaxed mb-6">
               O seu professor ainda não gerou o seu plano de estudos para esta semana.
             </p>
          </div>
        ) : (
          <>
            {/* Title Plano Diario Ativo */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-4 bg-orange-500 rounded-full" />
                <h3 className="text-xs font-black text-slate-900 tracking-widest uppercase">Plano Diário Ativo</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] font-black tracking-widest text-indigo-600 uppercase hover:bg-indigo-50 rounded-md" onClick={() => setIsEditModalOpen(true)}>
                  Editar Plano
                </Button>
                <div className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-[9px] font-black tracking-widest uppercase">
                  PUBLICADO
                </div>
              </div>
            </div>

            {/* Target Card */}
            <div className="bg-indigo-50/50 rounded-3xl p-5 border border-indigo-100 flex items-start gap-4 mb-4 relative overflow-hidden shadow-sm">
               <Target className="absolute -right-4 -bottom-4 w-28 h-28 text-indigo-500/10 stroke-[1]" />
               <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shrink-0 shadow-md">
                  <Target size={18} className="text-white" />
               </div>
               <div className="relative z-10">
                  <h4 className="text-[10px] font-black text-indigo-600 tracking-widest uppercase mb-1">OBJETIVO DA SEMANA</h4>
                  <p className="text-[11px] text-slate-700 font-bold leading-relaxed">
                    {planData.weeklyGoal || "Treinar com foco e dedicação!"}
                  </p>
               </div>
            </div>

            {/* Dia Selector */}
            <div className="bg-white border border-slate-100 rounded-3xl p-4 flex items-center justify-between shadow-sm mb-4">
               <div className="flex items-center gap-2">
                 <CalendarDays size={16} className="text-indigo-600" />
                 <span className="text-[11px] font-black uppercase text-slate-800 tracking-widest">
                   {currentDayData?.dayName || `Dia ${safeDayIndex + 1}`}
                 </span>
               </div>
               
               <div className="flex items-center gap-1.5">
                 <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 shadow-sm" onClick={() => setSelectedDay(Math.max(0, selectedDay-1))}>
                   <ChevronLeft size={16} className="text-slate-600" />
                 </Button>
                 <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 shadow-sm" onClick={() => setSelectedDay(Math.min(planData.days.length-1, selectedDay+1))}>
                   <ChevronRight size={16} className="text-slate-600" />
                 </Button>
               </div>

               <div className="flex flex-col gap-1 w-24">
                 <div className="flex justify-between">
                   <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Progresso</span>
                   <span className="text-[9px] font-black text-indigo-600">{Math.round((daysCompleted.filter(Boolean).length / planData.days.length) * 100)}%</span>
                 </div>
                 <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.round((daysCompleted.filter(Boolean).length / planData.days.length) * 100)}%` }} />
                 </div>
               </div>
            </div>

            {/* Foco do dia */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm mb-6">
               <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-[1rem] bg-indigo-50 flex items-center justify-center shrink-0">
                       <Music size={20} className="text-indigo-600" />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">FOCO DO DIA</p>
                      <h2 className="text-sm font-black text-slate-800 leading-tight">
                        {currentDayData?.focus?.title || "Praticar"}
                      </h2>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 shrink-0 items-end">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                      <Timer size={10} /> 20 MIN
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                      <div className="flex gap-0.5 items-end h-2.5">
                        <div className="w-1 h-1.5 bg-emerald-500 rounded-full" />
                        <div className="w-1 h-2 bg-emerald-500 rounded-full" />
                        <div className="w-1 h-2.5 bg-emerald-300 rounded-full" />
                      </div>
                      AVANÇADO
                    </div>
                  </div>
               </div>
               
                {/* Cronômetro: rodando → PAUSAR + CONCLUIR; pausado com tempo → CONTINUAR + CONCLUIR */}
                {isTraining ? (
                  <div className="flex gap-2 w-full">
                    <Button
                      onClick={handlePauseTraining}
                      title="Pausar treino"
                      className="w-14 h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                    >
                      <Pause size={16} />
                    </Button>
                    <Button 
                      className="flex-1 h-12 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg bg-rose-500 hover:bg-rose-600 shadow-rose-500/20"
                      onClick={handleFinishTraining}
                      disabled={toggleDayMutation.isPending}
                    >
                      <Timer size={16} className="text-white" /> CONCLUIR TREINO ({formatTime(totalSessionSeconds)})
                    </Button>
                  </div>
                ) : isCurrentDayCompleted ? (
                  <Button 
                     className="w-full h-12 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                     disabled
                  >
                    <><CheckCircle2 size={16} className="fill-emerald-100" /> TREINO CONCLUÍDO ({formatTime(daysTimeSpent[safeDayIndex])})</>
                  </Button>
                ) : (
                  <div className={cn("flex gap-2 w-full", totalSessionSeconds > 0 && "flex-col sm:flex-row")}>
                    <Button 
                       className="flex-1 h-12 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
                       onClick={handleStartTraining}
                       disabled={toggleDayMutation.isPending}
                    >
                      <Play size={16} className="fill-white" /> {totalSessionSeconds > 0 ? `CONTINUAR TREINO (${formatTime(totalSessionSeconds)})` : "COMEÇAR TREINO"}
                    </Button>
                    {totalSessionSeconds > 0 && (
                      <Button
                        onClick={handleFinishTraining}
                        disabled={toggleDayMutation.isPending}
                        title="Concluir treino com o tempo acumulado"
                        className="h-12 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                      >
                        <CheckCircle2 size={15} /> CONCLUIR
                      </Button>
                    )}
                  </div>
                )}
            </div>
            
            {/* Exercícios List */}
            {currentDayData?.exercises && currentDayData.exercises.length > 0 && (
              <div className="mt-6 flex flex-col gap-3">
                 <h4 className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2">Exercícios de hoje</h4>
                 {currentDayData.exercises.map((ex, idx) => (
                    <div key={idx} className="bg-white border border-slate-100 rounded-3xl p-4 flex flex-col md:flex-row gap-4 shadow-sm items-start md:items-center">
                      <div className="flex gap-4 items-center flex-1">
                        <div className="w-12 h-12 bg-indigo-50 rounded-[1rem] flex items-center justify-center shrink-0">
                          <ExerciseIcon icon={ex.icon} title={ex.title} />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-sm text-slate-800">{ex.title}</h3>
                          {ex.subtitle && <p className="text-[11px] text-slate-500 font-medium mt-0.5">{ex.subtitle}</p>}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {ex.duration && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 bg-slate-50 w-fit px-2 py-0.5 rounded-md uppercase tracking-widest">
                                <Timer size={10} /> {ex.duration}
                              </div>
                            )}
                            {/* PRD 03 — BPM recomendado + início rápido do metrônomo (§46) */}
                            {typeof ex.bpm === "number" && ex.bpm > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  metronome.start(ex.bpm);
                                  toast.success(`Metrônomo iniciado em ${ex.bpm} BPM`);
                                }}
                                title={`Iniciar metrônomo em ${ex.bpm} BPM`}
                                className="flex items-center gap-1.5 text-[9px] font-black text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-md uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                              >
                                <Play size={10} className="fill-current" /> {ex.bpm} BPM
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        className="w-full md:w-auto h-10 text-[10px] text-indigo-600 hover:text-indigo-700 font-black hover:bg-indigo-50 rounded-xl uppercase tracking-widest"
                        onClick={() => setSelectedExercise(ex)}
                      >
                        Ver detalhes &gt;
                      </Button>
                    </div>
                 ))}
              </div>
            )}

            {/* Banner Importante */}
            {planData?.importantMessage && (
              <div className="mt-8 bg-violet-50/50 border border-violet-100 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex gap-4 items-center">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-violet-500 shadow-sm shrink-0">
                    <Award size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[11px] uppercase tracking-widest text-violet-900 mb-0.5">Importante</h4>
                    <p className="text-[11px] text-violet-700/80 font-medium">{planData.importantMessage}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
