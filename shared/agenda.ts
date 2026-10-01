// ─── Agenda mobile: helpers puros (grade do mês, agregação de status e filtros) ──
// Compartilhado (client) e testável no vitest do server.

export const AGENDA_STATUS_ORDER = ["agendada", "concluida", "falta", "cancelada", "a_repor", "remarcada"] as const;

/** Cor do pontinho no calendário — mesma família visual de AULA_STATUS_CONFIG. */
export const AGENDA_STATUS_DOT: Record<string, { label: string; dot: string }> = {
  agendada: { label: "Agendada", dot: "bg-blue-600" },
  concluida: { label: "Concluída", dot: "bg-emerald-600" },
  falta: { label: "Falta", dot: "bg-amber-500" },
  cancelada: { label: "Cancelada", dot: "bg-rose-600" },
  remarcada: { label: "Remarcada", dot: "bg-purple-600" },
  a_repor: { label: "Aula a Repor", dot: "bg-violet-600" },
};

export const AGENDA_MAX_DOTS = 4;

export interface AgendaLessonLike {
  scheduledAt: string | Date;
  status: string;
  teacherId?: number | null;
  studioRoomId?: number | null;
  instrumentId?: number | null;
  lessonType?: string | null;
}

export interface DayAggregate {
  total: number;
  dots: string[];
  extra: number;
}

export interface AgendaFilters {
  disabledStatuses?: string[];
  teacherId?: number | null;
  roomId?: number | null;
  instrumentId?: number | null;
  lessonType?: string | null;
}

export function startOfWeekLocal(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDayLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function toLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match && !String(value).includes("T")) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  }
  return new Date(value);
}

/** Grade fixa de 6 semanas (42 dias) começando no domingo da semana do dia 1º do mês. */
export function buildMonthGrid(reference: Date): Date[] {
  const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const gridStart = startOfWeekLocal(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDaysLocal(gridStart, i));
}

export function buildWeekStrip(reference: Date): Date[] {
  const start = startOfWeekLocal(reference);
  return Array.from({ length: 7 }, (_, i) => addDaysLocal(start, i));
}

function statusOrderIndex(status: string): number {
  const idx = (AGENDA_STATUS_ORDER as readonly string[]).indexOf(status);
  return idx === -1 ? AGENDA_STATUS_ORDER.length : idx;
}

/** Agrega as aulas de um dia: total + pontinhos (1 por status, máx. 4) + contador "+N" quando total > 4. */
export function aggregateDay(lessons: AgendaLessonLike[], day: Date): DayAggregate {
  const dayLessons = lessons.filter((lesson) => isSameDayLocal(toLocalDate(lesson.scheduledAt), day));
  const total = dayLessons.length;
  if (total === 0) return { total: 0, dots: [], extra: 0 };

  const statuses = Array.from(new Set(dayLessons.map((lesson) => lesson.status))).sort(
    (a, b) => statusOrderIndex(a) - statusOrderIndex(b)
  );

  return {
    total,
    dots: statuses.slice(0, AGENDA_MAX_DOTS),
    extra: total > AGENDA_MAX_DOTS ? total : 0,
  };
}

export function matchesAgendaFilters(lesson: AgendaLessonLike, filters: AgendaFilters): boolean {
  if (filters.disabledStatuses?.includes(lesson.status)) return false;
  if (filters.teacherId != null && lesson.teacherId !== filters.teacherId) return false;
  if (filters.roomId != null && lesson.studioRoomId !== filters.roomId) return false;
  if (filters.instrumentId != null && lesson.instrumentId !== filters.instrumentId) return false;
  if (filters.lessonType && filters.lessonType !== "todos" && lesson.lessonType !== filters.lessonType) return false;
  return true;
}

export function filterAgendaLessons<T extends AgendaLessonLike>(lessons: T[], filters: AgendaFilters): T[] {
  if (
    !filters.disabledStatuses?.length &&
    filters.teacherId == null &&
    filters.roomId == null &&
    filters.instrumentId == null &&
    (!filters.lessonType || filters.lessonType === "todos")
  ) {
    return lessons;
  }
  return lessons.filter((lesson) => matchesAgendaFilters(lesson, filters));
}

export function countActiveAgendaFilters(filters: AgendaFilters): number {
  let count = 0;
  if (filters.disabledStatuses?.length) count += filters.disabledStatuses.length;
  if (filters.teacherId != null) count += 1;
  if (filters.roomId != null) count += 1;
  if (filters.instrumentId != null) count += 1;
  if (filters.lessonType && filters.lessonType !== "todos") count += 1;
  return count;
}

/** True quando a aula está agendada e o horário atual está dentro da janela (início + duração). */
export function isLessonInProgress(
  lesson: { scheduledAt: string | Date; duration?: number | null; status?: string | null },
  now: Date = new Date()
): boolean {
  if (lesson.status && lesson.status !== "agendada") return false;
  const start = toLocalDate(lesson.scheduledAt);
  const end = new Date(start.getTime() + (lesson.duration || 60) * 60000);
  return now >= start && now < end;
}
