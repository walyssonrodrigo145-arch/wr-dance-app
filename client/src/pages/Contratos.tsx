import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  FileSignature, Loader2, Search, Copy, Eye, Download, RefreshCw, Ban, RotateCcw, History, UserRound,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  enviado: { label: "Enviado", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  aguardando_assinatura: { label: "Aguardando assinatura", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  assinado: { label: "Assinado", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelado: { label: "Cancelado", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  expirado: { label: "Expirado", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  erro: { label: "Erro", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
};

function fmtDate(d?: string | Date | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho;
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border", c.cls)}>
      {c.label}
    </span>
  );
}

export default function Contratos() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: contracts = [], isLoading } = trpc.contracts.list.useQuery({}, { refetchInterval: 30_000 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [resending, setResending] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [renewing, setRenewing] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const invalidate = () => {
    utils.contracts.list.invalidate();
    utils.contracts.details.invalidate();
  };

  const refreshMutation = trpc.contracts.refreshStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.contracts.cancel.useMutation({
    onSuccess: () => { toast.success("Contrato cancelado."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resendMutation = trpc.contracts.resend.useMutation({
    onSuccess: () => { toast.success("Contrato reenviado!"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const renewMutation = trpc.contracts.renew.useMutation({
    onSuccess: (res) => { toast.success(`Contrato renovado! Nº ${res.contract?.contractNumber || ""}`); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleDownload = async (contract: any) => {
    setDownloading(contract.id);
    try {
      const data = await utils.contracts.downloadSigned.fetch({ id: contract.id });
      if (!data?.base64) return;
      const bytes = atob(data.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName || "contrato.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar contrato");
    } finally {
      setDownloading(null);
    }
  };

  const filtered = contracts.filter((c: any) => {
    const q = search.trim().toLowerCase();
    const hay = `${c.studentName || ""} ${c.title || ""} ${c.contractNumber || ""}`.toLowerCase();
    return (!q || hay.includes(q)) && (statusFilter === "todos" || c.status === statusFilter);
  });

  const { data: detailsData } = trpc.contracts.details.useQuery(
    { id: detailsId as number },
    { enabled: detailsId !== null }
  );

  const statusCount = (s: string) => contracts.filter((c: any) => c.status === s).length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-outfit font-extrabold text-foreground flex items-center gap-2">
            <FileSignature size={22} className="text-violet-500" /> Contratos
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">Todos os contratos da sua escola ({contracts.length})</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por aluno, número ou título..."
            className="h-11 w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
        >
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({statusCount(k)})</option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin text-violet-500" /> Carregando contratos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileSignature size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum contrato encontrado.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Crie contratos na ficha do aluno para que eles apareçam aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Aluno</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criado em</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contract: any) => {
                  const isSigned = contract.status === "assinado";
                  const cancellable = !isSigned && contract.status !== "cancelado";
                  return (
                    <tr key={contract.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-xs font-black text-foreground">
                          {contract.contractNumber || `#${contract.id}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{contract.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-violet-600 transition-colors"
                          onClick={() => setLocation(`/alunos/${contract.studentId}/editar`)}
                        >
                          <UserRound size={13} className="text-muted-foreground" />
                          {contract.studentName || "—"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold">
                        {contract.monthlyFee != null
                          ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(contract.monthlyFee))
                          : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={contract.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(contract.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-[10px] font-bold" disabled={refreshing === contract.id} onClick={() => {
                            setRefreshing(contract.id);
                            refreshMutation.mutate({ id: contract.id }, { onSettled: () => setRefreshing(null) });
                          }}>
                            {refreshing === contract.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                          </Button>
                          {contract.assinafySignUrl && (
                            <Button size="sm" variant="outline" className="h-7 rounded-lg text-[10px] font-bold" onClick={() => window.open(contract.assinafySignUrl, "_blank")}>
                              <Eye size={11} className="mr-1" /> Ver
                            </Button>
                          )}
                          {isSigned && (
                            <Button size="sm" variant="outline" className="h-7 rounded-lg text-[10px] font-bold" disabled={downloading === contract.id} onClick={() => handleDownload(contract)}>
                              {downloading === contract.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                            </Button>
                          )}
                          {cancellable && (
                            <Button size="sm" variant="outline" className="h-7 rounded-lg text-[10px] font-bold text-rose-600 border-rose-500/20" disabled={cancelling === contract.id} onClick={() => {
                              if (!window.confirm("Deseja cancelar este contrato?")) return;
                              setCancelling(contract.id);
                              cancelMutation.mutate({ id: contract.id }, { onSettled: () => setCancelling(null) });
                            }}>
                              {cancelling === contract.id ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                            </Button>
                          )}
                          {isSigned && (
                            <Button size="sm" variant="outline" className="h-7 rounded-lg text-[10px] font-bold text-violet-600 border-violet-500/20" disabled={renewing === contract.id} onClick={() => {
                              if (!window.confirm("Gerar um contrato de renovação para este aluno?")) return;
                              setRenewing(contract.id);
                              renewMutation.mutate({ contractId: contract.id }, { onSettled: () => setRenewing(null) });
                            }}>
                              {renewing === contract.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-[10px] font-bold" onClick={() => setDetailsId(detailsId === contract.id ? null : contract.id)}>
                            <History size={11} className="mr-1" /> Histórico
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailsId !== null && (detailsData?.events?.length ?? 0) > 0 && (
        <div className="bg-card border border-border/60 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Histórico</p>
          {detailsData?.events.map((ev: any) => (
            <div key={ev.id} className="flex items-start justify-between gap-3 text-xs border-b border-border/40 last:border-0 pb-2 last:pb-0">
              <span className="font-bold text-foreground">{ev.description || ev.eventType}</span>
              <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                {new Date(ev.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}