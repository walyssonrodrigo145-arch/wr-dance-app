import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { AlertCircle, CalendarClock, Users, CheckCircle2, ChevronRight } from "lucide-react";

/**
 * Fase 3 — "Atenção hoje": central compacta de pendências do dono
 * (pagamentos atrasados, lista de espera e autorizações de eventos).
 */
export function AttentionCard() {
  const [, setLocation] = useLocation();
  const { data } = trpc.dashboard.attentionToday.useQuery(undefined, { staleTime: 60_000 });

  if (!data) return null;

  const items = [
    data.overdueCount > 0 && {
      key: "overdue",
      icon: AlertCircle,
      cls: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      label: `${data.overdueCount} pagamento${data.overdueCount === 1 ? "" : "s"} atrasado${data.overdueCount === 1 ? "" : "s"}`,
      detail: `Total em aberto: ${formatBRL(data.overdueTotal)}`,
      to: "/financeiro",
    },
    data.waitlistCount > 0 && {
      key: "waitlist",
      icon: Users,
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      label: `${data.waitlistCount} aluno${data.waitlistCount === 1 ? "" : "s"} na lista de espera`,
      detail: "Abra uma turma ou promova para uma vaga",
      to: "/turmas",
    },
    data.eventsPendingAuth > 0 && {
      key: "events",
      icon: CalendarClock,
      cls: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      label: `${data.eventsPendingAuth} evento${data.eventsPendingAuth === 1 ? "" : "s"} com autorização pendente`,
      detail: "Faltam autorizações de imagem/participação",
      to: "/eventos",
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: typeof AlertCircle;
    cls: string;
    label: string;
    detail: string;
    to: string;
  }>;

  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 border border-white/10 shadow-2xl shadow-primary/5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
          items.length > 0 ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
        )}>
          {items.length > 0 ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
        </div>
        <div>
          <h3 className="text-base font-black text-foreground tracking-tight">Atenção hoje</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
            {items.length > 0 ? `${items.length} pendência${items.length === 1 ? "" : "s"} para resolver` : "Nada pendente — tudo em dia"}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => setLocation(item.to)}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 text-left transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] cursor-pointer"
            >
              <span className={cn("w-8 h-8 rounded-xl border flex items-center justify-center shrink-0", item.cls)}>
                <item.icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-foreground leading-snug">{item.label}</span>
                <span className="block text-[10px] text-muted-foreground font-medium mt-1 leading-snug">{item.detail}</span>
              </span>
              <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
