import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Music,
  Calendar,
  BarChart3,
  Settings,
  Guitar,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  DollarSign,
  Activity,
  X,
  Megaphone,
  Inbox,
  Sparkles,
  Zap,
  CreditCard,
  ShieldAlert,
  ArrowRight,
  Gem,
  Bot,
  Brain,
  FileText,
  ChevronDown,
  Compass,
  HeartHandshake,
  Wallet,
  FolderKanban,
  DoorOpen,
  Target,
  FileSignature,
  Receipt,
  Trophy,
  Repeat,
  GraduationCap,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsNew } from "@/components/novidades/WhatsNewProvider";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavGroup {
  groupName: string;
  groupIcon: React.ElementType;
  textColor: string;
  items: {
    label: string;
    href: string;
    icon: React.ElementType;
    badge?: number;
    dot?: boolean;
    activeStyle?: string;
  }[];
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function AppSidebar({ collapsed, onToggle, onNavigate }: AppSidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: reminderCount = 0 } = trpc.reminders.pendingCount.useQuery();
  const { data: requestCount = 0 } = trpc.reschedule.pendingCount.useQuery();
  const { data: extraRequestCount = 0 } = trpc.extraRequests.pendingCount.useQuery();
  const { data: repositionCount = 0 } = trpc.repositions.pendingCount.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: mySub } = trpc.platform.mySubscription.useQuery();
  const { data: publicPlans = [] } = trpc.platform.getPublicPlans.useQuery();

  const activePlanObj = publicPlans.find((p) => p.id === mySub?.planId);
  const activePlanName = (mySub as any)?.planName || activePlanObj?.name || (
    mySub?.planId
      ? `Plano ${mySub.planId.charAt(0).toUpperCase() + mySub.planId.slice(1)}`
      : "Plano Premium"
  );

  const hiddenTabs = settings?.hiddenTabs ? settings.hiddenTabs.split(",") : [];
  const { hasUnseen: hasUnseenRelease, isAllowed: whatsNewAllowed } = useWhatsNew();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  // Grupos do Menu Categorizado (com ícone temático para cada aba)
  const navGroups: NavGroup[] = [
    {
      groupName: "PRINCIPAL",
      groupIcon: Compass,
      textColor: "text-indigo-400",
      items: [
        { label: "IA Assistente", href: "/ia", icon: Sparkles, activeStyle: "bg-[#1E1B4B] text-white border-l-4 border-[#5B50E6] shadow-lg shadow-indigo-950/50" },
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Alunos", href: "/alunos", icon: Users },
        // Gestão de Professores: EXCLUSIVO do admin (professor não vê este item)
        ...(user?.role === "admin" ? [{ label: "Professores", href: "/professores", icon: Users }] : []),
        { label: "Aulas", href: "/aulas", icon: Calendar },
        { label: "Reposições", href: "/reposicoes", icon: Repeat, badge: repositionCount > 0 ? repositionCount : undefined },
        { label: "Instrumentos", href: "/instrumentos", icon: Guitar },
        { label: "Salas de Estúdio", href: "/salas", icon: DoorOpen },
        { label: "Rankings", href: "/rankings", icon: Trophy },
        { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
      ],
    },
    {
      groupName: "RELACIONAMENTO",
      groupIcon: HeartHandshake,
      textColor: "text-blue-400",
      items: [
        { label: "Comunicados", href: "/comunicados", icon: Megaphone },
      ],
    },
    {
      groupName: "FINANCEIRO",
      groupIcon: Wallet,
      textColor: "text-emerald-400",
      items: [
        { label: "Finanças", href: "/financeiro", icon: DollarSign },
        { label: "Folha de Pagamento", href: "/folha", icon: FileText, activeStyle: "bg-[#062E1E] text-white border-l-4 border-emerald-500 shadow-lg shadow-emerald-950/50" },
        { label: "Contratos", href: "/contratos", icon: FileSignature },
      ],
    },
    {
      groupName: "AUTOMAÇÕES",
      groupIcon: Zap,
      textColor: "text-amber-400",
      items: [
        { label: "Automação", href: "/automacoes", icon: Zap },
        { label: "Robô WhatsApp", href: "/chatbot-fluxo", icon: Bot },
        { label: "Cérebro da IA", href: "/base-conhecimento-ia", icon: Brain },
        { label: "Lembretes", href: "/lembretes", icon: Bell, badge: reminderCount > 0 ? reminderCount : undefined },
      ],
    },
    {
      groupName: "OUTROS",
      groupIcon: FolderKanban,
      textColor: "text-purple-400",
      items: [
        { label: "Solicitações", href: "/solicitacoes", icon: Inbox, badge: (requestCount + extraRequestCount) > 0 ? requestCount + extraRequestCount : undefined },
        { label: "Progresso", href: "/progresso", icon: Activity },
        { label: "Recepção QR", href: "/recepcao-qr", icon: LayoutDashboard },
        { label: "Tutoriais", href: "/tutoriais", icon: GraduationCap },
        { label: "Novidades", href: "/novidades", icon: Sparkles, dot: whatsNewAllowed && hasUnseenRelease },
      ],
    },
  ];

  // Estado local com localStorage para controlar categorias recolhidas
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("musicpro_sidebar_groups");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore parse errors
    }
    // Por padrão: Somente o menu PRINCIPAL vem aberto, os outros começam fechados
    return {
      "RELACIONAMENTO": true,
      "FINANCEIRO": true,
      "AUTOMAÇÕES": true,
      "OUTROS": true,
    };
  });

  // Auto-expandir grupo caso a rota atual pertença a ele
  useEffect(() => {
    const currentGroup = navGroups.find((g) => g.items.some((item) => item.href === location));
    if (currentGroup && collapsedGroups[currentGroup.groupName]) {
      setCollapsedGroups((prev) => ({ ...prev, [currentGroup.groupName]: false }));
    }
  }, [location]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const updated = { ...prev, [groupName]: !prev[groupName] };
      localStorage.setItem("musicpro_sidebar_groups", JSON.stringify(updated));
      return updated;
    });
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "WR";

  const firstName = user?.name ? user.name.split(" ")[0] : "Walysson";

  return (
    <aside
      id="tour-sidebar"
      className={cn(
        "flex flex-col bg-[#070514] text-slate-300 transition-all duration-300 ease-in-out relative border-r border-indigo-950/40 shadow-2xl z-30 select-none overflow-hidden",
        collapsed ? "w-[80px]" : "w-[270px]",
        "lg:translate-x-0"
      )}
      style={{ height: '100dvh', maxHeight: '100dvh', overflowX: 'hidden', flexShrink: 0 }}
    >
      {/* Botão de Fechar Mobile */}
      <button
        onClick={onToggle}
        className="lg:hidden absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors z-50"
        aria-label="Fechar menu"
      >
        <X size={18} />
      </button>

      {/* HEADER TOP DA SIDEBAR (LOGO + TOGGLE COLLAPSE) */}
      <div className={cn(
        "flex flex-col border-b border-indigo-950/30 relative",
        collapsed ? "items-center justify-center px-1 py-3" : "px-3 py-2"
      )}>
        {(user as any)?.schoolLogo ? (
          collapsed ? (
            /* Collapsed: logo compacta + botão explícito de expandir */
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                type="button"
                onClick={onToggle}
                className="w-11 h-11 flex items-center justify-center overflow-hidden hover:scale-105 transition-transform cursor-pointer"
                title="Clique para expandir o menu"
              >
                <img
                  src={(user as any).schoolLogo}
                  alt="Logo da Escola"
                  className="w-full h-full object-contain object-center"
                />
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="w-7 h-7 rounded-full bg-slate-900/90 border border-indigo-950/80 text-slate-400 hover:text-white hover:bg-indigo-600 flex items-center justify-center transition-all shadow-md cursor-pointer"
                title="Expandir menu lateral"
                aria-label="Expandir menu"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            /* Expanded: Logo ajustada sem excesso de fundo roxo */
            <div className="w-full relative flex items-center justify-between gap-1">
              <div className="flex-1 flex items-center justify-center py-1 overflow-hidden">
                <img
                  src={(user as any).schoolLogo}
                  alt="Logo da Escola"
                  className="block w-full max-w-full h-auto object-contain object-center"
                />
              </div>

              {/* Botão recolher no canto direito */}
              <button
                type="button"
                onClick={onToggle}
                className="rounded-full bg-slate-900/90 border border-indigo-950/80 text-slate-400 hover:text-white hover:bg-indigo-600 w-7 h-7 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-md"
                title="Recolher menu lateral"
                aria-label="Recolher menu"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          )
        ) : (
          /* Sem logo */
          collapsed ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                type="button"
                onClick={onToggle}
                className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-blue-500/30 flex-shrink-0 overflow-hidden hover:scale-105 transition-transform cursor-pointer"
                title="Clique para expandir o menu"
              >
                <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center relative z-10">
                  <div className="flex items-center gap-[3px] h-4">
                    <div className="w-1 bg-white/90 rounded-full h-2" />
                    <div className="w-1 bg-white/90 rounded-full h-4" />
                    <div className="w-1 bg-white rounded-full h-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    <div className="w-1 bg-white/90 rounded-full h-3" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="w-7 h-7 rounded-full bg-slate-900/90 border border-indigo-950/80 text-slate-400 hover:text-white hover:bg-indigo-600 flex items-center justify-center transition-all shadow-md cursor-pointer"
                title="Expandir menu lateral"
                aria-label="Expandir menu"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3 min-w-0 text-left">
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-blue-500/30 flex-shrink-0 overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center relative z-10">
                    <div className="flex items-center gap-[3px] h-4">
                      <div className="w-1 bg-white/90 rounded-full h-2" />
                      <div className="w-1 bg-white/90 rounded-full h-4" />
                      <div className="w-1 bg-white rounded-full h-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                      <div className="w-1 bg-white/90 rounded-full h-3" />
                    </div>
                  </div>
                </div>
                {(user as any)?.showSchoolName !== 0 && (
                  <div className="min-w-0 flex-1 pr-1" title={(user as any)?.schoolName || "WR Gestão Musical"}>
                    <p className="text-sm font-black text-white tracking-tight font-outfit leading-tight break-words line-clamp-2">
                      {(user as any)?.schoolName || "WR"}
                    </p>
                    <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mt-0.5 truncate">
                      GESTÃO MUSICAL
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onToggle}
                className="rounded-full bg-slate-900/90 border border-indigo-950/80 text-slate-400 hover:text-white hover:bg-indigo-600 w-8 h-8 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-md"
                title="Recolher menu lateral"
                aria-label="Recolher menu"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          )
        )}
      </div>

      {/* NAVEGAÇÃO CATEGORIZADA COM ÍCONES E ACORDEÃO */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar">
        {navGroups.map((group) => {
          // Filtrar itens ocultos
          const visibleItems = group.items.filter((item) => !hiddenTabs.includes(item.href));
          if (visibleItems.length === 0) return null;
          const isGroupCollapsed = !collapsed && !!collapsedGroups[group.groupName];
          const GroupIcon = group.groupIcon;

          return (
            <div key={group.groupName} className="space-y-1">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupName)}
                  className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group/header select-none text-left"
                  title={isGroupCollapsed ? "Expandir categoria" : "Recolher categoria"}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon className={cn("w-3.5 h-3.5 shrink-0", group.textColor)} />
                    <span className={cn("text-[10px] font-black uppercase tracking-widest font-outfit", group.textColor)}>
                      {group.groupName}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "text-slate-500 group-hover/header:text-white transition-transform duration-300",
                      isGroupCollapsed && "-rotate-90 text-slate-600"
                    )}
                  />
                </button>
              )}

              {!isGroupCollapsed && (
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));

                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer group relative overflow-hidden",
                            isActive
                              ? item.activeStyle || "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30"
                              : "text-slate-400 hover:text-white hover:bg-white/5",
                            collapsed && "justify-center px-0"
                          )}
                          title={collapsed ? item.label : undefined}
                        >
                          <Icon
                            size={17}
                            className={cn(
                              "shrink-0 transition-transform duration-200",
                              isActive ? "scale-110 text-white" : "group-hover:scale-110 group-hover:text-indigo-400"
                            )}
                          />
                          {!collapsed && <span className="truncate tracking-tight">{item.label}</span>}
                          {!collapsed && item.badge && (
                            <span className="ml-auto bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md">
                              {item.badge}
                            </span>
                          )}
                          {!collapsed && !item.badge && item.dot && (
                            <span className="ml-auto relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* BANNER PROMO: PLANO DA ESCOLA */}
        {!collapsed && (
          <div className="mx-1 mt-4 p-4 rounded-2xl bg-gradient-to-br from-[#120F2E] to-[#18143C] border border-indigo-950/80 shadow-xl relative overflow-hidden group">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Gem size={18} />
              </div>
              <div>
                <p className="text-xs font-extrabold text-white font-outfit">{activePlanName}</p>
                <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                  Aproveite todos os recursos exclusivos para sua escola.
                </p>
              </div>
            </div>

            <Link href="/assinatura">
              <Button
                onClick={onNavigate}
                className="w-full h-9 mt-3 bg-gradient-to-r from-[#4F46E5] to-[#3B82F6] hover:from-[#4338CA] hover:to-[#2563EB] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <span>Ver benefícios</span>
                <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        )}
      </nav>

      {/* SUPORTE / FALE CONOSCO (WhatsApp) */}
      <div className={cn("px-3 pt-3", collapsed && "px-2 flex justify-center")}>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Fale conosco no WhatsApp"
          className={cn(
            "flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-bold text-xs transition-all active:scale-95",
            collapsed && "w-10 h-10"
          )}
        >
          <MessageCircle size={16} />
          {!collapsed && <span>Fale conosco</span>}
        </a>
      </div>

      {/* FOOTER USER PROFILE */}
      <div className={cn(
        "p-3.5 bg-[#0D0A22] border-t border-indigo-950/50 flex items-center justify-between",
        collapsed && "justify-center p-2"
      )}>
        {collapsed ? (
          <Avatar className="w-9 h-9 cursor-pointer border border-indigo-500/30" title={user?.name ?? "Perfil"}>
            <AvatarFallback className="bg-indigo-600 text-white text-xs font-extrabold">
              {initials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-md">
                  {initials}
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-[#070514] absolute bottom-0 right-0 shadow-xs" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-snug">{firstName}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {user?.role === 'admin' ? 'Administrador' : user?.role === 'professor' ? 'Professor' : 'Membro'}
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                  <ChevronDown size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#13102B] text-slate-200 border-indigo-950 text-xs w-44">
                <DropdownMenuItem onClick={() => (window.location.href = "/configuracoes")} className="cursor-pointer hover:bg-white/5">
                  <Settings size={14} className="mr-2 text-indigo-400" /> Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="cursor-pointer text-rose-400 hover:bg-rose-500/10">
                  <LogOut size={14} className="mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </aside>
  );
}
