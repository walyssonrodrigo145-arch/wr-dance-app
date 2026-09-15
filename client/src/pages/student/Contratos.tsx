import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileSignature, Loader2, Download, Eye, RefreshCcw } from "lucide-react";

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

export default function StudentContracts() {
  const utils = trpc.useUtils();
  const { data: contracts = [], isLoading } = trpc.contracts.my.useQuery(undefined, { refetchInterval: 30_000 });
  const [downloading, setDownloading] = useState<number | null>(null);
  const [renewTarget, setRenewTarget] = useState<any>(null);

  const renewMutation = trpc.contracts.renewByStudent.useMutation({
    onSuccess: (data: any) => {
      utils.contracts.my.invalidate();
      setRenewTarget(null);
      // Popup pode ser bloqueado pelo navegador — fallback: assinar via "Meus contratos"
      const win = data?.signUrl ? window.open(data.signUrl, "_blank") : null;
      if (win) toast.success("Renovação gerada! Abrimos o link para você assinar.");
      else toast.success("Renovação gerada! Abra o contrato em 'Aguardando assinatura' abaixo para assinar.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível renovar agora."),
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

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-outfit font-extrabold text-foreground flex items-center gap-2">
          <FileSignature size={22} className="text-violet-500" /> Meus contratos
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground font-medium">Contratos da sua matrícula para assinatura digital.</p>
      </div>

      {isLoading ? (
        <div className="p-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-violet-500" /> Carregando...
        </div>
      ) : contracts.length === 0 ? (
        <div className="p-12 text-center bg-card border border-border/60 rounded-2xl">
          <FileSignature size={32} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Você ainda não tem contratos disponíveis.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract: any) => {
            const isSigned = contract.status === "assinado";
            return (
              <div key={contract.id} className="bg-card border border-border/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      {contract.contractNumber || contract.title}
                    </p>
                    <StatusBadge status={contract.status} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                    {fmtDate(contract.createdAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-medium">
                  {contract.monthlyFee != null && (
                    <p>Valor: <b className="text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(contract.monthlyFee))}</b></p>
                  )}
                  {contract.endDate && <p>Vigência: <b className="text-foreground">até {fmtDate(contract.endDate)}</b></p>}
                  {isSigned && contract.signedAt && (
                    <p className="text-emerald-600 font-bold">Assinado em: {new Date(contract.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {contract.assinafySignUrl && (
                    <Button size="sm" variant="outline" className="h-9 rounded-lg text-[10px] font-bold" onClick={() => window.open(contract.assinafySignUrl, "_blank")}>
                      <Eye size={12} className="mr-1" /> Assinar / Visualizar
                    </Button>
                  )}
                  {isSigned && (
                    <Button size="sm" variant="outline" className="h-9 rounded-lg text-[10px] font-bold text-emerald-600 border-emerald-500/20" disabled={downloading === contract.id} onClick={() => handleDownload(contract)}>
                      {downloading === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Download size={12} className="mr-1" />}
                      Baixar contrato
                    </Button>
                  )}
                  {contract.canRenew && (
                    <Button size="sm" className="h-9 rounded-lg text-[10px] font-black uppercase tracking-wider bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setRenewTarget(contract)}>
                      <RefreshCcw size={12} className="mr-1" /> Renovar contrato
                    </Button>
                  )}
                  {contract.renewalPending && !contract.assinafySignUrl && (
                    <span className="text-[10px] font-bold text-amber-600 self-center">Renovação em andamento</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal de confirmação da renovação ── */}
      <Dialog open={!!renewTarget} onOpenChange={(o) => !o && setRenewTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md rounded-[1.5rem] bg-card border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <RefreshCcw size={18} className="text-violet-500" /> Renovar contrato
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Vamos gerar a renovação do seu contrato com as condições do seu plano. Você será direcionado para assinar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs font-bold text-foreground bg-muted/40 rounded-xl p-3.5">
            {renewTarget?.contractNumber && <p>Contrato atual: {renewTarget.contractNumber}</p>}
            {renewTarget?.renewPreview?.monthlyFee != null && (
              <p>Novo valor mensal: <span className="text-violet-600 dark:text-violet-400">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(renewTarget.renewPreview.monthlyFee))}</span></p>
            )}
            {renewTarget?.renewPreview?.startDate && (
              <p>Nova vigência: <span className="text-foreground">{fmtDate(renewTarget.renewPreview.startDate)} até {fmtDate(renewTarget.renewPreview.endDate)}</span></p>
            )}
            {renewTarget?.endDate && !renewTarget?.renewPreview && <p>Vigência atual: até {fmtDate(renewTarget.endDate)}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRenewTarget(null)} className="flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
            <Button disabled={renewMutation.isPending} onClick={() => renewTarget && renewMutation.mutate({ contractId: renewTarget.id })} className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest">
              {renewMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCcw size={13} className="mr-1" />} Confirmar renovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}