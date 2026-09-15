import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  BookOpen,
  Music,
  Video,
  FileText,
  Bell,
  Download,
  Play,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  LayoutDashboard,
  ClipboardCheck,
  QrCode,
  Bot,
  Target,
  Guitar,
  Image as ImageIcon
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { RescheduleModal } from "@/components/RescheduleModal";
import { RankingCard } from "@/components/student/RankingCard";
import { EvaluationCard } from "@/components/student/EvaluationCard";
import { EarlySlotBanner } from "@/components/student/EarlySlotBanner";
import { RepositionCreditsCard } from "@/components/student/RepositionCreditsCard";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

// ─── Helpers do Plano Diário (mesma lógica de Progresso.tsx) ────────────────
interface PlanExercise { title: string; subtitle?: string; duration?: string; }
interface PlanDay { dayName: string; focus?: { title: string; description: string }; exercises?: PlanExercise[]; }

function parsePlan(planText: string | null | undefined): PlanDay[] | null {
  if (!planText) return null;
  try {
    let clean = planText.trim();
    if (clean.startsWith('```')) clean = clean.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(clean);
    if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;
    return parsed.days as PlanDay[];
  } catch { return null; }
}

function parseDaysCompleted(raw: any): boolean[] {
  if (!raw) return [false, false, false, false, false];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.map(Boolean);
    }
  } catch { /* plano corrompido */ }
  return [false, false, false, false, false];
}

// ─── Card de Seção (padrão do modelo: ícone + título + ação) ────────────────
function SectionCard({ icon, title, actionLabel, onAction, children, className }: {
  icon: React.ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-card/80 backdrop-blur-3xl rounded-[2rem] overflow-hidden h-full flex flex-col",
      className
    )}>
      <div className="flex items-center justify-between gap-3 p-5 md:p-6 pb-4 border-b border-border/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {icon}
          </div>
          <h3 className="text-base md:text-lg font-black tracking-tight text-foreground truncate">{title}</h3>
        </div>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-[10px] font-black text-primary uppercase tracking-[0.15em] hover:text-primary/70 transition-all shrink-0">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="p-5 md:p-6 flex-1">{children}</div>
    </div>
  );
}

// ─── Ring de progresso (SVG) ─────────────────────────────────────────────────
function ProgressRing({ percent, label, sub }: { percent: number; label: string; sub: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0 text-primary">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} className="text-muted/60" stroke="currentColor" strokeWidth="10" fill="none" />
        <circle
          cx="60" cy="60" r={R}
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C * clamped / 100} ${C}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl md:text-3xl font-black tracking-tighter text-foreground">{label}</span>
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{sub}</span>
      </div>
    </div>
  );
}

// ─── Alerta de Contrato próximo do fim (dashboard do aluno) ──────────────────
function ContractAlertBanner() {
  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const [, navigate] = useLocation();
  const { data: notifications = [] } = trpc.system.getNotifications.useQuery();

  const contractAlerts = notifications.filter(
    (n: any) => !n.read && !dismissed.has(n.id) && n.actionUrl === "/aluno/contratos"
  );
  if (contractAlerts.length === 0) return null;
  const latest = contractAlerts[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mb-6 relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-rose-500/15 border-2 border-orange-500/40 p-5 sm:p-6 shadow-lg shadow-orange-500/5 backdrop-blur-md"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-500/30">
            <FileText size={24} />
          </div>
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-orange-500 text-white">
              <Bell size={11} /> Contrato próximo do fim
            </span>
            <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
              {latest.title ?? "Seu contrato está próximo do fim"}
            </h3>
            <p className="text-xs text-muted-foreground font-medium max-w-xl">{latest.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
          <button
            type="button"
            onClick={() => setDismissed(prev => { const s = new Set(prev); s.add(latest.id); return s; })}
            className="px-4 py-2.5 rounded-xl border border-border/60 hover:bg-muted/50 text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            Dispensar
          </button>
          <button
            type="button"
            onClick={() => navigate("/aluno/contratos")}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
          >
            Ver meu contrato
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const { data: dashboard, isLoading } = trpc.studentPortal.getDashboard.useQuery();
  const { data: activePlan } = trpc.progress.getActiveStudyPlan.useQuery();

  // ── Plano diário: percentual, dia atual e estimativas ──────────────────────
  const planDays = useMemo(() => parseDaysCompleted(activePlan?.daysCompleted), [activePlan?.daysCompleted]);
  const planDayList = useMemo(() => parsePlan((activePlan as any)?.planText), [(activePlan as any)?.planText]);
  const planPercent = planDayList
    ? Math.round((planDays.filter(Boolean).length / planDayList.length) * 100)
    : Math.round((planDays.filter(Boolean).length / Math.max(1, planDays.length)) * 100);
  const currentDayIdx = planDays.findIndex((d) => !d) >= 0
    ? planDays.findIndex((d) => !d)
    : Math.max(0, (planDayList?.length || planDays.length || 5) - 1);
  const currentPlanDay = planDayList?.[currentDayIdx];
  const dayExerciseCount = currentPlanDay?.exercises?.length ?? 0;
  const estimatedMinutes = useMemo(() => {
    const total = (currentPlanDay?.exercises ?? []).reduce((acc, ex) => {
      const min = parseInt((ex.duration || "").replace(/[^0-9]/g, ""), 10);
      return Number.isNaN(min) ? acc : acc + min;
    }, 0);
    return total > 0 ? total : null;
  }, [currentPlanDay]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] || 'Aluno';
  const nextLesson = dashboard?.upcomingLessons?.[0] as any;
  const lessonEndTime = nextLesson
    ? format(new Date(new Date(nextLesson.scheduledAt).getTime() + (nextLesson.duration || 60) * 60000), "HH:mm")
    : null;
  const materialsCount = dashboard?.materialsCount ?? dashboard?.materials?.length ?? 0;

  const materialStyle = (category: string) =>
    category === 'pdf' ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white"
    : category === 'video' ? "bg-gradient-to-br from-pink-400 to-pink-600 text-white"
    : category === 'audio' ? "bg-gradient-to-br from-purple-400 to-purple-600 text-white"
    : category === 'imagem' ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
    : "bg-gradient-to-br from-slate-400 to-slate-600 text-white";

  const materialLabel = (category: string) =>
    category === 'pdf' ? "PDF" : category === 'video' ? "Vídeo" : category === 'audio' ? "Áudio" : category === 'imagem' ? "Imagem" : "Arquivo";

  const MaterialIcon = ({ category }: { category: string }) =>
    category === 'pdf' ? <FileText size={16} />
    : category === 'video' ? <Video size={16} />
    : category === 'audio' ? <Music size={16} />
    : category === 'imagem' ? <ImageIcon size={16} />
    : <FileText size={16} />;

  const goalStatusInfo = (status: string) =>
    status === 'concluido'
      ? { label: "Concluído", badge: <span className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0"><CheckCircle2 size={16} /></span> }
      : { label: "Em andamento", badge: <span className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0"><Clock size={14} /></span> };

  const completedGoals = (dashboard?.recentGoals as any[] || []).filter((g) => g.status === 'concluido');

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-10 max-w-[1600px] mx-auto"
    >
      {/* Banner de Antecipação Inteligente de Horário por Falta */}
      <EarlySlotBanner />

      {/* Alerta de Contrato próximo do fim (dashboard do aluno) */}
      <ContractAlertBanner />

      {/* Welcome Section - Hero Banner (card de boas-vindas atual, no topo) */}
      <motion.div variants={item} className="relative overflow-hidden rounded-[2.5rem] md:rounded-[3rem] bg-card text-card-foreground border border-border shadow-sm p-8 md:p-12 mb-2">
        {/* Abstract Glow Effects */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
             <h1 className="text-3xl md:text-4xl font-black tracking-tighter drop-shadow-sm mb-2 text-foreground">Olá, {firstName}!</h1>
             <p className="text-muted-foreground text-sm md:text-base font-medium max-w-xl">Continue evoluindo na sua jornada musical. Vamos tocar hoje?</p>
          </div>
          <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
             <button onClick={() => navigate('/aluno/scanner')} className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 w-full md:w-auto">
               <QrCode size={16} />
               <span>Marcar Presença</span>
             </button>
             <div className="flex items-center gap-4 bg-muted/50 backdrop-blur-md px-5 py-3 rounded-2xl border border-border w-full md:w-auto">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-yellow-500 to-amber-300 flex items-center justify-center text-yellow-950 shadow-[0_0_20px_rgba(234,179,8,0.4)]">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Nível Atual</p>
                  <p className="text-sm font-black text-foreground">{dashboard?.stats?.level ? dashboard.stats.level.charAt(0).toUpperCase() + dashboard.stats.level.slice(1) : "Iniciante"}</p>
                </div>
             </div>
          </div>
        </div>
      </motion.div>

      {/* 🏆 MEU RANKING (PRD_SISTEMA_RANKINGS §4) */}
      <motion.div variants={item}>
        <RankingCard />
      </motion.div>

      {/* ⭐ Avaliação de Professor (ciclo aberto — sigilosa para o admin) */}
      <motion.div variants={item}>
        <EvaluationCard />
      </motion.div>

      {/* ── Linha de Métricas (modelo: 4 métricas + SEU PROGRESSO) ──────────── */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 md:gap-6">
        {/* Aulas Feitas */}
        <div className="bg-card/40 backdrop-blur-xl rounded-[1.75rem] p-5 border border-border/10 shadow-xl shadow-primary/5 flex items-center gap-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] truncate">Aulas feitas</p>
            <p className="text-3xl font-black tracking-tighter text-foreground leading-none mt-1">{dashboard?.stats?.lessonsDone || 0}</p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-1 truncate">concluídas</p>
          </div>
        </div>

        {/* Atividades */}
        <div className="bg-card/40 backdrop-blur-xl rounded-[1.75rem] p-5 border border-border/10 shadow-xl shadow-primary/5 flex items-center gap-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <ClipboardCheck size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] truncate">Atividades</p>
            <p className="text-3xl font-black tracking-tighter text-foreground leading-none mt-1">{dashboard?.stats?.pendingExercises || 0}</p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-1 truncate">pendentes</p>
          </div>
        </div>

        {/* Materiais */}
        <div className="bg-card/40 backdrop-blur-xl rounded-[1.75rem] p-5 border border-border/10 shadow-xl shadow-primary/5 flex items-center gap-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] truncate">Materiais</p>
            <p className="text-3xl font-black tracking-tighter text-foreground leading-none mt-1">{materialsCount}</p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-1 truncate">disponíveis</p>
          </div>
        </div>

        {/* Avisos */}
        <div className="bg-card/40 backdrop-blur-xl rounded-[1.75rem] p-5 border border-border/10 shadow-xl shadow-primary/5 flex items-center gap-4 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
            <Bell size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] truncate">Avisos</p>
            <p className="text-3xl font-black tracking-tighter text-foreground leading-none mt-1">{dashboard?.stats?.unreadAnnouncements || 0}</p>
            <p className="text-[11px] text-muted-foreground font-semibold mt-1 truncate">novos</p>
          </div>
        </div>

        {/* SEU PROGRESSO (mais largo) */}
        <div className="bg-card/40 backdrop-blur-xl rounded-[1.75rem] p-5 border border-border/10 shadow-xl shadow-primary/5 flex flex-col justify-between sm:col-span-2 xl:col-span-2 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Seu progresso</p>
              <p className="text-lg md:text-xl font-black text-foreground mt-1.5 truncate">
                {dashboard?.stats?.level ? dashboard.stats.level.charAt(0).toUpperCase() + dashboard.stats.level.slice(1) : "Iniciante"}
              </p>
            </div>
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-300 flex items-center justify-center text-yellow-950 shadow-[0_0_20px_rgba(234,179,8,0.4)] shrink-0">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, dashboard?.stats?.frequency ?? 0))}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground font-medium mt-2.5 leading-snug">Continue assim! Cada prática te aproxima do próximo nível.</p>
          </div>
        </div>
      </motion.div>

      {/* ── Grid Principal (modelo: 3 colunas) ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">

        {/* ── Coluna 1: Próxima aula + Plano diário ── */}
        <div className="space-y-6 md:space-y-8">
          <motion.div variants={item} className="h-full">
            <SectionCard
              icon={<Calendar size={16} />}
              title="Próxima aula"
              actionLabel="Ver agenda"
              onAction={() => navigate('/aluno/aulas')}
            >
              {nextLesson ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                      <Guitar size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-black text-foreground truncate">{nextLesson.title || "Aula"}</p>
                      <p className="text-xs text-muted-foreground font-bold truncate mt-0.5">Prof. {nextLesson.teacherName || dashboard?.teacherName}</p>
                    </div>
                  </div>
                  <div className="space-y-3 px-1">
                    <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <Calendar size={15} className="text-primary shrink-0" />
                      <span className="capitalize">{format(new Date(nextLesson.scheduledAt), "EEEE, dd MMM yyyy", { locale: ptBR })}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <Clock size={15} className="text-primary shrink-0" />
                      <span>{format(new Date(nextLesson.scheduledAt), "HH:mm")} - {lessonEndTime}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 pt-2">
                    <button onClick={() => navigate('/aluno/aulas')} className="w-full py-3.5 bg-foreground text-background rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                      Ver Conteúdo da Aula
                    </button>
                    <button onClick={() => setRescheduleModalOpen(true)} className="w-full py-3.5 bg-primary/10 text-primary rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary/20 transition-all flex items-center justify-center gap-2">
                      <Bot size={14} /> Remarcar / Reposição
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4">
                    <Calendar size={24} />
                  </div>
                  <p className="text-sm font-black text-foreground">Nenhuma aula agendada</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1.5">Fale com seu professor para agendar a próxima.</p>
                </div>
              )}
            </SectionCard>
          </motion.div>

          {/* Plano diário */}
          <motion.div variants={item} className="h-full">
            <SectionCard
              icon={<BookOpen size={16} />}
              title="Plano diário"
              actionLabel="Ver plano"
              onAction={() => navigate('/aluno/progresso')}
            >
              {activePlan ? (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground font-semibold">Pratique hoje e mantenha sua constância!</p>
                  <div className="flex items-center gap-5 md:gap-7 flex-wrap">
                    <ProgressRing percent={planPercent} label={`${planPercent}%`} sub="do plano" />
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-lg font-black text-foreground leading-none">{planDays.filter(Boolean).length}/{planDayList?.length || 5}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold mt-1">dias concluídos</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-foreground leading-none">{dayExerciseCount}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold mt-1">exercícios hoje</p>
                      </div>
                      <div>
                        <p className="text-lg font-black text-foreground leading-none">{estimatedMinutes ? `${estimatedMinutes} min` : "—"}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold mt-1">tempo estimado</p>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => navigate('/aluno/progresso')} className="w-full py-4 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">
                    Continuar praticando
                  </button>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4">
                    <Target size={24} />
                  </div>
                  <p className="text-sm font-black text-foreground">Nenhum plano ativo</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1.5 mb-5">Seu professor pode montar um plano diário para você.</p>
                  <button onClick={() => navigate('/aluno/progresso')} className="px-6 py-3 rounded-2xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary/20 transition-all">
                    Abrir Plano Diário
                  </button>
                </div>
              )}
            </SectionCard>
          </motion.div>
        </div>

        {/* ── Coluna 2: Acervo musical + Exercícios recentes ── */}
        <div className="space-y-6 md:space-y-8">
          <motion.div variants={item} className="h-full">
            <RepositionCreditsCard />
          </motion.div>

          <motion.div variants={item} className="h-full">
            <SectionCard
              icon={<BookOpen size={16} />}
              title="Acervo musical"
              actionLabel="Ver todos"
              onAction={() => navigate('/aluno/materiais')}
            >
              {(dashboard?.materials?.length ?? 0) === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4">
                    <Music size={24} />
                  </div>
                  <p className="text-sm font-black text-foreground">Nenhum material ainda</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1.5">Seu professor enviará arquivos por aqui.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dashboard?.materials?.map((mat: any) => (
                    <div key={mat.id} className="flex items-center gap-3.5 p-3 rounded-2xl hover:bg-primary/5 transition-all group border border-transparent hover:border-primary/10">
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm", materialStyle(mat.category))}>
                        <MaterialIcon category={mat.category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{mat.fileName}</p>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-70">
                          {materialLabel(mat.category)} • {((mat.size || 0) / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <a
                        href={mat.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Baixar / abrir material"
                        className="w-9 h-9 rounded-full flex items-center justify-center bg-muted/60 text-muted-foreground hover:bg-primary hover:text-white transition-all shrink-0"
                      >
                        {mat.category === 'video' || mat.category === 'audio' ? <Play size={13} fill="currentColor" /> : <Download size={13} />}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>

          {/* Exercícios recentes */}
          <motion.div variants={item} className="h-full">
            <SectionCard
              icon={<ClipboardCheck size={16} />}
              title="Exercícios recentes"
              actionLabel="Ver todos"
              onAction={() => navigate('/aluno/exercicios')}
            >
              {(dashboard?.recentGoals as any[] || []).length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4">
                    <ClipboardCheck size={24} />
                  </div>
                  <p className="text-sm font-black text-foreground">Nenhum exercício ainda</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1.5">Seu professor enviará treinos por aqui.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(dashboard?.recentGoals as any[]).map((ex) => {
                    const info = goalStatusInfo(ex.status);
                    return (
                      <div key={ex.id} className="flex items-center justify-between gap-3 p-3.5 rounded-2xl hover:bg-primary/5 transition-all border border-transparent hover:border-primary/10">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground truncate">{ex.title}</p>
                          <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                            {info.label} • {format(new Date(ex.status === 'concluido' && ex.completedAt ? ex.completedAt : ex.createdAt), "dd MMM yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        {info.badge}
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </motion.div>
        </div>

        {/* ── Coluna 3: Mural de avisos + Missões + MusicPro ── */}
        <div className="space-y-6 md:space-y-8">
          <motion.div variants={item} className="h-full">
            <SectionCard
              icon={<Bell size={16} />}
              title="Mural de avisos"
              actionLabel="Ver todos"
              onAction={() => navigate('/aluno/avisos')}
            >
              {(dashboard?.announcements?.length ?? 0) === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground/30 mb-5">
                    <Bell size={28} />
                  </div>
                  <p className="text-sm font-black text-foreground">Sem novidades por aqui!</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1.5 max-w-[220px]">Assim que houver avisos, eles aparecerão aqui.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dashboard?.announcements?.slice(0, 4).map((aviso: any) => (
                    <div key={aviso.id} className="flex items-start gap-3.5 p-3.5 rounded-2xl hover:bg-primary/5 transition-all cursor-pointer border border-transparent hover:border-primary/10" onClick={() => navigate('/aluno/avisos')}>
                      <div className={cn(
                        "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                        aviso.important ? "bg-primary shadow-[0_0_10px_rgba(124,58,237,0.8)] animate-pulse" : "bg-muted-foreground/30"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground leading-snug">{aviso.title}</p>
                        <p className="text-[10px] text-muted-foreground font-semibold mt-1.5 uppercase tracking-widest">{aviso.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>

          {/* Missões */}
          <motion.div variants={item} className="h-full">
            <SectionCard icon={<Target size={16} />} title="Missões">
              <Tabs defaultValue="ativas" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-muted/40 p-1 rounded-2xl mb-5 h-10">
                  <TabsTrigger value="ativas" className="rounded-xl text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Ativas</TabsTrigger>
                  <TabsTrigger value="concluidas" className="rounded-xl text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Concluídas</TabsTrigger>
                  <TabsTrigger value="xp" className="rounded-xl text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">XP</TabsTrigger>
                </TabsList>

                <TabsContent value="ativas" className="space-y-2.5 mt-0">
                  {(dashboard?.pendingGoals?.length ?? 0) === 0 ? (
                    <div className="text-center py-8 bg-emerald-500/5 rounded-3xl border border-dashed border-emerald-500/20">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 size={20} />
                      </div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-relaxed">Missões Cumpridas!<br/>Você está em dia.</p>
                    </div>
                  ) : (
                    <>
                      {dashboard?.pendingGoals?.map((ex: any) => (
                        <div key={ex.id} className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-primary/5 border border-primary/10 hover:border-primary/25 transition-all">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Target size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-foreground leading-tight truncate">{ex.title}</p>
                            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-70">
                              Liberação: {format(new Date(ex.createdAt), "dd MMM yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => navigate('/aluno/exercicios')} className="w-full mt-3 py-3.5 text-[10px] font-black text-primary bg-primary/5 hover:bg-primary/10 rounded-2xl transition-colors uppercase tracking-[0.2em]">
                        Abrir Treinamentos
                      </button>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="concluidas" className="space-y-2.5 mt-0">
                  {completedGoals.length === 0 ? (
                    <div className="text-center py-8 bg-muted/10 rounded-3xl border border-dashed border-border/50">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Nenhuma missão concluída ainda</p>
                    </div>
                  ) : (
                    completedGoals.map((ex) => (
                      <div key={ex.id} className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                          <CheckCircle2 size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-foreground leading-tight truncate">{ex.title}</p>
                          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-70">
                            {ex.completedAt ? `Concluída em ${format(new Date(ex.completedAt), "dd MMM yyyy", { locale: ptBR })}` : "Concluída"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="xp" className="mt-0">
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Nível atual</p>
                        <p className="text-lg font-black text-foreground mt-1">
                          {dashboard?.stats?.level ? dashboard.stats.level.charAt(0).toUpperCase() + dashboard.stats.level.slice(1) : "Iniciante"}
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-300 flex items-center justify-center text-yellow-950 shadow-[0_0_20px_rgba(234,179,8,0.4)]">
                        <TrendingUp size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Frequência (3 meses)</span>
                        <span className="text-[11px] font-black text-primary">{dashboard?.stats?.frequency ?? 0}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, dashboard?.stats?.frequency ?? 0))}%` }} />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium leading-snug">Participe dos rankings e complete treinos para subir de nível!</p>
                  </div>
                </TabsContent>
              </Tabs>
            </SectionCard>
          </motion.div>

          {/* MusicPro Footer (modelo) */}
          <motion.div variants={item}>
            <div className="flex items-center gap-4 p-5 rounded-[1.75rem] bg-card/60 backdrop-blur-xl border border-border/10 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">MusicPro</p>
                <p className="text-xs text-muted-foreground font-medium leading-snug mt-0.5">Tudo aqui para você evoluir com organização e constância.</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {nextLesson && (
        <RescheduleModal
          open={rescheduleModalOpen}
          onOpenChange={setRescheduleModalOpen}
          lessonId={nextLesson.id}
          lessonTitle={nextLesson.title}
        />
      )}
    </motion.div>
  );
}
