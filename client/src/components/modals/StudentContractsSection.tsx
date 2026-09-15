import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FileSignature, Plus, Copy, Eye, RefreshCw, Ban, Download, Loader2,
  Clock, CheckCircle2, XCircle, AlertTriangle, History, Link2, FileText, RotateCcw, Trash2,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  rascunho: { label: "Rascunho", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20", icon: FileText },
  enviado: { label: "Enviado", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
  aguardando_assinatura: { label: "Aguardando assinatura", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  assinado: { label: "Assinado", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20", icon: XCircle },
  expirado: { label: "Expirado", cls: "bg-slate-500/10 text-slate-500 border-slate-500/20", icon: XCircle },
  erro: { label: "Erro", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20", icon: AlertTriangle },
};

function fmtDate(d?: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ContractStatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border", c.cls)}>
      <Icon size={11} /> {c.label}
    </span>
  );
}

export function CreateContractModal({ open, onClose, student, onCreated }: {
  open: boolean;
  onClose: () => void;
  student: any;
  onCreated: () => void;
}) {
  const { data: templates = [] } = trpc.contractTemplates.list.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();

  const createMutation = trpc.contracts.createAssinafy.useMutation({
    onSuccess: (res) => {
      toast.success(`Contrato criado! Nº ${res.contract?.contractNumber || ""}`);
      if (res.signUrl) {
        navigator.clipboard.writeText(res.signUrl).catch(() => {});
      }
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyFeeOverride, setMonthlyFeeOverride] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const isMinorStudent = Boolean(student?.guardianName?.trim() || student?.guardianEmail?.trim());

  // ─── Auto-seleciona o modelo adequado (Menor de Idade vs Padrão) ao abrir o modal
  useEffect(() => {
    if (open && templates.length > 0) {
      if (isMinorStudent) {
        const minorTpl = templates.find((t: any) => t.name.toLowerCase().includes("menor"));
        if (minorTpl) {
          setTemplateId(minorTpl.id);
          return;
        }
      }
      setTemplateId(templates[0]?.id ?? null);
    }
  }, [open, templates, isMinorStudent]);

  const selectedTemplate = templates.find((t: any) => t.id === templateId);

  const handlePreview = async () => {
    if (!templateId) return;
    setPreviewing(true);
    try {
      const data = await utils.contracts.previewPdf.fetch({
        studentId: student.id,
        templateId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        monthlyFeeOverride: monthlyFeeOverride || undefined,
      });
      if (!data?.base64) return toast.error("Não foi possível gerar a pré-visualização.");
      const bytes = atob(data.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar pré-visualização");
    } finally {
      setPreviewing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-foreground">Criar contrato</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Aluno: <b>{student?.name}</b></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {student?.guardianName && (
            <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500 block">Responsável Legal (Signatário)</span>
                <span className="font-black text-foreground">{student.guardianName}</span>
                {student.guardianEmail && <span className="text-[10px] text-muted-foreground block">{student.guardianEmail}</span>}
              </div>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-600">
                Menor de Idade
              </span>
            </div>
          )}

          {student?.instrumentName && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50 text-xs">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Instrumento</span>
              <span className="font-black text-foreground">{student.instrumentName}</span>
            </div>
          )}
          {Number(student?.monthlyFee) > 0 && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50 text-xs">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Valor</span>
              <span className="font-black text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(student?.monthlyFee))}
              </span>
            </div>
          )}
          {student?.dueDay && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50 text-xs">
              <span className="text-muted-foreground font-bold uppercase tracking-wider text-[10px]">Vencimento</span>
              <span className="font-black text-foreground">Dia {student.dueDay}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">Modelo de Contrato</label>
              {selectedTemplate && (
                <span className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                  selectedTemplate.name.toLowerCase().includes("menor")
                    ? "bg-violet-500/10 text-violet-600 border-violet-500/20"
                    : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                )}>
                  {selectedTemplate.name.toLowerCase().includes("menor") ? "👶 Aluno Menor de Idade" : "🎓 Aluno Maior de Idade"}
                </span>
              )}
            </div>
            <select
              value={templateId ?? ""}
              onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="h-12 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
            >
              <option value="">Selecione um modelo...</option>
              {templates.map((t: any) => {
                const isMinor = t.name.toLowerCase().includes("menor");
                return (
                  <option key={t.id} value={t.id}>
                    {isMinor ? "👶 " : "🎓 "}
                    {t.name}
                  </option>
                );
              })}
            </select>
            {isMinorStudent && selectedTemplate && !selectedTemplate.name.toLowerCase().includes("menor") && (
              <p className="text-[10px] text-amber-500 font-bold mt-1 ml-1">
                ⚠️ Este aluno possui responsável legal cadastrado. Recomendamos selecionar o modelo "Aluno Menor de Idade".
              </p>
            )}
            {isMinorStudent && selectedTemplate && selectedTemplate.name.toLowerCase().includes("menor") && (
              <p className="text-[10px] text-emerald-600 font-bold mt-1 ml-1">
                ✓ Cláusulas do Responsável Legal (Contratante) e Aluno Beneficiário ativas.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">
              Valor do contrato <span className="normal-case opacity-60">(opcional — se diferente da mensalidade)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={student?.monthlyFee ? `R$ ${student.monthlyFee}` : "R$ 0,00"}
              value={monthlyFeeOverride}
              onChange={(e) => setMonthlyFeeOverride(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">Data de início</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] ml-1">Data de término</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold" onClick={onClose}>Cancelar</Button>
            <Button
              variant="outline"
              disabled={!templateId || previewing}
              onClick={handlePreview}
              className="flex-1 h-11 rounded-xl font-bold"
            >
              {previewing ? <Loader2 size={16} className="animate-spin mr-2" /> : <Eye size={16} className="mr-2" />}
              Pré-visualizar
            </Button>
            <Button
              disabled={!templateId || createMutation.isPending}
              onClick={() => createMutation.mutate({
                studentId: student.id,
                templateId: templateId!,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                monthlyFeeOverride: monthlyFeeOverride || undefined,
              })}
              className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <FileSignature size={16} className="mr-2" />}
              Gerar contrato
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentContractsSection({ studentId, student }: { studentId: number; student?: any }) {
  const utils = trpc.useUtils();
  const { data: contracts = [], isLoading } = trpc.contracts.list.useQuery({ studentId }, { refetchInterval: 30_000 });
  const { data: integration } = trpc.signatureIntegrations.getStatus.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [resending, setResending] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [renewing, setRenewing] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const invalidate = () => {
    utils.contracts.list.invalidate({ studentId });
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

  const deleteMutation = trpc.contracts.remove.useMutation({
    onSuccess: () => { toast.success("Contrato excluído."); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const resendMutation = trpc.contracts.resend.useMutation({
    onSuccess: () => { toast.success("Contrato reenviado!"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const renewMutation = trpc.contracts.renew.useMutation({
    onSuccess: (res) => {
      toast.success(`Contrato renovado! Nº ${res.contract?.contractNumber || ""}`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRefresh = (contract: any) => {
    setRefreshing(contract.id);
    refreshMutation.mutate({ id: contract.id }, { onSettled: () => setRefreshing(null) });
  };

  const handleRenew = (contract: any) => {
    if (!window.confirm("Gerar um novo contrato de renovação para este aluno (mesmo modelo e valores)?")) return;
    setRenewing(contract.id);
    renewMutation.mutate({ contractId: contract.id }, { onSettled: () => setRenewing(null) });
  };

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

  const { data: detailsData } = trpc.contracts.details.useQuery(
    { id: detailsId as number },
    { enabled: detailsId !== null }
  );

  const hasIntegration = integration?.active && integration.connectionStatus === "connected";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <FileSignature size={13} className="text-violet-500" /> Contratos ({contracts.length})
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-violet-500/20"
        >
          <Plus size={13} strokeWidth={3} /> Criar contrato
        </button>
      </div>

      {!hasIntegration && contracts.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground font-medium leading-relaxed">
          Assinatura digital não configurada. Conecte sua conta da <b>Assinafy</b> em
          {" "}<span className="text-violet-600 font-bold cursor-pointer" onClick={() => (window as any).location?.assign?.("/configuracoes?tab=integracoes")}>Configurações → Integrações</span>{" "}
          para enviar contratos para assinatura.
        </div>
      )}

      {isLoading ? (
        <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Carregando contratos...
        </div>
      ) : contracts.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground italic">Nenhum contrato registrado.</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract: any) => {
            const isSigned = contract.status === "assinado";
            const cancellable = !isSigned && contract.status !== "cancelado";
            return (
              <div key={contract.id} className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground truncate">
                      {contract.contractNumber ? contract.contractNumber : contract.title}
                    </p>
                    {contract.contractNumber && <p className="text-[10px] text-muted-foreground font-medium truncate">{contract.title}</p>}
                    <ContractStatusBadge status={contract.status} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                    {fmtDate(contract.createdAt)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-medium">
                  {contract.monthlyFee != null && (
                    <p>Valor: <b className="text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(contract.monthlyFee))}</b></p>
                  )}
                  {contract.dueDay != null && <p>Vencimento: <b className="text-foreground">Dia {contract.dueDay}</b></p>}
                  {contract.startDate && <p>Início: <b className="text-foreground">{fmtDate(contract.startDate)}</b></p>}
                  {contract.endDate && <p>Término: <b className="text-foreground">{fmtDate(contract.endDate)}</b></p>}
                </div>

                {(contract.sentAt || contract.signedAt) && (
                  <div className="text-[10px] text-muted-foreground font-medium space-y-0.5">
                    {contract.sentAt && <p>Enviado em: <b>{fmtDate(contract.sentAt)}</b></p>}
                    {isSigned && contract.signedAt && (
                      <p className="text-emerald-600 font-bold">Assinado em: {new Date(contract.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" disabled={refreshing === contract.id} onClick={() => handleRefresh(contract)}>
                    {refreshing === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                    Atualizar status
                  </Button>
                  {contract.assinafySignUrl && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" onClick={() => window.open(contract.assinafySignUrl, "_blank")}>
                        <Eye size={12} className="mr-1" /> Visualizar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" onClick={() => {
                        navigator.clipboard.writeText(contract.assinafySignUrl);
                        toast.success("Link copiado!");
                      }}>
                        <Copy size={12} className="mr-1" /> Copiar link
                      </Button>
                    </>
                  )}
                  {cancellable && contract.provider === "assinafy" && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" disabled={resending === contract.id} onClick={() => {
                        setResending(contract.id);
                        resendMutation.mutate({ id: contract.id }, { onSettled: () => setResending(null) });
                      }}>
                        {resending === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                        Enviar novamente
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold text-rose-600 border-rose-500/20 hover:bg-rose-500/10" disabled={cancelling === contract.id} onClick={() => {
                        if (!window.confirm("Deseja cancelar este contrato?")) return;
                        setCancelling(contract.id);
                        cancelMutation.mutate({ id: contract.id }, { onSettled: () => setCancelling(null) });
                      }}>
                        {cancelling === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Ban size={12} className="mr-1" />}
                        Cancelar
                      </Button>
                    </>
                  )}
                  {isSigned && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold text-violet-600 border-violet-500/20 hover:bg-violet-500/10" disabled={renewing === contract.id} onClick={() => handleRenew(contract)}>
                        {renewing === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <RotateCcw size={12} className="mr-1" />}
                        Renovar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10" disabled={downloading === contract.id} onClick={() => handleDownload(contract)}>
                        {downloading === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Download size={12} className="mr-1" />}
                        Baixar contrato
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 rounded-lg text-[10px] font-bold" onClick={() => setDetailsId(detailsId === contract.id ? null : contract.id)}>
                    <History size={12} className="mr-1" /> Histórico
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold text-rose-600 border-rose-500/20 hover:bg-rose-500/10" disabled={deleting === contract.id} onClick={() => {
                    if (!window.confirm("Excluir este contrato permanentemente? Esta ação não pode ser desfeita.")) return;
                    setDeleting(contract.id);
                    deleteMutation.mutate({ id: contract.id }, { onSettled: () => setDeleting(null) });
                  }}>
                    {deleting === contract.id ? <Loader2 size={12} className="animate-spin mr-1" /> : <Trash2 size={12} className="mr-1" />}
                    Excluir
                  </Button>
                </div>

                {detailsId === contract.id && (
                  <div className="border-t border-border/40 pt-3 space-y-1.5">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Histórico do contrato</p>
                    {(detailsData?.events || []).length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">Sem eventos registrados.</p>
                    ) : (
                      (detailsData?.events || []).map((ev: any) => (
                        <div key={ev.id} className="flex items-start justify-between gap-3 text-[10px]">
                          <span className="font-bold text-foreground">{ev.description || ev.eventType}</span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(ev.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateContractModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        student={student || { id: studentId, name: "" }}
        onCreated={invalidate}
      />
    </div>
  );
}
