import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Seletor de data de nascimento integrado ao design do MusicPro (Dia / Mês / Ano).
 * Evita o date picker nativo do celular, mantendo a identidade visual do sistema.
 */
export function BirthDatePicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  const initial = (value || "").split("-");
  const [day, setDay] = useState<string>(initial[2] || "");
  const [month, setMonth] = useState<string>(initial[1] || "");
  const [year, setYear] = useState<string>(initial[0] || "");

  const now = new Date();
  const maxYear = now.getFullYear();
  const minYear = maxYear - 100;

  const daysInMonth = useMemo(() => {
    const y = Number(year) || 2000;
    const m = Number(month) || 1;
    return new Date(y, m, 0).getDate();
  }, [year, month]);

  const emit = (d: string, m: string, y: string) => {
    setDay(d); setMonth(m); setYear(y);
    if (d && m && y) onChange(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    else onChange("");
  };

  const years: number[] = [];
  for (let yy = maxYear; yy >= minYear; yy--) years.push(yy);

  const baseCls = "h-11 rounded-xl border bg-card/50 px-2 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all";

  return (
    <div className={cn("grid grid-cols-3 gap-2", error && "ring-1 ring-rose-500/50 rounded-2xl p-1")}>
      <select
        aria-label="Dia"
        value={day}
        onChange={(e) => emit(e.target.value, month, year)}
        className={cn(baseCls, "border-border/50", !day && "text-muted-foreground")}
      >
        <option value="">Dia</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>{String(d).padStart(2, "0")}</option>
        ))}
      </select>

      <select
        aria-label="Mês"
        value={month}
        onChange={(e) => emit(day, e.target.value, year)}
        className={cn(baseCls, "border-border/50", !month && "text-muted-foreground")}
      >
        <option value="">Mês</option>
        {MONTHS.map((mm, i) => (
          <option key={mm} value={String(i + 1)}>{mm}</option>
        ))}
      </select>

      <select
        aria-label="Ano"
        value={year}
        onChange={(e) => emit(day, month, e.target.value)}
        className={cn(baseCls, "border-border/50", !year && "text-muted-foreground")}
      >
        <option value="">Ano</option>
        {years.map((yy) => (
          <option key={yy} value={String(yy)}>{yy}</option>
        ))}
      </select>
    </div>
  );
}
