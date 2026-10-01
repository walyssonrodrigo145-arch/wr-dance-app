import { useState, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  LayoutList,
  Music,
  Users,
  MoreVertical,
  Calendar,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  format, 
  addDays, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  startOfWeek, 
  endOfWeek,
  isSameMonth,
  addMonths,
  subMonths,
  isToday
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { safeFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AgendarModal from "@/components/modals/AgendarModal";
import LessonDetailModal from "@/components/modals/LessonDetailModal";
import DayLessonsModal from "@/components/modals/DayLessonsModal";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { Button } from "@/components/ui/button";
import { DAYS_SHORT, STATUS_CHIP_MAP, AULA_STATUS_CONFIG, RECURRENCE_CARD_CONFIG, LessonCardDesktop } from "@/components/aulas/LessonCardDesktop";
import MobileAgenda from "@/components/aulas/MobileAgenda";

type CalendarView = "mes" | "semana" | "dia" | "eventos";

export default function Aulas() {
  const { isDesktop } = useBreakpoint();
  
  // Desktop specific states
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("mes");
  const [animateToday, setAnimateToday] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState("todos");
  const [teacherFilter, setTeacherFilter] = useState("todos");
  const [statusFilterDesktop, setStatusFilterDesktop] = useState("geral");
  const [lessonTypeFilter, setLessonTypeFilter] = useState("todos");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Mobile specific states
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [statusFilterMobile, setStatusFilterMobile] = useState("Todas");
  const [search, setSearch] = useState("");

  const [agendarOpen, setAgendarOpen] = useState(false);
  const [detailLessonId, setDetailLessonId] = useState<number | null>(null);
  const [dayLessonsModalDate, setDayLessonsModalDate] = useState<Date | null>(null);
  const [editingLesson, setEditingLesson] = useState<any>(null);
  const [recurringAction, setRecurringAction] = useState<{
    type: 'delete' | 'reschedule';
    id: number;
    newDate?: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: lessons = [], isLoading } = trpc.lessons.list.useQuery(undefined, { refetchInterval: 10_000 });
  const { data: instruments = [] } = trpc.instruments.list.useQuery();
  const { data: professoresList = [] } = trpc.professores.list.useQuery();
  const { data: studioRoomsList = [] } = trpc.studioRooms.list.useQuery(undefined, { refetchInterval: 10_000 });
  const { data: pendingReminders = [] } = trpc.reminders.list.useQuery({ status: "pendente" });
  const { data: settings } = trpc.settings.get.useQuery();

  // ─── LÓGICA DE HORÁRIOS LIVRES DO DIA ────────────────────────────────────────
  const todayAvailableSlots = useMemo(() => {
    const dayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const now = new Date();
    const currentDayKey = dayMap[now.getDay()];
    
    // Parse das horas da escola
    let schoolHours: any = null;
    try {
      if (settings?.schoolHours) {
        schoolHours = typeof settings.schoolHours === 'string' ? JSON.parse(settings.schoolHours) : settings.schoolHours;
      }
    } catch {
      schoolHours = null;
    }

    const todayConfig = schoolHours?.[currentDayKey] || { active: true, start: "08:00", end: "18:00" };
    if (!todayConfig.active) {
      return { isClosed: true, slots: [], total: 0, config: todayConfig };
    }

    const [startH, startM] = (todayConfig.start || "08:00").split(":").map(Number);
    const [endH, endM] = (todayConfig.end || "18:00").split(":").map(Number);
    const duration = settings?.lessonDuration || 60; // minutos

    // Monta todos os slots possíveis do dia
    const slots: { timeStr: string; dateObj: Date; isOccupied: boolean; freeRoomsCount: number }[] = [];
    let currentSlot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM, 0);
    const endSlotLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM, 0);

    const totalRooms = Math.max(studioRoomsList.length, 1);

    while (currentSlot < endSlotLimit) {
      const slotStart = new Date(currentSlot);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);
      const timeStr = format(slotStart, "HH:mm");

      // Conta quantas aulas agendadas hoje se sobrepõem a este slot
      const overlappingLessons = lessons.filter(l => {
        if (l.status !== "agendada") return false;
        const lStart = new Date(l.scheduledAt);
        const lEnd = new Date(lStart.getTime() + (l.duration || 60) * 60000);
        return isSameDay(lStart, now) && lStart < slotEnd && lEnd > slotStart;
      });

      const freeRoomsCount = Math.max(0, totalRooms - overlappingLessons.length);
      const isOccupied = freeRoomsCount === 0;

      slots.push({
        timeStr,
        dateObj: slotStart,
        isOccupied,
        freeRoomsCount
      });

      currentSlot = new Date(currentSlot.getTime() + duration * 60000);
    }

    const availableSlots = slots.filter(s => !s.isOccupied);

    return {
      isClosed: false,
      slots: availableSlots,
      total: availableSlots.length,
      config: todayConfig
    };
  }, [settings, lessons, studioRoomsList]);

  const targetLessonForAction = useMemo(() => {
    if (!recurringAction) return null;
    return lessons.find(l => l.id === recurringAction.id);
  }, [recurringAction, lessons]);

  const hasRecurrence = useMemo(() => {
    if (!targetLessonForAction) return false;
    if (targetLessonForAction.recurringGroupId) return true;
    if (targetLessonForAction.studentId) {
      return lessons.some(l => 
        l.id !== targetLessonForAction.id && 
        l.studentId === targetLessonForAction.studentId && 
        l.status === 'agendada' && 
        new Date(l.scheduledAt) >= new Date(targetLessonForAction.scheduledAt)
      );
    }
    if (targetLessonForAction.lessonType === 'turma') {
      return lessons.some(l => 
        l.id !== targetLessonForAction.id && 
        l.title === targetLessonForAction.title && 
        l.lessonType === 'turma' && 
        l.status === 'agendada' && 
        new Date(l.scheduledAt) >= new Date(targetLessonForAction.scheduledAt)
      );
    }
    return false;
  }, [targetLessonForAction, lessons]);

  const updateStatusMutation = trpc.lessons.updateStatus.useMutation({
    onSuccess: (data, vars) => {
      // FEEDBACK FIX: o server retorna `updated` (linhas afetadas). Antes qualquer
      // resposta exibia toast de sucesso mesmo quando 0 linhas eram alteradas.
      if (data && data.updated === false) {
        toast.error('Não foi possível atualizar: você não tem permissão sobre esta aula.');
        utils.lessons.list.invalidate();
        return;
      }
      const msg = vars.status === 'remarcada' ? 'Aula remarcada com sucesso!' : 'Status atualizado!';
      toast.success(msg);
      utils.lessons.list.invalidate();
    },
    onError: (e) => toast.error('Erro ao atualizar status: ' + e.message)
  });

  const deleteMutation = trpc.lessons.delete.useMutation({
    onSuccess: () => {
      toast.success("Aula removida!");
      utils.lessons.list.invalidate();
      setDetailLessonId(null);
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message)
  });


  const filteredLessons = useMemo(() => {
    const rawFiltered = lessons.filter(l => {
      if (isDesktop) {
        const matchesSearch = (l.title || l.studentName || l.experimentalName || "").toLowerCase().includes(search.toLowerCase());
        const matchesInstrument = instrumentFilter === "todos" || String(l.instrumentId) === instrumentFilter;
        const matchesTeacher = teacherFilter === "todos" || String(l.teacherId) === teacherFilter;
        const matchesStatus = statusFilterDesktop === "geral" || l.status === statusFilterDesktop;
        const matchesLessonType = lessonTypeFilter === "todos" || l.lessonType === lessonTypeFilter;
        return matchesSearch && matchesInstrument && matchesTeacher && matchesStatus && matchesLessonType;
      } else {
        const isDayMatch = isSameDay(new Date(l.scheduledAt), selectedDate);
        const matchesSearch = (l.title || l.studentName || l.experimentalName || "").toLowerCase().includes(search.toLowerCase());
        let matchesStatus = false;
        if (statusFilterMobile === "Todas") {
          matchesStatus = true;
        } else if (statusFilterMobile === "Hoje") {
          matchesStatus = isToday(new Date(l.scheduledAt));
        } else {
          const mappedStatus = STATUS_CHIP_MAP[statusFilterMobile];
          matchesStatus = mappedStatus ? l.status === mappedStatus : true;
        }
        const matchesLessonType = lessonTypeFilter === "todos" || l.lessonType === lessonTypeFilter;
        return isDayMatch && matchesSearch && matchesStatus && matchesLessonType;
      }
    });

    // Agrupar aulas em turma para que apareçam como apenas 1 card representando a turma na agenda
    const grouped: any[] = [];
    const turmaMap = new Map<string, any>();

    for (const lesson of rawFiltered) {
      if (lesson.lessonType === 'turma') {
        const d = safeFormat(lesson.scheduledAt, "yyyy-MM-dd_HH:mm");
        const key = lesson.recurringGroupId ? `group_${lesson.recurringGroupId}_${d}` : `turma_${lesson.title}_${d}`;
        if (!turmaMap.has(key)) {
          const turmaCopy = { 
            ...lesson, 
            studentCount: 1, 
            studentsList: [lesson.studentName || "Aluno"],
            turmaStatuses: [lesson.status]
          };
          turmaMap.set(key, turmaCopy);
          grouped.push(turmaCopy);
        } else {
          const existing = turmaMap.get(key);
          existing.studentCount += 1;
          existing.turmaStatuses.push(lesson.status);
          if (lesson.studentName) {
            existing.studentsList.push(lesson.studentName);
          }
        }
      } else {
        grouped.push(lesson);
      }
    }

    // Calcular status representativo do grupo de turma
    for (const item of grouped) {
      if (item.lessonType === 'turma' && item.turmaStatuses) {
        const statuses = item.turmaStatuses;
        const allFalta = statuses.length > 0 && statuses.every((s: string) => s === 'falta');
        const hasConcluida = statuses.includes('concluida');
        const allCancelada = statuses.length > 0 && statuses.every((s: string) => s === 'cancelada');

        if (allFalta) {
          item.status = 'falta';
        } else if (hasConcluida) {
          item.status = 'concluida';
        } else if (allCancelada) {
          item.status = 'cancelada';
        } else {
          item.status = 'agendada';
        }
      }
    }

    return grouped;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, isDesktop, search, instrumentFilter, statusFilterDesktop, selectedDate, statusFilterMobile, lessonTypeFilter]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const weekDaysMobile = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  // Unused stats removed for expanded calendar layout

  const handleDeleteRequest = (id: number) => {
    const target = lessons.find(l => l.id === id);
    if (!target) return;
    const hasMultiple = !!target.recurringGroupId || (
      target.studentId ? lessons.some(l => l.id !== id && l.studentId === target.studentId && l.status === 'agendada' && new Date(l.scheduledAt) >= new Date(target.scheduledAt)) : false
    ) || (
      target.lessonType === 'turma' ? lessons.some(l => l.id !== id && l.title === target.title && l.lessonType === 'turma' && l.status === 'agendada' && new Date(l.scheduledAt) >= new Date(target.scheduledAt)) : false
    );

    if (hasMultiple) {
      setRecurringAction({ type: 'delete', id });
    } else {
      deleteMutation.mutate({ id, deleteSeries: false });
    }
  };

  const handleStatusChange = (id: number, status: string, newDate?: string) => {
    if (status === 'remarcada' && newDate) {
      const target = lessons.find(l => l.id === id);
      setDetailLessonId(null);
      if (target?.recurringGroupId) {
        setTimeout(() => setRecurringAction({ type: 'reschedule', id, newDate }), 150);
      } else {
        updateStatusMutation.mutate({ id, status: status as any, scheduledAt: newDate });
      }
    } else {
      updateStatusMutation.mutate({ id, status: status as any, scheduledAt: newDate });
    }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // DESKTOP LAYOUT (MODERNO E INSPIRADO NO MODELO)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isDesktop) {
    const todayLessons = lessons.filter(l => isToday(new Date(l.scheduledAt)));
    const todayCompleted = todayLessons.filter(l => l.status === 'concluida').length;
    const todayPending = todayLessons.filter(l => l.status === 'agendada').length;
    const todayCancelled = todayLessons.filter(l => l.status === 'cancelada').length;

    // Cálculo estático/dinâmico de ocupação semanal (Domingo a Sábado)
    const weekDays = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn: 0 }), end: endOfWeek(new Date(), { weekStartsOn: 0 }) });
    const occupancy = weekDays.map(day => {
      const count = lessons.filter(l => isSameDay(new Date(l.scheduledAt), day)).length;
      // considera 8 aulas/dia como 100% de capacidade
      const pct = Math.min(100, Math.round((count / 8) * 100));
      return { dayLabel: DAYS_SHORT[day.getDay()], pct };
    });

    return (
      <div className={cn(
        "flex flex-col bg-background overflow-hidden transition-all duration-300",
        isExpanded 
          ? "fixed inset-0 z-[45] p-4 sm:p-6 lg:p-8 overflow-y-auto m-0 min-h-screen h-full max-w-none animate-in fade-in zoom-in-95 duration-300 bg-background" 
          : "min-h-full h-auto -m-4 sm:-m-6 -mt-6 sm:-mt-8"
      )}>
        {/* Sub-Header de Filtros, Visões e Ação Nova Aula (Alinhado ao Topo) */}
        <div className="px-6 py-4 border-b border-border/30 bg-card/40 backdrop-blur-xl flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Botões de Visão (Mês, Semana, Dia, Lista) - Pílula Deslizante Ultra-Fluida */}
            <div className="flex p-1 bg-card rounded-xl border border-border/60 shadow-sm relative">
              {(["mes", "semana", "dia", "eventos"] as const).map(v => {
                const isActive = view === v;
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold transition-colors duration-200 capitalize relative z-10 select-none",
                      isActive ? "text-white" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="viewPillActive"
                        className="absolute inset-0 bg-blue-600 rounded-lg -z-10 shadow-md shadow-blue-500/20"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    {v === "eventos" ? "Lista" : v}
                  </button>
                );
              })}
            </div>

            {/* Seletores de Data */}
            <div className="flex items-center gap-2">
              {(view === "mes" || view === "eventos") && (
                <>
                  <select
                    value={currentDate.getMonth()}
                    onChange={e => setCurrentDate(new Date(currentDate.getFullYear(), Number(e.target.value), 1))}
                    className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground focus:outline-none shadow-sm cursor-pointer"
                  >
                    {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={currentDate.getFullYear()}
                    onChange={e => setCurrentDate(new Date(Number(e.target.value), currentDate.getMonth(), 1))}
                    className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground focus:outline-none shadow-sm cursor-pointer"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </>
              )}

              <button
                onClick={() => {
                  setCurrentDate(new Date());
                  setAnimateToday(true);
                  setTimeout(() => setAnimateToday(false), 1000);
                }}
                className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-sm"
              >
                Hoje
              </button>
              
              <div className="flex items-center gap-1 bg-card border border-border/60 rounded-xl p-0.5 shadow-sm">
                <button
                  onClick={() => {
                    if (view === "dia") setCurrentDate(addDays(currentDate, -1));
                    else if (view === "semana") setCurrentDate(addDays(currentDate, -7));
                    else setCurrentDate(subMonths(currentDate, 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => {
                    if (view === "dia") setCurrentDate(addDays(currentDate, 1));
                    else if (view === "semana") setCurrentDate(addDays(currentDate, 7));
                    else setCurrentDate(addMonths(currentDate, 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Filtros Suspensos e Botão Primário + Nova Aula */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Coreógrafo / Prof:</span>
              <select
                value={teacherFilter}
                onChange={e => setTeacherFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground outline-none shadow-sm cursor-pointer"
              >
                <option value="todos">Todos</option>
                {professoresList.map(p => <option key={p.id} value={String(p.userId)}>{p.name || "Professor"}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Modalidade:</span>
              <select
                value={instrumentFilter}
                onChange={e => setInstrumentFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground outline-none shadow-sm cursor-pointer"
              >
                <option value="todos">Todas</option>
                {instruments.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Status:</span>
              <select
                value={statusFilterDesktop}
                onChange={e => setStatusFilterDesktop(e.target.value)}
                className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground outline-none shadow-sm cursor-pointer capitalize"
              >
                <option value="geral">Todos</option>
                <option value="agendada">Agendadas</option>
                <option value="concluida">Concluídas</option>
                <option value="cancelada">Canceladas</option>
                <option value="remarcada">Remarcadas</option>
                <option value="falta">Faltas</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Modalidade:</span>
              <select
                value={lessonTypeFilter}
                onChange={e => setLessonTypeFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground outline-none shadow-sm cursor-pointer"
              >
                <option value="todos">Todas</option>
                <option value="individual">Individual</option>
                <option value="turma">Turma</option>
              </select>
            </div>

            {(instrumentFilter !== "todos" || teacherFilter !== "todos" || statusFilterDesktop !== "geral" || lessonTypeFilter !== "todos") && (
              <button
                onClick={() => { setInstrumentFilter("todos"); setTeacherFilter("todos"); setStatusFilterDesktop("geral"); setLessonTypeFilter("todos"); }}
                className="text-xs font-bold text-blue-600 hover:underline px-2"
              >
                Limpar
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <Button
                onClick={() => setAgendarOpen(true)}
                className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                <Plus size={16} strokeWidth={3} />
                <span>Nova Aula</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Restaurar tamanho" : "Maximizar Agenda"}
                className="h-9 w-9 rounded-xl border-border/60 hover:bg-muted shadow-sm"
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowRightPanel(!showRightPanel)}
                title={showRightPanel ? "Esconder painel de resumo" : "Exibir painel de resumo"}
                className={cn("h-9 w-9 rounded-xl border-border/60 hover:bg-muted shadow-sm transition-all", !showRightPanel && "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400")}
              >
                {showRightPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </Button>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal Split (Calendário + Painel Direita) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Coluna Esquerda: Calendário Principal */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 no-scrollbar">
            <div id="tour-calendar-view" className="relative min-h-[500px]">
              <AnimatePresence mode="popLayout" initial={false}>
                {view === "mes" && (
                  <motion.div 
                    key="month" 
                    initial={{ opacity: 0, y: 4 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="bg-card rounded-2xl border border-border/60 shadow-xl overflow-hidden"
                  >
                    <div className="overflow-x-auto no-scrollbar">
                      <div className="min-w-[480px] lg:min-w-full">
                        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
                          {DAYS_SHORT.map(day => (
                            <div key={day} className="py-3 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                              {day}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 min-h-[400px] lg:min-h-[460px]">
                          {monthDays.map((day, idx) => {
                            const lessonsInDay = filteredLessons.filter(l => isSameDay(new Date(l.scheduledAt), day));
                            const isCurrMonth = isSameMonth(day, currentDate);
                            return (
                              <div 
                                key={idx} 
                                className={cn(
                                  "p-2 border-r border-b border-border/40 min-h-[110px] relative transition-colors", 
                                  !isCurrMonth && "opacity-25 bg-muted/20", 
                                  isToday(day) && "bg-blue-500/5"
                                )}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span 
                                    onClick={(e) => { e.stopPropagation(); setCurrentDate(day); setAgendarOpen(true); }}
                                    className={cn(
                                      "text-xs font-bold cursor-pointer hover:text-blue-600 transition-colors",
                                      isToday(day) ? "w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-black" : "text-muted-foreground"
                                    )}
                                  >
                                    {format(day, "d")}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {lessonsInDay.slice(0, 3).map(l => (
                                    <LessonCardDesktop key={l.id} lesson={l} onClick={(e) => { e.stopPropagation(); setDetailLessonId(l.id); }} />
                                  ))}
                                  {lessonsInDay.length > 3 && (
                                    <button
                                      type="button"
                                      className="w-full text-[9px] font-black text-blue-600 text-center cursor-pointer hover:underline py-0.5 bg-transparent"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDayLessonsModalDate(day);
                                      }}
                                    >
                                      + {lessonsInDay.length - 3} aulas
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {view === "semana" && (
                  <motion.div key="week" className="overflow-x-auto">
                    <div className="grid grid-cols-7 gap-3 min-w-[560px]">
                      {eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) }).map((day, i) => (
                        <div key={i} className="flex flex-col gap-3">
                          <div className={cn("p-3 rounded-2xl border text-center", isToday(day) ? "bg-blue-600 border-blue-600 text-white shadow-lg" : "bg-card border-border/60")}>
                            <p className="text-[10px] font-bold uppercase opacity-70 mb-0.5">{DAYS_SHORT[i]}</p>
                            <p className="text-xl font-black">{format(day, "d")}</p>
                          </div>
                          <div className="space-y-2">
                            {filteredLessons.filter(l => isSameDay(new Date(l.scheduledAt), day)).map(l => (
                              <LessonCardDesktop key={l.id} lesson={l} onClick={(e) => { e.stopPropagation(); setDetailLessonId(l.id); }} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {view === "dia" && (
                  <motion.div key="day" className="space-y-4">
                    <div className="flex items-center justify-between bg-card p-5 rounded-2xl border border-border/60 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-black text-lg">
                          {format(currentDate, "d")}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">{format(currentDate, "EEEE", { locale: ptBR })}</h3>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">{format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR })}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {filteredLessons.filter(l => isSameDay(new Date(l.scheduledAt), currentDate)).length} aulas
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredLessons
                        .filter(l => isSameDay(new Date(l.scheduledAt), currentDate))
                        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                        .map(l => <LessonCardDesktop key={l.id} lesson={l} onClick={(e) => { e.stopPropagation(); setDetailLessonId(l.id); }} />)}
                    </div>
                  </motion.div>
                )}

                {view === "eventos" && (
                  <motion.div key="events" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredLessons
                      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                      .map(l => (
                        <div key={l.id} className="relative">
                          <div className="absolute -top-2.5 left-4 z-10 px-2.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-full uppercase shadow-md">
                            {safeFormat(l.scheduledAt, "dd/MM")}
                          </div>
                          <LessonCardDesktop lesson={l} onClick={(e) => { e.stopPropagation(); setDetailLessonId(l.id); }} />
                        </div>
                     ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Legenda de Cores no Rodapé */}
            <div className="flex items-center gap-4 flex-wrap pt-3 border-t border-border/40 text-[10px] font-bold text-muted-foreground">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Individual</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-600" /> Turma</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-violet-600" /> Aula a Repor</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Experimental</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Cancelada</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Concluída</div>
            </div>
          </div>

          {/* Coluna Direita (Painel de Resumo do Dia e Ocupação da Semana) */}
          {showRightPanel && (
            <div className="w-80 border-l border-border/40 bg-card/30 backdrop-blur-md p-4 space-y-4 overflow-y-auto no-scrollbar shrink-0 hidden xl:block">
              {/* Card de Resumo do dia */}
              <div className="bg-card/90 rounded-2xl p-4 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Resumo do dia</span>
                  <span className="text-[10px] font-bold text-blue-600">{format(new Date(), "dd/MM")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-muted/30 rounded-xl border border-border/40">
                    <p className="text-base font-black text-foreground">{todayLessons.length}</p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Aulas</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <p className="text-base font-black text-emerald-600">{todayCompleted}</p>
                    <p className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Concluídas</p>
                  </div>
                  <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                    <p className="text-base font-black text-rose-500">{todayCancelled}</p>
                    <p className="text-[9px] font-bold text-rose-700 dark:text-rose-300 uppercase">Canceladas</p>
                  </div>
                  <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <p className="text-base font-black text-blue-600">{todayPending}</p>
                    <p className="text-[9px] font-bold text-blue-700 dark:text-blue-300 uppercase">Pendentes</p>
                  </div>
                </div>
              </div>

              {/* Próximas Aulas de Hoje (Timeline) */}
              <div className="bg-card/90 rounded-2xl p-4 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Próximas aulas hoje</span>
                  <span className="text-[9px] font-bold text-blue-600 hover:underline cursor-pointer" onClick={() => setView('dia')}>Ver todas</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                  {todayLessons.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-4">Nenhuma aula agendada para hoje.</p>
                  ) : (
                    todayLessons.slice(0, 6).map((l: any) => {
                      const isTurma = l.lessonType === 'turma';
                      const nameText = isTurma ? (l.title || "Turma") : (l.studentName || l.experimentalName || "Aula");
                      const statusColor = l.status === 'concluida' ? "bg-emerald-500 text-emerald-600" : l.status === 'falta' ? "bg-rose-500 text-rose-500" : "bg-blue-500 text-blue-600";

                      return (
                        <div key={l.id} className="p-3 bg-muted/30 hover:bg-muted/60 rounded-xl border border-border/50 flex items-center justify-between cursor-pointer transition-all group" onClick={() => setDetailLessonId(l.id)}>
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-black text-blue-600">{safeFormat(l.scheduledAt, "HH:mm")}</span>
                              <span className="text-xs font-bold text-foreground truncate group-hover:text-blue-600 transition-colors">{nameText}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-bold uppercase flex-wrap">
                              <Music size={10} className="text-blue-500 shrink-0" />
                              <span className="truncate">{l.instrumentName || "Geral"}</span>
                              {l.teacherName && (
                                <>
                                  <span>•</span>
                                  <span className="text-blue-600 font-bold">Prof. {l.teacherName}</span>
                                </>
                              )}
                              {l.studioRoomName && (
                                <>
                                  <span>•</span>
                                  <span className="text-indigo-600 font-bold">{l.studioRoomName}</span>
                                </>
                              )}
                              {isTurma && <span className="text-[8px] font-black text-purple-600 bg-purple-500/10 px-1.5 py-0.2 rounded-full border border-purple-500/20">Turma</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <div className={cn("w-2 h-2 rounded-full shadow-sm", statusColor.split(' ')[0])} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Ocupação da Semana (Gráfico de Barras) */}
              <div className="bg-card/90 rounded-2xl p-4 border border-border/80 shadow-sm space-y-3">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Ocupação da semana</span>
                <div className="flex items-end justify-between gap-1.5 h-28 pt-4 px-1">
                  {occupancy.map((occ, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[8px] font-black text-muted-foreground">{occ.pct}%</span>
                      <div className="w-full bg-muted rounded-t-lg overflow-hidden flex flex-col justify-end" style={{ height: '70px' }}>
                        <div 
                          className={cn(
                            "w-full transition-all duration-500 rounded-t-lg",
                            occ.pct > 75 ? "bg-rose-500" : occ.pct > 40 ? "bg-amber-500" : occ.pct > 0 ? "bg-emerald-500" : "bg-transparent"
                          )} 
                          style={{ height: `${occ.pct}%` }} 
                        />
                      </div>
                      <span className="text-[8px] font-bold text-muted-foreground">{occ.dayLabel}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status das Salas ao Vivo (Full Time 24h) */}
              <div className="bg-card/90 rounded-2xl p-4 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Salas Ao Vivo (24h)</span>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    LIVE
                  </span>
                </div>

                {studioRoomsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-3">Nenhuma sala cadastrada.</p>
                ) : (
                  <div className="space-y-2">
                    {studioRoomsList.map((room) => {
                      const now = new Date();
                      // Encontra aula agendada nesta sala que esteja acontecendo exato AGORA
                      const currentLesson = lessons.find((l) => {
                        if (l.studioRoomId !== room.id || l.status !== "agendada") return false;
                        const start = new Date(l.scheduledAt);
                        const end = new Date(start.getTime() + (l.duration || 60) * 60000);
                        return now >= start && now < end;
                      });

                      const isOccupied = !!currentLesson;
                      const studentName = currentLesson
                        ? currentLesson.lessonType === "turma"
                          ? currentLesson.title || "Turma"
                          : currentLesson.studentName || currentLesson.experimentalName || "Aluno"
                        : null;

                      return (
                        <div
                          key={room.id}
                          className={cn(
                            "p-3 rounded-xl border transition-all flex items-center justify-between gap-2",
                            isOccupied
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: room.color || "#6366f1" }}
                              />
                              <p className="text-xs font-black text-foreground truncate">{room.name}</p>
                            </div>
                            {isOccupied ? (
                              <p className="text-[10px] font-bold text-rose-400 truncate mt-0.5">
                                👤 {studentName}
                              </p>
                            ) : (
                              <p className="text-[10px] font-bold text-emerald-400 mt-0.5">
                                ✨ Livre agora
                              </p>
                            )}
                          </div>

                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 border",
                              isOccupied
                                ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            )}
                          >
                            {isOccupied ? "Ocupada" : "Livre"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── Mini Relatório de Horários Disponíveis do Dia ─── */}
              <div className="bg-card/90 rounded-2xl p-4 border border-border/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-violet-500" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Horários Livres Hoje</span>
                  </div>
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                    todayAvailableSlots.isClosed || todayAvailableSlots.total === 0
                      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                      : "text-violet-500 bg-violet-500/10 border-violet-500/20"
                  )}>
                    {todayAvailableSlots.isClosed ? "Fechado" : `${todayAvailableSlots.total} livre(s)`}
                  </span>
                </div>

                {todayAvailableSlots.isClosed ? (
                  <p className="text-xs text-muted-foreground italic text-center py-2">Escola fechada hoje.</p>
                ) : todayAvailableSlots.total === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-2">Agenda de hoje lotada!</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground font-medium">
                      Atendimento hoje ({todayAvailableSlots.config.start} às {todayAvailableSlots.config.end}):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-none pr-1">
                      {todayAvailableSlots.slots.map((slot, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setCurrentDate(slot.dateObj);
                            setAgendarOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 group"
                          title={studioRoomsList.length > 1 ? `Clique para agendar (${slot.freeRoomsCount} de ${studioRoomsList.length} salas livres neste horário)` : "Clique para agendar neste horário"}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                          <span>{slot.timeStr}</span>
                          {studioRoomsList.length > 1 && (
                            <span className="text-[9px] opacity-70 font-semibold bg-emerald-500/20 px-1 rounded">
                              {slot.freeRoomsCount} {slot.freeRoomsCount === 1 ? "sala" : "salas"}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground/70 italic text-center pt-1">
                      💡 Clique no horário para agendar rápido
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <AgendarModal
          open={agendarOpen}
          onOpenChange={(open) => { setAgendarOpen(open); if (!open) setEditingLesson(null); }}
          editingLesson={editingLesson}
          initialDate={selectedDate || currentDate}
        />

        <LessonDetailModal 
          open={!!detailLessonId} 
          lesson={lessons.find(l => l.id === detailLessonId)} 
          onOpenChange={(open) => !open && setDetailLessonId(null)} 
          onStatusChange={handleStatusChange} 
          onDelete={(id) => {
            setDetailLessonId(null);
            setTimeout(() => handleDeleteRequest(id), 150);
          }} 
          onEdit={() => { 
            setEditingLesson(lessons.find(l => l.id === detailLessonId)); 
            setAgendarOpen(true); 
            setDetailLessonId(null); 
          }} 
        />

        <DayLessonsModal
          day={dayLessonsModalDate || new Date()}
          lessons={dayLessonsModalDate ? filteredLessons.filter(l => isSameDay(new Date(l.scheduledAt), dayLessonsModalDate)) : []}
          open={!!dayLessonsModalDate}
          onOpenChange={(v) => !v && setDayLessonsModalDate(null)}
          onOpenDetail={(lesson) => {
            setDayLessonsModalDate(null);
            setDetailLessonId(lesson.id);
          }}
          onStatusChange={handleStatusChange}
          onAddLesson={(day) => {
            setSelectedDate(day);
            setAgendarOpen(true);
            setDayLessonsModalDate(null);
          }}
        />

        {/* Dialog de confirmação para ações recorrentes */}
        <ResponsiveDialog
          open={!!recurringAction}
          onOpenChange={(open) => { if (!open) setRecurringAction(null); }}
          title={
            hasRecurrence
              ? (recurringAction?.type === 'delete' ? 'Excluir Aula Recorrente' : 'Remarcar Aula Recorrente')
              : (recurringAction?.type === 'delete' ? 'Confirmar Exclusão' : 'Confirmar Remarcação')
          }
          description={
            hasRecurrence
              ? "Esta aula faz parte de uma série recorrente. Como deseja aplicar esta alteração?"
              : (recurringAction?.type === 'delete' ? 'Deseja realmente excluir este agendamento? Esta ação não pode ser desfeita.' : 'Deseja confirmar a remarcação desta aula?')
          }
        >
          <div className="flex flex-col gap-3 pb-8 md:pb-0">
            {hasRecurrence ? (
              <>
                <button
                  onClick={async () => {
                    if (!recurringAction) return;
                    try {
                      if (recurringAction.type === 'delete') {
                        await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: false });
                      } else {
                        await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: false });
                      }
                    } catch (err) {}
                    setRecurringAction(null);
                  }}
                  className="w-full h-12 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  {recurringAction?.type === 'delete' ? 'Excluir apenas esta aula' : 'Remarcar apenas esta aula'}
                </button>
                <button
                  onClick={async () => {
                    if (!recurringAction) return;
                    try {
                      if (recurringAction.type === 'delete') {
                        await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: true });
                      } else {
                        await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: true });
                      }
                    } catch (err) {}
                    setRecurringAction(null);
                  }}
                  className={cn(
                    "w-full h-12 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer",
                    recurringAction?.type === 'delete' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  )}
                >
                  {recurringAction?.type === 'delete' ? 'Excluir toda a série (futuras)' : 'Remarcar toda a série (futuras)'}
                </button>
              </>
            ) : (
              <button
                onClick={async () => {
                  if (!recurringAction) return;
                  try {
                    if (recurringAction.type === 'delete') {
                      await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: false });
                    } else {
                      await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: false });
                    }
                  } catch (err) {}
                  setRecurringAction(null);
                }}
                className={cn(
                  "w-full h-12 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer",
                  recurringAction?.type === 'delete' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                )}
              >
                {recurringAction?.type === 'delete' ? 'Sim, excluir' : 'Sim, remarcar'}
              </button>
            )}
            <button
              onClick={() => setRecurringAction(null)}
              className="w-full h-12 rounded-xl border border-border text-muted-foreground hover:bg-muted/10 text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </ResponsiveDialog>
      </div>
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOBILE / TABLET LAYOUT (PREMIUM DESIGN)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="animate-in fade-in duration-500">
      {/* AUDITORIA: agenda mobile unificada (mês/semana/dia, filtros e calendário escolar) */}
      <MobileAgenda
        lessons={lessons}
        isLoading={isLoading}
        onOpenLesson={(id) => setDetailLessonId(id)}
        onOpenAgendar={(date) => { setSelectedDate(date); setAgendarOpen(true); }}
      />

      <AgendarModal open={agendarOpen} onOpenChange={(open) => { setAgendarOpen(open); if (!open) setEditingLesson(null); }} editingLesson={editingLesson} initialDate={selectedDate} />
      <LessonDetailModal 
        open={!!detailLessonId} 
        lesson={lessons.find(l => l.id === detailLessonId)} 
        onOpenChange={(open) => !open && setDetailLessonId(null)} 
        onStatusChange={handleStatusChange} 
        onDelete={(id) => {
          setDetailLessonId(null);
          setTimeout(() => handleDeleteRequest(id), 150);
        }} 
        onEdit={() => { 
          setEditingLesson(lessons.find(l => l.id === detailLessonId)); 
          setAgendarOpen(true); 
          setDetailLessonId(null); 
        }} 
      />

      {/* ── Dialog de confirmação compartilhado desktop+mobile ──────────────── */}
      <ResponsiveDialog
        open={!!recurringAction}
        onOpenChange={(open) => { if (!open) setRecurringAction(null); }}
        title={
          hasRecurrence
            ? (recurringAction?.type === 'delete' ? 'Excluir Aula Recorrente' : 'Remarcar Aula Recorrente')
            : (recurringAction?.type === 'delete' ? 'Confirmar Exclusão' : 'Confirmar Remarcação')
        }
        description={
          hasRecurrence
            ? "Esta aula faz parte de uma série recorrente. Como deseja aplicar esta alteração?"
            : (recurringAction?.type === 'delete' ? 'Deseja realmente excluir este agendamento? Esta ação não pode ser desfeita.' : 'Deseja confirmar a remarcação desta aula?')
        }
      >
        <div className="flex flex-col gap-3 pb-8 md:pb-0">
          {hasRecurrence ? (
            <>
              <button
                onClick={async () => {
                  if (!recurringAction) return;
                  try {
                    if (recurringAction.type === 'delete') {
                      await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: false });
                    } else {
                      await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: false });
                    }
                  } catch (err) {}
                  setRecurringAction(null);
                }}
                className="w-full h-12 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
              >
                {recurringAction?.type === 'delete' ? 'Excluir apenas esta aula' : 'Remarcar apenas esta aula'}
              </button>
              <button
                onClick={async () => {
                  if (!recurringAction) return;
                  try {
                    if (recurringAction.type === 'delete') {
                      await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: true });
                    } else {
                      await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: true });
                    }
                  } catch (err) {}
                  setRecurringAction(null);
                }}
                className={cn(
                  "w-full h-12 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer",
                  recurringAction?.type === 'delete' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                )}
              >
                {recurringAction?.type === 'delete' ? 'Excluir toda a série (futuras)' : 'Remarcar toda a série (futuras)'}
              </button>
            </>
          ) : (
            <button
              onClick={async () => {
                if (!recurringAction) return;
                try {
                  if (recurringAction.type === 'delete') {
                    await deleteMutation.mutateAsync({ id: recurringAction.id, deleteSeries: false });
                  } else {
                    await updateStatusMutation.mutateAsync({ id: recurringAction.id, status: 'remarcada', scheduledAt: recurringAction.newDate, updateSeries: false });
                  }
                } catch (err) {}
                setRecurringAction(null);
              }}
              className={cn(
                "w-full h-12 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer",
                recurringAction?.type === 'delete' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
              )}
            >
              {recurringAction?.type === 'delete' ? 'Sim, excluir' : 'Sim, remarcar'}
            </button>
          )}
          <button
            onClick={() => setRecurringAction(null)}
            className="w-full h-12 rounded-xl border border-border text-muted-foreground hover:bg-muted/10 text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </ResponsiveDialog>

      <DayLessonsModal
        day={dayLessonsModalDate || new Date()}
        lessons={dayLessonsModalDate ? filteredLessons.filter(l => isSameDay(new Date(l.scheduledAt), dayLessonsModalDate)) : []}
        open={!!dayLessonsModalDate}
        onOpenChange={(v) => !v && setDayLessonsModalDate(null)}
        onOpenDetail={(lesson) => {
          setDayLessonsModalDate(null);
          setDetailLessonId(lesson.id);
        }}
        onStatusChange={handleStatusChange}
        onAddLesson={(day) => {
          setSelectedDate(day);
          setAgendarOpen(true);
          setDayLessonsModalDate(null);
        }}
      />
    </div>
  );
}
