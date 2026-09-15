import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Plus, Trash2, Edit2, Mail, GraduationCap,
  Lock, Phone, Star, DollarSign, Shield, Info, KeyRound,
  CheckCircle2, Users, Camera,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DASHBOARD_WIDGETS, ALL_WIDGET_IDS, parseWidgetList } from "@shared/dashboardWidgets";
import { LayoutDashboard } from "lucide-react";

const AVAILABLE_PERMISSIONS = [
  { id: "/dashboard",     label: "Dashboard",     icon: "📊" },
  { id: "/alunos",        label: "Alunos",         icon: "👨‍🎓" },
  { id: "/aulas",         label: "Aulas",          icon: "📅" },
  { id: "/instrumentos",  label: "Instrumentos",   icon: "🎸" },
  { id: "/relatorios",    label: "Relatórios",     icon: "📈" },
  { id: "/lembretes",     label: "Lembretes",      icon: "🔔" },
  { id: "/comunicados",   label: "Comunicados",    icon: "📢" },
  { id: "/solicitacoes",  label: "Solicitações",   icon: "📋" },
  { id: "/automacoes",    label: "Automações",     icon: "🤖" },
  { id: "/ia",            label: "IA Assistente",  icon: "✨" },
  { id: "/progresso",     label: "Progresso",      icon: "🎯" },
  { id: "/financeiro",    label: "Financeiro",     icon: "💰" },
  { id: "/folha",         label: "Folha de Pagto", icon: "💼" },
  { id: "/recepcao-qr",   label: "Recepção QR",    icon: "📷" },
  { id: "/configuracoes", label: "Configurações",  icon: "⚙️" },
];

const DATA_PERMISSIONS = [
  { id: "alunos_editar",      label: "Editar dados dos alunos",    desc: "Permite editar, excluir e alterar status dos alunos" },
  { id: "alunos_mensalidade", label: "Ver valor da mensalidade",   desc: "Exibe a coluna de mensalidade na lista de alunos" },
];

export function ProfessoresTab() {
  const [isOpen, setIsOpen]           = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);

  // Form State
  const [name, setName]                         = useState("");
  const [email, setEmail]                       = useState("");
  const [password, setPassword]                 = useState("");
  const [telefone, setTelefone]                 = useState("");
  const [especialidade, setEspecialidade]       = useState("");
  const [foto, setFoto]                         = useState("");
  const [permissions, setPermissions]           = useState<string[]>(["/dashboard", "/alunos", "/aulas"]);
  // Cards do dashboard PERMITIDOS para o professor (trava). Vazio = todos.
  const [dashboardWidgets, setDashboardWidgets] = useState<string[]>(ALL_WIDGET_IDS);
  const [paymentType, setPaymentType]           = useState<"fixo" | "porcentagem">("fixo");
  const [hourlyRate, setHourlyRate]             = useState("");
  const [paymentPercentage, setPaymentPercentage] = useState("");

  // Gmail detection — if email ends with @gmail.com, no password required
  const isGmail = email.trim().toLowerCase().endsWith("@gmail.com");

  const utils = trpc.useUtils();
  const { data: professores, isLoading } = trpc.professores.list.useQuery();

  const createMutation = trpc.professores.create.useMutation({
    onSuccess: () => {
      toast.success("Professor cadastrado com sucesso!");
      utils.professores.list.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.professores.update.useMutation({
    onSuccess: () => {
      toast.success("Professor atualizado com sucesso!");
      utils.professores.list.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.professores.delete.useMutation({
    onSuccess: () => {
      toast.success("Professor removido com sucesso!");
      utils.professores.list.invalidate();
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
    // Gmail accounts: login via Google OAuth — no password needed
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
        // For Gmail accounts pass an empty/random password — they'll use Google OAuth
        password: isGmail ? `google_oauth_${Date.now()}` : password,
        telefone, especialidade, foto, permissions, dashboardWidgets, paymentType, hourlyRate, paymentPercentage,
      });
    }
  };

  const togglePermission = (id: string) => {
    setPermissions(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleDashboardWidget = (id: string) => {
    setDashboardWidgets(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          toast.error("Mantenha ao menos um card habilitado");
          return prev;
        }
        return prev.filter(w => w !== id);
      }
      return [...prev, id];
    });
  };

  const formatPhone = (value: string) => {
    let clean = value.replace(/\D/g, "");
    if (!clean) return "";
    let prefix = "";
    if (clean.startsWith("55") && clean.length > 11) { prefix = "+55 "; clean = clean.substring(2); }
    if (clean.length > 10) return prefix + `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7,11)}`;
    if (clean.length > 6)  return prefix + `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
    if (clean.length > 2)  return prefix + `(${clean.slice(0,2)}) ${clean.slice(2)}`;
    return prefix + clean;
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-6 rounded-2xl border border-border/50">
        <div>
          <h3 className="text-xl lg:text-2xl font-outfit font-black text-foreground uppercase tracking-widest flex items-center gap-3">
            <span className="w-2 h-8 bg-primary rounded-full" />
            Equipe de Professores
          </h3>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mt-1 ml-5">
            Gerencie os acessos e permissões dos membros
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={(val) => { setIsOpen(val); if (!val) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-11 px-6 rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
              <Plus size={18} className="mr-2" /> Novo Professor
            </Button>
          </DialogTrigger>

          {/* ── MODAL ──────────────────────────────────────────── */}
          <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-0 gap-0 rounded-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-5 rounded-t-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-lg font-black font-outfit">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    {editingId ? <Edit2 size={16} className="text-primary" /> : <Users size={16} className="text-primary" />}
                  </div>
                  {editingId ? "Editar Professor" : "Novo Professor"}
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* ── SEÇÃO 1: Dados Pessoais ── */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <GraduationCap size={13} className="text-blue-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Dados Pessoais</span>
                </div>

                <div className="space-y-3">
                  {/* Nome */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Nome Completo</label>
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                      <Mail size={11} /> E-mail (Login)
                    </label>
                    <Input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={!!editingId}
                      placeholder="professor@escola.com"
                      className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors disabled:opacity-60"
                    />
                  </div>

                  {/* ── BLOCO DE SENHA — inteligente por Gmail ── */}
                  {isGmail ? (
                    <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
                      <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                        {/* Google "G" icon inline */}
                        <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Login via Google</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Este professor usará o botão <strong>"Entrar com Google"</strong> na tela de login.
                          Não é necessário definir uma senha.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                        <KeyRound size={11} />
                        {editingId ? "Nova Senha" : "Senha de Acesso"}
                        {editingId && <span className="text-muted-foreground font-normal">(opcional)</span>}
                      </label>
                      <Input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder={editingId ? "Deixe em branco para manter" : "Mínimo 6 caracteres"}
                        className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      />
                    </div>
                  )}

                  {/* WhatsApp + Especialidade */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                        <Phone size={11} /> WhatsApp
                      </label>
                      <Input
                        value={telefone}
                        onChange={e => setTelefone(formatPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                        <Star size={11} /> Especialidade
                      </label>
                      <Input
                        value={especialidade}
                        onChange={e => setEspecialidade(e.target.value)}
                        placeholder="Piano, Canto..."
                        className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      />
                    </div>
                    
                    {/* Foto */}
                    <div className="col-span-2 space-y-1.5 mt-1 border-t border-border/30 pt-3">
                      <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                        <Camera size={11} /> Foto do Professor
                      </label>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-11 w-11 ring-2 ring-border/50 shadow-sm">
                          {foto ? (
                            <img src={foto} alt="Professor" className="object-cover w-full h-full" />
                          ) : (
                            <AvatarFallback className="bg-muted text-muted-foreground font-black text-xs">FOTO</AvatarFallback>
                          )}
                        </Avatar>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => setFoto(ev.target?.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors text-xs flex-1 file:bg-primary file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:text-xs file:font-semibold hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                        />
                        {foto && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
                            onClick={() => setFoto("")}
                            title="Remover foto"
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── SEÇÃO 2: Permissões de Páginas ── */}
              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Shield size={13} className="text-violet-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Acesso às Páginas</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_PERMISSIONS.map(perm => {
                    const active = permissions.includes(perm.id);
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 border transition-all select-none ${
                          active
                            ? "bg-primary/8 border-primary/30 text-primary"
                            : "bg-muted/20 border-border/40 hover:bg-muted/40 text-foreground/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => togglePermission(perm.id)}
                          className="sr-only"
                        />
                        <span className="text-base leading-none">{perm.icon}</span>
                        <span className="text-xs font-semibold">{perm.label}</span>
                        {active && <CheckCircle2 size={12} className="ml-auto text-primary flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* ── SEÇÃO 3: Permissões de Dados ── */}
              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Info size={13} className="text-amber-500" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Permissões de Dados</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">Controla o que o professor pode ver e fazer <em>dentro</em> das páginas</p>

                <div className="space-y-2">
                  {DATA_PERMISSIONS.map(perm => {
                    const active = permissions.includes(perm.id);
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-start gap-3 cursor-pointer rounded-xl px-3 py-3 border transition-all select-none ${
                          active
                            ? "bg-amber-500/8 border-amber-500/25"
                            : "bg-muted/20 border-border/40 hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => togglePermission(perm.id)}
                          className="sr-only"
                        />
                        <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          active ? "bg-amber-500 border-amber-500" : "border-border"
                        }`}>
                          {active && <CheckCircle2 size={10} className="text-white" />}
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

              {/* ── SEÇÃO 3.5: Cards do Dashboard (trava do admin) ── */}
              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center">
                    <LayoutDashboard size={13} className="text-sky-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cards do Dashboard</span>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  O professor verá apenas os cards marcados. Ele pode ocultar mais, mas nunca habilitar um bloqueado.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DASHBOARD_WIDGETS.map(w => {
                    const active = dashboardWidgets.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className={`flex items-center gap-2.5 cursor-pointer rounded-xl px-3 py-2.5 border transition-all select-none ${
                          active
                            ? "bg-sky-500/8 border-sky-500/30 text-sky-600"
                            : "bg-muted/20 border-border/40 hover:bg-muted/40 text-foreground/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleDashboardWidget(w.id)}
                          className="sr-only"
                        />
                        <span className="text-xs font-semibold">{w.label}</span>
                        {active && <CheckCircle2 size={12} className="ml-auto text-sky-500 flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* ── SEÇÃO 4: Acordo Financeiro ── */}
              <section className="border-t border-border/50 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <DollarSign size={13} className="text-emerald-500" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Acordo Financeiro</span>
                </div>

                {/* Toggle fixo/porcentagem */}
                <div className="flex gap-2 bg-muted/40 p-1 rounded-xl">
                  {(["fixo", "porcentagem"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPaymentType(t)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        paymentType === t
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "fixo" ? "💵 Valor Fixo / Hora" : "📊 Porcentagem (%)"}
                    </button>
                  ))}
                </div>

                {paymentType === "fixo" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Valor da Hora (R$)</label>
                    <Input
                      type="number" step="0.01"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value)}
                      placeholder="Ex: 40.00"
                      className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/80">Porcentagem de Comissão (%)</label>
                    <Input
                      type="number" step="0.1"
                      value={paymentPercentage}
                      onChange={e => setPaymentPercentage(e.target.value)}
                      placeholder="Ex: 50"
                      className="h-10 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                    />
                  </div>
                )}
              </section>

              {/* ── BOTÃO SALVAR ── */}
              <div className="border-t border-border/50 pt-4">
                <Button
                  onClick={handleSave}
                  className="w-full h-11 rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending)
                    ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</>
                    : <><CheckCircle2 size={16} className="mr-2" /> {editingId ? "Salvar Alterações" : "Cadastrar Professor"}</>
                  }
                </Button>
              </div>

            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── LISTA DE PROFESSORES ── */}
      <div className="grid grid-cols-1 gap-4">
        {professores?.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h4 className="font-outfit text-lg font-bold">Nenhum professor cadastrado</h4>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Professor" para adicionar membros à equipe.</p>
          </div>
        ) : (
          professores?.map((prof) => {
            const initials = prof.name?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "P";
            const especialidades = prof.especialidade ? prof.especialidade.split(",").map((s: string) => s.trim()) : [];
            const isGmailProf = prof.email?.toLowerCase().endsWith("@gmail.com");

            return (
              <div key={prof.id} className="bg-card hover:bg-muted/30 border border-border rounded-2xl p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-5">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/20 shadow-md">
                    {prof.foto ? (
                      <img src={prof.foto || undefined} alt={prof.name || ""} className="object-cover w-full h-full" />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-white font-outfit font-black text-xl">
                        {initials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <h4 className="font-outfit text-xl font-black text-foreground">{prof.name}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium mt-1">
                      <Mail className="w-3.5 h-3.5" />
                      {prof.email}
                      {isGmailProf && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full border border-blue-500/20">
                          <svg viewBox="0 0 24 24" className="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Google
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-3">
                  <div className="flex flex-wrap gap-2">
                    {especialidades.length > 0 ? (
                      especialidades.map((esp: string, i: number) => (
                        <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-semibold px-3 py-1 rounded-lg">
                          {esp}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic bg-muted px-3 py-1 rounded-lg">Sem especialidade</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 rounded-lg font-semibold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors dark:hover:bg-blue-950/40" onClick={() => handleOpenEdit(prof)}>
                      <Edit2 size={14} className="mr-2" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 rounded-lg font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors dark:hover:bg-red-950/40" onClick={() => {
                      if (confirm("Tem certeza que deseja remover este professor? O acesso dele será bloqueado.")) {
                        deleteMutation.mutate({ id: prof.id });
                      }
                    }}>
                      {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} className="mr-2" />} Excluir
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
