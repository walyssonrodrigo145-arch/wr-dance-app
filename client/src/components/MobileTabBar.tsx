import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, Calendar, DollarSign, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  onMenuClick: () => void;
}

export function MobileTabBar({ onMenuClick }: MobileTabBarProps) {
  const [location] = useLocation();

  const tabs = [
    { label: "Início", href: "/dashboard", icon: LayoutDashboard },
    { label: "Alunos", href: "/alunos", icon: Users },
    { label: "Aulas", href: "/aulas", icon: Calendar },
    { label: "Finanças", href: "/financeiro", icon: DollarSign },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-2 py-2 flex items-center justify-between" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
      {tabs.map((tab) => {
        const isActive = location === tab.href || (location.startsWith(tab.href) && tab.href !== "/");
        const Icon = tab.icon;
        
        return (
          <Link key={tab.href} href={tab.href}>
            <a className={cn(
              "flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all relative",
              isActive ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}>
              {isActive && (
                <div className="absolute -top-[17px] left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 rounded-b-full shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
              <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
            </a>
          </Link>
        );
      })}

      {/* Botão Menu Lateral */}
      <button
        onClick={onMenuClick}
        className="flex flex-col items-center justify-center w-16 h-12 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
      >
        <Menu size={20} strokeWidth={2} className="mb-1" />
        <span className="text-[10px] font-bold tracking-tight">Menu</span>
      </button>
    </div>
  );
}
