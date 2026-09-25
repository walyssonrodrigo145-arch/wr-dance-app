import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Users, Calendar, DollarSign,
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle2,
  AlertCircle, Target, Star, BarChart as LucideBarChart
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { EyeToggleButton } from "@/components/dashboard/EyeToggleButton";
import { FreeSlotsCard } from "@/components/dashboard/FreeSlotsCard";
import { LiveRoomsCard } from "@/components/dashboard/LiveRoomsCard";
import { SetupChecklistCard } from "@/components/dashboard/SetupChecklistCard";
import { AttentionCard } from "@/components/dashboard/AttentionCard";
import { SubscriptionAlertBanner } from "@/components/dashboard/SubscriptionAlerts";
import { PlanSelectionModal } from "@/components/PlanSelectionModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Color map — usa variáveis CSS Tailwind para consistência entre temas ─────
const COLOR_MAP: Record<string, string> = {
  blue:    '#2563EB',
  emerald: '#10B981',
  orange:  '#F59E0B',
  purple:  '#7C3AED',
};
function resolveColor(color: string): string {
  const match = Object.keys(COLOR_MAP).find((k) => color.includes(k));
  return match ? COLOR_MAP[match] : COLOR_MAP['purple'];
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function MetricCard({ 
  title, value, icon: Icon, color, sparkData, trend, isLoading
}: { 
  title: string; value: string | number; icon: any; color: string; sparkData?: any[]; trend?: string; isLoading?: boolean
}) {
  // BUG-004: trend dinâmico — seta e cor corretas conforme positivo/negativo
  const isNegative = trend?.startsWith('-');
  const TrendIcon = isNegative ? ArrowDownRight : ArrowUpRight;
  const trendColor = trend ? (isNegative ? 'text-rose-500' : 'text-emerald-500') : 'text-muted-foreground';
  const strokeColor = resolveColor(color);
  const gradientId = `gradient-${title.replace(/\s+/g, '')}`;

  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[1.25rem] p-4 sm:p-6 border border-white/10 shadow-2xl shadow-primary/5 hover:shadow-primary/15 hover:-translate-y-1.5 transition-all duration-500 group cursor-default min-w-0 overflow-hidden">
      <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
        <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6 shadow-sm shrink-0", color.replace('text-', 'bg-') + '/10')}>
          <Icon size={20} className={color} />
        </div>
        <div className="flex flex-col items-end min-w-0">
          {trend ? (
            <div className={cn("flex items-center gap-1 text-[10px] font-black uppercase tracking-widest", trendColor)}>
              <TrendIcon size={12} />
              {trend}
            </div>
          ) : (
            <div className="h-4" />
          )}
          <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">este mês</p>
        </div>
      </div>
      <div className="min-w-0">
        {/* MH-003: Skeleton loader em vez de "..." */}
        {isLoading ? (
          <div className="h-8 w-20 rounded-lg bg-muted animate-pulse mb-1" />
        ) : (
          <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate">{value}</h3>
        )}
        <p className="text-xs font-bold text-muted-foreground mt-1 truncate">{title}</p>
      </div>
      {sparkData && sparkData.length > 0 && (
        <div className="h-12 mt-4 sm:mt-6 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.12}/>
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={strokeColor}
                strokeWidth={2} 
                fill={`url(#${gradientId})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const prefs = useDashboardPrefs();
  // BUG-003: Estado para controlar período do gráfico
  const [chartPeriod, setChartPeriod] = useState<'6m' | '12m'>('6m');
  
  // ── Bloqueio / Tela de Boas-Vindas para Professores ──
  const isProfessor = user?.role === 'professor';
  const userPerms: string[] = (user as any)?.permissions || [];
  const hasDashboardAccess = !isProfessor || userPerms.includes('/dashboard');

  // Queries — MH-002: cache de 5 minutos para reduzir chamadas
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: monthlyDataRaw } = trpc.dashboard.monthlyStats.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: upcomingLessons } = trpc.lessons.upcoming.useQuery(undefined, { staleTime: 2 * 60 * 1000 });
  const { data: overduePayments = [] } = trpc.paymentDues.overdue.useQuery(undefined, { staleTime: 2 * 60 * 1000 });
  const { data: todaySummaryData, error: todaySummaryError } = trpc.dashboard.todaySummary.useQuery(undefined, { staleTime: 2 * 60 * 1000 });
  const { data: mySubscription } = trpc.platform.mySubscription.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: allPlans } = trpc.platform.getPublicPlans.useQuery(undefined, { staleTime: 10 * 60 * 1000 });

  // BUG-003: Filtrar dados do gráfico pelo período selecionado
  const monthlyData = useMemo(() => {
    if (!monthlyDataRaw) return monthlyDataRaw;
    if (chartPeriod === '6m') return monthlyDataRaw.slice(-6);
    return monthlyDataRaw; // 12m = todos
  }, [monthlyDataRaw, chartPeriod]);

  // Real sparkline data from monthlyStats
  const sparkAlunos = useMemo(() => monthlyData?.map(d => ({ value: d.alunos })) || [], [monthlyData]);
  const sparkAulas = useMemo(() => monthlyData?.map(d => ({ value: d.aulas })) || [], [monthlyData]);
  const sparkReceita = useMemo(() => monthlyData?.map(d => ({ value: d.receita })) || [], [monthlyData]);
  // BUG#4 FIX: sparkline de receita já existia, mas a linha de receita não era plotada no gráfico principal
  // A correção foi adicionar o terceiro <Area> no AreaChart abaixo

  // Today's summary calculation
  const todaySummary = useMemo(() => {
    if (todaySummaryError) {
      return [
        { label: "ERRO AO CARREGAR", count: todaySummaryError.message || "Erro", color: "bg-red-500/10 text-red-600", icon: AlertCircle },
      ];
    }

    if (!todaySummaryData) {
      return [
        { label: "AULAS DE HOJE", count: "...", color: "bg-blue-500/10 text-blue-600", icon: Calendar },
        { label: "CHECK-INS REALIZADOS", count: "...", color: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 },
        { label: "RECEBIDO HOJE", count: "...", color: "bg-purple-500/10 text-purple-600", icon: DollarSign },
        { label: "PAGAMENTOS PENDENTES", count: "...", color: "bg-rose-500/10 text-rose-600", icon: AlertCircle },
        { label: "AULAS EXPERIMENTAIS", count: "...", color: "bg-orange-500/10 text-orange-600", icon: Target },
        { label: "PROFESSOR DESTAQUE", count: "...", color: "bg-amber-500/10 text-amber-600", icon: Star },
      ];
    }
    
    return [
      { label: "AULAS DE HOJE", count: todaySummaryData.aulasHoje, color: "bg-blue-500/10 text-blue-600", icon: Calendar },
      { label: "CHECK-INS REALIZADOS", count: todaySummaryData.checkins, color: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 },
      { label: "RECEBIDO HOJE", count: prefs.maskBRL(todaySummaryData.recebidoHoje), color: "bg-purple-500/10 text-purple-600", icon: DollarSign },
      { label: "PAGAMENTOS PENDENTES", count: todaySummaryData.pagamentosPendentes, color: "bg-rose-500/10 text-rose-600", icon: AlertCircle },
      { label: "AULAS EXPERIMENTAIS", count: todaySummaryData.experimentais, color: "bg-orange-500/10 text-orange-600", icon: Target },
      { label: "PROFESSOR DESTAQUE", count: todaySummaryData.professorDestaque, color: "bg-amber-500/10 text-amber-600", icon: Star },
    ];
  }, [todaySummaryData, todaySummaryError, prefs.hideFinancialValues]);

  // Trend calculations
  const trends = useMemo(() => {
    if (!monthlyData || monthlyData.length < 2) return { receita: "+0%", aulas: "+0%", alunos: "+0%" };
    
    const current = monthlyData[monthlyData.length - 1];
    const previous = monthlyData[monthlyData.length - 2];
    
    const calc = (curr: number, prev: number) => {
      if (!prev || prev === 0) return curr > 0 ? "+100%" : "0%";
      const diff = ((curr - prev) / prev) * 100;
      return `${diff >= 0 ? '+' : ''}${Math.round(diff)}%`;
    };

    return {
      receita: calc(current.receita, previous.receita),
      aulas: calc(current.aulas, previous.aulas),
      alunos: calc(current.alunos, previous.alunos),
    };
  }, [monthlyData]);

  const planUsageInfo = useMemo(() => {
    if (!mySubscription || !allPlans || !stats) return null;
    const currentPlan = allPlans.find((p: any) => p.id === mySubscription.planId);
    if (!currentPlan) return null;
    const maxStudents = currentPlan.maxStudents;
    const activeStudents = stats.activeStudents;
    const excessCount = Math.max(0, activeStudents - maxStudents);
    const extraPrice = Number((currentPlan as any).extraStudentPrice ?? 1.49);
    const allowExtra = (currentPlan as any).allowExtraStudents ?? true;
    return {
      planName: currentPlan.name,
      maxStudents,
      activeStudents,
      excessCount,
      extraPrice,
      excessTotal: excessCount * extraPrice,
      allowExtra,
      usagePercent: maxStudents >= 999999 ? 0 : Math.round((activeStudents / maxStudents) * 100),
    };
  }, [mySubscription, allPlans, stats]);

  if (!hasDashboardAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] animate-in fade-in duration-700">
        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-6 shadow-sm border border-primary/10">
          <span className="text-5xl">👋</span>
        </div>
        <h2 className="text-3xl font-black tracking-tight text-foreground mb-3 text-center">
          Bem-vindo(a), {user?.name?.split(' ')[0]}!
        </h2>
        <p className="text-muted-foreground text-sm font-medium text-center max-w-sm">
          Utilize o menu lateral para navegar entre seus alunos, horários e outras ferramentas disponíveis para o seu perfil.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* 🚀 Escolha de planos para escolas em trial (ex.: contas criadas via login Google) */}
      <PlanSelectionModal />
      
      {/* ── Olhinho: ocultar valores financeiros ── */}
      <div className="flex items-center justify-end gap-3 -mb-2">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Valores</span>
        <EyeToggleButton />
      </div>

      {/* ── Metrics Grid ── */}
      <div id="tour-dashboard-stats" className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {prefs.isVisible("kpi_students") && (
          <MetricCard
            title="Alunos Ativos"
            value={stats?.activeStudents ?? 0}
            icon={Users}
            color="text-blue-600"
            trend={trends.alunos}
            sparkData={sparkAlunos}
            isLoading={statsLoading}
          />
        )}
        {prefs.isVisible("kpi_lessons_done") && (
          <MetricCard
            title="Aulas Realizadas"
            value={stats?.completedLessons ?? 0}
            icon={CheckCircle2}
            color="text-emerald-500"
            trend={trends.aulas}
            sparkData={sparkAulas}
            isLoading={statsLoading}
          />
        )}
        {prefs.isVisible("kpi_lessons_scheduled") && (
          <MetricCard
            title="Aulas Agendadas"
            value={stats?.scheduledLessons ?? 0}
            icon={Clock}
            color="text-orange-500"
            isLoading={statsLoading}
          />
        )}
        {prefs.isVisible("kpi_revenue") && (
          <MetricCard
            title="Receita do Mês"
            value={prefs.maskBRL(stats?.monthlyRevenue ?? 0)}
            icon={DollarSign}
            color="text-purple-600"
            trend={trends.receita}
            sparkData={sparkReceita}
            isLoading={statsLoading}
          />
        )}
      </div>

      {/* ── Card de Uso do Plano / Alunos Excedentes ── */}
      {prefs.isVisible("plan_usage") && planUsageInfo && planUsageInfo.maxStudents < 999999 && (
        <div className={`rounded-[2rem] p-5 border shadow-lg transition-all duration-300 ${
          planUsageInfo.excessCount > 0
            ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30'
            : planUsageInfo.usagePercent >= 80
              ? 'bg-gradient-to-r from-yellow-500/5 to-amber-500/5 border-yellow-500/20'
              : 'bg-card/40 backdrop-blur-xl border-white/10'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                planUsageInfo.excessCount > 0 ? 'bg-amber-500/20' : 'bg-primary/10'
              }`}>
                <Users size={20} className={planUsageInfo.excessCount > 0 ? 'text-amber-500' : 'text-primary'} />
              </div>
              <div>
                <p className="text-sm font-black text-foreground">
                  {planUsageInfo.activeStudents} / {planUsageInfo.maxStudents} alunos
                  <span className="text-xs font-medium text-muted-foreground ml-2">Plano {planUsageInfo.planName}</span>
                </p>
                <div className="w-48 h-2 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      planUsageInfo.usagePercent >= 100 ? 'bg-amber-500' :
                      planUsageInfo.usagePercent >= 80 ? 'bg-yellow-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(planUsageInfo.usagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            {planUsageInfo.excessCount > 0 && (
              <div className="text-right">
                <p className="text-xs font-bold text-amber-600">
                  {planUsageInfo.excessCount} aluno{planUsageInfo.excessCount > 1 ? 's' : ''} excedente{planUsageInfo.excessCount > 1 ? 's' : ''}
                </p>
                <p className="text-lg font-black text-amber-500">+ R$ {planUsageInfo.excessTotal.toFixed(2)}/mês</p>
              </div>
            )}
            {planUsageInfo.excessCount === 0 && planUsageInfo.usagePercent >= 80 && (
              <p className="text-xs font-semibold text-yellow-600">
                ⚠️ Você está usando {planUsageInfo.usagePercent}% do seu limite
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {prefs.isVisible("chart_monthly") && (
        <div id="tour-dashboard-charts" className="md:col-span-1 lg:col-span-2 bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6 sm:space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                 <h3 className="text-base font-black text-foreground tracking-tight">Evolução Mensal</h3>
                 <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm" />
                       <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Aulas realizadas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                       <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Novos alunos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                       <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm" />
                       <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Receita (R$)</span>
                    </div>
                 </div>
              </div>
             <select
               value={chartPeriod}
               onChange={(e) => setChartPeriod(e.target.value as '6m' | '12m')}
               className="bg-muted border border-border rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:outline-none cursor-pointer"
             >
               <option value="6m">Últimos 6 meses</option>
               <option value="12m">Este ano (12 meses)</option>
             </select>
          </div>

          <div className="h-[200px] sm:h-[280px] lg:h-[320px] w-full">
            {(!monthlyData || monthlyData.length === 0) ? (
               <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
                 <LucideBarChart size={48} className="mb-4 opacity-50" />
                 <p className="text-xs font-bold uppercase tracking-widest">Sem dados suficientes para o gráfico</p>
               </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="chartEmerald" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    {/* BUG#4 FIX: gradient roxo para linha de receita */}
                    <linearGradient id="chartPurple" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} opacity={0.5} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }} opacity={0.5} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }}
                    itemStyle={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  />
                  <Area type="monotone" dataKey="aulas" name="Aulas" stroke="#2563EB" strokeWidth={3} fill="url(#chartBlue)" dot={{ r: 4, strokeWidth: 2, fill: 'var(--background)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="alunos" name="Alunos" stroke="#10B981" strokeWidth={3} fill="url(#chartEmerald)" dot={{ r: 4, strokeWidth: 2, fill: 'var(--background)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  {/* BUG#4 FIX: linha de receita — dado já existia em monthlyData mas não era plotado */}
                  <Area type="monotone" dataKey="receita" name="Receita" stroke="#7C3AED" strokeWidth={2} strokeDasharray="4 2" fill="url(#chartPurple)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        )}

        {/* Daily Summary */}
        {prefs.isVisible("today_summary") && (
        <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6 sm:space-y-8">
           <h3 className="text-base font-black text-foreground tracking-tight">Resumo do dia</h3>
           <div className="space-y-3">
              {todaySummary.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-muted/40 border border-transparent hover:bg-card/80 hover:border-white/10 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 group cursor-default">
                  <div className="flex items-center gap-4">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 shadow-sm border border-white/5", item.color)}>
                      <item.icon size={22} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-foreground/80 transition-colors">{item.label}</span>
                  </div>
                   <span className="text-xl font-black text-foreground tracking-tight">{item.count}</span>
                 </div>
               ))}
            </div>
         </div>
        )}
      </div>

      {/* ── Secondary Widgets Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">

        {/* Upcoming Lessons */}
        {prefs.isVisible("upcoming_lessons") && (
        <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6 sm:space-y-8">
           <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-foreground tracking-tight">Próximas Aulas</h3>
              <Button variant="ghost" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-500/10" onClick={() => navigate('/aulas')}>Ver todas</Button>
           </div>
           <div className="space-y-4">
              {upcomingLessons?.slice(0, 4).map((lesson) => (
                <div key={lesson.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-transparent hover:border-border transition-all group">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-card border border-border flex flex-col items-center justify-center shadow-sm">
                         <span className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-1">
                           {lesson.scheduledAt ? format(new Date(lesson.scheduledAt), "MMM", { locale: ptBR }).replace('.', '') : '---'}
                         </span>
                         <span className="text-sm font-black text-foreground leading-none">
                           {lesson.scheduledAt ? format(new Date(lesson.scheduledAt), "d") : '--'}
                         </span>
                      </div>
                      <div>
                         <p className="text-xs font-black text-foreground">{lesson.studentName || lesson.experimentalName || "Aluno"}</p>
                         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1 flex items-center gap-2">
                           <Clock size={12} className="text-blue-500" /> 
                           {lesson.scheduledAt ? format(new Date(lesson.scheduledAt), "HH:mm") : '--:--'} • {lesson.title}
                         </p>
                      </div>
                   </div>
                   <div className="px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-600 text-[9px] font-black uppercase tracking-widest border border-blue-500/20">
                      Agendada
                   </div>
                </div>
              ))}
              {upcomingLessons?.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-xs font-bold uppercase tracking-widest">Nenhuma aula agendada</div>
              )}
           </div>
        </div>
        )}

        {/* Overdue Payments */}
        {prefs.isVisible("overdue_payments") && (
        <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6 sm:space-y-8">
           <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-foreground tracking-tight">Inadimplentes</h3>
              <Button variant="ghost" className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-500/10" onClick={() => navigate('/financeiro')}>Ver todas</Button>
           </div>
           <div className="space-y-4">
              {overduePayments?.slice(0, 4).map((payment: any) => (
                <div key={payment.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-transparent hover:bg-card hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center font-black text-xs">
                         {(payment.studentName || "A")[0]}
                      </div>
                      <div>
                         <p className="text-xs font-black text-foreground">{payment.studentName}</p>
                         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                           {Math.floor((new Date().getTime() - new Date(payment.dueDate).getTime()) / (1000 * 60 * 60 * 24))} dias em atraso
                         </p>
                      </div>
                   </div>
                    <span className="text-xs font-black text-rose-600 tracking-tight">
                       {prefs.maskBRL(Number(payment.amount))}
                    </span>
                </div>
              ))}
              {overduePayments.length === 0 && (
                <div className="py-12 text-center">
                   <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={32} />
                   </div>
                   <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhum pagamento atrasado</p>
                </div>
              )}
           </div>
        </div>
        )}

        {/* Fase 3 — Onboarding "Escola pronta em 10 minutos" (só admin) */}
        {prefs.isAdmin && <SubscriptionAlertBanner />}

        {prefs.isAdmin && <SetupChecklistCard />}

        {/* Fase 3 — Central de pendências "Atenção hoje" */}
        <AttentionCard />

        {/* Horários Livres do Dia (RF-001) */}
        {prefs.isVisible("free_slots") && <FreeSlotsCard />}

        {/* Salas ao Vivo — 24h (RF-002) */}
        {prefs.isVisible("live_rooms") && <LiveRoomsCard />}
      </div>
    </div>
  );
}

