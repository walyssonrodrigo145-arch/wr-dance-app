// ─── Geração de ocorrências recorrentes (PRD_AGENDA_RECORRENCIA_002) ──────────
// Função pura compartilhada (client calcula as datas, backend recebe pronto).
// Intervalos: semanal (7d) | quinzenal (14d) | mensal30 (30d corridos) | mensal_fixo (dia do mês, RN-001).

export type RecurrenceInterval = "semanal" | "quinzenal" | "mensal30" | "mensal_fixo";

export interface RecurrenceSlot {
  dayOfWeek: number; // 0=dom .. 6=sáb
  time: string; // "HH:mm"
  studioRoomId?: string | number | null;
}

export interface OccurrenceResult {
  date: Date;
  slot: RecurrenceSlot | null; // null = mensal_fixo (data base, sem slot de weekday)
}

export const MAX_OCCURRENCES = 200; // RN-004

export const RECURRENCE_INTERVALS: Array<{ id: RecurrenceInterval; label: string }> = [
  { id: "semanal", label: "Semanal" },
  { id: "quinzenal", label: "Quinzenal (15/15 dias)" },
  { id: "mensal30", label: "Mensal (30/30 dias)" },
  { id: "mensal_fixo", label: "Mensal (dia fixo do mês)" },
];

export const RECURRENCE_DURATIONS: Record<RecurrenceInterval, Array<{ value: number; label: string }>> = {
  semanal: [
    { value: 2, label: "2 semanas" },
    { value: 4, label: "4 semanas (~1 mês)" },
    { value: 8, label: "8 semanas (~2 meses)" },
    { value: 12, label: "12 semanas (~3 meses)" },
    { value: 26, label: "26 semanas (~6 meses)" },
    { value: 52, label: "52 semanas (~1 ano)" },
    { value: 104, label: "104 semanas (~2 anos)" },
  ],
  quinzenal: [
    { value: 2, label: "2 aulas (~1 mês)" },
    { value: 4, label: "4 aulas (~2 meses)" },
    { value: 8, label: "8 aulas (~4 meses)" },
    { value: 13, label: "13 aulas (~6 meses)" },
    { value: 26, label: "26 aulas (~1 ano)" },
    { value: 52, label: "52 aulas (~2 anos)" },
  ],
  mensal30: [
    { value: 3, label: "3 aulas (~3 meses)" },
    { value: 6, label: "6 aulas (~6 meses)" },
    { value: 12, label: "12 aulas (~1 ano)" },
    { value: 24, label: "24 aulas (~2 anos)" },
  ],
  mensal_fixo: [
    { value: 3, label: "3 aulas (~3 meses)" },
    { value: 6, label: "6 aulas (~6 meses)" },
    { value: 12, label: "12 aulas (~1 ano)" },
    { value: 24, label: "24 aulas (~2 anos)" },
  ],
};

function atTime(base: Date, time: string): Date {
  const [h, m] = (time || "09:00").split(":").map(Number);
  const d = new Date(base.getTime());
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/** RN-001: soma meses mantendo o dia; clamp para o último dia quando inexistente (31/jan → 28/29-fev). */
export function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getDate();
  const d = new Date(base.getFullYear(), base.getMonth(), 1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * Gera as datas da série.
 * - semanal/quinzenal/mensal30: cada slot (dia da semana) repete a cada `step` dias,
 *   com a 1ª ocorrência alinhada ao próximo dia da semana ≥ data base (paridade com o fluxo atual).
 * - mensal_fixo: ignora slots; ocorrência k = base + k meses (clamp RN-001), horário = fallbackTime.
 */
export function generateOccurrences(
  interval: RecurrenceInterval,
  duration: number,
  baseDate: Date, // apenas ano/mês/dia são usados
  slots: RecurrenceSlot[],
  fallbackTime: string,
): OccurrenceResult[] {
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const baseDay = base.getDay();
  const results: OccurrenceResult[] = [];

  if (interval === "mensal_fixo") {
    for (let k = 0; k < duration; k++) {
      results.push({ date: atTime(addMonthsClamped(base, k), fallbackTime), slot: null });
    }
    return results;
  }

  const step = interval === "semanal" ? 7 : interval === "quinzenal" ? 14 : 30;
  const effectiveSlots: RecurrenceSlot[] =
    slots.length > 0 ? slots : [{ dayOfWeek: baseDay, time: fallbackTime }];

  for (let w = 0; w < duration; w++) {
    for (const slot of effectiveSlots) {
      let dayDiff = slot.dayOfWeek - baseDay;
      if (dayDiff < 0) dayDiff += 7;
      const target = new Date(base.getTime());
      target.setDate(base.getDate() + w * step + dayDiff);
      results.push({ date: atTime(target, slot.time || fallbackTime), slot });
    }
  }
  return results;
}
