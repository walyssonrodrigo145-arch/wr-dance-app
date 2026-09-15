import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { cn } from "@/lib/utils";

/** Botão "olhinho" — mascara/desmascara valores financeiros (Dashboard + Financeiro). */
export function EyeToggleButton({ className }: { className?: string }) {
  const { hideFinancialValues, toggleHideFinancialValues } = useDashboardPrefs();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={hideFinancialValues ? "Mostrar valores financeiros" : "Ocultar valores financeiros"}
      title={hideFinancialValues ? "Mostrar valores" : "Ocultar valores"}
      onClick={toggleHideFinancialValues}
      className={cn(
        "relative rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 shrink-0",
        hideFinancialValues
          ? "bg-amber-500/15 border-amber-500/30 text-amber-600 hover:bg-amber-500/25 shadow-lg shadow-amber-500/10"
          : "bg-card/40 backdrop-blur-md border-white/10 text-muted-foreground hover:text-foreground hover:bg-card/70 shadow-lg shadow-primary/5",
        className
      )}
    >
      <span className="relative flex h-[18px] w-[18px] items-center justify-center">
        <Eye
          size={18}
          className={cn(
            "absolute transition-all duration-300",
            hideFinancialValues ? "opacity-0 scale-50 rotate-12" : "opacity-100 scale-100 rotate-0"
          )}
        />
        <EyeOff
          size={18}
          className={cn(
            "absolute transition-all duration-300",
            hideFinancialValues ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-12"
          )}
        />
      </span>
    </Button>
  );
}
