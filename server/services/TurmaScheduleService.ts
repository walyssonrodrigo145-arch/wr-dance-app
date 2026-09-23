// Fluxo de dança — a GRADE da turma vira agenda.
// A turma gera AULAS (sessões) mesmo sem alunos; a presença por aluno é
// registrada em lesson_attendance na chamada (professor ou recepção).
import { and, eq, gte, lte, ne, or, sql, isNotNull } from "drizzle-orm";
import { lessons, turmas, turmaAlunos, students, lessonAttendance } from "../../drizzle/schema";

export interface TurmaGrade {
  id: number;
  organizationId: number;
  name: string;
  modalidadeId: number | null;
  professorId: number | null;
  studioRoomId: number | null;
  weekdays: number[] | null;
  timeStr: string | null;
  durationMinutes: number | null;
  status?: string | null;
}

export interface SessionPlan {
  dateISO: string;
  scheduledAt: Date;
  exists?: boolean;
  conflict?: "sala" | "professor";
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Hoje no fuso America/Sao_Paulo (YYYY-MM-DD). */
export function todayBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Soma meses a uma data ISO (YYYY-MM-DD). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1 + months, d));
}

/** Enumera as sessões da grade entre duas datas (inclusive), no fuso America/Sao_Paulo. */
export function enumerateTurmaSessions(turma: TurmaGrade, fromISO: string, toISOStr: string): SessionPlan[] {
  const weekdays = (turma.weekdays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const timeStr = String(turma.timeStr || "").slice(0, 5);
  if (weekdays.length === 0 || !/^\d{2}:\d{2}$/.test(timeStr)) return [];

  const [y0, m0, d0] = fromISO.split("-").map(Number);
  const [y1, m1, d1] = toISOStr.split("-").map(Number);
  if ([y0, m0, d0, y1, m1, d1].some((n) => !Number.isFinite(n))) return [];

  const start = new Date(y0, m0 - 1, d0);
  const end = new Date(y1, m1 - 1, d1);
  const plans: SessionPlan[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!weekdays.includes(d.getDay())) continue;
    const dateISO = toISO(d);
    plans.push({ dateISO, scheduledAt: new Date(`${dateISO}T${timeStr}:00.000-03:00`) });
  }
  return plans;
}

function overlaps(aStart: Date, aMinutes: number, bStart: Date, bMinutes: number) {
  const aEnd = aStart.getTime() + aMinutes * 60000;
  const bEnd = bStart.getTime() + bMinutes * 60000;
  return aStart.getTime() < bEnd && aEnd > bStart.getTime();
}

/**
 * Prévia da geração: quais sessões serão criadas, quais já existem e quais
 * têm conflito de sala/professor. Nada é gravado.
 */
export async function previewTurmaLessons(db: any, turma: TurmaGrade, fromISO: string, toISOStr: string) {
  const plans = enumerateTurmaSessions(turma, fromISO, toISOStr);
  if (plans.length === 0) return { plans, toCreate: 0, existing: 0, conflicts: 0 };

  const duration = turma.durationMinutes || 60;
  const windowStart = new Date(plans[0].scheduledAt.getTime() - 24 * 3600 * 1000);
  const windowEnd = new Date(plans[plans.length - 1].scheduledAt.getTime() + (duration + 24 * 3600) * 1000);

  const nearby: any[] = await db.select({
    id: lessons.id,
    userId: lessons.userId,
    studioRoomId: lessons.studioRoomId,
    duration: lessons.duration,
    scheduledAt: lessons.scheduledAt,
    turmaId: lessons.turmaId,
  }).from(lessons).where(and(
    eq(lessons.organizationId, turma.organizationId),
    ne(lessons.status, "cancelada"),
    gte(lessons.scheduledAt, windowStart),
    lte(lessons.scheduledAt, windowEnd),
    or(
      turma.studioRoomId ? eq(lessons.studioRoomId, turma.studioRoomId) : sql`false`,
      turma.professorId ? eq(lessons.userId, turma.professorId) : sql`false`,
    ),
  ));

  const own = nearby.filter((r) => r.turmaId === turma.id);
  const others = nearby.filter((r) => r.turmaId !== turma.id);
  const ownKeys = new Set(own.map((r) => new Date(r.scheduledAt).toISOString()));

  let existing = 0;
  let conflicts = 0;
  for (const p of plans) {
    const key = p.scheduledAt.toISOString();
    if (ownKeys.has(key)) { p.exists = true; existing++; continue; }
    for (const row of others) {
      const rowStart = new Date(row.scheduledAt);
      if (!overlaps(p.scheduledAt, duration, rowStart, row.duration || 60)) continue;
      if (turma.studioRoomId && row.studioRoomId === turma.studioRoomId) { p.conflict = "sala"; break; }
      if (turma.professorId && row.userId === turma.professorId) { p.conflict = "professor"; break; }
    }
    if (p.conflict) conflicts++;
  }

  const toCreate = plans.filter((p) => !p.exists && !p.conflict).length;
  return { plans, toCreate, existing, conflicts };
}

/**
 * Gera as aulas da turma para o período. Sessões com conflito são puladas
 * (retornadas no resumo) e sessões já existentes não são duplicadas.
 */
export async function generateTurmaLessons(db: any, turma: TurmaGrade, fromISO: string, toISOStr: string) {
  if (!turma.professorId) {
    throw new Error("Defina o professor da turma antes de gerar as aulas.");
  }
  const preview = await previewTurmaLessons(db, turma, fromISO, toISOStr);
  const duration = turma.durationMinutes || 60;

  const rows = preview.plans
    .filter((p) => !p.exists && !p.conflict)
    .map((p) => ({
      organizationId: turma.organizationId,
      userId: turma.professorId as number,
      studentId: undefined,
      turmaId: turma.id,
      title: turma.name,
      scheduledAt: p.scheduledAt,
      duration,
      status: "agendada" as const,
      lessonType: "turma" as const,
      instrumentId: turma.modalidadeId ?? undefined,
      studioRoomId: turma.studioRoomId ?? undefined,
      recurringGroupId: `turma_${turma.id}`,
    }));

  if (rows.length > 0) {
    await db.insert(lessons).values(rows);
  }

  const lastPlan = preview.plans[preview.plans.length - 1];
  if (lastPlan) {
    const [current] = await db.select({ generatedUntil: turmas.generatedUntil }).from(turmas)
      .where(and(eq(turmas.id, turma.id), eq(turmas.organizationId, turma.organizationId))).limit(1);
    const nextUntil = lastPlan.dateISO;
    if (!current?.generatedUntil || String(current.generatedUntil) < nextUntil) {
      await db.update(turmas).set({ generatedUntil: nextUntil, updatedAt: new Date() })
        .where(and(eq(turmas.id, turma.id), eq(turmas.organizationId, turma.organizationId)));
    }
  }

  return {
    created: rows.length,
    existing: preview.existing,
    conflicts: preview.conflicts,
    conflictDates: preview.plans.filter((p) => p.conflict).map((p) => `${p.dateISO} (${p.conflict === "sala" ? "sala" : "professor"})`).slice(0, 10),
  };
}

/** Cancela as aulas futuras ainda agendadas da turma (histórico preservado). */
export async function cancelFutureTurmaLessons(db: any, organizationId: number, turmaId: number) {
  const cancelled = await db.update(lessons)
    .set({ status: "cancelada" })
    .where(and(
      eq(lessons.organizationId, organizationId),
      eq(lessons.turmaId, turmaId),
      eq(lessons.status, "agendada"),
      gte(lessons.scheduledAt, new Date()),
    ))
    .returning({ id: lessons.id });
  return { cancelled: cancelled.length };
}

/** Lista da chamada: alunos ativos da turma + presença já registrada na sessão. */
export async function getTurmaAttendance(db: any, organizationId: number, lessonId: number) {
  const [session] = await db.select().from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.organizationId, organizationId), isNotNull(lessons.turmaId)))
    .limit(1);
  if (!session) return null;

  const [turma] = await db.select().from(turmas)
    .where(and(eq(turmas.id, session.turmaId), eq(turmas.organizationId, organizationId)))
    .limit(1);
  if (!turma) return null;

  const roster = await db.select({
    id: students.id,
    name: students.name,
    phone: students.phone,
    enrollmentStatus: turmaAlunos.status,
  })
    .from(turmaAlunos)
    .innerJoin(students, eq(students.id, turmaAlunos.studentId))
    .where(and(
      eq(turmaAlunos.organizationId, organizationId),
      eq(turmaAlunos.turmaId, session.turmaId),
      eq(turmaAlunos.status, "ativa"),
    ))
    .orderBy(students.name);

  const attendance = await db.select().from(lessonAttendance)
    .where(and(eq(lessonAttendance.organizationId, organizationId), eq(lessonAttendance.lessonId, lessonId)));

  return { session, turma, roster, attendance };
}

/** Salva a chamada (upsert por aluno) e marca a sessão como concluída. */
export async function saveTurmaAttendance(
  db: any,
  organizationId: number,
  lessonId: number,
  entries: Array<{ studentId: number; status: "presente" | "ausente" | "justificado" }>,
  markedByUserId: number,
) {
  const [session] = await db.select({ id: lessons.id, turmaId: lessons.turmaId }).from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.organizationId, organizationId), isNotNull(lessons.turmaId)))
    .limit(1);
  if (!session) throw new Error("Aula de turma não encontrada.");

  const roster = await db.select({ studentId: turmaAlunos.studentId }).from(turmaAlunos)
    .where(and(
      eq(turmaAlunos.organizationId, organizationId),
      eq(turmaAlunos.turmaId, session.turmaId),
      eq(turmaAlunos.status, "ativa"),
    ));
  const allowed = new Set(roster.map((r: any) => r.studentId));
  const valid = entries.filter((e) => allowed.has(e.studentId));
  if (valid.length === 0) return { saved: 0 };

  for (const e of valid) {
    await db.insert(lessonAttendance).values({
      organizationId,
      lessonId,
      studentId: e.studentId,
      status: e.status,
      markedByUserId,
      markedAt: new Date(),
    }).onConflictDoUpdate({
      target: [lessonAttendance.lessonId, lessonAttendance.studentId],
      set: { status: e.status, markedByUserId, markedAt: new Date(), updatedAt: new Date() },
    });
  }

  await db.update(lessons).set({ status: "concluida" })
    .where(and(eq(lessons.id, lessonId), eq(lessons.organizationId, organizationId)));

  return { saved: valid.length };
}
