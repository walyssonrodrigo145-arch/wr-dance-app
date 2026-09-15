import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Loader2, Plus, Edit, Check, X, Tag, ListFilter, Users, Building,
  ShieldAlert, Save, Trash2, AlertTriangle, RefreshCw, BarChart2,
  Upload, Image as ImageIcon, Link as LinkIcon, LogIn, UserCheck, Search,
  CheckCircle2, Eye, GraduationCap, ChevronUp, ChevronDown,
  Copy, MessageCircle, LifeBuoy,
} from "lucide-react";
import { SupportTicketsAdmin } from "@/components/support/SupportTicketsAdmin";
import { cn } from "@/lib/utils";
import { SLIDE_THEMES, getSlideTheme } from "@/lib/slideThemes";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { VideoThumb } from "@/components/ui/VideoThumb";

// ─── REGRA DE ACESSO ──────────────────────────────────────────────────────────
// SOMENTE Super Admins autorizados podem acessar este painel.
// AUDIT FIX: remover e-mails hardcoded — a autorização vem do backend
// (auth.me.isSuperAdmin, baseado em SUPER_ADMIN_EMAIL(S) do ambiente).

export default function SuperAdmin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // ─── Proteção de rota: apenas Super Admins (flag vinda do backend) ─────────
  if (!loading && !user) { setLocation('/login'); return null; }
  if (!loading && !user?.isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-20 gap-4">
        <ShieldAlert size={48} className="text-destructive" />
        <h1 className="text-2xl font-black">Acesso Negado</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          Esta área é restrita exclusivamente ao desenvolvedor do sistema.<br />
          Sua conta não possui esta permissão.
        </p>
        <Button variant="outline" onClick={() => setLocation('/dashboard')}>Voltar ao painel</Button>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  return <SuperAdminPanel />;
}

// ─── Painel principal (renderizado apenas para o Super Admin autenticado) ─────
function SuperAdminPanel() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"dashboard" | "escolas" | "usuarios" | "plans" | "coupons" | "clientes" | "slides" | "tutoriais" | "chamados">("dashboard");

  // Copiar telefone da escola (navegador moderno + fallback antigo)
  const copyPhone = async (phone: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phone);
      } else {
        const ta = document.createElement("textarea");
        ta.value = phone;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(`Telefone copiado: ${phone}`);
    } catch {
      toast.error("Não foi possível copiar o telefone.");
    }
  };

  // ── Estado dos modais ──────────────────────────────────────────────────────
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);

  // Redefinir Senha
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState("");

  // Busca e Filtros de Usuários
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "professor" | "aluno">("all");

  // FIX: estados controlados para os Switches dos planos
  const [planIsActive, setPlanIsActive] = useState(true);
  const [planShowOnLanding, setPlanShowOnLanding] = useState(true);
  const [planIsPopular, setPlanIsPopular] = useState(false);
  const [planAllowExtraStudents, setPlanAllowExtraStudents] = useState(true);

  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);

  // FIX: estado controlado para o Switch do cupom
  const [couponIsActive, setCouponIsActive] = useState(true);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: stats, isLoading: loadingStats, isError: errorStats, error: errorStatsData, refetch: refetchStats } =
    trpc.superAdmin.getDashboardStats.useQuery(undefined, { enabled: activeTab === "dashboard" });

  const { data: plans, isLoading: loadingPlans, isError: errorPlans, error: errorPlansData, refetch: refetchPlans } =
    trpc.superAdmin.getPlans.useQuery(undefined, { enabled: activeTab === "plans" });

  const { data: coupons, isLoading: loadingCoupons, isError: errorCoupons, error: errorCouponsData, refetch: refetchCoupons } =
    trpc.superAdmin.getCoupons.useQuery(undefined, { enabled: activeTab === "coupons" });

  const { data: orgs, isLoading: loadingOrgs, isError: errorOrgs, error: errorOrgsData, refetch: refetchOrgs } =
    trpc.superAdmin.getOrganizations.useQuery(undefined, { enabled: activeTab === "escolas" });

  const { data: allUsers, isLoading: loadingUsers, isError: errorUsers, error: errorUsersData, refetch: refetchUsers } =
    trpc.superAdmin.listAllUsers.useQuery({
      search: userSearchTerm || undefined,
      role: userRoleFilter === "all" ? undefined : userRoleFilter,
      limit: 100,
    }, { enabled: activeTab === "usuarios" });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const impersonateMutation = trpc.superAdmin.impersonateUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Acessando a conta de ${data.targetUser.name || data.targetUser.email}...`);
      setTimeout(() => {
        window.location.href = data.redirectUrl || "/dashboard";
      }, 400);
    },
    onError: (err) => toast.error(`Erro ao acessar conta: ${err.message}`),
  });

  // FIX: todas as mutations agora têm onError com toast
  const deleteSchool = trpc.superAdmin.deleteOrganization.useMutation({
    onSuccess: () => {
      toast.success("Escola excluída permanentemente!");
      utils.superAdmin.getOrganizations.invalidate();
      utils.superAdmin.getDashboardStats.invalidate();
      setIsDeleteConfirmOpen(false);
      setIsSchoolModalOpen(false);
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const savePlan = trpc.superAdmin.savePlan.useMutation({
    onSuccess: () => {
      toast.success("Plano salvo com sucesso!");
      utils.superAdmin.getPlans.invalidate();
      setIsPlanModalOpen(false);
    },
    onError: (err) => toast.error(`Erro ao salvar plano: ${err.message}`),
  });

  const saveCoupon = trpc.superAdmin.saveCoupon.useMutation({
    onSuccess: () => {
      toast.success("Cupom salvo com sucesso!");
      utils.superAdmin.getCoupons.invalidate();
      setIsCouponModalOpen(false);
    },
    onError: (err) => toast.error(`Erro ao salvar cupom: ${err.message}`),
  });

  const updateOrgSub = trpc.superAdmin.updateOrgSubscription.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Status da escola atualizado!");
      utils.superAdmin.getOrganizations.invalidate();
      utils.superAdmin.getDashboardStats.invalidate();
      // FIX: Atualiza estado local para refletir imediatamente no modal
      setSelectedSchool((prev: any) => prev ? { ...prev, subscriptionStatus: variables.subscriptionStatus } : prev);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const resetPasswordMutation = trpc.superAdmin.resetUserPassword.useMutation({
    onSuccess: () => {
      toast.success("Nova senha definida com sucesso!");
      setIsResetPasswordOpen(false);
      setNewPasswordInput("");
    },
    onError: (err) => toast.error(`Erro ao redefinir senha: ${err.message}`),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getFeaturesString = (plan: any) => {
    if (!plan?.features) return "";
    if (Array.isArray(plan.features)) return plan.features.join("; ");
    try {
      const parsed = JSON.parse(plan.features);
      if (Array.isArray(parsed)) return parsed.join("; ");
    } catch (e) {}
    return plan.features;
  };

  // FIX: handleSavePlan usa estados React controlados para os Switches
  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    savePlan.mutate({
      id: ((formData.get("id") as string) || "plano-" + Date.now()).toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      name: formData.get("name") as string,
      priceMonthly: Number(formData.get("priceMonthly")),
      priceYearly: Number(formData.get("priceYearly")),
      maxStudents: Number(formData.get("maxStudents")),
      features: (formData.get("features") as string).split(";").map(f => f.trim()).filter(Boolean),
      isActive: planIsActive,
      showOnLanding: planShowOnLanding,
      isPopular: planIsPopular,
      order: Number(formData.get("order")) || 0,
      allowExtraStudents: planAllowExtraStudents,
      extraStudentPrice: Number(formData.get("extraStudentPrice")) || 1.49,
    });
  };

  // FIX: handleSaveCoupon usa estado React controlado para o Switch
  const handleSaveCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    saveCoupon.mutate({
      code: formData.get("code") as string,
      discountType: formData.get("discountType") as "PERCENTAGE" | "FIXED",
      discountValue: Number(formData.get("discountValue")),
      durationMonths: formData.get("durationMonths") && Number(formData.get("durationMonths")) > 0 ? Number(formData.get("durationMonths")) : null,
      maxUses: formData.get("maxUses") && Number(formData.get("maxUses")) > 0 ? Number(formData.get("maxUses")) : null,
      isActive: couponIsActive, // FIX: vem do estado React
    });
  };

  // ── Componente reutilizável de erro ────────────────────────────────────────
  const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle size={36} className="text-destructive" />
      <p className="text-muted-foreground font-medium">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="flex items-center gap-2">
        <RefreshCw size={14} /> Tentar novamente
      </Button>
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="py-12 text-center text-muted-foreground font-medium">{message}</div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Painel Super Admin</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Controle total sobre Planos, Cupons e Visão Geral do Sistema.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.open("/analytics", "_blank")}
          className="flex items-center gap-2 font-semibold text-sm bg-violet-600/10 text-violet-600 border-violet-500/30 hover:bg-violet-600 hover:text-white transition-all"
        >
          <BarChart2 size={16} />
          MusicPro Analytics ↗
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-4 flex-wrap">
        {[
          { id: "dashboard", label: "Visão Geral", icon: <ListFilter size={16} /> },
          { id: "escolas", label: "Escolas", icon: <Building size={16} /> },
          { id: "usuarios", label: "Usuários & Suporte", icon: <UserCheck size={16} /> },
          { id: "plans", label: "Planos", icon: <Tag size={16} /> },
          { id: "coupons", label: "Cupons", icon: <Tag size={16} /> },
          { id: "clientes", label: "Clientes (Landing)", icon: <Users size={16} /> },
          { id: "slides", label: "Slides do Sistema", icon: <ImageIcon size={16} /> },
          { id: "tutoriais", label: "Tutoriais", icon: <GraduationCap size={16} /> },
          { id: "chamados", label: "Chamados", icon: <LifeBuoy size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Dashboard ─────────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {loadingStats && <Loader2 className="animate-spin text-primary mx-auto my-10" />}
          {errorStats && <ErrorState message={`Erro ao carregar estatísticas: ${errorStatsData?.message || "Desconhecido"}`} onRetry={refetchStats} />}
          {stats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-center items-center">
                  <Building size={32} className="text-primary mb-2" />
                  <span className="text-4xl font-black">{stats.totalOrganizations}</span>
                  <span className="text-sm font-medium text-muted-foreground">Escolas Cadastradas</span>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-center items-center">
                  <Users size={32} className="text-primary mb-2" />
                  <span className="text-4xl font-black">{stats.totalProfessors}</span>
                  <span className="text-sm font-medium text-muted-foreground">Professores</span>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-center items-center">
                  <Users size={32} className="text-green-500 mb-2" />
                  <span className="text-4xl font-black">{stats.totalStudents}</span>
                  <span className="text-sm font-medium text-muted-foreground">Alunos Ativos</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-black">Últimas Escolas Criadas</h2>
                  <button onClick={() => setActiveTab("escolas")} className="text-sm text-primary font-bold hover:underline">Ver todas</button>
                </div>
                <div className="space-y-3">
                  {stats.organizations.map((org: any) => (
                    <div key={org.id} className="flex justify-between items-center p-3 border border-border/50 rounded-xl bg-muted/20">
                      <span className="font-bold">{org.name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                        org.subscriptionStatus === 'active' ? 'bg-green-500/10 text-green-600' :
                        org.subscriptionStatus === 'trialing' ? 'bg-blue-500/10 text-blue-600' :
                        org.subscriptionStatus === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                        'bg-red-500/10 text-red-600'
                      }`}>{org.subscriptionStatus === 'pending' ? 'aguardando' : org.subscriptionStatus}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Escolas ───────────────────────────────────────────────── */}
      {activeTab === "escolas" && (
        <div className="space-y-6">
          <h2 className="text-xl font-black">Gestão de Escolas</h2>

          {loadingOrgs && <Loader2 className="animate-spin text-primary mx-auto my-10" />}
          {errorOrgs && <ErrorState message={`Erro ao carregar escolas: ${errorOrgsData?.message || "Desconhecido"}`} onRetry={refetchOrgs} />}
          {orgs && orgs.length === 0 && <EmptyState message="Nenhuma escola cadastrada ainda." />}

          {orgs && orgs.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground font-bold">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nome da Escola</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Professores</th>
                    <th className="px-4 py-3">Alunos</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orgs.map((org: any) => (
                    <tr key={org.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-muted-foreground">{org.id}</td>
                      <td className="px-4 py-3 font-bold">{org.name}</td>
                      <td className="px-4 py-3">
                        {org.schoolPhone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold tabular-nums whitespace-nowrap">{org.schoolPhone}</span>
                            <button
                              onClick={() => copyPhone(org.schoolPhone)}
                              title="Copiar telefone"
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <Copy size={13} />
                            </button>
                            <a
                              href={`https://wa.me/55${org.schoolPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir conversa no WhatsApp"
                              className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
                            >
                              <MessageCircle size={13} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{org.totalUsers}</td>
                      <td className="px-4 py-3">{org.totalStudents}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                          org.subscriptionStatus === 'active' ? 'bg-green-500/10 text-green-600' :
                          org.subscriptionStatus === 'trialing' ? 'bg-blue-500/10 text-blue-600' :
                          org.subscriptionStatus === 'pending' ? 'bg-yellow-500/10 text-yellow-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>{org.subscriptionStatus === 'pending' ? 'aguardando' : org.subscriptionStatus}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setSelectedSchool(org); setIsSchoolModalOpen(true); }}
                          className="bg-primary/10 text-primary hover:bg-primary hover:text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal de Detalhes da Escola */}
          <Dialog open={isSchoolModalOpen} onOpenChange={setIsSchoolModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Detalhes da Escola</DialogTitle>
              </DialogHeader>
              {selectedSchool && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground font-medium">Nome</p>
                      <p className="font-bold text-lg">{selectedSchool.name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Criada em</p>
                      <p className="font-bold">{new Date(selectedSchool.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="col-span-2 bg-muted/50 p-3 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground font-medium text-xs mb-1">Dono / Administrador Principal</p>
                        <p className="font-bold">{selectedSchool.owner?.name || selectedSchool.name}</p>
                        <p className="text-muted-foreground text-sm">{selectedSchool.owner?.email || "Email não informado"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 border-l border-border/60 pl-4">
                        {selectedSchool.lastSignedIn && (
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground/70">Último Acesso</p>
                            <p className="text-xs font-bold text-emerald-500">
                              {new Date(selectedSchool.lastSignedIn).toLocaleDateString('pt-BR')} às {new Date(selectedSchool.lastSignedIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        )}
                        {selectedSchool.owner?.id && (
                          <div className="flex flex-col gap-1.5 items-end">
                            <button
                              onClick={() => {
                                if (confirm(`Deseja acessar o sistema com a conta de "${selectedSchool.owner?.name || selectedSchool.name}" em modo de suporte?`)) {
                                  impersonateMutation.mutate({ targetUserId: selectedSchool.owner.id });
                                }
                              }}
                              disabled={impersonateMutation.isPending}
                              className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-md flex items-center gap-1 border border-emerald-500/20 transition-all cursor-pointer"
                            >
                              {impersonateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                              Acessar Conta
                            </button>
                            <button
                              onClick={() => { setNewPasswordInput(""); setIsResetPasswordOpen(true); }}
                              className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600 hover:underline flex items-center gap-1"
                            >
                              🔑 Definir Nova Senha
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg text-center">
                      <p className="text-3xl font-black text-primary">{selectedSchool.totalUsers}</p>
                      <p className="text-xs font-medium text-muted-foreground uppercase">Professores</p>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg text-center">
                      <p className="text-3xl font-black text-primary">{selectedSchool.totalStudents}</p>
                      <p className="text-xs font-medium text-muted-foreground uppercase">Alunos</p>
                    </div>
                  </div>

                  {/* Ação: Alterar Status */}
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-bold text-muted-foreground mb-2">ALTERAR STATUS DA ASSINATURA</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['active', 'trialing', 'pending', 'inactive', 'suspended'] as const).map(s => (
                        <button
                          key={s}
                          disabled={updateOrgSub.isPending || selectedSchool.subscriptionStatus === s}
                          onClick={() => updateOrgSub.mutate({ orgId: selectedSchool.id, subscriptionStatus: s })}
                          className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors
                            ${selectedSchool.subscriptionStatus === s
                              ? 'bg-primary text-white border-primary cursor-default'
                              : 'bg-muted hover:bg-muted/60 text-foreground border-border'}`}
                        >
                          {s === 'active' ? '✅ Ativo' : s === 'trialing' ? '🕒 Trial' : s === 'pending' ? '⏳ Pendente' : s === 'inactive' ? '❌ Inativo' : '🚫 Suspenso'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Zona de Perigo: Excluir */}
                  <div className="border-t border-red-200 pt-4">
                    <p className="text-xs text-red-500 font-bold text-center mb-3">ZONA DE PERIGO — Ação irreversível</p>
                    <button 
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      className="w-full bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} /> Excluir Escola e Todos os Dados
                    </button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Modal de Alteração de Senha */}
          <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Definir Nova Senha de Acesso</DialogTitle>
                <DialogDescription>
                  Defina uma nova senha temporária para o usuário <strong>{selectedSchool?.owner?.name || selectedSchool?.name}</strong> ({selectedSchool?.owner?.email}).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Nova Senha</Label>
                  <Input 
                    type="text"
                    placeholder="Mínimo 6 caracteres"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>Cancelar</Button>
                <Button
                  disabled={resetPasswordMutation.isPending || newPasswordInput.length < 6}
                  onClick={() => {
                    if (selectedSchool?.owner?.id) {
                      resetPasswordMutation.mutate({
                        userId: selectedSchool.owner.id,
                        newPassword: newPasswordInput,
                      });
                    }
                  }}
                >
                  {resetPasswordMutation.isPending && <Loader2 className="animate-spin mr-2" size={16} />}
                  Salvar Nova Senha
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-500">
                  <AlertTriangle size={20} /> Confirmar Exclusão
                </DialogTitle>
                <DialogDescription className="pt-2">
                  Você está prestes a excluir permanentemente a escola <strong>{selectedSchool?.name}</strong> e{" "}
                  <strong>todos os {selectedSchool?.totalStudents} alunos</strong> e{" "}
                  <strong>{selectedSchool?.totalUsers} professores</strong> vinculados.{" "}
                  Esta ação <strong>não pode ser desfeita</strong>.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  disabled={deleteSchool.isPending || !selectedSchool}
                  onClick={() => selectedSchool && deleteSchool.mutate({ id: selectedSchool.id })}
                >
                  {deleteSchool.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : <Trash2 size={16} className="mr-2" />}
                  Sim, excluir permanentemente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ── TAB: Usuários & Suporte (Impersonate) ───────────────────────── */}
      {activeTab === "usuarios" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-black text-foreground">Gestão de Usuários & Modo de Suporte</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acesse a conta de qualquer administrador, professor ou aluno instantaneamente para prestar suporte sem precisar alterar a senha.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchUsers()}
              className="flex items-center gap-2 font-bold text-xs"
            >
              <RefreshCw size={13} /> Atualizar Lista
            </Button>
          </div>

          {/* Filtros e Busca */}
          <div className="bg-card border border-border p-4 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="pl-9 h-10 text-sm bg-background"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(["all", "admin", "professor", "aluno"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setUserRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize ${
                    userRoleFilter === r
                      ? "bg-primary text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {r === "all" ? "Todos" : r === "admin" ? "Admins / Donos" : r === "professor" ? "Professores" : "Alunos"}
                </button>
              ))}
            </div>
          </div>

          {loadingUsers && <Loader2 className="animate-spin text-primary mx-auto my-10" />}
          {errorUsers && <ErrorState message={`Erro ao carregar usuários: ${errorUsersData?.message || "Desconhecido"}`} onRetry={refetchUsers} />}

          {allUsers && allUsers.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-x-auto shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nome / E-mail</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3">Escola Vinculada</th>
                    <th className="px-4 py-3">Último Acesso</th>
                    <th className="px-4 py-3 text-right">Ação de Suporte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-muted-foreground text-xs">#{u.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{u.name || "Sem Nome"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          u.role === 'admin' ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20' :
                          u.role === 'professor' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' :
                          'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        }`}>
                          {u.role === 'admin' ? 'Dono / Admin' : u.role === 'professor' ? 'Professor' : 'Aluno'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-xs text-muted-foreground">
                        {u.organizationName}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.lastSignedIn ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {new Date(u.lastSignedIn).toLocaleDateString('pt-BR')} {new Date(u.lastSignedIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          "Nunca acessou"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          disabled={impersonateMutation.isPending}
                          onClick={() => {
                            if (confirm(`Deseja acessar o sistema com a conta de "${u.name || u.email}" em modo de suporte?`)) {
                              impersonateMutation.mutate({ targetUserId: u.id });
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 px-3 rounded-lg shadow-sm flex items-center gap-1.5 ml-auto transition-all active:scale-95 cursor-pointer"
                        >
                          {impersonateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
                          Acessar Conta
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allUsers && allUsers.length === 0 && (
            <div className="bg-card border border-border/50 rounded-2xl py-12 text-center text-muted-foreground">
              <Users size={36} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-bold text-foreground">Nenhum usuário encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Tente ajustar os termos de busca ou filtros.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Planos ────────────────────────────────────────────────── */}
      {activeTab === "plans" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black">Planos Ativos</h2>
            <Dialog open={isPlanModalOpen} onOpenChange={(open) => {
              setIsPlanModalOpen(open);
              if (!open) setEditingPlan(null);
            }}>
              <DialogTrigger asChild>
                <button
                  onClick={() => {
                    setEditingPlan(null);
                    // FIX: resetar estados controlados para novo plano
                    setPlanIsActive(true);
                    setPlanShowOnLanding(true);
                    setPlanIsPopular(false);
                    setPlanAllowExtraStudents(true);
                  }}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary/90"
                >
                  <Plus size={16} /> Criar Novo Plano
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingPlan ? "Editar Plano" : "Criar Novo Plano"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSavePlan} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>ID do Plano (ex: plano_basico)</Label>
                      <Input name="id" defaultValue={editingPlan?.id} required readOnly={!!editingPlan}
                        pattern="[a-z0-9_-]+" title="Apenas letras minúsculas, números, _ ou -" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nome do Plano</Label>
                      <Input name="name" defaultValue={editingPlan?.name} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Preço Mensal (R$)</Label>
                      <Input name="priceMonthly" type="number" step="0.01" min="0" defaultValue={editingPlan?.priceMonthly} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Preço Anual (R$)</Label>
                      <Input name="priceYearly" type="number" step="0.01" min="0" defaultValue={editingPlan?.priceYearly} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Limite de Alunos</Label>
                      <Input name="maxStudents" type="number" min="1" defaultValue={editingPlan?.maxStudents} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Ordem de Exibição</Label>
                      <Input name="order" type="number" defaultValue={editingPlan?.order ?? 0} required />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Valor por Aluno Excedente (R$/mês)</Label>
                      <Input name="extraStudentPrice" type="number" step="0.01" min="0" defaultValue={editingPlan?.extraStudentPrice ?? 1.49} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Funcionalidades (separe por ; ponto e vírgula)</Label>
                    <Input name="features" defaultValue={getFeaturesString(editingPlan)} required
                      placeholder="App Alunos; Pagamento Asaas; IA Assistente" />
                  </div>

                  {/* FIX: Switches controlados por estado React — FormData não captura Switch */}
                  <div className="flex flex-col gap-3 p-3 bg-muted/40 rounded-xl">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-active" className="cursor-pointer">Plano Ativo</Label>
                      <Switch id="sw-active" checked={planIsActive} onCheckedChange={setPlanIsActive} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-landing" className="cursor-pointer">Mostrar na Landing Page</Label>
                      <Switch id="sw-landing" checked={planShowOnLanding} onCheckedChange={setPlanShowOnLanding} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-popular" className="cursor-pointer">Destaque "Mais Escolhido"</Label>
                      <Switch id="sw-popular" checked={planIsPopular} onCheckedChange={setPlanIsPopular} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-extra" className="cursor-pointer">Permitir Alunos Excedentes (+ R$ 1,49/aluno)</Label>
                      <Switch id="sw-extra" checked={planAllowExtraStudents} onCheckedChange={setPlanAllowExtraStudents} />
                    </div>
                  </div>

                  <button type="submit" disabled={savePlan.isPending}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    {savePlan.isPending ? <Loader2 className="animate-spin" /> : <Save size={18} />} Salvar Plano
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingPlans && <Loader2 className="animate-spin text-primary mx-auto my-10" />}
          {errorPlans && <ErrorState message="Erro ao carregar planos." onRetry={refetchPlans} />}
          {plans && plans.length === 0 && <EmptyState message="Nenhum plano cadastrado. Crie o primeiro plano!" />}

          {plans && plans.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((p: any) => (
                <div key={p.id} className={`bg-card border rounded-2xl p-5 ${p.isActive ? 'border-primary/30 shadow-sm' : 'border-border/50 opacity-60'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold">{p.name}</h3>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{p.id}</span>
                  </div>
                  <p className="text-2xl font-black">R$ {Number(p.priceMonthly).toFixed(2)}<span className="text-xs text-muted-foreground font-medium">/mês</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">Anual: R$ {Number(p.priceYearly).toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground mt-1">Limite: {p.maxStudents} alunos</p>
                  <p className="text-xs text-primary font-semibold mt-1">
                    Excedente: {p.allowExtraStudents !== false ? `+ R$ ${Number(p.extraStudentPrice ?? 1.49).toFixed(2)}/aluno` : "Não permitido"}
                  </p>
                  <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                    <span className="text-xs flex flex-col gap-1 font-medium">
                      <div className="flex items-center gap-1">{p.isActive ? <Check size={14} className="text-green-500" /> : <X size={14} className="text-red-500" />} Ativo</div>
                      <div className="flex items-center gap-1">{p.showOnLanding ? <Check size={14} className="text-green-500" /> : <X size={14} className="text-red-500" />} Landing</div>
                      {p.isPopular && <div className="flex items-center gap-1 text-primary"><Check size={14} /> Popular</div>}
                    </span>
                    <button
                      onClick={() => {
                        setEditingPlan(p);
                        // FIX: inicializar estados controlados com valores do plano sendo editado
                        setPlanIsActive(p.isActive);
                        setPlanShowOnLanding(p.showOnLanding);
                        setPlanIsPopular(p.isPopular);
                        setPlanAllowExtraStudents(p.allowExtraStudents !== false);
                        setIsPlanModalOpen(true);
                      }}
                      className="text-primary hover:underline text-xs font-bold flex items-center gap-1"
                    >
                      <Edit size={12} /> Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Cupons ────────────────────────────────────────────────── */}
      {activeTab === "coupons" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black">Cupons de Desconto</h2>
            <Dialog open={isCouponModalOpen} onOpenChange={(open) => {
              setIsCouponModalOpen(open);
              if (!open) setEditingCoupon(null);
            }}>
              <DialogTrigger asChild>
                <button
                  onClick={() => { setEditingCoupon(null); setCouponIsActive(true); }}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary/90"
                >
                  <Plus size={16} /> Criar Novo Cupom
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{editingCoupon ? "Editar Cupom" : "Criar Novo Cupom"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveCoupon} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Código do Cupom (ex: BLACKFRIDAY)</Label>
                      <Input name="code" defaultValue={editingCoupon?.code} required readOnly={!!editingCoupon}
                        style={{ textTransform: 'uppercase' }}
                        onChange={e => e.target.value = e.target.value.toUpperCase()} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de Desconto</Label>
                      <select name="discountType" defaultValue={editingCoupon?.discountType || "PERCENTAGE"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="PERCENTAGE">Porcentagem (%)</option>
                        <option value="FIXED">Valor Fixo (R$)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor do Desconto</Label>
                      <Input name="discountValue" type="number" step="0.01" min="0.01"
                        defaultValue={editingCoupon?.discountValue} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Duração (meses — vazio = Vitalício)</Label>
                      <Input name="durationMonths" type="number" min="1"
                        defaultValue={editingCoupon?.durationMonths || ''} />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Limite de Usos (vazio = Ilimitado)</Label>
                      <Input name="maxUses" type="number" min="1"
                        defaultValue={editingCoupon?.maxUses || ''} />
                    </div>
                  </div>

                  {/* FIX: Switch controlado por estado React */}
                  <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                    <Label htmlFor="sw-coupon-active" className="cursor-pointer">Cupom Ativo</Label>
                    <Switch id="sw-coupon-active" checked={couponIsActive} onCheckedChange={setCouponIsActive} />
                  </div>

                  <button type="submit" disabled={saveCoupon.isPending}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    {saveCoupon.isPending ? <Loader2 className="animate-spin" /> : <Save size={18} />} Salvar Cupom
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingCoupons && <Loader2 className="animate-spin text-primary mx-auto my-10" />}
          {errorCoupons && <ErrorState message="Erro ao carregar cupons." onRetry={refetchCoupons} />}

          {coupons && (
            <div className="bg-card border border-border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground font-bold">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Desconto</th>
                    <th className="px-4 py-3">Duração</th>
                    <th className="px-4 py-3">Usos</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coupons.map((c: any) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-black text-primary">{c.code}</td>
                      <td className="px-4 py-3 font-medium">
                        {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `R$ ${Number(c.discountValue).toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3">
                        {c.durationMonths ? `${c.durationMonths} meses` : <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Vitalício</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground">{c.currentUses} / {c.maxUses || '∞'}</td>
                      <td className="px-4 py-3">
                        {c.isActive
                          ? <span className="text-green-500 font-bold flex items-center gap-1"><Check size={14} /> Ativo</span>
                          : <span className="text-red-500 font-bold flex items-center gap-1"><X size={14} /> Inativo</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditingCoupon(c);
                            setCouponIsActive(c.isActive); // FIX: inicializar estado do Switch
                            setIsCouponModalOpen(true);
                          }}
                          className="text-muted-foreground hover:text-primary transition-colors p-1"
                        >
                          <Edit size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {coupons.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cupom cadastrado ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Clientes da Landing Page ─────────────────────────────────── */}
      {activeTab === "clientes" && (
        <LandingClientsManager />
      )}

      {/* ── TAB: Slides de Funcionalidades (Hero Slider) ───────────────────── */}
      {activeTab === "slides" && (
        <HeroSlidesManager />
      )}

      {/* ── TAB: Tutoriais do Sistema ──────────────────────────────────────── */}
      {activeTab === "tutoriais" && (
        <TutorialsManager />
      )}

      {/* ── TAB: Chamados (Suporte) ────────────────────────────────────────── */}
      {activeTab === "chamados" && (
        <SupportTicketsAdmin />
      )}
    </div>
  );
}

// ─── Componente de Gestão de Slides do Hero (Funcionalidades) ───────────────
function HeroSlidesManager() {
  const utils = trpc.useUtils();
  const [isSlideModalOpen, setIsSlideModalOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [highlight, setHighlight] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bgTheme, setBgTheme] = useState("slate-900");
  const [order, setOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const { data: slides, isLoading } = trpc.superAdmin.listHeroSlides.useQuery();

  const createMutation = trpc.superAdmin.createHeroSlide.useMutation({
    onSuccess: () => {
      toast.success("Slide criado com sucesso!");
      utils.superAdmin.listHeroSlides.invalidate();
      utils.publicData.getHeroSlides.invalidate();
      setIsSlideModalOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Erro ao criar slide: ${err.message}`),
  });

  const updateMutation = trpc.superAdmin.updateHeroSlide.useMutation({
    onSuccess: () => {
      toast.success("Slide atualizado com sucesso!");
      utils.superAdmin.listHeroSlides.invalidate();
      utils.publicData.getHeroSlides.invalidate();
      setIsSlideModalOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Erro ao atualizar slide: ${err.message}`),
  });

  const deleteMutation = trpc.superAdmin.deleteHeroSlide.useMutation({
    onSuccess: () => {
      toast.success("Slide removido com sucesso!");
      utils.superAdmin.listHeroSlides.invalidate();
      utils.publicData.getHeroSlides.invalidate();
    },
    onError: (err) => toast.error(`Erro ao remover: ${err.message}`),
  });

  const resetForm = () => {
    setEditingSlide(null);
    setTitle("");
    setHighlight("");
    setSubtitle("");
    setPointsText("");
    setImageUrl("");
    setBgTheme("slate-900");
    setOrder(0);
    setIsActive(true);
  };

  const handleOpenEdit = (slide: any) => {
    setEditingSlide(slide);
    setTitle(slide.title);
    setHighlight(slide.highlight);
    setSubtitle(slide.subtitle);
    let pts: string[] = [];
    try {
      pts = typeof slide.points === "string" ? JSON.parse(slide.points) : slide.points || [];
    } catch {
      pts = [];
    }
    setPointsText(pts.join("\n"));
    setImageUrl(slide.imageUrl);
    setBgTheme(slide.bgTheme || "slate-900");
    setOrder(slide.order || 0);
    setIsActive(slide.isActive);
    setIsSlideModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Informe o título do slide");
    if (!highlight.trim()) return toast.error("Informe o texto destacado");
    if (!subtitle.trim()) return toast.error("Informe o subtítulo");
    if (!imageUrl.trim()) return toast.error("Selecione ou informe a imagem do slide");

    const pointsArray = pointsText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    if (editingSlide) {
      updateMutation.mutate({
        id: editingSlide.id,
        title,
        highlight,
        subtitle,
        points: pointsArray,
        imageUrl,
        bgTheme,
        order: Number(order),
        isActive,
      });
    } else {
      createMutation.mutate({
        title,
        highlight,
        subtitle,
        points: pointsArray,
        imageUrl,
        bgTheme,
        order: Number(order),
        isActive,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Slides de Funcionalidades (Hero da Landing Page)</h2>
          <p className="text-sm text-muted-foreground">
            Adicione novas telas, atualize prints do sistema e personalize os textos exibidos no carrossel principal.
          </p>
        </div>
        <Dialog
          open={isSlideModalOpen}
          onOpenChange={(open) => {
            setIsSlideModalOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={16} /> Novo Slide de Funcionalidade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSlide ? "Editar Slide" : "Novo Slide de Funcionalidade"}</DialogTitle>
              <DialogDescription>
                Configure a imagem e as informações que aparecerão no carrossel de recursos na página inicial.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="slide-title">Título Principal *</Label>
                  <Input
                    id="slide-title"
                    placeholder="Ex: Agenda de Aulas"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="slide-highlight">Texto em Destaque *</Label>
                  <Input
                    id="slide-highlight"
                    placeholder="Ex: 100% Organizada"
                    value={highlight}
                    onChange={(e) => setHighlight(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="slide-sub">Subtítulo / Descrição *</Label>
                <Input
                  id="slide-sub"
                  placeholder="Ex: Evite conflitos de horário e mantenha a rotina da escola fluindo..."
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="slide-points">Tópicos / Benefícios (1 por linha)</Label>
                <textarea
                  id="slide-points"
                  rows={3}
                  placeholder="Calendário interativo para professores&#10;Notificações de cancelamento e reposição&#10;Visão diária, semanal ou mensal"
                  value={pointsText}
                  onChange={(e) => setPointsText(e.target.value)}
                  className="w-full mt-1 p-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              {/* Upload de Imagem do Slide */}
              <div>
                <Label className="block text-sm font-semibold mb-1.5">Print / Imagem do Sistema *</Label>

                {imageUrl ? (
                  <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-24 h-16 rounded-lg bg-background border p-1 shrink-0 flex items-center justify-center overflow-hidden">
                        <img src={imageUrl} alt="Preview do Slide" className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">Imagem do slide carregada</p>
                        <p className="text-[10px] text-muted-foreground truncate">Pronta para o carrossel do Hero</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImageUrl("")}
                      className="text-xs text-destructive hover:bg-destructive/10 h-8 px-2.5 shrink-0"
                    >
                      <Trash2 size={14} className="mr-1" /> Trocar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 transition-all">
                      <div className="flex flex-col items-center justify-center pt-2 pb-2">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1.5">
                          <Upload size={20} />
                        </div>
                        <p className="text-xs font-bold text-foreground text-center">
                          Clique para escolher o print do PC ou Galeria
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, WebP (até 5MB)</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error("A imagem deve ter no máximo 5MB");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const result = evt.target?.result as string;
                              if (result) {
                                setImageUrl(result);
                                toast.success("Imagem carregada com sucesso!");
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <div className="flex items-center gap-2 pt-1">
                      <div className="relative flex-1">
                        <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Ou cole a URL da imagem aqui (ex: /images/agenda.png)..."
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          className="pl-8 text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tema Visual — picker padronizado (fonte única: slideThemes.ts) */}
              <div>
                <Label className="block text-sm font-semibold mb-1.5">Tema Visual do Slide</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SLIDE_THEMES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setBgTheme(t.id)}
                      className={cn(
                        "relative rounded-xl border-2 p-2.5 text-left transition-all",
                        bgTheme === t.id
                          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <div
                        className={cn("h-10 rounded-lg mb-2 flex items-center justify-center gap-1 border border-black/5", t.bg)}
                        style={{ backgroundColor: t.previewHex }}
                      >
                        <span className={cn("text-xs font-black", t.textColor)}>
                          Aa <span className={t.highlightColor}>Aa</span>
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-foreground leading-tight">{t.label}</p>
                      <p className="text-[9px] text-muted-foreground">{t.dark ? "Fundo escuro" : "Fundo claro"}</p>
                      {bgTheme === t.id && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ordem de exibição */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="slide-order">Ordem de Exibição</Label>
                  <Input
                    id="slide-order"
                    type="number"
                    placeholder="1 = primeiro"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div className="md:col-span-2 flex items-end">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Slides com números menores aparecem primeiro no carrossel da landing page.
                  </p>
                </div>
              </div>

              {/* Pré-visualização ao vivo */}
              <div>
                <Label className="block text-sm font-semibold mb-1.5 flex items-center gap-1.5">
                  <Eye size={14} /> Pré-visualização ao vivo
                </Label>
                {(() => {
                  const theme = getSlideTheme(bgTheme);
                  const previewPoints = pointsText.split("\n").map((p) => p.trim()).filter(Boolean);
                  return (
                    <div className={cn("rounded-2xl p-5 transition-colors duration-300", theme.bg)} style={{ backgroundColor: theme.previewHex }}>
                      <div className={cn("space-y-2", theme.textColor)}>
                        <p className="text-lg font-black leading-tight">
                          {title || "Título do Slide"}{" "}
                          <span className={theme.highlightColor}>{highlight || "Destaque"}</span>
                        </p>
                        <p className="text-xs font-medium opacity-90 leading-relaxed">
                          {subtitle || "O subtítulo do slide aparece aqui, exatamente como na landing page."}
                        </p>
                        {previewPoints.length > 0 && (
                          <ul className="space-y-1 pt-1.5">
                            {previewPoints.map((pt, i) => (
                              <li key={i} className="text-[11px] font-semibold opacity-90 flex items-center gap-1.5">
                                <CheckCircle2 size={12} className="shrink-0" />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                <Label htmlFor="slide-active" className="cursor-pointer">
                  Slide Ativo na Landing Page
                </Label>
                <Switch id="slide-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="w-full py-3"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="animate-spin mr-2" />
                ) : (
                  <Save size={16} className="mr-2" />
                )}
                {editingSlide ? "Salvar Alterações" : "Criar Slide"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Loader2 className="animate-spin text-primary mx-auto my-10" />}

      {slides && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {slides.map((s: any) => {
            let pts: string[] = [];
            try {
              pts = typeof s.points === "string" ? JSON.parse(s.points) : s.points || [];
            } catch {
              pts = [];
            }
            return (
              <div
                key={s.id}
                className="bg-card border border-border rounded-2xl p-5 space-y-4 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-32 h-20 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center p-1 overflow-hidden shrink-0">
                      <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover rounded-lg" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                          s.isActive
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                        }`}
                      >
                        {s.isActive ? "Ativo" : "Inativo"}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        #{s.order}
                      </span>
                      <span
                        className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border border-border/60"
                        title={`Tema: ${getSlideTheme(s.bgTheme).label}`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/10"
                          style={{ backgroundColor: getSlideTheme(s.bgTheme).previewHex }}
                        />
                        {getSlideTheme(s.bgTheme).label}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-foreground">
                      {s.title} <span className="text-primary">{s.highlight}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.subtitle}</p>

                    {pts.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {pts.map((pt, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(s)} className="h-8 px-3 text-xs">
                    <Edit size={14} className="mr-1.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Remover o slide "${s.title}"?`)) {
                        deleteMutation.mutate({ id: s.id });
                      }
                    }}
                    className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={14} className="mr-1.5" /> Excluir
                  </Button>
                </div>
              </div>
            );
          })}

          {slides.length === 0 && (
            <div className="col-span-full py-16 text-center bg-card border border-border/50 rounded-2xl">
              <ImageIcon size={40} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-bold text-foreground">Nenhum slide cadastrado ainda</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                O sistema está exibindo os slides padrão da Landing Page. Clique no botão acima para adicionar seus próprios prints e customizações.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Componente de Gestão de Clientes / Logos da Landing Page ────────────────
function LandingClientsManager() {
  const utils = trpc.useUtils();
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [testimonial, setTestimonial] = useState("");
  const [order, setOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const { data: clients, isLoading, isError, refetch } = trpc.superAdmin.listLandingClients.useQuery();

  const createMutation = trpc.superAdmin.createLandingClient.useMutation({
    onSuccess: () => {
      toast.success("Cliente adicionado com sucesso!");
      utils.superAdmin.listLandingClients.invalidate();
      utils.publicData.getLandingClients.invalidate();
      setIsClientModalOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const updateMutation = trpc.superAdmin.updateLandingClient.useMutation({
    onSuccess: () => {
      toast.success("Cliente atualizado com sucesso!");
      utils.superAdmin.listLandingClients.invalidate();
      utils.publicData.getLandingClients.invalidate();
      setIsClientModalOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(`Erro ao atualizar: ${err.message}`),
  });

  const deleteMutation = trpc.superAdmin.deleteLandingClient.useMutation({
    onSuccess: () => {
      toast.success("Cliente removido com sucesso!");
      utils.superAdmin.listLandingClients.invalidate();
      utils.publicData.getLandingClients.invalidate();
    },
    onError: (err) => toast.error(`Erro ao remover: ${err.message}`),
  });

  const resetForm = () => {
    setEditingClient(null);
    setName("");
    setLogoUrl("");
    setWebsiteUrl("");
    setTestimonial("");
    setOrder(0);
    setIsActive(true);
  };

  const handleOpenEdit = (client: any) => {
    setEditingClient(client);
    setName(client.name);
    setLogoUrl(client.logoUrl);
    setWebsiteUrl(client.websiteUrl || "");
    setTestimonial(client.testimonial || "");
    setOrder(client.order || 0);
    setIsActive(client.isActive);
    setIsClientModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe o nome do cliente ou escola");
    if (!logoUrl.trim()) return toast.error("Informe a URL ou imagem da logo");

    if (editingClient) {
      updateMutation.mutate({
        id: editingClient.id,
        name,
        logoUrl,
        websiteUrl: websiteUrl.trim() || null,
        testimonial: testimonial.trim() || null,
        order: Number(order),
        isActive,
      });
    } else {
      createMutation.mutate({
        name,
        logoUrl,
        websiteUrl: websiteUrl.trim() || null,
        testimonial: testimonial.trim() || null,
        order: Number(order),
        isActive,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Clientes & Escolas Parceiras na Landing Page</h2>
          <p className="text-sm text-muted-foreground">Adicione logos, nomes e depoimentos das escolas em destaque na página inicial.</p>
        </div>
        <Dialog open={isClientModalOpen} onOpenChange={(open) => {
          setIsClientModalOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={16} /> Novo Cliente / Logo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingClient ? "Editar Cliente / Logo" : "Adicionar Cliente na Landing Page"}</DialogTitle>
              <DialogDescription>Preencha os dados da escola parceira que será exibida na vitrine da Landing Page.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="client-name">Nome da Escola / Cliente *</Label>
                <Input
                  id="client-name"
                  placeholder="Ex: Escola de Música Harmonia"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="block text-sm font-semibold mb-1.5">Logo da Escola / Cliente *</Label>
                
                {logoUrl ? (
                  <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-lg bg-background border p-1 shrink-0 flex items-center justify-center overflow-hidden">
                        <img src={logoUrl} alt="Preview da Logo" className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">Imagem selecionada com sucesso</p>
                        <p className="text-[10px] text-muted-foreground truncate">Pronta para exibição na Landing Page</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLogoUrl("")}
                      className="text-xs text-destructive hover:bg-destructive/10 h-8 px-2.5 shrink-0"
                    >
                      <Trash2 size={14} className="mr-1" /> Trocar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Botão de Upload do Dispositivo (PC / Celular) */}
                    <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl cursor-pointer bg-primary/5 hover:bg-primary/10 transition-all">
                      <div className="flex flex-col items-center justify-center pt-2 pb-2">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1.5">
                          <Upload size={18} />
                        </div>
                        <p className="text-xs font-bold text-foreground text-center">
                          Clique para escolher do PC ou Galeria
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PNG, JPG, SVG, WebP (até 5MB)
                        </p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.error("A imagem deve ter no máximo 5MB");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const result = evt.target?.result as string;
                              if (result) {
                                setLogoUrl(result);
                                toast.success("Logo carregada com sucesso!");
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    {/* Alternativa: Inserir URL direta */}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="relative flex-1">
                        <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Ou cole a URL da imagem aqui..."
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          className="pl-8 text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="client-site">Link do Site / Instagram (Opcional)</Label>
                <Input
                  id="client-site"
                  placeholder="https://instagram.com/escola"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="client-testi">Depoimento Curto (Opcional)</Label>
                <Input
                  id="client-testi"
                  placeholder="Ex: O MusicPro revolucionou nossa gestão escolar!"
                  value={testimonial}
                  onChange={(e) => setTestimonial(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="client-order">Ordem de Exibição</Label>
                  <Input
                    id="client-order"
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl mt-6">
                  <Label htmlFor="client-active" className="cursor-pointer">Ativo na Landing</Label>
                  <Switch id="client-active" checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>

              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                {editingClient ? "Salvar Alterações" : "Adicionar Cliente"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <Loader2 className="animate-spin text-primary mx-auto my-10" />}

      {clients && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((c: any) => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-5 space-y-4 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-16 h-16 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0">
                    <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${c.isActive ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                      {c.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      #{c.order}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base text-foreground truncate">{c.name}</h3>
                  {c.websiteUrl && (
                    <a href={c.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block mt-0.5">
                      {c.websiteUrl}
                    </a>
                  )}
                  {c.testimonial && (
                    <p className="text-xs text-muted-foreground italic mt-2 line-clamp-2 bg-muted/30 p-2 rounded-lg border border-border/30">
                      "{c.testimonial}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(c)} className="h-8 px-3 text-xs">
                  <Edit size={14} className="mr-1.5" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (confirm(`Remover "${c.name}" da landing page?`)) {
                    deleteMutation.mutate({ id: c.id });
                  }
                }} className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10">
                  <Trash2 size={14} className="mr-1.5" /> Excluir
                </Button>
              </div>
            </div>
          ))}

          {clients.length === 0 && (
            <div className="col-span-full py-16 text-center bg-card border border-border/50 rounded-2xl">
              <Building size={40} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-base font-bold text-foreground">Nenhum cliente cadastrado ainda</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Clique no botǜo acima para adicionar a logo e o nome das escolas parceiras para serem exibidas na Landing Page.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Gestão de Tutoriais do Sistema (PRD Tutoriais) ───────────────────────────
// Superadmin cadastra vídeos do YouTube (link) que aparecem na aba "Tutoriais"
// do menu do professor/admin. Mesmo mecanismo do Repertório: videoId extraído
// server-side; capa via VideoThumb (cascata maxres/hq/mq); player no portal.
function TutorialsManager() {
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<{
    youtubeUrl: string; title: string; category: string; description: string; isActive: boolean;
  }>({ youtubeUrl: "", title: "", category: "Geral", description: "", isActive: true });

  const { data: tutorials = [], isLoading } = trpc.tutorials.listAll.useQuery();

  const invalidate = () => {
    utils.tutorials.listAll.invalidate();
    utils.tutorials.list.invalidate();
  };

  const createMutation = trpc.tutorials.create.useMutation({
    onSuccess: () => { toast.success("Tutorial criado com sucesso!"); invalidate(); setModalOpen(false); resetForm(); },
    onError: (e) => toast.error(e.message || "Erro ao criar o tutorial."),
  });
  const updateMutation = trpc.tutorials.update.useMutation({
    onSuccess: () => { toast.success("Tutorial atualizado!"); invalidate(); setModalOpen(false); resetForm(); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar o tutorial."),
  });
  const deleteMutation = trpc.tutorials.delete.useMutation({
    onSuccess: () => { toast.success("Tutorial removido."); invalidate(); },
    onError: (e) => toast.error(e.message || "Erro ao remover o tutorial."),
  });
  const moveMutation = trpc.tutorials.move.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao reordenar."),
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ youtubeUrl: "", title: "", category: "Geral", description: "", isActive: true });
  };

  const openCreate = () => { resetForm(); setModalOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      youtubeUrl: t.youtubeUrl || "",
      title: t.title || "",
      category: t.category || "Geral",
      description: t.description || "",
      isActive: t.isActive,
    });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.youtubeUrl.trim()) { toast.error("Cole o link do YouTube."); return; }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tighter leading-tight">
            Tutoriais do Sistema
          </h3>
          <p className="text-[10px] sm:text-xs text-muted-foreground font-bold mt-0.5">
            Vídeos do YouTube que aparecem na aba "Tutoriais" do menu (professor/admin)
          </p>
        </div>
        <Button onClick={openCreate} className="w-fit">
          <Plus size={15} /> Adicionar Tutorial
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden animate-pulse">
              <div className="aspect-video bg-muted/50" />
              <div className="p-3 space-y-2"><div className="h-3 w-2/3 bg-muted rounded" /></div>
            </div>
          ))}
        </div>
      ) : tutorials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-card/30 rounded-2xl border border-dashed border-border/50">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-3">
            <GraduationCap size={26} />
          </div>
          <p className="text-sm font-black text-foreground">Nenhum tutorial cadastrado</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px]">
            Adicione o link do YouTube do primeiro tutorial — ele aparecerá para todos os professores e admins.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tutorials.map((t: any) => (
            <div key={t.id} className="rounded-2xl border border-white/10 bg-card/40 overflow-hidden shadow-lg shadow-primary/5 hover:border-indigo-500/40 transition-all duration-300">
              <div className="aspect-video bg-muted/50 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-purple-600/20">
                  <GraduationCap size={32} className="text-indigo-500/60" />
                </div>
                {t.videoId && (
                  <VideoThumb videoId={t.videoId} alt={t.title} className="absolute inset-0 w-full h-full object-cover" />
                )}
                <span className={cn(
                  "absolute top-2 left-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                  t.isActive ? "bg-emerald-600/90 text-white" : "bg-zinc-600/90 text-white"
                )}>
                  {t.isActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-foreground truncate">{t.title}</h4>
                    <p className="text-[9px] text-muted-foreground font-bold mt-0.5">{t.category || "Geral"}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button title="Subir" onClick={() => moveMutation.mutate({ id: t.id, direction: "up" })}
                      className="w-8 h-8 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer">
                      <ChevronUp size={13} />
                    </button>
                    <button title="Descer" onClick={() => moveMutation.mutate({ id: t.id, direction: "down" })}
                      className="w-8 h-8 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer">
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer">
                    <Switch
                      checked={t.isActive}
                      onCheckedChange={(v) => updateMutation.mutate({ id: t.id, isActive: v })}
                    />
                    Ativo
                  </label>
                  <button onClick={() => openEdit(t)}
                    className="flex-1 h-9 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                    <Edit size={11} /> Editar
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remover o tutorial "${t.title}"? Esta ação é definitiva.`)) deleteMutation.mutate({ id: t.id }); }}
                    className="h-9 w-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 flex items-center justify-center transition-all cursor-pointer"
                    title="Remover definitivamente"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tutorial" : "Adicionar Tutorial"}</DialogTitle>
            <DialogDescription>
              Cole o link do YouTube — o vídeo aparece na aba "Tutoriais" do professor/admin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Link do YouTube *</Label>
              <Input
                value={form.youtubeUrl}
                onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Como cadastrar um aluno"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Geral"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ativo</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                  <span className="text-xs font-bold">{form.isActive ? "Visível" : "Oculto"}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Breve descrição do que o tutorial ensina"
                className="w-full rounded-xl border border-border/60 bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editing ? "Salvar Alterações" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

