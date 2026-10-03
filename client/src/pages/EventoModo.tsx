import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "@/lib/dates";
import {
  Theater, ArrowLeft, ScanLine, CheckCircle2, XCircle, Clock, Ban,
  AlertTriangle, Users, Loader2, Plus, Play, Flag, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { STAGE_STATUS_META } from "@/components/eventos/BackstageTab";

const CHECKIN_RESULT: Record<string, { label: string; className: string; icon: any }> = {
  valido: { label: "Válido — pode entrar!", className: "bg-emerald-600 text-white border-emerald-600", icon: CheckCircle2 },
  duplicado: { label: "Já utilizado", className: "bg-amber-500 text-white border-amber-500", icon: Clock },
  invalido: { label: "Inválido", className: "bg-rose-600 text-white border-rose-600", icon: XCircle },
  cancelado: { label: "Cancelado", className: "bg-slate-600 text-white border-slate-600", icon: Ban },
  reservado: { label: "Reservado — confirmar pagamento", className: "bg-blue-600 text-white border-blue-600", icon: Clock },
};

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  baixa: { label: "Baixa", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  media: { label: "Média", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  alta: { label: "Alta", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

export default function EventoModo() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const eventId = params?.id ? Number(params.id) : NaN;
  const hasId = Number.isFinite(eventId) && eventId > 0;
  const [clock, setClock] = useState(new Date());
  const [code, setCode] = useState("");
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [incidentTitle, setIncidentTitle] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.eventos.getById.useQuery(
    { id: eventId },
    { enabled: hasId, refetchInterval: 15000 },
  );
  const { data: stats } = trpc.tickets.stats.useQuery({ eventId }, { enabled: hasId, refetchInterval: 15000 });
  const { data: staff = [] } = trpc.eventos.staffList.useQuery({ eventId }, { enabled: hasId });
  const { data: incidents = [] } = trpc.eventos.incidentsList.useQuery({ eventId }, { enabled: hasId });

  const checkinMut = trpc.tickets.checkin.useMutation({
    onSuccess: (r) => {
      setLastResult(r);
      if (r.result === "valido" || r.result === "duplicado") setCode("");
      utils.tickets.stats.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });
  const setStageState = trpc.eventos.setStageState.useMutation({
    onSuccess: () => utils.eventos.getById.invalidate({ id: eventId }),
    onError: (e) => toast.error(e.message),
  });
  const updateParticipant = trpc.eventos.updateParticipant.useMutation({
    onSuccess: () => utils.eventos.getById.invalidate({ id: eventId }),
    onError: (e) => toast.error(e.message),
  });
  const incidentCreate = trpc.eventos.incidentCreate.useMutation({
    onSuccess: () => { toast.success("Ocorrência registrada."); setIncidentTitle(""); utils.eventos.incidentsList.invalidate({ eventId }); },
    onError: (e) => toast.error(e.message),
  });
  const incidentResolve = trpc.eventos.incidentResolve.useMutation({
    onSuccess: () => utils.eventos.incidentsList.invalidate({ eventId }),
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const pres = useMemo(() => [...((data?.coreografias ?? []) as any[])].sort((a, b) => a.ordem - b.ordem), [data?.coreografias]);
  const participantsByStudent = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of (data?.participantes ?? []) as any[]) map.set(p.studentId, p);
    return map;
  }, [data?.participantes]);

  if (!hasId) return <Redirect to="/eventos" />;

  const onStage = pres.find((p) => p.stageState === "em_cena") ?? null;
  const onStageIdx = onStage ? pres.findIndex((p) => p.id === onStage.id) : -1;
  const next = onStageIdx >= 0 ? pres[onStageIdx + 1] ?? null : pres.find((p) => p.stageState !== "finalizada") ?? null;
  const openIncidents = (incidents as any[]).filter((i) => i.status === "aberto");
  const resMeta = lastResult ? CHECKIN_RESULT[lastResult.result] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header simples */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/eventos/${eventId}`)}>
            <ArrowLeft size={15} className="mr-1.5" /> Sair do Modo Evento
          </Button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-sm font-black text-foreground truncate flex items-center justify-center gap-2">
              <Theater size={15} className="text-indigo-500" /> {data?.name ?? "Evento"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-outfit font-black text-foreground tabular-nums leading-none">{clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-[10px] font-bold text-muted-foreground">
              Ingressos: {stats?.checkedIn ?? 0} entraram · {stats?.waiting ?? 0} aguardados
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
          {/* Palco */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={cn("rounded-3xl border-2 p-5", onStage ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card")}>
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Agora no palco</p>
              {onStage ? (
                <>
                  <p className="text-2xl font-outfit font-black text-foreground">{onStage.ordem} · {onStage.title}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="lg" variant="outline" className="h-12" onClick={() => setStageState.mutate({ id: onStage.id, state: "finalizada" })} disabled={setStageState.isPending}>
                      <Flag size={16} className="mr-1.5" /> Finalizar
                    </Button>
                    {next && (
                      <Button size="lg" className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStageState.mutate({ id: next.id, state: "em_cena" })} disabled={setStageState.isPending}>
                        <Play size={16} className="mr-1.5" /> Chamar próxima
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-black text-foreground">Nenhuma apresentação em cena</p>
                  {next && (
                    <Button size="lg" className="h-12 mt-3 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStageState.mutate({ id: next.id, state: "em_cena" })} disabled={setStageState.isPending}>
                      <Play size={16} className="mr-1.5" /> Iniciar {next.ordem} · {next.title}
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="rounded-3xl border border-border bg-card p-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Próxima</p>
              {next && next.id !== onStage?.id ? (
                <>
                  <p className="text-2xl font-outfit font-black text-foreground">{next.ordem} · {next.title}</p>
                  <p className="text-xs font-bold text-muted-foreground mt-1">
                    {(next.alunos ?? []).length} aluno(s) ·
                    {" "}{(next.alunos ?? []).filter((a: any) => { const p = participantsByStudent.get(a.id); return p && p.stageStatus && p.stageStatus !== "nao_chegou"; }).length} presente(s)
                    {next.entryAt ? ` · previsto ${format(next.entryAt, "HH:mm")}` : ""}
                  </p>
                  <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
                    {(next.alunos ?? []).map((a: any) => {
                      const part = participantsByStudent.get(a.id);
                      const meta = STAGE_STATUS_META[part?.stageStatus ?? "nao_chegou"] ?? STAGE_STATUS_META.nao_chegou;
                      return (
                        <div key={a.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5">
                          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", meta.dot)} />
                          <p className="text-xs font-black text-foreground truncate flex-1 min-w-0">{a.name}</p>
                          {part && (
                            <select
                              value={part.stageStatus ?? "nao_chegou"}
                              onChange={(e) => updateParticipant.mutate({ id: part.id, stageStatus: e.target.value as any })}
                              className="h-8 rounded-lg border border-border bg-background px-1.5 text-[11px] font-bold text-foreground max-w-[170px]"
                            >
                              {Object.entries(STAGE_STATUS_META).map(([value, m]) => (
                                <option key={value} value={value}>{m.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                    {(next.alunos ?? []).length === 0 && <p className="text-xs font-bold text-muted-foreground py-2">Sem elenco cadastrado.</p>}
                  </div>
                </>
              ) : (
                <p className="text-sm font-bold text-muted-foreground py-2">Sem próxima apresentação na fila.</p>
              )}
            </div>
          </div>

          {/* Check-in */}
          <div className="rounded-3xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><ScanLine size={13} /> Check-in rápido</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && code.trim().length >= 3) checkinMut.mutate({ code: code.trim() }); }}
                placeholder="Código do ingresso (leitor USB digita direto)"
                className="h-14 text-lg font-black tracking-widest uppercase bg-background"
                autoFocus
              />
              <Button size="lg" className="h-14 px-8 text-base bg-indigo-600 hover:bg-indigo-700" onClick={() => code.trim().length >= 3 && checkinMut.mutate({ code: code.trim() })} disabled={checkinMut.isPending}>
                {checkinMut.isPending ? <Loader2 size={18} className="animate-spin" /> : "Validar"}
              </Button>
            </div>
            {resMeta && (
              <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", resMeta.className)}>
                <resMeta.icon size={26} />
                <div className="min-w-0">
                  <p className="text-lg font-black leading-tight">{resMeta.label}</p>
                  {lastResult?.ticket && <p className="text-xs font-bold opacity-90 truncate">{lastResult.ticket.typeName}{lastResult.ticket.buyerName ? ` · ${lastResult.ticket.buyerName}` : ""}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Ocorrências + Equipe */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle size={13} /> Ocorrências ({openIncidents.length} em aberto)
              </p>
              <div className="flex gap-2">
                <Input value={incidentTitle} onChange={(e) => setIncidentTitle(e.target.value)} placeholder="Registrar ocorrência rápida..." maxLength={200} onKeyDown={(e) => { if (e.key === "Enter" && incidentTitle.trim().length >= 2) incidentCreate.mutate({ eventId, title: incidentTitle.trim() }); }} />
                <Button variant="outline" onClick={() => incidentTitle.trim().length >= 2 && incidentCreate.mutate({ eventId, title: incidentTitle.trim() })} disabled={incidentCreate.isPending}>
                  <Plus size={14} />
                </Button>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {openIncidents.length === 0 ? (
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Nenhuma ocorrência em aberto.</p>
                ) : openIncidents.map((i: any) => {
                  const sev = SEVERITY_META[i.severity] ?? SEVERITY_META.media;
                  return (
                    <div key={i.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                      <Badge variant="outline" className={cn("text-[9px] font-black shrink-0", sev.className)}>{sev.label}</Badge>
                      <p className="text-xs font-bold text-foreground truncate flex-1 min-w-0">{i.title}</p>
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] font-black shrink-0" onClick={() => incidentResolve.mutate({ id: i.id, resolved: true })} disabled={incidentResolve.isPending}>
                        Resolver
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Users size={13} /> Equipe do dia</p>
              {staff.length === 0 ? (
                <p className="text-xs font-bold text-muted-foreground">Equipe não cadastrada — adicione na aba Operação.</p>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {(staff as any[]).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                      <p className="text-xs font-black text-foreground truncate flex-1 min-w-0">{m.name}</p>
                      <Badge variant="outline" className="text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 shrink-0">{m.role}</Badge>
                      {m.timeLabel && <span className="text-[10px] font-bold text-muted-foreground shrink-0">{m.timeLabel}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] font-bold text-muted-foreground flex items-center justify-center gap-1.5 pb-6">
            <RefreshCw size={11} /> Dados atualizados automaticamente a cada 15s — feche esta tela para voltar à gestão completa.
          </p>
        </div>
      )}
    </div>
  );
}
