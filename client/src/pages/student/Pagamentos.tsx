import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { 
  DollarSign, 
  Download, 
  Calendar,
  AlertCircle,
  CheckCircle2,
  FileText,
  History,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  Copy,
  Smartphone,
  QrCode,
  UploadCloud,
  Sparkles,
  Loader2,
  XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { x: -20, opacity: 0 },
  show: { x: 0, opacity: 1 }
};

export default function StudentPayments() {
  const utils = trpc.useContext();
  const { data: payments, isLoading } = trpc.studentPortal.getPayments.useQuery();
  const { data: profile } = trpc.studentPortal.getProfile.useQuery();
  const verifyMutation = trpc.studentPortal.verifyAndConfirmPayment.useMutation();
  const generateMPMutation = trpc.studentPortal.generatePaymentLink.useMutation();

  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [pixCopiaECola, setPixCopiaECola] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ success: boolean; reason: string; amountPaid?: number } | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPayment) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setUploadedImageUrl(base64);
      setIsAnalyzing(true);
      setAnalysisResult(null);

      try {
        const res = await verifyMutation.mutateAsync({
          paymentDueId: selectedPayment.id,
          fileData: base64,
          fileName: file.name,
          fileType: file.type
        });

        setAnalysisResult({
          success: res.success,
          reason: res.reason,
          amountPaid: res.amountPaid
        });

        if (res.success) {
          utils.studentPortal.getPayments.invalidate();
        }
      } catch (err: any) {
        setAnalysisResult({ success: false, reason: err.message || "Erro ao analisar o comprovante." });
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const configs: Record<string, { label: string, color: string }> = {
      pago: { label: 'Pago', color: 'bg-green-100 text-green-600' },
      pendente: { label: 'Pendente', color: 'bg-orange-100 text-orange-600' },
      atrasado: { label: 'Atrasado', color: 'bg-red-100 text-red-600' },
    };
    const config = configs[status] || configs.pendente;
    return (
      <span className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full", config.color)}>
        {config.label}
      </span>
    );
  };

  const totalPaid = payments?.filter(p => p.status === 'pago').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const nextPayment = payments?.filter(p => p.status !== 'pago').sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const nextValue = nextPayment ? Number(nextPayment.amount) : 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Financeiro</h1>
          <p className="text-muted-foreground font-medium">Gerencie suas mensalidades e histórico de pagamentos.</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status da Conta</p>
              <p className="text-sm font-black text-green-500 uppercase tracking-tight">Em Dia ✅</p>
           </div>
           <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
             <ShieldCheck size={20} />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black flex items-center gap-2">
              <History size={20} className="text-primary" /> Histórico de Faturas
            </h2>
            <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Download Todos</button>
          </div>
          
          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {payments?.map((payment) => (
              <motion.div variants={item} key={payment.id}>
                <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm group hover:shadow-2xl transition-all overflow-hidden relative">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row items-center p-6 gap-6">
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all",
                        payment.status === 'pago' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                      )}>
                        <FileText size={24} />
                      </div>

                      <div className="flex-1 text-center sm:text-left space-y-1 min-w-0">
                        <p className="text-lg font-black text-foreground truncate">Mensalidade • {format(parseISO(payment.dueDate as string), "MMMM yyyy", { locale: ptBR })}</p>
                        <div className="flex items-center justify-center sm:justify-start gap-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          <span className="flex items-center gap-1.5"><Calendar size={12} className="text-primary" /> Vencimento: {format(parseISO(payment.dueDate as string), "dd/MM/yyyy")}</span>
                          {payment.paidAt && (
                             <span className="flex items-center gap-1.5 text-green-500"><CheckCircle2 size={12} /> Pago em: {format(new Date(payment.paidAt), "dd/MM/yyyy")}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-center sm:items-end gap-2">
                        <p className="text-xl font-black text-foreground">{formatBRL(payment.amount)}</p>
                        <StatusBadge status={payment.status} />
                      </div>

                      <div className="flex items-center gap-2">
                        {payment.status === 'pago' ? (
                          <button 
                            onClick={async () => {
                              if (!payment.receiptUrl) return;
                              try {
                                const response = await fetch(payment.receiptUrl);
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `comprovante-${format(new Date(payment.dueDate), "MM-yyyy")}`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (e) {
                                window.open(payment.receiptUrl, "_blank");
                              }
                            }}
                            className={cn(
                              "w-12 h-12 rounded-2xl transition-all shadow-sm flex items-center justify-center",
                              payment.receiptUrl 
                                ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white" 
                                : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                            )}
                            title={payment.receiptUrl ? "Baixar Comprovante" : "Comprovante não disponível"}
                          >
                            <Download size={20} />
                          </button>
                        ) : (
                          <button
                            disabled={generateMPMutation.isPending && generateMPMutation.variables?.paymentDueId === payment.id}
                            onClick={() => {
                              const gateway = profile?.paymentGateway || "asaas";
                              
                              if (gateway === "mercadopago") {
                                if (payment.mpPaymentLink) {
                                  window.location.href = payment.mpPaymentLink;
                                } else {
                                  toast.loading("Gerando link de pagamento...", { id: `mp-${payment.id}` });
                                  generateMPMutation.mutate({ paymentDueId: payment.id }, {
                                    onSuccess: (data) => {
                                      toast.success("Link gerado com sucesso!", { id: `mp-${payment.id}` });
                                      window.location.href = data.paymentLink;
                                      utils.studentPortal.getPayments.invalidate();
                                    },
                                    onError: (err) => {
                                      toast.error(err.message || "Erro ao gerar link de pagamento.", { id: `mp-${payment.id}` });
                                    }
                                  });
                                }
                              } else if (gateway === "infinitepay") {
                                if (payment.infinitepayPaymentLink) {
                                  window.location.href = payment.infinitepayPaymentLink;
                                } else {
                                  toast.loading("Gerando link de pagamento...", { id: `ip-${payment.id}` });
                                  generateMPMutation.mutate({ paymentDueId: payment.id }, {
                                    onSuccess: (data) => {
                                      toast.success("Link gerado com sucesso!", { id: `ip-${payment.id}` });
                                      window.location.href = data.paymentLink;
                                      utils.studentPortal.getPayments.invalidate();
                                    },
                                    onError: (err) => {
                                      toast.error(err.message || "Erro ao gerar link de pagamento.", { id: `ip-${payment.id}` });
                                    }
                                  });
                                }
                              } else if (gateway === "asaas") {
                                if (payment.asaasBillingType === "PIX" && payment.asaasPaymentLink) {
                                  setPixCopiaECola(payment.asaasPaymentLink);
                                  setSelectedPayment(payment);
                                  setIsPixModalOpen(true);
                                  setAnalysisResult(null);
                                  setUploadedImageUrl(null);
                                } else if (payment.asaasPaymentLink) {
                                  window.open(payment.asaasPaymentLink, "_blank");
                                } else {
                                  toast.info("Fatura Asaas não disponível para esta mensalidade.");
                                }
                              } else if (gateway === "pix") {
                                if (profile?.teacherPixKey) {
                                  setPixCopiaECola(null);
                                  setSelectedPayment(payment);
                                  setIsPixModalOpen(true);
                                  setAnalysisResult(null);
                                  setUploadedImageUrl(null);
                                } else {
                                  toast.info("Chave PIX da escola não está configurada.");
                                }
                              } else {
                                toast.info("Aguardando configuração de pagamento da escola.");
                              }
                            }}
                            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed"
                          >
                             {(generateMPMutation.isPending && generateMPMutation.variables?.paymentDueId === payment.id) ? "Gerando..." : "Pagar"}
                             <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {payments?.length === 0 && (
              <div className="text-center py-24 bg-card/30 rounded-[2rem] border-2 border-dashed border-border">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <DollarSign className="text-muted-foreground opacity-30" size={40} />
                </div>
                <h3 className="text-xl font-black text-foreground">Sem registros</h3>
                <p className="text-muted-foreground font-medium mt-2">Nenhum histórico financeiro encontrado.</p>
              </div>
            )}
          </motion.div>
        </div>

        <div className="space-y-8">
          <Card className="border-none shadow-2xl bg-gradient-to-br from-primary to-indigo-600 text-white overflow-hidden relative group">
             <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <TrendingUp size={120} />
             </div>
             <CardContent className="p-8 relative z-10">
                <div className="flex items-center gap-2 mb-6">
                   <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                      <CreditCard size={20} />
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Meu Investimento</p>
                </div>
                
                <h3 className="text-4xl font-black mb-1">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Total investido no seu talento</p>
                
                <div className="mt-8 pt-6 border-t border-white/20 space-y-4">
                   <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white/80">Próxima Mensalidade</span>
                      <span className="text-sm font-black">R$ {nextValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                   </div>
                    <button 
                      onClick={() => {
                        if (!nextPayment) {
                          toast.error("Mensalidade não encontrada.");
                          return;
                        }
                        const gateway = profile?.paymentGateway || "asaas";
                        
                       if (gateway === "mercadopago") {
                         if (nextPayment?.mpPaymentLink) {
                           window.location.href = nextPayment.mpPaymentLink;
                         } else {
                           toast.loading("Gerando link de pagamento...", { id: `mp2-${nextPayment.id}` });
                           generateMPMutation.mutate({ paymentDueId: nextPayment.id }, {
                             onSuccess: (data) => {
                               toast.success("Link gerado com sucesso!", { id: `mp2-${nextPayment.id}` });
                               window.location.href = data.paymentLink;
                               utils.studentPortal.getPayments.invalidate();
                             },
                             onError: (err) => {
                               toast.error(err.message || "Erro ao gerar link de pagamento.", { id: `mp2-${nextPayment.id}` });
                             }
                           });
                         }
                       } else if (gateway === "infinitepay") {
                         if (nextPayment?.infinitepayPaymentLink) {
                           window.location.href = nextPayment.infinitepayPaymentLink;
                         } else {
                           toast.loading("Gerando link de pagamento...", { id: `ip2-${nextPayment.id}` });
                           generateMPMutation.mutate({ paymentDueId: nextPayment.id }, {
                             onSuccess: (data) => {
                               toast.success("Link gerado com sucesso!", { id: `ip2-${nextPayment.id}` });
                               window.location.href = data.paymentLink;
                               utils.studentPortal.getPayments.invalidate();
                             },
                             onError: (err) => {
                               toast.error(err.message || "Erro ao gerar link de pagamento.", { id: `ip2-${nextPayment.id}` });
                             }
                           });
                         }
                       } else if (gateway === "asaas") {
                         if (nextPayment?.asaasBillingType === "PIX" && nextPayment?.asaasPaymentLink) {
                           setPixCopiaECola(nextPayment.asaasPaymentLink);
                           setSelectedPayment(nextPayment);
                           setIsPixModalOpen(true);
                           setAnalysisResult(null);
                           setUploadedImageUrl(null);
                         } else if (nextPayment?.asaasPaymentLink) {
                           window.open(nextPayment.asaasPaymentLink, "_blank");
                         } else {
                           toast.info("Fatura Asaas não disponível para esta mensalidade.");
                         }
                       } else if (gateway === "pix") {
                         if (profile?.teacherPixKey) {
                           setPixCopiaECola(null);
                           setSelectedPayment(nextPayment);
                           setIsPixModalOpen(true);
                           setAnalysisResult(null);
                           setUploadedImageUrl(null);
                         } else {
                           toast.info("Chave PIX da escola não está configurada.");
                         }
                       } else {
                         toast.info("Aguardando configuração de pagamento da escola.");
                       }
                     }}
                     className="bg-primary/20 text-primary hover:bg-primary hover:text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                   >
                     Pagar Agora
                   </button>
                </div>
             </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-card/50 backdrop-blur-xl">
             <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-primary" />
                  <CardTitle className="text-sm font-black uppercase tracking-[0.1em]">Central de Ajuda</CardTitle>
                </div>
             </CardHeader>
             <CardContent className="space-y-5 pt-4">
                <div className="flex items-start gap-4">
                   <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Download size={16} /></div>
                   <div className="space-y-1">
                      <p className="text-xs font-black text-foreground">Recibos e Comprovantes</p>
                      <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">Ficam disponíveis para download imediato após a confirmação do pagamento.</p>
                   </div>
                </div>
                <div className="flex items-start gap-4">
                   <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><MessageSquare size={16} className="lucide-message-square" /></div>
                   <div className="space-y-1">
                      <p className="text-xs font-black text-foreground">Dúvidas sobre Valores</p>
                      <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">Qualquer divergência ou dúvida sobre vencimentos, entre em contato com o suporte.</p>
                   </div>
                </div>
             </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isPixModalOpen} onOpenChange={setIsPixModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none bg-card/95 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-indigo-600 p-8 text-white relative">
             <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
                <QrCode size={120} />
             </div>
             <DialogHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                     <Smartphone size={28} />
                  </div>
                  {selectedPayment && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                        {format(parseISO(selectedPayment.dueDate as string), "MMMM yyyy", { locale: ptBR })}
                      </p>
                       <p className="text-xl font-black">{formatBRL(selectedPayment.amount)}</p>
                    </div>
                  )}
                </div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Pagamento via PIX</DialogTitle>
                <DialogDescription className="text-white/70 font-medium">
                  Transfira para <strong>{profile?.teacherName}</strong> e valide o comprovante com nossa Inteligência Artificial.
                </DialogDescription>
             </DialogHeader>
          </div>

          <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
             {pixCopiaECola ? (
               <div className="p-6 bg-muted/50 rounded-3xl border-2 border-dashed border-primary/20 space-y-3">
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] text-center">PIX Copia e Cola (Asaas)</p>
                  <div className="bg-card border border-border p-4 rounded-2xl flex items-center justify-between gap-4 group">
                     <p className="text-xs font-mono text-foreground truncate flex-1">{pixCopiaECola}</p>
                     <button 
                       onClick={() => {
                         navigator.clipboard.writeText(pixCopiaECola);
                         toast.success("PIX Copia e Cola copiado!");
                       }}
                       className="p-3 bg-primary text-white rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-primary/20"
                     >
                        <Copy size={16} />
                     </button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-4">
                    Pague no seu aplicativo de banco. A confirmação é automática.
                  </p>
               </div>
             ) : !uploadedImageUrl ? (
               <>
                 <div className="p-6 bg-muted/50 rounded-3xl border-2 border-dashed border-primary/20 space-y-3">
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] text-center">Chave PIX do Professor</p>
                    <div className="bg-card border border-border p-4 rounded-2xl flex items-center justify-between gap-4 group">
                       <p className="text-sm font-bold text-foreground truncate flex-1">{profile?.teacherPixKey || "Chave não cadastrada"}</p>
                       <button 
                         onClick={() => {
                           if (profile?.teacherPixKey) {
                             navigator.clipboard.writeText(profile.teacherPixKey);
                             toast.success("Chave PIX copiada!");
                           }
                         }}
                         className="p-3 bg-primary text-white rounded-xl hover:scale-110 active:scale-90 transition-all shadow-lg shadow-primary/20"
                       >
                          <Copy size={16} />
                       </button>
                    </div>
                 </div>

                 <div className="relative group cursor-pointer">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center p-8 bg-primary/5 hover:bg-primary/10 border-2 border-dashed border-primary/30 rounded-3xl transition-all group-hover:border-primary/60">
                       <div className="w-16 h-16 bg-white dark:bg-black rounded-full flex items-center justify-center shadow-lg mb-4 text-primary group-hover:scale-110 transition-transform">
                          <UploadCloud size={28} />
                       </div>
                       <p className="text-sm font-black text-foreground text-center">Arraste seu comprovante aqui</p>
                       <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2 text-center">Ou clique para fazer upload</p>
                    </div>
                 </div>
               </>
             ) : (
               <div className="space-y-6">
                 {/* Uploaded Image Preview & Scanning UI */}
                 <div className="relative rounded-3xl overflow-hidden border-4 border-primary/20 bg-black/5 aspect-[4/3] flex items-center justify-center">
                    <img src={uploadedImageUrl} alt="Comprovante" className="object-cover w-full h-full opacity-70" />
                    
                    {isAnalyzing && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                         <div className="w-full h-1 bg-primary shadow-[0_0_20px_4px_rgba(var(--primary),0.8)] absolute top-0 animate-scan"></div>
                         <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] flex flex-col items-center justify-center text-white">
                            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 animate-pulse shadow-2xl">
                               <Sparkles size={28} className="animate-spin-slow" />
                            </div>
                            <p className="font-black text-lg text-primary tracking-tight bg-white/80 dark:bg-black/80 px-4 py-1 rounded-full backdrop-blur-md">Analisando comprovante...</p>
                         </div>
                      </div>
                    )}
                 </div>

                 {/* Analysis Results */}
                 {!isAnalyzing && analysisResult && (
                   <div className={cn(
                     "p-6 rounded-3xl border-2 space-y-3",
                     analysisResult.success ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                   )}>
                      <div className="flex items-start gap-4">
                         <div className={cn(
                           "p-3 rounded-2xl flex items-center justify-center shrink-0",
                           analysisResult.success ? "bg-green-500 text-white" : "bg-red-500 text-white"
                         )}>
                            {analysisResult.success ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                         </div>
                         <div className="space-y-1 flex-1">
                            <h3 className={cn(
                              "text-sm font-black uppercase tracking-widest",
                              analysisResult.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                            )}>
                              {analysisResult.success ? "Pagamento Confirmado!" : "Validação Falhou"}
                            </h3>
                            <p className="text-xs font-bold text-muted-foreground leading-relaxed">{analysisResult.reason}</p>
                         </div>
                      </div>
                   </div>
                 )}

                 {(!isAnalyzing && (!analysisResult || !analysisResult.success)) && (
                   <Button 
                     onClick={() => {
                       setUploadedImageUrl(null);
                       setAnalysisResult(null);
                     }}
                     variant="outline"
                     className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2 hover:bg-muted"
                   >
                      Tentar Novamente
                   </Button>
                 )}

                 {(!isAnalyzing && analysisResult?.success) && (
                   <Button 
                     onClick={() => setIsPixModalOpen(false)}
                     className="w-full h-14 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-green-500/20"
                   >
                      Concluir
                   </Button>
                 )}
               </div>
             )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageSquare(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
