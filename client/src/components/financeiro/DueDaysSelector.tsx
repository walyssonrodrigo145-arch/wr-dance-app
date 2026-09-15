import { useMemo } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DueDaysSelectorProps {
  /** Dias selecionados (ex: "5,10,15,20"). */
  value: string;
  onChange: (value: string) => void;
}

/** Valores possíveis: dias 1 a 31. */
const ALL_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function DueDaysSelector({ value, onChange }: DueDaysSelectorProps) {
  const selected = useMemo(() => {
    const set = new Set<number>();
    value.split(",").forEach((d) => {
      const n = Number(d.trim());
      if (!isNaN(n) && n >= 1 && n <= 31) set.add(n);
    });
    return set;
  }, [value]);

  const toggleDay = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    onChange(Array.from(next).sort((a, b) => a - b).join(","));
  };

  return (
    <div className="space-y-3">
      {/* Resumo dos dias selecionados */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {Array.from(selected).sort((a, b) => a - b).length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            Nenhum dia selecionado — todos os vencimentos aparecerão em "Outros".
          </span>
        ) : (
          Array.from(selected)
            .sort((a, b) => a - b)
            .map((day) => (
              <span
                key={day}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-500/30 text-xs font-bold"
              >
                Dia {String(day).padStart(2, "0")}
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className="ml-0.5 text-indigo-400 hover:text-rose-500 transition-colors"
                  aria-label={`Remover dia ${day}`}
                >
                  <Plus size={12} className="rotate-45" />
                </button>
              </span>
            ))
        )}
      </div>

      {/* Grade de dias 1-31 */}
      <div className="grid grid-cols-7 gap-1.5">
        {ALL_DAYS.map((day) => {
          const isSelected = selected.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "Remover" : "Adicionar"} dia ${day}`}
              className={cn(
                "h-9 rounded-lg text-xs font-bold border transition-all flex items-center justify-center",
                isSelected
                  ? "bg-indigo-500 text-white border-indigo-500 shadow-sm"
                  : "bg-muted/40 text-muted-foreground border-border hover:border-indigo-400/50 hover:text-foreground"
              )}
            >
              {isSelected ? <Check size={13} strokeWidth={3} /> : day}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        Toque em um dia para adicioná-lo ou removê-lo da previsão do Financeiro. Dias selecionados aparecem no card "Previsão por Vencimento"; os demais são somados em "Outros".
      </p>
    </div>
  );
}
