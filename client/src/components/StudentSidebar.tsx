import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Library,
  ClipboardCheck,
  Activity,
  MessageSquare,
  DollarSign,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Music,
  X,
  CalendarDays,
  Bell,
  Target,
  FileSignature,
  Trophy,
  Theater,
  Shirt,
  Users,
  Compass,
  HeartHandshake,
  Wallet,
  PersonStanding,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  groupName: string;
  groupIcon: React.ElementType;
  textColor: string;
  items: NavItem[];
}

/**
 * Menu do portal do aluno organizado por repartições (mesmo padrão do painel
 * administrativo), com accordion e estado persistido — evita a lista corrida
 * e extensa que existia antes.
 */
const navGroups: NavGroup[] = [
  {
    groupName: "PRINCIPAL",
    groupIcon: Compass,
    textColor: "text-indigo-400",
    items: [
      { label: "Dashboard", href: "/aluno", icon: LayoutDashboard },
      { label: "Aulas / Agenda", href: "/aluno/aulas", icon: CalendarDays },
      { label: "Turmas", href: "/aluno/turmas", icon: Users },
    ],
  },
  {
    groupName: "MEU PROGRESSO",
    groupIcon: Activity,
    textColor: "text-sky-400",
    items: [
      { label: "Materiais", href: "/aluno/materiais", icon: Library },
      { label: "Exercícios", href: "/aluno/exercicios", icon: ClipboardCheck },
      { label: "Plano Diário", href: "/aluno/progresso", icon: Target },
      { label: "Resultados", href: "/aluno/resultados", icon: Trophy },
    ],
  },
  {
    groupName: "DANÇA & PALCO",
    groupIcon: PersonStanding,
    textColor: "text-fuchsia-400",
    items: [
      { label: "Coreografias", href: "/aluno/coreografias", icon: Music },
      { label: "Eventos", href: "/aluno/eventos", icon: Theater },
      { label: "Figurinos", href: "/aluno/figurinos", icon: Shirt },
    ],
  },
  {
    groupName: "RELACIONAMENTO",
    groupIcon: HeartHandshake,
    textColor: "text-blue-400",
    items: [
      { label: "Avisos", href: "/aluno/avisos", icon: Bell },
      { label: "Mensagens", href: "/aluno/mensagens", icon: MessageSquare },
    ],
  },
  {
    groupName: "FINANCEIRO",
    groupIcon: Wallet,
    textColor: "text-emerald-400",
    items: [
      { label: "Financeiro", href: "/aluno/pagamentos", icon: DollarSign },
      { label: "Contratos", href: "/aluno/contratos", icon: FileSignature },
    ],
  },
  {
    groupName: "CONTA",
    groupIcon: User,
    textColor: "text-purple-400",
    items: [
      { label: "Meu Perfil", href: "/aluno/perfil", icon: User },
    ],
  },
];

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function StudentSidebar({ collapsed, onToggle, onNavigate }: StudentSidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: messageCount = 0 } = trpc.chat.unreadCount.useQuery();
  const { data: profile } = trpc.studentPortal.getProfile.useQuery(undefined, {
    enabled: user?.role === 'aluno',
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  // Estado local com localStorage para controlar categorias recolhidas
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("dancepro_student_sidebar_groups");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore parse errors
    }
    // Por padrão: somente PRINCIPAL aberto; demais começam recolhidos
    return {
      "MEU PROGRESSO": true,
      "DANÇA & PALCO": true,
      "RELACIONAMENTO": true,
      "FINANCEIRO": true,
      "CONTA": true,
    };
  });

  const isItemActive = (href: string) =>
    location === href || (href !== "/aluno" && location.startsWith(href));

  // Auto-expandir o grupo da rota atual
  useEffect(() => {
    const currentGroup = navGroups.find((group) => group.items.some((item) => isItemActive(item.href)));
    if (currentGroup && collapsedGroups[currentGroup.groupName]) {
      setCollapsedGroups((prev) => ({ ...prev, [currentGroup.groupName]: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const updated = { ...prev, [groupName]: !prev[groupName] };
      try {
        localStorage.setItem("dancepro_student_sidebar_groups", JSON.stringify(updated));
      } catch {
        // armazenamento indisponível — mantém apenas em memória
      }
      return updated;
    });
  };

  const canSeeItem = (item: NavItem) => {
    if (!profile?.permissions) return true;
    const perms = profile.permissions as Record<string, boolean>;
    if (item.href === "/aluno/pagamentos" && perms.canSeeFinanceiro === false) return false;
    if (item.href === "/aluno/aulas" && perms.canSeeSchedule === false) return false;
    if (item.href === "/aluno/materiais" && perms.canSeeFiles === false) return false;
    if (item.href === "/aluno/exercicios" && perms.canSeeProgress === false) return false;
    if (item.href === "/aluno/progresso" && perms.canSeeProgress === false) return false;
    if (item.href === "/aluno/mensagens" && perms.canSeeMessages === false) return false;
    return true;
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AL";

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out relative border-r border-sidebar-border z-20 overflow-hidden",
        collapsed ? "w-[90px]" : "w-[280px]",
        "lg:translate-x-0"
      )}
    >
      {/* Mobile Close Button */}
      <button
        onClick={onToggle}
        className="lg:hidden absolute top-6 right-4 w-12 h-12 rounded-2xl bg-sidebar-accent/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all z-50 shadow-xl border border-white/10"
        aria-label="Fechar menu"
      >
        <X size={24} />
      </button>

      {/* Toggle button - desktop only - Refined Style */}
      <button
        onClick={onToggle}
        className="hidden md:flex absolute -right-4 top-12 z-30 w-8 h-8 rounded-full bg-sidebar text-sidebar-foreground/70 items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:text-white hover:scale-110 active:scale-95 transition-all border border-sidebar-border/50 group"
        aria-label="Recolher menu"
      >
        <div className="transition-transform duration-500 group-hover:rotate-12">
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </div>
      </button>

      {/* Logo Section */}
      <div className={cn(
        "flex items-center gap-3 px-6 py-8",
        collapsed && "justify-center px-2"
      )}>
        {(user as any)?.schoolLogo ? (
          <div className="relative w-10 h-10 rounded-xl bg-slate-900/60 shadow-lg shadow-primary/20 border border-white/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
            <img src={(user as any).schoolLogo} alt="Logo da Escola" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-primary/30 flex-shrink-0 overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center relative z-10">
              <div className="flex items-center gap-[3px] h-4">
                <div className="w-1 bg-white/90 rounded-full h-2" />
                <div className="w-1 bg-white/90 rounded-full h-4" />
                <div className="w-1 bg-white rounded-full h-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                <div className="w-1 bg-white/90 rounded-full h-3" />
              </div>
            </div>
          </div>
        )}
        {!collapsed && (user as any)?.showSchoolName !== 0 && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-300 min-w-0 flex-1 pr-1" title={(user as any)?.schoolName || "DancePro"}>
            <p className="text-sm font-black text-white tracking-tight leading-tight break-words line-clamp-2">
              {(user as any)?.schoolName || "DancePro"}
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 font-bold uppercase tracking-widest mt-0.5 truncate">
              {(user as any)?.schoolLogo ? "Portal do Aluno" : "Premium Portal"}
            </p>
          </div>
        )}
      </div>

      {/* Navegação categorizada com accordion (mesmo padrão do painel admin) */}
      <nav className="flex-1 px-4 py-3 space-y-4 overflow-y-auto no-scrollbar scroll-smooth">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(canSeeItem);
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
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", group.textColor)}>
                      {group.groupName}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={cn(
                      "text-sidebar-foreground/40 group-hover/header:text-white transition-transform duration-300",
                      isGroupCollapsed && "-rotate-90 text-sidebar-foreground/30"
                    )}
                  />
                </button>
              )}

              {!isGroupCollapsed && (
                <div className="space-y-1.5">
                  {visibleItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isActive = isItemActive(item.href);
                    return (
                      <Link key={item.href} href={item.href}>
                        <div
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer group relative overflow-hidden",
                            isActive
                              ? "bg-indigo-600 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                            collapsed && "justify-center px-0"
                          )}
                          title={collapsed ? item.label : undefined}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <Icon
                            size={16}
                            className={cn(
                              "flex-shrink-0 transition-transform duration-300 relative z-10",
                              isActive ? "scale-110" : "group-hover:scale-110 group-hover:text-indigo-400"
                            )}
                          />
                          {!collapsed && (
                            <div className="flex-1 flex items-center justify-between min-w-0 z-10 relative">
                              <span className="truncate tracking-tight">{item.label}</span>
                              {item.href === "/aluno/mensagens" && messageCount > 0 && (
                                <span className="ml-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                  {messageCount}
                                </span>
                              )}
                            </div>
                          )}

                          {isActive && !collapsed && (
                            <div className="absolute left-[-4px] top-1/4 bottom-1/4 w-1 bg-white rounded-full shadow-[0_0_10px_#fff] z-20" />
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
      </nav>

      {/* User Footer */}
      <div className={cn(
        "p-4 bg-sidebar-accent/30 border-t border-sidebar-border mt-auto",
        collapsed ? "flex justify-center" : ""
      )}>
        {collapsed ? (
          <Avatar className="w-10 h-10 cursor-pointer border-2 border-sidebar-border shadow-xl" title={user?.name ?? "Perfil"}>
            <AvatarFallback className="bg-[#2563EB] text-white text-xs font-black">
              {initials}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex items-center gap-3 bg-sidebar-accent/50 p-3 rounded-2xl border border-sidebar-border/50 group/profile">
            <Avatar className="w-9 h-9 flex-shrink-0 border border-sidebar-border shadow-lg group-hover/profile:scale-105 transition-transform">
              <AvatarFallback className="bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white text-xs font-black">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate tracking-tight">{user?.name ?? "Aluno"}</p>
              <p className="text-[9px] text-sidebar-foreground/40 font-bold truncate uppercase tracking-tighter">Membro Premium</p>
            </div>
            <button
              className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center flex-shrink-0 transition-all"
              onClick={() => logoutMutation.mutate()}
              title="Sair da conta"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
