import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Users, Plus, MessageCircle, Calendar, CheckCircle2, XCircle, 
  ArrowRight, Trash2, UserPlus, DollarSign, Music, Search, TrendingUp, Sparkles, Filter, Inbox
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StageKey = "novo" | "contato" | "aula_agendada" | "aula_realizada" | "matriculado" | "perdido";

interface StageConfig {
  key: StageKey;
  label: string;
  badgeCls: string;
  dotCls: string;
  icon: any;
  colorCls: string;
}

const STAGES: StageConfig[] = [
  { key: "novo", label: "Novos Leads", badgeCls: "bg-blue-500/10 text-blue-600 border-blue-500/20", dotCls: "bg-blue-500", icon: Users, colorCls: "text-blue-500" },
  { key: "contato", label: "Em Contato", badgeCls: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", dotCls: "bg-indigo-500", icon: MessageCircle, colorCls: "text-indigo-500" },
  { key: "aula_agendada", label: "Aula Agendada", badgeCls: "bg-amber-500/10 text-amber-600 border-amber-500/20", dotCls: "bg-amber-500", icon: Calendar, colorCls: "text-amber-500" },
  { key: "aula_realizada", label: "Aula Realizada", badgeCls: "bg-purple-500/10 text-purple-600 border-purple-500/20", dotCls: "bg-purple-500", icon: Music, colorCls: "text-purple-500" },
  { key: "matriculado", label: "Matriculado", badgeCls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dotCls: "bg-emerald-500", icon: CheckCircle2, colorCls: "text-emerald-500" },
  { key: "perdido", label: "Perdido", badgeCls: "bg-rose-500/10 text-rose-600 border-rose-500/20", dotCls: "bg-rose-500", icon: XCircle, colorCls: "text-rose-500" },
];

export default function CrmKanban() {
  const utils = trpc.useUtils();
  const trpcUtils = trpc.useUtils();

  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    instrument: "",
    value: "150",
    notes: "",
    source: "WhatsApp",
  });

  const { data: leads = [], isLoading } = trpc.crm.listLeads.useQuery();

  const createLeadMutation = trpc.crm.createLead.useMutation({
    onSuccess: () => {
      toast.success("Novo lead cadastrado no Funil!");
      utils.crm.listLeads.invalidate();
      setNewLeadOpen(false);
      setForm({ name: "", phone: "", email: "", instrument: "", value: "150", notes: "", source: "WhatsApp" });
    },
    onError: (e) => toast.error("Erro ao criar lead: " + e.message),
  });

  const updateStageMutation = trpc.crm.moveStage.useMutation({
    onSuccess: () => {
      toast.success("Estágio atualizado!");
      utils.crm.listLeads.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteLeadMutation = trpc.crm.deleteLead.useMutation({
    onSuccess: () => {
      toast.success("Lead removido");
      utils.crm.listLeads.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const convertToStudentMutation = trpc.crm.convertToStudent.useMutation({
    onSuccess: (data: any) => {
      toast.success(`🎉 ${data.student.name} matriculado com sucesso! Criado na lista de alunos.`);
      utils.crm.listLeads.invalidate();
      utils.students.list.invalidate();
    },
    onError: (e: any) => toast.error("Erro ao matricular: " + e.message),
  });

  const handleCreateLead = () => {
    if (!form.name.trim()) return toast.error("Preencha o nome do interessado");
    createLeadMutation.mutate({
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      instrument: form.instrument.trim() || undefined,
      value: Number(form.value) || 0,
      notes: form.notes.trim() || undefined,
      source: form.source,
      stage: "novo",
    });
  };

  const filteredLeads = leads.filter((l: any) => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    (l.instrument || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.phone || "").includes(search)
  );

  const totalValue = leads.reduce((acc: number, l: any) => acc + (Number(l.value) || 0), 0);
  const totalAgendados = leads.filter((l: any) => l.stage === "aula_agendada" || l.stage === "aula_realizada").length;
  const totalMatriculados = leads.filter((l: any) => l.stage === "matriculado").length;
  const conversionRate = leads.length > 0 ? Math.round((totalMatriculados / leads.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Action Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card/40 backdrop-blur-xl p-4 rounded-2xl border border-border/60 shadow-lg shadow-primary/5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input 
            placeholder="Buscar por nome, telefone ou instrumento..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10 text-xs rounded-xl bg-background/80 border-border/60"
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Button 
            onClick={() => setNewLeadOpen(true)} 
            className="h-10 rounded-xl px-5 gap-2 font-bold bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500 text-white shadow-lg shadow-primary/25 transition-all active:scale-95 shrink-0"
          >
            <Plus size={18} /> Novo Lead
          </Button>
        </div>
      </div>

      {/* KPI Cards (Visual WOW & Glassmorphism) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total no Funil", value: `${leads.length}`, sub: "interessados", icon: Users, color: "text-blue-500", bg: "from-blue-500/10 via-blue-500/5 to-transparent", border: "border-blue-500/20" },
          { label: "Aulas Experimentais", value: `${totalAgendados}`, sub: "agendadas/feitas", icon: Calendar, color: "text-amber-500", bg: "from-amber-500/10 via-amber-500/5 to-transparent", border: "border-amber-500/20" },
          { label: "Matriculados", value: `${totalMatriculados}`, sub: `${conversionRate}% conversão`, icon: CheckCircle2, color: "text-emerald-500", bg: "from-emerald-500/10 via-emerald-500/5 to-transparent", border: "border-emerald-500/20" },
          { label: "Valor em Potencial", value: `R$ ${totalValue.toFixed(2)}`, sub: "previsão mensal", icon: DollarSign, color: "text-purple-500", bg: "from-purple-500/10 via-purple-500/5 to-transparent", border: "border-purple-500/20" },
        ].map((kpi, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.05 }}
            className={cn(
              "relative p-4 lg:p-5 rounded-2xl bg-gradient-to-br border shadow-xl shadow-primary/5 backdrop-blur-xl overflow-hidden hover:-translate-y-1 transition-all duration-300",
              kpi.bg, kpi.border
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
              <div className={cn("w-8 h-8 rounded-xl bg-card flex items-center justify-center shadow-sm", kpi.color)}>
                <kpi.icon size={16} />
              </div>
            </div>
            <p className="text-2xl lg:text-3xl font-black font-outfit text-foreground leading-tight">{kpi.value}</p>
            <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* KANBAN BOARD */}
      <div className="flex gap-4 items-start overflow-x-auto pb-6 custom-scrollbar snap-x snap-mandatory px-1">
        {STAGES.map((stg, stgIdx) => {
          const stageLeads = filteredLeads.filter((l: any) => l.stage === stg.key);
          return (
            <motion.div 
              key={stg.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: stgIdx * 0.06 }}
              className="flex flex-col shrink-0 snap-center w-[85vw] sm:w-[320px] bg-card/40 backdrop-blur-xl rounded-2xl border border-border/60 p-3.5 min-h-[520px] shadow-xl shadow-primary/5"
            >
              {/* Header da Coluna */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0 animate-pulse", stg.dotCls)} />
                  <h3 className="text-xs font-bold font-outfit uppercase tracking-wider text-foreground truncate">{stg.label}</h3>
                </div>
                <Badge variant="secondary" className="text-[10px] font-black shrink-0 px-2 py-0.5">{stageLeads.length}</Badge>
              </div>

              {/* Lista de Cards */}
              <div className="space-y-3 flex-1">
                {stageLeads.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-[11px] text-muted-foreground/60 italic border-2 border-dashed border-border/30 rounded-2xl bg-muted/10">
                    <Inbox className="w-6 h-6 mb-2 text-muted-foreground/40" />
                    <span>Nenhum lead nesta etapa</span>
                  </div>
                ) : (
                  stageLeads.map((lead: any) => (
                    <motion.div
                      key={lead.id}
                      layout
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="group bg-card hover:bg-card/90 border border-border/60 hover:border-primary/40 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-foreground truncate">{lead.name}</h4>
                          {lead.instrument ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary mt-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                              <Music size={10} /> {lead.instrument}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">Origem: {lead.source}</span>
                          )}
                        </div>
                        <button onClick={() => deleteLeadMutation.mutate({ leadId: lead.id })} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all p-1">
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {lead.notes && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 mt-2 bg-muted/40 p-2 rounded-lg border border-border/30">
                          {lead.notes}
                        </p>
                      )}

                      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-foreground">R$ {Number(lead.value).toFixed(0)}/mês</span>
                        <div className="flex items-center gap-1">
                          {lead.phone && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10 rounded-lg"
                              onClick={() => window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}?text=Olá ${lead.name}! Tudo bem? Gostaria de saber se podemos agendar sua aula experimental no MusicPro.`, '_blank')}
                              title="Abrir WhatsApp"
                            >
                              <MessageCircle size={14} />
                            </Button>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-indigo-600 hover:bg-indigo-500/10 rounded-lg"
                            onClick={async () => {
                              try {
                                const res = await trpcUtils.client.enrollment.generateLink.mutate({
                                  leadId: lead.id,
                                  monthlyFee: Number(lead.value) || 150,
                                  autoSendWhatsapp: true,
                                });
                                const fullUrl = res.fullUrl || (window.location.origin.includes('localhost') ? `https://wrmusicpro.com.br${res.url}` : `${window.location.origin}${res.url}`);
                                await navigator.clipboard.writeText(fullUrl);

                                if (res.sentViaBot) {
                                  toast.success(`Link de matrícula gerado e enviado automaticamente via WhatsApp para ${lead.name}!`);
                                } else {
                                  toast.success("Link gerado e copiado! Redirecionando para o WhatsApp...");
                                  if (lead.phone) {
                                    const text = encodeURIComponent(`Olá ${lead.name}! 🎵\n\nAqui está o seu link exclusivo para realizar sua matrícula na nossa escola de música:\n\n👉 ${fullUrl}\n\nAcesse o link acima para escolher o melhor dia e horário para suas aulas!`);
                                    window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}?text=${text}`, '_blank');
                                  }
                                }
                              } catch (err: any) {
                                toast.error("Erro ao gerar link: " + (err.message || String(err)));
                              }
                            }}
                            title="Gerar Link e Enviar via WhatsApp"
                          >
                            <UserPlus size={14} />
                          </Button>

                          {stg.key !== "matriculado" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-blue-600 hover:bg-blue-500/10 rounded-lg"
                              onClick={() => {
                                const nextIndex = STAGES.findIndex(s => s.key === stg.key) + 1;
                                if (nextIndex < STAGES.length) {
                                  updateStageMutation.mutate({ leadId: lead.id, stage: STAGES[nextIndex].key });
                                }
                              }}
                              title="Avançar para próximo estágio"
                            >
                              <ArrowRight size={14} />
                            </Button>
                          )}

                          {stg.key !== "matriculado" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-purple-600 hover:bg-purple-500/10 rounded-lg"
                              onClick={() => {
                                if (confirm(`Deseja matricular ${lead.name} oficialmente como aluno?`)) {
                                  convertToStudentMutation.mutate({ leadId: lead.id, monthlyFee: Number(lead.value) });
                                }
                              }}
                              title="Matricular como Aluno Oficial"
                            >
                              <UserPlus size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Modal Novo Lead */}
      <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-border/80 shadow-2xl">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-lg font-bold font-outfit flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Novo Lead (Interessado)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome Completo</Label>
              <Input placeholder="Ex: João da Silva" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp / Celular</Label>
                <Input placeholder="11999998888" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instrumento</Label>
                <Input placeholder="Ex: Violão, Canto" value={form.instrument} onChange={e => setForm(f => ({ ...f, instrument: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor Estimado (R$/mês)</Label>
                <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</Label>
                <select 
                  className="w-full h-9 text-xs rounded-lg border border-border px-3 bg-background font-medium"
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                >
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Google / Site">Google / Site</option>
                  <option value="Indicação">Indicação</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações / Notas</Label>
              <Textarea placeholder="Interesse em aulas de violão para iniciante..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[90px]" />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" onClick={() => setNewLeadOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleCreateLead} disabled={createLeadMutation.isPending} className="rounded-xl gap-2 font-bold">
              {createLeadMutation.isPending ? "Cadastrando..." : "Adicionar ao Funil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
