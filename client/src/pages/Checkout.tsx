import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { CreditCard, LogOut, CheckCircle2, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Checkout() {
  const { user, logout, refresh } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data: pendingInvoice, isLoading: isLoadingInvoice } = trpc.platform.getPendingInvoice.useQuery();

  const checkoutMutation = trpc.platform.checkout.useMutation({
    onSuccess: (data) => {
      if (data.paymentLink) {
        window.location.href = data.paymentLink;
      }
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao gerar link de pagamento.");
    }
  });

  const syncMutation = trpc.platform.syncSubscription.useMutation({
    onSuccess: async (data) => {
      if (data.success && data.status === "active") {
        toast.success("Pagamento confirmado! Redirecionando...");
        await refresh();
        window.location.href = "/dashboard";
      } else {
        toast.warning(data.message || "Pagamento ainda não confirmado. Aguarde alguns minutos e tente novamente.");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao verificar pagamento.");
    }
  });

  // Ao retornar da página de pagamento da Asaas (?payment=success),
  // verificar automaticamente se o pagamento foi confirmado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      toast.info("Verificando confirmação do pagamento...");
      // Limpa o parâmetro da URL sem recarregar
      window.history.replaceState({}, "", "/checkout");
      // Aguarda 2s para a Asaas processar antes de consultar
      setTimeout(() => syncMutation.mutate(), 2000);
    }
  }, []);

  const u = user as any;
  const isExpired = u?.trialEndsAt && isPast(new Date(u.trialEndsAt));
  const trialDate = u?.trialEndsAt ? format(new Date(u.trialEndsAt), "dd/MM/yyyy", { locale: ptBR }) : "";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-primary/20 blur-[120px] rounded-full pointer-events-none -z-10 opacity-50" />
      
      <div className="max-w-4xl w-full z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Informational Side */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest border border-primary/20">
            <Sparkles size={14} /> MusicPro Premium
          </div>
          
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
            {isExpired ? "Seu período de teste chegou ao fim." : "Escale sua escola para o próximo nível."}
          </h1>
          
          <p className="text-lg text-muted-foreground font-medium leading-relaxed">
            {isExpired 
              ? `O seu teste gratuito expirou em ${trialDate}. Para continuar acessando seus alunos, aulas e a IA Assistente, escolha um plano abaixo.` 
              : "Tenha acesso ilimitado a todas as ferramentas do MusicPro e automatize a gestão da sua escola de música."}
          </p>

          <ul className="space-y-3">
            {[
              "Gestão Ilimitada de Alunos e Aulas",
              "Integração White-label com Asaas",
              "Notificações automáticas via WhatsApp",
              "Análise de Comprovantes via IA",
              "Suporte Prioritário"
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm font-bold text-foreground">
                <CheckCircle2 className="text-primary" size={20} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing Side */}
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-6">
          {isLoadingInvoice ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground font-medium animate-pulse">Carregando dados da assinatura...</p>
            </div>
          ) : pendingInvoice ? (
            <>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-amber-500">
                  <CreditCard size={24} />
                </div>
                <h2 className="text-2xl font-black text-destructive">Acesso Suspenso</h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                  Seu prazo de pagamento expirou. <strong className="text-destructive font-black">Efetue o pagamento agora para restaurar seu acesso e evitar a exclusão permanente de todos os seus dados cadastrados!</strong>
                </p>
                <div className="py-4">
                  <span className="text-4xl font-black text-foreground">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingInvoice.value)}
                  </span>
                </div>
                <a 
                  href={pendingInvoice.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl uppercase tracking-[0.1em] hover:bg-amber-600 active:scale-[0.98] transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <ArrowRight size={18} /> Ir para o Pagamento
                </a>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black text-center mb-2">Escolha seu Plano</h2>
              
              <div className="grid grid-cols-2 gap-4 bg-muted/50 p-2 rounded-2xl border border-border">
                <button 
                  onClick={() => setSelectedPlan("MONTHLY")}
                  className={`py-3 rounded-xl font-bold text-sm transition-all ${selectedPlan === "MONTHLY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Mensal
                </button>
                <button 
                  onClick={() => setSelectedPlan("YEARLY")}
                  className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${selectedPlan === "YEARLY" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Anual <span className="bg-white/20 text-white px-2 py-0.5 rounded-md text-[10px] uppercase">Economize 15%</span>
                </button>
              </div>

              <div className="text-center py-6">
                <span className="text-5xl font-black text-foreground">R$ {selectedPlan === "YEARLY" ? "499" : "49"}</span>
                <span className="text-muted-foreground font-bold">/{selectedPlan === "YEARLY" ? "ano" : "mês"}</span>
              </div>

              <button 
                onClick={() => checkoutMutation.mutate({ planType: selectedPlan })}
                disabled={checkoutMutation.isPending}
                className="w-full py-4 bg-foreground text-background font-black rounded-2xl uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutMutation.isPending ? "Gerando Link..." : "Assinar Agora"} <ArrowRight size={18} />
              </button>
            </>
          )}

          <p className="text-center text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
            <CreditCard size={14} /> Pagamento 100% seguro pelo Asaas
          </p>

          {/* Botão "Já paguei" — verifica e ativa a assinatura automaticamente */}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="w-full py-3 text-primary font-bold text-sm border border-primary/30 hover:bg-primary/5 rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
            {syncMutation.isPending ? "Verificando..." : "Já paguei — Verificar pagamento"}
          </button>

          <button 
            onClick={logout}
            className="w-full py-3 text-muted-foreground font-bold text-xs uppercase hover:bg-muted/50 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={14} /> Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
