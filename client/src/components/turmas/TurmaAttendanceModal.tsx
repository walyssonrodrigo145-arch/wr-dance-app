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
import { Loader2, ClipboardCheck, Check, X, FileText, CalendarOff, UserPlus, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addScope, setAddScope] = useState<"single" | "upcoming">("single");
  const [removing, setRemoving] = useState<{ studentId: number; name: string; isExtra: boolean } | null>(null);

  const today = trpc.turmas.todayLesson.useQuery({ id: turmaId! }, { enabled: open && !!turmaId });
  const lessonId = today.data?.lesson?.id ?? null;

  const attendance = trpc.turmaAttendance.get.useQuery(
    { lessonId: lessonId! },
    { enabled: open && !!lessonId }
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const searchResults = trpc.turmas.searchAlunos.useQuery(
    { q: debouncedSearch, turmaId: turmaId! },
    { enabled: open && showAdd && debouncedSearch.trim().length >= 2 && !!turmaId }
  );

  const addMutation = trpc.turmaAttendance.addStudent.useMutation({
    onSuccess: (res: { studentName?: string; lessons?: number }) => {
      toast.success(`${res.studentName || "Aluno"} incluído${(res.lessons || 1) > 1 ? ` em ${res.lessons} aulas` : " na aula"}!`);
      utils.turmaAttendance.get.invalidate();
      setSearch("");
      setDebouncedSearch("");
      setShowAdd(false);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível incluir o aluno."),
  });

  const removeMutation = trpc.turmaAttendance.removeStudent.useMutation({
    onSuccess: () => {
      toast.success("Aluno removido da aula.");
      utils.turmaAttendance.get.invalidate();
      setRemoving(null);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível remover o aluno."),
  });

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
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest gap-1.5" onClick={() => setShowAdd((v) => !v)}>
                    <UserPlus size={12} /> Adicionar à aula
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest" onClick={() => setAll("presente")}>
                    Todos presentes
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest" onClick={() => setAll("ausente")}>
                    Todos ausentes
                  </Button>
                </div>
              </div>

              {showAdd && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Incluir aluno extra (reposição/visitante)</p>
                    <select
                      value={addScope}
                      onChange={(e) => setAddScope(e.target.value as "single" | "upcoming")}
                      className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    >
                      <option value="single">Só esta aula</option>
                      <option value="upcoming">Esta e as próximas</option>
                    </select>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar aluno por nome ou e-mail (fora da turma)..."
                      className="w-full h-9 rounded-lg border border-border/60 bg-background pl-9 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {debouncedSearch.trim().length >= 2 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40 bg-background">
                      {searchResults.isLoading ? (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground p-3 justify-center">
                          <Loader2 size={12} className="animate-spin" /> Buscando...
                        </div>
                      ) : (searchResults.data || []).filter((c: any) => !roster.some((r: any) => r.id === c.id)).length === 0 ? (
                        <p className="text-[10px] text-muted-foreground p-3 text-center">Nenhum aluno encontrado fora da turma.</p>
                      ) : (
                        (searchResults.data || [])
                          .filter((c: any) => !roster.some((r: any) => r.id === c.id))
                          .map((c: any) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => addMutation.mutate({ lessonId: lessonId!, studentId: c.id, scope: addScope })}
                              disabled={addMutation.isPending}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary/5 transition-colors"
                            >
                              <UserPlus size={12} className="text-primary shrink-0" />
                              <span className="flex-1 min-w-0 text-xs font-bold text-foreground truncate">{c.name}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-primary">Incluir</span>
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-border/60 divide-y divide-border/40 max-h-[45vh] overflow-y-auto">
                {roster.map((s: any) => {
                  const current = statuses[s.id] || "presente";
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 min-w-0 text-xs font-bold text-foreground truncate">
                        {s.name}
                        {s.isExtra && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-violet-500/15 text-violet-600 dark:text-violet-400 align-middle">
                            Extra
                          </span>
                        )}
                      </span>
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
                        <button
                          type="button"
                          onClick={() => setRemoving({ studentId: s.id, name: s.name, isExtra: !!s.isExtra })}
                          className="ml-1 w-8 h-8 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
                          title="Remover desta aula"
                        >
                          <Trash2 size={13} />
                        </button>
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

      <AlertDialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removing?.name} desta aula?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.isExtra
                ? "Aluno extra: a inclusão pode ser removida só desta aula ou de todas as próximas."
                : "Aluno da turma: ele sai apenas desta aula (a matrícula continua). Para sair da turma, use Matrículas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            {removing?.isExtra && (
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                onClick={() => removing && removeMutation.mutate({ lessonId: lessonId!, studentId: removing.studentId, scope: "upcoming" })}
              >
                Esta e as próximas
              </AlertDialogAction>
            )}
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => removing && removeMutation.mutate({ lessonId: lessonId!, studentId: removing.studentId, scope: "single" })}
            >
              Só esta aula
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
