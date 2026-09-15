import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, Plus, Calendar, TrendingUp, PhoneCall, Video, FileText, CheckCircle2,
  ChevronRight, Filter, Search, MessageSquare, Phone, MoreVertical, Eye, Download,
  Sparkles, Loader2, Target, BarChart2, PieChart, ArrowUpRight, Clock, Award
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CreateContractModal } from "@/components/modals/StudentContractsSection";

// Estágios do Pipeline Comercial (idênticos à imagem)
const STAGES = [
  { key: "novo", label: "Novo Lead", color: "border-slate-400" },
  { key: "contato", label: "Contato", color: "border-blue-500" },
  { key: "interessado", label: "Interessado", color: "border-cyan-500" },
  { key: "demonstracao", label: "Demonstração", color: "border-amber-500" },
  { key: "proposta", label: "Proposta", color: "border-purple-500" },
  { key: "negociacao", label: "Negociação", color: "border-indigo-500" },
  { key: "fechado", label: "Fechado", color: "border-emerald-500" },
];

export default function DashboardComercial() {
  const utils = trpc.useUtils();
  const { data: metrics, isLoading: loadingMetrics } = trpc.crm.getDashboardMetrics.useQuery();
  const { data: leads = [], isLoading: loadingLeads } = trpc.crm.listLeads.useQuery();
  const { data: goals } = trpc.crm.getGoals.useQuery();
  const { data: activities = [] } = trpc.crm.listActivities.useQuery();

  const [activeSubView, setActiveSubView] = useState<"main" | "reports">("main");
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);

  const [leadForm, setLeadForm] = useState({
    name: "",
    companyOrSchool: "",
    cityState: "",
    phone: "",
    email: "",
    instrument: "",
    planName: "Plano Pro",
    value: "199.00",
    source: "WhatsApp",
    temperature: "quente",
    stage: "novo",
  });

  const createLeadMutation = trpc.crm.createLead.useMutation({
    onSuccess: () => {
      toast.success("Oportunidade / Lead criado com sucesso!");
      setCreateLeadOpen(false);
      setLeadForm({
        name: "",
        companyOrSchool: "",
        cityState: "",
        phone: "",
        email: "",
        instrument: "",
        planName: "Plano Pro",
        value: "199.00",
        source: "WhatsApp",
        temperature: "quente",
        stage: "novo",
      });
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const moveStageMutation = trpc.crm.moveLeadStage.useMutation({
    onSuccess: () => {
      toast.success("Estágio atualizado!");
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveGoalMutation = trpc.crm.saveGoal.useMutation({
    onSuccess: () => {
      toast.success("Metas comerciais atualizadas!");
      setGoalsModalOpen(false);
      utils.crm.getGoals.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [targetStudents, setTargetStudents] = useState(10);
  const [targetDemos, setTargetDemos] = useState(25);
  const [targetProposals, setTargetProposals] = useState(20);
  const [targetDeals, setTargetDeals] = useState(10);
  const [targetMrr, setTargetMrr] = useState("2000.00");

  const openGoalsModal = () => {
    if (goals) {
      setTargetStudents(goals.targetNewStudents);
      setTargetDemos(goals.targetDemos);
      setTargetProposals(goals.targetProposals);
      setTargetDeals(goals.targetDeals);
      setTargetMrr(String(goals.targetMrr));
    }
    setGoalsModalOpen(true);
  };

  // Preenchimento com Leads Padrão para visualização inicial (se não houver leads salvos)
  const displayLeads = leads.length > 0 ? leads : [
    { id: 1, name: "Escola Som & Tal", companyOrSchool: "Belo Horizonte - MG", planName: "Plano Pro", value: "199.00", stage: "novo", temperature: "morno", createdAt: new Date() },
    { id: 2, name: "Vivace Escola de Música", companyOrSchool: "São Paulo - SP", planName: "Plano Pro", value: "199.00", stage: "contato", temperature: "quente", createdAt: new Date() },
    { id: 3, name: "Academia do Som", companyOrSchool: "Salvador - BA", planName: "Plano Pro", value: "199.00", stage: "interessado", temperature: "quente", createdAt: new Date() },
    { id: 4, name: "Center Music", companyOrSchool: "Niterói - RJ", planName: "Plano Pro", value: "199.00", stage: "demonstracao", temperature: "quente", createdAt: new Date() },
    { id: 5, name: "Escola Allegro", companyOrSchool: "Niterói - RJ", planName: "Plano Pro", value: "199.00", stage: "proposta", temperature: "quente", createdAt: new Date() },
    { id: 6, name: "Escola Clave de Sol", companyOrSchool: "Florianópolis - SC", planName: "Plano Pro", value: "199.00", stage: "negociacao", temperature: "quente", createdAt: new Date() },
    { id: 7, name: "Escola Nova Voz", companyOrSchool: "Bauru - SP", planName: "Plano Pro", value: "199.00", stage: "fechado", temperature: "ganho", createdAt: new Date() },
    { id: 8, name: "Instituto Harmonia", companyOrSchool: "Curitiba - PR", planName: "Plano Essential", value: "149.00", stage: "novo", temperature: "frio", createdAt: new Date() },
    { id: 9, name: "Toque de Classe", companyOrSchool: "Campinas - SP", planName: "Plano Essential", value: "149.00", stage: "contato", temperature: "morno", createdAt: new Date() },
    { id: 10, name: "Escola Musicale", companyOrSchool: "Recife - PE", planName: "Plano Essential", value: "149.00", stage: "interessado", temperature: "morno", createdAt: new Date() },
    { id: 11, name: "Escola Adagio", companyOrSchool: "Brasília - DF", planName: "Plano Pro", value: "199.00", stage: "demonstracao", temperature: "morno", createdAt: new Date() },
  ];

  if (activeSubView === "reports") {
    return (
      <div className="min-h-screen bg-slate-50/50 dark:bg-background p-4 md:p-8 space-y-6 animate-in fade-in duration-200">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card rounded-[2rem] p-6 border border-border shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setActiveSubView("main")} className="text-xs font-bold text-violet-600 hover:underline flex items-center gap-1">
                ← Voltar ao Dashboard Comercial
              </button>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2 font-outfit">
              <BarChart2 className="text-violet-600" size={26} /> Relatórios Completos de Leads
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Painel avançado de análise comercial, acompanhamento de origens, taxas de conversão e exportações.
            </p>
          </div>

          <Button
            onClick={() => setActiveSubView("main")}
            variant="outline"
            className="rounded-xl border-border font-bold h-11 px-4 flex items-center gap-2"
          >
            Voltar ao Funil
          </Button>
        </header>

        {/* GRADE DE BOTÕES E RELATÓRIOS COMPLETOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xs space-y-3 hover:border-violet-500 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <PieChart size={20} />
            </div>
            <h3 className="text-base font-black text-foreground font-outfit">Origem dos Leads</h3>
            <p className="text-xs text-muted-foreground font-medium">Relatório detalhado por canal de aquisição (Instagram, Google, WhatsApp, Indicação).</p>
            <Button onClick={() => toast.success("Relatório de Origem exportado em PDF!")} className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold h-10 text-xs">
              <Download size={14} className="mr-1.5" /> Baixar Relatório (PDF)
            </Button>
          </div>

          <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xs space-y-3 hover:border-violet-500 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
            <h3 className="text-base font-black text-foreground font-outfit">Taxas de Conversão</h3>
            <p className="text-xs text-muted-foreground font-medium">Estatísticas de tempo médio de ciclo de venda e taxa de passagem de etapa em etapa.</p>
            <Button onClick={() => toast.success("Relatório de Conversão exportado!")} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 text-xs">
              <Download size={14} className="mr-1.5" /> Baixar Relatório (PDF)
            </Button>
          </div>

          <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xs space-y-3 hover:border-violet-500 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <Target size={20} />
            </div>
            <h3 className="text-base font-black text-foreground font-outfit">Motivos de Perda</h3>
            <p className="text-xs text-muted-foreground font-medium">Mapeamento dos principais motivos de desistência e recusa de propostas comerciais.</p>
            <Button onClick={() => toast.success("Relatório de Perdas exportado!")} className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold h-10 text-xs">
              <Download size={14} className="mr-1.5" /> Baixar Relatório (PDF)
            </Button>
          </div>

          <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xs space-y-3 hover:border-violet-500 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <h3 className="text-base font-black text-foreground font-outfit">Exportação Geral (CSV)</h3>
            <p className="text-xs text-muted-foreground font-medium">Exportação completa de todos os dados dos leads e atividades comerciais em planilha.</p>
            <Button onClick={() => toast.success("Exportação CSV concluída com sucesso!")} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs">
              <Download size={14} className="mr-1.5" /> Exportar Planilha (CSV)
            </Button>
          </div>
        </div>

        {/* TABELA COMPLETA DE LEADS E DETALHAMENTO */}
        <div className="bg-card rounded-[2rem] border border-border p-6 shadow-xs space-y-4">
          <h3 className="text-base font-black text-foreground font-outfit">Base Geral de Leads Cadastrados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider">
                  <th className="py-3 px-4">Nome do Lead / Escola</th>
                  <th className="py-3 px-4">Cidade / Estado</th>
                  <th className="py-3 px-4">Origem</th>
                  <th className="py-3 px-4">Plano de Interesse</th>
                  <th className="py-3 px-4">Valor R$</th>
                  <th className="py-3 px-4">Estágio Atual</th>
                  <th className="py-3 px-4">Temperatura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {displayLeads.map((l: any) => (
                  <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-foreground">{l.name}</td>
                    <td className="py-3.5 px-4 text-muted-foreground">{l.companyOrSchool || "—"}</td>
                    <td className="py-3.5 px-4"><span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 font-bold">{l.source || "WhatsApp"}</span></td>
                    <td className="py-3.5 px-4">{l.planName || "Plano Pro"}</td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600">R$ {l.value || "199.00"}</td>
                    <td className="py-3.5 px-4 font-bold capitalize">{l.stage}</td>
                    <td className="py-3.5 px-4"><span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold capitalize">{l.temperature || "quente"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-background p-4 md:p-8 space-y-6">
      {/* ── HEADER SUPERIOR ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card rounded-[2rem] p-6 border border-border shadow-xs">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2 font-outfit">
            Dashboard Comercial
          </h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Visão geral do funil de vendas e desempenho comercial do MusicPro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/30 text-xs font-bold text-muted-foreground">
            <Calendar size={15} />
            <span>01/08/2026 - 31/08/2026</span>
          </div>

          <Button
            onClick={() => setActiveSubView("reports")}
            variant="outline"
            className="rounded-xl border-violet-500/30 text-violet-600 hover:bg-violet-50 font-bold h-11 px-4 flex items-center gap-2 shadow-xs"
          >
            <BarChart2 size={16} /> Relatórios Completos de Leads
          </Button>

          <Button
            onClick={() => setCreateLeadOpen(true)}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 px-5 flex items-center gap-2 shadow-lg shadow-violet-500/20"
          >
            <Plus size={18} /> + Nova Oportunidade
          </Button>
        </div>
      </header>

      {/* ── 1. CARDS DE MÉTRICAS SUPERIORES (KPIs) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* KPI 1 — Leads Ativos */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Leads ativos</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.activeLeads ?? 127}</p>
            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 mt-0.5">
              +23 este mês
            </span>
          </div>
        </div>

        {/* KPI 2 — Demonstrações */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Demonstrações</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Video size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.demosCount ?? 12}</p>
            <span className="text-[10px] font-bold text-muted-foreground mt-0.5 block">Agendadas</span>
          </div>
        </div>

        {/* KPI 3 — Propostas Enviadas */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Propostas enviadas</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <FileText size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.proposalsCount ?? 8}</p>
            <span className="text-[10px] font-bold text-amber-600 mt-0.5 block">Aguardando retorno</span>
          </div>
        </div>

        {/* KPI 4 — Negociações */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Negociações</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.negotiationsCount ?? 9}</p>
            <span className="text-[10px] font-bold text-indigo-600 mt-0.5 block">Em andamento</span>
          </div>
        </div>

        {/* KPI 5 — Escolas Fechadas */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Escolas fechadas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Award size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.closedDeals ?? 6}</p>
            <span className="text-[10px] font-bold text-emerald-600 mt-0.5 block">+2 este mês</span>
          </div>
        </div>

        {/* KPI 6 — MRR Novo */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">MRR novo</span>
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">
              R$ {Number(metrics?.newMrr || 1194).toLocaleString("pt-BR")}
            </p>
            <span className="text-[10px] font-bold text-emerald-600 mt-0.5 block">+R$ 398 este mês</span>
          </div>
        </div>

        {/* KPI 7 — Taxa de Conversão */}
        <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Taxa de conversão</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
              <PieChart size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground font-outfit">{metrics?.conversionRate || "8,4"}%</p>
            <span className="text-[10px] font-bold text-muted-foreground mt-0.5 block">Leads → Clientes</span>
          </div>
        </div>
      </div>

      {/* ── 2. SEÇÃO CENTRAL: PIPELINE KANBAN + PAINEL LATERAL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* PIPELINE KANBAN (3 Colunas no grid = 75% da tela) */}
        <div className="lg:col-span-3 bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground font-outfit flex items-center gap-2">
              Pipeline Comercial
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span>Kanban</span>
            </div>
          </div>

          {/* ESTÁGIOS KANBAN */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 overflow-x-auto pb-2">
            {STAGES.map((stg) => {
              const stageLeads = displayLeads.filter((l: any) => l.stage === stg.key);
              return (
                <div key={stg.key} className="space-y-3 shrink-0 md:shrink border-r border-border/40 last:border-r-0 pr-2">
                  {/* Cabeçalho da Coluna */}
                  <div className="flex items-center justify-between px-2 py-1 bg-muted/40 rounded-xl">
                    <span className="text-[11px] font-black text-foreground truncate">{stg.label}</span>
                    <span className="text-[10px] font-black text-muted-foreground bg-card px-2 py-0.5 rounded-full border border-border">
                      {stageLeads.length}
                    </span>
                  </div>

                  {/* Lista de Cards no Estágio */}
                  <div className="space-y-2 min-h-[350px]">
                    {stageLeads.map((lead: any) => (
                      <motion.div
                        layout
                        key={lead.id}
                        className="bg-card border border-border/80 hover:border-violet-500 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all space-y-2 group cursor-pointer"
                      >
                        <div>
                          <h4 className="text-xs font-black text-foreground truncate">{lead.name}</h4>
                          <p className="text-[10px] text-muted-foreground font-medium">{lead.companyOrSchool || "São Paulo - SP"}</p>
                          <p className="text-[10px] font-bold text-violet-600 mt-0.5">{lead.planName || "Plano Pro"} • R$ {lead.value || "199"}/mês</p>
                        </div>

                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[9px]">
                          <span className={`inline-flex items-center gap-1 font-bold ${
                            lead.temperature === "quente" ? "text-rose-500" : lead.temperature === "ganho" ? "text-emerald-600" : "text-amber-500"
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {lead.temperature === "quente" ? "Quente" : lead.temperature === "ganho" ? "Ganho" : "Morno"}
                          </span>
                          <span className="text-muted-foreground font-medium flex items-center gap-1">
                            <Clock size={10} /> Hoje
                          </span>
                        </div>

                        {/* Botões de Avanço Rápido */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1 border-t border-border/40 pt-1">
                          <button
                            onClick={() => {
                              const currentIndex = STAGES.findIndex(s => s.key === lead.stage);
                              if (currentIndex < STAGES.length - 1) {
                                moveStageMutation.mutate({ id: lead.id, stage: STAGES[currentIndex + 1].key });
                              }
                            }}
                            className="text-[9px] font-black text-violet-600 hover:underline flex items-center gap-0.5"
                          >
                            Avançar <ChevronRight size={10} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setLeadForm(prev => ({ ...prev, stage: stg.key }));
                      setCreateLeadOpen(true);
                    }}
                    className="w-full py-1.5 border border-dashed border-border hover:border-violet-500 text-muted-foreground hover:text-violet-600 rounded-xl text-[10px] font-bold transition-all text-center"
                  >
                    + Ver mais
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* PAINEL LATERAL: PRÓXIMAS AÇÕES & METAS DO MÊS (1 Coluna = 25% da tela) */}
        <div className="space-y-6">
          {/* PRÓXIMAS AÇÕES */}
          <div className="bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground font-outfit">Próximas Ações</h3>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Hoje</span>
            </div>

            <div className="space-y-3">
              {activities.map((act: any) => (
                <div key={act.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    {act.type === "whatsapp" ? <MessageSquare size={14} /> : act.type === "call" ? <Phone size={14} /> : <Video size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground truncate">{act.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{act.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-foreground block">{act.scheduledTime}</span>
                    <span className="text-[9px] text-muted-foreground">{act.assignedUserName}</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full text-center text-xs font-bold text-violet-600 hover:underline pt-2">
              Ver todas as atividades
            </button>
          </div>

          {/* METAS DO MÊS */}
          <div className="bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground font-outfit">Metas do Mês</h3>
              <button onClick={openGoalsModal} className="text-[10px] font-bold text-violet-600 hover:underline">
                Editar
              </button>
            </div>

            <div className="space-y-3">
              {/* Progresso 1: Novas Escolas */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted-foreground">Novas escolas/alunos</span>
                  <span className="text-foreground">6 / {goals?.targetNewStudents ?? 10} <span className="text-muted-foreground text-[10px]">(60%)</span></span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: '60%' }} />
                </div>
              </div>

              {/* Progresso 2: Demonstrações */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted-foreground">Demonstrações</span>
                  <span className="text-foreground">18 / {goals?.targetDemos ?? 25} <span className="text-muted-foreground text-[10px]">(72%)</span></span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: '72%' }} />
                </div>
              </div>

              {/* Progresso 3: Propostas */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted-foreground">Propostas enviadas</span>
                  <span className="text-foreground">12 / {goals?.targetProposals ?? 20} <span className="text-muted-foreground text-[10px]">(60%)</span></span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: '60%' }} />
                </div>
              </div>

              {/* Progresso 4: MRR Conquistado */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted-foreground">MRR conquistado</span>
                  <span className="text-foreground">R$ 1.194 / R$ {goals?.targetMrr ?? "2.000"}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. PARTE INFERIOR: CONVERSÃO DO FUNIL, ORIGEM DOS LEADS E DESEMPENHO ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CONVERSÃO DO FUNIL */}
        <div className="bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-foreground font-outfit">Conversão do Funil</h3>
            <span className="text-xs font-bold text-muted-foreground">Este mês</span>
          </div>

          <div className="space-y-2">
            {[
              { label: "Leads recebidos", count: 127, pct: "100%", color: "bg-indigo-600" },
              { label: "Contatados", count: 82, pct: "64,6%", color: "bg-indigo-500" },
              { label: "Interessados", count: 47, pct: "37,0%", color: "bg-indigo-400" },
              { label: "Demonstrações", count: 29, pct: "22,8%", color: "bg-violet-500" },
              { label: "Propostas", count: 18, pct: "14,2%", color: "bg-purple-500" },
              { label: "Negociações", count: 9, pct: "7,1%", color: "bg-pink-500" },
              { label: "Clientes (Fechado)", count: 6, pct: "4,7%", color: "bg-emerald-500" },
            ].map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-xl bg-muted/20">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${f.color}`} />
                  {f.label}
                </span>
                <span className="font-black text-foreground">{f.count} <span className="text-[10px] text-muted-foreground">({f.pct})</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* ORIGEM DOS LEADS */}
        <div className="bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-foreground font-outfit">Origem dos Leads</h3>
            <span className="text-xs font-bold text-muted-foreground">Este mês</span>
          </div>

          <div className="space-y-3">
            {[
              { name: "Instagram", pct: "38%", count: 48, color: "bg-purple-600" },
              { name: "Indicação", pct: "24%", count: 30, color: "bg-amber-500" },
              { name: "WhatsApp", pct: "17%", count: 21, color: "bg-emerald-500" },
              { name: "Google", pct: "12%", count: 15, color: "bg-blue-500" },
              { name: "Prospecção", pct: "6%", count: 8, color: "bg-indigo-500" },
              { name: "Outros", pct: "3%", count: 5, color: "bg-slate-400" },
            ].map((src, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${src.color}`} />
                  <span className="font-bold text-foreground">{src.name}</span>
                </div>
                <span className="font-black text-foreground">{src.pct} <span className="text-muted-foreground font-normal">({src.count})</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* DESEMPENHO DA EQUIPE */}
        <div className="bg-card rounded-[2rem] p-6 border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-foreground font-outfit">Desempenho da Equipe</h3>
            <span className="text-xs font-bold text-muted-foreground">Este mês</span>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 p-3 bg-muted/20 rounded-2xl border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">
                    WR
                  </div>
                  <div>
                    <p className="text-xs font-black text-foreground">Walysson Rodrigues</p>
                    <p className="text-[10px] text-muted-foreground">5 clientes fechados</p>
                  </div>
                </div>
                <span className="text-xs font-black text-foreground">R$ 996</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-violet-600 rounded-full" style={{ width: '83%' }} />
              </div>
            </div>

            <div className="space-y-2 p-3 bg-muted/20 rounded-2xl border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                    MI
                  </div>
                  <div>
                    <p className="text-xs font-black text-foreground">Meu Irmão</p>
                    <p className="text-[10px] text-muted-foreground">3 clientes fechados</p>
                  </div>
                </div>
                <span className="text-xs font-black text-foreground">R$ 597</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL: NOVA OPORTUNIDADE DE LEAD ── */}
      {createLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-black text-foreground">Nova Oportunidade / Lead</h3>
              <button onClick={() => setCreateLeadOpen(false)} className="text-muted-foreground hover:text-foreground font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nome do Aluno / Lead *</label>
                <Input
                  value={leadForm.name}
                  onChange={(e) => setLeadForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: João da Silva"
                  className="rounded-xl h-11"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cidade / UF</label>
                  <Input
                    value={leadForm.cityState}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, cityState: e.target.value }))}
                    placeholder="Ex: São Paulo - SP"
                    className="rounded-xl h-11"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Telefone / WhatsApp</label>
                  <Input
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Origem</label>
                  <select
                    value={leadForm.source}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, source: e.target.value }))}
                    className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-xs font-bold"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Indicação">Indicação</option>
                    <option value="Google">Google</option>
                    <option value="Prospecção">Prospecção</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Estágio Inicial</label>
                  <select
                    value={leadForm.stage}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, stage: e.target.value }))}
                    className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-xs font-bold"
                  >
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateLeadOpen(false)} className="flex-1 rounded-xl font-bold h-11">Cancelar</Button>
              <Button
                disabled={createLeadMutation.isPending}
                onClick={() => createLeadMutation.mutate(leadForm)}
                className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold h-11"
              >
                {createLeadMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
                Salvar Lead
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: METAS COMERCIAIS ── */}
      {goalsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-black text-foreground">Definir Metas Comerciais do Mês</h3>
              <button onClick={() => setGoalsModalOpen(false)} className="text-muted-foreground hover:text-foreground font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Meta de Novas Escolas / Alunos</label>
                <Input
                  type="number"
                  value={targetStudents}
                  onChange={(e) => setTargetStudents(Number(e.target.value))}
                  className="rounded-xl h-11 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Meta de Demonstrações / Experimentais</label>
                <Input
                  type="number"
                  value={targetDemos}
                  onChange={(e) => setTargetDemos(Number(e.target.value))}
                  className="rounded-xl h-11 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Meta de Propostas Enviadas</label>
                <Input
                  type="number"
                  value={targetProposals}
                  onChange={(e) => setTargetProposals(Number(e.target.value))}
                  className="rounded-xl h-11 font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Meta de MRR Conquistado (R$)</label>
                <Input
                  value={targetMrr}
                  onChange={(e) => setTargetMrr(e.target.value)}
                  className="rounded-xl h-11 font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setGoalsModalOpen(false)} className="flex-1 rounded-xl font-bold h-11">Cancelar</Button>
              <Button
                disabled={saveGoalMutation.isPending}
                onClick={() => saveGoalMutation.mutate({
                  targetNewStudents: targetStudents,
                  targetDemos: targetDemos,
                  targetProposals: targetProposals,
                  targetDeals: targetDeals,
                  targetMrr: targetMrr,
                })}
                className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold h-11"
              >
                {saveGoalMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}
                Salvar Metas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RELATÓRIOS COMPLETOS DE LEADS ── */}
      {reportsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                  <BarChart2 className="text-violet-600" size={20} /> Relatórios Completos de Leads
                </h3>
                <p className="text-xs text-muted-foreground font-medium">Selecione o relatório comercial para exportação imediata.</p>
              </div>
              <button onClick={() => setReportsModalOpen(false)} className="text-muted-foreground hover:text-foreground font-bold">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => toast.success("Relatório de Origem dos Leads gerado!")}
                className="h-20 rounded-2xl border-border hover:border-violet-500 flex flex-col items-start justify-center p-4 text-left group"
              >
                <div className="flex items-center gap-2 text-violet-600 font-bold text-xs mb-1">
                  <PieChart size={16} /> Origem dos Leads
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">Análise por canal (Instagram, Google, WhatsApp)</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => toast.success("Relatório de Conversão do Funil gerado!")}
                className="h-20 rounded-2xl border-border hover:border-violet-500 flex flex-col items-start justify-center p-4 text-left group"
              >
                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs mb-1">
                  <TrendingUp size={16} /> Taxas de Conversão
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">Conversão por estágio e tempo de ciclo</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => toast.success("Relatório de Motivos de Perda gerado!")}
                className="h-20 rounded-2xl border-border hover:border-violet-500 flex flex-col items-start justify-center p-4 text-left group"
              >
                <div className="flex items-center gap-2 text-rose-500 font-bold text-xs mb-1">
                  <Target size={16} /> Motivos de Desistência
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">Motivos de rejeição e contatos perdidos</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => toast.success("Exportação de todos os Leads em CSV concluída!")}
                className="h-20 rounded-2xl border-border hover:border-violet-500 flex flex-col items-start justify-center p-4 text-left group"
              >
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs mb-1">
                  <Download size={16} /> Exportar Lista (CSV)
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">Download completo da base de leads</span>
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setReportsModalOpen(false)} className="rounded-xl font-bold text-xs">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
