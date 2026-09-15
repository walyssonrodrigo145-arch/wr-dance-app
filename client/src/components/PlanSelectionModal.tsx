// 🚀 Modal de seleção de planos do MusicPro — aparece para admins com escola em trial
// (ex.: contas criadas via login Google). Assinatura via Asaas (platform.changePlan).
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Check, Loader2, Clock, Crown } from "lucide-react";

const DISMISS_KEY = "musicpro_plan_modal_dismissed";

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxStudents: number;
  features: string[];
  isPopular: boolean;
}

export function PlanSelectionModal() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1"
  );
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const { data: mySub } = trpc.platform.mySubscription.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  const { data: plans = [], isLoading: loadingPlans } = trpc.platform.getPublicPlans.useQuery(
    undefined,
    { enabled: user?.role === "admin" }
  );

  const changePlanMutation = trpc.platform.changePlan.useMutation({
    onSuccess: (res: any) => {
      toast.success(res?.message || "Plano selecionado! Conclua o pagamento para ativar.");
      utils.platform.mySubscription.invalidate();
      if (res?.paymentLink) {
        window.location.href = res.paymentLink;
      }
    },
    onError: (e) => {
      setPendingPlanId(null);
      toast.error(e.message || "Erro ao selecionar o plano.");
    },
  });

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const shouldShow =
    user?.role === "admin" &&
    !!mySub &&
    mySub.subscriptionStatus === "trialing" &&
    !dismissed;

  if (!shouldShow) return null;

  const trialEnd = mySub.trialEndsAt ? new Date(mySub.trialEndsAt) : null;
  const priceOf = (p: Plan) => (cycle === "YEARLY" ? p.priceYearly : p.priceMonthly);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-[2rem] bg-card border-none shadow-2xl p-6 sm:p-8">
        {/* Header */}
        <div className="text-center space-y-2 mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500/15 to-indigo-500/15 text-violet-600 dark:text-violet-400 text-[10px] font-black uppercase tracking-widest border border-violet-500/25">
            <Sparkles size={11} /> Escolha seu plano MusicPro
          </div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Sua escola está pronta! 🎵
          </h2>
          {trialEnd && (
            <p className="text-xs font-bold text-muted-foreground flex items-center justify-center gap-1.5">
              <Clock size={12} className="text-amber-500" />
              Avaliação grátis até{" "}
              {format(trialEnd, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          )}
        </div>

        {/* Toggle ciclo */}
        <div className="flex justify-center mb-5">
          <div className="inline-flex bg-muted/50 rounded-2xl p-1 border border-border/50">
            {(["MONTHLY", "YEARLY"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cn(
                  "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  cycle === c
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c === "MONTHLY" ? "Mensal" : "Anual · 2 meses grátis"}
              </button>
            ))}
          </div>
        </div>

        {/* Cards de planos */}
        {loadingPlans ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-bold text-muted-foreground">
              Nenhum plano disponível no momento. Fale com o suporte.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(plans as Plan[]).map((p) => {
              const price = priceOf(p);
              const monthlyEquivalent = cycle === "YEARLY" ? p.priceYearly / 12 : p.priceMonthly;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "relative rounded-3xl border p-5 flex flex-col gap-3 transition-all",
                    p.isPopular
                      ? "border-violet-500/50 bg-gradient-to-b from-violet-500/10 to-transparent shadow-lg shadow-violet-500/10"
                      : "border-border/60 bg-muted/20"
                  )}
                >
                  {p.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-600 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <Crown size={10} /> Mais popular
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-black text-foreground uppercase tracking-wide">{p.name}</p>
                    <div className="flex items-end gap-1 mt-1">
                      <span className="text-3xl font-black tracking-tighter text-foreground">
                        R$ {price.toFixed(2).replace(".", ",")}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground mb-1">
                        /{cycle === "YEARLY" ? "ano" : "mês"}
                      </span>
                    </div>
                    {cycle === "YEARLY" && p.priceYearly > 0 && (
                      <p className="text-[10px] font-bold text-emerald-600">
                        equivale a R$ {monthlyEquivalent.toFixed(2).replace(".", ",")}/mês
                      </p>
                    )}
                    <p className="text-[10px] font-bold text-muted-foreground mt-1">
                      {p.maxStudents >= 999999 ? "Alunos ilimitados" : `Até ${p.maxStudents} alunos`}
                    </p>
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {(Array.isArray(p.features) ? p.features : []).slice(0, 6).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] font-medium text-foreground/80">
                        <Check size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    disabled={changePlanMutation.isPending}
                    onClick={() => {
                      setPendingPlanId(p.id);
                      changePlanMutation.mutate({ planId: p.id, planType: cycle });
                    }}
                    className={cn(
                      "w-full h-11 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all",
                      p.isPopular
                        ? "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/25"
                        : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                    )}
                  >
                    {changePlanMutation.isPending && pendingPlanId === p.id ? (
                      <Loader2 size={14} className="animate-spin mr-1.5" />
                    ) : null}
                    Assinar {p.name}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            Continuar avaliando por enquanto — escolher depois
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
