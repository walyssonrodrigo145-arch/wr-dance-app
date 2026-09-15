import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CreditCard, CheckCircle2, ArrowRight, Loader2, Zap, ShieldAlert, X, Calendar, TrendingDown, TrendingUp, AlertTriangle, Users, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function Assinatura() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  const { data: mySub, isLoading } = trpc.platform.mySubscription.useQuery();
  const { data: pendingInvoice, isLoading: loadingInvoice } = trpc.platform.getPendingInvoice.useQuery();
  // ─── Busca planos DINÂMICOS do banco de dados ─────────────────────────────
  const { data: PLANOS = [], isLoading: loadingPlans } = trpc.platform.getPublicPlans.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  
  const changePlanMutation = trpc.platform.changePlan.useMutation();
  const cancelMutation = trpc.platform.cancelSubscription.useMutation();
  const reactivateMutation = trpc.platform.reactivateSubscription.useMutation();

  const [selectedPlanType, setSelectedPlanType] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const trialEndsAt = mySub?.trialEndsAt ? new Date(mySub.trialEndsAt) : null;
  const isTrial = mySub?.subscriptionStatus === "trialing";
  const isCanceled = mySub?.subscriptionStatus === "canceled";

  const handleReactivate = async (planId?: string) => {
    try {
      const res = await reactivateMutation.mutateAsync({
        planId: planId || mySub?.planId,
        planType: selectedPlanType
      });
      toast.success(res.message || "Plano reabilitado com sucesso!");
      utils.platform.mySubscription.invalidate();
      if (res.paymentLink) {
        window.location.href = res.paymentLink;
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao reabilitar o plano");
    }
  };

  const handleChangePlan = async (planId: string) => {
    try {
      const res = await changePlanMutation.mutateAsync({ planId, planType: selectedPlanType });
      toast.success(res?.message || "Plano atualizado com sucesso!");
      utils.platform.mySubscription.invalidate();
      if (res?.paymentLink) {
        window.location.href = res.paymentLink;
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar o plano");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync();
      toast.success("Assinatura cancelada com sucesso.");
      setShowCancelConfirm(false);
      utils.platform.mySubscription.invalidate();
      setTimeout(() => window.location.href = "/checkout", 1500);
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar assinatura");
    }
  };

  if (isLoading || loadingPlans) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">Carregando sua assinatura...</p>
      </div>
    );
  }

  const currentPlan = PLANOS.find(p => p.id === mySub?.planId) || {
    id: mySub?.planId || "personalizado",
    name: (mySub as any)?.planName || (mySub?.planId ? `Plano ${mySub.planId}` : "Plano Ativo"),
    priceMonthly: (mySub as any)?.planPriceMonthly || 0,
    priceYearly: (mySub as any)?.planPriceYearly || 0,
    maxStudents: (mySub as any)?.planMaxStudents ?? 999999,
    features: (mySub as any)?.features || [],
    allowExtraStudents: (mySub as any)?.allowExtraStudents ?? true,
    extraStudentPrice: (mySub as any)?.extraStudentPrice ?? 1.49,
  };
  const activeStudentsCount = stats?.activeStudents ?? 0;
  const maxStudentsLimit = currentPlan ? (currentPlan.maxStudents ?? 999999) : 999999;
  const allowExtra = currentPlan ? ((currentPlan as any).allowExtraStudents ?? true) : true;
  const extraStudentPrice = currentPlan ? Number((currentPlan as any).extraStudentPrice ?? 1.49) : 1.49;
  const excessCount = Math.max(0, activeStudentsCount - maxStudentsLimit);
  const totalExcessFee = excessCount * extraStudentPrice;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-400 max-w-4xl mx-auto pb-10">
      {/* Topo Compacto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/40">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Gerenciar Assinatura</h1>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Acompanhe seu plano ativo, faturas e termos da conta.</p>
        </div>
        <button
          onClick={() => setShowRulesModal(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl font-bold text-xs transition-colors border border-border/50 shadow-sm self-start sm:self-auto"
        >
          <ShieldAlert size={15} className="text-indigo-500" />
          <span>Regras da Assinatura</span>
        </button>
      </div>

      {/* Cards de Resumo (Plano Atual + Fatura) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card do Plano Atual Refinado */}
        <div className="md:col-span-2 relative overflow-hidden bg-gradient-to-br from-indigo-950/80 via-slate-900 to-indigo-900 border border-indigo-500/20 rounded-2xl p-5 shadow-lg flex flex-col justify-between text-white">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 blur-2xl rounded-full -translate-y-1/2 translate-x-1/3"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Zap size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-indigo-200/60 uppercase tracking-widest">Plano Atual</span>
                  <h2 className="text-lg font-black text-white leading-tight">{currentPlan.name}</h2>
                </div>
              </div>
              
              <div className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border ${
                  isTrial ? 'bg-blue-500/20 border-blue-400/30 text-blue-200' :
                  isCanceled ? 'bg-rose-500/20 border-rose-400/30 text-rose-200' :
                  'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                }`}>
                  {isTrial ? "Período de Teste" : isCanceled ? "Cancelado" : "Ativo"}
              </div>
            </div>

            {isTrial && trialEndsAt && (
              <div className="bg-black/30 rounded-xl p-3 border border-white/10">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-white/60 font-bold text-[10px] uppercase tracking-wider">Fim do Teste: {trialEndsAt.toLocaleDateString('pt-BR')}</span>
                  <span className="text-indigo-300 font-bold text-xs">
                    {Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} dias restantes
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, 100 - (Math.max(0, trialEndsAt.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) * 100))}%` }}
                    className="h-full bg-indigo-400 rounded-full" 
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card de Fatura Refinado */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pendingInvoice ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
              <CreditCard size={16} />
            </div>
            <h2 className="text-sm font-bold text-foreground">Sua Fatura</h2>
          </div>
          
          {loadingInvoice ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin text-primary" /> Buscando...
            </div>
          ) : pendingInvoice ? (
            <div className="bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Pendente</p>
              <p className="text-xl font-black text-amber-600 mb-2">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingInvoice.value)}
              </p>
              <a 
                href={pendingInvoice.invoiceUrl} 
                target="_blank" 
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 h-9 bg-amber-500 hover:bg-amber-600 text-white font-bold uppercase tracking-wider rounded-lg text-[10px] transition-all shadow-sm"
              >
                Pagar Agora <ArrowRight size={14} />
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
              <CheckCircle2 size={24} className="text-emerald-500 mb-1" />
              <p className="text-emerald-600 text-xs font-bold uppercase tracking-wider">Tudo em dia!</p>
              <p className="text-[9px] text-muted-foreground">Sem pendências financeiras.</p>
            </div>
          )}
        </div>
      </div>

      {/* Banner de Plano Cancelado / Opção de Reabilitar */}
      {isCanceled && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Sua assinatura está cancelada</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Você pode reabilitar seu plano a qualquer momento para manter seu acesso ativo e preservar todas as suas configurações, alunos e aulas.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleReactivate()}
            disabled={reactivateMutation.isPending}
            className="shrink-0 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            {reactivateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={15} />}
            Reabilitar Plano
          </button>
        </div>
      )}

      {/* Card da Política de Alunos Excedentes */}
      {maxStudentsLimit < 999999 && (
        <div className={`rounded-2xl p-5 border shadow-sm transition-all ${
          excessCount > 0
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-card border-border/60'
        }`}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users size={18} className={excessCount > 0 ? "text-amber-500" : "text-primary"} />
                <h3 className="font-bold text-sm text-foreground">Política de Alunos Excedentes</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Seu plano ({currentPlan.name}) possui limite base de <strong>{maxStudentsLimit} alunos</strong>.
                {allowExtra ? (
                  <span>
                    {" "}Alunos excedentes são permitidos por <strong>R$ {extraStudentPrice.toFixed(2)}/mês por aluno</strong>.
                  </span>
                ) : (
                  <span> Alunos excedentes não são permitidos neste plano.</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alunos Ativos</span>
                <p className="text-lg font-black text-foreground">{activeStudentsCount} / {maxStudentsLimit}</p>
              </div>
              {excessCount > 0 && (
                <div className="text-right bg-amber-500/15 px-3 py-1.5 rounded-xl border border-amber-500/30">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Excedente ({excessCount})</span>
                  <p className="text-lg font-black text-amber-600">+ R$ {totalExcessFee.toFixed(2)}/mês</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Section / Escolha seu Nível */}
      <div className="pt-4 space-y-6">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-bold text-foreground tracking-tight">Escolha seu Plano</h2>
          <p className="text-muted-foreground text-xs font-medium max-w-md mx-auto">Libere mais alunos e ferramentas exclusivas para potencializar sua escola.</p>
          
          <div className="inline-flex bg-muted/40 p-1 rounded-xl border border-border/50 relative">
            <button 
              onClick={() => setSelectedPlanType("MONTHLY")}
              className={`px-5 py-1.5 rounded-lg font-bold text-xs transition-all ${selectedPlanType === "MONTHLY" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mensal
            </button>
            <button 
              onClick={() => setSelectedPlanType("YEARLY")}
              className={`px-5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${selectedPlanType === "YEARLY" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Anual
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 font-bold">-17%</span>
            </button>
          </div>
        </div>

        {/* Grid dos Planos Compacto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANOS.map((p, index) => {
            const isActive = mySub?.planId === p.id;
            const price = selectedPlanType === "YEARLY" ? p.priceYearly : p.priceMonthly;
            const isPopular = p.isPopular;
            
            return (
              <motion.div 
                key={p.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className={`relative flex flex-col bg-card border rounded-2xl p-5 transition-all duration-300 ${
                  isActive ? 'border-blue-600 ring-1 ring-blue-600 shadow-md' : 
                  isPopular ? 'border-indigo-500/40 shadow-sm' :
                  'border-border/60 hover:border-border'
                }`}
              >
                {isPopular && !isActive && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <span className="bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest py-0.5 px-3 rounded-full shadow-sm">Mais Popular</span>
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <span className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest py-0.5 px-3 rounded-full shadow-sm border border-slate-700">Seu Plano</span>
                  </div>
                )}

                <div className="mb-4 pt-1">
                  <h3 className="text-base font-bold text-foreground">{p.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-black text-foreground tracking-tight">R$ {price.toFixed(2).replace('.',',')}</span>
                    <span className="text-muted-foreground text-[10px] font-bold uppercase">/{selectedPlanType === "YEARLY" ? 'ano' : 'mês'}</span>
                  </div>
                </div>
                
                <div className="flex-1 space-y-2.5 mb-6">
                  {p.features.map((f: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 size={13} className="text-blue-600 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground font-medium leading-tight">{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => isCanceled ? handleReactivate(p.id) : handleChangePlan(p.id)}
                  disabled={(isActive && !isCanceled) || changePlanMutation.isPending || reactivateMutation.isPending}
                  className={`w-full h-10 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    isCanceled ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20' :
                    isActive ? 'bg-muted text-muted-foreground cursor-not-allowed' :
                    isPopular ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20' :
                    'bg-muted/40 hover:bg-muted text-foreground border border-border/60'
                  }`}
                >
                  {(changePlanMutation.isPending || reactivateMutation.isPending) ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : isCanceled ? (
                    <>
                      <RefreshCw size={14} />
                      <span>Reabilitar este Plano</span>
                    </>
                  ) : isActive ? (
                    'Plano Ativo'
                  ) : (
                    'Fazer Upgrade'
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="pt-12 mt-12 border-t border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
            <ShieldAlert size={20} />
          </div>
          <h2 className="text-xl font-black text-destructive tracking-tight">
            Área de Risco
          </h2>
        </div>
        
        {!showCancelConfirm ? (
          <div className="bg-card border border-destructive/20 rounded-[2rem] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
            <div>
              <h3 className="text-lg font-black text-foreground mb-1">Encerrar Assinatura</h3>
              <p className="text-muted-foreground text-sm font-medium max-w-xl">Ao cancelar, você perderá acesso ao sistema e todas as suas configurações, alunos e arquivos entrarão na fila de exclusão permanente.</p>
            </div>
            <button 
              onClick={() => setShowCancelConfirm(true)}
              disabled={isCanceled}
              className="shrink-0 px-8 h-12 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white font-black uppercase tracking-widest rounded-xl text-[11px] transition-all disabled:opacity-50"
            >
              {isCanceled ? 'Já Cancelado' : 'Cancelar Assinatura'}
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-destructive rounded-[2rem] p-8 text-white shadow-2xl shadow-destructive/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-black/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="bg-white/20 p-4 rounded-2xl shrink-0 backdrop-blur-sm">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black tracking-tight mb-2">Tem certeza absoluta?</h3>
                <p className="text-white/80 text-sm mb-6 max-w-2xl font-medium leading-relaxed">
                  Esta ação é irreversível. Sua assinatura será cancelada imediatamente no Asaas e seu acesso ao MusicPro será bloqueado. <strong className="text-white">Todos os seus alunos, aulas, faturas e arquivos serão excluídos de nossos servidores permanentemente.</strong>
                </p>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                    className="h-12 px-8 bg-white text-destructive hover:bg-gray-100 font-black uppercase tracking-widest rounded-xl text-[11px] transition-all flex items-center gap-2 shadow-lg"
                  >
                    {cancelMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Sim, excluir tudo agora"}
                  </button>
                  <button 
                    onClick={() => setShowCancelConfirm(false)}
                    className="h-12 px-8 bg-black/20 hover:bg-black/30 text-white font-black uppercase tracking-widest rounded-xl text-[11px] transition-all backdrop-blur-sm"
                  >
                    Mudei de ideia, manter
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Rules Modal */}
      <AnimatePresence>
        {showRulesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setShowRulesModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="shrink-0 p-6 sm:p-8 bg-gradient-to-br from-indigo-600 to-violet-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/3"></div>
                <div className="relative z-10 flex items-start justify-between text-white">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/10">
                        <ShieldAlert size={20} />
                      </div>
                      <h2 className="text-2xl font-black tracking-tight">Regras da Assinatura</h2>
                    </div>
                    <p className="text-indigo-100 text-sm font-medium">Informações importantes sobre a gestão do seu plano no MusicPro e integração com o Asaas.</p>
                  </div>
                  <button 
                    onClick={() => setShowRulesModal(false)}
                    className="p-2 bg-black/10 hover:bg-black/20 rounded-full transition-colors backdrop-blur-sm text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-black text-lg">
                    <Calendar className="text-blue-500" size={20} />
                    <h3>Período de Teste e Prazos</h3>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 p-4 rounded-2xl text-sm text-muted-foreground leading-relaxed">
                    Você tem <strong className="text-foreground">7 dias gratuitos</strong> de teste ao se cadastrar. Ao final do 7º dia, a assinatura deve ser efetuada para manter o acesso aos recursos do sistema.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-black text-lg">
                    <TrendingDown className="text-amber-500" size={20} />
                    <h3>Downgrade (Redução de Plano)</h3>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 p-4 rounded-2xl text-sm text-muted-foreground leading-relaxed">
                    Para reduzir seu plano, seu número atual de alunos ativos não pode ser maior do que o limite do novo plano desejado. Caso isso aconteça, o sistema <strong className="text-foreground">bloqueará a alteração</strong>. Você deverá ir na aba <strong className="text-foreground">Alunos</strong> e excluir ou arquivar a quantidade excedente antes de realizar o downgrade.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-black text-lg">
                    <TrendingUp className="text-emerald-500" size={20} />
                    <h3>Upgrade (Aumento de Plano)</h3>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 p-4 rounded-2xl text-sm text-muted-foreground leading-relaxed">
                    Ao aumentar seu plano, os novos limites entram em vigor <strong className="text-foreground">imediatamente</strong>. O valor só será atualizado e cobrado na <strong className="text-foreground">próxima fatura</strong> do seu ciclo atual.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-black text-lg">
                    <CreditCard className="text-violet-500" size={20} />
                    <h3>Troca de Plano e Recusa de Cartão</h3>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-500/5 border border-violet-100 dark:border-violet-500/10 p-4 rounded-2xl text-sm text-muted-foreground leading-relaxed">
                    <p className="mb-2">Por questões de segurança contra fraudes no Asaas, se você alterar seu plano (valor) e a operadora do seu cartão recusar a atualização automática da fatura já gerada, nosso sistema utilizará um <strong>Mecanismo de Proteção</strong>:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Sua assinatura atual é cancelada preventivamente;</li>
                      <li>Você <strong>não perde seu dinheiro!</strong> Os dias que restavam do ciclo pago viram <strong className="text-foreground">Dias Restantes de Teste</strong>;</li>
                      <li>Você precisará assinar novamente passando o cartão no novo plano desejado para regularizar os próximos meses.</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-black text-lg">
                    <AlertTriangle className="text-destructive" size={20} />
                    <h3>Cancelamento</h3>
                  </div>
                  <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-2xl text-sm text-muted-foreground leading-relaxed">
                    O cancelamento via sistema exibe a opção de <strong>exclusão total</strong> (apaga todos os seus dados da escola, contratos e faturas imediatamente). Se a intenção for apenas parar a cobrança sem perder os dados, solicite a pausa diretamente ao nosso suporte.
                  </div>
                </div>

              </div>
              
              {/* Modal Footer */}
              <div className="shrink-0 p-4 sm:p-6 border-t border-border bg-muted/30 flex justify-end">
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="px-6 py-2.5 bg-foreground text-background hover:bg-foreground/90 rounded-xl font-black text-sm uppercase tracking-widest transition-colors shadow-md"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
