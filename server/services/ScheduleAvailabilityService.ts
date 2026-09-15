// Serviço único de disponibilidade de agenda/salas (FONTE DA VERDADE).
// Usado pelo Dashboard (horários livres + salas ao vivo) e reaproveitável pela Agenda.
// Regras: RN-001 (BRT), RN-002 (slots), RN-003 (livre/parcial/ocupado), RN-004 (sem salas = capacidade 1),
// RN-005 (sobreposição), RN-006 (slots passados), RN-007 (sala ocupada agora), RN-008 (manutenção/inativa).
import { and, eq, gte, lte, inArray, aliasedTable, sql } from "drizzle-orm";
import { getDb } from "../db";
import { settings, lessons, studioRooms, professores, users, students } from "../../drizzle/schema";

export const BRT_TZ = "America/Sao_Paulo";
export const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export interface SchoolDayConfig {
  active: boolean;
  start: string;
  end: string;
}

export type SchoolHours = Record<string, SchoolDayConfig>;

const DEFAULT_DAY: SchoolDayConfig = { active: true, start: "08:00", end: "18:00" };

/** Data "de agora" cujos getters locais refletem o fuso de Brasília (mesmo hack do Aulas.tsx:417). */
export function getBrtNow(base: Date = new Date()): Date {
  return new Date(base.toLocaleString("en-US", { timeZone: BRT_TZ }));
}

/** YYYY-MM-DD no fuso de Brasília. */
export function getBrtDateString(base: Date = new Date()): string {
  return base.toLocaleDateString("en-CA", { timeZone: BRT_TZ });
}

/** Chave do dia da semana (monday..sunday) no fuso de Brasília. */
export function getBrtWeekdayKey(base: Date = new Date()): (typeof WEEKDAY_KEYS)[number] {
  const wd = getBrtNow(base).getDay();
  return WEEKDAY_KEYS[wd] ?? "monday";
}

export function parseSchoolHours(raw: string | null | undefined): SchoolHours {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SchoolHours) : {};
  } catch {
    return {};
  }
}

export function parseHHMM(value: string | undefined | null): number {
  const [h, m] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Gera os slots do dia a partir do expediente + duração da aula. */
export function generateDaySlots(dayConfig: SchoolDayConfig, durationMinutes: number): { time: string; startMin: number; endMin: number }[] {
  const duration = Math.max(5, Math.floor(durationMinutes || 60));
  const start = parseHHMM(dayConfig.start || DEFAULT_DAY.start);
  const end = parseHHMM(dayConfig.end || DEFAULT_DAY.end);
  const slots: { time: string; startMin: number; endMin: number }[] = [];
  let cursor = start;
  while (cursor + duration <= end) {
    slots.push({ time: minutesToHHMM(cursor), startMin: cursor, endMin: cursor + duration });
    cursor += duration;
  }
  return slots;
}

/** Constrói o instante absoluto de um horário do dia no fuso de Brasília (UTC-3). */
function brtInstant(dateStr: string, minutes: number): Date {
  return new Date(`${dateStr}T${minutesToHHMM(minutes)}:00-03:00`);
}

export interface FreeSlot {
  time: string;
  endTime: string;
  status: "livre" | "parcial" | "ocupado" | "passado";
  freeRoomsCount: number;
  freeRooms: { id: number; name: string }[];
  freeProfessors: { id: number; name: string }[];
}

export interface FreeSlotsResult {
  date: string;
  weekday: string;
  isClosed: boolean;
  lessonDuration: number;
  totalRooms: number;
  summary: { freeCount: number; totalSlots: number };
  slots: FreeSlot[];
}

export interface FreeSlotsInput {
  organizationId: number;
  baseDate?: Date;
  professorId?: number;
  roomId?: number;
  includePast?: boolean;
}

/**
 * Relatório de horários livres do dia (RF-001).
 * Filtro por professor: livre se o professor está livre E há sala livre.
 * Filtro por sala: livre se aquela sala está livre.
 * Geral: livre se há pelo menos 1 sala livre.
 */
export async function getFreeSlotsForDay(input: FreeSlotsInput): Promise<FreeSlotsResult> {
  const { organizationId } = input;
  const base = input.baseDate ?? new Date();
  const dateStr = getBrtDateString(base);
  const weekday = getBrtWeekdayKey(base);

  const db = await getDb();
  if (!db) {
    return { date: dateStr, weekday, isClosed: false, lessonDuration: 60, totalRooms: 0, summary: { freeCount: 0, totalSlots: 0 }, slots: [] };
  }

  // Configuração da escola (linha primária = a que tem schoolName)
  const settingsRows = await db
    .select({ schoolHours: settings.schoolHours, lessonDuration: settings.lessonDuration, schoolName: settings.schoolName })
    .from(settings)
    .where(eq(settings.organizationId, organizationId));
  const schoolSet = settingsRows.find((s) => s.schoolName && s.schoolName.trim() !== "") || settingsRows[0];
  const duration = Math.max(5, schoolSet?.lessonDuration ?? 60);
  const schoolHours = parseSchoolHours(schoolSet?.schoolHours);
  const dayConfig = schoolHours[weekday];

  if (!dayConfig || !dayConfig.active) {
    return { date: dateStr, weekday, isClosed: true, lessonDuration: duration, totalRooms: 0, summary: { freeCount: 0, totalSlots: 0 }, slots: [] };
  }

  const rooms = await db
    .select({ id: studioRooms.id, name: studioRooms.name, status: studioRooms.status })
    .from(studioRooms)
    .where(and(eq(studioRooms.organizationId, organizationId), eq(studioRooms.active, true)));
  const activeRooms = rooms.filter((r) => r.status === "ativa");

  const profs = await db
    .select({ id: professores.id, userId: professores.userId, name: users.name })
    .from(professores)
    .leftJoin(users, eq(professores.userId, users.id))
    .where(eq(professores.organizationId, organizationId));

  const startOfDay = brtInstant(dateStr, 0);
  const endOfDay = brtInstant(dateStr, 24 * 60 - 1);
  const dayLessons = await db
    .select({ scheduledAt: lessons.scheduledAt, duration: lessons.duration, studioRoomId: lessons.studioRoomId, userId: lessons.userId })
    .from(lessons)
    .where(and(eq(lessons.organizationId, organizationId), eq(lessons.status, "agendada"), gte(lessons.scheduledAt, startOfDay), lte(lessons.scheduledAt, endOfDay)));

  const slots = generateDaySlots(dayConfig, duration);
  const now = new Date();
  const filteredRoomId = input.roomId;
  const filteredProf = input.professorId ? profs.find((p) => p.id === input.professorId) : undefined;

  const result: FreeSlot[] = [];
  let freeCount = 0;

  for (const slot of slots) {
    const slotStart = brtInstant(dateStr, slot.startMin);
    const slotEnd = brtInstant(dateStr, slot.endMin);
    const isPast = slotStart < now;

    if (isPast && !input.includePast) continue;

    const overlapping = dayLessons.filter((l) => {
      const lStart = new Date(l.scheduledAt);
      const lEnd = new Date(lStart.getTime() + (l.duration || duration) * 60000);
      return lStart < slotEnd && lEnd > slotStart;
    });

    const busyRoomIds = new Set(overlapping.map((l) => l.studioRoomId).filter((v): v is number => v != null));
    const busyProfUserIds = new Set(overlapping.map((l) => l.userId).filter((v): v is number => v != null));

    const freeRooms = activeRooms.filter((r) => !busyRoomIds.has(r.id));
    const freeProfessors = profs.filter((p) => !busyProfUserIds.has(p.userId));

    // Capacidade: sem salas cadastradas = 1 (RN-004)
    const capacity = activeRooms.length > 0 ? activeRooms.length : 1;
    const freeRoomsCount = activeRooms.length > 0 ? freeRooms.length : Math.max(0, capacity - overlapping.length);

    // BUG-003: com filtro de sala, a contagem refere-se àquela sala (0 ou 1)
    const displayFreeRooms = filteredRoomId ? freeRooms.filter((r) => r.id === filteredRoomId) : freeRooms;
    const displayFreeRoomsCount = filteredRoomId ? displayFreeRooms.length : freeRoomsCount;

    let free: boolean;
    if (filteredRoomId) {
      free = !busyRoomIds.has(filteredRoomId);
    } else if (filteredProf) {
      free = !busyProfUserIds.has(filteredProf.userId) && freeRoomsCount > 0;
    } else {
      free = freeRoomsCount > 0;
    }

    let status: FreeSlot["status"];
    if (isPast) status = "passado";
    else if (!free) status = "ocupado";
    else if (filteredRoomId) status = "livre";
    else if (freeRoomsCount >= capacity) status = "livre";
    else status = "parcial";

    if (status === "livre" || status === "parcial") freeCount += 1;

    result.push({
      time: slot.time,
      endTime: minutesToHHMM(slot.endMin),
      status,
      freeRoomsCount: displayFreeRoomsCount,
      freeRooms: displayFreeRooms.map((r) => ({ id: r.id, name: r.name })),
      freeProfessors: (filteredProf ? freeProfessors.filter((p) => p.id === filteredProf.id) : freeProfessors).map((p) => ({ id: p.id, name: p.name || "Professor" })),
    });
  }

  return {
    date: dateStr,
    weekday,
    isClosed: false,
    lessonDuration: duration,
    totalRooms: activeRooms.length,
    summary: { freeCount, totalSlots: result.length },
    slots: result,
  };
}

export interface LiveRoom {
  id: number;
  name: string;
  color: string;
  status: "ativa" | "manutencao" | "inativa";
  isOccupiedNow: boolean;
  currentLesson?: { id: number; title: string; studentName: string | null; professorName: string | null; endsAt: string };
  nextLessonAt?: string | null;
  freeFrom?: string | null;
}

export interface LiveRoomsResult {
  now: string;
  schoolOpen: boolean;
  rooms: LiveRoom[];
}

/** Status em tempo quase real das salas de estúdio (RF-002 / RN-007). */
export async function getLiveRooms(
  organizationId: number,
  opts?: { isAdmin?: boolean; userId?: number },
): Promise<LiveRoomsResult> {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  if (!db) return { now: nowIso, schoolOpen: false, rooms: [] };

  const rooms = await db
    .select()
    .from(studioRooms)
    .where(and(eq(studioRooms.organizationId, organizationId), eq(studioRooms.active, true)));

  const settingsRows = await db
    .select({ schoolHours: settings.schoolHours, lessonDuration: settings.lessonDuration, schoolName: settings.schoolName })
    .from(settings)
    .where(eq(settings.organizationId, organizationId));
  const schoolSet = settingsRows.find((s) => s.schoolName && s.schoolName.trim() !== "") || settingsRows[0];
  const duration = Math.max(5, schoolSet?.lessonDuration ?? 60);
  const schoolHours = parseSchoolHours(schoolSet?.schoolHours);
  const dayConfig = schoolHours[getBrtWeekdayKey(now)];
  const brtNowMin = (() => {
    const b = getBrtNow(now);
    return b.getHours() * 60 + b.getMinutes();
  })();
  const schoolOpen = !!dayConfig && dayConfig.active && brtNowMin >= parseHHMM(dayConfig.start) && brtNowMin < parseHHMM(dayConfig.end);

  if (rooms.length === 0) return { now: nowIso, schoolOpen, rooms: [] };

  const roomIds = rooms.map((r) => r.id);
  // Aulas agendadas de hoje nessas salas
  const startOfDay = new Date(`${getBrtDateString(now)}T00:00:00-03:00`);
  const endOfDay = new Date(`${getBrtDateString(now)}T23:59:59.999-03:00`);
  const profUsers = aliasedTable(users, "live_prof_users");
  const creatorUsers = aliasedTable(users, "live_creator_users");
  const dayLessons = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      scheduledAt: lessons.scheduledAt,
      duration: lessons.duration,
      studioRoomId: lessons.studioRoomId,
      studentName: students.name,
      studentProfessorId: students.professorId,
      professorName: sql<string>`COALESCE(${profUsers.name}, ${creatorUsers.name})`,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .leftJoin(profUsers, eq(students.professorId, profUsers.id))
    .leftJoin(creatorUsers, eq(lessons.userId, creatorUsers.id))
    .where(and(eq(lessons.organizationId, organizationId), eq(lessons.status, "agendada"), inArray(lessons.studioRoomId, roomIds), gte(lessons.scheduledAt, startOfDay), lte(lessons.scheduledAt, endOfDay)));

  // BUG-001: professor não pode ver o nome de aluno de outro professor
  const showAllStudents = !opts || opts.isAdmin === true;

  const liveRooms: LiveRoom[] = rooms.map((room) => {
    const roomLessons = dayLessons
      .filter((l) => l.studioRoomId === room.id)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const current = roomLessons.find((l) => {
      const s = new Date(l.scheduledAt);
      const e = new Date(s.getTime() + (l.duration || duration) * 60000);
      return s <= now && now < e;
    });
    const next = roomLessons.find((l) => new Date(l.scheduledAt) > now);

    const canSeeStudent = current
      ? showAllStudents || current.studentProfessorId == null || current.studentProfessorId === opts?.userId
      : true;

    return {
      id: room.id,
      name: room.name,
      color: room.color,
      status: (room.status as LiveRoom["status"]) || "ativa",
      isOccupiedNow: !!current && room.status === "ativa",
      currentLesson: current
        ? {
            id: current.id,
            title: current.title,
            studentName: canSeeStudent ? current.studentName ?? null : null,
            professorName: current.professorName ?? null,
            endsAt: new Date(new Date(current.scheduledAt).getTime() + (current.duration || duration) * 60000).toISOString(),
          }
        : undefined,
      nextLessonAt: next ? new Date(next.scheduledAt).toISOString() : null,
      freeFrom: current ? new Date(new Date(current.scheduledAt).getTime() + (current.duration || duration) * 60000).toISOString() : null,
    };
  });

  return { now: nowIso, schoolOpen, rooms: liveRooms };
}
