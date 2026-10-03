import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "@/lib/dates";
import {
  Theater, Loader2, CheckCircle2, Users, Clock, ChevronDown, ChevronUp,
  Play, Flag, Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const STAGE_STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  nao_chegou: { label: "Não chegou", className: "bg-slate-500/10 text-slate-500 border-slate-500/30", dot: "bg-slate-400" },
  chegou: { label: "Chegou", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30", dot: "bg-blue-500" },
  figurino_pronto: { label: "Figurino pronto", className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30", dot: "bg-indigo-500" },
  maquiagem_pronta: { label: "Maquiagem pronta", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30", dot: "bg-violet-500" },
  em_preparacao: { label: "Em preparação", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
  aguardando_palco: { label: "Aguardando palco", className: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30", dot: "bg-teal-500" },
  no_palco: { label: "No palco", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
  finalizado: { label: "Finalizado", className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30", dot: "bg-slate-500" },
  liberado: { label: "Liberado", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
};

export function BackstageTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.eventos.getById.useQuery({ id: eventId });
  const [expanded, setExpanded] = useState<number | null>(null);

  const invalidate = () => utils.eventos.getById.invalidate({ id: eventId });

  const updateParticipant = trpc.eventos.updateParticipant.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const setStageState = trpc.eventos.setStageState.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.state === "em_cena" ? "Apresentação em cena!" : vars.state === "finalizada" ? "Apresentação finalizada." : "Estado atualizado.");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const pres = useMemo(() => [...((data?.coreografias ?? []) as any[])].sort((a, b) => a.ordem - b.ordem), [data?.coreografias]);
  const participantsByStudent = useMemo(() => {
    const map = new Map<number, any>();
    for (const p of (data?.participantes ?? []) as any[]) map.set(p.studentId, p);
    return map;
  }, [data?.participantes]);

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  if (pres.length === 0) {
    return (
      <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
        <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Theater size={22} /></span></div>
        <p className="font-black text-foreground text-sm">Sem apresentações no programa</p>
        <p className="text-xs text-muted-foreground mt-1">Vincule coreografias na aba Programação para operar o backstage.</p>
      </div>
    );
  }

  const onStage = pres.find((p) => p.stageState === "em_cena") ?? null;
  const onStageIdx = onStage ? pres.findIndex((p) => p.id === onStage.id) : -1;
  const next = onStageIdx >= 0 ? pres[onStageIdx + 1] ?? null : pres.find((p) => p.stageState !== "finalizada") ?? null;
  const upcoming = onStageIdx >= 0 ? pres.slice(onStageIdx + 2, onStageIdx + 4) : pres.filter((p) => p.id !== next?.id).slice(0, 2);

  const presence = (p: any) => {
    const alunos = (p.alunos ?? []) as any[];
    const present = alunos.filter((a) => {
      const part = participantsByStudent.get(a.id);
      return part && part.stageStatus && part.stageStatus !== "nao_chegou";
    }).length;
    return { total: alunos.length, present };
  };

  const renderCard = (p: any, kind: "on" | "next" | "prep") => {
    const info = presence(p);
    const kindMeta = kind === "on"
      ? { title: "AGORA NO PALCO", className: "border-emerald-500/40 bg-emerald-500/5", badge: "bg-emerald-600 text-white border-emerald-600" }
      : kind === "next"
        ? { title: "PRÓXIMA", className: "border-indigo-500/30 bg-indigo-500/5", badge: "bg-indigo-600 text-white border-indigo-600" }
        : { title: "EM PREPARAÇÃO", className: "border-border bg-card", badge: "bg-muted text-muted-foreground border-border" };
    const missing = info.total - info.present;
    return (
      <div key={p.id} className={cn("rounded-2xl border p-4 space-y-3", kindMeta.className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kindMeta.title}</p>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px] font-black", kindMeta.badge)}>{p.ordem} · {p.title}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-muted-foreground">
          <span className="flex items-center gap-1"><Users size={12} /> {info.total} aluno(s)</span>
          <span className={cn("flex items-center gap-1", missing === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {missing === 0 ? "Todos presentes" : `${missing} aluno(s) ausente(s)`}
          </span>
          {p.entryAt && <span className="flex items-center gap-1"><Clock size={12} /> previsto {format(p.entryAt, "HH:mm")}</span>}
          {p.dressingRoom && <span>Camarim: {p.dressingRoom}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {kind !== "on" && (
            <Button size="sm" variant="outline" onClick={() => setStageState.mutate({ id: p.id, state: "em_cena" })} disabled={setStageState.isPending}>
              <Play size={12} className="mr-1" /> Colocar em cena
            </Button>
          )}
          {kind === "on" && (
            <Button size="sm" variant="outline" onClick={() => setStageState.mutate({ id: p.id, state: "finalizada" })} disabled={setStageState.isPending}>
              <Flag size={12} className="mr-1" /> Finalizar apresentação
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
            {expanded === p.id ? <ChevronUp size={13} className="mr-1" /> : <ChevronDown size={13} className="mr-1" />} Alunos
          </Button>
        </div>

        {expanded === p.id && (
          <div className="space-y-1.5">
            {(p.alunos ?? []).length === 0 ? (
              <p className="text-xs font-bold text-muted-foreground py-2">Coreografia sem elenco cadastrado.</p>
            ) : (p.alunos as any[]).map((a) => {
              const part = participantsByStudent.get(a.id);
              const meta = STAGE_STATUS_META[part?.stageStatus ?? "nao_chegou"] ?? STAGE_STATUS_META.nao_chegou;
              return (
                <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2">
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="bg-indigo-600 text-white text-[9px] font-black">
                      {a.name?.split(" ").map((x: string) => x[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-xs font-black text-foreground truncate flex-1 min-w-0">{a.name}</p>
                  {part ? (
                    <Select
                      value={part.stageStatus ?? "nao_chegou"}
                      onValueChange={(value) => updateParticipant.mutate({ id: part.id, stageStatus: value as any })}
                    >
                      <SelectTrigger className="w-[170px] h-8 text-[11px] font-bold bg-background">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dot)} />
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STAGE_STATUS_META).map(([value, m]) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", m.dot)} /> {m.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-black bg-muted text-muted-foreground border-border">não é participante</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-muted-foreground">
        Tela operacional do dia: marque a apresentação <span className="font-black text-foreground">em cena</span> e acompanhe presença e preparação das alunas.
      </p>
      {onStage ? renderCard(onStage, "on") : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Nenhuma apresentação em cena. Use "Colocar em cena" na próxima apresentação.
          </p>
        </div>
      )}
      {next && next.id !== onStage?.id && renderCard(next, "next")}
      {upcoming.map((p) => renderCard(p, "prep"))}
      {pres.some((p) => p.stageState === "finalizada") && (
        <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
          <Music size={11} /> {pres.filter((p) => p.stageState === "finalizada").length} apresentação(ões) finalizada(s) — o programa completo fica na aba Programação.
        </p>
      )}
    </div>
  );
}
