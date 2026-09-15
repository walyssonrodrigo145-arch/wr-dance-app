import { 
  Inbox, 
  Calendar, 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  ExternalLink,
  Search,
  Check,
  X,
  Sparkles,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function Solicitacoes() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // Remarcações
  const { data: requests, isLoading } = trpc.reschedule.list.useQuery();
  const respondMutation = trpc.reschedule.respond.useMutation({
    onSuccess: () => {
      toast.success("Solicitação processada.");
      utils.reschedule.list.invalidate();
      utils.reschedule.pendingCount.invalidate();
    },
    onError: (e) => toast.error("Erro ao processar: " + e.message)
  });
  const deleteMutation = trpc.reschedule.delete.useMutation({
    onSuccess: () => {
      toast.success("Solicitação excluída.");
      utils.reschedule.list.invalidate();
      utils.reschedule.pendingCount.invalidate();
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message)
  });

  // PRD_AULA_EXTRA: solicitações de aula extra
  const { data: extraRequests, isLoading: isLoadingExtra } = trpc.extraRequests.list.useQuery();
  const extraRespondMutation = trpc.extraRequests.respond.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.status === 'recusada' ? "Solicitação recusada." : "Aula extra aprovada! Não esqueça de agendar na agenda.");
      utils.extraRequests.list.invalidate();
      utils.extraRequests.pendingCount.invalidate();
    },
    onError: (e) => toast.error("Erro ao processar: " + e.message)
  });
  const extraDeleteMutation = trpc.extraRequests.delete.useMutation({
    onSuccess: () => {
      toast.success("Solicitação excluída.");
      utils.extraRequests.list.invalidate();
      utils.extraRequests.pendingCount.invalidate();
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message)
  });

  const { data: extraPendingCount = 0 } = trpc.extraRequests.pendingCount.useQuery();
  const { data: reschedulePendingCount = 0 } = trpc.reschedule.pendingCount.useQuery();

  const filteredRequests = requests?.filter(r => 
    (r.studentName || '').toLowerCase().includes(search.toLowerCase()) || 
    (r.lessonTitle || '').toLowerCase().includes(search.toLowerCase())
  ) || [];

  const filteredExtra = extraRequests?.filter(r => 
    (r.studentName || '').toLowerCase().includes(search.toLowerCase())
  ) || [];

  const renderEmpty = (icon: any, message: string) => (
    <div className="flex flex-col items-center justify-center py-32 bg-card/30 rounded-[3rem] border-2 border-dashed border-border/50">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 opacity-20">
        {icon}
      </div>
      <p className="text-xl font-black text-foreground/40">Tudo em dia!</p>
      <p className="text-sm text-muted-foreground/60 font-medium mt-2">{message}</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Inbox size={28} />
          </div>
          Solicitações
        </h1>
        <p className="text-muted-foreground font-medium mt-1">Gerencie pedidos de reagendamento e aulas extras dos alunos.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input 
          type="text" 
          placeholder="Buscar solicitações..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
        />
      </div>

      <Tabs defaultValue="remarcacoes" className="w-full">
        <TabsList className="bg-background/60 backdrop-blur-md p-1.5 rounded-2xl mb-8 inline-flex shadow-inner border border-border/10">
          <TabsTrigger value="remarcacoes" className="rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-6 data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-11">
            Remarcações
          </TabsTrigger>
          <TabsTrigger value="aulasextra" className="rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-6 data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-11 gap-2">
            Aulas Extra
            {extraPendingCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                {extraPendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── REMARCAÇÕES ── */}
        <TabsContent value="remarcacoes" className="outline-none space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carregando solicitações...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            renderEmpty(<Inbox size={40} />, "Nenhuma solicitação de reagendamento no momento.")
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence>
                {filteredRequests.map((req, idx) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className="border-none shadow-lg bg-card/60 backdrop-blur-md overflow-hidden group">
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div className={cn(
                            "w-full md:w-2 shrink-0 transition-all",
                            req.status === 'pendente' ? "bg-amber-500" : req.status === 'aprovada' ? "bg-emerald-500" : "bg-rose-500"
                          )} />
                          
                          <div className="flex-1 p-8">
                            <div className="flex flex-col lg:flex-row justify-between gap-8">
                              <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                                    {(req.studentName || '??').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-black text-foreground tracking-tight">{req.studentName || 'Aluno'}</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Solicitou Reagendamento</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="bg-muted/30 p-4 rounded-2xl border border-border/40">
                                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                        <Calendar size={12} className="text-primary/60" /> Aula Original
                                     </div>
                                     <p className="text-sm font-bold">{req.lessonTitle}</p>
                                  </div>
                                  <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                                     <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1">
                                        <Clock size={12} /> Preferência de Datas
                                     </div>
                                     <p className="text-sm font-bold text-primary">{req.preferredDates}</p>
                                  </div>
                                </div>

                                <div className="bg-muted/20 p-4 rounded-2xl">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Motivo / Mensagem</p>
                                  <p className="text-sm font-medium text-foreground italic">"{req.reason}"</p>
                                </div>
                              </div>

                              <div className="flex flex-col justify-between items-end gap-6 min-w-[200px]">
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">Recebida em</p>
                                  <p className="text-xs font-bold">{format(new Date(req.createdAt), "dd/MM/yyyy HH:mm")}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                  {req.status === 'pendente' ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        disabled={respondMutation.isPending || respondMutation.variables?.id === req.id}
                                        onClick={() => respondMutation.mutate({ id: req.id, status: 'recusada' })}
                                        className="h-12 px-6 rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white font-black uppercase tracking-widest text-[10px]"
                                      >
                                        <X size={16} className="mr-2" /> Recusar
                                      </Button>
                                      <Button
                                        disabled={respondMutation.isPending || respondMutation.variables?.id === req.id}
                                        onClick={() => respondMutation.mutate({ id: req.id, status: 'aprovada' })}
                                        className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px]"
                                      >
                                        <Check size={16} className="mr-2" /> Aprovar
                                      </Button>
                                    </>
                                  ) : (
                                    <div className={cn(
                                      "flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]",
                                      req.status === 'aprovada' ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                    )}>
                                      {req.status === 'aprovada' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                      {req.status === 'aprovada' ? "Aprovada" : "Recusada"}
                                    </div>
                                  )}
                                  
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => {
                                      if(confirm("Tem certeza que deseja excluir esta solicitação?")) {
                                        deleteMutation.mutate({ id: req.id });
                                      }
                                    }}
                                    className="h-10 w-10 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                                
                                <Link href="/aulas">
                                  <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary gap-2">
                                    Ver Agenda <ExternalLink size={12} />
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        {/* ── AULAS EXTRA (PRD_AULA_EXTRA) ── */}
        <TabsContent value="aulasextra" className="outline-none space-y-4">
          {isLoadingExtra ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carregando solicitações...</p>
            </div>
          ) : filteredExtra.length === 0 ? (
            renderEmpty(<Sparkles size={40} />, "Nenhuma solicitação de aula extra no momento.")
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence>
                {filteredExtra.map((req, idx) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className="border-none shadow-lg bg-card/60 backdrop-blur-md overflow-hidden group">
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div className={cn(
                            "w-full md:w-2 shrink-0 transition-all",
                            req.status === 'pendente' ? "bg-amber-500" : req.status === 'aprovada' ? "bg-emerald-500" : "bg-rose-500"
                          )} />

                          <div className="flex-1 p-8">
                            <div className="flex flex-col lg:flex-row justify-between gap-8">
                              <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                                    {(req.studentName || '??').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <h3 className="text-lg font-black text-foreground tracking-tight">{req.studentName || 'Aluno'}</h3>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Solicitou Aula Extra</p>
                                  </div>
                                </div>

                                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                                   <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1">
                                      <Clock size={12} /> Preferência de Datas
                                   </div>
                                   <p className="text-sm font-bold text-primary">{req.preferredDates}</p>
                                </div>

                                {req.reason && (
                                  <div className="bg-muted/20 p-4 rounded-2xl">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Motivo / Mensagem</p>
                                    <p className="text-sm font-medium text-foreground italic">"{req.reason}"</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col justify-between items-end gap-6 min-w-[200px]">
                                <div className="text-right">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">Recebida em</p>
                                  <p className="text-xs font-bold">{format(new Date(req.createdAt), "dd/MM/yyyy HH:mm")}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                  {req.status === 'pendente' ? (
                                    <>
                                      <Button
                                        variant="outline"
                                        disabled={extraRespondMutation.isPending || extraRespondMutation.variables?.id === req.id}
                                        onClick={() => extraRespondMutation.mutate({ id: req.id, status: 'recusada' })}
                                        className="h-12 px-6 rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white font-black uppercase tracking-widest text-[10px]"
                                      >
                                        <X size={16} className="mr-2" /> Recusar
                                      </Button>
                                      <Button
                                        disabled={extraRespondMutation.isPending || extraRespondMutation.variables?.id === req.id}
                                        onClick={() => extraRespondMutation.mutate({ id: req.id, status: 'aprovada' })}
                                        className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px]"
                                      >
                                        <Check size={16} className="mr-2" /> Aprovar
                                      </Button>
                                    </>
                                  ) : (
                                    <div className={cn(
                                      "flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]",
                                      req.status === 'aprovada' ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                    )}>
                                      {req.status === 'aprovada' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                      {req.status === 'aprovada' ? "Aprovada" : "Recusada"}
                                    </div>
                                  )}
                                  
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => {
                                      if(confirm("Tem certeza que deseja excluir esta solicitação?")) {
                                        extraDeleteMutation.mutate({ id: req.id });
                                      }
                                    }}
                                    className="h-10 w-10 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                                
                                <Link href="/aulas">
                                  <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary gap-2">
                                    Agendar na Agenda <ExternalLink size={12} />
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Help Tip */}
          <Card className="border-none shadow-md bg-amber-500/10 rounded-2xl overflow-hidden border-l-4 border-l-amber-500">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertCircle className="text-amber-500 shrink-0 mt-1" size={20} />
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-700">Como funciona a aprovação?</h4>
                <p className="text-xs text-amber-600/80 font-medium leading-relaxed">
                  Ao aprovar, o aluno será notificado. Lembre-se de acessar o módulo de <strong>Aulas</strong> para criar a aula extra na agenda oficial.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
