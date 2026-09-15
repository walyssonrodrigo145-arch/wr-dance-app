import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart
} from 'recharts';
import { 
  TrendingUp, Users, DollarSign, Download, Filter, 
  ChevronRight, Music, CreditCard,
  CalendarDays, Search, UserPlus, Target, Clock,
  LayoutGrid, PieChart as PieIcon, TrendingDown, Wallet, LineChart as LineIcon,
  Layers, GraduationCap, BarChart2, Sparkles, FileText, AlertCircle, Activity, Loader2
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { formatBRL } from '../lib/money';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadBase64File } from '../utils/downloadReport';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import DashboardComercial from './DashboardComercial';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const TAB_CONFIG = [
  { key: 'financeiro',   label: 'Financeiro',   icon: DollarSign },
  { key: 'despesas',     label: 'Despesas & Lucro', icon: CreditCard },
  { key: 'projecao',     label: 'Projeção 6M',   icon: TrendingUp },
  { key: 'alunos',       label: 'Alunos',        icon: Users },
  { key: 'aulas',        label: 'Aulas',         icon: CalendarDays },
  { key: 'instrumentos', label: 'Instrumentos',  icon: Music },
  { key: 'mensalidades', label: 'Mensalidades',  icon: FileText },
  { key: 'modalidades',  label: 'Modalidades',   icon: Layers },
  { key: 'engajamento',  label: 'Acessos',       icon: Activity },
] as const;

type TabKey = typeof TAB_CONFIG[number]['key'];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function calcTrend(current: number, previous: number): string {
  if (!previous || previous === 0) return current > 0 ? '+100%' : '0%';
  const diff = ((current - previous) / previous) * 100;
  return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
}

function getMonthName(month: number, year: number) {
  return format(new Date(year, month - 1, 1), 'MMMM', { locale: ptBR });
}

// ─── Stat Card Component ────────────────────────────────────────────────────────
function ReportMetricCard({ 
  title, value, trend, gradient, icon: Icon, subtitle, delay = 0, invertTrend = false
}: { 
  title: string; 
  value: string | number; 
  trend: string; 
  gradient: string; 
  icon: React.ElementType; 
  subtitle?: string;
  delay?: number;
  invertTrend?: boolean;
}) {
  const isUp = !trend.startsWith('-') && trend !== '0%';
  const isGood = invertTrend ? !isUp : isUp;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 flex flex-col justify-between hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group cursor-default"
    >
      {/* Gradient accent top-right */}
      <div className={cn("absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-15 blur-xl group-hover:opacity-25 transition-opacity duration-300", gradient)} />
      
      <div className="flex justify-between items-start mb-4 relative">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{title}</p>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md", gradient)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="relative">
        <div className="text-2xl font-black text-foreground mb-2 font-outfit">{value}</div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold",
            trend === '0%'
              ? "bg-muted text-muted-foreground"
              : isGood 
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
          )}>
            <TrendIcon className="w-3 h-3" /> {trend}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">{subtitle || 'vs mês anterior'}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Section Title ─────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, title, badge, color = 'text-primary' }: {
  icon: React.ElementType; title: string; badge?: string; color?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-1">
      <h3 className={cn("text-lg font-black text-foreground flex items-center gap-2.5 font-outfit", color)}>
        <Icon className="w-5 h-5 shrink-0 opacity-80" /> {title}
      </h3>
      {badge && (
        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ message = 'Nenhum dado disponível para o período.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground">
      <AlertCircle className="w-8 h-8 opacity-40" />
      <p className="text-sm font-medium opacity-60 italic">{message}</p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
const Relatorios: React.FC = () => {
  const generateReport = trpc.reportEngine.generate.useMutation();
  const [activeTab, setActiveTab] = useState<TabKey>('financeiro');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [includeAi, setIncludeAi] = useState(false);

  // ── Previous month helpers ─────────────────────────────────────────────────
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear  = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  // ── Queries ────────────────────────────────────────────────────────────────
  const statsQuery          = trpc.dashboard.stats.useQuery();
  const monthlyStatsQuery   = trpc.dashboard.monthlyStats.useQuery();
  const lessonsByDayQuery   = trpc.dashboard.lessonsByDay.useQuery();
  const instrumentStatsQuery = trpc.reports.getInstrumentStats.useQuery();

  const financeiroQuery     = trpc.reports.getFinanceiroDetails.useQuery({ month: selectedMonth, year: selectedYear });
  const financeiroPrevQuery = trpc.reports.getFinanceiroDetails.useQuery({ month: prevMonth, year: prevYear });

  const despesasQuery       = trpc.reports.getDespesasDetails.useQuery({ month: selectedMonth, year: selectedYear });
  const despesasPrevQuery   = trpc.reports.getDespesasDetails.useQuery({ month: prevMonth, year: prevYear });

  const projecaoQuery       = trpc.reports.getProjecao6Meses.useQuery({ month: selectedMonth, year: selectedYear });
  const studentsQuery       = trpc.students.list.useQuery();
  const overduePaymentsQuery = trpc.paymentDues.overdue.useQuery();
  const paymentDuesQuery    = trpc.paymentDues.list.useQuery({ month: selectedMonth, year: selectedYear });
  const expensesQuery       = trpc.expenses.list.useQuery({ month: selectedMonth, year: selectedYear });
  const frequencyQuery      = trpc.reports.getFrequencyDetails.useQuery({ month: selectedMonth, year: selectedYear });
  const alunosReportQuery   = trpc.reports.getAlunosReport.useQuery();
  const modalidadeStatsQuery = trpc.reports.getModalidadeStats.useQuery({ month: selectedMonth, year: selectedYear });
  const acessosQuery        = trpc.dashboard.getStudentAccessReport.useQuery();

  // ── Computed values ────────────────────────────────────────────────────────
  const currentMonthName = getMonthName(selectedMonth, selectedYear);

  // Novos alunos do mês (alunosReportQuery não tem createdAt, usamos dados disponíveis)
  const activeStudents  = useMemo(() => studentsQuery.data?.filter((s: any) => s.status === 'ativo').length  || 0, [studentsQuery.data]);
  const inactiveStudents = useMemo(() => studentsQuery.data?.filter((s: any) => s.status === 'inativo').length || 0, [studentsQuery.data]);
  const pausedStudents  = useMemo(() => studentsQuery.data?.filter((s: any) => s.status === 'pausado').length || 0, [studentsQuery.data]);
  const totalStudents   = useMemo(() => (studentsQuery.data?.length || 1), [studentsQuery.data]);

  const tooltipStyle = {
    backgroundColor: 'var(--card)',
    borderColor: 'var(--border)',
    borderRadius: '0.75rem',
    color: 'var(--foreground)',
    padding: '10px 16px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    fontSize: '12px',
    fontWeight: 700,
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = (fileFormat: 'csv' | 'excel', forceAi = false) => {
    try {
      let columns: string[] = [];
      let rows: any[][] = [];
      const title = `Relatório ${activeTab} — ${currentMonthName}/${selectedYear}`;
      const shouldUseAi = forceAi || includeAi;

      if (activeTab === 'financeiro') {
        columns = ['Data Vencimento', 'Aluno/Descrição', 'Valor', 'Status', 'Data Pagamento'];
        paymentDuesQuery.data?.forEach(p => {
          rows.push([
            format(new Date(p.dueDate), 'dd/MM/yyyy'),
            p.studentName || p.notes || 'Mensalidade',
            Number(p.amount),
            p.status.toUpperCase(),
            p.paidAt ? format(new Date(p.paidAt), 'dd/MM/yyyy') : '-'
          ]);
        });
      } else if (activeTab === 'despesas') {
        columns = ['Data', 'Descrição', 'Categoria', 'Valor', 'Status'];
        expensesQuery.data?.forEach(e => {
          rows.push([
            format(new Date(e.date), 'dd/MM/yyyy'),
            e.description,
            e.category || '-',
            Number(e.amount),
            e.status === 'pago' ? 'PAGO' : 'PENDENTE'
          ]);
        });
      } else if (activeTab === 'projecao') {
        columns = ["Mês", "Receita Projetada", "Despesa Projetada", "Lucro Projetado"];
        projecaoQuery.data?.projection?.forEach(p => rows.push([p.monthName, Number(p.receita), Number(p.despesa), Number(p.lucro)]));
      } else if (activeTab === 'alunos') {
        columns = ["ID", "Nome", "Professor", "Instrumento", "Mensalidade", "Status"];
        alunosReportQuery.data?.forEach(s => rows.push([s.id, s.name, s.professorName || '', s.instrumentName || '', Number(s.monthlyFee), s.status]));
      } else if (activeTab === 'aulas') {
        columns = ["Data", "Aluno", "Professor", "Status", "Observação"];
        frequencyQuery.data?.forEach(f => {
          const presence = f.status === 'concluida' ? 'Presente' : f.status === 'cancelada' ? 'Falta' : 'Reposição';
          rows.push([format(new Date(f.date), 'dd/MM/yyyy'), f.studentName, f.professorName, presence, f.observation || '']);
        });
      } else if (activeTab === 'mensalidades') {
        columns = ["Aluno", "Vencimento", "Valor", "Status"];
        overduePaymentsQuery.data?.forEach(p => {
          rows.push([p.studentName, format(new Date(p.dueDate), 'dd/MM/yyyy'), Number(p.amount), p.status]);
        });
      } else if (activeTab === 'instrumentos') {
        columns = ["Instrumento", "Categoria", "Alunos Ativos"];
        instrumentStatsQuery.data?.forEach(instr => {
          rows.push([instr.name, instr.category || 'Geral', Number(instr.studentCount || 0)]);
        });
      } else {
        columns = ["Indicador", "Valor"];
        rows.push(["Total de alunos", statsQuery.data?.totalStudents || 0]);
        rows.push(["Aulas realizadas", statsQuery.data?.monthLessons || 0]);
        rows.push(["Receita mensal", statsQuery.data?.monthlyRevenue || 0]);
      }

      toast.loading(`Gerando relatório ${fileFormat.toUpperCase()}${shouldUseAi ? ' com IA' : ''}...`, { id: 'export-loading' });
      generateReport.mutate({ format: fileFormat, title, columns, rows, period: `${currentMonthName}/${selectedYear}`, includeAiInsights: shouldUseAi }, {
        onSuccess: (data) => {
          toast.dismiss('export-loading');
          downloadBase64File(data.data, fileFormat as 'csv' | 'excel', `relatorio_${activeTab}`);
          toast.success('Relatório exportado com sucesso!');
        },
        onError: () => {
          toast.dismiss('export-loading');
          toast.error('Erro ao exportar no servidor.');
        }
      });
    } catch {
      toast.dismiss('export-loading');
      toast.error('Erro local ao exportar.');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: FINANCEIRO
  // ══════════════════════════════════════════════════════════════════════════
  const renderFinanceiro = () => {
    const cur = financeiroQuery.data;
    const prv = financeiroPrevQuery.data;

    // BUG 1 CORRIGIDO: trends reais calculadas
    const trendPago     = calcTrend(cur?.pago     || 0, prv?.pago     || 0);
    const trendPendente = calcTrend(cur?.pendente  || 0, prv?.pendente  || 0);
    const trendAtrasado = calcTrend(cur?.atrasado  || 0, prv?.atrasado  || 0);
    const trendTotal    = calcTrend(cur?.total     || 0, prv?.total     || 0);

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <ReportMetricCard title="Receita Recebida"  value={formatBRL(cur?.pago     || 0)} trend={trendPago}     gradient="bg-emerald-500" icon={DollarSign}  subtitle="vs mês anterior" delay={0.05} />
          <ReportMetricCard title="A Receber"         value={formatBRL(cur?.pendente  || 0)} trend={trendPendente} gradient="bg-amber-500"   icon={Clock}        subtitle="vs mês anterior" delay={0.1} />
          <ReportMetricCard title="Inadimplência"     value={formatBRL(cur?.atrasado  || 0)} trend={trendAtrasado} gradient="bg-rose-500"    icon={CreditCard}   subtitle="vs mês anterior" delay={0.15} invertTrend={true} />
          <ReportMetricCard title="Total Projetado"   value={formatBRL(cur?.total     || 0)} trend={trendTotal}    gradient="bg-indigo-500"  icon={Activity}     subtitle="vs mês anterior" delay={0.2} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Gráfico de Evolução Anual */}
          <ChartCard className="xl:col-span-2">
            <SectionTitle icon={LineIcon} title="Evolução Financeira Anual" badge="Anual" />
            <p className="text-xs text-muted-foreground mb-6 mt-1">Receita acumulada mês a mês durante o ano.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyStatsQuery.data || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorReceita)" dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Métricas Operacionais */}
          <ChartCard>
            <SectionTitle icon={BarChart2} title="Métricas Operacionais" />
            <p className="text-xs text-muted-foreground mb-5 mt-1">Visão geral da estrutura atual</p>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Alunos Ativos', value: activeStudents || 0, icon: Users, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
                { label: 'Aulas do Mês', value: statsQuery.data?.monthLessons || 0, icon: GraduationCap, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
                { label: 'Instrumentos', value: instrumentStatsQuery.data?.length || 0, icon: Music, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 + 0.2 }}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/60 hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", item.color)}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{item.label}</p>
                  </div>
                  <p className="text-xl font-black text-foreground font-outfit">{item.value}</p>
                </motion.div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: DESPESAS
  // ══════════════════════════════════════════════════════════════════════════
  const renderDespesas = () => {
    const receitaPrevista = financeiroQuery.data?.total || 0;
    const despesasTotal   = despesasQuery.data?.total   || 0;
    const prevReceita     = financeiroPrevQuery.data?.total || 0;
    const prevDespesas    = despesasPrevQuery.data?.total   || 0;
    const lucroLiquido    = receitaPrevista - despesasTotal;
    const prevLucro       = prevReceita - prevDespesas;
    const margem          = receitaPrevista > 0 ? (lucroLiquido / receitaPrevista) * 100 : 0;

    const donutData = [
      { name: 'Despesas',     value: despesasTotal,             color: '#ef4444' },
      { name: 'Lucro Líquido', value: Math.max(0, lucroLiquido), color: '#10b981' },
    ];

    // BUG 1 + 3 CORRIGIDOS: trends reais + mês dinâmico
    const trendReceita  = calcTrend(receitaPrevista, prevReceita);
    const trendDespesas = calcTrend(despesasTotal,   prevDespesas);
    const trendLucro    = calcTrend(lucroLiquido,    prevLucro);
    const trendMargem   = calcTrend(margem, prevReceita > 0 ? ((prevLucro / prevReceita) * 100) : 0);

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <ReportMetricCard title="Receita Total"    value={formatBRL(receitaPrevista)} trend={trendReceita}  gradient="bg-indigo-500"  icon={DollarSign}  subtitle="mês selecionado" delay={0.05} />
          <ReportMetricCard title="Despesas do Mês"  value={formatBRL(despesasTotal)}   trend={trendDespesas} gradient="bg-rose-500"    icon={CreditCard}  subtitle="saídas registradas" delay={0.1} invertTrend={true} />
          <ReportMetricCard title="Lucro Líquido"    value={formatBRL(lucroLiquido)}    trend={trendLucro}    gradient={lucroLiquido >= 0 ? "bg-emerald-500" : "bg-rose-500"} icon={TrendingUp}  subtitle="receita − despesa" delay={0.15} />
          <ReportMetricCard title="Margem de Lucro"  value={`${margem.toFixed(1)}%`}         trend={trendMargem}   gradient="bg-purple-500"  icon={PieIcon}     subtitle="sobre faturamento" delay={0.2} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut: Receitas vs Despesas */}
          <ChartCard>
            {/* BUG 3 CORRIGIDO: mês dinâmico */}
            <SectionTitle icon={PieIcon} title="Receitas vs Despesas" badge={currentMonthName} color="text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-muted-foreground mb-6 mt-1">Proporção de custos operacionais em relação ao lucro.</p>

            <div className="h-64 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={6} dataKey="value">
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => formatBRL(Number(val))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Faturamento</span>
                <span className="text-lg font-black text-foreground mt-0.5 font-outfit">{formatBRL(receitaPrevista)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5 pt-4 border-t border-border mt-4">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs font-semibold text-muted-foreground">{d.name}</span>
                  <span className="text-xs font-black text-foreground">({formatBRL(d.value)})</span>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Barras: Despesas por Categoria */}
          <ChartCard>
            {/* BUG 3 CORRIGIDO: mês dinâmico */}
            <SectionTitle icon={LayoutGrid} title="Despesas por Categoria" badge={currentMonthName} color="text-rose-600 dark:text-rose-400" />
            <p className="text-xs text-muted-foreground mb-6 mt-1">Distribuição de saídas por centro de custo.</p>
            <div className="h-64 w-full">
              {(despesasQuery.data?.categories || []).length === 0 ? (
                <EmptyState message="Nenhuma despesa registrada no período." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={despesasQuery.data?.categories || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => formatBRL(Number(val))} />
                    <Bar dataKey="value" name="Valor" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: PROJEÇÃO
  // ══════════════════════════════════════════════════════════════════════════
  const renderProjecao = () => {
    const proj       = projecaoQuery.data;
    const receitaBase = proj?.receitaBase  || 0;
    const despesaBase = proj?.despesaBase  || 0;
    const lucroBase   = proj?.lucroBase    || 0;
    const lucro6Meses = lucroBase * 6;

    // Trends baseadas nos dados reais do mês anterior
    const prevTotalRef = financeiroPrevQuery.data?.total || 0;
    const prevDespRef  = despesasPrevQuery.data?.total   || 0;
    const prevLucroRef = prevTotalRef - prevDespRef;

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <ReportMetricCard title="Receita Recorrente" value={formatBRL(receitaBase)}  trend={calcTrend(receitaBase, prevTotalRef)} gradient="bg-indigo-500"  icon={DollarSign}  subtitle="alunos ativos"  delay={0.05} />
          <ReportMetricCard title="Despesa Fixa Mensal" value={formatBRL(despesaBase)} trend={calcTrend(despesaBase, prevDespRef)}  gradient="bg-rose-500"    icon={CreditCard}   subtitle="contas mensais" delay={0.1} />
          <ReportMetricCard title="Lucro Mensal Base"   value={formatBRL(lucroBase)}   trend={calcTrend(lucroBase,   prevLucroRef)} gradient="bg-emerald-500" icon={TrendingUp}   subtitle="projeção base"  delay={0.15} />
          <ReportMetricCard title="Lucro em 6 Meses"    value={formatBRL(lucro6Meses)} trend={calcTrend(lucro6Meses, prevLucroRef * 6)} gradient="bg-purple-500" icon={Wallet}   subtitle="projeção total" delay={0.2} />
        </div>

        <ChartCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-border">
            <div>
              <SectionTitle icon={LineIcon} title="Projeção de Ganhos — Próximos 6 Meses" />
              <p className="text-xs text-muted-foreground mt-1">Cálculo preditivo baseado na recorrência atual de alunos e despesas fixas.</p>
            </div>
            <div className="flex items-center gap-5 text-xs font-bold shrink-0">
              <span className="flex items-center gap-1.5 text-indigo-500"><span className="w-3 h-3 rounded-md bg-indigo-500 shrink-0"/> Receita</span>
              <span className="flex items-center gap-1.5 text-rose-500"><span className="w-3 h-3 rounded-md bg-rose-500 shrink-0"/> Despesa</span>
              <span className="flex items-center gap-1.5 text-emerald-500"><span className="w-4 h-1.5 rounded-full bg-emerald-500 shrink-0"/> Lucro</span>
            </div>
          </div>
          <div className="h-80 w-full">
            {(proj?.projection || []).length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={proj?.projection || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} width={80} tickFormatter={v => formatBRL(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => formatBRL(Number(val))} />
                  <Bar dataKey="receita" name="Receita Projetada" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={28} />
                  <Bar dataKey="despesa" name="Despesa Projetada" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={28} />
                  <Line type="monotone" dataKey="lucro" name="Lucro Líquido" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: ALUNOS
  // ══════════════════════════════════════════════════════════════════════════
  const renderAlunos = () => (
    <div className="space-y-8">
      {/* Gráfico de Crescimento */}
      <ChartCard>
        <SectionTitle icon={TrendingUp} title="Crescimento de Matrículas" badge="Anual" color="text-emerald-600 dark:text-emerald-400" />
        <p className="text-xs text-muted-foreground mb-6 mt-1">Evolução do número total de alunos ativos na plataforma.</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyStatsQuery.data || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="alunos" name="Alunos" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status dos Alunos */}
        <ChartCard>
          <SectionTitle icon={Users} title="Status dos Alunos" color="text-indigo-600 dark:text-indigo-400" />
          <p className="text-xs text-muted-foreground mb-6 mt-1">Proporção atual entre ativos, inativos e pausados.</p>
          <div className="space-y-5">
            {[
              { label: 'Ativo',   count: activeStudents,   color: 'bg-emerald-500' },
              { label: 'Inativo', count: inactiveStudents, color: 'bg-rose-500' },
              { label: 'Pausado', count: pausedStudents,   color: 'bg-amber-500' },
            ].map((item, i) => {
              const percent = (item.count / totalStudents) * 100;
              return (
                <motion.div key={item.label} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground">{item.count} ({Math.round(percent)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", item.color)}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 1, delay: i * 0.15, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ChartCard>

        {/* Card de conversão */}
        <ChartCard className="flex flex-col items-center justify-center text-center relative overflow-hidden group">
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-primary/10 blur-2xl group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-5 shadow-lg group-hover:rotate-6 transition-transform duration-500"
          >
            <UserPlus size={30} />
          </motion.div>
          <h4 className="text-2xl font-black text-foreground font-outfit">Conversão</h4>
          <p className="text-muted-foreground text-xs uppercase tracking-widest mt-1 font-semibold">Experimental → Matrícula</p>
          <motion.p
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 150 }}
            className="text-5xl font-black text-primary mt-5 font-outfit"
          >
            82%
          </motion.p>
        </ChartCard>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: INSTRUMENTOS
  // ══════════════════════════════════════════════════════════════════════════
  const renderInstrumentos = () => {
    const pieData = (instrumentStatsQuery.data || []).map((instr, index) => ({
      ...instr,
      studentCountNum: Number(instr.studentCount || 0),
      fillColor: instr.color || COLORS[index % COLORS.length],
    }));

    return (
      <div className="space-y-8">
        {/* Cards de Instrumentos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {instrumentStatsQuery.data?.map((instr, i) => (
            <motion.div
              key={instr.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="bg-card border border-border p-5 rounded-2xl flex items-center gap-4 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30 transition-all duration-300 group"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 shrink-0" style={{ backgroundColor: `${instr.color || '#6366f1'}20` }}>
                <Music className="w-5 h-5" style={{ color: instr.color || '#6366f1' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-foreground truncate font-outfit">{instr.name}</h4>
                <p className="text-xs font-semibold text-muted-foreground mt-0.5">{instr.studentCount} alunos</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300 shrink-0" />
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Barras */}
          <ChartCard>
            <SectionTitle icon={LayoutGrid} title="Alunos por Instrumento" badge="Geral" color="text-indigo-600 dark:text-indigo-400" />
            <p className="text-xs text-muted-foreground mb-6 mt-1">Comparativo de matrículas ativas por instrumento.</p>
            <div className="h-72 w-full">
              {pieData.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="studentCountNum" name="Alunos" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          {/* Pizza */}
          <ChartCard>
            <SectionTitle icon={PieIcon} title="Distribuição por Instrumento" badge="Fatias" color="text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-muted-foreground mb-6 mt-1">Fatia de mercado de cada instrumento na escola.</p>
            <div className="h-60 w-full">
              {pieData.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="studentCountNum" nameKey="name" label={({ name, percent }) => percent > 0 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}>
                      {pieData.map((instr, index) => (
                        <Cell key={`cell-${index}`} fill={instr.fillColor} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-border mt-4">
              {pieData.map(instr => (
                <div key={instr.id || instr.name} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: instr.fillColor }} />
                  <span className="text-xs font-semibold text-muted-foreground">{instr.name} ({instr.studentCount})</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: MODALIDADES
  // ══════════════════════════════════════════════════════════════════════════
  const renderModalidades = () => {
    const studentData = modalidadeStatsQuery.data?.students.map(s => ({
      name: s.lessonType === 'individual' ? 'Individual' : 'Turma',
      value: s.count,
    })) || [];

    const revenueData = modalidadeStatsQuery.data?.revenue.map(r => ({
      name: r.lessonType === 'individual' ? 'Individual' : 'Turma',
      Recebido: r.recebido || 0,
      'A Receber': r.aReceber || 0,
      value: r.total,
    })) || [];

    const stats = (modalidadeStatsQuery.data?.students || []).map(s => {
      const revenue = modalidadeStatsQuery.data?.revenue.find(r => r.lessonType === s.lessonType)?.total || 0;
      return { lessonType: s.lessonType, count: s.count, revenue, avg: s.count > 0 ? revenue / s.count : 0 };
    });

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Donut de distribuição */}
          <ChartCard>
            <SectionTitle icon={Users} title="Distribuição de Alunos" badge="Modalidade" color="text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-muted-foreground mb-5 mt-1">Comparativo entre matrículas individuais e em turma.</p>
            <div className="h-60 w-full">
              {studentData.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={studentData} innerRadius={55} outerRadius={80} paddingAngle={6} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                      <Cell fill="#6366f1" />
                      <Cell fill="#a855f7" />
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-5 pt-4 border-t border-border mt-3">
              {studentData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: i === 0 ? '#6366f1' : '#a855f7' }} />
                  <span className="text-xs font-semibold text-muted-foreground">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Barras de faturamento */}
          <ChartCard>
            <SectionTitle icon={DollarSign} title="Faturamento por Modalidade" badge="Receita" color="text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-muted-foreground mb-5 mt-1">Volume de receita (Recebido vs A Receber) por formato.</p>
            <div className="h-64 w-full">
              {revenueData.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatBRL(value)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                    <Bar dataKey="Recebido"   fill="#10b981" radius={[6, 6, 0, 0]} barSize={22} />
                    <Bar dataKey="A Receber"  fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        </div>

        {/* Ticket médio */}
        <ChartCard>
          <SectionTitle icon={Layers} title="Ticket Médio por Modalidade" badge="Média" color="text-indigo-600 dark:text-indigo-400" />
          <p className="text-xs text-muted-foreground mb-6 mt-1">Rentabilidade média por aluno em cada formato de ensino.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-5 rounded-2xl border border-border bg-muted/30 flex items-center justify-between group hover:shadow-lg hover:border-primary/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300", s.lessonType === 'individual' ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600")}>
                    {s.lessonType === 'individual' ? <Target size={20} /> : <Users size={20} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{s.lessonType === 'individual' ? 'Aula Individual' : 'Aula em Turma'}</p>
                    <p className="text-2xl font-black text-foreground font-outfit">{formatBRL(s.avg)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1">{s.count} Alunos</p>
                  <p className="text-xs font-semibold text-muted-foreground">Total: {formatBRL(s.revenue)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </ChartCard>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: AULAS
  // ══════════════════════════════════════════════════════════════════════════
  const renderAulas = () => (
    <div className="space-y-8">
      <ChartCard>
        <SectionTitle icon={Clock} title="Distribuição de Aulas por Dia da Semana" badge="Semanal" color="text-purple-600 dark:text-purple-400" />
        <p className="text-xs text-muted-foreground mb-6 mt-1">Volume de aulas agendadas e realizadas por dia.</p>
        <div className="h-72 w-full">
          {(lessonsByDayQuery.data || []).length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lessonsByDayQuery.data || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 700 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="aulas" name="Aulas" fill="#8b5cf6" radius={[8, 8, 0, 0]} barSize={44} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: MENSALIDADES
  // ══════════════════════════════════════════════════════════════════════════
  const renderMensalidades = () => {
    const filtered = overduePaymentsQuery.data?.filter(p =>
      p.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
      <div className="space-y-8">
        <ChartCard className="overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
            <div>
              <SectionTitle icon={CalendarDays} title="Mensalidades em Aberto" color="text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-muted-foreground mt-1">Acompanhamento de faturas pendentes ou em atraso.</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Buscar aluno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary w-full md:w-72 text-foreground placeholder:text-muted-foreground transition-all outline-none"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState message={searchTerm ? 'Nenhum aluno encontrado.' : 'Sem mensalidades em aberto. 🎉'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {['Aluno', 'Vencimento', 'Valor', 'Status', 'Ação'].map((h, i) => (
                      <th key={h} className={cn("pb-4 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest", i === 4 && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((pay, i) => (
                    <motion.tr
                      key={pay.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm shrink-0 group-hover:scale-110 transition-transform">
                            {pay.studentName?.charAt(0)}
                          </div>
                          <span className="font-bold text-foreground text-sm">{pay.studentName}</span>
                        </div>
                      </td>
                      <td className="py-5 px-4 text-muted-foreground text-xs font-semibold">
                        {format(new Date(pay.dueDate), 'dd/MM/yyyy')}
                      </td>
                      <td className="py-5 px-4 font-black text-foreground text-sm font-outfit">
                        {formatBRL(Number(pay.amount))}
                      </td>
                      <td className="py-5 px-4">
                        <span className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest",
                          pay.status === 'atrasado'
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        )}>
                          {pay.status === 'atrasado' ? 'Vencida' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-5 px-4 text-right">
                        <button className="bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95">
                          Cobrar
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER: ENGAJAMENTO E ACESSOS
  // ══════════════════════════════════════════════════════════════════════════
  const renderEngajamento = () => {
    const data = acessosQuery.data || [];
    const filtered = data.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const totalAcessos = data.filter(d => d.hasAccess).length;
    const taxaAcesso = data.length > 0 ? ((totalAcessos / data.length) * 100).toFixed(1) : "0.0";
    const totalTreinos = data.reduce((acc, d) => acc + d.completedPracticeCount, 0);

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ReportMetricCard title="Alunos com Acesso" value={totalAcessos} trend="0%" gradient="bg-indigo-500" icon={Users} delay={0.05} subtitle="já logaram no painel" />
          <ReportMetricCard title="Taxa de Acesso" value={`${taxaAcesso}%`} trend="0%" gradient="bg-emerald-500" icon={Activity} delay={0.1} subtitle="do total de alunos" />
          <ReportMetricCard title="Treinos Concluídos" value={totalTreinos} trend="0%" gradient="bg-purple-500" icon={Target} delay={0.15} subtitle="no mês selecionado" />
        </div>

        <ChartCard>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <SectionTitle icon={Activity} title="Engajamento Mensal" badge={currentMonthName} color="text-indigo-600 dark:text-indigo-400" />
              <p className="text-xs text-muted-foreground mt-1">Status de acesso e conclusão de treinos no período.</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Buscar aluno..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/40 focus:border-primary w-full md:w-72 text-foreground placeholder:text-muted-foreground transition-all outline-none"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState message={searchTerm ? 'Nenhum aluno encontrado.' : 'Sem dados de acesso.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {['Aluno', 'Último Acesso', 'Treinos Concluídos', 'Status'].map((h) => (
                      <th key={h} className="pb-4 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((d, i) => (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm shrink-0 group-hover:scale-110 transition-transform">
                            {d.name.charAt(0)}
                          </div>
                          <span className="font-bold text-foreground text-sm">{d.name}</span>
                        </div>
                      </td>
                      <td className="py-5 px-4 text-muted-foreground text-xs font-semibold">
                        {d.lastSignedIn ? format(new Date(d.lastSignedIn), "dd/MM/yyyy 'às' HH:mm") : 'Nunca acessou'}
                      </td>
                      <td className="py-5 px-4 font-black text-foreground text-sm font-outfit">
                        {d.completedPracticeCount}
                      </td>
                      <td className="py-5 px-4">
                        <span className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest",
                          d.hasAccess && d.completedPracticeCount > 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : d.hasAccess
                              ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                              : "bg-muted text-muted-foreground"
                        )}>
                          {d.hasAccess && d.completedPracticeCount > 0 ? 'Engajado' : d.hasAccess ? 'Apenas Acesso' : 'Sem Acesso'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-violet-600 dark:from-primary/80 dark:via-primary dark:to-violet-700 px-4 md:px-8 pt-8 pb-14">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-12 -right-12 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-8 -left-8 w-56 h-56 rounded-full bg-violet-500/20 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/70 text-xs font-bold uppercase tracking-widest">Relatórios</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white font-outfit leading-tight">
                Central de Relatórios
              </h1>
              <p className="text-white/70 text-sm font-medium mt-2">
                Dados em tempo real · {currentMonthName} de {selectedYear}
              </p>
            </div>

            {/* KPIs rápidos no hero */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Alunos (Ativos)', value: activeStudents ?? '—' },
                { label: 'Aulas/Mês', value: statsQuery.data?.monthLessons ?? '—' },
                { label: 'Receita', value: financeiroQuery.data?.total != null ? formatBRL(financeiroQuery.data.total) : '—' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center">
                  <p className="text-white font-black text-xl font-outfit">{kpi.value}</p>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider mt-0.5">{kpi.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-24 -mt-6">

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-lg shadow-primary/5 mb-8 overflow-x-auto">
          <nav className="flex min-w-max p-2 gap-1">
            {TAB_CONFIG.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200",
                    isActive
                      ? "text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="tab-pill"
                      className="absolute inset-0 bg-primary rounded-xl"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <tab.icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Filter + Export Bar ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 p-4 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Filter size={16} />
            </div>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="bg-muted border border-border rounded-xl text-xs font-bold py-2.5 px-4 text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer transition-all outline-none capitalize"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {format(new Date(2024, i, 1), 'MMMM', { locale: ptBR })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-muted border border-border rounded-xl text-xs font-bold py-2.5 px-4 text-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer transition-all outline-none"
            >
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all shadow-md shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] outline-none">
              <Download size={15} /> Exportar
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem 
                onClick={() => handleExport('excel', true)} 
                disabled={generateReport.isPending} 
                className="text-xs text-primary font-bold cursor-pointer bg-purple-50 flex items-center"
              >
                {generateReport.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : "✨ "}
                Gerar Análise com IA (Excel)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport('excel', false)} className="font-semibold text-xs cursor-pointer">
                Excel Normal (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv', false)} className="font-semibold text-xs cursor-pointer">
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="font-semibold text-xs text-muted-foreground cursor-not-allowed">
                PDF (em breve)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Tab Content ──────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'financeiro'   && renderFinanceiro()}
            {activeTab === 'despesas'     && renderDespesas()}
            {activeTab === 'projecao'     && renderProjecao()}
            {activeTab === 'alunos'       && renderAlunos()}
            {activeTab === 'modalidades'  && renderModalidades()}
            {activeTab === 'aulas'        && renderAulas()}
            {activeTab === 'instrumentos' && renderInstrumentos()}
            {activeTab === 'mensalidades' && renderMensalidades()}
            {activeTab === 'engajamento'  && renderEngajamento()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Relatorios;
