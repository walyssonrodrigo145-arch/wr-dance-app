import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Repeat, Lock, CalendarCheck, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  aguardando_liberacao: { label: "Aguardando liberação", icon: Lock, cls: "text-slate-500 bg-slate-500/10" },
  disponivel: { label: "Crédito disponível", icon: Repeat, cls: "text-emerald-600 bg-emerald-500/10" },
  agendada: { label: "Reposição agendada", icon: CalendarCheck, cls: "text-blue-600 bg-blue-500/10" },
  realizada: { label: "Reposição realizada", icon: CheckCircle2, cls: "text-violet-600 bg-violet-500/10" },
  expirada: { label: "Expirada", icon: AlertTriangle, cls: "text-rose-600 bg-rose-500/10" },
  cancelada: { label: "Cancelada", icon: AlertTriangle, cls: "text-zinc-500 bg-zinc-500/10" },
};

/**
 * PRD 01 §19 — Portal do aluno: créditos de reposição, reposições agendadas e histórico.
 */
export function RepositionCreditsCard() {
  const [, navigate] = useLocation();
  const { data: items = [], isLoading } = trpc.repositions.my.useQuery();
  const visible = (items as any[]).slice(0, 4);

  return (
    <div className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-card/80 backdrop-blur-3xl rounded-[2rem] overflow-hidden h-full flex flex-col">
      {/* Header no padrão SectionCard do portal do aluno */}
      <div className="flex items-center justify-between gap-3 p-5 md:p-6 pb-4 border-b border-border/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Repeat size={16} />
          </div>
          <h3 className="text-base md:text-lg font-black tracking-tight text-foreground truncate">Reposições</h3>
        </div>
        {items.length > 0 && (
          <button onClick={() => navigate("/aluno/aulas")} className="text-[10px] font-black text-primary uppercase tracking-[0.15em] hover:text-primary/70 transition-all shrink-0">
            Ver agenda
          </button>
        )}
      </div>

      <div className="p-5 md:p-6 flex-1">
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={20} className="animate-spin text-violet-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 mb-3">
              <Repeat size={22} />
            </div>
            <p className="text-sm font-black text-foreground">Nenhuma reposição</p>
            <p className="text-xs text-muted-foreground font-medium mt-1.5 max-w-[240px]">
              Se você faltar a uma aula com direito à reposição, o crédito aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.cancelada;
              const Icon = cfg.icon;
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl border border-border/40 bg-background/60 hover:border-violet-500/30 transition-all duration-300">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", cfg.cls)}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold truncate">
                      {r.reasonName ? `${r.reasonName} · ` : ""}
                      {r.status === "agendada" && r.scheduledAt
                        ? format(new Date(r.scheduledAt), "dd/MM/yyyy 'às' HH:mm")
                        : r.status === "disponivel" && r.expiresAt
                          ? `Válido até ${format(new Date(r.expiresAt), "dd/MM/yyyy")}`
                          : `Criado em ${format(new Date(r.createdAt), "dd/MM/yyyy")}`}
                    </p>
                  </div>
                </div>
              );
            })}
            {items.length > visible.length && (
              <p className="text-[10px] text-muted-foreground font-bold text-center pt-1">
                + {items.length - visible.length} registro(s) no histórico
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
