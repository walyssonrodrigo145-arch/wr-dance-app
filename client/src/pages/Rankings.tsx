import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Trophy,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Users,
  X,
  Loader2,
  History as HistoryIcon,
  ShieldCheck,
  Crown,
  CalendarDays,
  Lock,
  Globe,
  Star,
  BarChart3,
  Flame,
  Target,
  Share2,
  Medal,
  ArrowRight,
  Filter,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { ChallengesTab } from "@/components/rankings/ChallengesTab";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const staggerItem = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  agendado: { label: "Agendado", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  ativo: { label: "Ativo", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  encerrado: { label: "Encerrado", cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  cancelado: { label: "Cancelado", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

const PERIOD_PRESETS = [
  { id: "semanal", label: "1 Semana", days: 7 },
  { id: "mensal", label: "1 Mês", days: 30 },
  { id: "bimestral", label: "2 Meses", days: 60 },
  { id: "trimestral", label: "3 Meses", days: 90 },
  { id: "semestral", label: "6 Meses", days: 180 },
  { id: "anual", label: "1 Ano", days: 365 },
];

const LEVELS = [
  { id: "iniciante", label: "Iniciante" },
  { id: "intermediario", label: "Intermediário" },
  { id: "avancado", label: "Avançado" },
];

const WEIGHT_FIELDS = [
  { key: "presenca", label: "Presença" },
  { key: "atividades", label: "Atividades" },
  { key: "pratica", label: "Prática" },
  { key: "evolucao", label: "Evolução" },
  { key: "desafios", label: "Desafios" },
] as const;

function formatCompact(n: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

interface EditorState {
  id?: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  participantRule: "todos" | "instrumento" | "nivel" | "manual";
  instrumentId: string;
  level: string;
  participantStudentIds: number[];
  visibility: "publico" | "privado";
  showFullName: boolean;
  showAvatar: boolean;
  showScores: boolean;
  showEvolution: boolean;
  showParticipants: boolean;
  privateTopRange: number;
  weights: Record<string, number>;
}

const emptyEditor = (): EditorState => ({
  name: "",
  description: "",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd"),
  participantRule: "todos",
  instrumentId: "",
  level: "",
  participantStudentIds: [],
  visibility: "publico",
  showFullName: false,
  showAvatar: true,
  showScores: true,
  showEvolution: true,
  showParticipants: true,
  privateTopRange: 10,
  weights: { presenca: 20, atividades: 30, pratica: 25, evolucao: 15, desafios: 10 },
});

// ─── Card de métrica (mesmas proporções do MetricCard do Dashboard admin) ──────
function StatCard({ icon: Icon, color, value, label, delta, isLoading }: {
  icon: any; color: string; value: string; label: string; delta?: string; isLoading?: boolean;
}) {
  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 sm:p-5 border border-white/10 shadow-2xl shadow-primary/5 hover:shadow-primary/15 hover:-translate-y-1 transition-all duration-300 group cursor-default min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 shadow-sm", color.replace("text-", "bg-") + "/10")}>
          <Icon size={20} className={color} />
        </div>
        <div className="min-w-0">
          {isLoading ? (
            <div className="h-6 w-14 rounded-lg bg-muted animate-pulse mb-1" />
          ) : (
            <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate leading-none">{value}</h3>
          )}
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground truncate mt-1">{label}</p>
          {delta && (
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mt-0.5">+{delta} este mês</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Rankings() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("todos");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [auditStudentId, setAuditStudentId] = useState<number | null>(null);
  const [ajustePoints, setAjustePoints] = useState("");
  const [ajusteReason, setAjusteReason] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [encerrarId, setEncerrarId] = useState<number | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  // Abas do módulo: Competições (rankings) | Desafios (§55)
  const [moduleTab, setModuleTab] = useState<"competicoes" | "desafios">("competicoes");

  // Filtros do Top 5 — todos funcionais (Período/Turma/Instrumento)
  const [topMode, setTopMode] = useState<"geral" | number>("geral");
  const [periodFilter, setPeriodFilter] = useState<"mes" | "trimestre" | "semestre" | "todos">("todos");
  const [turmaFilter, setTurmaFilter] = useState("todas");
  const [instrumentFilter, setInstrumentFilter] = useState("todos");
  const [applied, setApplied] = useState<{ period: "mes" | "trimestre" | "semestre" | "todos"; turma: string; instrumentId: string }>({ period: "todos", turma: "todas", instrumentId: "todos" });
  const [medalTitle, setMedalTitle] = useState("");
  const [medalDesc, setMedalDesc] = useState("");

  // Queries
  const { data: rankings = [], isLoading } = trpc.rankings.list.useQuery({ status: statusFilter as any });
  const { data: activeRankings = [], isLoading: isLoadingActive } = trpc.rankings.list.useQuery({ status: "ativo" });
  const { data: stats, isLoading: statsLoading } = trpc.rankings.stats.useQuery();
  const { data: activity = [] } = trpc.rankings.recentActivity.useQuery();
  const { data: instrumentsList = [] } = trpc.instruments.list.useQuery();
  const { data: studentsList = [] } = trpc.rankings.listStudents.useQuery();
  const { data: historic = [] } = trpc.rankings.historic.useQuery();
  const generalQuery = trpc.rankings.generalStandings.useQuery(
    {
      period: applied.period,
      turma: applied.turma !== "todas" ? applied.turma : undefined,
      instrumentId: applied.instrumentId !== "todos" ? Number(applied.instrumentId) : null,
    },
    { enabled: topMode === "geral" }
  );
  const singleQuery = trpc.rankings.standings.useQuery(
    { id: topMode as number },
    { enabled: typeof topMode === "number" }
  );
  const { data: detail, isLoading: detailLoading } = trpc.rankings.standings.useQuery(
    { id: detailId! },
    { enabled: !!detailId }
  );
  const { data: audit } = trpc.rankings.auditoria.useQuery(
    { rankingId: detailId!, studentId: auditStudentId! },
    { enabled: !!detailId && !!auditStudentId }
  );

  const turmas = (generalQuery.data?.turmas as string[]) || [];

  const top5Rows = useMemo(() => {
    if (topMode === "geral") return (generalQuery.data?.rows as any[]) || [];
    return ((singleQuery.data?.standings as any[]) || []).slice(0, 5);
  }, [topMode, generalQuery.data, singleQuery.data]);
  const top5Loading = topMode === "geral" ? generalQuery.isLoading : singleQuery.isLoading;

  const maxScore = useMemo(() => Math.max(1, ...top5Rows.map((r) => r.total || 0)), [top5Rows]);

  // Subtítulo da linha: "Instrumento • Nível" quando conhecido
  const studentSubtitle = (row: any) => {
    const st = (studentsList as any[]).find((s) => s.id === row.studentId);
    const instName = st?.instrumentId ? ((instrumentsList as any[]).find((i) => i.id === st.instrumentId)?.name ?? null) : null;
    const levelLabel = st?.level ? st.level.charAt(0).toUpperCase() + st.level.slice(1) : null;
    if (instName || levelLabel) return [instName, levelLabel].filter(Boolean).join(" • ");
    if (row.breakdown && typeof row.breakdown.presenca === "object") {
      return `${row.breakdown.presenca.raw} aulas · ${row.breakdown.atividades.raw} metas · ${row.breakdown.pratica.raw}min`;
    }
    return `${row.breakdown?.presenca ?? 0} aulas · ${row.breakdown?.atividades ?? 0} metas · ${row.breakdown?.pratica ?? 0}min`;
  };

  // Mutations
  const createMutation = trpc.rankings.create.useMutation({
    onSuccess: () => {
      toast.success("Ranking criado com sucesso!");
      utils.rankings.list.invalidate();
      utils.rankings.stats.invalidate();
      setEditorOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.rankings.update.useMutation({
    onSuccess: () => {
      toast.success("Ranking atualizado!");
      utils.rankings.list.invalidate();
      utils.rankings.standings.invalidate();
      utils.rankings.stats.invalidate();
      setEditorOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.rankings.delete.useMutation({
    onSuccess: (_, vars) => {
      toast.success("Ranking removido!");
      // FIX TOP 5 ZERADO: invalida TODAS as queries dependentes (antes a
      // classificação continuava exibindo dados em cache do ranking excluído)
      utils.rankings.list.invalidate();
      utils.rankings.stats.invalidate();
      utils.rankings.standings.invalidate();
      utils.rankings.generalStandings.invalidate();
      utils.rankings.recentActivity.invalidate();
      utils.rankings.historic.invalidate();
      if (topMode === vars.id) setTopMode("geral");
      if (detailId === vars.id) setDetailId(null);
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const encerrarMutation = trpc.rankings.encerrar.useMutation({
    onSuccess: () => {
      toast.success("Ranking encerrado! Resultado calculado e congelado.");
      utils.rankings.list.invalidate();
      utils.rankings.standings.invalidate();
      utils.rankings.historic.invalidate();
      utils.rankings.stats.invalidate();
      utils.rankings.recentActivity.invalidate();
      setEncerrarId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const ajusteMutation = trpc.rankings.ajuste.useMutation({
    onSuccess: () => {
      toast.success("Ajuste registrado com trilha de auditoria!");
      utils.rankings.standings.invalidate();
      utils.rankings.generalStandings.invalidate();
      utils.rankings.auditoria.invalidate();
      setAjustePoints("");
      setAjusteReason("");
    },
    onError: (e) => toast.error(e.message),
  });
  const medalMutation = trpc.rankings.concederMedalha.useMutation({
    onSuccess: () => {
      toast.success("Medalha virtual concedida! 🏅");
      utils.rankings.auditoria.invalidate();
      utils.rankings.recentActivity.invalidate();
      setMedalTitle("");
      setMedalDesc("");
    },
    onError: (e) => toast.error(e.message),
  });

  const weightTotal = useMemo(
    () => Object.values(editor.weights).reduce((a, b) => a + (Number(b) || 0), 0),
    [editor.weights]
  );

  const openCreate = () => {
    setEditor(emptyEditor());
    setEditorOpen(true);
  };

  const openEdit = (r: any) => {
    setEditor({
      id: r.id,
      name: r.name,
      description: r.description || "",
      startDate: format(new Date(r.startDate), "yyyy-MM-dd"),
      endDate: format(new Date(r.endDate), "yyyy-MM-dd"),
      participantRule: r.participantRule,
      instrumentId: r.instrumentId ? String(r.instrumentId) : "",
      level: r.level || "",
      participantStudentIds: [],
      visibility: r.visibility,
      showFullName: false,
      showAvatar: true,
      showScores: true,
      showEvolution: true,
      showParticipants: true,
      privateTopRange: 10,
      weights: { presenca: 20, atividades: 30, pratica: 25, evolucao: 15, desafios: 10 },
    });
    setEditorOpen(true);
  };

  const applyPreset = (days: number) => {
    setEditor((prev) => ({
      ...prev,
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(new Date(Date.now() + days * 86400000), "yyyy-MM-dd"),
    }));
  };

  const handleSave = () => {
    if (editor.participantRule === "manual" && editor.participantStudentIds.length === 0) {
      toast.error("Selecione ao menos um aluno na participação manual.");
      return;
    }
    const payload = {
      name: editor.name,
      description: editor.description || undefined,
      visibility: editor.visibility,
      privacySettings: {
        showFullName: editor.showFullName,
        showAvatar: editor.showAvatar,
        showScores: editor.showScores,
        showEvolution: editor.showEvolution,
        showParticipants: editor.showParticipants,
        privateTopRange: editor.privateTopRange,
      },
      criteriaWeights: editor.weights as any,
      participantRule: editor.participantRule,
      instrumentId: editor.participantRule === "instrumento" && editor.instrumentId ? Number(editor.instrumentId) : null,
      level: editor.participantRule === "nivel" ? editor.level : null,
      participantStudentIds: editor.participantRule === "manual" ? editor.participantStudentIds : [],
      startDate: new Date(`${editor.startDate}T00:00:00`).toISOString(),
      endDate: new Date(`${editor.endDate}T23:59:59`).toISOString(),
    };
    if (editor.id) {
      updateMutation.mutate({ id: editor.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rankings MusicPro", text: "Confira os rankings da nossa escola!", url: window.location.origin + "/rankings" });
      } else {
        await navigator.clipboard.writeText(window.location.origin + "/rankings");
        toast.success("Link copiado para a área de transferência!");
      }
    } catch { /* usuário cancelou */ }
  };

  const medalStyle = (position: number) => {
    if (position === 1) return { cls: "from-amber-400/20 to-amber-500/5 border-amber-400/40" };
    if (position === 2) return { cls: "from-slate-300/20 to-slate-400/5 border-slate-300/40" };
    if (position === 3) return { cls: "from-orange-400/20 to-orange-500/5 border-orange-400/40" };
    return { cls: "from-muted/40 to-transparent border-border/40" };
  };

  const detailRanking = detail?.ranking as any;
  const allStandings = (detail?.standings as any[]) || [];
  const standings = top5Rows;

  const activityIcon = (type: string) => {
    if (type === "vencedor") return { icon: Trophy, cls: "bg-amber-500/10 text-amber-600" };
    if (type === "conquista") return { icon: Medal, cls: "bg-emerald-500/10 text-emerald-600" };
    return { icon: Sparkles, cls: "bg-primary/10 text-primary" };
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-10 max-w-[1400px] mx-auto animate-in fade-in duration-300">

      {/* ═══ HERO (mockup: badge + título + ações) ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] bg-card text-card-foreground shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-4 md:gap-5 min-w-0">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 text-white flex items-center justify-center shadow-xl shadow-primary/30 shrink-0">
            <Trophy size={26} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">Rankings de Alunos</h1>
            <p className="text-muted-foreground font-medium text-xs md:text-sm mt-1 truncate">Reconheça o esforço e celebre a evolução dos seus alunos.</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <Button
            onClick={openCreate}
            className="flex-1 md:flex-none h-12 px-6 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={14} className="mr-2" /> Novo Ranking
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            className="flex-1 md:flex-none h-12 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest border-border/60"
          >
            <HistoryIcon size={14} className="mr-2" /> Histórico
          </Button>
        </div>
      </div>

      {/* ═══ ABAS: Competições | Desafios (§55) ═══ */}
      <div className="flex items-center gap-2 p-1.5 bg-card/60 backdrop-blur-md rounded-2xl border border-border/10 w-fit">
        {[
          { id: "competicoes", label: "Competições", icon: Trophy },
          { id: "desafios", label: "Desafios", icon: Target },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setModuleTab(t.id as any)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              moduleTab === t.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {moduleTab === "desafios" ? (
        <ChallengesTab />
      ) : showHistory ? (
        /* ═══ HISTÓRICO (§26) ═══ */
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
          <motion.div variants={staggerItem} className="flex items-center justify-between px-1">
            <h2 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
              <HistoryIcon size={18} className="text-primary" /> Histórico de Vencedores
            </h2>
            <Button variant="outline" onClick={() => setShowHistory(false)} className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest">
              <X size={13} className="mr-1.5" /> Fechar
            </Button>
          </motion.div>
          {historic.length === 0 ? (
            <div className="py-20 text-center bg-card rounded-[2rem] border border-dashed border-border">
              <Trophy className="mx-auto text-muted-foreground/20 mb-4" size={48} />
              <p className="text-sm font-bold text-muted-foreground">Nenhum ranking encerrado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(historic as any[]).map((h) => (
                <motion.div key={h.id} variants={staggerItem}>
                  <Card className="rounded-[1.5rem] border-border/50 shadow-sm hover:shadow-lg transition-all overflow-hidden h-full">
                    <CardContent className="p-5 md:p-6 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-black text-base tracking-tight truncate">🏆 {h.name}</h3>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">
                          {format(new Date(h.startDate), "dd/MM/yy")} → {format(new Date(h.endDate), "dd/MM/yy")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(h.history?.podium || []).map((p: any) => (
                          <span key={p.position} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-border/50 text-xs font-bold">
                            {p.position === 1 ? "🥇" : p.position === 2 ? "🥈" : "🥉"} {p.name} · {p.score} pts
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        <Users size={10} className="inline mr-1" /> {h.history?.totalParticipants ?? h.participantCount} participantes
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      ) : (
        <>
          {/* ═══ CARDS DE MÉTRICAS (mockup) ═══ */}
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
            <motion.div variants={staggerItem}>
              <StatCard icon={Users} color="text-purple-600" value={String(stats?.alunosParticipando ?? 0)} label="Alunos participando" delta={stats?.alunosDelta ? String(stats.alunosDelta) : undefined} isLoading={statsLoading} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard icon={Star} color="text-amber-500" value={formatCompact(stats?.pontosDistribuidos ?? 0)} label="Pontos distribuídos" delta={stats?.pontosDelta ? formatCompact(stats.pontosDelta) : undefined} isLoading={statsLoading} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard icon={BarChart3} color="text-emerald-600" value={String(stats?.competicoesRealizadas ?? 0)} label="Competições realizadas" delta={stats?.competicoesDelta ? String(stats.competicoesDelta) : undefined} isLoading={statsLoading} />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard icon={Flame} color="text-blue-600" value={`${stats?.engajamento ?? 0}%`} label="Engajamento médio" delta={stats?.engajamentoDelta ? `${stats.engajamentoDelta}%` : undefined} isLoading={statsLoading} />
            </motion.div>
          </motion.div>

          {/* ═══ CONTEÚDO PRINCIPAL: Top 5 + Sidebar ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 items-start">
            {/* TOP 5 (mockup) */}
            <motion.div variants={staggerItem} initial="hidden" animate="show" className="lg:col-span-2 min-w-0">
              <Card className="border-none shadow-2xl shadow-primary/5 bg-card/60 backdrop-blur-xl rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
                <CardContent className="p-5 md:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
                    <h2 className="text-sm md:text-base font-black uppercase tracking-widest flex items-center gap-2">
                      <Trophy size={16} className="text-amber-500" /> Top 5 — Ranking Geral
                    </h2>
                    <select
                      value={String(topMode)}
                      onChange={(e) => setTopMode(e.target.value === "geral" ? "geral" : Number(e.target.value))}
                      className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 max-w-[200px] truncate"
                    >
                      <option value="geral">🏆 Ranking Geral</option>
                      {(activeRankings as any[]).map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {top5Loading || isLoadingActive ? (
                    <div className="space-y-2.5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-[68px] rounded-2xl bg-muted/40 animate-pulse" />
                      ))}
                    </div>
                  ) : standings.length === 0 ? (
                    <div className="py-14 text-center">
                      <Trophy className="mx-auto text-muted-foreground/20 mb-3" size={40} />
                      <p className="text-sm font-bold text-muted-foreground px-4">
                        {(activeRankings as any[]).length === 0
                          ? "Nenhum ranking ativo. Crie uma competição para engajar seus alunos!"
                          : "Nenhum aluno pontuou no período selecionado."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {standings.map((row: any) => {
                        const isTop3 = row.position <= 3;
                        const pct = Math.max(4, Math.round(((row.total || 0) / maxScore) * 100));
                        const medalCls = row.position === 1 ? "bg-amber-400 text-amber-950" : row.position === 2 ? "bg-slate-300 text-slate-700" : row.position === 3 ? "bg-orange-400 text-orange-950" : "bg-muted text-muted-foreground";
                        return (
                          <div key={row.studentId} className={cn(
                            "flex items-center gap-3 sm:gap-4 p-3 sm:p-3.5 rounded-2xl border bg-gradient-to-r transition-all hover:shadow-md hover:-translate-y-0.5 min-w-0",
                            medalStyle(row.position).cls
                          )}>
                            {isTop3 ? (
                              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-sm", medalCls)}>
                                {row.position}
                              </div>
                            ) : (
                              <span className="w-9 text-center font-black text-sm text-muted-foreground shrink-0">{row.position}</span>
                            )}

                            {row.avatar ? (
                              <img src={row.avatar} alt={row.name} className="w-10 h-10 rounded-full object-cover border border-border shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black uppercase border border-primary/20 shrink-0">
                                {row.name.split(" ")[0].slice(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs sm:text-sm font-black text-foreground truncate leading-tight">
                                {row.name}
                                {row.shared && <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-muted-foreground align-middle">empate</span>}
                              </p>
                              <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground truncate">
                                {studentSubtitle(row)}
                              </p>
                              <div className="h-1.5 rounded-full bg-muted/70 mt-2 overflow-hidden max-w-[220px]">
                                <div className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm sm:text-base font-black text-foreground tabular-nums">{row.total}<span className="text-[9px] font-bold text-muted-foreground ml-1">pts</span></span>
                              {isTop3 && <Crown size={15} className={row.position === 1 ? "text-amber-500" : row.position === 2 ? "text-slate-400" : "text-orange-400"} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {typeof topMode === "number" && standings.length > 0 && (
                    <div className="flex justify-center mt-5 md:mt-6">
                      <Button
                        variant="outline"
                        onClick={() => setDetailId(topMode as number)}
                        className="h-11 px-6 rounded-2xl border-primary/20 text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest"
                      >
                        Ver ranking completo <ArrowRight size={13} className="ml-2" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* SIDEBAR: Filtros + Atividades */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-5 md:space-y-6 min-w-0">
              {/* FILTROS */}
              <motion.div variants={staggerItem}>
                <Card className="border-none shadow-2xl shadow-primary/5 bg-card/60 backdrop-blur-xl rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Filter size={13} className="text-primary" /> Filtros
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-bold text-muted-foreground shrink-0">Período</Label>
                        <select
                          value={periodFilter}
                          onChange={(e) => {
                            const v = e.target.value as any;
                            setPeriodFilter(v);
                            setTopMode("geral"); // período se aplica ao Ranking Geral
                          }}
                          className="h-10 flex-1 min-w-0 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 max-w-[190px]"
                        >
                          <option value="mes">Este mês</option>
                          <option value="trimestre">Últimos 3 meses</option>
                          <option value="semestre">Últimos 6 meses</option>
                          <option value="todos">Todo o período</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-bold text-muted-foreground shrink-0">Turma</Label>
                        <select
                          value={turmaFilter}
                          onChange={(e) => {
                            setTurmaFilter(e.target.value);
                            setTopMode("geral");
                          }}
                          className="h-10 flex-1 min-w-0 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 max-w-[190px]"
                        >
                          <option value="todas">Todas as turmas</option>
                          {turmas.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-bold text-muted-foreground shrink-0">Instrumento</Label>
                        <select
                          value={instrumentFilter}
                          onChange={(e) => setInstrumentFilter(e.target.value)}
                          className="h-10 flex-1 min-w-0 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 max-w-[190px]"
                        >
                          <option value="todos">Todos os instrumentos</option>
                          {(instrumentsList as any[]).map((i) => (
                            <option key={i.id} value={String(i.id)}>{i.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setApplied({ period: periodFilter, turma: turmaFilter, instrumentId: instrumentFilter });
                        setTopMode("geral");
                        toast.success("Filtros aplicados!");
                      }}
                      className="w-full h-12 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Filter size={13} className="mr-2" /> Filtrar Resultados
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* ATIVIDADES RECENTES */}
              <motion.div variants={staggerItem}>
                <Card className="border-none shadow-2xl shadow-primary/5 bg-card/60 backdrop-blur-xl rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
                  <CardContent className="p-5 md:p-6 space-y-4">
                    <h3 className="text-[11px] font-black uppercase tracking-widest">Atividades Recentes</h3>
                    {(activity as any[]).length === 0 ? (
                      <p className="text-xs font-bold text-muted-foreground py-4 text-center">Sem atividades ainda. Crie um ranking para começar!</p>
                    ) : (
                      <div className="space-y-3.5">
                        {(activity as any[]).map((ev, idx) => {
                          const ic = activityIcon(ev.type);
                          return (
                            <div key={idx} className="flex items-start gap-3">
                              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", ic.cls)}>
                                <ic.icon size={15} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-foreground leading-snug">{ev.title}</p>
                                <p className="text-[10px] font-medium text-muted-foreground truncate">{ev.description}</p>
                              </div>
                              <span className="text-[9px] font-bold text-muted-foreground shrink-0 whitespace-nowrap">{relativeTime(ev.at)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setShowHistory(true)}
                      className="w-full h-11 rounded-2xl border-border/60 text-[10px] font-black uppercase tracking-widest"
                    >
                      Ver todas atividades <ArrowRight size={13} className="ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>

          {/* ═══ CARDS INFORMATIVOS (mockup) ═══ */}
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <motion.div variants={staggerItem}>
              <div className="h-full bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/15 rounded-[1.5rem] p-5 md:p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
                <Target size={20} className="text-primary mb-3" />
                <h4 className="text-sm font-black tracking-tight mb-1.5">Como funciona?</h4>
                <p className="text-[11px] font-medium text-muted-foreground leading-relaxed mb-4">Alunos ganham pontos ao cumprir desafios, frequentar aulas e evoluir nos estudos.</p>
                <button onClick={() => setHowItWorksOpen(true)} className="text-[10px] font-black uppercase tracking-widest text-primary hover:gap-3 flex items-center gap-2 transition-all">
                  Saiba mais <ArrowRight size={12} />
                </button>
              </div>
            </motion.div>
            <motion.div variants={staggerItem}>
              <div className="h-full bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/15 rounded-[1.5rem] p-5 md:p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300">
                <Star size={20} className="text-emerald-600 mb-3" />
                <h4 className="text-sm font-black tracking-tight mb-1.5">Dê recompensas</h4>
                <p className="text-[11px] font-medium text-muted-foreground leading-relaxed mb-4">Valorize os melhores alunos com certificados, medalhas e benefícios exclusivos.</p>
                <button onClick={() => setRewardsOpen(true)} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:gap-3 flex items-center gap-2 transition-all">
                  Criar recompensa <ArrowRight size={12} />
                </button>
              </div>
            </motion.div>
            <motion.div variants={staggerItem}>
              <div className="h-full bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/15 rounded-[1.5rem] p-5 md:p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300">
                <Share2 size={20} className="text-blue-600 mb-3" />
                <h4 className="text-sm font-black tracking-tight mb-1.5">Compartilhe conquistas</h4>
                <p className="text-[11px] font-medium text-muted-foreground leading-relaxed mb-4">Divulgue os rankings nas redes sociais e motive ainda mais seus alunos.</p>
                <button onClick={handleShare} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:gap-3 flex items-center gap-2 transition-all">
                  Compartilhar <ArrowRight size={12} />
                </button>
              </div>
            </motion.div>
          </motion.div>

          {/* ═══ MEUS RANKINGS (gestão) ═══ */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" /> Meus Rankings
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {["todos", "ativo", "agendado", "rascunho", "encerrado"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border",
                      statusFilter === s ? "bg-primary text-white border-primary shadow-lg" : "bg-card text-muted-foreground border-border hover:border-primary/30"
                    )}
                  >
                    {s === "todos" ? "Todos" : STATUS_CONFIG[s]?.label}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={30} className="animate-spin text-primary" /></div>
            ) : rankings.length === 0 ? (
              <div className="py-20 text-center bg-card rounded-[2rem] border border-dashed border-border">
                <Trophy className="mx-auto text-muted-foreground/20 mb-4" size={52} />
                <h3 className="text-lg font-black">Nenhum ranking por aqui</h3>
                <p className="text-sm text-muted-foreground mt-1">Crie sua primeira competição para engajar seus alunos.</p>
                <Button onClick={openCreate} className="mt-6 h-12 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">
                  <Plus size={14} className="mr-2" /> Criar Ranking
                </Button>
              </div>
            ) : (
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(rankings as any[]).map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.rascunho;
                  return (
                    <motion.div key={r.id} variants={staggerItem}>
                      <Card className="rounded-[1.5rem] border-border/50 shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full">
                        <CardContent className="p-5 md:p-6 space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-black text-base tracking-tight leading-tight min-w-0 truncate">{r.name}</h3>
                            <span className={cn("text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0", cfg.cls)}>
                              {cfg.label}
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs font-bold text-muted-foreground">
                            <p className="flex items-center gap-2">
                              <CalendarDays size={13} className="text-primary" />
                              {format(new Date(r.startDate), "dd MMM", { locale: ptBR })} → {format(new Date(r.endDate), "dd MMM yyyy", { locale: ptBR })}
                            </p>
                            <p className="flex items-center gap-2">
                              <Users size={13} className="text-primary" /> {r.participantCount} participantes
                              {r.visibility === "privado" ? (
                                <span className="flex items-center gap-1 ml-2"><Lock size={11} /> Privado</span>
                              ) : (
                                <span className="flex items-center gap-1 ml-2"><Globe size={11} /> Público</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              onClick={() => setDetailId(r.id)}
                              className="flex-1 h-10 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border-none text-[10px] font-black uppercase tracking-widest"
                            >
                              <Eye size={13} className="mr-1.5" /> Classificação
                            </Button>
                            {r.status !== "encerrado" && r.status !== "cancelado" && (
                              <Button size="icon" variant="outline" onClick={() => openEdit(r)} title="Editar" className="h-10 w-10 rounded-xl">
                                <Pencil size={14} />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" onClick={() => setDeleteId(r.id)} title="Excluir" className="h-10 w-10 rounded-xl text-rose-600 hover:bg-rose-500/10">
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </>
      )}

      {/* ═══ DIALOG: EDITOR (scroll invisível) ═══ */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-black tracking-tight">
              {editor.id ? "Editar Ranking" : "Novo Ranking"}
            </DialogTitle>
            <DialogDescription>Configure período, participantes, visibilidade e critérios de pontuação.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome do Ranking</Label>
              <Input value={editor.name} onChange={(e) => setEditor((p) => ({ ...p, name: e.target.value }))} placeholder="Ex.: Aluno Destaque de Setembro" className="h-12 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição (opcional)</Label>
              <Input value={editor.description} onChange={(e) => setEditor((p) => ({ ...p, description: e.target.value }))} placeholder="Objetivo da competição" className="h-12 rounded-2xl" />
            </div>

            {/* Período (§10) */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período</Label>
              <div className="flex flex-wrap gap-2">
                {PERIOD_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.days)}
                    className="px-3.5 py-2 rounded-xl bg-primary/5 border border-primary/15 text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 hover:border-primary/30 transition-all"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-[9px] font-black uppercase text-muted-foreground/60">Início</Label>
                  <Input type="date" value={editor.startDate} onChange={(e) => setEditor((p) => ({ ...p, startDate: e.target.value }))} className="h-12 rounded-xl" />
                </div>
                <div>
                  <Label className="text-[9px] font-black uppercase text-muted-foreground/60">Fim</Label>
                  <Input type="date" value={editor.endDate} onChange={(e) => setEditor((p) => ({ ...p, endDate: e.target.value }))} className="h-12 rounded-xl" />
                </div>
              </div>
            </div>

            {/* Participantes (§12) */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Participantes</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: "todos", label: "Todos os alunos ativos" },
                  { id: "instrumento", label: "Por instrumento" },
                  { id: "nivel", label: "Por nível" },
                  { id: "manual", label: "Seleção manual" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditor((p) => ({ ...p, participantRule: opt.id as any }))}
                    className={cn(
                      "py-3.5 px-4 rounded-2xl border text-xs font-black transition-all text-left",
                      editor.participantRule === opt.id ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-card border-border hover:border-primary/40"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {editor.participantRule === "instrumento" && (
                <select value={editor.instrumentId} onChange={(e) => setEditor((p) => ({ ...p, instrumentId: e.target.value }))} className="w-full h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold">
                  <option value="">Selecione o instrumento…</option>
                  {(instrumentsList as any[]).map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              )}
              {editor.participantRule === "nivel" && (
                <select value={editor.level} onChange={(e) => setEditor((p) => ({ ...p, level: e.target.value }))} className="w-full h-12 rounded-xl border border-border bg-background px-3 text-sm font-bold">
                  <option value="">Selecione o nível…</option>
                  {LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              )}
              {editor.participantRule === "manual" && (
                <div className="max-h-44 overflow-y-auto no-scrollbar rounded-xl border border-border p-3 space-y-2">
                  {(studentsList as any[]).map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 text-xs font-bold cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={editor.participantStudentIds.includes(s.id)}
                        onChange={(e) => setEditor((p) => ({
                          ...p,
                          participantStudentIds: e.target.checked
                            ? [...p.participantStudentIds, s.id]
                            : p.participantStudentIds.filter((id) => id !== s.id),
                        }))}
                        className="accent-[hsl(var(--primary))] w-4 h-4"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Visibilidade (§31) */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Visibilidade</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: "publico", label: "Público", desc: "Participantes veem o ranking" },
                  { id: "privado", label: "Privado", desc: "Aluno vê apenas seus dados" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditor((p) => ({ ...p, visibility: opt.id as any }))}
                    className={cn(
                      "py-3.5 px-4 rounded-2xl border text-xs font-black transition-all text-left",
                      editor.visibility === opt.id ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-card border-border hover:border-primary/40"
                    )}
                  >
                    {opt.label}
                    <span className={cn("block text-[9px] font-bold mt-0.5", editor.visibility === opt.id ? "text-white/70" : "text-muted-foreground")}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pesos (§17) — configuração administrativa */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pesos dos Critérios (%)</Label>
                <span className={cn("text-[10px] font-black", weightTotal === 100 ? "text-emerald-600" : "text-amber-600")}>
                  Total: {weightTotal}%
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {WEIGHT_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1 min-w-0">
                    <Label className="text-[8px] font-black uppercase text-muted-foreground/60 text-center block truncate">{f.label}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={editor.weights[f.key]}
                      onChange={(e) => setEditor((p) => ({ ...p, weights: { ...p.weights, [f.key]: Number(e.target.value) || 0 } }))}
                      className="h-11 rounded-xl text-center px-1"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground font-medium">Regra interna — os pesos e a fórmula nunca são exibidos ao aluno.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 h-12 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
                {editor.id ? "Salvar" : "Criar Ranking"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: CLASSIFICAÇÃO COMPLETA (scroll invisível) ═══ */}
      <Dialog open={!!detailId} onOpenChange={(v) => { if (!v) { setDetailId(null); setAuditStudentId(null); } }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8">
          {detailRanking && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                  <Trophy size={20} className="text-amber-500" /> {detailRanking.name}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-3 text-xs font-bold">
                  <span>{format(new Date(detailRanking.startDate), "dd/MM/yy")} → {format(new Date(detailRanking.endDate), "dd/MM/yy")}</span>
                  <span className={cn("px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest", STATUS_CONFIG[detailRanking.status]?.cls)}>
                    {STATUS_CONFIG[detailRanking.status]?.label}
                  </span>
                  <span className="flex items-center gap-1"><Users size={11} /> {allStandings.length} participantes</span>
                </DialogDescription>
              </DialogHeader>

              {detailRanking.status !== "encerrado" && detailRanking.status !== "cancelado" && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setEncerrarId(detailRanking.id)}
                    className="h-10 rounded-xl text-purple-600 border-purple-500/30 hover:bg-purple-500/10 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Crown size={13} className="mr-1.5" /> Encerrar Ranking
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {allStandings.map((row: any) => {
                  const m = medalStyle(row.position);
                  return (
                    <div key={row.studentId} className={cn("rounded-2xl border bg-gradient-to-r p-3.5 sm:p-4 flex items-center justify-between gap-3", m.cls)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : row.position === 3 ? "🥉" : "🏅"}</span>
                        <div className="min-w-0">
                          <p className="font-black text-sm truncate">{row.position}º · {row.name}</p>
                          <p className="text-[10px] font-bold text-muted-foreground truncate">
                            Aulas: {row.breakdown.presenca.raw} · Metas: {row.breakdown.atividades.raw} · Prática: {row.breakdown.pratica.raw}min
                            {row.shared ? " · empate técnico" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-base sm:text-lg">{row.total}</span>
                        <Button size="icon" variant="ghost" title="Auditar pontuação" onClick={() => setAuditStudentId(row.studentId)} className="h-8 w-8 rounded-lg">
                          <ShieldCheck size={14} className="text-primary" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {allStandings.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-10">Nenhum participante ainda.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: AUDITORIA + AJUSTE (scroll invisível) ═══ */}
      <Dialog open={!!auditStudentId} onOpenChange={(v) => { if (!v) { setAuditStudentId(null); setAjustePoints(""); setAjusteReason(""); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto no-scrollbar rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" /> Auditoria da Pontuação
            </DialogTitle>
            <DialogDescription>Detalhamento interno por critério — visível apenas para staff.</DialogDescription>
          </DialogHeader>
          {audit ? (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                {(Object.entries((audit as any).breakdown) as any[]).map(([key, b]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl bg-muted/40 border border-border/50 px-4 py-2.5 gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{key}</span>
                    <span className="text-xs font-bold text-right">
                      raw: {b.raw} · pts: {b.points} · ponderado: <strong>{Number(b.weighted.toFixed(1))}</strong>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5">
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Ajustes manuais</span>
                  <span className="text-xs font-bold">{(audit as any).adjustments}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-600">TOTAL</span>
                  <span className="text-base sm:text-lg font-black">{(audit as any).total} pts · {(audit as any).position}º</span>
                </div>
              </div>

              {((audit as any).ajustes || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trilha de ajustes</p>
                  {((audit as any).ajustes as any[]).map((a) => (
                    <div key={a.id} className="text-xs font-bold flex items-center justify-between border-b border-border/40 pb-1.5 gap-2">
                      <span className="truncate">{a.source} · {a.reason}</span>
                      <span className={a.points >= 0 ? "text-emerald-600 shrink-0" : "text-rose-600 shrink-0"}>{a.points > 0 ? "+" : ""}{a.points}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Medalhas virtuais do aluno ── */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Medalhas virtuais</p>
                {((audit as any).medalhas || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {((audit as any).medalhas as any[]).map((m) => (
                      <span key={m.id} title={new Date(m.awardedAt).toLocaleDateString("pt-BR")} className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-700">
                        {m.title}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-muted-foreground">Nenhuma medalha ainda.</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 pt-1">
                  <Input placeholder="Nome da medalha (ex.: Dedicação)" value={medalTitle} onChange={(e) => setMedalTitle(e.target.value)} className="h-11 rounded-xl" />
                  <Input placeholder="Motivo (opcional)" value={medalDesc} onChange={(e) => setMedalDesc(e.target.value)} className="h-11 rounded-xl" />
                  <Button
                    onClick={() => {
                      if (medalTitle.trim().length < 2) { toast.error("Descreva o nome da medalha."); return; }
                      medalMutation.mutate({ studentId: auditStudentId!, title: medalTitle.trim(), description: medalDesc.trim() || undefined });
                    }}
                    disabled={medalMutation.isPending}
                    className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                  >
                    <Medal size={13} className="mr-1.5" /> Conceder
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground font-medium">
                  Automáticas: 🏆 Campeão · 🥈 Vice · 🥉 Top 3 · 🔥 Constante (3+ treinos) · 💯 Meta Atingida (5/5) · 🚀 Evolução (+3 posições).
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Novo ajuste / bônus</Label>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <Input type="number" placeholder="±pts" value={ajustePoints} onChange={(e) => setAjustePoints(e.target.value)} className="h-11 rounded-xl" />
                  <Input placeholder="Motivo (auditoria)" value={ajusteReason} onChange={(e) => setAjusteReason(e.target.value)} className="h-11 rounded-xl" />
                </div>
                <Button
                  onClick={() => {
                    const pts = Number(ajustePoints);
                    if (!Number.isFinite(pts) || pts === 0) { toast.error("Informe os pontos do ajuste."); return; }
                    if (ajusteReason.trim().length < 3) { toast.error("Descreva o motivo do ajuste."); return; }
                    ajusteMutation.mutate({ rankingId: detailId!, studentId: auditStudentId!, points: pts, reason: ajusteReason.trim(), source: pts > 0 ? "bonus" : "ajuste" });
                  }}
                  disabled={ajusteMutation.isPending}
                  className="w-full h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Registrar Ajuste
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-primary" /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Como funciona (sem revelar fórmula — PRD §17) ═══ */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[85vh] overflow-y-auto no-scrollbar rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
              <Target size={18} className="text-primary" /> Como funciona a pontuação?
            </DialogTitle>
            <DialogDescription>
              Seus alunos acumulam pontos de forma contínua e automática:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm font-medium text-foreground/90">
            <li className="flex items-start gap-2.5"><span className="text-lg leading-none mt-0.5">📅</span> Presença e participação nas aulas;</li>
            <li className="flex items-start gap-2.5"><span className="text-lg leading-none mt-0.5">🎯</span> Conclusão de metas e exercícios;</li>
            <li className="flex items-start gap-2.5"><span className="text-lg leading-none mt-0.5">🎸</span> Prática com atividade real no plano diário;</li>
            <li className="flex items-start gap-2.5"><span className="text-lg leading-none mt-0.5">🚀</span> Evolução e conquistas registradas.</li>
          </ul>
          <p className="text-xs text-muted-foreground font-medium pt-2 border-t border-border/50">
            O sistema avalia o conjunto desses sinais — acompanhe a evolução pelo ranking. Dúvidas de pontuação podem ser auditadas aqui no painel.
          </p>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Recompensas (Fase 2) ═══ */}
      <Dialog open={rewardsOpen} onOpenChange={setRewardsOpen}>
        <DialogContent className="w-[95vw] max-w-md rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
              <Star size={18} className="text-emerald-600" /> Premiações
            </DialogTitle>
            <DialogDescription>
              Premiações personalizadas (certificados, medalhas, aulas bônus e descontos) chegam na Fase 2 do módulo.
              Enquanto isso, as medalhas de Campeão, Vice e Top 3 já são concedidas automaticamente no encerramento de cada ranking.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setRewardsOpen(false)} className="w-full h-12 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest">
            Entendi
          </Button>
        </DialogContent>
      </Dialog>

      {/* ═══ CONFIRM: Excluir ═══ */}
      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="w-[95vw] max-w-sm rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Excluir ranking?</DialogTitle>
            <DialogDescription>Participantes, ajustes e conquistas vinculadas também serão removidos. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
            <Button onClick={() => deleteMutation.mutate({ id: deleteId! })} disabled={deleteMutation.isPending} className="flex-1 h-12 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest">Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ CONFIRM: Encerrar (§48) ═══ */}
      <Dialog open={!!encerrarId} onOpenChange={(v) => !v && setEncerrarId(null)}>
        <DialogContent className="w-[95vw] max-w-sm rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Encerrar ranking?</DialogTitle>
            <DialogDescription>A pontuação será congelada, posições finais calculadas, medalhas concedidas e os alunos notificados.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setEncerrarId(null)} className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
            <Button onClick={() => encerrarMutation.mutate({ id: encerrarId! })} disabled={encerrarMutation.isPending} className="flex-1 h-12 rounded-xl bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest">Encerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
