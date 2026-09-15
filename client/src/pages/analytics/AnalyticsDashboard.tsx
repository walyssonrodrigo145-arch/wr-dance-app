/**
 * AnalyticsDashboard.tsx — Dashboard principal do MusicPro Analytics
 * 
 * 14+ abas com métricas completas: visitantes, receita, conversão,
 * heatmap, funil, campanhas, mapa, dispositivos, IA insights e mais.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, Activity, TrendingUp, TrendingDown, DollarSign,
  Globe, Monitor, Smartphone, Tablet, Chrome, Zap,
  Target, MousePointer, Eye, Clock, ArrowRight, Layers,
  BarChart2, Map, Cpu, Brain, FileText, Download, Search,
  AlertCircle, CheckCircle, Info, ArrowUp, ArrowDown,
  RefreshCw, Filter, Calendar, Shield, ShieldAlert, Lock,
  AlertTriangle, ChevronLeft, ChevronRight, Loader2,
  Building2, Wifi, WifiOff, GraduationCap, UserCheck, CreditCard, SearchX,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import DashboardComercial from "../DashboardComercial";

// ── Paleta de cores ───────────────────────────────────────────────────────────
const COLORS = ["#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];
const GRADIENT_PURPLE = "from-violet-600 to-indigo-600";
const GRADIENT_TEAL = "from-teal-500 to-cyan-500";
const GRADIENT_ROSE = "from-rose-500 to-pink-600";
const GRADIENT_AMBER = "from-amber-500 to-orange-500";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type TabId =
  | "overview" | "crm" | "evolution" | "realtime" | "visitors" | "sources" | "pages"
  | "heatmap" | "funnel" | "journey" | "checkout" | "revenue"
  | "subscriptions" | "campaigns" | "map" | "devices" | "performance" | "ai" | "security" | "schools";

type Preset = "today" | "yesterday" | "7d" | "30d" | "90d" | "month" | "year" | "custom";

// ── Componentes auxiliares ────────────────────────────────────────────────────

const presetLabels: Record<Preset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  month: "Este mês",
  year: "Este ano",
  custom: "Personalizado",
};

function MetricFilters({ value, onChange }: { value: Preset; onChange: (v: Preset) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(presetLabels) as Preset[]).filter(p => p !== "custom").map((preset) => (
        <button
          key={preset}
          onClick={() => onChange(preset)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            value === preset
              ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
              : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-violet-400/40"
          }`}
        >
          {presetLabels[preset]}
        </button>
      ))}
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  gradient: string;
  trend?: number; // percentual de variação
  delay?: number;
}

function KPICard({ title, value, subtitle, icon, gradient, trend, delay = 0 }: KPICardProps) {
  const displayValue = (value === undefined || value === null || value === "—" || value === "") ? 0 : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 backdrop-blur-md p-5 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-10 rounded-full translate-x-8 -translate-y-8`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest truncate">{title}</p>
          <p className="font-outfit text-3xl font-bold text-foreground mt-1 leading-none">{displayValue}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.abs(trend).toFixed(1)}% vs período anterior
            </div>
          )}
        </div>
        <div className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-outfit text-xl font-bold text-foreground flex items-center gap-2">
      {children}
    </h2>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <BarChart2 size={40} className="opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Aba: Visão Geral ──────────────────────────────────────────────────────────
function OverviewTab({ preset }: { preset: Preset }) {
  const cards = trpc.analytics.query.getDashboardCards.useQuery({ preset }, { refetchInterval: 30_000 });
  const visitors = trpc.analytics.query.getVisitorStats.useQuery({ preset }, { refetchInterval: 30_000 });

  const cardData = cards.data;
  const isLoading = cards.isLoading;
  const formatCurrency = (v?: number) => `R$ ${(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

  const isToday = preset === "today";
  const periodLabel = isToday ? "Hoje" : presetLabels[preset] || "no Período";

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KPICard
          title={`Visitantes (${periodLabel})`}
          value={isLoading ? "..." : (cardData?.visitorsToday ?? 0)}
          icon={<Users size={20} className="text-white" />}
          gradient={GRADIENT_PURPLE}
          delay={0}
        />
        <KPICard
          title="Online Agora"
          value={isLoading ? "..." : (cardData?.onlineNow ?? 0)}
          subtitle="em tempo real"
          icon={<Activity size={20} className="text-white" />}
          gradient={GRADIENT_TEAL}
          delay={0.05}
        />
        <KPICard
          title={`Novos Cadastros (${periodLabel})`}
          value={isLoading ? "..." : (cardData?.signupsToday ?? 0)}
          icon={<Users size={20} className="text-white" />}
          gradient={GRADIENT_PURPLE}
          delay={0.1}
        />
        <KPICard
          title={`Assinaturas (${periodLabel})`}
          value={isLoading ? "..." : (cardData?.subscriptionsToday ?? 0)}
          icon={<CheckCircle size={20} className="text-white" />}
          gradient={GRADIENT_TEAL}
          delay={0.15}
        />
        <KPICard
          title="Conversão"
          value={isLoading ? "..." : `${cardData?.conversionRate ?? 0}%`}
          icon={<Target size={20} className="text-white" />}
          gradient={GRADIENT_AMBER}
          delay={0.2}
        />
        <KPICard
          title={`Receita (${periodLabel})`}
          value={isLoading ? "..." : formatCurrency(cardData?.revenueToday)}
          icon={<DollarSign size={20} className="text-white" />}
          gradient={GRADIENT_ROSE}
          delay={0.25}
        />
        <KPICard
          title="Receita do Mês"
          value={isLoading ? "..." : formatCurrency(cardData?.revenueMonth)}
          icon={<TrendingUp size={20} className="text-white" />}
          gradient={GRADIENT_ROSE}
          delay={0.3}
        />
        <KPICard
          title="Receita Total"
          value={isLoading ? "..." : formatCurrency(cardData?.revenueTotal)}
          icon={<DollarSign size={20} className="text-white" />}
          gradient={GRADIENT_AMBER}
          delay={0.35}
        />
        <KPICard
          title="Receita Prevista (Próx. Mês)"
          value={isLoading ? "..." : formatCurrency((cardData as any)?.nextMonthForecast)}
          icon={<TrendingUp size={20} className="text-white" />}
          gradient={GRADIENT_TEAL}
          delay={0.38}
        />
        <KPICard
          title={`Testes Gratuitos (${periodLabel})`}
          value={isLoading ? "..." : (cardData?.trialsToday ?? 0)}
          icon={<Zap size={20} className="text-white" />}
          gradient={GRADIENT_PURPLE}
          delay={0.4}
        />
        <KPICard
          title={`Visitantes Únicos (${periodLabel})`}
          value={isLoading ? "..." : (cardData?.uniqueVisitorsToday ?? 0)}
          icon={<Eye size={20} className="text-white" />}
          gradient={GRADIENT_TEAL}
          delay={0.45}
        />
      </div>

      {/* Gráfico de Visitantes */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
        <SectionTitle><TrendingUp size={20} className="text-violet-500" /> Visitantes por Dia</SectionTitle>
        <div className="mt-6 h-64">
          {visitors.data?.byDay && visitors.data.byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visitors.data.byDay}>
                <defs>
                  <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  width={35}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Area type="monotone" dataKey="sessions" name="Sessões" stroke="#8b5cf6" fill="url(#gradSessions)" strokeWidth={2} />
                <Area type="monotone" dataKey="unique" name="Únicos" stroke="#06b6d4" fill="url(#gradUnique)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Nenhum dado de visitantes ainda. Os dados aparecerão conforme os visitantes acessam o site." />
          )}
        </div>
      </div>

      {/* Visitantes por Hora */}
      {visitors.data?.byHour && visitors.data.byHour.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Clock size={20} className="text-cyan-500" /> Visitantes por Hora</SectionTitle>
          <div className="mt-6 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitors.data.byHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                  formatter={(v) => [v, "Sessões"]}
                  labelFormatter={(h) => `${h}:00`}
                />
                <Bar dataKey="sessions" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba: Tempo Real ───────────────────────────────────────────────────────────
function RealtimeTab() {
  const { data, refetch } = trpc.analytics.query.getOnlineUsers.useQuery(undefined, { refetchInterval: 10_000 });

  const deviceIcon = (device: string | null) => {
    if (device === "mobile") return <Smartphone size={14} />;
    if (device === "tablet") return <Tablet size={14} />;
    return <Monitor size={14} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          <span className="font-outfit text-2xl font-bold">{data?.length ?? 0}</span>
          <span className="text-muted-foreground">usuários online agora</span>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Usuário", "Página Atual", "Localização", "Dispositivo", "Browser", "Origem", "Desde"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data || data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Activity size={32} className="opacity-20" />
                      <p>Nenhum usuário online no momento.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((user, i) => (
                  <motion.tr
                    key={user.sessionId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                        <span className="font-medium truncate max-w-[120px]">
                          {user.userName ?? `Anônimo #${user.visitorId.substring(0, 6)}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-xs text-muted-foreground truncate block">{user.pageTitle ?? user.pageUrl ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs">{[user.city, user.state, user.country].filter(Boolean).join(", ") || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {deviceIcon(user.deviceType)}
                        <span className="text-xs capitalize">{user.deviceType ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.browser ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.utmSource ?? "Direto"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(user.enteredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Aba: Origem do Tráfego ────────────────────────────────────────────────────
function SourcesTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getTrafficSources.useQuery({ preset });

  const sourceIcon = (source: string) => {
    const icons: Record<string, string> = {
      google: "🔍", instagram: "📸", facebook: "👥", whatsapp: "💬",
      tiktok: "🎵", youtube: "▶️", linkedin: "💼", direto: "🔗", referencia: "↗️",
    };
    return icons[source.toLowerCase()] ?? "🌐";
  };

  const total = data?.reduce((sum, s) => sum + s.sessions, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Gráfico de Pizza */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Globe size={18} className="text-violet-500" /> Canais de Tráfego</SectionTitle>
          <div className="mt-4 h-56">
            {data && data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="sessions" nameKey="source" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} sessões`]} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Sem dados de tráfego ainda." />}
          </div>
        </div>

        {/* Tabela de fontes */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Origem", "Sessões", "%", "Conversões", "Receita"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data || data.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">Sem dados ainda.</td></tr>
              ) : (
                data.map((s, i) => (
                  <motion.tr
                    key={s.source}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{sourceIcon(s.source)}</span>
                        <span className="font-medium capitalize">{s.source}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{s.sessions.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${total > 0 ? (s.sessions / total * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{s.percentage}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{s.conversions}</td>
                    <td className="px-4 py-3 font-medium text-emerald-600">
                      {s.revenue > 0 ? `R$ ${s.revenue.toFixed(2)}` : "—"}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Aba: Landing Pages ────────────────────────────────────────────────────────
function PagesTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getLandingPages.useQuery({ preset });

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["Página", "Visualizações", "Usuários Únicos", "Tempo Médio", "Status"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data || data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  <EmptyState message="Nenhuma página rastreada ainda." />
                </td>
              </tr>
            ) : (
              data.map((page, i) => (
                <motion.tr
                  key={`${page.pageUrl}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 max-w-[300px]">
                    <div>
                      <p className="font-medium truncate">{page.pageTitle ?? "Sem título"}</p>
                      <p className="text-xs text-muted-foreground truncate">{page.pageUrl ?? ""}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{page.totalViews?.toLocaleString("pt-BR") ?? 0}</td>
                  <td className="px-4 py-3">{page.uniqueVisitors?.toLocaleString("pt-BR") ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {page.avgTimeSec ? `${Math.floor(page.avgTimeSec / 60)}m ${page.avgTimeSec % 60}s` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      (page.totalViews ?? 0) > 100 ? "bg-emerald-500/20 text-emerald-600" : "bg-amber-500/20 text-amber-600"
                    }`}>
                      {(page.totalViews ?? 0) > 100 ? "Popular" : "Normal"}
                    </span>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aba: Funil de Conversão ───────────────────────────────────────────────────
function FunnelTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getConversionFunnel.useQuery({ preset }, { refetchInterval: 30_000 });

  const maxCount = data?.[0]?.count ?? 1;

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-8">
      <SectionTitle><Target size={18} className="text-violet-500" /> Funil de Conversão</SectionTitle>
      <div className="mt-8 space-y-3 max-w-2xl mx-auto">
        {!data || data.length === 0 ? (
          <EmptyState message="Sem dados de funil ainda. Aguarde que os visitantes comecem a navegar." />
        ) : (
          data.map((step, i) => {
            const width = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 4) : 4;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="origin-left"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{step.label}</span>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">{step.count.toLocaleString("pt-BR")}</span>
                    <span className="text-emerald-600 font-medium">{step.conversionRate}% conv.</span>
                    {step.loss > 0 && <span className="text-rose-500">-{step.loss.toLocaleString("pt-BR")}</span>}
                  </div>
                </div>
                <div className="h-10 bg-muted rounded-xl overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ delay: i * 0.08, duration: 0.6 }}
                    className="h-full rounded-xl flex items-center justify-end pr-3"
                    style={{ background: `hsl(${260 - i * 15}, 70%, ${55 + i * 3}%)` }}
                  >
                    {step.count > 0 && (
                      <span className="text-white text-xs font-bold">{width.toFixed(0)}%</span>
                    )}
                  </motion.div>
                </div>
                {i < data.length - 1 && (
                  <div className="flex justify-center mt-1">
                    <ArrowRight size={16} className="text-muted-foreground rotate-90" />
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Aba: Checkout ─────────────────────────────────────────────────────────────
function CheckoutTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getCheckoutAnalytics.useQuery({ preset });

  const steps = data ? [
    { label: "Checkout Iniciado", count: data.checkoutStarted, color: "bg-violet-500" },
    { label: "PIX Gerado", count: data.pixGenerated, color: "bg-indigo-500" },
    { label: "Pagamento Confirmado", count: data.paymentSuccess, color: "bg-emerald-500" },
    { label: "Primeiro Login", count: data.firstLogin, color: "bg-teal-500" },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 space-y-4">
          <SectionTitle><Target size={18} className="text-violet-500" /> Funil de Checkout</SectionTitle>
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-4">
              <div className={`w-10 h-10 ${step.color} rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>{i + 1}</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="font-outfit text-2xl font-bold">{step.count}</p>
              </div>
              {i < steps.length - 1 && <ArrowRight size={16} className="text-muted-foreground rotate-90" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><TrendingDown size={18} className="text-rose-500" /> Taxa de Abandono</SectionTitle>
          <div className="mt-6 flex flex-col items-center justify-center gap-4">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="#ef4444" strokeWidth="3"
                  strokeDasharray={`${parseFloat(data?.abandonRate ?? "0")} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-outfit text-3xl font-bold text-rose-500">{data?.abandonRate ?? 0}%</span>
                <span className="text-xs text-muted-foreground">abandono</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {data?.checkoutStarted} iniciaram o checkout.<br />
              {data?.paymentFailed ?? 0} pagamentos falharam.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aba: Receita ──────────────────────────────────────────────────────────────
function RevenueTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getRevenueStats.useQuery({ preset }, { refetchInterval: 30_000 });
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="MRR" value={fmt(data?.mrr ?? 0)} icon={<DollarSign size={20} className="text-white" />} gradient={GRADIENT_TEAL} />
        <KPICard title="ARR" value={fmt(data?.arr ?? 0)} icon={<TrendingUp size={20} className="text-white" />} gradient={GRADIENT_TEAL} delay={0.05} />
        <KPICard title="Ticket Médio" value={fmt(data?.avgTicket ?? 0)} icon={<Target size={20} className="text-white" />} gradient={GRADIENT_AMBER} delay={0.1} />
        <KPICard title="Receita Período" value={fmt(data?.periodRevenue ?? 0)} icon={<DollarSign size={20} className="text-white" />} gradient={GRADIENT_ROSE} delay={0.15} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Receita por Plano */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Layers size={18} className="text-violet-500" /> Receita por Plano</SectionTitle>
          <div className="mt-4 h-48">
            {data?.byPlan && data.byPlan.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byPlan} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <YAxis dataKey="planName" type="category" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "Receita"]} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Sem dados de receita por plano." />}
          </div>
        </div>

        {/* Receita por Campanha */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Target size={18} className="text-emerald-500" /> Receita por Campanha</SectionTitle>
          <div className="mt-4 space-y-2">
            {(data as any)?.byCampaign && (data as any).byCampaign.length > 0 ? (
              (data as any).byCampaign.map((c: any, i: number) => (
                <div key={c.campaign} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-medium truncate max-w-[180px]">{c.campaign}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{fmt(c.revenue)}</span>
                </div>
              ))
            ) : <EmptyState message="Sem dados de campanhas." />}
          </div>
        </div>
      </div>

      {/* Receita por Estado */}
      {(data as any)?.byState && (data as any).byState.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Map size={18} className="text-cyan-500" /> Receita por Estado</SectionTitle>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data as any).byState.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="state" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "Receita"]} />
                <Bar dataKey="revenue" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba: Campanhas ────────────────────────────────────────────────────────────
function CampaignsTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getCampaignStats.useQuery({ preset });

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["Campanha", "Origem", "Sessões", "Conversões", "Receita", "ROI", "CAC"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data || data.length === 0 ? (
              <tr><td colSpan={7} className="py-16"><EmptyState message="Sem dados de campanhas UTM ainda." /></td></tr>
            ) : (
              data.map((c, i) => (
                <motion.tr
                  key={`${c.campaign}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-medium max-w-[150px] truncate">{c.campaign}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{c.source}</td>
                  <td className="px-4 py-3">{c.sessions.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{c.conversions}</td>
                  <td className="px-4 py-3 font-medium text-emerald-600">
                    {c.revenue > 0 ? `R$ ${c.revenue.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.roi !== null ? (
                      <span className={`font-medium ${parseFloat(c.roi) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {parseFloat(c.roi) >= 0 ? "+" : ""}{c.roi}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.cac ? `R$ ${c.cac}` : "—"}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aba: Dispositivos ─────────────────────────────────────────────────────────
function DevicesTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getDeviceStats.useQuery({ preset });

  const deviceLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    desktop: { label: "Desktop", icon: <Monitor size={18} />, color: "#8b5cf6" },
    mobile: { label: "Mobile", icon: <Smartphone size={18} />, color: "#06b6d4" },
    tablet: { label: "Tablet", icon: <Tablet size={18} />, color: "#f59e0b" },
    tv: { label: "Smart TV", icon: <Monitor size={18} />, color: "#10b981" },
    unknown: { label: "Outros", icon: <Globe size={18} />, color: "#6b7280" },
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-6">
        {/* Dispositivos */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Monitor size={18} className="text-violet-500" /> Dispositivos</SectionTitle>
          <div className="mt-4 space-y-3">
            {data?.devices && data.devices.length > 0 ? (
              data.devices.map((d) => {
                const info = deviceLabels[d.device] ?? deviceLabels.unknown;
                const total = data.devices.reduce((sum, x) => sum + x.count, 0);
                const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
                return (
                  <div key={d.device} className="flex items-center gap-3">
                    <div className="text-muted-foreground">{info.icon}</div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{info.label}</span>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: info.color }} />
                      </div>
                    </div>
                    <span className="text-sm font-bold min-w-[40px] text-right">{d.count}</span>
                  </div>
                );
              })
            ) : <EmptyState message="Sem dados." />}
          </div>
        </div>

        {/* Browsers */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Chrome size={18} className="text-blue-500" /> Navegadores</SectionTitle>
          <div className="mt-4 h-48">
            {data?.browsers && data.browsers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.browsers} dataKey="count" nameKey="browser" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Sem dados." />}
          </div>
        </div>

        {/* SO */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Cpu size={18} className="text-emerald-500" /> Sistemas Operacionais</SectionTitle>
          <div className="mt-4 h-48">
            {data?.oses && data.oses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.oses} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="os" type="category" tick={{ fontSize: 10 }} width={60} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Sem dados." />}
          </div>
        </div>
      </div>

      {/* Resoluções */}
      {data?.resolutions && data.resolutions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Monitor size={18} className="text-amber-500" /> Resoluções de Tela</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-3">
            {data.resolutions.map((r, i) => (
              <div key={r.res} className="px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm">
                <span className="font-mono font-medium">{r.res}</span>
                <span className="ml-2 text-muted-foreground text-xs">({r.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba: Heatmap ──────────────────────────────────────────────────────────────
function HeatmapTab() {
  const [pageUrl, setPageUrl] = useState("/");
  const [eventType, setEventType] = useState<"click" | "move" | "scroll">("click");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: pagesData } = trpc.analytics.query.getHeatmapPages.useQuery();
  const { data, isLoading } = trpc.analytics.query.getHeatmapData.useQuery(
    { pageUrl, eventType, limit: 2000 }
  );

  // Auto-seleciona a primeira página registrada se a atual for "/" sem dados e houver páginas
  useEffect(() => {
    if (pagesData && pagesData.length > 0 && pageUrl === "/") {
      const hasRoot = pagesData.some((p) => p.pageUrlNormalized === "/");
      if (!hasRoot) {
        setPageUrl(pagesData[0].pageUrlNormalized);
      }
    }
  }, [pagesData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data || data.length === 0) return;

    const maxCount = Math.max(...data.map((d) => d.count), 1);

    data.forEach((point) => {
      const x = (parseFloat(String(point.xPercent)) / 100) * canvas.width;
      const y = (parseFloat(String(point.yPercent)) / 100) * canvas.height;
      const intensity = Math.min(Math.max(point.count / maxCount, 0.15), 1);
      const radius = Math.min(25 + intensity * 35, 60);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(239, 68, 68, ${Math.min(intensity * 0.95, 0.9)})`); // Red center
      gradient.addColorStop(0.3, `rgba(245, 158, 11, ${intensity * 0.75})`); // Yellow
      gradient.addColorStop(0.6, `rgba(16, 185, 129, ${intensity * 0.5})`); // Green
      gradient.addColorStop(0.85, `rgba(59, 130, 246, ${intensity * 0.3})`); // Blue
      gradient.addColorStop(1, "rgba(59, 130, 246, 0)"); // Transparent

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Barra de Controles e Filtros */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-border">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Seletor de Páginas Registradas */}
          {pagesData && pagesData.length > 0 && (
            <select
              className="px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              value={pagesData.some((p) => p.pageUrlNormalized === pageUrl) ? pageUrl : ""}
              onChange={(e) => e.target.value && setPageUrl(e.target.value)}
            >
              <option value="" disabled>Páginas gravadas...</option>
              {pagesData.map((p) => (
                <option key={p.pageUrlNormalized} value={p.pageUrlNormalized}>
                  {p.pageUrlNormalized} ({p.totalPoints} interações)
                </option>
              ))}
            </select>
          )}

          {/* Campo manual de URL */}
          <input
            className="px-3 py-2 rounded-xl border border-border bg-card text-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            placeholder="Path da página (ex: /dashboard)"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
          />
        </div>

        {/* Tipos de Eventos */}
        <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/50">
          {(["click", "move", "scroll"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setEventType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                eventType === t ? "bg-violet-600 text-white shadow-md shadow-violet-500/20" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "click" ? "🖱️ Cliques" : t === "move" ? "↗️ Movimento" : "📜 Scroll"}
            </button>
          ))}
        </div>
      </div>

      {/* Visualizador de Heatmap Canvas */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle><MousePointer size={18} className="text-violet-500" /> Mapa de Calor de Interação</SectionTitle>
          
          {/* Legenda Térmica */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-xl border border-border/40">
            <span>Frio (Pouco)</span>
            <div className="h-3 w-24 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 via-amber-500 to-rose-500 opacity-90" />
            <span>Quente (Muito)</span>
          </div>
        </div>

        <div className="relative rounded-xl border border-border/60 overflow-hidden bg-slate-950/40">
          {/* Mock Layout Grid de fundo para contextualização visual */}
          <div className="absolute inset-0 opacity-10 pointer-events-none grid grid-cols-12 grid-rows-6 gap-2 p-4">
            <div className="col-span-12 h-10 bg-slate-400 rounded-lg" />
            <div className="col-span-3 row-span-5 bg-slate-400 rounded-lg" />
            <div className="col-span-9 row-span-2 bg-slate-400 rounded-lg" />
            <div className="col-span-4 row-span-3 bg-slate-400 rounded-lg" />
            <div className="col-span-5 row-span-3 bg-slate-400 rounded-lg" />
          </div>

          <div className="w-full relative" style={{ paddingBottom: "56.25%" }}>
            <canvas
              ref={canvasRef}
              width={1200}
              height={675}
              className="absolute inset-0 w-full h-full rounded-xl z-10"
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
                <div className="animate-pulse text-sm text-violet-400">Carregando dados do heatmap...</div>
              </div>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <EmptyState message={`Nenhum dado de ${eventType === "click" ? "clique" : eventType === "move" ? "movimento" : "scroll"} para a página "${pageUrl}".`} />
              </div>
            )}
          </div>
        </div>

        {data && data.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Página analisada: <strong className="text-foreground">{pageUrl}</strong></span>
            <span className="bg-violet-500/10 text-violet-400 px-2.5 py-1 rounded-lg border border-violet-500/20 font-medium">
              {data.length} regiões de interação ({eventType})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aba: IA Insights ──────────────────────────────────────────────────────────
function AIInsightsTab() {
  const { data, refetch } = trpc.analytics.query.getAIInsights.useQuery();
  const markRead = trpc.analytics.query.markInsightRead.useMutation({ onSuccess: () => refetch() });

  const severityConfig = {
    critical: { color: "border-rose-500/50 bg-rose-500/10", icon: <AlertCircle size={18} className="text-rose-500" />, label: "Crítico" },
    warning: { color: "border-amber-500/50 bg-amber-500/10", icon: <AlertCircle size={18} className="text-amber-500" />, label: "Atenção" },
    success: { color: "border-emerald-500/50 bg-emerald-500/10", icon: <CheckCircle size={18} className="text-emerald-500" />, label: "Positivo" },
    info: { color: "border-blue-500/50 bg-blue-500/10", icon: <Info size={18} className="text-blue-500" />, label: "Info" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle><Brain size={18} className="text-violet-500" /> Insights da IA</SectionTitle>
        <button onClick={() => refetch()} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {!data || data.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-12">
          <EmptyState message="Nenhum insight gerado ainda. A IA analisa os dados diariamente e gerará recomendações conforme os dados chegam." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((insight, i) => {
            const cfg = severityConfig[insight.severity as keyof typeof severityConfig] ?? severityConfig.info;
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-2xl border p-5 ${cfg.color} ${insight.isRead ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {cfg.icon}
                    <span className="text-xs font-semibold uppercase tracking-wider">{cfg.label}</span>
                  </div>
                  {!insight.isRead && (
                    <button
                      onClick={() => markRead.mutate({ id: insight.id })}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Marcar lido
                    </button>
                  )}
                </div>
                <h3 className="font-semibold mt-3 text-foreground">{insight.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                {insight.recommendation && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Recomendação</p>
                    <p className="text-sm">{insight.recommendation}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(insight.generatedAt).toLocaleString("pt-BR")}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Aba: Mapa Geográfico ──────────────────────────────────────────────────────
function GeoTab({ preset }: { preset: Preset }) {
  const { data } = trpc.analytics.query.getGeoStats.useQuery({ preset });
  const totalByState = data?.byState.reduce((sum, s) => sum + s.count, 0) ?? 1;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Por Estado */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Map size={18} className="text-violet-500" /> Por Estado</SectionTitle>
          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
            {!data?.byState || data.byState.length === 0 ? (
              <EmptyState message="Sem dados geográficos ainda." />
            ) : (
              data.byState.map((s, i) => (
                <div key={s.state} className="flex items-center gap-3">
                  <span className="w-6 text-xs text-muted-foreground text-right flex-shrink-0">{i + 1}.</span>
                  <span className="text-sm font-medium w-32 truncate flex-shrink-0">{s.state}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                      style={{ width: `${(s.count / totalByState) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold min-w-[40px] text-right">{s.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Por País */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Globe size={18} className="text-teal-500" /> Por País</SectionTitle>
          <div className="mt-4 h-56">
            {data?.byCountry && data.byCountry.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byCountry} dataKey="count" nameKey="country" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {data.byCountry.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState message="Sem dados por país." />}
          </div>
        </div>
      </div>

      {/* Top Cidades */}
      {data?.byCity && data.byCity.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
          <SectionTitle><Map size={18} className="text-cyan-500" /> Top Cidades</SectionTitle>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.byCity.slice(0, 15).map((c, i) => (
              <div key={`${c.city}-${i}`} className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                <p className="font-semibold text-sm truncate">{c.city}</p>
                <p className="text-xs text-muted-foreground">{c.state}</p>
                <p className="font-outfit text-xl font-bold mt-1">{c.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ABA DE SEGURANÇA E AUDITORIA DE ROTAS ──────────────────────────────────
function SecurityTab({ preset }: { preset: Preset }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  const overviewQuery = trpc.analytics.query.getSecurityOverview.useQuery({
    dateRange: preset === "7d" || preset === "30d" || preset === "90d" ? preset : "30d",
  });

  const logsQuery = trpc.analytics.query.getSecurityLogs.useQuery({
    page,
    limit: 15,
    search: search.trim() || undefined,
    category: category !== "all" ? category : undefined,
    severity: severity !== "all" ? severity : undefined,
  });

  const data = overviewQuery.data;
  const logsData = logsQuery.data;

  const categoryLabels: Record<string, { label: string; cls: string }> = {
    access: { label: "Acesso Normal", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    blocked_rate_limit: { label: "Rate Limit Excedido", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    bot_scanner: { label: "Bot / Scanner Suspeito", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
    unauthorized: { label: "Não Autorizado", cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    brute_force: { label: "Brute Force", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
  };

  const severityBadges: Record<string, { label: string; cls: string }> = {
    info: { label: "Baixo", cls: "bg-slate-500/10 text-slate-600" },
    low: { label: "Baixo", cls: "bg-blue-500/10 text-blue-600" },
    medium: { label: "Médio", cls: "bg-amber-500/10 text-amber-600" },
    high: { label: "Alto", cls: "bg-rose-500/10 text-rose-600" },
    critical: { label: "Crítico", cls: "bg-red-600 text-white font-bold" },
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas de Segurança */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total de Requisições"
          value={data ? data.totalRequests.toLocaleString() : "..."}
          subtitle="tráfego auditado"
          icon={<Globe size={20} className="text-violet-400" />}
          gradient="from-violet-600 to-indigo-600"
          delay={0.05}
        />
        <KPICard
          title="IPs Distintos"
          value={data ? data.uniqueIps.toLocaleString() : "..."}
          subtitle="endereços rastreados"
          icon={<Users size={20} className="text-cyan-400" />}
          gradient="from-cyan-500 to-blue-600"
          delay={0.1}
        />
        <KPICard
          title="Bloqueios Anti-DDoS / Rate Limit"
          value={data ? data.rateLimitBlocked.toLocaleString() : "..."}
          subtitle="estouros de limite de API"
          icon={<Zap size={20} className="text-amber-400" />}
          gradient="from-amber-500 to-orange-600"
          delay={0.15}
        />
        <KPICard
          title="Ataques & Scanners Detectados"
          value={data ? data.attacksDetected.toLocaleString() : "..."}
          subtitle="tentativas de varredura"
          icon={<AlertCircle size={20} className="text-rose-400" />}
          gradient="from-rose-500 to-pink-600"
          delay={0.2}
        />
      </div>

      {/* Top Rotas Visadas e Top IPs Suspeitos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
              <h3 className="font-bold text-foreground text-sm">Top Rotas Visadas / Atacadas</h3>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Período</span>
          </div>
          <div className="space-y-2">
            {!data || data.topAttackedRoutes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Nenhum ataque ou rota suspeita registrada no período.</p>
            ) : (
              data.topAttackedRoutes.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50 text-xs">
                  <div className="truncate pr-2 font-mono text-[11px] text-foreground font-semibold">
                    {r.route}
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 font-extrabold text-[11px] shrink-0">
                    {r.count} tentativas
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Shield size={16} />
              </div>
              <h3 className="font-bold text-foreground text-sm">Top IPs com Mais Atividade / Bloqueios</h3>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Período</span>
          </div>
          <div className="space-y-2">
            {!data || data.topSuspiciousIps.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Nenhum IP atípico registrado no período.</p>
            ) : (
              data.topSuspiciousIps.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground text-[11px]">{item.ip}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.highRiskCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 text-[10px] font-bold">
                        {item.highRiskCount} risco
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 font-extrabold text-[11px]">
                      {item.count} reqs
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tabela Detalhada de Auditoria de Acessos */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Lock size={16} className="text-violet-600" />
              Auditoria de Acessos & Tentativas em Tempo Real
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Logs detalhados de IP, rotas requisitadas, status e alertas de segurança.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                type="text"
                placeholder="Buscar IP ou Rota..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 bg-muted/50 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="py-1.5 px-3 bg-muted/50 border border-border rounded-xl text-xs text-foreground font-medium cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              <option value="access">Acesso Normal</option>
              <option value="blocked_rate_limit">Rate Limit Excedido</option>
              <option value="bot_scanner">Bot / Scanner</option>
            </select>

            <select
              value={severity}
              onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
              className="py-1.5 px-3 bg-muted/50 border border-border rounded-xl text-xs text-foreground font-medium cursor-pointer"
            >
              <option value="all">Todas Severidades</option>
              <option value="info">Baixo</option>
              <option value="medium">Médio</option>
              <option value="high">Alto</option>
              <option value="critical">Crítico</option>
            </select>

            <button
              onClick={() => logsQuery.refetch()}
              className="p-2 rounded-xl bg-muted/50 border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              title="Atualizar Logs"
            >
              <RefreshCw size={14} className={logsQuery.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Tabela de Logs */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3">Data / Hora</th>
                <th className="py-3 px-3">IP do Cliente</th>
                <th className="py-3 px-3">Método & Rota</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Risco</th>
                <th className="py-3 px-3">User Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs font-medium">
              {logsQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Carregando logs de auditoria...
                  </td>
                </tr>
              ) : !logsData || logsData.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum log encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                logsData.logs.map((log) => {
                  const catInfo = categoryLabels[log.eventCategory] || { label: log.eventCategory, cls: "bg-slate-500/10 text-slate-600 border-slate-500/20" };
                  const sevInfo = severityBadges[log.severity] || { label: log.severity, cls: "bg-slate-500/10 text-slate-600" };
                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-foreground">
                        {log.ip}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {log.method}
                          </span>
                          <span className="font-mono text-[11px] text-foreground truncate max-w-[280px]" title={log.route}>
                            {log.route}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg border ${catInfo.cls}`}>
                          {catInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-lg ${sevInfo.cls}`}>
                          {sevInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground truncate max-w-[200px]" title={log.userAgent || ""}>
                        {log.userAgent || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {logsData && logsData.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-border text-xs">
            <span className="text-muted-foreground">
              Página {logsData.page} de {logsData.totalPages} ({logsData.total} logs no total)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= logsData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB: EVOLUÇÃO DO SISTEMA (CRESCIMENTO DE RECEITA E USUÁRIOS) ──────────────
function EvolutionTab() {
  const evolutionQuery = trpc.analytics.query.getEvolutionStats.useQuery();
  const formatCurrency = (v?: number) => `R$ ${(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

  if (evolutionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-violet-500" />
      </div>
    );
  }

  const data = evolutionQuery.data || {
    monthlyHistory: [],
    revenueGrowthPercent: 0,
    userGrowthPercent: 0,
    isRevenueIncreasing: true,
    isUserBaseIncreasing: true,
  };

  return (
    <div className="space-y-8">
      {/* Cards de Tendência do Sistema */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Tendência Financeira */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white", data.isRevenueIncreasing ? "bg-emerald-500" : "bg-rose-500")}>
                {data.isRevenueIncreasing ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Evolução Financeira</h3>
                <p className="text-xs text-muted-foreground">Comparativo com o mês anterior (MoM)</p>
              </div>
            </div>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 border",
              data.isRevenueIncreasing
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-500 border-rose-500/20"
            )}>
              {data.isRevenueIncreasing ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {Math.abs(data.revenueGrowthPercent)}% {data.isRevenueIncreasing ? "AUMENTOU" : "DIMINUIU"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {data.isRevenueIncreasing
              ? "🟢 O faturamento da plataforma apresentou trajetória de crescimento no último período."
              : "🔴 Atenção: O faturamento teve uma retração em relação ao mês anterior."}
          </p>
        </div>

        {/* Tendência de Usuários / Alunos */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white", data.isUserBaseIncreasing ? "bg-indigo-500" : "bg-amber-500")}>
                <Users size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Base de Usuários & Alunos</h3>
                <p className="text-xs text-muted-foreground">Evolução do total de usuários ativos</p>
              </div>
            </div>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 border",
              data.isUserBaseIncreasing
                ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            )}>
              {data.isUserBaseIncreasing ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {Math.abs(data.userGrowthPercent)}% {data.isUserBaseIncreasing ? "CRESCENDO" : "EM QUEDA"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {data.isUserBaseIncreasing
              ? "🟢 A base de alunos e escolas cadastradas está expandindo de forma consistente."
              : "🟡 O ritmo de novos cadastros desacelerou no período recente."}
          </p>
        </div>
      </div>

      {/* Gráfico de Evolução Financeira vs Alunos */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
        <SectionTitle><TrendingUp size={20} className="text-emerald-500" /> Histórico de Evolução Mês a Mês</SectionTitle>
        <div className="mt-6 h-72">
          {data.monthlyHistory && data.monthlyHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyHistory}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                <YAxis yAxisId="left" stroke="#10b981" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e1e2d", borderColor: "#333", borderRadius: "12px" }}
                  formatter={(value: any, name: string) => [
                    name === "revenue" ? formatCurrency(Number(value)) : value,
                    name === "revenue" ? "Receita (R$)" : name === "activeStudents" ? "Alunos Ativos" : "Novos Cadastros"
                  ]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Receita (R$)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="activeStudents" name="Alunos Ativos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sem histórico de evolução suficiente ainda." />
          )}
        </div>
      </div>

      {/* Tabela Detalhada de Evolução Mês a Mês */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6">
        <SectionTitle><BarChart2 size={20} className="text-violet-500" /> Detalhamento do Desempenho Mensal</SectionTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider">
                <th className="py-3 px-4">Mês</th>
                <th className="py-3 px-4">Receita Gerada</th>
                <th className="py-3 px-4">Novos Alunos</th>
                <th className="py-3 px-4">Total Alunos Ativos</th>
                <th className="py-3 px-4">Novas Escolas / Orgs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {data.monthlyHistory.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-foreground">{item.month}</td>
                  <td className="py-3.5 px-4 font-bold text-emerald-500">{formatCurrency(item.revenue)}</td>
                  <td className="py-3.5 px-4">{item.newStudents}</td>
                  <td className="py-3.5 px-4 font-bold text-violet-500">{item.activeStudents}</td>
                  <td className="py-3.5 px-4">{item.newOrganizations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── TAB: ESCOLAS CADASTRADAS (visão completa do Super Admin) ───────────────
function formatLastSeen(dateStr?: string | Date | null): string {
  if (!dateStr) return "Nunca acessou";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SubscriptionBadge({ status, trialEndsAt }: { status?: string | null; trialEndsAt?: string | Date | null }) {
  const s = status || "trialing";
  const config: Record<string, { label: string; cls: string }> = {
    active: { label: "Ativa", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    trialing: { label: "Trial", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    pending: { label: "Pendente", cls: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
    past_due: { label: "Atrasada", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
    canceled: { label: "Cancelada", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
    inactive: { label: "Inativa", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
    suspended: { label: "Suspensa", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  };
  const c = config[s] ?? config.trialing;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${c.cls}`}>
      {c.label}
      {s === "trialing" && trialEndsAt && (
        <span className="font-medium normal-case tracking-normal">
          · até {new Date(trialEndsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      )}
    </span>
  );
}

function SchoolsTab() {
  const { data: schools = [], isLoading, refetch } = trpc.analytics.query.getSchoolsOverview.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "online" | "offline">("todas");

  const filtered = schools.filter((s: any) => {
    const term = search.trim().toLowerCase();
    const nameMatch = !term || (s.name || "").toLowerCase().includes(term) || (s.slug || "").toLowerCase().includes(term);
    if (!nameMatch) return false;
    if (filter === "online") return !!s.online;
    if (filter === "offline") return !s.online;
    return true;
  });

  const totals = schools.reduce(
    (acc: any, s: any) => ({
      students: acc.students + (s.activeStudents || 0),
      professors: acc.professors + (s.activeProfessors || 0),
      online: acc.online + (s.online ? 1 : 0),
    }),
    { students: 0, professors: 0, online: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Escolas Cadastradas</p>
          <p className="font-outfit text-3xl font-bold text-foreground mt-1">{schools.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <Wifi size={12} className="text-emerald-500" /> Online Agora
          </p>
          <p className="font-outfit text-3xl font-bold text-emerald-500 mt-1">{totals.online}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <GraduationCap size={12} className="text-violet-500" /> Alunos Ativos
          </p>
          <p className="font-outfit text-3xl font-bold text-violet-500 mt-1">{totals.students}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <UserCheck size={12} className="text-indigo-500" /> Professores Ativos
          </p>
          <p className="font-outfit text-3xl font-bold text-indigo-500 mt-1">{totals.professors}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar escola..."
              className="h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-sm font-medium outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all w-64"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            {(["todas", "online", "offline"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  filter === f ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "online" ? "● Online" : f === "offline" ? "○ Offline" : "Todas"}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-violet-400/40 transition-all"
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Tabela de escolas */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-violet-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <SearchX size={32} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-medium">Nenhuma escola encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-black uppercase tracking-wider">
                  <th className="py-3 px-4">Escola</th>
                  <th className="py-3 px-4">Plano</th>
                  <th className="py-3 px-4">Assinatura</th>
                  <th className="py-3 px-4">Status / Último Acesso</th>
                  <th className="py-3 px-4 text-center">Professores</th>
                  <th className="py-3 px-4 text-center">Alunos Ativos</th>
                  <th className="py-3 px-4 text-center">Total Alunos</th>
                  <th className="py-3 px-4">Cadastrada em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {s.logo ? (
                            <img src={s.logo} alt={s.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <Building2 size={16} className="text-violet-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            @{s.slug} · {s.owner?.email || "sem e-mail"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-[10px] font-black uppercase tracking-wider">
                        {s.planName || s.planId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <SubscriptionBadge status={s.subscriptionStatus} trialEndsAt={s.trialEndsAt} />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            s.online
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                          }`}
                        >
                          {s.online ? <Wifi size={11} /> : <WifiOff size={11} />}
                          {s.online ? `Online${s.onlineUsersCount > 1 ? ` (${s.onlineUsersCount})` : ""}` : "Offline"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatLastSeen(s.lastSeenAt)}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-indigo-500">{s.activeProfessors}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-violet-500">{s.activeStudents}</td>
                    <td className="py-3.5 px-4 text-center text-muted-foreground">{s.totalStudents}</td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TABS config ───────────────────────────────────────────────────────────────
const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Visão Geral", icon: <BarChart2 size={16} /> },
  { id: "crm", label: "Controle de Leads (CRM)", icon: <TrendingUp size={16} /> },
  { id: "evolution", label: "Evolução do Sistema", icon: <TrendingUp size={16} /> },
  { id: "schools", label: "Escolas", icon: <Building2 size={16} /> },
  { id: "realtime", label: "Tempo Real", icon: <Activity size={16} /> },
  { id: "security", label: "Segurança & Ataques", icon: <Shield size={16} /> },
  { id: "visitors", label: "Visitantes", icon: <Users size={16} /> },
  { id: "sources", label: "Origens", icon: <Globe size={16} /> },
  { id: "pages", label: "Páginas", icon: <FileText size={16} /> },
  { id: "heatmap", label: "Heatmap", icon: <MousePointer size={16} /> },
  { id: "funnel", label: "Funil", icon: <Target size={16} /> },
  { id: "checkout", label: "Checkout", icon: <CheckCircle size={16} /> },
  { id: "revenue", label: "Receita", icon: <DollarSign size={16} /> },
  { id: "campaigns", label: "Campanhas", icon: <Zap size={16} /> },
  { id: "map", label: "Mapa", icon: <Map size={16} /> },
  { id: "devices", label: "Dispositivos", icon: <Monitor size={16} /> },
  { id: "ai", label: "IA Insights", icon: <Brain size={16} /> },
];

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [preset, setPreset] = useState<Preset>("30d");
  const { user } = useAuth();

  const tabsWithFilter: TabId[] = ["overview", "visitors", "sources", "pages", "funnel", "checkout", "revenue", "campaigns", "map", "devices", "security"];
  const showFilter = tabsWithFilter.includes(activeTab);

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab preset={preset} />;
      case "crm": return <DashboardComercial />;
      case "evolution": return <EvolutionTab />;
      case "schools": return <SchoolsTab />;
      case "realtime": return <RealtimeTab />;
      case "security": return <SecurityTab preset={preset} />;
      case "visitors": return <OverviewTab preset={preset} />;  // shares visitor graphs
      case "sources": return <SourcesTab preset={preset} />;
      case "pages": return <PagesTab preset={preset} />;
      case "heatmap": return <HeatmapTab />;
      case "funnel": return <FunnelTab preset={preset} />;
      case "checkout": return <CheckoutTab preset={preset} />;
      case "revenue": return <RevenueTab preset={preset} />;
      case "campaigns": return <CampaignsTab preset={preset} />;
      case "map": return <GeoTab preset={preset} />;
      case "devices": return <DevicesTab preset={preset} />;
      case "ai": return <AIInsightsTab />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-border bg-card/60 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-indigo-600/5 to-transparent" />
        <div className="relative px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-emerald-600 uppercase tracking-widest">Live</span>
              </div>
              <h1 className="font-outfit text-2xl md:text-3xl font-bold text-foreground">
                MusicPro <span className="text-violet-600">Analytics</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitoramento completo da plataforma · {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab("crm")}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-violet-500/20 transition-all hover:scale-105"
              >
                <TrendingUp size={16} /> Dashboard Comercial (CRM)
              </button>
              {showFilter && (
                <div className="hidden md:block">
                  <MetricFilters value={preset} onChange={setPreset} />
                </div>
              )}
            </div>
          </div>
          {showFilter && (
            <div className="md:hidden mt-3">
              <MetricFilters value={preset} onChange={setPreset} />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="flex overflow-x-auto scrollbar-none px-4 gap-1 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                activeTab === tab.id
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "realtime" && (
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
