import { 
  X, 
  Calendar, 
  Clock, 
  Timer, 
  FileText, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  CalendarDays,
  Trash2,
  User,
  Music,
  ExternalLink,
  ChevronLeft,
  Save,
  Users,
  Loader2,
  Check,
  LayoutList
} from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LESSON_STATUS_CONFIG, type LessonStatus } from "@/lib/status";
import RepositionModal from "@/components/aulas/RepositionModal";

interface LessonDetailModalProps {
  lesson: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: number, status: string, newDate?: string) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
}

export default function LessonDetailModal({ 
  lesson, 
  open, 
  onOpenChange, 
  onStatusChange, 
  onDelete, 
  onEdit 
}: LessonDetailModalProps) {
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [isRepositionOpen, setIsRepositionOpen] = useState(false);

  const isTurma = lesson?.lessonType === 'turma';
  const utils = trpc.useUtils();
  const [localStatuses, setLocalStatuses] = useState<Record<number, string>>({});

  const { data: turmaDetails = [], isLoading: isLoadingTurma } = trpc.lessons.getTurmaDetails.useQuery({
    groupId: lesson?.recurringGroupId || undefined,
    scheduledAt: lesson?.scheduledAt ? new Date(lesson.scheduledAt).toISOString() : "",
    title: lesson?.title || "",
  }, {
    enabled: open && !!lesson && isTurma
  });

  useEffect(() => {
    if (turmaDetails && turmaDetails.length > 0) {
      const initial: Record<number, string> = {};
      turmaDetails.forEach((item: any) => {
        initial[item.id] = item.status || 'agendada';
      });
      setLocalStatuses(initial);
    }
  }, [turmaDetails]);

  const updateTurmaAttendanceMutation = trpc.lessons.updateTurmaAttendance.useMutation({
    onSuccess: () => {
      toast.success("Frequência da turma atualizada!");
      utils.lessons.list.invalidate();
      utils.lessons.getTurmaDetails.invalidate();
    },
    onError: (e) => {
      toast.error("Erro ao atualizar chamada: " + e.message);
      utils.lessons.getTurmaDetails.invalidate();
    }
  });

  useEffect(() => {
    if (open && lesson) {
      const d = new Date(lesson.scheduledAt);
      setNewDate(format(d, "yyyy-MM-dd"));
      setNewTime(format(d, "HH:mm"));
      setIsRescheduling(false);
    }
    // FIX: depender apenas do ID da aula — `lessons.list` tem refetchInterval de
    // 10s e cada refetch cria uma NOVA referência do objeto `lesson`, o que
    // resetava o painel "Alterar Data/Horário" poucos segundos após abrir
    // (o usuário perdia a seleção antes de salvar).
  }, [open, lesson?.id]);

  if (!lesson) return null;

  const date = new Date(lesson.scheduledAt);
  
  const config = LESSON_STATUS_CONFIG[(lesson.status as LessonStatus) || "agendada"] || LESSON_STATUS_CONFIG.agendada;
  const StatusIcon = config.icon;

  const handleStudentAttendance = (lessonId: number, status: 'concluida' | 'falta' | 'agendada') => {
    setLocalStatuses(prev => ({ ...prev, [lessonId]: status }));
    updateTurmaAttendanceMutation.mutate({
      attendances: [{ lessonId, status }]
    });
  };

  const handleAllAttendance = (status: 'concluida' | 'falta') => {
    if (turmaDetails.length === 0) return;
    const newStatuses: Record<number, string> = {};
    const attendances = turmaDetails.map(t => {
      newStatuses[t.id] = status;
      return { lessonId: t.id, status };
    });
    setLocalStatuses(newStatuses);
    updateTurmaAttendanceMutation.mutate({ attendances });
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isTurma ? `Turma: ${lesson.title}` : "Detalhes da Aula"}
      description={isTurma ? "Gestão e chamada de alunos da turma" : `Visualizando aula de ${lesson.studentName || lesson.experimentalName || 'Aluno'}`}
    >
      {/* PRD 01 — modal de "Aula a Repor" (motivo obrigatório + crédito) */}
      <RepositionModal
        lesson={lesson}
        open={isRepositionOpen}
        onOpenChange={setIsRepositionOpen}
        onCreated={() => onOpenChange(false)}
      />
      <div className="space-y-4 pt-1">
        {/* Status Badge & Tipo de Aula Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary/5 border border-primary/15">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isTurma ? "bg-purple-500/15" : config.bg)}>
              {isTurma ? <Users size={20} className="text-purple-600 dark:text-purple-400" /> : <StatusIcon size={20} className={config.color} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border inline-flex items-center gap-1", config.bg, config.color, config.border)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", config.color.replace('text-', 'bg-'))} />
                  {config.label}
                </span>
                {lesson.isExperimental && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                    Experimental
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-muted-foreground mt-0.5">
                {isTurma ? `Turma (${turmaDetails.length || (lesson.studentCount || 1)} Alunos)` : (lesson.studentName || lesson.experimentalName || "Aluno")}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-extrabold text-foreground font-mono">{format(date, "HH:mm")}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{format(date, "dd/MM/yyyy")}</p>
          </div>
        </div>

        {/* Card de Informações Principais */}
        <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm space-y-2.5">
          {!isTurma ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Aluno</p>
                  <h4 className="font-bold text-foreground text-sm truncate">{lesson.studentName || lesson.experimentalName || "Não informado"}</h4>
                </div>
              </div>
              {lesson.teacherName && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">
                  <span>Prof. {lesson.teacherName}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
                <Users size={16} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Turma</p>
                <h4 className="font-bold text-foreground text-sm">{lesson.title}</h4>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/20">
              <Music size={15} className="text-primary/70 shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Instrumento</p>
                <p className="text-xs font-bold text-foreground truncate">{lesson.instrumentName || "Geral"}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/20">
              <LayoutList size={15} className="text-indigo-500/70 shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Sala</p>
                <p className="text-xs font-bold text-foreground truncate">{lesson.studioRoomName || "Sem sala fixa"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Alunos se for Turma */}
        {isTurma && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                Chamada ({turmaDetails.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAllAttendance('concluida')}
                  className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-[9px] font-black uppercase rounded-md transition-all active:scale-95 cursor-pointer"
                >
                  Todos Vieram
                </button>
                <button
                  type="button"
                  onClick={() => handleAllAttendance('falta')}
                  className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 text-[9px] font-black uppercase rounded-md transition-all active:scale-95 cursor-pointer"
                >
                  Todos Faltaram
                </button>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto subtle-scrollbar">
              {isLoadingTurma ? (
                <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin text-primary" /> Carregando alunos...
                </div>
              ) : turmaDetails.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground italic">Nenhum aluno registrado.</div>
              ) : (
                turmaDetails.map((item: any) => {
                  const currentStatus = localStatuses[item.id] || item.status || 'agendada';
                  const itemCfg = LESSON_STATUS_CONFIG[(currentStatus as LessonStatus) || "agendada"] || LESSON_STATUS_CONFIG.agendada;
                  const isConcluido = currentStatus === 'concluida';
                  const isFalta = currentStatus === 'falta';

                  return (
                    <div key={item.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="w-7 h-7 border border-border shrink-0">
                          <AvatarImage src={item.studentAvatar || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold uppercase">
                            {item.studentName ? item.studentName.substring(0, 2) : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{item.studentName || "Aluno"}</p>
                          <span className={cn("text-[7px] font-black uppercase px-1 py-0.2 rounded border inline-block", itemCfg.bg, itemCfg.color, itemCfg.border)}>
                            {itemCfg.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStudentAttendance(item.id, isConcluido ? 'agendada' : 'concluida')}
                          className={cn(
                            "h-7 px-2 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 cursor-pointer",
                            isConcluido 
                              ? "bg-emerald-500 text-white shadow-sm font-extrabold" 
                              : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                          )}
                        >
                          <Check size={10} /> Veio
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStudentAttendance(item.id, isFalta ? 'agendada' : 'falta')}
                          className={cn(
                            "h-7 px-2 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 cursor-pointer",
                            isFalta 
                              ? "bg-rose-500 text-white shadow-sm font-extrabold" 
                              : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                          )}
                        >
                          <X size={10} /> Falta
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Data, Horário e Duração */}
        {!isRescheduling ? (
          <div className="grid grid-cols-3 gap-2">
            <button 
              type="button"
              onClick={() => setIsRescheduling(true)}
              className="flex flex-col items-start gap-1 p-2.5 bg-card hover:bg-primary/5 hover:border-primary/40 rounded-xl border border-border/60 transition-all text-left cursor-pointer group"
              title="Clique para alterar a data"
            >
              <span className="text-[8px] font-black text-muted-foreground uppercase flex items-center gap-1">
                <Calendar size={11} className="text-primary" /> Data
              </span>
              <span className="text-xs font-bold text-foreground">{format(date, "dd/MM/yyyy")}</span>
            </button>

            <button 
              type="button"
              onClick={() => setIsRescheduling(true)}
              className="flex flex-col items-start gap-1 p-2.5 bg-card hover:bg-primary/5 hover:border-primary/40 rounded-xl border border-border/60 transition-all text-left cursor-pointer group"
              title="Clique para alterar o horário"
            >
              <span className="text-[8px] font-black text-muted-foreground uppercase flex items-center gap-1">
                <Clock size={11} className="text-primary" /> Horário
              </span>
              <span className="text-xs font-bold text-foreground font-mono">{format(date, "HH:mm")}</span>
            </button>

            <div className="flex flex-col items-start gap-1 p-2.5 bg-card rounded-xl border border-border/60">
              <span className="text-[8px] font-black text-muted-foreground uppercase flex items-center gap-1">
                <Timer size={11} className="text-primary" /> Duração
              </span>
              <span className="text-xs font-bold text-foreground">{lesson.duration || 60} min</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border-2 border-primary/20 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Alterar Data / Horário</h4>
              <span className="text-[10px] font-bold text-muted-foreground">{newTime || "00:00"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground/60 px-1">Data</label>
                <input 
                  type="date" 
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full h-10 bg-background border border-border/40 rounded-xl px-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground/60 px-1">Hora</label>
                <input 
                  type="time" 
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full h-10 bg-background border border-border/40 rounded-xl px-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewTime(t)}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer",
                    newTime === t
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted/60 border-border/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Observações */}
        {(lesson.description || lesson.notes) && (
          <div className="p-3 bg-muted/15 rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground leading-relaxed italic">
            <span className="font-bold not-italic text-[9px] uppercase tracking-wider block text-foreground/70 mb-0.5">Observações:</span>
            {lesson.description || lesson.notes}
          </div>
        )}

        {/* Botões de Ação */}
        <div className="space-y-2 pt-1">
          {!isTurma && (!isRescheduling ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                onClick={() => { onStatusChange(lesson.id, "concluida"); onOpenChange(false); }}
                className="flex flex-col items-center justify-center gap-1 h-12 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border border-emerald-500/20 active:scale-95"
              >
                <CheckCircle2 size={15} />
                Concluída
              </button>
              <button
                onClick={() => { onStatusChange(lesson.id, "falta"); onOpenChange(false); }}
                className="flex flex-col items-center justify-center gap-1 h-12 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border border-orange-500/20 active:scale-95"
              >
                <AlertCircle size={15} />
                Falta
              </button>
              {/* PRD 01: "A Repor" só para aulas com aluno e ainda não marcadas */}
              {lesson.studentId && !lesson.isExperimental && lesson.status !== "a_repor" && (
                <button
                  onClick={() => setIsRepositionOpen(true)}
                  className="flex flex-col items-center justify-center gap-1 h-12 bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border border-violet-500/20 active:scale-95"
                >
                  <LayoutList size={15} />
                  A Repor
                </button>
              )}
              <button
                onClick={() => setIsRescheduling(true)}
                className="flex flex-col items-center justify-center gap-1 h-12 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border border-yellow-500/20 active:scale-95"
              >
                <CalendarDays size={15} />
                Remarcar
              </button>
              <button
                onClick={() => { onStatusChange(lesson.id, "cancelada"); onOpenChange(false); }}
                className="flex flex-col items-center justify-center gap-1 h-12 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border border-rose-500/20 active:scale-95"
              >
                <XCircle size={15} />
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={() => setIsRescheduling(false)}
                className="h-11 px-4 bg-muted/20 hover:bg-muted/30 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <button 
                onClick={() => {
                  const fullDate = new Date(`${newDate}T${newTime}:00`);
                  onOpenChange(false);
                  setTimeout(() => {
                    onStatusChange(lesson.id, "remarcada", fullDate.toISOString());
                  }, 150);
                }}
                className="flex-1 h-11 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save size={14} /> Salvar Horário
              </button>
            </div>
          ))}

          {/* Botões Inferiores: Editar / Excluir */}
          <div className="flex gap-2 pt-1">
            <button 
              onClick={() => { onEdit(lesson.id); onOpenChange(false); }}
              className="flex-1 flex items-center justify-center gap-2 h-11 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <ExternalLink size={14} />
              Editar Agendamento
            </button>
            <button 
              onClick={() => onDelete(lesson.id)}
              className="w-11 h-11 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl transition-all cursor-pointer border border-rose-500/20"
              title="Excluir aula"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
