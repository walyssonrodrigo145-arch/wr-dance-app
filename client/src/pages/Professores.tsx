import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { formatBRL } from "@/lib/money";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2, Plus, Trash2, Edit2, Mail, GraduationCap,
  Lock, Phone, Star, DollarSign, Shield, Info, KeyRound,
  CheckCircle2, Users, Camera, Copy, MessageCircle, FileText,
  CalendarCheck, BookOpen, ShieldAlert, LayoutDashboard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PaymentRulesDialog } from "@/components/professores/PaymentRulesDialog";
import { EvaluacoesTab } from "@/components/professores/EvaluacoesTab";
import { DASHBOARD_WIDGETS, ALL_WIDGET_IDS, parseWidgetList } from "@shared/dashboardWidgets";

const AVAILABLE_PERMISSIONS = [
  { id: "/dashboard", label: "Dashboard", icon: "📊" },
  { id: "/alunos", label: "Alunos", icon: "👨‍🎓" },
  { id: "/aulas", label: "Aulas", icon: "📅" },
  { id: "/instrumentos", label: "Instrumentos", icon: "🎸" },
  { id: "/relatorios", label: "Relatórios", icon: "📈" },
  { id: "/lembretes", label: "Lembretes", icon: "🔔" },
  { id: "/comunicados", label: "Comunicados", icon: "📢" },
  { id: "/solicitacoes", label: "Solicitações", icon: "📋" },
  { id: "/automacoes", label: "Automações", icon: "🤖" },
  { id: "/ia", label: "IA Assistente", icon: "✨" },
  { id: "/progresso", label: "Progresso", icon: "🎯" },
  { id: "/financeiro", label: "Financeiro", icon: "💰" },
  { id: "/folha", label: "Folha de Pagto", icon: "💼" },
  { id: "/recepcao-qr", label: "Recepção QR", icon: "📷" },
  { id: "/configuracoes", label: "Configurações", icon: "⚙️" },
];

const DATA_PERMISSIONS = [
  { id: "alunos_editar", label: "Editar dados dos alunos", desc: "Permite editar, excluir e alterar status dos alunos" },
  { id: "alunos_mensalidade", label: "Ver valor da mensalidade", desc: "Exibe a coluna de mensalidade na lista de alunos" },
];

function daysAgoLabel(d?: string | Date | null): string {
  if (!d) return "Nunca acessou";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `há ${days} dias`;
}

function accessColor(d?: string | Date | null): string {
  if (!d) return "text-rose-500";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 1) return "text-emerald-500";
  if (days <= 7) return "text-amber-500";
  return "text-rose-500";
}

function formatPhone(value: string): string {
  let clean = value.replace(/\D/g, "");
  if (!clean) return "";
  let prefix = "";
  if (clean.startsWith("55") && clean.length > 11) { prefix = "+55 "; clean = clean.substring(2); }
  if (clean.length > 10) return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
  if (clean.length > 6) return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  if (clean.length > 2) return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  return prefix + clean;
}

export default function Professores() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // ── Guarda: SOMENTE admin (professor não acessa — nem rota, nem backend) ──
  if (!loading && !user) { setLocation("/login"); return null; }
  if (!loading && user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-20 gap-4">
        <ShieldAlert size={48} className="text-destructive" />
        <h1 className="text-2xl font-black">Acesso Negado</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          Esta área é restrita ao administrador da escola.
        </p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Voltar ao painel</Button>
      </div>
    );
  }
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-primary" size={32} /></div>;

  return <ProfessoresPanel />;
}

function ProfessoresPanel() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.professores.overview.useQuery();
  const professores = data?.professores ?? [];
  const kpis = data?.kpis ?? { totalProfessores: 0, alunosAtivos: 0, aulasMes: 0, custoMes: 0 };

  const [search, setSearch] = useState("");
  const [filterEsp, setFilterEsp] = useState("all");
  const [rulesProf, setRulesProf] = useState<any>(null);
  const [view, setView] = useState<"professores" | "avaliacoes">("professores");

  // ── Form / Modal ──
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefone, setTelefone] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [foto, setFoto] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["/dashboard", "/alunos", "/aulas"]);
  const [dashboardWidgets, setDashboardWidgets] = useState<string[]>(ALL_WIDGET_IDS);
  const [paymentType, setPaymentType] = useState<"fixo" | "porcentagem">("fixo");
  const [hourlyRate, setHourlyRate] = useState("");
  const [paymentPercentage, setPaymentPercentage] = useState("");

  const isGmail = email.trim().toLowerCase().endsWith("@gmail.com");

  const createMutation = trpc.professores.create.useMutation({
    onSuccess: () => {
      toast.success("Professor cadastrado com sucesso!");
      utils.professores.overview.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.professores.update.useMutation({
    onSuccess: () => {
      toast.success("Professor atualizado com sucesso!");
      utils.professores.overview.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.professores.delete.useMutation({
    onSuccess: () => {
      toast.success("Professor removido com sucesso!");
      utils.professores.overview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setName(""); setEmail(""); setPassword(""); setTelefone("");
    setEspecialidade(""); setFoto(""); setPermissions(["/dashboard", "/alunos", "/aulas"]);
    setDashboardWidgets(ALL_WIDGET_IDS);
    setPaymentType("fixo"); setHourlyRate(""); setPaymentPercentage("");
    setEditingId(null);
  };

  const handleOpenEdit = (prof: any) => {
    setEditingId(prof.id);
    setName(prof.name || "");
    setEmail(prof.email || "");
    setPassword("");
    setTelefone(prof.telefone || "");
    setEspecialidade(prof.especialidade || "");
    setFoto(prof.foto || "");
    setPermissions(prof.permissions || []);
    const parsedWidgets = parseWidgetList(prof.dashboardWidgets);
    setDashboardWidgets(parsedWidgets.length > 0 ? parsedWidgets : ALL_WIDGET_IDS);
    setPaymentType(prof.paymentType || "fixo");
    setHourlyRate(prof.hourlyRate || "");
    setPaymentPercentage(prof.paymentPercentage || "");
    setIsOpen(true);
  };

  const handleSave = () => {
    if (!name || !email) {
      toast.error("Nome e E-mail são obrigatórios");
      return;
    }
    if (!editingId && !isGmail && !password) {
      toast.error("Senha é obrigatória para professores que não usam Gmail");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId, name, telefone, especialidade, foto,
        password: password || undefined,
        permissions, dashboardWidgets, paymentType, hourlyRate, paymentPercentage,
      });
    } else {
      createMutation.mutate({
        name, email,
        password: isGmail ? `google_oauth_${Date.now()}` : password,
        telefone, especialidade, foto, permissions, dashboardWidgets, paymentType, hourlyRate, paymentPercentage,
      });
    }
  };

  const togglePermission = (id: string) => {
    setPermissions((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleDashboardWidget = (id: string) => {
    setDashboardWidgets((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  };

  const copyPhone = async (phone: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(phone);
      else {
        const ta = document.createElement("textarea");
        ta.value = phone; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      toast.success(`Telefone copiado: ${phone}`);
    } catch {
      toast.error("Não foi possível copiar o telefone.");
    }
  };

  // ── Filtros ──
  const especialidades = useMemo(
    () => Array.from(new Set(professores.flatMap((p) => (p.especialidade ? p.especialidade.split(",").map((s: string) => s.trim()) : [])))),
    [professores]
  );
  const filtered = professores.filter((p) => {
    const matchSearch =
      !search.trim() ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      (p.especialidade || "").toLowerCase().includes(search.toLowerCase());
    const matchEsp = filterEsp === "all" || (p.especialidade || "").split(",").map((s: string) => s.trim()).includes(filterEsp);
    return matchSearch && matchEsp;
  });

  const KPI_CARDS = [
    { label: "Professores", value: String(kpis.totalProfessores), icon: <Users size={20} className="text-indigo-500" />, box: "bg-indigo-500/10" },
    { label: "Alunos ativos", value: String(kpis.alunosAtivos), icon: <BookOpen size={20} className="text-emerald-500" />, box: "bg-emerald-500/10" },
    { label: "Aulas no mês", value: String(kpis.aulasMes), icon: <CalendarCheck size={20} className="text-blue-500" />, box: "bg-blue-500/10" },
    { label: "Custo da equipe (mês)", value: formatBRL(kpis.custoMes), icon: <DollarSign size={20} className="text-rose-500" />, box: "bg-rose-500/10" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-500 shadow-sm">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-foreground font-outfit">👥 Gestão de Professores</h2>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
              Equipe, acessos, permissões e desempenho — exclusivo do administrador
            </p>
        </div>
      </div>

      {/* Switcher: Professores | Avaliações */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-2xl w-full sm:w-auto sm:inline-flex">
        <button
          onClick={() => setView("professores")}
          className={cn("flex-1 sm:flex-none py-2.5 px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5", view === "professores" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Users size={13} /> Professores
        </button>
        <button
          onClick={() => setView("avaliacoes")}
          className={cn("flex-1 sm:flex-auto py-2.5 px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5", view === "avaliacoes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          <Star size={13} className="text-amber-500" /> Avaliações
        </button>
      </div>

      <Dialog open={isOpen} onOpenChange={(val) => { setIsOpen(val); if (!val) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-11 px-5 rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
              <Plus size={16} className="mr-2" /> Novo Professor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto no-scrollbar p-0 gap-0 rounded-2xl">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-5 rounded-t-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-lg font-black">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    {editingId ? <Edit2 size={16} className="text-primary" /> : <Users size={16} className="text-primary" />}
                  </div>
                  {editingId ? "Editar Professor" : "Novo Professor"}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="px-6 py-5 space-y-6">
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <GraduationCap size={13} className="text-blue-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Dados Pessoais</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Nome Completo</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João da Silva" className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5"><Mail size={11} /> E-mail (Login)</label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editingId} placeholder="professor@escola.com" className="h-10 rounded-xl disabled:opacity-60" />
                  </div>
                  {isGmail ? (
                    <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Login via Google</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Este professor usará o botão "Entrar com Google". Não é necessário definir senha.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                        <KeyRound size={11} /> {editingId ? "Nova Senha" : "Senha de Acesso"}
                        {editingId && <span className="text-muted-foreground font-normal">(opcional)</span>}
                      </label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editingId ? "Deixe em branco para manter" : "Mínimo 6 caracteres"} className="h-10 rounded-xl" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5"><Phone size={11} /> WhatsApp</label>
                      <Input value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} placeholder="(11) 99999-9999" className="h-10 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5"><Star size={11} /> Especialidade</label>
                      <Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="Piano, Canto..." className="h-10 rounded-xl" />
                    </div>
                    <div className="col-span-2 space-y-1.5 mt-1 border-t border-border/30 pt-3">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5"><Camera size={11} /> Foto do Professor</label>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-11 w-11 ring-2 ring-border/50 shadow-sm">
                          {foto ? <img src={foto} alt="Professor" className="object-cover w-full h-full" /> : <AvatarFallback className="bg-muted text-muted-foreground font-black text-xs">FOTO</AvatarFallback>}
                        </Avatar>
                        <Input type="file" accept="image/*" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setFoto(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }} className="h-10 rounded-xl text-xs flex-1 file:bg-primary file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:text-xs file:font-semibold hover:file:bg-primary/90 file:cursor-pointer cursor-pointer" />
                        {foto && <Button type="button" variant="destructive" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setFoto("")}><Trash2 size={15} /></Button>}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center"><Shield size={13} className="text-violet-500" /></div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Acesso às Páginas</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_PERMISSIONS.map((perm) => {
                    const active = permissions.includes(perm.id);
                    return (
                      <label key={perm.id} className={cn("flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 border transition-all select-none", active ? "bg-primary/8 border-primary/30 text-primary" : "bg-muted/20 border-border/40 hover:bg-muted/40 text-foreground/70")}>
                        <input type="checkbox" checked={active} onChange={() => togglePermission(perm.id)} className="sr-only" />
                        <span className="text-base leading-none">{perm.icon}</span>
                        <span className="text-xs font-semibold">{perm.label}</span>
                        {active && <CheckCircle2 size={12} className="ml-auto text-primary flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center"><Info size={13} className="text-amber-500" /></div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Permissões de Dados</span>
                </div>
                <div className="space-y-2">
                  {DATA_PERMISSIONS.map((perm) => {
                    const active = permissions.includes(perm.id);
                    return (
                      <label key={perm.id} className={cn("flex items-start gap-3 cursor-pointer rounded-xl px-3 py-3 border transition-all select-none", active ? "bg-amber-500/8 border-amber-500/25" : "bg-muted/20 border-border/40 hover:bg-muted/40")}>
                        <input type="checkbox" checked={active} onChange={() => togglePermission(perm.id)} className="sr-only" />
                        <div className={cn("mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors", active ? "bg-amber-500 border-amber-500" : "border-border")}>
                          {active && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold block text-foreground">{perm.label}</span>
                          <span className="text-[11px] text-muted-foreground">{perm.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center"><LayoutDashboard size={13} className="text-sky-500" /></div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cards do Dashboard</span>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  O professor verá apenas os cards marcados. Ele pode ocultar mais, mas nunca habilitar um bloqueado.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DASHBOARD_WIDGETS.map((w) => {
                    const active = dashboardWidgets.includes(w.id);
                    return (
                      <label key={w.id} className={cn("flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 border transition-all select-none", active ? "bg-sky-500/8 border-sky-500/30 text-sky-600 dark:text-sky-400" : "bg-muted/20 border-border/40 hover:bg-muted/40 text-foreground/70")}>
                        <input type="checkbox" checked={active} onChange={() => toggleDashboardWidget(w.id)} className="sr-only" />
                        <span className="text-xs font-semibold">{w.label}</span>
                        {active && <CheckCircle2 size={12} className="ml-auto text-sky-500 flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center"><DollarSign size={13} className="text-emerald-500" /></div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Acordo Financeiro</span>
                </div>
                <div className="flex gap-2 bg-muted/40 p-1 rounded-xl">
                  {(["fixo", "porcentagem"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setPaymentType(t)}
                      className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all", paymentType === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {t === "fixo" ? "💵 Valor Fixo / Hora" : "📊 Porcentagem (%)"}
                    </button>
                  ))}
                </div>
                {paymentType === "fixo" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Valor da Hora (R$)</label>
                    <Input type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Ex: 40.00" className="h-10 rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Porcentagem de Comissão (%)</label>
                    <Input type="number" step="0.1" value={paymentPercentage} onChange={(e) => setPaymentPercentage(e.target.value)} placeholder="Ex: 50" className="h-10 rounded-xl" />
                  </div>
                )}
              </section>

              <div className="border-t border-border/50 pt-4">
                <Button onClick={handleSave} className="w-full h-11 rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
                  disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : <><CheckCircle2 size={16} className="mr-2" /> {editingId ? "Salvar Alterações" : "Cadastrar Professor"}</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {view === "avaliacoes" ? (
        <EvaluacoesTab />
      ) : (
      <>
      {/* KPIs (padrão do Dashboard — MetricCard) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {KPI_CARDS.map((k) => (
          <div key={k.label} className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 sm:p-6 border border-white/10 shadow-2xl shadow-primary/5 hover:shadow-primary/15 hover:-translate-y-1.5 transition-all duration-500 group cursor-default min-w-0 overflow-hidden">
            <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
              <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6 shadow-sm shrink-0", k.box)}>
                {k.icon}
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate font-outfit">{k.value}</h3>
              <p className="text-xs font-bold text-muted-foreground mt-1 truncate">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Busca + filtro */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou especialidade..."
          className="flex-1 h-11 rounded-xl"
        />
        <select
          value={filterEsp}
          onChange={(e) => setFilterEsp(e.target.value)}
          className="h-11 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="all">Todas as especialidades</option>
          {especialidades.map((esp) => (
            <option key={esp} value={esp}>{esp}</option>
          ))}
        </select>
      </div>

      {/* Estados */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-black text-foreground">Não foi possível carregar os professores</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[380px]">{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden animate-pulse">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3"><div className="h-12 w-12 rounded-full bg-muted" /><div className="space-y-2 flex-1"><div className="h-3 w-2/3 bg-muted rounded" /><div className="h-2 w-1/2 bg-muted/70 rounded" /></div></div>
                <div className="h-2 w-full bg-muted/60 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/40 bg-card/30">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3"><Users size={26} /></div>
          <p className="text-sm font-black text-foreground">{professores.length === 0 ? "Nenhum professor cadastrado" : "Nenhum professor encontrado com esse filtro"}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1.5 max-w-[300px]">
            {professores.length === 0 ? "Clique em 'Novo Professor' para adicionar membros à equipe." : "Ajuste a busca ou o filtro de especialidade."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((prof: any, idx: number) => {
            const initials = prof.name?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "P";
            const especialidades = prof.especialidade ? prof.especialidade.split(",").map((s: string) => s.trim()) : [];
            const isGmailProf = prof.email?.toLowerCase().endsWith("@gmail.com");
            return (
              <motion.div
                key={prof.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
                className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] border border-white/10 shadow-2xl shadow-primary/5 hover:shadow-primary/15 hover:-translate-y-1.5 transition-all duration-500 overflow-hidden min-w-0"
              >
                <div className="p-4 space-y-3">
                  {/* Cabeçalho do card */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-primary/20 shadow-md shrink-0">
                      {prof.foto ? <img src={prof.foto || undefined} alt={prof.name || ""} className="object-cover w-full h-full" /> : <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-white font-black">{initials}</AvatarFallback>}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-black text-foreground truncate">{prof.name}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium mt-0.5 flex-wrap">
                        <Mail size={10} /> {prof.email}
                        {isGmailProf && <span className="inline-flex items-center text-[8px] font-bold bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-full border border-blue-500/20">Google</span>}
                      </div>
                    </div>
                  </div>

                  {/* Especialidades */}
                  <div className="flex flex-wrap gap-1.5">
                    {especialidades.length > 0 ? especialidades.map((esp: string, i: number) => (
                      <Badge key={i} variant="secondary" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-semibold px-2.5 py-0.5 rounded-lg">{esp}</Badge>
                    )) : <span className="text-[10px] text-muted-foreground italic bg-muted px-2 py-0.5 rounded-lg">Sem especialidade</span>}
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-muted/40 border border-border/40 p-2 text-center">
                      <p className="text-base font-black text-foreground tabular-nums">{prof.alunosAtivos}</p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Alunos</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 border border-border/40 p-2 text-center">
                      <p className="text-base font-black text-foreground tabular-nums">{prof.aulasMes}</p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">Aulas/mês</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 border border-border/40 p-2 text-center">
                      <p className="text-base font-black text-foreground tabular-nums">
                        {prof.pagamentoMes ? formatBRL(prof.pagamentoMes.totalAmount) : "—"}
                      </p>
                      <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">A receber</p>
                    </div>
                  </div>

                  {/* Telefone + último acesso */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {prof.telefone ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-bold tabular-nums">{prof.telefone}</span>
                        <button onClick={() => copyPhone(prof.telefone)} title="Copiar telefone" className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 cursor-pointer"><Copy size={12} /></button>
                        <a href={`https://wa.me/55${prof.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all active:scale-95"><MessageCircle size={12} /></a>
                      </div>
                    ) : <span className="text-[10px] text-muted-foreground">Sem telefone</span>}
                    <span className={cn("text-[10px] font-bold flex items-center gap-1", accessColor(prof.lastSignedIn))}>
                      <Lock size={10} /> {daysAgoLabel(prof.lastSignedIn)}
                    </span>
                  </div>

                  {/* Rodapé: acordo + ações */}
                  <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                    <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                      {prof.paymentType === "fixo"
                        ? <>💵 R$ {Number(prof.hourlyRate || 0).toFixed(2)}/hora</>
                        : <>📊 {Number(prof.paymentPercentage || 0).toFixed(1)}%</>}
                      <span className="block text-[8px] text-muted-foreground/70">{Array.isArray(prof.permissions) ? prof.permissions.length : 0} permissões</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a href="/folha" title="Ver Folha de Pagamento" className="h-9 w-9 flex items-center justify-center rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground transition-all active:scale-95">
                        <FileText size={14} />
                      </a>
                      <button onClick={() => setRulesProf(prof)} title="Regras de Cobrança" className="h-9 w-9 flex items-center justify-center rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-all active:scale-95 cursor-pointer">
                        <DollarSign size={14} />
                      </button>
                      <button onClick={() => handleOpenEdit(prof)} title="Editar" className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-all active:scale-95 cursor-pointer">
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remover "${prof.name}"? O acesso dele será bloqueado.`)) deleteMutation.mutate({ id: prof.id }); }}
                        title="Excluir"
                        className="h-9 w-9 flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 transition-all active:scale-95 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      </>

      )}

      {/* Regras de Cobrança (PRD) — render condicional: professor é null ao carregar */}
      {rulesProf && (
        <PaymentRulesDialog
          professor={rulesProf}
          open
          onOpenChange={(o) => { if (!o) setRulesProf(null); }}
        />
      )}
    </div>
  );
}
