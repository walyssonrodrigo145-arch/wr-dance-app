import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, type Variants } from "framer-motion";
import {
  Repeat, Clock, CalendarCheck, CheckCircle2, AlertTriangle, Lock, Loader2,
  Search, CalendarPlus, Eye, XCircle, Users, TrendingUp, RefreshCcw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// Animações de entrada em cascata (padrão do Dashboard)
const staggerContainer: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const staggerItem: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };

// ─── Visual do status do crédito (PRD 01 §2) ─────────────────────────────────
const CREDIT_STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  aguardando_liberacao: { label: "Aguardando Liberação", badge: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25", dot: "bg-slate-400" },
  disponivel: { label: "Disponível", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/25", dot: "bg-emerald-500" },
  agendada: { label: "Agendada", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/25", dot: "bg-blue-500" },
  realizada: { label: "Realizada", badge: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/25", dot: "bg-violet-500" },
  expirada: { label: "Expirada", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/25", dot: "bg-rose-500" },
  cancelada: { label: "Cancelada", badge: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/25", dot: "bg-zinc-400" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = CREDIT_STATUS_CONFIG[status] || CREDIT_STATUS_CONFIG.cancelada;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", cfg.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd/MM/yyyy");
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd/MM/yyyy 'às' HH:mm");
}

// ─── Modal: Agendar Reposição (PRD 01 §16) ───────────────────────────────────
function ScheduleRepositionModal({ reposition, open, onOpenChange }: { reposition: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [roomId, setRoomId] = useState<string>("none");

  const { data: rooms = [] } = trpc.studioRooms.list.useQuery(undefined, { enabled: open });

  const scheduleMutation = trpc.repositions.schedule.useMutation({
    onSuccess: () => {
      toast.success("Reposição agendada com sucesso!");
      utils.repositions.list.invalidate();
      utils.repositions.stats.invalidate();
      utils.lessons.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao agendar reposição."),
  });

  if (!reposition) return null;

  const handleSubmit = () => {
    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error("Data ou horário inválido.");
      return;
    }
    scheduleMutation.mutate({
      id: reposition.id,
      scheduledAt: scheduledAt.toISOString(),
      duration: Number(duration),
      studioRoomId: roomId === "none" ? undefined : Number(roomId),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wide">
            <CalendarPlus size={18} className="text-primary" /> Agendar Reposição
          </DialogTitle>
          <DialogDescription>
            {reposition.studentName} — crédito válido até {fmtDate(reposition.expiresAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Horário</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full h-10 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Duração</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full h-10 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["30", "45", "60", "90"].map((d) => (
                    <SelectItem key={d} value={d}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Sala (opcional)</label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="w-full h-10 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem sala</SelectItem>
                  {rooms.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl bg-primary text-[10px] font-black uppercase tracking-widest"
              onClick={handleSubmit}
              disabled={scheduleMutation.isPending}
            >
              {scheduleMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Detalhes + histórico (PRD 01 §15) ────────────────────────────────
function RepositionDetailsModal({ repositionId, open, onOpenChange }: { repositionId: number | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = trpc.repositions.getById.useQuery({ id: repositionId! }, { enabled: open && !!repositionId });
  const r: any = data;
  const eventTypeLabels: Record<string, string> = {
    criado: "Aula convertida em reposição",
    liberado: "Crédito liberado",
    expirado: "Crédito expirado",
    agendado: "Reposição agendada",
    realizado: "Reposição realizada",
    cancelado: "Reposição cancelada",
    motivo_criado: "Motivo criado",
    politica_alterada: "Política alterada",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wide">
            <Eye size={18} className="text-primary" /> Detalhes da Reposição
          </DialogTitle>
          <DialogDescription>Histórico completo do crédito</DialogDescription>
        </DialogHeader>
        {isLoading || !r ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Detail label="Aluno" value={r.studentName || "—"} />
              <Detail label="Status" value={CREDIT_STATUS_CONFIG[r.reposition.status]?.label || r.reposition.status} />
              <Detail label="Motivo" value={r.reasonName || "—"} />
              <Detail label="Instrumento" value={r.instrumentName || "Geral"} />
              <Detail label="Aula original" value={fmtDateTime(r.originalLessonAt)} />
              <Detail label="Criado em" value={fmtDateTime(r.reposition.createdAt)} />
              <Detail label="Liberação" value={fmtDateTime(r.reposition.releasedAt)} />
              <Detail label="Data limite" value={fmtDate(r.reposition.expiresAt)} />
              <Detail label="Reposição agendada" value={fmtDateTime(r.reposition.scheduledAt)} />
              <Detail label="Realizada em" value={fmtDateTime(r.reposition.completedAt)} />
            </div>
            {r.reposition.notes && (
              <div className="rounded-xl bg-muted/30 border border-dashed border-border/60 p-3 text-xs text-muted-foreground italic">
                <span className="font-bold not-italic text-foreground/70">Observações: </span>{r.reposition.notes}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Histórico de alterações</p>
              <div className="space-y-1.5">
                {(r.events || []).map((ev: any) => (
                  <div key={ev.id} className="flex items-start gap-2.5 rounded-xl bg-card/60 border border-border/40 p-2.5">
                    <span className="mt-1 w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">{eventTypeLabels[ev.type] || ev.type}</p>
                      <p className="text-[10px] text-muted-foreground">{ev.message}</p>
                      <p className="text-[9px] text-muted-foreground/70">{fmtDateTime(ev.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {(!r.events || r.events.length === 0) && (
                  <p className="text-xs text-muted-foreground italic">Nenhum evento registrado.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/20 border border-border/40 p-2.5 min-w-0">
      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-bold text-foreground truncate">{value}</p>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Reposicoes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<any>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [completeTarget, setCompleteTarget] = useState<any>(null);

  const { data: stats } = trpc.repositions.stats.useQuery();
  const { data: reasons = [] } = trpc.repositions.listReasons.useQuery();
  const { data: items = [], isLoading } = trpc.repositions.list.useQuery({
    status: statusFilter === "all" ? undefined : (statusFilter as any),
    expiringOnly: expiringOnly || undefined,
    waitingReleaseOnly: waitingOnly || undefined,
    search: search.trim() || undefined,
  });

  const completeMutation = trpc.repositions.complete.useMutation({
    onSuccess: () => {
      toast.success("Reposição registrada como realizada! Crédito consumido.");
      setCompleteTarget(null);
      utils.repositions.list.invalidate();
      utils.repositions.stats.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao concluir reposição."),
  });

  const cancelMutation = trpc.repositions.cancel.useMutation({
    onSuccess: (data) => {
      toast.success(data?.creditStatus === "disponivel" ? "Reposição cancelada — crédito voltou a ficar disponível." : "Reposição cancelada.");
      utils.repositions.list.invalidate();
      utils.repositions.stats.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao cancelar reposição."),
  });

  const cards = useMemo(() => [
    { label: "Aulas Pendentes", value: stats?.aulasPendentes ?? 0, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Créditos Disponíveis", value: stats?.creditosDisponiveis ?? 0, icon: Repeat, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Agendadas", value: stats?.agendadas ?? 0, icon: CalendarCheck, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Realizadas", value: stats?.realizadas ?? 0, icon: CheckCircle2, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Expiradas", value: stats?.expiradas ?? 0, icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-500/10" },
    { label: "Aguardando Liberação", value: stats?.aguardandoLiberacao ?? 0, icon: Lock, color: "text-slate-400", bg: "bg-slate-500/10" },
  ], [stats]);

  const indicators = useMemo(() => {
    const list: string[] = [];
    if ((stats?.alunosPendentes ?? 0) > 0) list.push(`${stats!.alunosPendentes} aluno(s) possuem aulas para repor`);
    if ((stats?.vencendoEm7Dias ?? 0) > 0) list.push(`${stats!.vencendoEm7Dias} reposição(ões) vencem nos próximos 7 dias`);
    if ((stats?.aguardandoLiberacao ?? 0) > 0) list.push(`${stats!.aguardandoLiberacao} crédito(s) aguardando liberação`);
    if ((stats?.tempoMedioRealizacaoHoras ?? 0) > 0) list.push(`Tempo médio até realização: ${stats!.tempoMedioRealizacaoHoras}h`);
    return list;
  }, [stats]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-2xl bg-violet-500/15 flex items-center justify-center shadow-sm"><Repeat size={20} className="text-violet-500" /></span>
              Reposições
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-1">Central de gestão de aulas a repor, créditos e reposições realizadas</p>
          </div>
        </motion.div>

        {/* Indicadores de alerta (PRD 01 §12) */}
        {indicators.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-wrap gap-2">
            {indicators.map((ind, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle size={11} /> {ind}
              </span>
            ))}
          </motion.div>
        )}

        {/* Cards de métricas (PRD 01 §11) — shell idêntico ao MetricCard do Dashboard */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
        >
          {cards.map((c) => (
            <motion.div
              key={c.label}
              variants={staggerItem}
              className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 sm:p-5 border border-white/10 shadow-2xl shadow-primary/5 hover:shadow-primary/15 hover:-translate-y-1 transition-all duration-500 group cursor-default min-w-0 overflow-hidden"
            >
              <div className={cn("w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center mb-3 shadow-sm transition-transform duration-500 group-hover:rotate-6 shrink-0", c.bg)}>
                <c.icon size={18} className={c.color} />
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate">{c.value}</h3>
              <p className="text-xs font-bold text-muted-foreground mt-1 truncate">{c.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Filtros (PRD 01 §14) */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 border border-white/10 shadow-2xl shadow-primary/5 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome do aluno..."
              className="w-full h-9 rounded-xl border border-border/60 bg-background pl-9 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px] h-9 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(CREDIT_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => setExpiringOnly((v) => !v)}
            className={cn("h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
              expiringOnly ? "bg-rose-500/15 text-rose-600 border-rose-500/30" : "bg-background text-muted-foreground border-border/60 hover:bg-muted/30")}
          >
            <AlertTriangle size={12} /> Vencendo
          </button>
          <button
            onClick={() => setWaitingOnly((v) => !v)}
            className={cn("h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5",
              waitingOnly ? "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30" : "bg-background text-muted-foreground border-border/60 hover:bg-muted/30")}
          >
            <Lock size={12} /> Aguardando
          </button>
          <Button variant="ghost" size="sm" className="h-9 px-2.5 rounded-xl" onClick={() => { utils.repositions.list.invalidate(); utils.repositions.stats.invalidate(); }}>
            <RefreshCcw size={13} />
          </Button>
        </motion.div>

        {/* Lista (PRD 01 §13) */}
        <div className="space-y-2.5">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-16 text-center bg-card/30 rounded-[1.25rem] border border-dashed border-border/50">
              <Repeat size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm font-bold text-foreground">Nenhuma reposição encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">Marque uma aula como "Aula a Repor" na agenda para gerar um crédito.</p>
            </motion.div>
          ) : (
            items.map((r: any, idx: number) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.4) }}
                className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 border border-white/10 shadow-2xl shadow-primary/5 hover:border-primary/25 hover:-translate-y-0.5 transition-all duration-300 flex flex-col lg:flex-row lg:items-center gap-3"
              >
                <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Aluno</p>
                    <p className="text-xs font-bold text-foreground truncate">{r.studentName || "—"}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Motivo</p>
                    <p className="text-xs font-bold text-foreground truncate">{r.reasonName || "—"}</p>
                    <p className="text-[9px] text-muted-foreground">{r.instrumentName || "Geral"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Aula original</p>
                    <p className="text-xs font-bold text-foreground">{fmtDate(r.originalLessonAt)}</p>
                    <p className="text-[9px] text-muted-foreground">Gerado em {fmtDate(r.createdAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                      {r.status === "agendada" ? "Agendada para" : r.status === "realizada" ? "Realizada em" : "Data limite"}
                    </p>
                    <p className="text-xs font-bold text-foreground">
                      {r.status === "agendada" ? fmtDateTime(r.scheduledAt) : r.status === "realizada" ? fmtDate(r.completedAt) : fmtDate(r.expiresAt)}
                    </p>
                    {r.status === "aguardando_liberacao" && (
                      <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Lock size={9} /> Após o fim do contrato
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {(r.status === "disponivel") && (
                    <Button size="sm" className="h-9 px-3 rounded-lg bg-primary text-[9px] font-black uppercase tracking-wider gap-1.5" onClick={() => setScheduleTarget(r)}>
                      <CalendarPlus size={12} /> Agendar
                    </Button>
                  )}
                  {(r.status === "agendada") && (
                    <Button size="sm" className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-wider gap-1.5" onClick={() => setCompleteTarget(r)}>
                      <CheckCircle2 size={12} /> Realizada
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-9 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider gap-1.5" onClick={() => setDetailsId(r.id)}>
                    <Eye size={12} /> Detalhes
                  </Button>
                  {isAdmin && r.status !== "realizada" && r.status !== "cancelada" && (
                    <Button size="sm" variant="outline" className="h-9 w-9 p-0 rounded-lg text-rose-500 hover:text-rose-600 border-rose-500/30" title="Cancelar reposição"
                      onClick={() => { if (confirm(`Cancelar a reposição de ${r.studentName}?`)) cancelMutation.mutate({ id: r.id }); }}>
                      <XCircle size={12} />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Mini-relatório rápido (PRD 01 §18) */}
        {stats && (
          <div className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 border border-white/10 shadow-2xl shadow-primary/5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary" /> Mini-relatório
            </p>
            <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5"><Users size={12} className="text-muted-foreground" /> {stats.alunosPendentes} aluno(s) pendente(s)</span>
            <span className="text-[11px] font-bold text-foreground">{stats.realizadas} realizada(s)</span>
            <span className="text-[11px] font-bold text-foreground">{stats.expiradas} expirada(s)</span>
            <span className="text-[11px] font-bold text-foreground">{stats.tempoMedioRealizacaoHoras}h tempo médio até realização</span>
            <span className="text-[11px] font-bold text-muted-foreground ml-auto">{reasons.filter((x: any) => x.active).length} motivo(s) ativo(s)</span>
          </div>
        )}
      </div>

      {/* Modais */}
      <ScheduleRepositionModal reposition={scheduleTarget} open={!!scheduleTarget} onOpenChange={(o) => !o && setScheduleTarget(null)} />
      <RepositionDetailsModal repositionId={detailsId} open={!!detailsId} onOpenChange={(o) => !o && setDetailsId(null)} />

      {/* Confirmação de realização */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" /> Registrar Reposição Realizada
            </DialogTitle>
            <DialogDescription>
              {completeTarget?.studentName} — o crédito será consumido e não poderá ser reutilizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Observação (opcional)</label>
              <textarea
                id="reposition-complete-notes"
                rows={2}
                maxLength={1000}
                className="w-full rounded-xl border border-border/60 bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Ex: aula de reposição realizada na sala 2"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => setCompleteTarget(null)}>Voltar</Button>
              <Button
                className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest"
                disabled={completeMutation.isPending}
                onClick={() => {
                  const el = document.getElementById("reposition-complete-notes") as HTMLTextAreaElement | null;
                  completeMutation.mutate({ id: completeTarget.id, notes: el?.value?.trim() || undefined });
                }}
              >
                {completeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
