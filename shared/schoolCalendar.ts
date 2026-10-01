// Calendário Escolar (Feriados, Recessos e Eventos) — helpers puros compartilhados.
// Pensado para escola de dança: recessos de julho/janeiro, Carnaval, ensaios gerais
// e eventos da escola marcados direto na agenda.

export const SCHOOL_HOLIDAY_TYPES = [
  { id: "recesso", label: "Recesso", color: "amber" },
  { id: "feriado_nacional", label: "Feriado Nacional", color: "emerald" },
  { id: "feriado_estadual", label: "Feriado Estadual", color: "cyan" },
  { id: "feriado_municipal", label: "Feriado Municipal", color: "fuchsia" },
  { id: "evento", label: "Evento da Escola", color: "rose" },
] as const;

export type SchoolHolidayType = (typeof SCHOOL_HOLIDAY_TYPES)[number]["id"];

export const SCHOOL_HOLIDAY_TYPE_IDS = SCHOOL_HOLIDAY_TYPES.map((t) => t.id) as SchoolHolidayType[];

export function holidayTypeLabel(id?: string | null): string {
  if (!id) return "Feriado";
  return SCHOOL_HOLIDAY_TYPES.find((t) => t.id === id)?.label || id;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) como {month, day}. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, days: number): { month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export interface NationalHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * Feriados nacionais brasileiros do ano (fixos + móveis ligados à Páscoa).
 * Não inclui feriados estaduais/municipais (variam por cidade/estado).
 */
export function nationalHolidays(year: number): NationalHoliday[] {
  const easter = easterSunday(year);
  const carnavalDom = addDays(year, easter.month, easter.day, -49);
  const carnavalSeg = addDays(year, easter.month, easter.day, -48);
  const carnavalTer = addDays(year, easter.month, easter.day, -47);
  const sextaSanta = addDays(year, easter.month, easter.day, -2);

  return [
    { date: iso(year, 1, 1), name: "Confraternização Universal" },
    { date: iso(year, carnavalDom.month, carnavalDom.day), name: "Domingo de Carnaval" },
    { date: iso(year, carnavalSeg.month, carnavalSeg.day), name: "Segunda-feira de Carnaval" },
    { date: iso(year, carnavalTer.month, carnavalTer.day), name: "Carnaval" },
    { date: iso(year, sextaSanta.month, sextaSanta.day), name: "Sexta-feira Santa" },
    { date: iso(year, 4, 21), name: "Tiradentes" },
    { date: iso(year, 5, 1), name: "Dia do Trabalho" },
    { date: iso(year, 9, 7), name: "Independência do Brasil" },
    { date: iso(year, 10, 12), name: "Nossa Senhora Aparecida" },
    { date: iso(year, 11, 2), name: "Finados" },
    { date: iso(year, 11, 15), name: "Proclamação da República" },
    { date: iso(year, 11, 20), name: "Dia da Consciência Negra" },
    { date: iso(year, 12, 25), name: "Natal" },
  ];
}

/** Estrutura pronta para montar a grade de um mês (semana começando no domingo). */
export function monthGrid(year: number, month: number): Array<{ day: number; date: string } | null> {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: iso(year, month, d) });
  return cells;
}

/** Cor do pontinho de feriado/recesso na agenda (mesma família da tela do Calendário). */
export const SCHOOL_HOLIDAY_DOT: Record<SchoolHolidayType, string> = {
  recesso: "bg-amber-400",
  feriado_nacional: "bg-emerald-400",
  feriado_estadual: "bg-cyan-400",
  feriado_municipal: "bg-fuchsia-400",
  evento: "bg-rose-400",
};

export interface SchoolHolidayLike {
  date: string;
  name: string;
  type: string;
}

/** Agrupa marcações por data (YYYY-MM-DD) para consulta rápida na agenda. */
export function buildHolidayMap<T extends SchoolHolidayLike>(list: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list || []) {
    const key = String(item.date || "").slice(0, 10);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}
