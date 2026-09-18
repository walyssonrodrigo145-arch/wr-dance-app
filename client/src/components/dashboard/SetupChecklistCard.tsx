import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Rocket, Check, ChevronRight, X } from "lucide-react";

const DISMISS_KEY = "dancepro_setup_checklist_dismissed";

/**
 * Fase 3 — "Escola pronta em 10 minutos": checklist de onboarding calculado
 * dos dados reais da escola. Some quando tudo é concluído ou quando o dono oculta.
 */
export function SetupChecklistCard() {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1"
  );
  const { data } = trpc.dashboard.setupProgress.useQuery(undefined, { staleTime: 60_000 });

  if (dismissed || !data || data.completed >= data.total) return null;

  const pct = Math.round((data.completed / data.total) * 100);

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 border border-primary/20 shadow-2xl shadow-primary/5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Rocket size={20} />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground tracking-tight">Escola pronta em 10 minutos</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              {data.completed} de {data.total} passos concluídos
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="w-8 h-8 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0"
          aria-label="Ocultar checklist"
          title="Ocultar"
        >
          <X size={14} />
        </button>
      </div>

      <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.steps.map((step) => (
          <button
            key={step.key}
            onClick={() => setLocation(step.to)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] cursor-pointer",
              step.done
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-border/60 bg-card/60 hover:border-primary/30 hover:bg-primary/5"
            )}
          >
            <span
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border",
                step.done
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-muted/40 text-muted-foreground border-border/60"
              )}
            >
              {step.done ? <Check size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-xs font-black truncate", step.done ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                {step.label}
              </span>
              <span className="block text-[10px] text-muted-foreground font-medium truncate">{step.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
