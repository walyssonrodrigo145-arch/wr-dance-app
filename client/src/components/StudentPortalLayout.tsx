import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { StudentSidebar } from "./StudentSidebar";
import { AppHeader } from "./AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Loader2, Music } from "lucide-react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useLocation } from "wouter";

interface StudentPortalLayoutProps {
  children: React.ReactNode;
}

export function StudentPortalLayout({ children }: StudentPortalLayoutProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const { isMobile, isTablet, isDesktop, isXL } = useBreakpoint();
  
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1280;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isTablet) {
      setCollapsed(true);
    } else if (isDesktop && !isXL) {
      setCollapsed(true);
    } else if (isXL) {
      setCollapsed(false);
    }
  }, [isTablet, isDesktop, isXL]);

  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        setLocation(getLoginUrl());
      } else if (user?.role && user.role !== 'aluno' && user.role !== 'admin') {
        setLocation("/dashboard");
      }
    }
  }, [loading, isAuthenticated, user?.role, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center overflow-hidden relative">
        {/* Animated Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        
        <div className="flex flex-col items-center gap-6 relative z-10 animate-in zoom-in duration-500">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/30 to-violet-500/30 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-500" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[2px] shadow-2xl border border-white/10 overflow-hidden">
              {(user as any)?.schoolLogo ? (
                <div className="w-full h-full rounded-3xl bg-slate-900/80 flex items-center justify-center overflow-hidden">
                  <img src={(user as any).schoolLogo} alt="Logo da escola" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full h-full bg-gradient-to-b from-blue-500 to-indigo-700 rounded-3xl flex items-center justify-center relative z-10">
                  <div className="flex items-center gap-[5px] h-8">
                    <div className="w-2 bg-white/90 rounded-full h-4 group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-2 bg-white/90 rounded-full h-8 group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-2 bg-white rounded-full h-full shadow-[0_0_12px_rgba(255,255,255,0.8)] group-hover:scale-110 transition-transform duration-500" />
                    <div className="w-2 bg-white/90 rounded-full h-6 group-hover:scale-110 transition-transform duration-500" />
                  </div>
                </div>
              )}
            </div>
            <div className="absolute inset-0 rounded-[2rem] border-2 border-white/20 animate-ping opacity-20" />
          </div>
          
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-white text-xl font-black tracking-tight">{(user as any)?.schoolName || "MusicPro"} Portal</h2>
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs font-black text-white/60 uppercase tracking-[0.2em]">Sincronizando seus dados...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== 'aluno' && user?.role !== 'admin')) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background" style={{ maxHeight: '100dvh' }}>
      {/* Mobile drawer overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar - Desktop & Tablet */}
      <div
        className="hidden md:flex flex-shrink-0 transition-all duration-300"
        style={{ width: collapsed ? '80px' : '260px', minWidth: collapsed ? '80px' : '260px' }}
      >
        <StudentSidebar 
          collapsed={collapsed} 
          onToggle={() => setCollapsed(!collapsed)} 
        />
      </div>

      {/* Sidebar - Mobile Drawer */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <StudentSidebar 
          collapsed={false} 
          onToggle={() => setMobileOpen(false)} 
          onNavigate={() => setMobileOpen(false)} 
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative" style={{ minWidth: 0 }}>
        <AppHeader onMobileMenuOpen={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-5 lg:p-6 scrollbar-thin no-scrollbar flex flex-col" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-[1600px] mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-500 flex-1">
            {children}
          </div>

          {/* Marca d'água de Marketing (Growth) */}
          <div className="mt-auto pt-12 pb-2 w-full flex justify-center opacity-70 hover:opacity-100 transition-opacity">
            <a 
              href="/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              <span>Plataforma educacional com tecnologia</span>
              <span className="font-black text-primary tracking-tight">MusicPro</span>
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
