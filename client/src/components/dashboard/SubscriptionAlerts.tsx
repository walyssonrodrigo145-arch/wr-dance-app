import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { AlertTriangle, CalendarClock, ArrowRight, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avisos da assinatura (somente admin): teste terminando, fatura pendente/paga
 * em atraso. Nunca bloqueia o acesso — informa e leva para a tela de assinatura.
 */
export function SubscriptionAlertBanner() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("dp_sub_alert_dismissed") === "1"; } catch { return false; }
  });
  const isAdmin = user?.role === "admin";
  const { data: sub } = trpc.platform.mySubscription.useQuery(undefined, {
    enabled: isAdmin,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: false,
  });

  if (!isAdmin || dismissed || !sub) return null;

  const status = String((sub as any).subscriptionStatus || "");
  if (status === "active") return null; // plano em dia (inclui parceiro ilimitado)

  const trialEndsAt = (sub as any).trialEndsAt ? new Date((sub as any).trialEndsAt) : null;
  const daysLeft = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000) : null;

  const trialEndingSoon = status === "trialing" && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
  const trialExpired = status === "trialing" && daysLeft !== null && daysLeft < 0;
  const overdue = ["past_due", "overdue", "canceled", "cancelled"].includes(status);
  const pending = status === "pending";

  let meta: { icon: typeof AlertTriangle; cls: string; title: string; text: string; cta: string } | null = null;
  if (overdue || trialExpired) {
    meta = {
      icon: AlertTriangle,
      cls: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
      title: "Sua assinatura está pendente",
      text: "Regularize o pagamento para não interromper o acesso da escola.",
      cta: "Ver fatura",
    };
  } else if (pending) {
    meta = {
      icon: Clock,
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      title: "Pagamento em processamento",
      text: "Assim que o pagamento for confirmado, sua assinatura fica ativa automaticamente.",
      cta: "Ver fatura",
    };
  } else if (trialEndingSoon) {
    meta = {
      icon: CalendarClock,
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      title: daysLeft === 0 ? "Seu teste termina hoje" : `Seu teste termina em ${daysLeft} dia(s)`,
      text: "Escolha um plano para continuar usando o DancePro sem interrupção.",
      cta: "Ver planos",
    };
  }
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-3.5", meta.cls)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black">{meta.title}</p>
        <p className="text-[11px] font-medium opacity-90 mt-0.5">{meta.text}</p>
      </div>
      <button
        type="button"
        onClick={() => setLocation("/assinatura")}
        className="shrink-0 h-8 px-3 rounded-lg bg-current/10 hover:bg-current/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors"
      >
        {meta.cta} <ArrowRight size={12} />
      </button>
      <button
        type="button"
        onClick={() => { try { sessionStorage.setItem("dp_sub_alert_dismissed", "1"); } catch { /* ignore */ } setDismissed(true); }}
        className="shrink-0 w-7 h-7 rounded-lg hover:bg-current/10 flex items-center justify-center transition-colors"
        aria-label="Ocultar aviso"
        title="Ocultar por hoje"
      >
        <X size={13} />
      </button>
    </div>
  );
}
