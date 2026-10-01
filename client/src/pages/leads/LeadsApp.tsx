import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users, Plus, Calendar, TrendingUp, PhoneCall, FileText, CheckCircle2,
  ChevronRight, Filter, Search, MessageSquare, Phone, MoreVertical, Eye, Download,
  Loader2, Target, BarChart2, PieChart, ArrowUpRight, Clock, AlertTriangle,
  UserCheck, UserX, Tag, ShieldCheck, Settings, Sparkles, ChevronDown, Check,
  Activity, HelpCircle, UserPlus, ArrowRight, RefreshCw, Layers,
  LayoutDashboard, Briefcase, CalendarCheck, FileSpreadsheet, Building2,
  Rocket, Headphones, RefreshCcw, HeartPulse, DollarSign, Bell, Trash2, Edit3,
  BriefcaseBusiness, FolderKanban, Sliders, Globe, Trophy, Video, BookOpen,
  MessageCircle, Share2, CheckSquare, XCircle, AlertCircle, Compass, Flame, Music, LogOut,
  ArrowLeft, CheckCircle, Award, Star, Send, ShieldAlert, FileCheck
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Estágios do Funil Comercial de Dança DancePro
const DEFAULT_STAGES = [
  { key: "novo", label: "Novo Lead", color: "bg-[#5B50E6]", text: "text-indigo-400", bgLight: "bg-indigo-500/10", border: "border-indigo-500/30" },
  { key: "contato", label: "Contato Realizado", color: "bg-purple-500", text: "text-purple-400", bgLight: "bg-purple-500/10", border: "border-purple-500/30" },
  { key: "aula_experimental", label: "Aula Experimental", color: "bg-cyan-500", text: "text-cyan-400", bgLight: "bg-cyan-500/10", border: "border-cyan-500/30" },
  { key: "fez_aula", label: "Fez Aula Experim.", color: "bg-amber-500", text: "text-amber-400", bgLight: "bg-amber-500/10", border: "border-amber-500/30" },
  { key: "proposta", label: "Proposta Enviada", color: "bg-blue-500", text: "text-blue-400", bgLight: "bg-blue-500/10", border: "border-blue-500/30" },
  { key: "fechado", label: "Matriculado (Ganho)", color: "bg-emerald-500", text: "text-emerald-400", bgLight: "bg-emerald-500/10", border: "border-emerald-500/30" },
];

export default function LeadsApp() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [activeMenu, setActiveMenu] = useState<
    "leads" | "pipeline" | "atividades" | "propostas" | "metas" | "clientes" | "onboarding" | "suporte" | "performance" | "origens" | "configuracoes"
  >("leads");
  const [selectedPeriod, setSelectedPeriod] = useState("Este mês");

  // Filtros Globais
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStageFilter, setSelectedStageFilter] = useState("todos");
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState("todas");
  const [selectedInstrumentFilter, setSelectedInstrumentFilter] = useState("todos");

  // State de Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [trialLead, setTrialLead] = useState<any>(null);
  const [isConvertToStudentModalOpen, setIsConvertToStudentModalOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<any>(null);
  const [isCreateFollowUpOpen, setIsCreateFollowUpOpen] = useState(false);
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);

  // Checklists locais para demonstração de onboarding e suporte
  const [onboardingChecks, setOnboardingChecks] = useState<Record<string, boolean>>({
    "106_contract": true,
    "106_class": true,
    "106_material": true,
    "107_contract": true,
    "107_class": false,
    "107_material": false,
  });

  // Consultas tRPC Reais do Banco
  const { data: metrics } = trpc.crm.getDashboardMetrics.useQuery({ period: "30d" });
  const { data: dbLeads = [], isLoading: isLoadingLeads } = trpc.crm.listLeads.useQuery({
    search: searchTerm,
    stage: selectedStageFilter,
    priority: selectedPriorityFilter,
  });
  const { data: followUps = [] } = trpc.crm.listFollowUps.useQuery({ filter: "todos" });

  // Mutações tRPC
  const moveStageMutation = trpc.crm.moveStage.useMutation({
    onSuccess: () => {
      toast.success("Estágio do funil comercial atualizado!");
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteLeadMutation = trpc.crm.deleteLead.useMutation({
    onSuccess: () => {
      toast.success("Lead removido com sucesso!");
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
      setIsProfileModalOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // Amostragem inteligente
  const leadsDisplayList = useMemo(() => {
    const base = dbLeads;
    return base.filter((lead: any) => {
      if (searchTerm.trim() !== "") {
        const q = searchTerm.toLowerCase();
        const mName = lead.name?.toLowerCase().includes(q);
        const mPhone = lead.phone?.toLowerCase().includes(q);
        const mInst = (lead.instrument || lead.productService)?.toLowerCase().includes(q);
        if (!mName && !mPhone && !mInst) return false;
      }
      if (selectedStageFilter !== "todos" && lead.stage !== selectedStageFilter) return false;
      if (selectedInstrumentFilter !== "todos") {
        const inst = lead.instrument || lead.productService || "";
        if (!inst.toLowerCase().includes(selectedInstrumentFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [dbLeads, searchTerm, selectedStageFilter, selectedInstrumentFilter]);

  // Métricas calculadas
  const totalLeadsCount = leadsDisplayList.length;
  const newLeadsCount = leadsDisplayList.filter((l: any) => l.stage === "novo").length;
  const trialLessonsCount = leadsDisplayList.filter((l: any) => l.stage === "aula_experimental" || l.stage === "fez_aula").length;
  const closedCount = leadsDisplayList.filter((l: any) => l.stage === "fechado" || l.stage === "matriculado").length;
  const conversionRate = totalLeadsCount > 0 ? ((closedCount / totalLeadsCount) * 100).toFixed(1) : "0.0";
  const totalPipelineRevenue = leadsDisplayList.reduce((acc: number, l: any) => acc + (parseFloat(String(l.value || "0")) || 0), 0);

  // AUDITORIA Fase 5: KPIs reais derivados dos leads (antes números fixos de demonstração).
  const crmStats = useMemo(() => {
    const leads = dbLeads as any[];
    const isClosed = (l: any) => l.stage === "fechado" || l.stage === "matriculado";
    const closed = leads.filter(isClosed);
    const proposed = leads.filter((l) => l.stage === "proposta");
    const demos = leads.filter((l) => l.stage === "aula_experimental" || l.stage === "fez_aula");
    const avgTicket = closed.length > 0 ? closed.reduce((a, l) => a + Number(l.value || 0), 0) / closed.length : 0;
    const conv = leads.length > 0 ? Math.round((closed.length / leads.length) * 100) : 0;
    const bySource = new Map<string, { count: number; closed: number; value: number }>();
    for (const l of leads) {
      const src = l.source || "Outros";
      const e = bySource.get(src) ?? { count: 0, closed: 0, value: 0 };
      e.count++;
      if (isClosed(l)) { e.closed++; e.value += Number(l.value || 0); }
      bySource.set(src, e);
    }
    const byCourse = new Map<string, number>();
    for (const l of leads) {
      const c = l.instrument || l.productService || "Dança";
      byCourse.set(c, (byCourse.get(c) || 0) + 1);
    }
    return { closed, proposed, demos, avgTicket, conv, bySource, byCourse, total: leads.length };
  }, [dbLeads, leadsDisplayList]);

  const followUpStats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const week = new Date(start.getTime() + 7 * 86400000);
    let today = 0, next7 = 0, done = 0;
    for (const item of followUps as any[]) {
      const f = item.followUp ?? item;
      const due = new Date(f.dueDate);
      if (f.completed) {
        if (due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()) done++;
        continue;
      }
      if (due >= start && due <= end) today++;
      else if (due > end && due <= week) next7++;
    }
    return { today, next7, done };
  }, [followUps]);

  const completeFollowUpMutation = trpc.crm.completeFollowUp.useMutation({
    onSuccess: () => {
      toast.success("Follow-up concluído!");
      utils.crm.listFollowUps.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: crmSettingsData } = trpc.crm.getSettings.useQuery();
  const [originsInput, setOriginsInput] = useState("");
  const updateSettingsMutation = trpc.crm.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas!");
      utils.crm.getSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: goals } = trpc.crm.getGoals.useQuery();

  const getPriorityBadge = (temp?: string | null) => {
    switch (temp) {
      case "quente":
      case "alta":
        return <span className="flex items-center gap-1 font-bold text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Quente</span>;
      case "frio":
      case "baixa":
        return <span className="flex items-center gap-1 font-bold text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Frio</span>;
      default:
        return <span className="flex items-center gap-1 font-bold text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Morno</span>;
    }
  };

  const getWhatsAppLink = (phone?: string | null, name?: string, instrument?: string) => {
    if (!phone) return "#";
    const clean = phone.replace(/\D/g, "");
    const num = clean.startsWith("55") ? clean : `55${clean}`;
    const text = encodeURIComponent(
      `Olá ${name || ""}! Tudo bem? Sou da escola de dança DancePro. Vi seu interesse no curso de ${instrument || "dança"}! Gostaria de agendar uma Aula Experimental gratuita?`
    );
    return `https://wa.me/${num}?text=${text}`;
  };

  const userInitials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "MP";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#070514] font-sans antialiased text-slate-200 selection:bg-indigo-500/30">
      
      {/* ── 1. SIDEBAR SAAS PREMIUM ULTRA SLIM & CLEAN ── */}
      <aside className="w-64 bg-[#0B091A] text-slate-400 flex flex-col shrink-0 select-none border-r border-indigo-950/40 shadow-2xl z-30">
        
        {/* LOGO PLATAFORMA */}
        <div className="p-6 flex items-center justify-between border-b border-indigo-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5B50E6] to-purple-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/30">
              <Music size={22} />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-base tracking-tight font-outfit leading-none">DancePro</span>
              <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest mt-1">CRM COMERCIAL</span>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO DE CATEGORIAS */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 text-xs no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          {/* GESTÃO COMERCIAL */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 pb-1">
              <Compass size={13} className="text-indigo-400" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Gestão Comercial</p>
            </div>

            <button
              onClick={() => setActiveMenu("leads")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "leads"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3"><Users size={16} /> Leads & Oportunidades</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-black text-white">{leadsDisplayList.length}</span>
            </button>

            <button
              onClick={() => setActiveMenu("pipeline")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "pipeline"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Layers size={16} /> Funil de Vendas (Kanban)
            </button>

            <button
              onClick={() => setActiveMenu("atividades")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "atividades"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <CalendarCheck size={16} /> Tarefas & Follow-ups
            </button>

            <button
              onClick={() => setActiveMenu("propostas")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "propostas"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <FileSpreadsheet size={16} /> Propostas & Fechamento
            </button>

            <button
              onClick={() => setActiveMenu("metas")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "metas"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Target size={16} /> Metas Comerciais
            </button>
          </div>

          {/* GESTÃO DE ALUNOS */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 pb-1">
              <Users size={13} className="text-blue-400" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Gestão de Alunos</p>
            </div>

            <button
              onClick={() => setActiveMenu("clientes")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "clientes"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Building2 size={16} /> Alunos Matriculados
            </button>

            <button
              onClick={() => setActiveMenu("onboarding")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "onboarding"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Rocket size={16} /> Onboarding de Alunos
            </button>

            <button
              onClick={() => setActiveMenu("suporte")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "suporte"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Headphones size={16} /> Atendimento & Suporte
            </button>
          </div>

          {/* RELATÓRIOS ANALÍTICOS */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 pb-1">
              <BarChart2 size={13} className="text-purple-400" />
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Relatórios Analíticos</p>
            </div>

            <button
              onClick={() => setActiveMenu("performance")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "performance"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <BarChart2 size={16} /> Performance de Vendas
            </button>

            <button
              onClick={() => setActiveMenu("origens")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all ${
                activeMenu === "origens"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border-l-4 border-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <PieChart size={16} /> Origem das Oportunidades
            </button>
          </div>

        </div>

        {/* FOOTER DA SIDEBAR */}
        <div className="p-3 border-t border-indigo-950/40 space-y-2 bg-[#080616]">
          <button
            onClick={() => setActiveMenu("configuracoes")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl font-bold text-xs transition-all ${
              activeMenu === "configuracoes" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Settings size={16} /> Configurações do Funil
          </button>

          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-md">
              {userInitials}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-bold text-white text-xs truncate">{user?.name || "DancePro Admin"}</p>
              <p className="text-[10px] text-slate-400 truncate">Escola Ativa</p>
            </div>
          </div>
        </div>

      </aside>

      {/* ── 2. CONTEÚDO PRINCIPAL DA APLICAÇÃO ── */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-[#070514]">
        
        {/* HEADER TOP DA PÁGINA */}
        <header className="sticky top-0 z-20 bg-[#070514]/90 backdrop-blur-md px-8 py-5 flex items-center justify-between border-b border-indigo-950/40">
          <div>
            <h1 className="text-2xl font-black font-outfit text-white tracking-tight flex items-center gap-2">
              {activeMenu === "leads" && <><Users className="text-indigo-400" size={24} /> Leads & Oportunidades</>}
              {activeMenu === "pipeline" && <><Layers className="text-purple-400" size={24} /> Funil de Vendas (Kanban)</>}
              {activeMenu === "atividades" && <><CalendarCheck className="text-cyan-400" size={24} /> Tarefas & Follow-ups</>}
              {activeMenu === "propostas" && <><FileSpreadsheet className="text-blue-400" size={24} /> Propostas & Fechamento</>}
              {activeMenu === "metas" && <><Target className="text-emerald-400" size={24} /> Metas Comerciais</>}
              {activeMenu === "clientes" && <><Building2 className="text-indigo-400" size={24} /> Alunos Matriculados</>}
              {activeMenu === "onboarding" && <><Rocket className="text-amber-400" size={24} /> Onboarding de Alunos</>}
              {activeMenu === "suporte" && <><Headphones className="text-rose-400" size={24} /> Atendimento & Suporte</>}
              {activeMenu === "performance" && <><BarChart2 className="text-purple-400" size={24} /> Performance de Vendas</>}
              {activeMenu === "origens" && <><PieChart className="text-emerald-400" size={24} /> Origem das Oportunidades</>}
              {activeMenu === "configuracoes" && <><Settings className="text-slate-400" size={24} /> Configurações Gerais</>}
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Gestão comercial inteligente e integrada para captação de alunos e aulas de dança.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs h-10 px-4 rounded-xl gap-2 shadow-lg shadow-indigo-600/30"
            >
              <Plus size={16} /> Novo Lead
            </Button>
          </div>
        </header>

        {/* ÁREA DE CONTEÚDO */}
        <main className="p-8 space-y-6">
          
          {/* ── 1. ABA: LEADS & OPORTUNIDADES ── */}
          {activeMenu === "leads" && (
            <div className="space-y-6">
              
              {/* TOP 4 KPI CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Leads</span>
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"><Users size={16} /></div>
                  </div>
                  <p className="text-3xl font-black font-outfit text-white tracking-tight">{totalLeadsCount}</p>
                  <p className="text-xs font-medium text-slate-400">Oportunidades em carteira</p>
                </div>

                <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Novos Leads</span>
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20"><UserPlus size={16} /></div>
                  </div>
                  <p className="text-3xl font-black font-outfit text-white tracking-tight">{newLeadsCount}</p>
                  <p className="text-xs font-medium text-slate-400">Aguardando 1º contato</p>
                </div>

                <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aulas Experimentais</span>
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"><Music size={16} /></div>
                  </div>
                  <p className="text-3xl font-black font-outfit text-white tracking-tight">{trialLessonsCount}</p>
                  <p className="text-xs font-medium text-slate-400">Em agendamento ou realizadas</p>
                </div>

                <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa de Conversão</span>
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><TrendingUp size={16} /></div>
                  </div>
                  <p className="text-3xl font-black font-outfit text-white tracking-tight">{conversionRate}%</p>
                  <p className="text-xs font-medium text-slate-400">Matrículas fechadas</p>
                </div>
              </div>

              {/* TOOLBAR DE BUSCA E FILTROS DINÂMICOS */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#110E29]/60 p-4 rounded-2xl border border-indigo-950/50">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative min-w-[240px] flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                      placeholder="Buscar por nome, telefone ou modalidade..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-10 text-xs bg-[#0B091A] border-indigo-950/80 text-white rounded-xl focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={selectedStageFilter}
                    onChange={(e) => setSelectedStageFilter(e.target.value)}
                    className="h-10 px-3 bg-[#0B091A] border border-indigo-950/80 text-xs text-white rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="todos">Todos os Estágios</option>
                    {DEFAULT_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>

                  <select
                    value={selectedInstrumentFilter}
                    onChange={(e) => setSelectedInstrumentFilter(e.target.value)}
                    className="h-10 px-3 bg-[#0B091A] border border-indigo-950/80 text-xs text-white rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="todos">Todos os Cursos</option>
                    <option value="Ballet">Ballet</option>
                    <option value="Zumba">Zumba</option>
                    <option value="Piano">Forró</option>
                    <option value="Hip-Hop">Hip-Hop</option>
                    <option value="Canto">Canto</option>
                    <option value="Salsa">Salsa</option>
                    <option value="Violino">Violino</option>
                  </select>
                </div>

                <Button
                  onClick={() => {
                    const csvContent = "data:text/csv;charset=utf-8," + ["Nome,Telefone,Email,Curso,Mensalidade,Estagio", ...leadsDisplayList.map((l: any) => `"${l.name}","${l.phone || ""}","${l.email || ""}","${l.instrument || ""}","${l.value || ""}","${l.stage}"`)].join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `leads_dancepro_${new Date().toISOString().slice(0, 10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    toast.success("Planilha de Leads baixada com sucesso!");
                  }}
                  variant="outline"
                  className="h-10 text-xs border-indigo-950 text-slate-300 hover:bg-white/5 rounded-xl gap-2 font-bold"
                >
                  <Download size={15} /> Exportar CSV
                </Button>
              </div>

              {/* TABELA DE LEADS */}
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0B091A] text-slate-400 uppercase font-black text-[10px] tracking-wider border-b border-indigo-950/50">
                      <tr>
                        <th className="py-3.5 px-4">Lead / Aluno</th>
                        <th className="py-3.5 px-4">Curso / Modalidade</th>
                        <th className="py-3.5 px-4">Modalidade</th>
                        <th className="py-3.5 px-4">Mensalidade</th>
                        <th className="py-3.5 px-4">Origem</th>
                        <th className="py-3.5 px-4">Status / Estágio</th>
                        <th className="py-3.5 px-4 text-right">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-950/40">
                      {leadsDisplayList.map((lead: any) => (
                        <tr key={lead.id} className="hover:bg-white/5 transition-colors group">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-md">
                                {lead.name ? lead.name[0].toUpperCase() : "L"}
                              </div>
                              <div>
                                <p onClick={() => { setSelectedLeadId(lead.id); setIsProfileModalOpen(true); }} className="font-bold text-white hover:text-indigo-300 cursor-pointer">
                                  {lead.name}
                                </p>
                                <p className="text-[11px] text-slate-400">{lead.phone || "Sem telefone"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[10px]">
                              💃 {lead.instrument || lead.productService || "Dança"}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 font-medium">{lead.modality || "Presencial"}</td>
                          <td className="py-3.5 px-4 font-black text-emerald-400">R$ {Number(lead.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</td>
                          <td className="py-3.5 px-4 text-slate-400"><span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold">{lead.source || "WhatsApp"}</span></td>
                          <td className="py-3.5 px-4">
                            <select
                              value={lead.stage}
                              onChange={(e) => moveStageMutation.mutate({ leadId: lead.id, stage: e.target.value })}
                              className="bg-[#0B091A] border border-indigo-950/80 rounded-lg px-2 py-1 text-[11px] font-bold text-white focus:outline-none focus:border-indigo-500"
                            >
                              {DEFAULT_STAGES.map((s) => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {lead.phone && (
                                <a
                                  href={getWhatsAppLink(lead.phone, lead.name, lead.instrument || lead.productService)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Enviar WhatsApp"
                                  className="p-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all"
                                >
                                  <MessageCircle size={14} />
                                </a>
                              )}
                              <button
                                onClick={() => { setTrialLead(lead); setIsTrialModalOpen(true); }}
                                title="Agendar Aula Experimental"
                                className="p-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white transition-all"
                              >
                                <Calendar size={14} />
                              </button>
                              <button
                                onClick={() => { setConvertLead(lead); setIsConvertToStudentModalOpen(true); }}
                                title="Matricular Aluno"
                                className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all"
                              >
                                <UserCheck size={14} />
                              </button>
                              <button
                                onClick={() => { setSelectedLeadId(lead.id); setIsProfileModalOpen(true); }}
                                title="Ver Perfil Detalhado"
                                className="p-1.5 rounded-lg bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ── 2. ABA: FUNIL DE VENDAS KANBAN ── */}
          {activeMenu === "pipeline" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex flex-wrap items-center justify-between border-b border-indigo-950/50 pb-4 gap-4">
                  <div>
                    <h3 className="font-bold text-lg font-outfit text-white">Funil Comercial de Aulas & Matrículas</h3>
                    <p className="text-xs text-slate-400">Jornada completa desde o 1º contato até a matrícula oficial.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => setIsCreateModalOpen(true)} className="h-9 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl gap-1.5">
                      <Plus size={14} /> Novo Lead
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3.5 overflow-x-auto pb-4">
                  {DEFAULT_STAGES.map((stg, sIndex) => {
                    const stageLeads = leadsDisplayList.filter((l: any) => l.stage === stg.key);
                    const totalVal = stageLeads.reduce((acc: number, curr: any) => acc + (parseFloat(String(curr.value || "0")) || 0), 0);
                    return (
                      <div key={stg.key} className="space-y-3 min-w-[220px] bg-[#0B091A] p-3 rounded-2xl border border-indigo-950/40">
                        <div className="space-y-1 px-1 border-b border-indigo-950/40 pb-2">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-white font-outfit truncate">{stg.label}</span>
                            <span className="text-indigo-400 font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/10">{stageLeads.length}</span>
                          </div>
                          <p className="text-[11px] font-extrabold text-slate-400">R$ {totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</p>
                        </div>

                        <div className="space-y-3">
                          {stageLeads.length === 0 ? (
                            <div className="p-5 text-center text-[11px] text-slate-500 italic">
                              Nenhum lead nesta etapa
                            </div>
                          ) : (
                            stageLeads.map((item: any) => (
                              <div key={item.id} className="bg-[#13102B] border border-indigo-950/80 rounded-xl p-3.5 space-y-2.5 shadow-md hover:border-indigo-500/60 transition-all group">
                                <div className="flex items-start justify-between">
                                  <h4 onClick={() => { setSelectedLeadId(item.id); setIsProfileModalOpen(true); }} className="font-bold text-xs text-white group-hover:text-indigo-300 cursor-pointer leading-snug">
                                    {item.name}
                                  </h4>
                                  {getPriorityBadge(item.temperature)}
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[9px] px-1.5 py-0">
                                    💃 {item.instrument || item.productService || "Dança"}
                                  </Badge>
                                  <span className="text-[10px] text-slate-400 font-medium">{item.modality || "Presencial"}</span>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-indigo-950/60 text-[11px]">
                                  <span className="font-black text-emerald-400">R$ {Number(item.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                                  <div className="flex items-center gap-1">
                                    {sIndex < DEFAULT_STAGES.length - 1 && (
                                      <button
                                        onClick={() => moveStageMutation.mutate({ leadId: item.id, stage: DEFAULT_STAGES[sIndex + 1].key })}
                                        title={`Avançar para ${DEFAULT_STAGES[sIndex + 1].label}`}
                                        className="p-1 rounded bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-bold flex items-center"
                                      >
                                        <ChevronRight size={13} />
                                      </button>
                                    )}
                                    {item.phone && (
                                      <a
                                        href={getWhatsAppLink(item.phone, item.name, item.instrument || item.productService)}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="WhatsApp"
                                        className="p-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all"
                                      >
                                        <MessageCircle size={13} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 3. ABA: TAREFAS & FOLLOW-UPS ── */}
          {activeMenu === "atividades" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Central de Tarefas & Follow-ups</h3>
                    <p className="text-xs text-slate-400">Agende ligações, mensagens de retorno e acompanhamentos de aulas experimentais.</p>
                  </div>
                  <Button onClick={() => setIsCreateFollowUpOpen(true)} className="h-9 px-3 text-xs bg-cyan-600 hover:bg-cyan-700 font-bold rounded-xl gap-1.5 text-white">
                    <Plus size={14} /> Novo Follow-up
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#0B091A] border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Hoje</p>
                    <p className="text-2xl font-black font-outfit text-cyan-400">{followUpStats.today} Pendentes</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0B091A] border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Próximos 7 Dias</p>
                    <p className="text-2xl font-black font-outfit text-purple-400">{followUpStats.next7} Agendados</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#0B091A] border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Concluídos este Mês</p>
                    <p className="text-2xl font-black font-outfit text-emerald-400">{followUpStats.done} Realizados</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(followUps as any[]).filter((entry) => !(entry.followUp ?? entry).completed).slice(0, 8).map((entry) => {
                    const f = entry.followUp ?? entry;
                    return (
                      <div key={f.id} className="flex items-center justify-between p-4 rounded-xl bg-[#0B091A] border border-indigo-950/50 hover:border-cyan-500/40 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                            {f.contactType === "whatsapp" ? <MessageSquare size={16} /> : <PhoneCall size={16} />}
                          </div>
                          <div>
                            <p className="font-bold text-xs text-white">{f.title}</p>
                            <p className="text-[11px] text-slate-400">{entry.leadName || "Lead"} • <span className="text-cyan-400 font-bold">{new Date(f.dueDate).toLocaleDateString("pt-BR")}{(f.dueTime ? " às " + f.dueTime : "")}</span></p>
                          </div>
                        </div>
                        <Button
                          onClick={() => completeFollowUpMutation.mutate({ followUpId: f.id })}
                          disabled={completeFollowUpMutation.isPending}
                          className="h-8 px-3 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white font-bold rounded-lg gap-1"
                        >
                          <Check size={14} /> Concluir
                        </Button>
                      </div>
                    );
                  })}
                  {(followUps as any[]).filter((entry) => !(entry.followUp ?? entry).completed).length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">Nenhum follow-up pendente. Crie um novo acima.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 4. ABA: PROPOSTAS & FECHAMENTO ── */}
          {activeMenu === "propostas" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Propostas Comerciais & Fechamentos</h3>
                    <p className="text-xs text-slate-400">Acompanhe orçamentos enviados e links de contratos digitais.</p>
                  </div>
                  <span className="text-[11px] text-slate-400 font-bold bg-[#0B091A] px-3 py-2 rounded-xl border border-indigo-950/60">
                    Mova um lead para a etapa "Proposta" no funil
                  </span>
                </div>

                {crmStats.proposed.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma proposta em aberto. Mova um lead para a etapa "Proposta" no funil.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {crmStats.proposed.map((lead: any) => (
                      <div key={lead.id} className="p-5 rounded-2xl bg-[#0B091A] border border-indigo-950/60 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-bold text-sm text-white font-outfit">{lead.name}</h4>
                            <p className="text-[11px] text-indigo-300 font-bold mt-0.5">{lead.instrument || lead.productService || "Dança"}</p>
                          </div>
                          <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20 text-[9px]">Proposta enviada</Badge>
                        </div>

                        <div className="space-y-1 bg-[#13102B] p-3 rounded-xl border border-indigo-950/80 text-xs">
                          <p className="text-slate-400 text-[10px] font-bold uppercase">Mensalidade proposta</p>
                          <p className="text-emerald-400 font-black text-sm pt-1">R$ {Number(lead.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-indigo-950/50 text-xs">
                          <span className="text-[11px] text-slate-500">{lead.updatedAt ? "Atualizado " + new Date(lead.updatedAt).toLocaleDateString("pt-BR") : ""}</span>
                          <Button
                            onClick={() => {
                              const digits = String(lead.phone || "").replace(/\D/g, "");
                              if (!digits) { toast.error("Lead sem telefone cadastrado."); return; }
                              window.open("https://wa.me/55" + digits, "_blank");
                            }}
                            className="h-7 px-2 text-[11px] bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg"
                          >
                            Falar no WhatsApp
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 5. ABA: METAS COMERCIAIS ── */}
          {activeMenu === "metas" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Metas Comerciais do Mês</h3>
                    <p className="text-xs text-slate-400">Acompanhamento do plano de expansão e matrículas da escola de dança.</p>
                  </div>
                  <Button onClick={() => setIsGoalsModalOpen(true)} className="h-9 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl gap-1.5 text-white">
                    <Edit3 size={14} /> Ajustar Metas
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { label: "Novas Matrículas", actual: crmStats.closed.length, target: Number(goals?.targetNewStudents ?? 0), color: "from-indigo-500 to-emerald-500", text: "text-emerald-400" as const, money: false },
                    { label: "Aulas Experimentais", actual: crmStats.demos.length, target: Number(goals?.targetDemos ?? 0), color: "from-cyan-500 to-blue-500", text: "text-cyan-400" as const, money: false },
                    { label: "Propostas Comerciais Enviadas", actual: crmStats.proposed.length, target: Number(goals?.targetProposals ?? 0), color: "from-purple-500 to-rose-500", text: "text-purple-400" as const, money: false },
                    { label: "Nova Receita Recorrente (MRR)", actual: crmStats.closed.reduce((a: number, l: any) => a + Number(l.value || 0), 0), target: Number(goals?.targetMrr ?? 0), color: "from-emerald-500 to-teal-400", text: "text-emerald-400" as const, money: true },
                  ].map((meta) => {
                    const pct = meta.target > 0 ? Math.min(100, Math.round((meta.actual / meta.target) * 100)) : 0;
                    const progressLabel = meta.money
                      ? "R$ " + meta.actual.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " de R$ " + meta.target.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " (" + pct + "%)"
                      : meta.actual + " de " + meta.target + " (" + pct + "%)";
                    const hint = meta.target === 0
                      ? "Defina uma meta em Ajustar Metas."
                      : (pct >= 100 ? "Meta batida!" : "Faltam " + (meta.money
                          ? "R$ " + (meta.target - meta.actual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                          : Math.max(0, meta.target - meta.actual)) + " para a meta mensal.");
                    return (
                      <div key={meta.label} className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300">{meta.label}</span>
                          <span className={"text-xs font-black " + meta.text}>{progressLabel}</span>
                        </div>
                        <div className="w-full bg-[#13102B] h-3 rounded-full overflow-hidden border border-indigo-950/60">
                          <div className={"bg-gradient-to-r " + meta.color + " h-full rounded-full"} style={{ width: pct + "%" }} />
                        </div>
                        <p className="text-[11px] text-slate-400">{hint}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 6. ABA: ALUNOS MATRICULADOS ── */}
          {activeMenu === "clientes" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Alunos Matriculados via CRM</h3>
                    <p className="text-xs text-slate-400">Histórico de alunos captados pelo funil de vendas e contratos ativos.</p>
                  </div>
                  <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    Total: {closedCount} Alunos Convertidos
                  </span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-[#0B091A] text-slate-400 uppercase font-black text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3.5">Aluno</th>
                        <th className="p-3.5">Curso / Modalidade</th>
                        <th className="p-3.5">Modalidade</th>
                        <th className="p-3.5">Mensalidade</th>
                        <th className="p-3.5">Origem</th>
                        <th className="p-3.5">Status Contrato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-950/40">
                      {leadsDisplayList.filter((l: any) => l.stage === "fechado" || l.stage === "matriculado").map((item: any) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-3.5 font-bold text-white flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 text-white font-bold flex items-center justify-center text-xs shadow-md">
                              {item.name ? item.name[0].toUpperCase() : "A"}
                            </div>
                            <div>
                              <p className="leading-snug">{item.name}</p>
                              <p className="text-[11px] text-slate-400 font-normal">{item.phone || "—"}</p>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-300 font-medium">{item.instrument || item.productService || "Dança"}</td>
                          <td className="p-3.5 text-slate-300">{item.modality || "Presencial"}</td>
                          <td className="p-3.5 font-black text-emerald-400">R$ {Number(item.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</td>
                          <td className="p-3.5 text-slate-400">{item.source || "WhatsApp"}</td>
                          <td className="p-3.5">
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                              ✓ Ativo / Assinado
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── 7. ABA: ONBOARDING DE ALUNOS ── */}
          {activeMenu === "onboarding" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Onboarding & Primeiros Passos do Aluno</h3>
                    <p className="text-xs text-slate-400">Checklist essencial para garantir a retenção e encantamento do aluno na primeira semana.</p>
                  </div>
                </div>

                {crmStats.closed.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhum aluno matriculado pelo CRM ainda. Feche um lead no funil para iniciar o onboarding.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {crmStats.closed.map((lead: any) => ({
                    id: String(lead.id),
                    name: lead.name,
                    phone: lead.phone,
                    inst: lead.instrument || lead.productService || "Dança",
                    start: lead.updatedAt ? "Fechado em " + new Date(lead.updatedAt).toLocaleDateString("pt-BR") : "Matriculado",
                  })).map((std: any) => (
                    <div key={std.id} className="bg-[#0B091A] border border-indigo-950/50 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-white font-outfit">{std.name}</h4>
                          <p className="text-xs text-indigo-400 font-bold mt-0.5">Curso de {std.inst} • {std.start}</p>
                        </div>
                        <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[10px]">Em Onboarding</Badge>
                      </div>

                      <div className="space-y-2.5 text-xs bg-[#13102B] p-3.5 rounded-xl border border-indigo-950/70">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!onboardingChecks[`${std.id}_contract`]}
                            onChange={(e) => setOnboardingChecks({ ...onboardingChecks, [`${std.id}_contract`]: e.target.checked })}
                            className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-indigo-950 focus:ring-0"
                          />
                          <span className={onboardingChecks[`${std.id}_contract`] ? "line-through text-slate-500" : "text-white font-medium"}>
                            Contrato Digital Assinado
                          </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!onboardingChecks[`${std.id}_class`]}
                            onChange={(e) => setOnboardingChecks({ ...onboardingChecks, [`${std.id}_class`]: e.target.checked })}
                            className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-indigo-950 focus:ring-0"
                          />
                          <span className={onboardingChecks[`${std.id}_class`] ? "line-through text-slate-500" : "text-white font-medium"}>
                            1ª Aula Agendada na Grade do Professor
                          </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!onboardingChecks[`${std.id}_material`]}
                            onChange={(e) => setOnboardingChecks({ ...onboardingChecks, [`${std.id}_material`]: e.target.checked })}
                            className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-indigo-950 focus:ring-0"
                          />
                          <span className={onboardingChecks[`${std.id}_material`] ? "line-through text-slate-500" : "text-white font-medium"}>
                            Kit de Boas-Vindas & Acesso ao App do Aluno Liberado
                          </span>
                        </label>
                      </div>

                      <Button
                        onClick={() => {
                          const digits = String(std.phone || "").replace(/\D/g, "");
                          if (!digits) { toast.error("Aluno sem telefone cadastrado."); return; }
                          const msg = encodeURIComponent("Olá " + std.name + "! Seja bem-vinda(o) à escola! 💃 Qualquer dúvida sobre horários, app do aluno ou materiais, é só chamar por aqui.");
                          window.open("https://wa.me/55" + digits + "?text=" + msg, "_blank");
                        }}
                        className="w-full h-8 text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white font-bold rounded-xl gap-2"
                      >
                        <Send size={13} /> Enviar Mensagem de Boas-Vindas
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── 8. ABA: ATENDIMENTO & SUPORTE ── */}
          {activeMenu === "suporte" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Central de Atendimento & Dúvidas de Leads</h3>
                    <p className="text-xs text-slate-400">Responda rapidamente a dúvidas sobre horários, métodos e valores.</p>
                  </div>
                </div>

                <div className="text-center py-10 space-y-2">
                  <MessageCircle size={28} className="mx-auto text-emerald-500/60" />
                  <p className="text-xs text-slate-400 font-bold">As conversas de WhatsApp ficam centralizadas no seu número conectado.</p>
                  <p className="text-[11px] text-slate-500">Use o perfil do lead (botão de WhatsApp) para iniciar uma conversa ou configure o robô em Configurações &gt; Meu WhatsApp.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── 9. ABA: PERFORMANCE DE VENDAS ── */}
          {activeMenu === "performance" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Performance Comercial & Ciclo de Vendas</h3>
                    <p className="text-xs text-slate-400">Análise de eficiência de conversão e tempo de fechamento.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Leads no Funil</p>
                    <p className="text-3xl font-black font-outfit text-white">{crmStats.total - crmStats.closed.length}</p>
                    <p className="text-[11px] text-slate-400 font-bold">Oportunidades em andamento</p>
                  </div>

                  <div className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Taxa de Conversão</p>
                    <p className="text-3xl font-black font-outfit text-white">{crmStats.conv}%</p>
                    <p className="text-[11px] text-indigo-400 font-bold">Leads que fecharam matrícula</p>
                  </div>

                  <div className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Ticket Médio de Mensalidade</p>
                    <p className="text-3xl font-black font-outfit text-white">R$ {crmStats.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-[11px] text-purple-400 font-bold">Média dos alunos fechados</p>
                  </div>
                </div>

                {/* RANKING DE INSTRUMENTOS MAIS PROCURADOS */}
                <div className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-4">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider">Cursos Mais Procurados no CRM</h4>
                  <div className="space-y-3">
                    {Array.from(crmStats.byCourse.entries())
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map((entry) => {
                        const inst = entry[0];
                        const count = entry[1];
                        const pct = crmStats.total > 0 ? Math.round((count / crmStats.total) * 100) : 0;
                        return (
                          <div key={inst} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-300">{inst}</span>
                              <span className="text-slate-400 font-bold">{count} leads ({pct}%)</span>
                            </div>
                            <div className="w-full bg-[#13102B] h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-500 h-full rounded-full" style={{ width: pct + "%" }} />
                            </div>
                          </div>
                        );
                      })}
                    {crmStats.total === 0 && (
                      <p className="text-xs text-slate-500 text-center py-4">Sem leads cadastrados ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 10. ABA: ORIGEM DAS OPORTUNIDADES ── */}
          {activeMenu === "origens" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Canais de Aquisição & Origem dos Leads</h3>
                    <p className="text-xs text-slate-400">Descubra quais canais trazem mais alunos e maior faturamento.</p>
                  </div>
                </div>

                {crmStats.bySource.size === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Sem leads cadastrados ainda.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from(crmStats.bySource.entries())
                      .sort((a, b) => b[1].count - a[1].count)
                      .map((entry) => {
                        const source = entry[0];
                        const stats = entry[1];
                        return (
                          <div key={source} className="bg-[#0B091A] p-5 rounded-2xl border border-indigo-950/50 space-y-3">
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{source}</span>
                            <p className="text-2xl font-black font-outfit text-white">{stats.count} leads</p>
                            <p className="text-xs font-bold text-emerald-400">R$ {stats.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês em matrículas</p>
                            <p className="text-[11px] text-slate-400 border-t border-indigo-950/50 pt-2">
                              {stats.count > 0 ? Math.round((stats.closed / stats.count) * 100) : 0}% de conversão ({stats.closed} fechados)
                            </p>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 11. ABA: CONFIGURAÇÕES GERAIS ── */}
          {activeMenu === "configuracoes" && (
            <div className="space-y-6">
              <div className="bg-[#110E29]/80 border border-indigo-950/50 rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-950/50 pb-4">
                  <div>
                    <h3 className="font-bold text-base font-outfit text-white">Configurações do Funil & CRM</h3>
                    <p className="text-xs text-slate-400">Personalize canais de captação, tags de classificação e regras de negócios.</p>
                  </div>
                  <Button
                    onClick={() => updateSettingsMutation.mutate({
                      customOrigins: (originsInput || (crmSettingsData?.customOrigins || []).join(", "))
                        .split(",").map((s) => s.trim()).filter(Boolean),
                      customLossReasons: crmSettingsData?.customLossReasons || [],
                      customTags: crmSettingsData?.customTags || [],
                    })}
                    disabled={updateSettingsMutation.isPending}
                    className="h-9 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl text-white"
                  >
                    {updateSettingsMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  <div className="space-y-2 bg-[#0B091A] p-4 rounded-xl border border-indigo-950/50">
                    <label className="font-bold text-white">Canais de Origem Personalizados</label>
                    <p className="text-[11px] text-slate-400">Separados por vírgula</p>
                    <Input
                      value={originsInput || (crmSettingsData?.customOrigins || []).join(", ")}
                      onChange={(e) => setOriginsInput(e.target.value)}
                      className="bg-[#13102B] border-indigo-950 text-white"
                    />
                  </div>

                  <div className="space-y-2 bg-[#0B091A] p-4 rounded-xl border border-indigo-950/50">
                    <label className="font-bold text-white">Motivos de Perda Cadastrados</label>
                    <p className="text-[11px] text-slate-400">Opções para quando um lead desistir</p>
                    <Input
                      value={(crmSettingsData?.customLossReasons || []).join(", ")}
                      readOnly
                      className="bg-[#13102B] border-indigo-950 text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── MODAIS ── */}
      <CreateLeadModal open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      {selectedLeadId && (
        <LeadProfileModal leadId={selectedLeadId} open={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} onDelete={(id: number) => deleteLeadMutation.mutate({ leadId: id })} />
      )}
      {trialLead && (
        <ScheduleTrialModal lead={trialLead} open={isTrialModalOpen} onClose={() => { setIsTrialModalOpen(false); setTrialLead(null); }} />
      )}
      {convertLead && (
        <ConvertToStudentModal lead={convertLead} open={isConvertToStudentModalOpen} onClose={() => { setIsConvertToStudentModalOpen(false); setConvertLead(null); }} />
      )}
      <CreateFollowUpModal open={isCreateFollowUpOpen} onClose={() => setIsCreateFollowUpOpen(false)} />
      <GoalsModal open={isGoalsModalOpen} onClose={() => setIsGoalsModalOpen(false)} />
    </div>
  );
}

// ── MODAL: CADASTRAR NOVO LEAD ──
function CreateLeadModal({ open, onClose }: any) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instrument, setInstrument] = useState("Ballet");
  const [level, setLevel] = useState("Iniciante");
  const [modality, setModality] = useState("Presencial");
  const [value, setValue] = useState("320");
  const [source, setSource] = useState("WhatsApp");

  const createMutation = trpc.crm.createLead.useMutation({
    onSuccess: () => {
      toast.success("Lead cadastrado com sucesso!");
      onClose();
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-base text-white flex items-center gap-2">
            <Music className="text-indigo-400" size={18} /> Cadastrar Lead para Aula de Dança
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name) return toast.error("Preencha o nome do lead");
            createMutation.mutate({
              name,
              phone,
              email,
              instrument,
              productService: instrument,
              level,
              modality,
              value: Number(value),
              source,
            });
          }}
          className="space-y-3.5 py-2"
        >
          <div className="space-y-1">
            <label className="font-bold text-slate-400">Nome do Lead / Futuro Aluno *</label>
            <Input placeholder="Ex: Mariana Silva" value={name} onChange={(e) => setName(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Telefone / WhatsApp *</label>
              <Input placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-400">E-mail</label>
              <Input placeholder="aluno@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Modalidade de Interesse</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Ballet">Ballet</option>
                <option value="Zumba">Zumba</option>
                <option value="Hip-Hop">Hip-Hop</option>
                <option value="Forró">Forró</option>
                <option value="Canto / Técnica Vocal">Canto / Técnica Vocal</option>
                <option value="Salsa">Salsa</option>
                <option value="Violino">Violino</option>
                <option value="Baixo">Baixo</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-400">Modalidade</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Presencial">Presencial</option>
                <option value="Online">Online</option>
                <option value="Híbrido">Híbrido</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Origem do Lead</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Instagram">Instagram</option>
                <option value="Google">Google</option>
                <option value="Indicação">Indicação</option>
                <option value="Site">Site</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-400">Mensalidade Estimada (R$)</label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300 hover:bg-white/5">Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending} className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {createMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />} Cadastrar Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL: AGENDAR AULA EXPERIMENTAL ──
function ScheduleTrialModal({ lead, open, onClose }: any) {
  const utils = trpc.useUtils();
  const [trialDate, setTrialDate] = useState(new Date().toISOString().slice(0, 10));
  const [trialTime, setTrialTime] = useState("14:00");

  const moveStageMutation = trpc.crm.moveStage.useMutation({
    onSuccess: () => {
      toast.success(`🎸 Aula experimental de ${lead?.name} agendada para ${trialDate} às ${trialTime}!`);
      utils.crm.listLeads.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-base text-white flex items-center gap-2">
            <Calendar className="text-cyan-400" size={18} /> Agendar Aula Experimental
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            moveStageMutation.mutate({ leadId: lead.id, stage: "aula_experimental" });
          }}
          className="space-y-3 py-2"
        >
          <p className="text-slate-300">
            Confirme o agendamento da aula experimental para <strong className="text-white">{lead?.name}</strong> ({lead?.instrument || "Dança"}).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Data da Aula</label>
              <Input type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Horário</label>
              <Input type="time" value={trialTime} onChange={(e) => setTrialTime(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300 hover:bg-white/5">Cancelar</Button>
            <Button type="submit" disabled={moveStageMutation.isPending} className="h-9 text-xs bg-cyan-600 hover:bg-cyan-700 text-white font-bold">
              {moveStageMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />} Confirmar Agendamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL: CONVERTER EM ALUNO ──
function ConvertToStudentModal({ lead, open, onClose }: any) {
  const utils = trpc.useUtils();
  const [monthlyFee, setMonthlyFee] = useState(lead?.value || "320");
  const [dueDay, setDueDay] = useState(10);

  const convertMutation = trpc.crm.convertToStudent.useMutation({
    onSuccess: () => {
      toast.success(`🎉 ${lead?.name} matriculado com sucesso como Aluno!`);
      utils.crm.listLeads.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-base text-white flex items-center gap-2">
            <UserCheck className="text-emerald-400" size={18} /> Efetivar Matrícula do Aluno
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            convertMutation.mutate({
              leadId: lead.id,
              monthlyFee: Number(monthlyFee),
              dueDay: Number(dueDay),
            });
          }}
          className="space-y-3.5 py-2"
        >
          <p className="text-slate-300">
            Você está matriculando <strong className="text-white">{lead?.name}</strong> no curso de <strong className="text-indigo-300">{lead?.instrument || "Dança"}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Mensalidade (R$)</label>
              <Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Dia de Vencimento</label>
              <select
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white focus:outline-none"
              >
                <option value={5}>Todo dia 05</option>
                <option value={10}>Todo dia 10</option>
                <option value={15}>Todo dia 15</option>
                <option value={20}>Todo dia 20</option>
              </select>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300 hover:bg-white/5">Cancelar</Button>
            <Button type="submit" disabled={convertMutation.isPending} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              {convertMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />} Concluir Matrícula
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL: CRIAR FOLLOW-UP ──
function CreateFollowUpModal({ open, onClose }: any) {
  const utils = trpc.useUtils();
  const { data: dbLeads = [] } = trpc.crm.listLeads.useQuery({});
  const [leadId, setLeadId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactType, setContactType] = useState<"whatsapp" | "ligacao">("whatsapp");
  const createMutation = trpc.crm.createFollowUp.useMutation({
    onSuccess: () => {
      toast.success("Follow-up agendado!");
      utils.crm.listFollowUps.invalidate();
      utils.crm.getDashboardMetrics.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-base text-white flex items-center gap-2">
            <CalendarCheck className="text-cyan-400" size={18} /> Novo Follow-up Comercial
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!leadId) { toast.error("Selecione o lead do follow-up."); return; }
            createMutation.mutate({
              leadId: Number(leadId),
              title,
              dueDate,
              contactType,
            });
          }}
          className="space-y-3 py-2"
        >
          <div className="space-y-1">
            <label className="font-bold text-slate-400">Lead</label>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              required
              className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white focus:outline-none"
            >
              <option value="">Selecione o lead...</option>
              {(dbLeads as any[]).map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-400">Descrição da Tarefa</label>
            <Input placeholder="Ex: Enviar proposta de violão" value={title} onChange={(e) => setTitle(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Data de Retorno</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-400">Tipo de Contato</label>
              <select
                value={contactType}
                onChange={(e: any) => setContactType(e.target.value)}
                className="w-full h-9 rounded-md bg-[#0B091A] border border-indigo-950 px-2.5 text-xs text-white"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="ligacao">Ligação Telefônica</option>
              </select>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300">Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending} className="h-9 text-xs bg-cyan-600 hover:bg-cyan-700 text-white font-bold">
              {createMutation.isPending ? "Agendando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL: AJUSTAR METAS COMERCIAIS ──
function GoalsModal({ open, onClose }: any) {
  const utils = trpc.useUtils();
  const { data: goals } = trpc.crm.getGoals.useQuery();
  const [studentsGoal, setStudentsGoal] = useState("");
  const [demosGoal, setDemosGoal] = useState("");
  const [mrrGoal, setMrrGoal] = useState("");
  const saveGoalMutation = trpc.crm.saveGoal.useMutation({
    onSuccess: () => {
      toast.success("Metas salvas!");
      utils.crm.getGoals.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-base text-white flex items-center gap-2">
            <Target className="text-emerald-400" size={18} /> Ajustar Metas do Mês
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveGoalMutation.mutate({
              targetNewStudents: Number(studentsGoal || goals?.targetNewStudents || 0),
              targetDemos: Number(demosGoal || goals?.targetDemos || 0),
              targetProposals: Number(goals?.targetProposals || 0),
              targetDeals: Number(goals?.targetDeals || 0),
              targetMrr: String(mrrGoal || goals?.targetMrr || "0"),
            });
          }}
          className="space-y-3.5 py-2"
        >
          <div className="space-y-1">
            <label className="font-bold text-slate-400">Meta de Novas Matrículas (Alunos)</label>
            <Input type="number" placeholder={String(goals?.targetNewStudents ?? 10)} value={studentsGoal} onChange={(e) => setStudentsGoal(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-400">Meta de Aulas Experimentais</label>
            <Input type="number" placeholder={String(goals?.targetDemos ?? 25)} value={demosGoal} onChange={(e) => setDemosGoal(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-400">Meta de Novo MRR em R$</label>
            <Input type="number" placeholder={String(goals?.targetMrr ?? "2000")} value={mrrGoal} onChange={(e) => setMrrGoal(e.target.value)} className="h-9 text-xs bg-[#0B091A] border-indigo-950 text-white" />
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300">Cancelar</Button>
            <Button type="submit" disabled={saveGoalMutation.isPending} className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {saveGoalMutation.isPending ? "Salvando..." : "Salvar Metas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── MODAL: PERFIL DO LEAD ──
function LeadProfileModal({ leadId, open, onClose, onDelete }: any) {
  const { data: dbLeads = [] } = trpc.crm.listLeads.useQuery({});
  const allLeads = dbLeads;
  const lead = (allLeads as any[]).find((l: any) => l.id === leadId);

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-[#110E29] text-slate-200 border border-indigo-950/80 text-xs">
        <DialogHeader>
          <DialogTitle className="font-outfit font-bold text-lg text-white flex items-center justify-between">
            <span>{lead.name}</span>
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
              💃 {lead.instrument || lead.productService || "Dança"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 bg-[#0B091A] p-3.5 rounded-xl border border-indigo-950/60">
            <div><p className="text-[10px] text-slate-400 font-bold uppercase">Telefone / WhatsApp</p><p className="font-bold text-white mt-0.5">{lead.phone || "Não informado"}</p></div>
            <div><p className="text-[10px] text-slate-400 font-bold uppercase">E-mail</p><p className="font-bold text-white mt-0.5">{lead.email || "Não informado"}</p></div>
            <div><p className="text-[10px] text-slate-400 font-bold uppercase">Modalidade</p><p className="font-bold text-white mt-0.5">{lead.modality || "Presencial"}</p></div>
            <div><p className="text-[10px] text-slate-400 font-bold uppercase">Mensalidade Proposta</p><p className="font-extrabold text-emerald-400 mt-0.5">R$ {Number(lead.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês</p></div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-indigo-950/60">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm(`Deseja realmente excluir o lead "${lead.name}"?`)) {
                  onDelete(lead.id);
                }
              }}
              className="h-9 text-xs border-rose-900/50 text-rose-400 hover:bg-rose-900/20 gap-1.5"
            >
              <Trash2 size={14} /> Excluir Lead
            </Button>
            <Button variant="outline" onClick={onClose} className="h-9 text-xs border-indigo-950 text-slate-300 hover:bg-white/5">Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

