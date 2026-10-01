import { useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { addDays, addMonths, addWeeks, format, isSameMonth, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Music, Plus, SlidersHorizontal, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AULA_STATUS_CONFIG } from "@/components/aulas/LessonCardDesktop";
import {
  AGENDA_STATUS_DOT,
  AGENDA_STATUS_ORDER,
  aggregateDay,
  buildMonthGrid,
  buildWeekStrip,
  countActiveAgendaFilters,
  filterAgendaLessons,
  isLessonInProgress,
  isSameDayLocal,
  toLocalDate,
  type AgendaFilters,
} from "@shared/agenda";
import { SCHOOL_HOLIDAY_DOT, holidayTypeLabel, type SchoolHolidayLike, type SchoolHolidayType } from "@shared/schoolCalendar";

type AgendaMode = "mes" | "semana" | "dia";
type AgendaLesson = {
  id: number;
  scheduledAt: string | Date;
  status: string;
  duration?: number | null;
  studentName?: string | null;
  experimentalName?: string | null;
  isExperimental?: boolean | null;
  instrumentName?: string | null;
  studioRoomName?: string | null;
  studioRoomId?: number | null;
  teacherName?: string | null;
  teacherId?: number | null;
  instrumentId?: number | null;
  lessonType?: string | null;
};

interface MobileAgendaProps {
  lessons: AgendaLesson[];
  isLoading?: boolean;
  onOpenLesson: (id: number) => void;
  onOpenAgendar: (date: Date) => void;
}

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

function timeOf(lesson: AgendaLesson): string {
  return format(toLocalDate(lesson.scheduledAt), "HH:mm");
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function MobileAgenda({ lessons, isLoading, onOpenLesson, onOpenAgendar }: MobileAgendaProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [mode, setMode] = useState<AgendaMode>("mes");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [filters, setFilters] = useState<AgendaFilters>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const { data: professoresList = [] } = trpc.professores.list.useQuery(undefined, { enabled: isAdmin });
  const { data: studioRoomsList = [] } = trpc.studioRooms.list.useQuery();
  const { data: instruments = [] } = trpc.instruments.list.useQuery();
  const { data: schoolSettings } = trpc.settings.get.useQuery();
  // Calendário escolar: feriados/recessos/eventos aparecem direto na agenda.
  const { data: holidays = [] } = trpc.schoolHolidays.list.useQuery({ year: selectedDate.getFullYear() });

  const holidayByDate = useMemo(() => {
    const map = new Map<string, SchoolHolidayLike[]>();
    for (const h of holidays as SchoolHolidayLike[]) {
      const key = String(h.date || "").slice(0, 10);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }
    return map;
  }, [holidays]);

  const filteredLessons = useMemo(() => filterAgendaLessons(lessons, filters), [lessons, filters]);
  const monthGrid = useMemo(() => buildMonthGrid(selectedDate), [selectedDate]);
  const weekStrip = useMemo(() => buildWeekStrip(selectedDate), [selectedDate]);
  const activeFilters = countActiveAgendaFilters(filters);

  const dayLessons = useMemo(
    () =>
      filteredLessons
        .filter((lesson) => isSameDayLocal(toLocalDate(lesson.scheduledAt), selectedDate))
        .sort((a, b) => toLocalDate(a.scheduledAt).getTime() - toLocalDate(b.scheduledAt).getTime()),
    [filteredLessons, selectedDate]
  );

  const selectedHolidays = holidayByDate.get(dateKey(selectedDate)) ?? [];

  const dayClosed = useMemo(() => {
    if (!schoolSettings?.schoolHours) return false;
    try {
      const hours = typeof schoolSettings.schoolHours === "string" ? JSON.parse(schoolSettings.schoolHours) : schoolSettings.schoolHours;
      const key = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][selectedDate.getDay()];
      return hours?.[key]?.active === false;
    } catch {
      return false;
    }
  }, [schoolSettings, selectedDate]);

  const shiftPeriod = (direction: 1 | -1) => {
    setSelectedDate((current) => {
      if (mode === "dia") return addDays(current, direction);
      if (mode === "semana") return addWeeks(current, direction);
      return addMonths(current, direction);
    });
  };

  const toggleStatus = (status: string) => {
    setFilters((current) => {
      const disabled = new Set(current.disabledStatuses || []);
      if (disabled.has(status)) disabled.delete(status);
      else disabled.add(status);
      const list = Array.from(disabled);
      return { ...current, disabledStatuses: list.length ? list : undefined };
    });
  };

  const periodLabel =
    mode === "mes"
      ? format(selectedDate, "MMMM yyyy", { locale: ptBR })
      : mode === "semana"
        ? `${format(weekStrip[0], "dd MMM", { locale: ptBR })} – ${format(weekStrip[6], "dd MMM", { locale: ptBR })}`
        : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  const renderHolidayDot = (day: Date, selected: boolean) => {
    const entries = holidayByDate.get(dateKey(day)) ?? [];
    if (entries.length === 0) return null;
    const type = (entries[0].type || "feriado_nacional") as SchoolHolidayType;
    return (
      <span
        title={entries.map((e) => e.name).join(" • ")}
        className={cn(
          "absolute bottom-0.5 left-1 w-1.5 h-1.5 rounded-full ring-1",
          selected ? "bg-white ring-white/40" : cn(SCHOOL_HOLIDAY_DOT[type] ?? "bg-rose-400", "ring-background")
        )}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="h-11 rounded-2xl bg-muted animate-pulse" />
        <div className="h-72 rounded-[1.75rem] bg-muted/60 animate-pulse" />
        <div className="h-28 rounded-2xl bg-muted/60 animate-pulse" />
        <div className="h-28 rounded-2xl bg-muted/60 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className="space-y-4 pb-28 animate-in fade-in duration-300"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        touchRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          shiftPeriod(dx < 0 ? 1 : -1);
        }
      }}
    >
      {/* Cabeçalho: período + filtros */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shiftPeriod(-1)}
            aria-label="Período anterior"
            className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-black text-foreground uppercase tracking-widest capitalize min-w-[130px] text-center">
            {periodLabel}
          </h2>
          <button
            type="button"
            onClick={() => shiftPeriod(1)}
            aria-label="Próximo período"
            className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isToday(selectedDate) && (
            <button
              type="button"
              onClick={() => setSelectedDate(new Date())}
              className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest"
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            aria-label="Filtros da agenda"
          >
            <SlidersHorizontal size={16} />
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Alternador Mês / Semana / Dia */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted/40 border border-border/30">
        {(["mes", "semana", "dia"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {value === "mes" ? "Mês" : value === "semana" ? "Semana" : "Dia"}
          </button>
        ))}
      </div>

      {/* Calendário */}
      <div className="rounded-[1.75rem] border border-border/60 bg-card/40 backdrop-blur-xl shadow-xl shadow-primary/5 p-3 sm:p-4">
        {mode === "mes" ? (
          <>
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((label, i) => (
                <span key={`${label}-${i}`} className="text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground py-1">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {monthGrid.map((day, i) => {
                const aggregate = aggregateDay(filteredLessons, day);
                const selected = isSameDayLocal(day, selectedDate);
                const today = isToday(day);
                const outside = !isSameMonth(day, selectedDate);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}${aggregate.total ? `, ${aggregate.total} aula(s)` : ""}`}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-[3px] h-11 rounded-xl transition-all",
                      selected ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted/60",
                      outside && !selected && "opacity-35"
                    )}
                  >
                    <span className={cn("text-[13px] font-black tracking-tight", today && !selected && "text-primary")}>{format(day, "d")}</span>
                    {aggregate.total > 0 && (
                      <span className="flex items-center gap-[3px] h-[6px]">
                        {aggregate.dots.map((status) => (
                          <span
                            key={status}
                            className={cn("w-[5px] h-[5px] rounded-full", selected ? "bg-primary-foreground/80" : AGENDA_STATUS_DOT[status]?.dot || "bg-muted-foreground")}
                          />
                        ))}
                      </span>
                    )}
                    {aggregate.extra > 0 && (
                      <span className={cn("absolute top-0.5 right-1 text-[8px] font-black", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        +{aggregate.extra}
                      </span>
                    )}
                    {renderHolidayDot(day, selected)}
                    {today && !selected && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {weekStrip.map((day, i) => {
              const aggregate = aggregateDay(filteredLessons, day);
              const selected = isSameDayLocal(day, selectedDate);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}${aggregate.total ? `, ${aggregate.total} aula(s)` : ""}`}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-2xl py-2.5 transition-all",
                    selected ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted/60"
                  )}
                >
                  <span className={cn("text-[9px] font-black uppercase tracking-widest", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {format(day, "eee", { locale: ptBR }).slice(0, 3)}
                  </span>
                  <span className={cn("text-sm font-black tracking-tight", isToday(day) && !selected && "text-primary")}>{format(day, "d")}</span>
                  <span className="flex items-center gap-[3px] h-[6px]">
                    {aggregate.dots.map((status) => (
                      <span
                        key={status}
                        className={cn("w-[5px] h-[5px] rounded-full", selected ? "bg-primary-foreground/80" : AGENDA_STATUS_DOT[status]?.dot || "bg-muted-foreground")}
                      />
                    ))}
                  </span>
                  {renderHolidayDot(day, selected)}
                </button>
              );
            })}
          </div>
        )}

        {/* Legenda clicável (filtra por status) */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3 mt-2 border-t border-border/40">
          {AGENDA_STATUS_ORDER.map((status) => {
            const disabled = filters.disabledStatuses?.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={!disabled}
                className={cn(
                  "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                  disabled ? "opacity-35 line-through" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", AGENDA_STATUS_DOT[status].dot)} />
                {AGENDA_STATUS_DOT[status].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chips de filtros ativos */}
      {activeFilters > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {filters.teacherId != null && (
            <FilterChip
              label={`Prof.: ${(professoresList as any[]).find((p) => p.userId === filters.teacherId)?.name || "selecionado"}`}
              onRemove={() => setFilters((c) => ({ ...c, teacherId: undefined }))}
            />
          )}
          {filters.roomId != null && (
            <FilterChip
              label={`Sala: ${(studioRoomsList as any[]).find((r) => r.id === filters.roomId)?.name || "selecionada"}`}
              onRemove={() => setFilters((c) => ({ ...c, roomId: undefined }))}
            />
          )}
          {filters.instrumentId != null && (
            <FilterChip
              label={`Modalidade: ${(instruments as any[]).find((i) => i.id === filters.instrumentId)?.name || "selecionada"}`}
              onRemove={() => setFilters((c) => ({ ...c, instrumentId: undefined }))}
            />
          )}
          {filters.lessonType && filters.lessonType !== "todos" && (
            <FilterChip
              label={filters.lessonType === "turma" ? "Turma" : filters.lessonType === "online" ? "Online" : "Individual"}
              onRemove={() => setFilters((c) => ({ ...c, lessonType: undefined }))}
            />
          )}
          <button
            type="button"
            onClick={() => setFilters({})}
            className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary hover:underline px-2"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Aviso do calendário escolar no dia selecionado */}
      {selectedHolidays.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1">
          {selectedHolidays.map((h, i) => (
            <p key={`${h.date}-${i}`} className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <CalendarDays size={13} /> {h.name}
              <span className="text-[9px] opacity-70">({holidayTypeLabel(h.type)})</span>
            </p>
          ))}
        </div>
      )}

      {/* Lista do dia */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-primary" />
            <h3 className="text-xs font-black text-foreground uppercase tracking-widest">
              Aulas do dia — {format(selectedDate, "dd/MM/yyyy")}
            </h3>
          </div>
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-card border border-border px-3 py-1 rounded-full">
            {dayLessons.length} {dayLessons.length === 1 ? "aula" : "aulas"}
          </span>
        </div>

        {dayLessons.length === 0 ? (
          <div className="py-12 text-center rounded-[1.75rem] border border-dashed border-border/70 bg-card/40">
            <CalendarDays size={36} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              {selectedHolidays.length > 0
                ? `${holidayTypeLabel(selectedHolidays[0].type)}: ${selectedHolidays[0].name}`
                : dayClosed ? "Escola fechada neste dia" : "Nenhuma aula neste dia"}
            </p>
            <button
              type="button"
              onClick={() => onOpenAgendar(selectedDate)}
              className="mt-3 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
            >
              Agendar aula neste dia
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayLessons.map((lesson, index) => {
              const isTurma = lesson.lessonType === "turma";
              const statusConfig = AULA_STATUS_CONFIG[lesson.status as keyof typeof AULA_STATUS_CONFIG] || AULA_STATUS_CONFIG.agendada;
              const title = isTurma ? lesson.studentName || "Turma" : lesson.studentName || lesson.experimentalName || lesson.instrumentName || "Aula";
              const inProgress = isLessonInProgress(lesson);
              return (
                <motion.button
                  key={lesson.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.2) }}
                  onClick={() => onOpenLesson(lesson.id)}
                  className={cn(
                    "w-full text-left rounded-2xl border border-l-4 p-3.5 shadow-sm transition-all active:scale-[0.99]",
                    inProgress && "ring-2 ring-amber-400/50",
                    isTurma ? "bg-purple-50 dark:bg-purple-950 border-purple-300/80 dark:border-purple-800/60 border-l-purple-600" : cn(statusConfig.cardBg, statusConfig.border)
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-lg font-black text-foreground tracking-tighter">{timeOf(lesson)}</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{lesson.status === "agendada" ? "" : statusConfig.label}</span>
                      {inProgress && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Em andamento
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {lesson.isExperimental && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-black uppercase tracking-widest">
                          Experimental
                        </span>
                      )}
                      <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest", isTurma ? "bg-purple-600 text-white" : statusConfig.badgeBg)}>
                        {isTurma ? "Turma" : statusConfig.label}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm font-black text-foreground truncate">{title}</p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
                    {lesson.instrumentName && (
                      <span className="inline-flex items-center gap-1">
                        <Music size={11} /> {lesson.instrumentName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> {lesson.duration ?? 60}min
                    </span>
                    {lesson.studioRoomName && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} /> {lesson.studioRoomName}
                      </span>
                    )}
                    {isAdmin && lesson.teacherName && (
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} /> {lesson.teacherName}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>

      {/* FAB agendar rápido */}
      <div className="fixed bottom-[104px] right-5 z-30">
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onOpenAgendar(selectedDate)}
          aria-label="Agendar aula no dia selecionado"
          className="bg-primary text-primary-foreground w-14 h-14 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(37,99,235,0.5)]"
        >
          <Plus size={26} strokeWidth={3} />
        </motion.button>
      </div>

      {/* Filtros (bottom sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[1.75rem] max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-outfit text-lg font-extrabold">Filtros da agenda</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 pt-2 pb-6">
            {isAdmin && (
              <FilterField label="Professor">
                <select
                  value={filters.teacherId ?? ""}
                  onChange={(e) => setFilters((c) => ({ ...c, teacherId: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full h-11 rounded-xl bg-muted/50 border border-border px-3 text-sm font-semibold outline-none"
                >
                  <option value="">Todos os professores</option>
                  {(professoresList as any[]).map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}

            <FilterField label="Sala">
              <select
                value={filters.roomId ?? ""}
                onChange={(e) => setFilters((c) => ({ ...c, roomId: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full h-11 rounded-xl bg-muted/50 border border-border px-3 text-sm font-semibold outline-none"
              >
                <option value="">Todas as salas</option>
                {(studioRoomsList as any[]).filter((r) => r.active !== false).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Modalidade">
              <select
                value={filters.instrumentId ?? ""}
                onChange={(e) => setFilters((c) => ({ ...c, instrumentId: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full h-11 rounded-xl bg-muted/50 border border-border px-3 text-sm font-semibold outline-none"
              >
                <option value="">Todas as modalidades</option>
                {(instruments as any[]).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Tipo de aula">
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "todos", label: "Todas" },
                  { id: "individual", label: "Individual" },
                  { id: "turma", label: "Turma" },
                  { id: "online", label: "Online" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilters((c) => ({ ...c, lessonType: option.id }))}
                    className={cn(
                      "h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      (filters.lessonType || "todos") === option.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </FilterField>

            <FilterField label="Status">
              <div className="flex flex-wrap gap-2">
                {AGENDA_STATUS_ORDER.map((status) => {
                  const disabled = filters.disabledStatuses?.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      aria-pressed={!disabled}
                      className={cn(
                        "flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        disabled ? "bg-muted/40 text-muted-foreground border-border opacity-60" : "bg-card text-foreground border-border"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full", AGENDA_STATUS_DOT[status].dot)} />
                      {AGENDA_STATUS_DOT[status].label}
                    </button>
                  );
                })}
              </div>
            </FilterField>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilters({})}
                className="flex-1 h-12 rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                Limpar filtros
              </Button>
              <Button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex-1 h-12 rounded-2xl font-black text-xs uppercase tracking-widest"
              >
                Ver resultado
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">{label}</p>
      {children}
    </div>
  );
}
