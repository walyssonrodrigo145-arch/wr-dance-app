import { DanceProLogo } from '@/components/DanceProLogo';
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Calendar,
  Library,
  ClipboardCheck,
  Activity,
  MessageSquare,
  DollarSign,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Music,
  X,
  CalendarDays,
  Bell,
  RefreshCcw,
  Clock,
  PlusCircle,
  Target,
  FileSignature,
  Trophy,
  Theater,
  Shirt,
  Users,
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

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/aluno", icon: LayoutDashboard },
  { label: "Avisos", href: "/aluno/avisos", icon: Bell },
  { label: "Mensagens", href: "/aluno/mensagens", icon: MessageSquare },
  { label: "Aulas / Agenda", href: "/aluno/aulas", icon: CalendarDays },
  { label: "Turmas", href: "/aluno/turmas", icon: Users },
  { label: "Materiais", href: "/aluno/materiais", icon: Library },
  { label: "Coreografias", href: "/aluno/coreografias", icon: Music },
  { label: "Eventos", href: "/aluno/eventos", icon: Theater },
  { label: "Figurinos", href: "/aluno/figurinos", icon: Shirt },
  { label: "Exercícios", href: "/aluno/exercicios", icon: ClipboardCheck },
  { label: "Plano Diário", href: "/aluno/progresso", icon: Target },
  { label: "Resultados", href: "/aluno/resultados", icon: Trophy },
  { label: "Financeiro", href: "/aluno/pagamentos", icon: DollarSign },
  { label: "Contratos", href: "/aluno/contratos", icon: FileSignature },
  { label: "Meu Perfil", href: "/aluno/perfil", icon: User },
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

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AL";

  const filteredNavItems = mainNavItems.filter(item => {
    if (!profile?.permissions) return true;
    const perms = profile.permissions as Record<string, boolean>;
    if (item.href === "/aluno/pagamentos" && perms.canSeeFinanceiro === false) return false;
    if (item.href === "/aluno/aulas" && perms.canSeeSchedule === false) return false;
    if (item.href === "/aluno/materiais" && perms.canSeeFiles === false) return false;
    if (item.href === "/aluno/exercicios" && perms.canSeeProgress === false) return false;
    if (item.href === "/aluno/progresso" && perms.canSeeProgress === false) return false;
    if (item.href === "/aluno/mensagens" && perms.canSeeMessages === false) return false;

    return true;
  });


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

      {/* Navigation - Polished Links */}
      <nav className="flex-1 px-5 py-4 space-y-2 overflow-y-auto no-scrollbar scroll-smooth">
        {!collapsed && (
          <div className="flex items-center gap-4 px-3 mb-6 animate-in fade-in duration-700">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sidebar-foreground/30">Plataforma</p>
            <div className="h-px flex-1 bg-sidebar-border/20" />
          </div>
        )}
        
        <div className="space-y-1.5">
          {filteredNavItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/aluno" && location.startsWith(item.href));
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
