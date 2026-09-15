import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Search,
  Plus,
  Filter,
  Download,
  Eye,
  RefreshCw,
  Ban,
  ShieldCheck,
  Building2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Receipt,
  FileCode,
  FileCheck,
  AlertTriangle,
  Loader2,
  Calendar,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function NotasFiscais() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Modais
  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Formulário de emissão avulsa
  const [manualForm, setManualForm] = useState({
    studentId: undefined as number | undefined,
    customerName: "",
    customerTaxId: "",
    customerEmail: "",
    valor: "",
    competencia: new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }),
    serviceId: undefined as number | undefined,
    serviceDescription: "Mensalidade referente a aulas de música",
  });

  const utils = trpc.useUtils();

  const { data: stats, isLoading: isLoadingStats } = trpc.fiscal.invoices.getStats.useQuery();
  const { data: companyConfig } = trpc.fiscal.company.get.useQuery();
  const { data: services = [] } = trpc.fiscal.services.list.useQuery();
  const { data: studentsList = [] } = trpc.students.list.useQuery();

  const { data: invoicePage, isLoading: isLoadingList, refetch } = trpc.fiscal.invoices.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    page,
    limit: 15,
  });

  const { data: singleInvoiceData, isLoading: isLoadingSingle } = trpc.fiscal.invoices.getById.useQuery(
    { id: selectedInvoiceId! },
    { enabled: !!selectedInvoiceId && detailsModalOpen }
  );

  const emitManualMutation = trpc.fiscal.invoices.emitManual.useMutation({
    onSuccess: () => {
      toast.success("NFS-e enviada para processamento com sucesso!");
      setEmitModalOpen(false);
      setManualForm({
        studentId: undefined,
        customerName: "",
        customerTaxId: "",
        customerEmail: "",
        valor: "",
        competencia: new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }),
        serviceId: undefined,
        serviceDescription: "Mensalidade referente a aulas de música",
      });
      utils.fiscal.invoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const retryMutation = trpc.fiscal.invoices.retry.useMutation({
    onSuccess: () => {
      toast.success("Solicitação de reprocessamento enviada!");
      utils.fiscal.invoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = trpc.fiscal.invoices.cancel.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Cancelamento solicitado com sucesso!");
      setCancelModalOpen(false);
      setCancelReason("");
      utils.fiscal.invoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSelectStudent = (stIdStr: string) => {
    if (stIdStr === "manual") {
      setManualForm((f) => ({ ...f, studentId: undefined }));
      return;
    }
    const stId = Number(stIdStr);
    const st = studentsList.find((s: any) => s.id === stId);
    if (st) {
      setManualForm((f) => ({
        ...f,
        studentId: st.id,
        customerName: st.fiscalLegalName || st.name,
        customerTaxId: st.fiscalCpfCnpj || st.cpf || "",
        customerEmail: st.email || "",
        valor: String(st.monthlyFee || "150"),
      }));
    }
  };

  const handleSelectService = (srvIdStr: string) => {
    const srvId = Number(srvIdStr);
    const srv = services.find((s: any) => s.id === srvId);
    if (srv) {
      setManualForm((f) => ({
        ...f,
        serviceId: srv.id,
        serviceDescription: srv.descricaoPadrao.replace("{competencia}", f.competencia),
      }));
    }
  };

  const handleEmitManual = () => {
    if (!manualForm.customerName.trim()) {
      toast.error("Informe o nome do tomador/aluno");
      return;
    }
    const cleanTax = manualForm.customerTaxId.replace(/\D/g, "");
    if (cleanTax.length < 11) {
      toast.error("CPF ou CNPJ inválido");
      return;
    }
    const numVal = parseFloat(manualForm.valor.replace(",", "."));
    if (isNaN(numVal) || numVal <= 0) {
      toast.error("Informe um valor válido para a NFS-e");
      return;
    }

    emitManualMutation.mutate({
      studentId: manualForm.studentId,
      customerName: manualForm.customerName,
      customerTaxId: cleanTax,
      customerEmail: manualForm.customerEmail || undefined,
      valor: numVal,
      competencia: manualForm.competencia,
      serviceId: manualForm.serviceId,
      serviceDescription: manualForm.serviceDescription,
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "authorized":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Emitida
          </span>
        );
      case "processing":
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Processando
          </span>
        );
      case "rejected":
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3 h-3 text-rose-500" />
            Rejeitada
          </span>
        );
      case "cancel_requested":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 text-amber-400" />
            Cancelamento solicitado
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <Ban className="w-3 h-3 text-zinc-400" />
            Cancelada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  const currencyFormat = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const formatDoc = (doc?: string) => {
    if (!doc) return "---";
    const clean = doc.replace(/\D/g, "");
    if (clean.length === 11) {
      return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
    }
    if (clean.length === 14) {
      return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.***.***/$4-$5");
    }
    return doc;
  };

  const isCompanyConfigured = !!companyConfig?.cnpj && !!companyConfig?.razaoSocial;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in-50 duration-300">
      {/* Header com Título e Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Receipt className="text-emerald-500" size={28} />
              Notas Fiscais (NFS-e)
            </h1>
            <Badge variant="outline" className="text-[10px] font-bold border-emerald-500/30 text-emerald-500 bg-emerald-500/5 uppercase tracking-wider">
              Focus NFe
            </Badge>
            <Badge className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 uppercase tracking-wider">
              🧪 Ambiente de Homologação / Testes
            </Badge>
          </div>
          <p className="text-sm font-medium text-muted-foreground mt-1">
            Gestão fiscal e simulação de emissão de NFS-e em ambiente de testes da Focus NFe.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/configuracoes">
            <Button variant="outline" className="rounded-2xl border-border h-11 px-4 font-bold text-xs gap-2">
              <Building2 size={16} />
              Configurar Fiscal
            </Button>
          </Link>
          <Button
            onClick={() => setEmitModalOpen(true)}
            className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-5 shadow-lg shadow-emerald-950/20 text-xs gap-2"
          >
            <Plus size={18} />
            Emitir NFS-e
          </Button>
        </div>
      </div>

      {/* Alerta se não configurado */}
      {!isCompanyConfigured && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-500">Configuração Fiscal Pendente</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Para emitir notas fiscais válidas, preencha os dados do CNPJ, Inscrição Municipal e Serviços em Configurações.
              </p>
            </div>
          </div>
          <Link href="/configuracoes">
            <Button size="sm" className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shrink-0">
              Completar Cadastro
            </Button>
          </Link>
        </div>
      )}

      {/* 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 lg:p-5 rounded-2xl border border-emerald-500/20 bg-card shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Notas Emitidas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-foreground mt-3">
            {isLoadingStats ? "..." : stats?.emitidas || 0}
          </p>
          <span className="text-[10px] text-emerald-600 font-bold mt-1 inline-block">Autorizadas com sucesso</span>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl border border-blue-500/20 bg-card shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Processando</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-foreground mt-3">
            {isLoadingStats ? "..." : stats?.processando || 0}
          </p>
          <span className="text-[10px] text-blue-400 font-bold mt-1 inline-block">Na fila / prefeitura</span>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl border border-rose-500/20 bg-card shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Rejeitadas</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <AlertCircle size={16} />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-foreground mt-3">
            {isLoadingStats ? "..." : stats?.rejeitadas || 0}
          </p>
          <span className="text-[10px] text-rose-500 font-bold mt-1 inline-block">Requerem correção</span>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl border border-zinc-500/20 bg-card shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Canceladas</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-500/10 text-zinc-400 flex items-center justify-center">
              <Ban size={16} />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-foreground mt-3">
            {isLoadingStats ? "..." : stats?.canceladas || 0}
          </p>
          <span className="text-[10px] text-muted-foreground font-bold mt-1 inline-block">Cancelamentos aprovados</span>
        </div>
      </div>

      {/* Cards de Faturamento e Consumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Faturamento com NFS-e */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Faturamento com NFS-e</p>
              <p className="text-2xl font-black text-foreground mt-1">
                {isLoadingStats ? "..." : currencyFormat(stats?.faturamentoNfse || 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">Total faturado em notas autorizadas</p>
            </div>
          </div>
        </div>

        {/* Consumo Fiscal */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consumo Fiscal do Plano</p>
              <p className="text-lg font-black text-foreground mt-0.5">
                {stats?.consumo.utilizado ?? 0} <span className="text-xs font-medium text-muted-foreground">/ {stats?.consumo.total ?? 4000} notas</span>
              </p>
            </div>
            <span
              className={cn(
                "text-xs font-black px-2.5 py-1 rounded-xl",
                (stats?.consumo.percentual ?? 0) >= 95
                  ? "bg-rose-500/20 text-rose-500"
                  : (stats?.consumo.percentual ?? 0) >= 80
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-emerald-500/20 text-emerald-500"
              )}
            >
              {stats?.consumo.percentual ?? 0}% utilizado
            </span>
          </div>

          {/* Barra de Progresso */}
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                (stats?.consumo.percentual ?? 0) >= 95
                  ? "bg-rose-500"
                  : (stats?.consumo.percentual ?? 0) >= 80
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              )}
              style={{ width: `${stats?.consumo.percentual ?? 0}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Cota mensal de emissões via Focus NFe</p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CPF/CNPJ, nº da nota..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 h-10 rounded-xl bg-background border-border text-xs font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 px-3 rounded-xl border-border bg-background text-xs font-bold w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-card">
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="authorized">Emitidas</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="rejected">Rejeitadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="error">Erros</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            className="h-10 w-10 rounded-xl hover:bg-muted"
            title="Atualizar lista"
          >
            <RefreshCw size={16} className={isLoadingList ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Tabela de Notas Fiscais */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-3.5 px-4">Nº</th>
                <th className="py-3.5 px-4">Cliente / Tomador</th>
                <th className="py-3.5 px-4">CPF / CNPJ</th>
                <th className="py-3.5 px-4">Valor</th>
                <th className="py-3.5 px-4">Competência</th>
                <th className="py-3.5 px-4">Data Emissão</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoadingList ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="animate-spin inline mr-2 text-emerald-500" size={20} />
                    Carregando notas fiscais...
                  </td>
                </tr>
              ) : !invoicePage?.items || invoicePage.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Receipt className="mx-auto text-muted-foreground/40 mb-2" size={32} />
                    <p className="font-bold text-sm">Nenhuma nota fiscal encontrada</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      As notas emitidas manualmente ou automaticamente aparecerão aqui.
                    </p>
                  </td>
                </tr>
              ) : (
                invoicePage.items.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      {inv.numero ? `#${inv.numero}` : <span className="text-muted-foreground/60">---</span>}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-foreground">
                      <p className="truncate max-w-[200px]">{inv.customerName}</p>
                      {inv.customerEmail && (
                        <p className="text-[10px] text-muted-foreground font-normal truncate max-w-[200px]">
                          {inv.customerEmail}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">
                      {formatDoc(inv.customerTaxId)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-foreground">
                      {currencyFormat(Number(inv.valor || 0))}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-muted-foreground">
                      {inv.competencia || "---"}
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground">
                      {inv.dataEmissao
                        ? new Date(inv.dataEmissao).toLocaleDateString("pt-BR")
                        : new Date(inv.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3.5 px-4">{statusBadge(inv.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* Ver Detalhes */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedInvoiceId(inv.id);
                            setDetailsModalOpen(true);
                          }}
                          className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Ver detalhes da nota"
                        >
                          <Eye size={15} />
                        </Button>

                        {/* Baixar PDF */}
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                              title="Visualizar / Baixar PDF"
                            >
                              <Download size={15} />
                            </Button>
                          </a>
                        )}

                        {/* Baixar XML */}
                        {inv.xmlUrl && (
                          <a href={inv.xmlUrl} target="_blank" rel="noopener noreferrer">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-blue-400 hover:text-blue-500 hover:bg-blue-500/10"
                              title="Baixar XML"
                            >
                              <FileCode size={15} />
                            </Button>
                          </a>
                        )}

                        {/* Tentar Novamente se Erro/Rejeitada */}
                        {["rejected", "error"].includes(inv.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => retryMutation.mutate({ id: inv.id })}
                            className="h-8 w-8 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                            title="Tentar emitir novamente"
                          >
                            <RefreshCw size={15} />
                          </Button>
                        )}

                        {/* Cancelar se Autorizada */}
                        {inv.status === "authorized" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInvoiceId(inv.id);
                              setCancelModalOpen(true);
                            }}
                            className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            title="Solicitar cancelamento"
                          >
                            <Ban size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {invoicePage && invoicePage.totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Mostrando {invoicePage.items.length} de {invoicePage.totalCount} notas
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 rounded-xl text-xs font-bold"
              >
                <ChevronLeft size={14} className="mr-1" /> Anterior
              </Button>
              <span className="font-bold text-foreground">
                {page} / {invoicePage.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= invoicePage.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 rounded-xl text-xs font-bold"
              >
                Próxima <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Emitir NFS-e Manual */}
      <Dialog open={emitModalOpen} onOpenChange={setEmitModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <Receipt className="text-emerald-500" size={20} />
              Emitir NFS-e Manual / Avulsa
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Preencha os dados do tomador e do serviço para emitir uma nova nota fiscal na prefeitura via Focus NFe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <Label className="text-xs font-bold">Vincular a Aluno Cadastrado (Opcional)</Label>
              <Select onValueChange={handleSelectStudent}>
                <SelectTrigger className="mt-1.5 h-11 rounded-2xl border-border bg-background font-medium text-xs">
                  <SelectValue placeholder="Selecione um aluno ou preencha avulso" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border bg-card max-h-56">
                  <SelectItem value="manual">Preencher dados avulsos</SelectItem>
                  {studentsList.map((st: any) => (
                    <SelectItem key={st.id} value={String(st.id)}>
                      {st.name} ({st.cpf || "sem CPF"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Nome / Razão Social do Tomador *</Label>
                <Input
                  value={manualForm.customerName}
                  onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
                  placeholder="Ex: João da Silva"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">CPF ou CNPJ *</Label>
                <Input
                  value={manualForm.customerTaxId}
                  onChange={(e) => setManualForm({ ...manualForm, customerTaxId: e.target.value })}
                  placeholder="000.000.000-00"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold">Valor (R$) *</Label>
                <Input
                  value={manualForm.valor}
                  onChange={(e) => setManualForm({ ...manualForm, valor: e.target.value })}
                  placeholder="150,00"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs font-bold"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Competência *</Label>
                <Input
                  value={manualForm.competencia}
                  onChange={(e) => setManualForm({ ...manualForm, competencia: e.target.value })}
                  placeholder="08/2026"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">E-mail</Label>
                <Input
                  value={manualForm.customerEmail}
                  onChange={(e) => setManualForm({ ...manualForm, customerEmail: e.target.value })}
                  placeholder="aluno@email.com"
                  className="mt-1.5 h-11 rounded-2xl bg-background border-border text-xs"
                />
              </div>
            </div>

            {services.length > 0 && (
              <div>
                <Label className="text-xs font-bold">Serviço Tributável</Label>
                <Select onValueChange={handleSelectService}>
                  <SelectTrigger className="mt-1.5 h-11 rounded-2xl border-border bg-background font-medium text-xs">
                    <SelectValue placeholder="Selecione um serviço configurado" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-border bg-card">
                    {services.map((srv: any) => (
                      <SelectItem key={srv.id} value={String(srv.id)}>
                        {srv.nome} (Cód: {srv.codigoServico})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs font-bold">Discriminação / Descrição dos Serviços *</Label>
              <Textarea
                rows={3}
                value={manualForm.serviceDescription}
                onChange={(e) => setManualForm({ ...manualForm, serviceDescription: e.target.value })}
                placeholder="Descrição que sairá impressa na NFS-e..."
                className="mt-1.5 rounded-2xl bg-background border-border text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setEmitModalOpen(false)}
              className="rounded-2xl h-11 text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEmitManual}
              disabled={emitManualMutation.isPending}
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-5 text-xs shadow-lg shadow-emerald-950/20"
            >
              {emitManualMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} /> Emitindo...
                </>
              ) : (
                "Confirmar Emissão"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhes da NFS-e */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-xl rounded-3xl border-border bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <Receipt className="text-emerald-500" size={20} />
              NFS-e {singleInvoiceData?.invoice.numero ? `#${singleInvoiceData.invoice.numero}` : "Detalhes"}
            </DialogTitle>
          </DialogHeader>

          {isLoadingSingle || !singleInvoiceData ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="animate-spin inline mr-2 text-emerald-500" size={20} />
              Carregando detalhes...
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status Atual</span>
                  <div className="mt-1">{statusBadge(singleInvoiceData.invoice.status)}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Valor Total</span>
                  <p className="text-base font-black text-foreground mt-0.5">
                    {currencyFormat(Number(singleInvoiceData.invoice.valor))}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-muted/20 border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Tomador</span>
                  <p className="font-bold text-foreground mt-0.5">{singleInvoiceData.invoice.customerName}</p>
                  <p className="text-muted-foreground font-mono text-[11px]">{singleInvoiceData.invoice.customerTaxId}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Competência / Emissão</span>
                  <p className="font-bold text-foreground mt-0.5">{singleInvoiceData.invoice.competencia || "---"}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {singleInvoiceData.invoice.dataEmissao
                      ? new Date(singleInvoiceData.invoice.dataEmissao).toLocaleString("pt-BR")
                      : "Pendente"}
                  </p>
                </div>
              </div>

              {singleInvoiceData.invoice.codigoVerificacao && (
                <div className="p-3 rounded-2xl bg-muted/20 border border-border flex items-center justify-between">
                  <span className="text-muted-foreground font-bold">Código de Verificação:</span>
                  <span className="font-mono font-bold text-foreground bg-background px-2.5 py-1 rounded-lg border border-border">
                    {singleInvoiceData.invoice.codigoVerificacao}
                  </span>
                </div>
              )}

              {singleInvoiceData.invoice.errorMessage && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                  <span className="font-black block text-[11px]">Motivo do Erro / Rejeição:</span>
                  <p className="mt-1 text-xs">{singleInvoiceData.invoice.errorMessage}</p>
                </div>
              )}

              {/* Histórico / Logs */}
              <div>
                <span className="font-bold text-foreground text-xs block mb-2">Histórico de Auditoria</span>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {singleInvoiceData.logs.map((l: any) => (
                    <div key={l.id} className="p-2.5 rounded-xl bg-background border border-border flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-bold text-foreground">{l.event}</span>
                        {l.userName && <span className="text-muted-foreground ml-1.5 font-medium">por {l.userName}</span>}
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(l.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                {singleInvoiceData.invoice.pdfUrl && (
                  <a href={singleInvoiceData.invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="rounded-xl h-10 text-xs font-bold gap-1.5">
                      <Download size={14} /> Baixar PDF
                    </Button>
                  </a>
                )}
                {singleInvoiceData.invoice.xmlUrl && (
                  <a href={singleInvoiceData.invoice.xmlUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="rounded-xl h-10 text-xs font-bold gap-1.5">
                      <FileCode size={14} /> Baixar XML
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Cancelamento */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border bg-card p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-500 flex items-center gap-2">
              <Ban size={20} />
              Solicitar Cancelamento de NFS-e
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Esta ação enviará a solicitação de cancelamento para a prefeitura via Focus NFe. Informe o motivo detalhado.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs">
            <Label className="text-xs font-bold">Motivo do Cancelamento *</Label>
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: Cobrança emitida em duplicidade ou cancelada pelo aluno..."
              className="mt-1.5 rounded-2xl bg-background border-border text-xs resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setCancelModalOpen(false)}
              className="rounded-2xl h-11 text-xs font-bold"
            >
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (selectedInvoiceId && cancelReason.trim().length >= 5) {
                  cancelMutation.mutate({ id: selectedInvoiceId, reason: cancelReason });
                } else {
                  toast.error("Informe um motivo com pelo menos 5 caracteres");
                }
              }}
              disabled={cancelMutation.isPending}
              className="rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold h-11 px-5 text-xs shadow-lg shadow-rose-950/20"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} /> Cancelando...
                </>
              ) : (
                "Confirmar Cancelamento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
