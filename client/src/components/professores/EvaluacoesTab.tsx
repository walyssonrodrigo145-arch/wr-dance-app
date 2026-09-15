// ─── ⭐ Avaliações de Professores — aba admin (SOMENTE ADMIN) ────────────────
// Frequência dos ciclos, abrir/fechar ciclo, relatório com filtros e ranking.
// O professor NUNCA acessa este módulo (recusado no backend — RN-001).
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Star, Loader2, Trophy, Crown, Settings2, Play, Square, Trash2, MessageSquare } from "lucide-react";

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

const FREQ_OPTIONS = [
  { value: "mensal", label: "Mensal" },
  { value: "bimestral", label: "A cada 2 meses" },
  { value: "trimestral", label: "A cada 3 meses" },
  { value: "semestral", label: "A cada 6 meses" },
] as const;

function Stars({ nota }: { nota: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={12} className={cn(i <= nota ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </span>
  );
}

interface RankRow { professorId: number; name: string; avg: number; count: number; smallSample: boolean }
interface EvalRow {
  id: number;
  periodId: number;
  periodStart: string | null;
  studentName: string | null;
  professorName: string | null;
  nota: number;
  comentario: string | null;
  createdAt: string | Date | null;
}
interface PeriodRow { id: number; startDate: string | Date; endDate: string | Date; status: string }

export function EvaluacoesTab() {
  const utils = trpc.useUtils();
  const { data: config, isLoading: loadingConfig } = trpc.avaliacoes.getConfig.useQuery();
  const [frequency, setFrequency] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("todos");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const freqValue = frequency ?? config?.frequency ?? "trimestral";
  const winValue = windowDays ?? String(config?.windowDays ?? 7);

  const periodIdNum = periodFilter === "todos" ? null : Number(periodFilter);
  const { data: ranking = [], isLoading: loadingRanking } = trpc.avaliacoes.ranking.useQuery({ periodId: periodIdNum });
  const { data: report, isLoading: loadingReport } = trpc.avaliacoes.report.useQuery({ periodId: periodIdNum ?? undefined });

  const rankingList = (ranking || []) as RankRow[];
  const evaluations = (report?.evaluations || []) as EvalRow[];
  const periods = (report?.periods || []) as PeriodRow[];
  const kpis = report?.kpis ?? { total: 0, avgGeral: 0, participantes: 0, elegiveis: 0 };

  const configureMutation = trpc.avaliacoes.configure.useMutation({
    onSuccess: () => { toast.success("Frequência de avaliações atualizada!"); utils.avaliacoes.getConfig.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const openMutation = trpc.avaliacoes.openPeriod.useMutation({
    onSuccess: () => { toast.success("Ciclo aberto! Alunos foram notificados."); utils.avaliacoes.getConfig.invalidate(); utils.avaliacoes.ranking.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const closeMutation = trpc.avaliacoes.closePeriod.useMutation({
    onSuccess: () => { toast.success("Ciclo encerrado."); utils.avaliacoes.getConfig.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.avaliacoes.deleteEvaluation.useMutation({
    onSuccess: () => { toast.success("Avaliação excluída."); utils.avaliacoes.report.invalidate(); utils.avaliacoes.ranking.invalidate(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {/* ── Configuração de frequência ── */}
      <div className="p-5 rounded-[1.5rem] bg-card/60 backdrop-blur-xl border border-border/40 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center"><Settings2 size={14} className="text-violet-500" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ciclo de avaliações</span>
        </div>
        <p className="text-[11px] text-muted-foreground font-medium -mt-1">
          De quanto em quanto tempo os alunos são convidados a avaliar seus professores. O ciclo fica aberto pela janela definida.
        </p>
        {loadingConfig ? (
          <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-violet-500" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Frequência do ciclo</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {FREQ_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFrequency(f.value)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all",
                        freqValue === f.value ? "bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-500/20" : "bg-muted/30 border-border/40 text-muted-foreground hover:border-violet-400"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Janela aberta (dias)</label>
                <Input
                  value={winValue}
                  onChange={(e) => setWindowDays(e.target.value.replace(/\D/g, ""))}
                  className="h-11 rounded-xl font-bold"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={configureMutation.isPending}
                onClick={() => configureMutation.mutate({ frequency: freqValue as any, windowDays: Math.max(3, Math.min(30, Number(winValue) || 7)) })}
                className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest"
              >
                {configureMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : null} Salvar frequência
              </Button>
              {config?.openPeriod ? (
                <Button
                  variant="outline"
                  disabled={closeMutation.isPending}
                  onClick={() => config.openPeriod && closeMutation.mutate({ periodId: config.openPeriod.id })}
                  className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white"
                >
                  <Square size={12} className="mr-1" /> Fechar ciclo atual
                </Button>
              ) : (
                <Button
                  disabled={openMutation.isPending}
                  onClick={() => openMutation.mutate()}
                  className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {openMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : <Play size={12} className="mr-1" />} Abrir ciclo agora
                </Button>
              )}
            </div>
            {config?.openPeriod && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600">Ciclo aberto</span>
                <span className="text-muted-foreground">
                  {format(new Date(config.openPeriod.startDate), "dd MMM", { locale: ptBR })} → {format(new Date(config.openPeriod.endDate), "dd MMM yyyy", { locale: ptBR })}
                </span>
              </div>
            )}
            {(() => {
              const cfg = config as any;
              const lastClosed = cfg?.lastClosedPeriod as { startDate: string; endDate: string } | null | undefined;
              if (!lastClosed || cfg?.openPeriod) return null;
              return (
                <p className="text-[10px] text-muted-foreground font-bold">
                  Último ciclo: {format(new Date(lastClosed.startDate), "dd MMM", { locale: ptBR })} → {format(new Date(lastClosed.endDate), "dd MMM yyyy", { locale: ptBR })}
                </p>
              );
            })()}
          </>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Avaliações recebidas", value: String(kpis.total) },
          { label: "Média geral", value: kpis.avgGeral > 0 ? `${kpis.avgGeral} ⭐` : "—" },
          { label: "Participação", value: kpis.elegiveis > 0 ? `${Math.min(100, Math.round((kpis.participantes / kpis.elegiveis) * 100))}%` : "—" },
          { label: "Alunos elegíveis", value: String(kpis.elegiveis) },
        ].map((k) => (
          <div key={k.label} className="p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border/40">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">{k.label}</p>
            <p className="text-xl font-black font-outfit text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Ranking de professores ── */}
      <div className="p-5 rounded-[1.5rem] bg-card/60 backdrop-blur-xl border border-border/40 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center"><Trophy size={14} className="text-amber-500" /></div>
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ranking de Professores</span>
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-9 rounded-xl border-border bg-background text-xs font-bold px-2.5"
          >
            <option value="todos">Todos os ciclos</option>
            {periods.map((p: any) => (
              <option key={p.id} value={p.id}>
                Ciclo {format(new Date(p.startDate), "dd/MM", { locale: ptBR })}–{format(new Date(p.endDate), "dd/MM/yy", { locale: ptBR })}
              </option>
            ))}
          </select>
        </div>
        {loadingRanking ? (
          <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-amber-500" /></div>
        ) : rankingList.length === 0 ? (
          <div className="py-8 text-center">
            <Star size={28} className="mx-auto text-muted-foreground/25 mb-2" />
            <p className="text-xs font-bold text-muted-foreground">Nenhuma avaliação ainda. Abra um ciclo para começar.</p>
          </div>
        ) : (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2">
            {rankingList.map((r, i: number) => (
              <motion.div key={r.professorId} variants={itemVariants} className={cn(
                "flex items-center gap-3 p-3 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5",
                i === 0 && !r.smallSample ? "bg-amber-500/5 border-amber-500/25" : "bg-muted/20 border-border/40"
              )}>
                <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-xs font-black text-muted-foreground shrink-0">
                  {i === 0 && !r.smallSample ? <Crown size={16} className="text-amber-400" /> : `${i + 1}º`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground truncate">{r.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    {r.count} avaliação{r.count === 1 ? "" : "ões"}
                    {r.smallSample && <span className="ml-1.5 text-[9px] font-black uppercase text-amber-600">amostra pequena</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black font-outfit text-foreground leading-none">{r.avg.toFixed(1)}</p>
                  <Stars nota={Math.round(r.avg)} />
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Lista gerenciável de avaliações ── */}
      <div className="p-5 rounded-[1.5rem] bg-card/60 backdrop-blur-xl border border-border/40 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center"><MessageSquare size={14} className="text-blue-500" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Avaliações recebidas</span>
        </div>
        {loadingReport ? (
          <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
        ) : evaluations.length === 0 ? (
          <p className="text-xs font-bold text-muted-foreground text-center py-6">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-2 max-h-[420px] overflow-y-auto no-scrollbar pr-1">
            {evaluations.map((ev) => (
              <motion.div key={ev.id} variants={itemVariants} className="p-3.5 rounded-xl bg-muted/20 border border-border/40 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black text-foreground truncate">
                      {ev.studentName ?? "Aluno"} → <span className="text-violet-600 dark:text-violet-400">{ev.professorName ?? "Professor"}</span>
                    </p>
                    <Stars nota={ev.nota} />
                    {ev.periodStart && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                        ciclo {format(new Date(ev.periodStart), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                  {ev.comentario && <p className="text-[11px] text-muted-foreground italic">"{ev.comentario}"</p>}
                  <p className="text-[9px] font-bold text-muted-foreground/60">
                    {ev.createdAt ? format(new Date(ev.createdAt), "dd MMM yyyy HH:mm", { locale: ptBR }) : ""}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteId(ev.id)}
                  title="Excluir avaliação"
                  className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white flex items-center justify-center text-rose-500 transition-all active:scale-95 shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Confirmação de exclusão ── */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="w-[92vw] max-w-sm rounded-[1.5rem] bg-card border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Excluir avaliação?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              A avaliação será removida do relatório e do ranking. Ação irreversível.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId != null && deleteMutation.mutate({ id: deleteId })} className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white">
              {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
