import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { 
  Calculator, 
  CheckCircle2, 
  DollarSign, 
  RefreshCw, 
  Calendar, 
  FileText, 
  Settings2, 
  Plus, 
  Trash2, 
  Download,
  Users,
  TrendingUp,
  Wallet,
  ArrowDownRight,
  Eye,
  MoreVertical,
  Sparkles,
  Printer,
  ChevronDown,
  AlertCircle,
  CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadBase64File } from "../utils/downloadReport";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

const DONUT_COLORS = [
  "#6366f1", // Purple/Indigo
  "#38bdf8", // Sky Blue
  "#34d399", // Emerald
  "#fbbf24", // Amber
  "#f87171", // Rose/Red
  "#a78bfa", // Purple Accent
];

export default function ProfessorExtract() {
  const { user } = useAuth();
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [chartMetric, setChartMetric] = useState<"liquido" | "bruto">("liquido");

  // Modals state
  const [detailsPaymentId, setDetailsPaymentId] = useState<number | null>(null);
  const [adjustPayment, setAdjustPayment] = useState<any | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Manual payment form state
  const [manualProfId, setManualProfId] = useState<string>("");
  const [manualCredits, setManualCredits] = useState<string>("");
  const [manualDebits, setManualDebits] = useState<string>("0");
  const [manualNotes, setManualNotes] = useState<string>("");

  const isAdmin = user?.role === "admin";

  // Data Queries
  const { data: payments, isLoading, refetch } = trpc.professorPayments.list.useQuery({
    month: viewMonth,
    year: viewYear,
  });

  // ── AUTO-CÁLCULO (PRD): gera a folha automaticamente ao abrir, sem clique ──
  const autoCalcRef = useRef<string>("");
  useEffect(() => {
    const key = `${viewMonth}/${viewYear}`;
    if (autoCalcRef.current === key) return;
    if (!isLoading && payments && payments.length === 0) {
      autoCalcRef.current = key;
      calculateMutation.mutate({ month: viewMonth, year: viewYear });
    }
  }, [isLoading, payments, viewMonth, viewYear]);

  const { data: historyData } = trpc.professorPayments.getHistory.useQuery({
    year: viewYear,
  });

  const { data: professoresList } = trpc.professores.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const generateReport = trpc.reportEngine.generate.useMutation();

  const calculateMutation = trpc.professorPayments.calculateAll.useMutation({
    onSuccess: (data) => {
      toast.success("Pagamentos calculados com sucesso!", {
        description: `Processados registros para ${data.count} professores.`,
      });
      const semRegra = (data?.results || []).filter((r: any) => r.warnings?.length);
      if (semRegra.length > 0) {
        toast.warning(`${semRegra.length} professora(s) sem regra de remuneração configurada — configure em Professores → Regras de Cobrança.`);
      }
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao calcular pagamentos"),
  });

  const calculateSingleMutation = trpc.professorPayments.calculate.useMutation({
    onSuccess: () => {
      toast.success("Pagamento recalculado com sucesso!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.professorPayments.approve.useMutation({
    onSuccess: () => {
      toast.success("Pagamento aprovado com sucesso!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaidMutation = trpc.professorPayments.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Pagamento marcado como PAGO!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateAdjustmentsMutation = trpc.professorPayments.updateAdjustments.useMutation({
    onSuccess: () => {
      toast.success("Ajustes salvos com sucesso!");
      setAdjustPayment(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const createManualMutation = trpc.professorPayments.createManual.useMutation({
    onSuccess: () => {
      toast.success("Pagamento manual criado com sucesso!");
      setIsManualModalOpen(false);
      setManualProfId("");
      setManualCredits("");
      setManualDebits("0");
      setManualNotes("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: detailsData, isLoading: detailsLoading } = trpc.professorPayments.getDetails.useQuery(
    { paymentId: detailsPaymentId! },
    { enabled: !!detailsPaymentId }
  );

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), "MMMM", { locale: ptBR }),
  }));

  const years = [viewYear - 1, viewYear, viewYear + 1];

  const displayPayments = payments || [];

  // Indicators calculations
  const totalBruto = displayPayments.reduce((acc, p) => acc + Number(p.totalCredits || 0), 0);
  const totalDescontos = displayPayments.reduce((acc, p) => acc + Number(p.totalDebits || 0), 0);
  const totalLiquido = displayPayments.reduce((acc, p) => acc + Number(p.totalAmount || 0), 0);
  const professoresAtivos = displayPayments.filter(p => p.totalClasses > 0 || Number(p.totalAmount) > 0).length;

  // Donut chart data calculations
  const donutData = displayPayments
    .filter(p => Number(p.totalAmount) > 0)
    .map(p => ({
      name: p.professorName || "Professor",
      value: Number(p.totalAmount),
    }));

  const totalDonutValue = donutData.reduce((acc, curr) => acc + curr.value, 0);

  // Group smaller amounts into "Outros" if more than 4 items
  let formattedDonutData = donutData.map(item => ({
    ...item,
    percentage: totalDonutValue > 0 ? Math.round((item.value / totalDonutValue) * 100) : 0,
  }));

  if (formattedDonutData.length > 4) {
    const top4 = formattedDonutData.slice(0, 4);
    const others = formattedDonutData.slice(4);
    const othersValue = others.reduce((acc, curr) => acc + curr.value, 0);
    const othersPercentage = others.reduce((acc, curr) => acc + curr.percentage, 0);
    formattedDonutData = [
      ...top4,
      { name: "Outros", value: othersValue, percentage: othersPercentage }
    ];
  }

  // Format hours and minutes
  const formatCargaHoraria = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  };

  // Receipt printing
  const handlePrint = (payment: any) => {
    if (!payment) return;
    const adjustments: any[] = payment.adjustments ? JSON.parse(payment.adjustments) : [];
    const totalCredits = Number(payment.totalCredits).toFixed(2);
    const totalDebits = Number(payment.totalDebits).toFixed(2);
    const totalAmount = Number(payment.totalAmount).toFixed(2);
    const refDate = format(new Date(payment.year, payment.month - 1), "MMMM 'de' yyyy", { locale: ptBR });
    const emitDate = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

    const adjustRows = adjustments.map((adj: any) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">${adj.desc}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;color:#16a34a;font-weight:700;">${adj.value > 0 ? 'R$ ' + Number(adj.value).toFixed(2) : '—'}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;color:#dc2626;font-weight:700;">${adj.value < 0 ? 'R$ ' + Math.abs(adj.value).toFixed(2) : '—'}</td>
      </tr>
    `).join('');

    const printContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Recibo — ${payment.professorName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Inter',sans-serif;background:#f8fafc;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{max-width:760px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.08);}
    .header{background:linear-gradient(135deg,#1e1b4b 0%,#312e81 60%,#4f46e5 100%);padding:36px 40px;display:flex;justify-content:space-between;align-items:center;}
    .header-title{color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px;}
    .header-sub{color:#a5b4fc;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:4px;}
    .badge{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px 16px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;}
    .body{padding:36px 40px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px;}
    .info-block{background:#f8fafc;border-radius:10px;padding:16px;}
    .info-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:4px;}
    .info-value{font-size:14px;font-weight:700;color:#0f172a;}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;}
    thead tr{background:#f1f5f9;}
    th{padding:12px 16px;text-align:left;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;}
    th:not(:first-child){text-align:right;}
    td{padding:12px 16px;font-size:13px;border-bottom:1px solid #f1f5f9;}
    .total-row td{background:#f8fafc;font-weight:700;font-size:13px;}
    .net-row td{background:linear-gradient(90deg,#1e1b4b,#312e81);color:#fff;font-weight:900;font-size:15px;padding:16px;}
    .net-row td:last-child{text-align:right;}
    .signature{margin-top:48px;display:flex;justify-content:center;}
    .sig-block{text-align:center;}
    .sig-line{width:280px;border-top:2px solid #1e1b4b;margin-bottom:8px;}
    .sig-name{font-weight:700;font-size:14px;}
    .sig-label{font-size:11px;color:#94a3b8;margin-top:2px;}
    .footer{background:#f8fafc;padding:16px 40px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;}
    @media print{body{background:#fff;}.page{box-shadow:none;border-radius:0;margin:0;max-width:100%;}}
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="header-title">🎵 WR Music</div>
        <div class="header-sub">Recibo de Pagamento — Professores</div>
      </div>
      <div class="badge">${payment.status?.toUpperCase() || 'CALCULADO'}</div>
    </div>
    <div class="body">
      <div class="info-grid">
        <div class="info-block">
          <div class="info-label">Professor</div>
          <div class="info-value">${payment.professorName}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Referência</div>
          <div class="info-value">${refDate.charAt(0).toUpperCase() + refDate.slice(1)}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Total de Aulas</div>
          <div class="info-value">${payment.totalClasses} aulas / ${payment.totalMinutes} min</div>
        </div>
        <div class="info-block">
          <div class="info-label">Data de Emissão</div>
          <div class="info-value">${emitDate.charAt(0).toUpperCase() + emitDate.slice(1)}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Proventos (+)</th>
            <th>Descontos (−)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Valor base das aulas concluídas</td>
            <td style="text-align:right;color:#16a34a;font-weight:700;">R$ ${totalCredits}</td>
            <td style="text-align:right;">—</td>
          </tr>
          ${adjustRows}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="1"><strong>Totais</strong></td>
            <td style="text-align:right;color:#16a34a;"><strong>R$ ${totalCredits}</strong></td>
            <td style="text-align:right;color:#dc2626;"><strong>R$ ${totalDebits}</strong></td>
          </tr>
          <tr class="net-row">
            <td colspan="2"><strong>💰 VALOR LÍQUIDO A RECEBER</strong></td>
            <td><strong>R$ ${totalAmount}</strong></td>
          </tr>
        </tfoot>
      </table>
      <div class="signature">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-name">${payment.professorName}</div>
          <div class="sig-label">Assinatura do Recebedor</div>
        </div>
      </div>
    </div>
    <div class="footer">Documento gerado automaticamente pelo WR Music • ${emitDate}</div>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 600);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (displayPayments.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }
    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "Professor;Especialidade;Aulas Concluídas;Carga Horária;Total Bruto (R$);Descontos (R$);Líquido (R$);Status\n";
    displayPayments.forEach(p => {
      csv += `"${p.professorName}";"${p.specialty || '-'}";"${p.totalClasses}";"${formatCargaHoraria(p.totalMinutes)}";"${Number(p.totalCredits).toFixed(2)}";"${Number(p.totalDebits).toFixed(2)}";"${Number(p.totalAmount).toFixed(2)}";"${p.status}"\n`;
    });
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `folha_pagamento_${viewMonth}_${viewYear}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("CSV exportado com sucesso!");
  };

  // Excel Export via Report Engine
  const handleExportExcel = () => {
    if (displayPayments.length === 0) {
      toast.error("Nenhum registro para exportar.");
      return;
    }

    const rows = displayPayments.map(p => [
      p.professorName,
      p.specialty || '-',
      `${p.totalClasses} aulas`,
      formatCargaHoraria(p.totalMinutes),
      `R$ ${Number(p.totalCredits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${Number(p.totalDebits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${Number(p.totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      p.status.toUpperCase(),
    ]);

    toast.loading("Gerando planilha Excel...", { id: 'export-loading' });

    generateReport.mutate({
      format: 'excel',
      title: `Folha de Pagamento - ${months.find(m => m.value === viewMonth)?.label} / ${viewYear}`,
      columns: ["Professor", "Especialidade", "Aulas", "Carga Horária", "Total Bruto", "Descontos", "Líquido", "Status"],
      rows,
      period: `${viewMonth}/${viewYear}`,
    }, {
      onSuccess: (data) => {
        toast.dismiss('export-loading');
        downloadBase64File(data.data, 'excel', `folha_pagamento_${viewMonth}_${viewYear}`);
        toast.success("Excel exportado com sucesso!");
      },
      onError: () => {
        toast.dismiss('export-loading');
        toast.error("Erro ao gerar arquivo Excel.");
      }
    });
  };

  const handleManualCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProfId || !manualCredits) {
      toast.error("Preencha o professor e o valor bruto.");
      return;
    }

    const credits = parseFloat(manualCredits) || 0;
    const debits = parseFloat(manualDebits) || 0;
    const amount = credits - debits;

    createManualMutation.mutate({
      professorId: parseInt(manualProfId),
      month: viewMonth,
      year: viewYear,
      totalCredits: credits,
      totalDebits: debits,
      totalAmount: amount,
      notes: manualNotes || "Lançamento Manual Extraordinário",
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-8 font-sans bg-background text-foreground transition-colors duration-200 min-h-screen">
      {/* 1. Header Adaptativo ao Tema */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-outfit text-3xl font-extrabold text-foreground tracking-tight">
              Folha de Pagamento
            </h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Gerencie e acompanhe os pagamentos dos professores
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Período Adaptativo */}
          <div className="bg-card border border-border shadow-sm rounded-xl px-3.5 py-1.5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={viewMonth.toString()} onValueChange={(v) => setViewMonth(parseInt(v))}>
              <SelectTrigger className="border-none bg-transparent h-8 text-sm font-semibold text-foreground shadow-none focus:ring-0 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value.toString()} className="capitalize">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-medium">de</span>
            <Select value={viewYear.toString()} onValueChange={(v) => setViewYear(parseInt(v))}>
              <SelectTrigger className="border-none bg-transparent h-8 text-sm font-semibold text-foreground shadow-none focus:ring-0 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botão Exportar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-card border-border text-foreground hover:bg-muted rounded-xl h-10 px-4 text-xs font-bold shadow-sm">
                <Download className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              <DropdownMenuItem className="cursor-pointer font-medium" onClick={handleExportCSV}>
                <FileText className="w-4 h-4 mr-2 text-blue-500" /> Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer font-medium" onClick={handleExportExcel}>
                <FileText className="w-4 h-4 mr-2 text-emerald-500" /> Exportar Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => {
                if (displayPayments.length > 0) handlePrint(displayPayments[0]);
              }}>
                <Printer className="w-4 h-4 mr-2 text-purple-500" /> Gerar Recibos (Lote)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Botão Novo Pagamento */}
          {isAdmin && (
            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 px-4 text-xs font-bold shadow-md shadow-primary/20"
              onClick={() => setIsManualModalOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Pagamento
            </Button>
          )}
        </div>
      </div>

      {/* 2. Cards Superiores (4 KPIs Adaptativos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Bruto */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block text-right">Total Bruto</span>
              <h3 className="font-outfit text-2xl font-black text-foreground tracking-tight text-right mt-1">
                R$ {totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Valor total antes de descontos</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> 12%
              </span>
              <span className="text-[11px] text-muted-foreground">vs. Julho/2026</span>
            </div>
          </div>
        </div>

        {/* Card 2: Descontos */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block text-right">Descontos</span>
              <h3 className="font-outfit text-2xl font-black text-foreground tracking-tight text-right mt-1">
                R$ {totalDescontos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Impostos e taxas</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5">
                <ArrowDownRight className="w-3 h-3" /> 8%
              </span>
              <span className="text-[11px] text-muted-foreground">vs. Julho/2026</span>
            </div>
          </div>
        </div>

        {/* Card 3: Líquido a Pagar */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block text-right">Líquido a Pagar</span>
              <h3 className="font-outfit text-2xl font-black text-foreground tracking-tight text-right mt-1">
                R$ {totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Valor final aos professores</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> 10%
              </span>
              <span className="text-[11px] text-muted-foreground">vs. Julho/2026</span>
            </div>
          </div>
        </div>

        {/* Card 4: Professores Ativos */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-muted-foreground block text-right">Professores Ativos</span>
              <h3 className="font-outfit text-2xl font-black text-foreground tracking-tight text-right mt-1">
                {professoresAtivos}
              </h3>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Com aulas no período</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-md">
                —
              </span>
              <span className="text-[11px] text-muted-foreground">vs. Julho/2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 & 4. Área de Gráficos (Evolução + Distribuição) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 1: Evolução do Líquido a Pagar */}
        <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-outfit text-lg font-bold text-foreground">
                {chartMetric === "liquido" ? "Evolução do Líquido a Pagar" : "Evolução do Total Bruto"}
              </h3>
            </div>

            {/* Toggle Bruto | Líquido */}
            <div className="flex bg-muted p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setChartMetric("bruto")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  chartMetric === "bruto"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Bruto
              </button>
              <button
                type="button"
                onClick={() => setChartMetric("liquido")}
                className={`px-3 py-1 rounded-lg transition-all ${
                  chartMetric === "liquido"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Líquido
              </button>
            </div>
          </div>

          <div className="h-64 w-full pt-4">
            {historyData && historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v) => `R$ ${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--popover)', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--popover-foreground)', fontSize: '12px' }}
                    formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, chartMetric === "liquido" ? "Líquido" : "Bruto"]}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric}
                    stroke="var(--primary)"
                    strokeWidth={3}
                    dot={{ fill: 'var(--primary)', r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                    fillOpacity={1}
                    fill="url(#colorMetric)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-medium">
                Carregando histórico...
              </div>
            )}
          </div>
        </div>

        {/* Gráfico 2: Distribuição por Professor (Donut) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-outfit text-lg font-bold text-foreground">Distribuição por Professor</h3>
            <button 
              type="button"
              onClick={() => {
                const el = document.getElementById("pagamentos-periodo-card");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Ver detalhes
            </button>
          </div>

          {formattedDonutData.length > 0 ? (
            <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-5 pt-2">
              {/* Donut Chart with central counter */}
              <div className="w-40 h-40 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={formattedDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {formattedDonutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--popover)', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--popover-foreground)', fontSize: '12px' }}
                      formatter={(val: any) => [`R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="font-outfit text-2xl font-black text-foreground">{professoresAtivos}</span>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Professores</span>
                </div>
              </div>

              {/* Lista do Donut */}
              <div className="w-full space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {formattedDonutData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                      <span className="truncate text-foreground">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-muted-foreground font-medium text-right w-8">{item.percentage}%</span>
                      <span className="font-bold text-foreground text-right w-24">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-center text-muted-foreground text-sm">
              <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
              Nenhum dado financeiro para exibir a distribuição neste mês.
            </div>
          )}
        </div>
      </div>

      {/* 5. Área Principal — Pagamentos do Período */}
      <div id="pagamentos-periodo-card" className="bg-card p-6 md:p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="font-outfit text-xl font-bold text-foreground tracking-tight">
              Pagamentos do Período
            </h2>
            <span className="bg-muted text-muted-foreground rounded-xl px-2.5 py-1 font-bold text-xs">
              {displayPayments.length} registros
            </span>
          </div>

          {/* Callout Banner + Botão Calcular Pagamentos */}
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3.5 md:px-5 md:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-1 max-w-2xl">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <div>
                <span className="font-bold text-xs md:text-sm text-foreground">✨ Os valores são calculados automaticamente</span>
                <p className="text-[11px] text-muted-foreground font-medium">Com base nas aulas realizadas, carga horária e regras de cada professor.</p>
              </div>
            </div>

            {isAdmin && (
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-10 px-5 text-xs shadow-md shadow-primary/20 shrink-0"
                onClick={() => calculateMutation.mutate({ month: viewMonth, year: viewYear })}
                disabled={calculateMutation.isPending}
              >
                {calculateMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Calcular Pagamentos
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Tabela Adaptativa ao Tema */}
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : displayPayments.length === 0 ? (
          <div className="bg-muted/40 rounded-2xl p-12 text-center border border-dashed border-border">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h4 className="font-outfit text-lg font-bold text-foreground mb-1">Nenhum pagamento registrado neste mês</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
              Clique no botão "Calcular Pagamentos" acima para ler as aulas concluídas do mês e gerar a folha.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground uppercase tracking-wider font-bold border-b border-border">
                  <tr>
                    <th className="px-5 py-3.5">PROFESSOR</th>
                    <th className="px-5 py-3.5 text-center">AULAS REALIZADAS</th>
                    <th className="px-5 py-3.5 text-center">CARGA HORÁRIA</th>
                    <th className="px-5 py-3.5 text-right">TOTAL BRUTO</th>
                    <th className="px-5 py-3.5 text-right">DESCONTOS</th>
                    <th className="px-5 py-3.5 text-right">LÍQUIDO</th>
                    <th className="px-5 py-3.5 text-center">STATUS</th>
                    <th className="px-5 py-3.5 text-right">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card font-medium">
                  {displayPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-muted/40 transition-colors">
                      {/* Professor Name & Specialty */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0 border border-primary/20">
                            {payment.professorName?.charAt(0) || "P"}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm">
                              {payment.professorName}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-normal">
                              {payment.specialty || "Música"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Aulas */}
                      <td className="px-5 py-4 text-center text-foreground font-semibold">
                        {payment.totalClasses}
                      </td>

                      {/* Carga horária */}
                      <td className="px-5 py-4 text-center text-muted-foreground font-semibold">
                        {formatCargaHoraria(payment.totalMinutes)}
                      </td>

                      {/* Total Bruto */}
                      <td className="px-5 py-4 text-right font-bold text-foreground">
                        R$ {Number(payment.totalCredits || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Descontos */}
                      <td className="px-5 py-4 text-right font-medium text-red-500 dark:text-red-400">
                        {Number(payment.totalDebits || 0) > 0 ? `R$ ${Number(payment.totalDebits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "R$ 0,00"}
                      </td>

                      {/* Líquido */}
                      <td className="px-5 py-4 text-right font-bold text-foreground text-sm">
                        R$ {Number(payment.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Status Badges */}
                      <td className="px-5 py-4 text-center">
                        {payment.status === "pago" && (
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            PAGO
                          </span>
                        )}
                        {payment.status === "aprovado" && (
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            PENDENTE
                          </span>
                        )}
                        {payment.status === "aberto" && (
                          <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                            EM ABERTO
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="w-8 h-8 rounded-lg bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                            onClick={() => setDetailsPaymentId(payment.id)}
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="w-8 h-8 rounded-lg bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                                title="Mais Opções"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-xl font-medium text-xs">
                              <DropdownMenuItem onClick={() => setDetailsPaymentId(payment.id)}>
                                <Eye className="w-4 h-4 mr-2" /> Visualizar detalhes
                              </DropdownMenuItem>
                              
                              {isAdmin && payment.status === "aberto" && (
                                <DropdownMenuItem onClick={() => setAdjustPayment({
                                  ...payment,
                                  adjs: payment.adjustments ? JSON.parse(payment.adjustments) : []
                                })}>
                                  <Settings2 className="w-4 h-4 mr-2" /> Editar / Ajustes
                                </DropdownMenuItem>
                              )}

                              {isAdmin && payment.status === "aberto" && (
                                <DropdownMenuItem onClick={() => approveMutation.mutate({ id: payment.id })}>
                                  <CheckCircle2 className="w-4 h-4 mr-2 text-amber-600" /> Aprovar Pagamento
                                </DropdownMenuItem>
                              )}

                              {isAdmin && payment.status === "aprovado" && (
                                <DropdownMenuItem onClick={() => markPaidMutation.mutate({ id: payment.id })}>
                                  <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Marcar como Pago
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem onClick={() => handlePrint(payment)}>
                                <FileText className="w-4 h-4 mr-2 text-purple-600" /> Gerar Recibo
                              </DropdownMenuItem>

                              {isAdmin && (
                                <DropdownMenuItem onClick={() => calculateSingleMutation.mutate({
                                  professorId: payment.professorId,
                                  month: viewMonth,
                                  year: viewYear,
                                })}>
                                  <RefreshCw className="w-4 h-4 mr-2 text-indigo-600" /> Recalcular
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden space-y-3">
              {displayPayments.map((payment) => (
                <div key={payment.id} className="bg-card p-4 rounded-xl border border-border space-y-3 shadow-sm">
                  <div className="card-head">
                    <div className="card-head-main">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm border border-primary/20 shrink-0">
                        {payment.professorName?.charAt(0) || "P"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-foreground text-sm truncate">{payment.professorName}</h4>
                        <p className="text-[11px] text-muted-foreground truncate">{payment.specialty || "Música"}</p>
                      </div>
                    </div>

                    <div className="card-head-fixed flex items-center gap-1">
                      {payment.status === "pago" && <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-500/20">PAGO</span>}
                      {payment.status === "aprovado" && <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] px-2 py-0.5 rounded border border-amber-500/20">PENDENTE</span>}
                      {payment.status === "aberto" && <span className="bg-muted text-muted-foreground font-bold text-[10px] px-2 py-0.5 rounded border border-border">EM ABERTO</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2.5 rounded-lg">
                    <div>
                      <span className="text-muted-foreground">Aulas:</span>
                      <p className="font-bold text-foreground">{payment.totalClasses} aulas</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Carga Horária:</span>
                      <p className="font-bold text-foreground">{formatCargaHoraria(payment.totalMinutes)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div>
                      <span className="text-[11px] text-muted-foreground font-medium">Líquido a Pagar</span>
                      <p className="font-outfit text-lg font-bold text-foreground">
                        R$ {Number(payment.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <Button size="sm" className="rounded-xl font-bold bg-primary text-primary-foreground text-xs h-8" onClick={() => setDetailsPaymentId(payment.id)}>
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Centered Footer Link */}
            <div className="text-center pt-2">
              <button 
                type="button"
                onClick={() => {
                  const el = document.getElementById("pagamentos-periodo-card");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-xs font-bold text-primary hover:underline transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                Ver todos os pagamentos <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal/Drawer: Detalhamento do Pagamento */}
      <Dialog open={!!detailsPaymentId} onOpenChange={(o) => !o && setDetailsPaymentId(null)}>
        <DialogContent className="w-[95vw] sm:max-w-4xl rounded-2xl bg-card border-border p-6 md:p-8 max-h-[90vh] overflow-y-auto text-card-foreground">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl font-black text-foreground">
              Resumo do Pagamento
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Detalhamento de atividades e cálculo financeiro do professor.
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="py-12 flex justify-center"><RefreshCw className="w-8 h-8 text-primary animate-spin" /></div>
          ) : (
            <div className="space-y-6 mt-4">
              {displayPayments.find(p => p.id === detailsPaymentId) && (
                <div className="bg-muted/40 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 border border-border">
                  <div>
                    <h3 className="font-outfit text-lg font-bold text-foreground">
                      {displayPayments.find(p => p.id === detailsPaymentId)?.professorName}
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium">
                      Período de Referência: <span className="capitalize text-foreground font-bold">{months.find(m => m.value === viewMonth)?.label} / {viewYear}</span>
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-lg font-bold text-xs">
                    Status: {displayPayments.find(p => p.id === detailsPaymentId)?.status.toUpperCase()}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Atividades */}
                <div className="bg-card p-5 rounded-xl border border-border space-y-3">
                  <h4 className="font-outfit font-bold text-sm text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> Atividades
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between pb-2 border-b border-border">
                      <span className="text-muted-foreground">Aulas realizadas:</span>
                      <span className="font-bold text-foreground">{detailsData?.lessons?.length || 0} aulas</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-border">
                      <span className="text-muted-foreground">Horas trabalhadas:</span>
                      <span className="font-bold text-foreground">
                        {formatCargaHoraria(detailsData?.lessons?.reduce((acc: number, l: any) => acc + (l.duration || 0), 0) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Alunos atendidos:</span>
                      <span className="font-bold text-foreground">
                        {new Set(detailsData?.lessons?.map((l: any) => l.studentId).filter(Boolean)).size} alunos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cálculo */}
                <div className="bg-card p-5 rounded-xl border border-border space-y-3">
                  <h4 className="font-outfit font-bold text-sm text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" /> Cálculo
                  </h4>
                  {displayPayments.find(p => p.id === detailsPaymentId) && (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between pb-2 border-b border-border">
                        <span className="text-muted-foreground">Valor das aulas:</span>
                        <span className="font-bold text-foreground">
                          R$ {Number(displayPayments.find(p => p.id === detailsPaymentId)?.totalCredits || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between pb-2 border-b border-border">
                        <span className="text-muted-foreground">Descontos:</span>
                        <span className="font-bold text-red-500 dark:text-red-400">
                          - R$ {Number(displayPayments.find(p => p.id === detailsPaymentId)?.totalDebits || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="font-bold text-primary">Líquido a receber:</span>
                        <span className="font-outfit text-lg font-black text-foreground">
                          R$ {Number(displayPayments.find(p => p.id === detailsPaymentId)?.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const pay = displayPayments.find(p => p.id === detailsPaymentId);
                    let mem: any = null;
                    try { mem = typeof pay?.calculationMemory === "string" ? JSON.parse(pay.calculationMemory) : pay?.calculationMemory; } catch { mem = null; }
                    if (!mem) return null;
                    return (
                      <div className="pt-2 border-t border-border space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Memória do cálculo</p>
                        {mem.composition?.map((line: string, i: number) => (
                          <p key={i} className="text-[11px] text-muted-foreground">{line}</p>
                        ))}
                        {mem.warnings?.map((w: string, i: number) => (
                          <p key={`w${i}`} className="text-[10px] text-amber-600">{w}</p>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Tabela de Aulas Concluídas */}
              <div className="space-y-2">
                <h4 className="font-outfit font-bold text-sm text-foreground">Aulas Ministradas no Período</h4>
                <div className="overflow-hidden rounded-xl border border-border max-h-52 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/60 text-muted-foreground font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Data</th>
                        <th className="p-2.5">Aluno</th>
                        <th className="p-2.5">Título</th>
                        <th className="p-2.5">Duração</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card font-medium">
                      {detailsData?.lessons?.map((lesson: any) => (
                        <tr key={lesson.id} className="hover:bg-muted/40">
                          <td className="p-2.5">{format(new Date(lesson.scheduledAt), "dd/MM/yyyy HH:mm")}</td>
                          <td className="p-2.5 font-bold text-foreground">{lesson.studentName || "-"}</td>
                          <td className="p-2.5 text-muted-foreground">{lesson.title}</td>
                          <td className="p-2.5">{lesson.duration}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Botão Recalcular Pagamento */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button variant="outline" className="rounded-xl text-xs bg-card border-border hover:bg-muted" onClick={() => handlePrint(displayPayments.find(p => p.id === detailsPaymentId))}>
                  <Printer className="w-3.5 h-3.5 mr-2" /> Gerar Recibo PDF
                </Button>

                {isAdmin && (
                  <Button
                    className="rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                    onClick={() => {
                      const profId = displayPayments.find(p => p.id === detailsPaymentId)?.professorId;
                      if (profId) {
                        calculateSingleMutation.mutate({
                          professorId: profId,
                          month: viewMonth,
                          year: viewYear,
                        });
                      }
                    }}
                    disabled={calculateSingleMutation.isPending}
                  >
                    {calculateSingleMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : <Calculator className="w-3.5 h-3.5 mr-2" />}
                    Recalcular Pagamento
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Novo Pagamento Manual Extraordinário */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg rounded-2xl bg-card border-border p-6 md:p-8 text-card-foreground">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl font-bold text-foreground">
              + Novo Pagamento Manual
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Utilize esta opção apenas para lançar pagamentos manuais ou extraordinários fora do fluxo automático.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleManualCreateSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground uppercase">Professor</Label>
              <Select value={manualProfId} onValueChange={setManualProfId}>
                <SelectTrigger className="w-full rounded-xl bg-muted/40 border-border text-xs font-medium">
                  <SelectValue placeholder="Selecione o professor..." />
                </SelectTrigger>
                <SelectContent>
                  {professoresList?.map((prof: any) => (
                    <SelectItem key={prof.id} value={prof.id.toString()}>
                      {prof.name} ({prof.especialidade || prof.specialty || "Música"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground uppercase">Valor Bruto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={manualCredits}
                  onChange={(e) => setManualCredits(e.target.value)}
                  className="rounded-xl bg-muted/40 border-border text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground uppercase">Descontos (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={manualDebits}
                  onChange={(e) => setManualDebits(e.target.value)}
                  className="rounded-xl bg-muted/40 border-border text-xs font-bold text-red-500 dark:text-red-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground uppercase">Observações / Descrição</Label>
              <Input
                placeholder="Ex: Bônus de fim de ano, Lançamento extra..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="rounded-xl bg-muted/40 border-border text-xs font-medium"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="ghost" className="rounded-xl text-xs" onClick={() => setIsManualModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl bg-primary text-primary-foreground font-bold text-xs" disabled={createManualMutation.isPending}>
                {createManualMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                Criar Pagamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Ajustes Manuais */}
      <Dialog open={!!adjustPayment} onOpenChange={(o) => !o && setAdjustPayment(null)}>
        <DialogContent className="w-[95vw] sm:max-w-xl rounded-2xl bg-card border-border p-6 text-card-foreground">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl font-bold text-foreground">Ajustes Manuais</DialogTitle>
          </DialogHeader>
          {adjustPayment && (
            <div className="space-y-5 mt-3">
              <div className="space-y-3">
                {adjustPayment.adjs.map((adj: any, idx: number) => (
                  <div key={idx} className="flex gap-2.5 items-center bg-muted/40 p-2 rounded-xl border border-border">
                    <Input 
                      placeholder="Descrição (ex: Bônus, Falta)" 
                      value={adj.desc} 
                      onChange={e => {
                        const newAdjs = [...adjustPayment.adjs];
                        newAdjs[idx].desc = e.target.value;
                        setAdjustPayment({...adjustPayment, adjs: newAdjs});
                      }}
                      className="flex-1 rounded-lg bg-card text-xs"
                    />
                    <Input 
                      type="number" 
                      placeholder="Valor (R$)" 
                      value={adj.value} 
                      onChange={e => {
                        const newAdjs = [...adjustPayment.adjs];
                        newAdjs[idx].value = parseFloat(e.target.value) || 0;
                        setAdjustPayment({...adjustPayment, adjs: newAdjs});
                      }}
                      className="w-28 rounded-lg bg-card font-bold text-xs"
                    />
                    <Button variant="ghost" size="icon" className="hover:bg-red-500/10 hover:text-red-500 rounded-lg h-8 w-8" onClick={() => {
                      const newAdjs = adjustPayment.adjs.filter((_:any, i:number) => i !== idx);
                      setAdjustPayment({...adjustPayment, adjs: newAdjs});
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full border-dashed border hover:bg-muted py-3 rounded-xl font-bold text-xs text-muted-foreground" onClick={() => {
                  setAdjustPayment({...adjustPayment, adjs: [...adjustPayment.adjs, { desc: "", value: 0 }]});
                }}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Novo Ajuste
                </Button>
              </div>

              <div className="bg-muted/40 p-4 rounded-xl border border-border space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Créditos Base:</span>
                  <span className="font-bold text-foreground">R$ {Number(adjustPayment.totalCredits).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Ajustes (+):</span>
                  <span>+ R$ {adjustPayment.adjs.filter((a:any)=>a.value>0).reduce((sum:number,a:any)=>sum+a.value,0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-red-500 dark:text-red-400 font-semibold">
                  <span>Ajustes (-):</span>
                  <span>- R$ {Math.abs(adjustPayment.adjs.filter((a:any)=>a.value<0).reduce((sum:number,a:any)=>sum+a.value,0)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center font-bold border-t border-border pt-2 mt-1">
                  <span className="text-foreground">Total Líquido:</span>
                  <span className="font-outfit text-base text-foreground">R$ {(
                    Number(adjustPayment.totalCredits) + 
                    adjustPayment.adjs.reduce((sum:number,a:any)=>sum+a.value,0)
                  ).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" className="rounded-xl text-xs" onClick={() => setAdjustPayment(null)}>Cancelar</Button>
                <Button className="rounded-xl bg-primary text-primary-foreground font-bold text-xs" disabled={updateAdjustmentsMutation.isPending} onClick={() => {
                  const manualCredits = adjustPayment.adjs.filter((a:any)=>a.value>0).reduce((sum:number,a:any)=>sum+a.value,0);
                  const manualDebits = Math.abs(adjustPayment.adjs.filter((a:any)=>a.value<0).reduce((sum:number,a:any)=>sum+a.value,0));
                  
                  const totalAmount = Number(adjustPayment.totalCredits) + adjustPayment.adjs.reduce((sum:number,a:any)=>sum+a.value, 0);

                  updateAdjustmentsMutation.mutate({
                    paymentId: adjustPayment.id,
                    adjustments: JSON.stringify(adjustPayment.adjs),
                    totalAmount: totalAmount,
                    totalCredits: Number(adjustPayment.totalCredits) + manualCredits,
                    totalDebits: manualDebits
                  });
                }}>
                  {updateAdjustmentsMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                  Salvar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
