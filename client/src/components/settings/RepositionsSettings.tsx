import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Repeat, Timer, Lock, Unlock, Save, Plus, Pencil, Trash2, Loader2, Power, ShieldAlert,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/**
 * PRD 01 §3/§5/§6 — Configurações → Reposições
 * - Política: prazo para realizar a reposição + quando liberar o crédito.
 * - Motivos: CRUD (nome, descrição, ativo, gera direito à reposição).
 */
export function RepositionsSettings() {
  const utils = trpc.useUtils();

  // ── Política ──
  const { data: policiesData, isLoading: isLoadingPolicies } = trpc.repositions.getPolicies.useQuery();
  const [expirationDays, setExpirationDays] = useState(30);
  const [expirationUnit, setExpirationUnit] = useState("dias");
  const [creditRelease, setCreditRelease] = useState("imediata");

  useEffect(() => {
    if (policiesData?.policy) {
      setExpirationDays(policiesData.policy.expirationDays);
      setExpirationUnit(policiesData.policy.expirationUnit);
      setCreditRelease(policiesData.policy.creditRelease);
    }
  }, [policiesData]);

  const savePolicies = trpc.repositions.updatePolicies.useMutation({
    onSuccess: () => {
      toast.success("Política de reposição salva!");
      utils.repositions.getPolicies.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar a política."),
  });

  // ── Motivos ──
  const { data: reasons = [], isLoading: isLoadingReasons } = trpc.repositions.listReasons.useQuery();
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<any>(null);
  const [reasonName, setReasonName] = useState("");
  const [reasonDescription, setReasonDescription] = useState("");
  const [reasonGenerates, setReasonGenerates] = useState(true);

  const createReason = trpc.repositions.createReason.useMutation({
    onSuccess: () => {
      toast.success("Motivo criado!");
      utils.repositions.listReasons.invalidate();
      setReasonModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar o motivo."),
  });
  const updateReason = trpc.repositions.updateReason.useMutation({
    onSuccess: () => {
      toast.success("Motivo atualizado!");
      utils.repositions.listReasons.invalidate();
      setReasonModalOpen(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar o motivo."),
  });
  const toggleReason = trpc.repositions.updateReason.useMutation({
    onSuccess: () => utils.repositions.listReasons.invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao alterar o motivo."),
  });
  const deleteReason = trpc.repositions.deleteReason.useMutation({
    onSuccess: () => {
      toast.success("Motivo excluído.");
      utils.repositions.listReasons.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir o motivo."),
  });

  const openReasonModal = (reason?: any) => {
    setEditingReason(reason || null);
    setReasonName(reason?.name || "");
    setReasonDescription(reason?.description || "");
    setReasonGenerates(reason?.generatesCredit ?? true);
    setReasonModalOpen(true);
  };

  const submitReason = () => {
    if (!reasonName.trim()) {
      toast.error("Informe o nome do motivo.");
      return;
    }
    if (editingReason) {
      updateReason.mutate({
        id: editingReason.id,
        name: reasonName.trim(),
        description: reasonDescription.trim(),
        generatesCredit: reasonGenerates,
      });
    } else {
      createReason.mutate({
        name: reasonName.trim(),
        description: reasonDescription.trim() || undefined,
        generatesCredit: reasonGenerates,
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center"><Repeat size={17} className="text-violet-500" /></span>
          Políticas de Reposição
        </h3>
        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-1.5">Regras da escola para créditos de reposição</p>
      </div>

      {/* ── Política ── */}
      <div className="rounded-[1.5rem] border border-border bg-muted/20 p-5 lg:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <Timer size={16} className="text-indigo-500" />
          <h4 className="text-xs font-black uppercase tracking-widest">Prazo para realizar uma aula de reposição</h4>
        </div>
        {isLoadingPolicies ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Carregando política...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade</label>
                <Select value={expirationUnit} onValueChange={setExpirationUnit}>
                  <SelectTrigger className="w-full h-11 rounded-xl text-sm font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dias">Dias</SelectItem>
                    <SelectItem value="semanas">Semanas</SelectItem>
                    <SelectItem value="meses">Meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Unlock size={13} className="text-indigo-500" /> Quando liberar o crédito da reposição?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreditRelease("imediata")}
                  className={cn(
                    "text-left rounded-2xl border-2 p-4 transition-all cursor-pointer space-y-1",
                    creditRelease === "imediata"
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-border bg-background hover:border-indigo-500/40"
                  )}
                >
                  <p className="text-xs font-black uppercase tracking-wider text-foreground">Liberar imediatamente</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">A aula marcada como "Aula a Repor" gera crédito disponível para agendamento na hora.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCreditRelease("fim_contrato")}
                  className={cn(
                    "text-left rounded-2xl border-2 p-4 transition-all cursor-pointer space-y-1",
                    creditRelease === "fim_contrato"
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-border bg-background hover:border-indigo-500/40"
                  )}
                >
                  <p className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5"><Lock size={12} /> Liberar no final do contrato</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">O crédito fica registrado como "Aguardando Liberação" e só é liberado quando o contrato do aluno encerrar.</p>
                </button>
              </div>
            </div>

            <Button
              className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20"
              disabled={savePolicies.isPending}
              onClick={() => savePolicies.mutate({ expirationDays, expirationUnit: expirationUnit as any, creditRelease: creditRelease as any })}
            >
              {savePolicies.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span className="text-xs font-black uppercase tracking-widest">Salvar Política</span>
            </Button>
          </>
        )}
      </div>

      {/* ── Motivos ── */}
      <div className="rounded-[1.5rem] border border-border bg-muted/20 p-5 lg:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2.5">
              <ShieldAlert size={15} className="text-amber-500" /> Motivos de Reposição
            </h4>
            <p className="text-[10px] text-muted-foreground font-bold mt-1">Somente motivos ativos com direito à reposição aparecem no modal da agenda</p>
          </div>
          <Button size="sm" className="gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-9 px-4" onClick={() => openReasonModal()}>
            <Plus size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Novo Motivo</span>
          </Button>
        </div>

        {isLoadingReasons ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Carregando motivos...</div>
        ) : reasons.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">Nenhum motivo cadastrado ainda — os padrões serão criados automaticamente ao abrir a agenda.</p>
        ) : (
          <div className="space-y-2">
            {reasons.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 hover:border-violet-500/40 transition-all duration-300">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-foreground truncate">{r.name}</p>
                    {r.generatesCredit ? (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Gera reposição</span>
                    ) : (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">Sem reposição</span>
                    )}
                    {!r.active && (
                      <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-500">Inativo</span>
                    )}
                  </div>
                  {r.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    title={r.active ? "Desativar" : "Ativar"}
                    onClick={() => toggleReason.mutate({ id: r.id, active: !r.active })}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border",
                      r.active
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                        : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20"
                    )}
                  >
                    <Power size={13} />
                  </button>
                  <button
                    title="Editar"
                    onClick={() => openReasonModal(r)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    title="Excluir"
                    onClick={() => { if (confirm(`Excluir o motivo "${r.name}"?`)) deleteReason.mutate({ id: r.id }); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de motivo */}
      <Dialog open={reasonModalOpen} onOpenChange={setReasonModalOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-wide">
              {editingReason ? "Editar Motivo" : "Novo Motivo de Reposição"}
            </DialogTitle>
            <DialogDescription>Defina se este motivo gera direito à reposição</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome <span className="text-rose-500">*</span></label>
              <input
                value={reasonName}
                onChange={(e) => setReasonName(e.target.value)}
                maxLength={120}
                placeholder="Ex: Professor faltou"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição</label>
              <textarea
                value={reasonDescription}
                onChange={(e) => setReasonDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                placeholder="Detalhe interno (opcional)"
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 cursor-pointer">
              <div>
                <p className="text-xs font-bold text-foreground">Gera direito à reposição?</p>
                <p className="text-[10px] text-muted-foreground">Desative para registrar o motivo sem gerar crédito</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reasonGenerates}
                onClick={() => setReasonGenerates((v) => !v)}
                className={cn(
                  "w-10 h-6 rounded-full relative transition-all shrink-0",
                  reasonGenerates ? "bg-emerald-500" : "bg-zinc-400"
                )}
              >
                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", reasonGenerates ? "left-[1.125rem]" : "left-0.5")} />
              </button>
            </label>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest" onClick={() => setReasonModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-[10px] font-black uppercase tracking-widest"
                disabled={createReason.isPending || updateReason.isPending}
                onClick={submitReason}
              >
                {(createReason.isPending || updateReason.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
