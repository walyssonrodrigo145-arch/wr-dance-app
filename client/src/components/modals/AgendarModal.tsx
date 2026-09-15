import { useState, useEffect, useMemo, useRef } from "react";
import { 
  User, 
  Clock, 
  Timer, 
  FileText, 
  CheckCircle2, 
  Loader2,
  Music,
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  Beaker,
  UserPlus,
  Users,
  Search,
  ChevronDown,
  X,
  LayoutList
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { safeFormat } from "@/lib/dates";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn, formatFriendlyError } from "@/lib/utils";
import {
  generateOccurrences,
  RECURRENCE_INTERVALS,
  RECURRENCE_DURATIONS,
  MAX_OCCURRENCES,
  type RecurrenceInterval,
} from "@shared/recurrence";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

interface AgendarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  editingLesson?: any;
}

const getSmartInitialTime = (d?: Date | null) => {
  if (d && (d.getHours() !== 0 || d.getMinutes() !== 0)) {
    return format(d, "HH:mm");
  }
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour >= 8 && currentHour <= 20) {
    const nextHour = String(currentHour + 1).padStart(2, '0');
    return `${nextHour}:00`;
  }
  return "14:00";
};

export default function AgendarModal({ open, onOpenChange, initialDate, editingLesson }: AgendarModalProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: students = [] } = trpc.students.list.useQuery(undefined, { enabled: open });
  const { data: instruments = [] } = trpc.instruments.list.useQuery(undefined, { enabled: open });
  const { data: studioRooms = [] } = trpc.studioRooms.list.useQuery(undefined, { enabled: open });
  // Busca os dados completos da aula diretamente do banco ao editar (garante studioRoomId atualizado)
  const { data: freshLesson } = trpc.lessons.getById.useQuery(
    { id: editingLesson?.id ?? 0 },
    { enabled: open && !!editingLesson?.id, staleTime: 0 }
  );
  
  const { data: settings } = trpc.settings.get.useQuery(undefined, { enabled: open });
  
  const [formData, setFormData] = useState({
    studentId: "",
    title: "",
    time: getSmartInitialTime(initialDate),
    duration: settings?.lessonDuration ?? 60,
    notes: "",
    instrumentId: "",
    studioRoomId: "",
    weeksCount: 1,
    interval: "semanal" as RecurrenceInterval,
    recurrenceCount: 4,
    updateSeries: false,
    date: format(new Date(), "yyyy-MM-dd"),
    isExperimental: false,
    experimentalName: "",
    experimentalPhone: "",
    lessonType: "individual" as "individual" | "turma",
    turmaStudentIds: [] as number[],
    lessonsPerWeek: 1,
    weeklySlots: [
      { dayOfWeek: 1, time: getSmartInitialTime(initialDate), studioRoomId: "" }
    ] as Array<{ dayOfWeek: number; time: string; studioRoomId: string }>,
  });

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "conflicts" | "ask_series">("form");
  const [batchItems, setBatchItems] = useState<any[]>([]);

  // ── Recorrência (PRD_AGENDA_RECORRENCIA_002) ────────────────────────────────
  const recurrenceDuration = formData.interval === "semanal" ? formData.weeksCount : formData.recurrenceCount;
  const isBatchMode = !editingLesson && !formData.isExperimental && formData.lessonType !== "turma" && recurrenceDuration > 1;

  const buildOccurrences = () => {
    const [y, M, d] = formData.date.split("-").map(Number);
    const base = new Date(y, M - 1, d);
    const slotsToUse = (formData.interval !== "mensal_fixo" && formData.lessonsPerWeek > 1 && formData.weeklySlots && formData.weeklySlots.length > 0)
      ? formData.weeklySlots
      : [];
    return generateOccurrences(formData.interval, recurrenceDuration, base, slotsToUse, formData.time);
  };

  const previewOccurrences = useMemo(() => (isBatchMode ? buildOccurrences() : []), [isBatchMode, formData.interval, recurrenceDuration, formData.date, formData.lessonsPerWeek, formData.weeklySlots, formData.time]);
  const exceedsLimit = previewOccurrences.length > MAX_OCCURRENCES;

  // Picker de alunos (MOBILE FIX: substitui dropdown absoluto que quebrava no Drawer)
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const lastLoadedLessonId = useRef<string | number | null>(null);

  useEffect(() => {
    if (!open) {
      lastLoadedLessonId.current = null;
      setStudentPickerOpen(false);
      setStudentSearch("");
      return;
    }

    if (editingLesson) {
      const lessonId = editingLesson.id;
      const hasFresh = freshLesson && freshLesson.id === lessonId;
      const currentKey = hasFresh ? `fresh_${lessonId}` : `editing_${lessonId}`;

      if (lastLoadedLessonId.current !== currentKey) {
        const source = hasFresh ? freshLesson : editingLesson;
        setFormData({
          studentId: source.studentId?.toString() || "",
          title: source.title || "",
          time: format(new Date(source.scheduledAt), "HH:mm"),
          date: format(new Date(source.scheduledAt), "yyyy-MM-dd"),
          duration: source.duration || 60,
          notes: source.notes || "",
          instrumentId: source.instrumentId?.toString() || "",
          studioRoomId: source.studioRoomId != null ? source.studioRoomId.toString() : "",
          weeksCount: 1,
          interval: "semanal",
          recurrenceCount: 4,
          updateSeries: false,
          isExperimental: !!source.isExperimental,
          experimentalName: source.experimentalName || "",
          experimentalPhone: (source as any).experimentalPhone || "",
          lessonType: source.lessonType || "individual",
          turmaStudentIds: [],
          lessonsPerWeek: 1,
          weeklySlots: [
            { dayOfWeek: new Date(source.scheduledAt).getDay(), time: format(new Date(source.scheduledAt), "HH:mm"), studioRoomId: source.studioRoomId != null ? source.studioRoomId.toString() : "" }
          ]
        });
        lastLoadedLessonId.current = currentKey;
      }
    } else if (lastLoadedLessonId.current !== "new") {
      const defaultDuration = settings?.lessonDuration ? Number(settings.lessonDuration) : 60;
      const smartTime = getSmartInitialTime(initialDate);
      setFormData({
        studentId: "",
        title: "",
        time: smartTime,
        date: initialDate ? format(initialDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        duration: defaultDuration,
        notes: "",
        instrumentId: "",
        studioRoomId: "",
        weeksCount: 1,
        interval: "semanal",
        recurrenceCount: 4,
        updateSeries: false,
        isExperimental: false,
        experimentalName: "",
        experimentalPhone: "",
        lessonType: "individual",
        turmaStudentIds: [],
        lessonsPerWeek: 1,
        weeklySlots: [
          { dayOfWeek: initialDate ? new Date(initialDate).getDay() : 1, time: smartTime, studioRoomId: "" }
        ]
      });
      lastLoadedLessonId.current = "new";
    }
    setConflictError(null);
    setStep("form");
  }, [open, initialDate, editingLesson, freshLesson, settings]);

  // BUG FIX: checkConflicts é uma MUTATION no server (aceita slots dinâmicos).
  // Antes aqui usava-se useQuery — a propriedade não existia e isso quebrava em runtime.
  const checkConflictsMutation = trpc.lessons.checkConflicts.useMutation();

  const createBatchMutation = trpc.lessons.createBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} aula(s) agendada(s) com sucesso!`);
      utils.lessons.list.invalidate();
      utils.lessons.listRange.invalidate();
      utils.lessons.getById.invalidate();
      utils.studioRooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro no agendamento em lote"))
  });

  const createTurmaMutation = trpc.lessons.createTurma.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} aula(s) de turma agendada(s)!`);
      utils.lessons.list.invalidate();
      utils.lessons.listRange.invalidate();
      utils.lessons.getById.invalidate();
      utils.studioRooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro no agendamento de turma"))
  });

  const resetForm = () => {
    setFormData({
      studentId: "",
      title: "",
      time: initialDate ? format(initialDate, "HH:mm") : "09:00",
      date: initialDate ? format(initialDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      duration: 60,
      notes: "",
      instrumentId: "",
      studioRoomId: "",
      weeksCount: 1,
      interval: "semanal",
      recurrenceCount: 4,
      updateSeries: false,
      isExperimental: false,
      experimentalName: "",
      experimentalPhone: "",
      lessonType: "individual",
      turmaStudentIds: [],
      lessonsPerWeek: 1,
      weeklySlots: [
        { dayOfWeek: initialDate ? new Date(initialDate).getDay() : 1, time: initialDate ? format(initialDate, "HH:mm") : "09:00", studioRoomId: "" }
      ]
    });
    setStep("form");
    setBatchItems([]);
    setConflictError(null);
  };

  const createMutation = trpc.lessons.create.useMutation({
    onSuccess: () => {
      toast.success("Aula agendada com sucesso!");
      utils.lessons.list.invalidate();
      utils.lessons.listRange.invalidate();
      (utils.lessons as any).getById?.invalidate();
      utils.students.list.invalidate();
      (utils.students as any).getById?.invalidate();
      utils.studioRooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => {
      if (e.message.includes("conflito") || e.message.includes("sobrepõe")) {
        setConflictError(e.message);
      } else {
        toast.error(formatFriendlyError(e, "Erro ao agendar aula"));
      }
    }
  });

  const updateMutation = trpc.lessons.update.useMutation({
    onSuccess: () => {
      toast.success("Aula atualizada com sucesso!");
      utils.lessons.list.invalidate();
      utils.lessons.listRange.invalidate();
      (utils.lessons as any).getById?.invalidate();
      utils.students.list.invalidate();
      (utils.students as any).getById?.invalidate();
      utils.studioRooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      onOpenChange(false);
      resetForm();
    },
    onError: (e) => {
      if (e.message.includes("conflito") || e.message.includes("sobrepõe")) {
        setConflictError(e.message);
      } else {
        toast.error(formatFriendlyError(e, "Erro ao atualizar aula"));
      }
    }
  });

  const handleProcessSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);
    
    if (formData.lessonType === "turma") {
      if (!formData.title) {
        toast.error("Por favor, defina o Nome da Turma.");
        return;
      }
      if (formData.turmaStudentIds.length === 0) {
        toast.error("Por favor, selecione pelo menos um aluno para a turma.");
        return;
      }
      
      const [y, M, d] = formData.date.split("-").map(Number);
      const [hours, minutes] = formData.time.split(":").map(Number);
      const scheduledDate = new Date(y, M - 1, d, hours, minutes, 0, 0);
      
      createTurmaMutation.mutate({
        studentIds: formData.turmaStudentIds,
        title: formData.title,
        scheduledAt: scheduledDate.toISOString(),
        duration: formData.duration,
        notes: formData.notes,
        instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
        studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
        weeksCount: formData.weeksCount,
      });
      return;
    }

    if (!formData.isExperimental && !formData.studentId) {
      toast.error("Por favor, selecione um aluno.");
      return;
    }

    if (formData.isExperimental && !formData.experimentalName) {
      toast.error("Por favor, informe o nome do aluno.");
      return;
    }

    if (formData.isExperimental && !formData.experimentalPhone) {
      toast.error("Por favor, informe o telefone/WhatsApp do aluno para envio do lembrete automático.");
      return;
    }

    // Título padrão se estiver vazio
    const student = students?.find((s: any) => s.id.toString() === formData.studentId);
    const studentLabel = formData.isExperimental ? formData.experimentalName : student?.name;
    const instrument = instruments?.find(i => i.id.toString() === formData.instrumentId);
    const submissionTitle = formData.title || (instrument ? `Aula de ${instrument.name}` : `Aula de Música (${studentLabel})`);

    const [y, M, d] = formData.date.split("-").map(Number);
    const [hours, minutes] = formData.time.split(":").map(Number);
    const scheduledDate = new Date(y, M - 1, d, hours, minutes, 0, 0);

    const doEdit = (updateSeriesFlag: boolean) => {
      updateMutation.mutate({
        id: editingLesson.id,
        studentId: formData.isExperimental ? null : (formData.studentId ? Number(formData.studentId) : null),
        isExperimental: formData.isExperimental,
        experimentalName: formData.experimentalName,
        experimentalPhone: formData.experimentalPhone,
        title: submissionTitle,
        duration: formData.duration,
        notes: formData.notes,
        instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
        studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
        scheduledAt: scheduledDate.toISOString(),
        lessonType: formData.lessonType,
        updateSeries: updateSeriesFlag
      });
    };

    if (editingLesson) {
      if (editingLesson.recurringGroupId && step !== "ask_series") {
        setStep("ask_series");
        return;
      }
      doEdit(formData.updateSeries);
      return;
    }

    if (isBatchMode) {
      try {
        // Gerar todas as datas conforme o intervalo escolhido (semanal/quinzenal/mensal)
        const occurrences = buildOccurrences();
        const allItems: Array<{ scheduledAt: string; studioRoomId?: number | null }> = occurrences.map((o) => ({
          scheduledAt: o.date.toISOString(),
          studioRoomId: o.slot?.studioRoomId ? Number(o.slot.studioRoomId) : (formData.studioRoomId ? Number(formData.studioRoomId) : null),
        }));

        if (allItems.length > MAX_OCCURRENCES) {
          toast.error(`Limite de ${MAX_OCCURRENCES} aulas por geração. Reduza a duração da série.`);
          return;
        }

        const conflictInput = {
          duration: formData.duration,
          weeksCount: Math.min(recurrenceDuration, 104),
          studioRoomId: formData.studioRoomId ? parseInt(formData.studioRoomId) : undefined,
          slots: allItems.map(item => ({
            scheduledAt: item.scheduledAt,
            studioRoomId: item.studioRoomId
          }))
        };
        const conflicts = { data: await checkConflictsMutation.mutateAsync(conflictInput) };
        if (conflicts.data) {
          const hasAnyConflict = conflicts.data.some((c: any) => c.hasConflict);
          if (hasAnyConflict) {
            setBatchItems(conflicts.data.map((c: any) => ({ scheduledAt: c.date, hasConflict: c.hasConflict, conflictingWith: c.conflictingWith, force: false })));
            setStep("conflicts");
          } else {
            createBatchMutation.mutate({
              studentId: Number(formData.studentId),
              title: submissionTitle,
              duration: formData.duration,
              notes: formData.notes,
              instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
              studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
              recurrence: formData.interval,
              items: allItems.map((c: any) => ({ scheduledAt: c.scheduledAt, force: false }))
            });
          }
        }
      } catch (err) {
        toast.error("Erro ao validar conflitos.");
      }
    } else {
      createMutation.mutate({
        studentId: formData.isExperimental ? null : (formData.studentId ? Number(formData.studentId) : null),
        isExperimental: formData.isExperimental,
        experimentalName: formData.experimentalName,
        experimentalPhone: formData.experimentalPhone,
        title: submissionTitle,
        scheduledAt: scheduledDate.toISOString(),
        duration: formData.duration,
        notes: formData.notes,
        lessonType: formData.lessonType,
        instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
        studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null
      });
    }
  };

  const handleConfirmBatch = () => {
    const instrument = instruments?.find(i => i.id.toString() === formData.instrumentId);
    const submissionTitle = formData.title || (instrument ? `Aula de ${instrument.name}` : "Aula de Música");

    createBatchMutation.mutate({
      studentId: Number(formData.studentId),
      title: submissionTitle,
      duration: formData.duration,
      notes: formData.notes,
      instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
      studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
      recurrence: formData.interval,
      items: batchItems.map(item => ({
        scheduledAt: item.scheduledAt,
        force: item.force
      }))
    });
  };

  return (
    <>
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingLesson ? "Editar Aula" : (isBatchMode ? "Agendamento Recorrente" : "Novo Agendamento")}
      description={editingLesson ? `Ajuste os detalhes da aula` : (isBatchMode ? "Série de aulas automáticas para este horário." : "Agende uma nova aula para o seu aluno.")}
    >
      {step === "form" ? (
        <form onSubmit={handleProcessSubmission} className="space-y-6 pt-2 pb-10 md:pb-0">
          
          {/* Toggle de Modos */}
          <div className="flex items-center gap-2 p-1 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isExperimental: false, lessonType: "individual" })}
              className={cn(
                "flex-[1_0_auto] min-w-[110px] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border",
                !formData.isExperimental && formData.lessonType === "individual"
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" 
                  : "bg-muted/5 text-muted-foreground border-border/10 hover:bg-muted/10"
              )}
            >
              <User size={14} /> Individual
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isExperimental: true, lessonType: "individual" })}
              className={cn(
                "flex-[1_0_auto] min-w-[110px] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border",
                formData.isExperimental 
                  ? "bg-yellow-500 text-yellow-950 border-yellow-500 shadow-lg shadow-yellow-500/20" 
                  : "bg-muted/5 text-muted-foreground border-border/10 hover:bg-muted/10"
              )}
            >
              <Beaker size={14} /> Experimental
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isExperimental: false, lessonType: "turma" })}
              className={cn(
                "flex-[1_0_auto] min-w-[110px] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border",
                !formData.isExperimental && formData.lessonType === "turma"
                  ? "bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" 
                  : "bg-muted/5 text-muted-foreground border-border/10 hover:bg-muted/10"
              )}
            >
              <Users size={14} /> Turma
            </button>
          </div>

          {formData.lessonType === "turma" ? (
            <div className="space-y-4 bg-indigo-500/5 p-4 rounded-2xl border border-indigo-500/20">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500/60 px-2">
                  <Users size={12} /> Nome da Turma
                </label>
                <input 
                  type="text"
                  placeholder="Ex: Turma de Violão - Sábados..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full h-14 bg-background border border-indigo-500/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500/60 px-2">
                  <UserPlus size={12} /> Alunos da Turma
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                  {students?.filter((s: any) => s.lessonType === "turma").length === 0 ? (
                    <p className="text-xs text-muted-foreground col-span-2 py-4 text-center font-bold">Nenhum aluno marcado como "turma" no sistema.</p>
                  ) : (
                    students?.filter((s: any) => s.lessonType === "turma").map((student: any) => (
                      <label 
                        key={student.id} 
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                          formData.turmaStudentIds.includes(student.id) 
                            ? "bg-indigo-500/10 border-indigo-500/30 ring-1 ring-indigo-500/20" 
                            : "bg-background border-border/20 hover:bg-muted/10"
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          setFormData(prev => {
                            const ids = prev.turmaStudentIds;
                            if (ids.includes(student.id)) {
                              return { ...prev, turmaStudentIds: ids.filter(id => id !== student.id) };
                            } else {
                              return { ...prev, turmaStudentIds: [...ids, student.id] };
                            }
                          });
                        }}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0",
                          formData.turmaStudentIds.includes(student.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-border/40"
                        )}>
                          {formData.turmaStudentIds.includes(student.id) && <CheckCircle2 size={12} strokeWidth={4} />}
                        </div>
                        <span className="text-xs font-bold truncate">{student.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Instrumento */}
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500/60 px-2">
                   <Music size={12} /> Instrumento Opcional
                 </label>
                 <select
                   value={formData.instrumentId}
                   onChange={(e) => setFormData({...formData, instrumentId: e.target.value})}
                   className="w-full h-14 bg-background border border-indigo-500/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all appearance-none cursor-pointer"
                 >
                   <option value="">Nenhum...</option>
                   {instruments?.map(inst => (
                     <option key={inst.id} value={inst.id.toString()}>{inst.name}</option>
                   ))}
                 </select>
              </div>

              {/* Sala de Estúdio */}
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500/60 px-2">
                   <LayoutList size={12} /> Sala (Opcional)
                 </label>
                 <select
                   value={formData.studioRoomId}
                   onChange={(e) => setFormData({...formData, studioRoomId: e.target.value})}
                   className="w-full h-14 bg-background border border-indigo-500/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all appearance-none cursor-pointer"
                 >
                   <option value="">Nenhuma sala...</option>
                   {studioRooms?.map(room => (
                     <option key={room.id} value={room.id.toString()}>{room.name}</option>
                   ))}
                 </select>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Aluno ou Nome Experimental */}
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                   <User size={12} className={cn("text-primary/40", formData.isExperimental && "text-yellow-600/40")} /> {formData.isExperimental ? "Nome do Aluno (Experimental)" : "Aluno"}
                 </label>
                 {formData.isExperimental ? (
                   <input 
                     type="text"
                     placeholder="Digite o nome..."
                     value={formData.experimentalName}
                     onChange={(e) => setFormData({ ...formData, experimentalName: e.target.value })}
                     className="w-full h-14 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-yellow-500/5 outline-none transition-all"
                   />
                  ) : (
                    /* MOBILE FIX: dropdown absoluto dentro do Drawer + teclado causava
                       "barreira branca" e lista comprimida. Agora abre um picker dedicado
                       (Drawer no mobile / Dialog no desktop) com linhas grandes. */
                    <button
                      type="button"
                      onClick={() => setStudentPickerOpen(true)}
                      className="w-full h-14 bg-card border border-border rounded-2xl px-4 flex items-center justify-between text-sm font-bold transition-all hover:border-primary/40 focus:ring-4 focus:ring-primary/10 focus:outline-none"
                    >
                      <span className={cn("truncate", formData.studentId ? "text-foreground" : "text-muted-foreground")}>
                        {formData.studentId
                          ? students?.find((s: any) => s.id.toString() === formData.studentId)?.name ?? "Selecione o aluno..."
                          : "Selecione o aluno..."
                        }
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {formData.studentId && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData(prev => ({ ...prev, studentId: "" }));
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg"
                          >
                            <X size={12} />
                          </span>
                        )}
                        <ChevronDown size={14} className="text-muted-foreground" />
                      </div>
                    </button>
                  )}
              </div>

              {/* Instrumento */}
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                   <Music size={12} className="text-primary/40" /> Instrumento
                 </label>
                 <select
                   value={formData.instrumentId}
                   onChange={(e) => setFormData({...formData, instrumentId: e.target.value})}
                   className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                 >
                   <option value="">Opcional...</option>
                   {instruments?.map(inst => (
                     <option key={inst.id} value={inst.id.toString()}>{inst.name}</option>
                   ))}
                 </select>
              </div>

              {/* Sala de Estúdio */}
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                   <LayoutList size={12} className="text-primary/40" /> Sala de Estúdio
                 </label>
                 <select
                   value={formData.studioRoomId}
                   onChange={(e) => setFormData({...formData, studioRoomId: e.target.value})}
                   className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                 >
                   <option value="">Opcional...</option>
                   {studioRooms?.map(room => (
                     <option key={room.id} value={room.id.toString()}>{room.name}</option>
                   ))}
                 </select>
              </div>

              {/* Telefone Experimental */}
              {formData.isExperimental && (
                <div className="space-y-2 md:col-span-2">
                   <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                     <span className="text-yellow-600/40">📱</span> Telefone/WhatsApp
                   </label>
                   <input 
                     type="text"
                     placeholder="(11) 99999-9999"
                     value={formData.experimentalPhone}
                     onChange={(e) => setFormData({ ...formData, experimentalPhone: e.target.value })}
                     className="w-full h-14 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-yellow-500/5 outline-none transition-all"
                   />
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Data */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                <CalendarDays size={12} className="text-primary/40" /> Data
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  const [y, m, d] = newDate.split("-").map(Number);
                  const newDay = !isNaN(y) && !isNaN(m) && !isNaN(d) ? new Date(y, m - 1, d).getDay() : formData.weeklySlots[0]?.dayOfWeek ?? 1;
                  const updatedSlots = [...formData.weeklySlots];
                  if (updatedSlots.length > 0) {
                    updatedSlots[0] = { ...updatedSlots[0], dayOfWeek: newDay };
                  }
                  setFormData({
                    ...formData,
                    date: newDate,
                    weeklySlots: updatedSlots
                  });
                }}
                className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            </div>

            {/* Horário */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                  <Clock size={12} className="text-primary/40" /> Horário
                </label>
                <span className="text-[10px] font-bold text-primary">{formData.time}</span>
              </div>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => {
                  const newTime = e.target.value;
                  const updatedSlots = [...formData.weeklySlots];
                  if (updatedSlots.length > 0) {
                    updatedSlots[0] = { ...updatedSlots[0], time: newTime };
                  }
                  setFormData({
                    ...formData,
                    time: newTime,
                    weeklySlots: updatedSlots
                  });
                }}
                className="w-full h-12 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const updatedSlots = [...formData.weeklySlots];
                      if (updatedSlots.length > 0) {
                        updatedSlots[0] = { ...updatedSlots[0], time: t };
                      }
                      setFormData({
                        ...formData,
                        time: t,
                        weeklySlots: updatedSlots
                      });
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer",
                      formData.time === t
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-border/40"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Duração */}
            <div className="space-y-2">
               <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                 <Timer size={12} className="text-primary/40" /> Duração
               </label>
               <select
                 value={formData.duration}
                 onChange={(e) => setFormData({...formData, duration: Number(e.target.value)})}
                 className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
               >
                 <option value={30}>30 min</option>
                 <option value={45}>45 min</option>
                 <option value={50}>50 min</option>
                 <option value={60}>60 min</option>
                 <option value={90}>90 min</option>
                 <option value={120}>120 min</option>
               </select>
            </div>

            {/* Recorrência ou Remarcar Tudo */}
            <div className="space-y-2">
              {!editingLesson ? (
                <>
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                    <CalendarRange size={12} className="text-primary/40" /> Repetir
                  </label>
                  {formData.lessonType !== "turma" && (
                    <select
                      value={formData.interval}
                      onChange={(e) => {
                        const nextInterval = e.target.value as RecurrenceInterval;
                        const opts = RECURRENCE_DURATIONS[nextInterval];
                        const validCount = opts.some((o) => o.value === formData.recurrenceCount) ? formData.recurrenceCount : opts[0].value;
                        setFormData({ ...formData, interval: nextInterval, recurrenceCount: validCount });
                      }}
                      className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                    >
                      {RECURRENCE_INTERVALS.map((i) => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2 pt-1">
                    <CalendarRange size={12} className="text-primary/40" /> Gerar por
                  </label>
                  <select
                    value={recurrenceDuration}
                    onChange={(e) => setFormData((formData.interval === "semanal" || formData.lessonType === "turma")
                      ? { ...formData, weeksCount: Number(e.target.value) }
                      : { ...formData, recurrenceCount: Number(e.target.value) })}
                    className="w-full h-14 bg-muted/10 border border-border/20 rounded-2xl px-4 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none cursor-pointer"
                  >
                    {((formData.interval === "semanal" || formData.lessonType === "turma")
                      ? [{ value: 1, label: "Apenas hoje" }, ...RECURRENCE_DURATIONS.semanal]
                      : RECURRENCE_DURATIONS[formData.interval]
                    ).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {formData.interval === "mensal_fixo" && formData.lessonType !== "turma" && (
                    <p className="text-[10px] font-bold text-muted-foreground px-2 leading-relaxed">
                      No modo mensal (dia fixo), a série usa a data base selecionada — os dias da semana não se aplicam.
                    </p>
                  )}
                  {previewOccurrences.length > 0 && (
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-2xl border text-xs font-bold",
                      exceedsLimit
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                        : "bg-primary/5 border-primary/20 text-foreground"
                    )}>
                      <CalendarDays size={14} className={exceedsLimit ? "text-rose-500" : "text-primary"} />
                      {exceedsLimit
                        ? <>Limite de {MAX_OCCURRENCES} aulas excedido ({previewOccurrences.length}). Reduza a duração ou os dias por semana.</>
                        : <>📅 <b>{previewOccurrences.length} aulas</b> serão criadas · de {format(previewOccurrences[0].date, "dd/MM/yyyy")} até {format(previewOccurrences[previewOccurrences.length - 1].date, "dd/MM/yyyy")}</>}
                    </div>
                  )}
                 </>
              ) : (
                null
              )}
            </div>
          </div>

          {/* Configuração de Múltiplos Dias por Semana */}
          {!editingLesson && formData.interval !== "mensal_fixo" && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-primary flex items-center gap-2">
                  <CalendarDays size={14} /> Frequência de Aulas na Semana
                </label>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                  {[1, 2, 3, 4].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        const [startY, startM, startD] = formData.date.split("-").map(Number);
                        const initialDay = new Date(startY, startM - 1, startD).getDay();
                        const newSlots = [];
                        for (let i = 0; i < num; i++) {
                          newSlots.push({
                            dayOfWeek: (initialDay + (i * 2)) % 7,
                            time: formData.time,
                            studioRoomId: formData.studioRoomId
                          });
                        }
                        setFormData({
                          ...formData,
                          lessonsPerWeek: num,
                          weeklySlots: newSlots,
                          weeksCount: formData.weeksCount === 1 ? 4 : formData.weeksCount
                        });
                      }}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer whitespace-nowrap shrink-0",
                        formData.lessonsPerWeek === num
                          ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
                          : "bg-card text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {num}x/sem
                    </button>
                  ))}
                </div>
              </div>

              {formData.lessonsPerWeek > 1 && (
                <div className="space-y-2 pt-2 border-t border-primary/10">
                  <p className="text-xs text-muted-foreground font-medium">Dias e horários das aulas na mesma semana:</p>
                  <div className="grid gap-2">
                    {formData.weeklySlots.map((slot, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-card/60 p-2 rounded-xl border border-border/40 text-xs">
                        <span className="font-bold text-foreground min-w-[50px]">Aula {idx + 1}:</span>
                        <select
                          value={slot.dayOfWeek}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const updated = [...formData.weeklySlots];
                            updated[idx].dayOfWeek = val;
                            setFormData({ ...formData, weeklySlots: updated });
                          }}
                          className="h-9 bg-muted/20 border border-border/40 rounded-lg px-2 text-xs font-bold outline-none"
                        >
                          <option value={0}>Domingo</option>
                          <option value={1}>Segunda-feira</option>
                          <option value={2}>Terça-feira</option>
                          <option value={3}>Quarta-feira</option>
                          <option value={4}>Quinta-feira</option>
                          <option value={5}>Sexta-feira</option>
                          <option value={6}>Sábado</option>
                        </select>
                        <input
                          type="time"
                          value={slot.time}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = [...formData.weeklySlots];
                            updated[idx].time = val;
                            setFormData({ ...formData, weeklySlots: updated });
                          }}
                          className="h-9 bg-muted/20 border border-border/40 rounded-lg px-2 text-xs font-bold outline-none"
                        />
                        {studioRooms && studioRooms.length > 0 && (
                          <select
                            value={slot.studioRoomId}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = [...formData.weeklySlots];
                              updated[idx].studioRoomId = val;
                              setFormData({ ...formData, weeklySlots: updated });
                            }}
                            className="h-9 bg-muted/20 border border-border/40 rounded-lg px-2 text-xs font-bold outline-none flex-1 truncate"
                          >
                            <option value="">Sala Padrão</option>
                            {studioRooms.map((room: any) => (
                              <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notas (Opcional) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
              <FileText size={12} className="text-primary/40" /> Notas / Observações
            </label>
            <textarea
              placeholder="Alguma observação importante..."
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full h-24 bg-muted/10 border border-border/20 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none scrollbar-none"
            />
          </div>

          {conflictError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-start gap-3">
               <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
               <div>
                 <h4 className="text-[10px] font-black text-destructive uppercase tracking-widest mb-0.5">Conflito</h4>
                 <p className="text-xs font-bold text-destructive/80 leading-relaxed">{conflictError}</p>
               </div>
            </div>
          )}

          {editingLesson && editingLesson.isExperimental && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-between gap-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 text-yellow-600 rounded-xl flex items-center justify-center">
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-yellow-700 uppercase tracking-widest leading-none mb-1">Aula Experimental</h4>
                    <p className="text-[11px] font-bold text-yellow-800/70 leading-tight">Este aluno ainda não tem cadastro completo.</p>
                  </div>
               </div>
               <button
                 type="button"
                 onClick={() => {
                   onOpenChange(false);
                   setLocation(`/alunos?create=true&name=${encodeURIComponent(formData.experimentalName)}`);
                 }}
                 className="h-10 px-4 bg-yellow-500 text-yellow-950 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-yellow-500/20 hover:scale-105 active:scale-95 transition-all"
               >
                 Conversão
               </button>
            </div>
          )}

          <button
            disabled={createMutation.isPending || checkConflictsMutation.isPending || updateMutation.isPending}
            type="submit"
            className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {createMutation.isPending || checkConflictsMutation.isPending || updateMutation.isPending ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={20} strokeWidth={3} />
                <span>{editingLesson ? "Salvar Alterações" : (formData.weeksCount > 1 ? "Validar e Agendar" : "Agendar Agora")}</span>
              </>
            )}
          </button>
        </form>
      ) : step === "ask_series" ? (
        <div className="space-y-6 pt-2 pb-10 md:pb-0">
          <div className="p-6 bg-primary/5 border-2 border-primary/20 rounded-[2rem] text-center space-y-4">
             <CalendarDays size={48} className="mx-auto text-primary" />
             <h3 className="text-lg font-black tracking-tight text-foreground">Série Recorrente</h3>
             <p className="text-sm font-bold text-muted-foreground">Esta aula faz parte de uma série. Deseja aplicar as alterações apenas para esta aula ou para todas as aulas seguintes?</p>
          </div>
          
          <div className="flex flex-col gap-3">
             <button
               type="button"
               onClick={() => {
                 setFormData(prev => ({ ...prev, updateSeries: false }));
                 updateMutation.mutate({
                   id: editingLesson.id,
                   studentId: formData.isExperimental ? null : (formData.studentId ? Number(formData.studentId) : null),
                   isExperimental: formData.isExperimental,
                   experimentalName: formData.experimentalName,
                   title: formData.title || "Aula de Música",
                   duration: formData.duration,
                   notes: formData.notes,
                   instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
                   studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
                   scheduledAt: (() => {
                     const [y, M, d] = formData.date.split("-").map(Number);
                     const [hours, minutes] = formData.time.split(":").map(Number);
                     return new Date(y, M - 1, d, hours, minutes, 0, 0).toISOString();
                   })(),
                   lessonType: formData.lessonType,
                   updateSeries: false
                 });
               }}
               className="w-full h-14 bg-muted/10 hover:bg-muted/20 text-muted-foreground rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
             >
               Alterar apenas esta aula
             </button>
             <button
               type="button"
               onClick={() => {
                 setFormData(prev => ({ ...prev, updateSeries: true }));
                 updateMutation.mutate({
                   id: editingLesson.id,
                   studentId: formData.isExperimental ? null : (formData.studentId ? Number(formData.studentId) : null),
                   isExperimental: formData.isExperimental,
                   experimentalName: formData.experimentalName,
                   title: formData.title || "Aula de Música",
                   duration: formData.duration,
                   notes: formData.notes,
                   instrumentId: formData.instrumentId ? Number(formData.instrumentId) : null,
                   studioRoomId: formData.studioRoomId ? Number(formData.studioRoomId) : null,
                   scheduledAt: (() => {
                     const [y, M, d] = formData.date.split("-").map(Number);
                     const [hours, minutes] = formData.time.split(":").map(Number);
                     return new Date(y, M - 1, d, hours, minutes, 0, 0).toISOString();
                   })(),
                   lessonType: formData.lessonType,
                   updateSeries: true
                 });
               }}
               className="w-full h-14 bg-primary text-primary-foreground rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
             >
               Alterar todas as seguintes
             </button>
          </div>
          <button
             type="button"
             onClick={() => setStep("form")}
             className="w-full h-12 text-muted-foreground/50 hover:text-muted-foreground text-[10px] font-black uppercase tracking-widest transition-all mt-2"
          >
             Voltar
          </button>
        </div>
      ) : (
        <div className="space-y-6 pt-2 pb-10 md:pb-0">
           <div className="max-h-[400px] overflow-y-auto scrollbar-none space-y-3 px-1">
              {batchItems.map((item, idx) => (
                <div key={item.scheduledAt} className={cn(
                   "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4",
                   item.hasConflict ? "bg-destructive/5 border-destructive/20" : "bg-emerald-500/5 border-emerald-500/20"
                )}>
                   <div className="flex items-center gap-3">
                      <div className={cn(
                         "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                         item.hasConflict ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500"
                      )}>
                         <CalendarRange size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-foreground/80">{safeFormat(item.scheduledAt, "dd/MM/yyyy")}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">
                          {item.hasConflict ? `Conflito com ${item.conflictingWith}` : "Horário disponível"}
                        </p>
                      </div>
                   </div>

                   <div className="flex items-center gap-2">
                      {item.hasConflict ? (
                         <div className="flex bg-muted/20 p-1 rounded-xl">
                            <button 
                              type="button"
                              onClick={() => {
                                const newItems = [...batchItems];
                                newItems[idx].force = true;
                                setBatchItems(newItems);
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all",
                                item.force ? "bg-destructive text-white shadow-lg" : "text-muted-foreground hover:bg-muted"
                              )}
                            >
                                Marcar
                            </button>
                            <button 
                              type="button"
                              onClick={() => {
                                const newItems = [...batchItems];
                                newItems[idx].force = false;
                                setBatchItems(newItems);
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all",
                                !item.force ? "bg-muted-foreground/20 text-foreground" : "text-muted-foreground hover:bg-muted"
                              )}
                            >
                                Pular
                            </button>
                         </div>
                      ) : (
                        <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-[9px] font-black uppercase">
                          OK
                        </div>
                      )}
                   </div>
                </div>
              ))}
           </div>

           <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setStep("form")}
                className="flex-[0.4] h-14 bg-muted/10 hover:bg-muted/20 text-muted-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                 <ChevronLeft size={16} /> Voltar
              </button>
              <button 
                onClick={handleConfirmBatch}
                disabled={createBatchMutation.isPending}
                className="flex-1 h-14 bg-primary text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                 {createBatchMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <>Finalizar Agendamentos <CheckCircle2 size={16} /></>}
              </button>
           </div>
        </div>
      )}
    </ResponsiveDialog>

    {/* ═══ PICKER DE ALUNOS (mobile-first: linhas grandes, sem conflito com teclado) ═══ */}
    <ResponsiveDialog
      open={studentPickerOpen}
      onOpenChange={setStudentPickerOpen}
      title="Selecione o aluno"
      description="Toque em um aluno para selecionar"
    >
      <div className="space-y-3 pb-4">
        <div className="flex items-center gap-2.5 bg-muted/30 border border-border rounded-2xl px-4 h-12">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar aluno pelo nome..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground outline-none"
          />
          {studentSearch && (
            <button type="button" onClick={() => setStudentSearch("")} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto max-h-[55vh] space-y-1.5 no-scrollbar pr-0.5">
          {(() => {
            const filtered = (students ?? []).filter((s: any) =>
              s.lessonType !== "turma" &&
              s.name.toLowerCase().includes(studentSearch.toLowerCase())
            );
            if (filtered.length === 0) return (
              <div className="py-10 text-center">
                <User size={28} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs font-bold text-muted-foreground">Nenhum aluno encontrado</p>
              </div>
            );
            return filtered.map((s: any) => {
              const selected = formData.studentId === s.id.toString();
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      studentId: s.id.toString(),
                      instrumentId: prev.instrumentId || (s.instrumentId ? s.instrumentId.toString() : ""),
                      studioRoomId: prev.studioRoomId || (s.studioRoomId ? s.studioRoomId.toString() : ""),
                    }));
                    setStudentPickerOpen(false);
                    setStudentSearch("");
                  }}
                  className={cn(
                    "w-full h-14 px-4 rounded-2xl border flex items-center gap-3 text-left transition-all active:scale-[0.99]",
                    selected
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card border-border hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <User size={16} className="text-primary" />
                  </div>
                  <span className="flex-1 truncate text-sm font-bold">{s.name}</span>
                  {selected && <CheckCircle2 size={16} className="text-primary shrink-0" />}
                </button>
              );
            });
          })()}
        </div>
      </div>
    </ResponsiveDialog>
    </>
  );
}

