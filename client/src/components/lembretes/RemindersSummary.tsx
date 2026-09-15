import { Bell, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  pending: number;
  delayed: number;
}

export function RemindersSummary({ total, pending, delayed }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="flex items-center gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bell size={24} className="text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Total</p>
          <p className="text-2xl font-black text-foreground">{total}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
          <Clock size={24} className="text-amber-500" />
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-widest">Pendentes</p>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-400">{pending}</p>
        </div>
      </div>

      <div className={cn(
        "flex items-center gap-4 p-4 rounded-2xl shadow-sm transition-colors",
        delayed > 0 
          ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50" 
          : "bg-card border border-border"
      )}>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          delayed > 0 ? "bg-red-100 dark:bg-red-900/50" : "bg-muted"
        )}>
          <AlertTriangle size={24} className={delayed > 0 ? "text-red-500" : "text-muted-foreground"} />
        </div>
        <div>
          <p className={cn(
            "text-xs font-semibold uppercase tracking-widest",
            delayed > 0 ? "text-red-600 dark:text-red-500" : "text-muted-foreground"
          )}>
            Atrasados
          </p>
          <p className={cn(
            "text-2xl font-black",
            delayed > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
          )}>
            {delayed}
          </p>
        </div>
      </div>
    </div>
  );
}
