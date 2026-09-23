import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ClipboardCheck, Check, X, FileText, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceStatus = "presente" | "ausente" | "justificado";

type Props = {
  turmaId: number | null;
  turmaName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STATUS_META: Record<AttendanceStatus, { label: string; short: string; cls: string; icon: typeof Check }> = {
  presente: { label: "Presente", short: "P", cls: "bg-emerald-600 text-white border-emerald-600", icon: Check },
  ausente: { label: "Ausente", short: "A", cls: "bg-rose-600 text-white border-rose-600", icon: X },
  justificado: { label: "Justificado", short: "J", cls: "bg-amber-500 text-white border-amber-500", icon: FileText },
};

/** Chamada da turma: lista os alunos matriculados e registra presença por aluno. */
export function TurmaAttendanceModal({ turmaId, turmaName, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus>>({});

  const today = trpc.turmas.todayLesson.useQuery({ id: turmaId! }, { enabled: open && !!turmaId });
  const lessonId = today.data?.lesson?.id ?? null;

  const attendance = trpc.turmaAttendance.get.useQuery(
    { lessonId: lessonId! },
    { enabled: open && !!lessonId }
  );

  useEffect(() => {
    if (!attendance.data) return;
    const map: Record<number, AttendanceStatus> = {};
    attendance.data.roster.forEach((s: any) => { map[s.id] = "presente"; });
    attendance.data.attendance.forEach((a: any) => {
      if (a.studentId in map) map[a.studentId] = a.status as AttendanceStatus;
    });
    setStatuses(map);
  }, [attendance.data]);

  const save = trpc.turmaAttendance.save.useMutation({
    onSuccess: (res: { saved: number }) => {
      toast.success(`Chamada salva (${res.saved} aluno(s)).`);
      utils.turmaAttendance.get.invalidate();
      utils.turmas.todayLesson.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível salvar a chamada."),
  });

  const roster = attendance.data?.roster || [];
  const presentCount = useMemo(
    () => roster.filter((s: any) => (statuses[s.id] || "presente") === "presente").length,
    [roster, statuses]
  );

  const setAll = (status: AttendanceStatus) => {
    const map: Record<number, AttendanceStatus> = {};
    roster.forEach((s: any) => { map[s.id] = status; });
    setStatuses(map);
  };

  const submit = () => {
    if (!lessonId) return;
    const entries = roster.map((s: any) => ({ studentId: s.id, status: statuses[s.id] || "presente" }));
    if (entries.length === 0) { toast.error("Esta turma ainda não tem alunos matriculados."); return; }
    save.mutate({ lessonId, entries });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-primary" /> Chamada da turma
          </DialogTitle>
          <DialogDescription>
            {turmaName ? `${turmaName} • ` : ""}
            {today.data?.lesson
              ? `Aula de hoje (${new Date(today.data.lesson.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })})`
              : "Aula de hoje"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {today.isLoading || attendance.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader2 size={14} className="animate-spin" /> Carregando a turma...
            </div>
          ) : !lessonId ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5 text-center space-y-1.5">
              <CalendarOff size={20} className="mx-auto text-muted-foreground" />
              <p className="text-xs font-bold text-foreground">Não há aula desta turma hoje.</p>
              <p className="text-[10px] text-muted-foreground">
                Gere as aulas da grade ("Gerar aulas") ou confira os dias/horário da turma.
              </p>
            </div>
          ) : roster.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5 text-center">
              <p className="text-xs font-bold text-foreground">Esta turma ainda não tem alunos matriculados.</p>
              <p className="text-[10px] text-muted-foreground mt-1">Matricule alunos em "Matrículas" para fazer a chamada.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {roster.length} aluno(s) • {presentCount} presente(s)
                </p>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest" onClick={() => setAll("presente")}>
                    Todos presentes
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest" onClick={() => setAll("ausente")}>
                    Todos ausentes
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 divide-y divide-border/40 max-h-[45vh] overflow-y-auto">
                {roster.map((s: any) => {
                  const current = statuses[s.id] || "presente";
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 min-w-0 text-xs font-bold text-foreground truncate">{s.name}</span>
                      <div className="flex items-center gap-1">
                        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((st) => {
                          const meta = STATUS_META[st];
                          const active = current === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: st }))}
                              className={cn(
                                "w-8 h-8 rounded-lg border text-[11px] font-black flex items-center justify-center transition-all cursor-pointer",
                                active ? meta.cls : "border-border/60 text-muted-foreground hover:bg-muted/60"
                              )}
                              title={meta.label}
                            >
                              {meta.short}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">
                  Cancelar
                </Button>
                <Button type="button" onClick={submit} disabled={save.isPending} className="h-10 rounded-xl px-5 text-xs font-bold gap-2">
                  {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
                  Salvar chamada
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
