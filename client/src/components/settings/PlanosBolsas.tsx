import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, GraduationCap, CalendarClock, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers de moeda (padrão do sistema: money.ts) ──────────────────────────
import { parseBRL, formatBRL } from "@/lib/money";

// Animação de entrada em cascata (padrão premium do sistema)
const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const staggerItem = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.3 } },
};

interface PlanForm {
  id: number | null;
  nome: string;
  aulasPorSemana: number;
  duracaoMeses: number;
  isBolsa: boolean;
  valorMensal: string;
  valorCheio: string;
  taxaInscricao: string;
  diasLimite: string;
  descricao: string;
  ativo: boolean;
}

const emptyForm: PlanForm = {
  id: null,
  nome: "",
  aulasPorSemana: 1,
  duracaoMeses: 12,
  isBolsa: true,
  valorMensal: "",
  valorCheio: "",
  taxaInscricao: "",
  diasLimite: "10,20",
  descricao: "",
  ativo: true,
};

const DURACOES = [
  { meses: 12, label: "1 ano" },
  { meses: 6, label: "6 meses" },
  { meses: 3, label: "3 meses" },
  { meses: 1, label: "Mensal" },
];

export function PlanosBolsas() {
  const utils = trpc.useUtils();
  const { data: plans = [], isLoading } = trpc.schoolPlans.list.useQuery();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMutation = trpc.schoolPlans.create.useMutation({
    onSuccess: () => {
      toast.success("Plano criado com sucesso!");
      utils.schoolPlans.list.invalidate();
      setModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao criar plano: " + e.message),
  });
  const updateMutation = trpc.schoolPlans.update.useMutation({
    onSuccess: () => {
      toast.success("Plano atualizado!");
      utils.schoolPlans.list.invalidate();
      setModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao atualizar plano: " + e.message),
  });
  const deleteMutation = trpc.schoolPlans.delete.useMutation({
    onSuccess: (data: any) => {
      if (data?.archived) toast.info(data.message ?? "Plano arquivado (em uso por alunos).");
      else toast.success("Plano excluído.");
      utils.schoolPlans.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const openCreate = () => { setForm(emptyForm); setModalOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      nome: p.nome,
      aulasPorSemana: p.aulasPorSemana ?? 1,
      duracaoMeses: p.duracaoMeses ?? 1,
      isBolsa: p.isBolsa ?? true,
      valorMensal: p.valorMensal ? String(Number(p.valorMensal).toFixed(2)) : "",
      valorCheio: p.valorCheio ? String(Number(p.valorCheio).toFixed(2)) : "",
      taxaInscricao: p.taxaInscricao ? String(Number(p.taxaInscricao).toFixed(2)) : "",
      diasLimite: p.diasLimite || "10,20",
      descricao: p.descricao || "",
      ativo: p.ativo ?? true,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (form.nome.trim().length < 2) { toast.error("Informe o nome do plano."); return; }
    const mensal = parseBRL(form.valorMensal);
    if (mensal <= 0) { toast.error("Informe o valor mensal do plano."); return; }
    const payload = {
      nome: form.nome.trim(),
      aulasPorSemana: form.aulasPorSemana,
      duracaoMeses: form.duracaoMeses,
      isBolsa: form.isBolsa,
      valorMensal: mensal,
      valorCheio: form.valorCheio ? parseBRL(form.valorCheio) : null,
      taxaInscricao: form.taxaInscricao ? parseBRL(form.taxaInscricao) : 0,
      diasLimite: form.diasLimite,
      descricao: form.descricao || null,
      ativo: form.ativo,
    };
    if (form.id) updateMutation.mutate({ id: form.id, ...payload });
    else createMutation.mutate(payload);
  };

  const duracaoLabel = (m: number) => DURACOES.find((d) => d.meses === m)?.label ?? `${m} meses`;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Planos &amp; Bolsas</h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-1 max-w-xl">
            Configure os planos da sua escola. Eles aparecem automaticamente no cadastro de alunos, preenchendo mensalidade, duração e taxa de inscrição.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20 shrink-0">
          <Plus size={16} /> <span className="text-xs font-black uppercase tracking-widest">Novo Plano</span>
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
      ) : plans.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 bg-card/40 rounded-[2rem] border-2 border-dashed border-border/50 text-center px-6"
        >
          <GraduationCap size={36} className="text-muted-foreground/30 mb-4" />
          <p className="text-sm font-black text-foreground">Nenhum plano configurado</p>
          <p className="text-xs text-muted-foreground font-medium mt-1.5 max-w-sm">
            Crie bolsas (ex.: "1ª Bolsa — 12x de R$ 180") e o plano de valor cheio. Eles aparecerão no cadastro de alunos.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {plans.map((p: any) => (
            <motion.div
              key={p.id}
              variants={staggerItem}
              className={cn(
                "bg-card/60 backdrop-blur-xl rounded-[1.5rem] border p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5",
                p.ativo ? "border-border/40" : "border-border/20 opacity-60"
              )}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.isBolsa ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">Bolsa</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest border border-slate-500/20">Valor Cheio</span>
                    )}
                    {!p.ativo && <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest border border-rose-500/20">Inativo</span>}
                  </div>
                  <p className="text-sm font-black text-foreground truncate mt-2">{p.nome}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} title="Editar" className="w-9 h-9 rounded-xl bg-muted/50 hover:bg-primary hover:text-white flex items-center justify-center text-muted-foreground transition-all active:scale-95">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteId(p.id)} title="Excluir" className="w-9 h-9 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-white flex items-center justify-center text-rose-500 transition-all active:scale-95">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-2xl font-black tracking-tighter text-foreground leading-none">{formatBRL(Number(p.valorMensal))}<span className="text-xs font-bold text-muted-foreground">/mês</span></p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    {duracaoLabel(p.duracaoMeses)} • {p.aulasPorSemana} aula{p.aulasPorSemana > 1 ? "s" : ""}/semana
                  </p>
                </div>
                {Number(p.taxaInscricao) > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-black text-amber-600">{formatBRL(Number(p.taxaInscricao))}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Taxa inscrição</p>
                  </div>
                )}
              </div>

              {p.isBolsa && p.diasLimite && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
                  <CalendarClock size={11} className="text-indigo-500 shrink-0" />
                  Vencimento até dia {p.diasLimite.split(",").join(" ou ")} — após isso, valor cheio{p.valorCheio ? ` (${formatBRL(Number(p.valorCheio))})` : ""}
                </div>
              )}
              {p.descricao && <p className="text-[11px] text-muted-foreground font-medium line-clamp-2">{p.descricao}</p>}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] bg-card border-none shadow-2xl p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight">{form.id ? "Editar Plano" : "Novo Plano / Bolsa"}</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">
              Defina os valores que aparecerão no cadastro de alunos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome do plano *</Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: 1ª Bolsa — 12x" className="h-11 rounded-xl font-semibold" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duração</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {DURACOES.map((d) => (
                    <button key={d.meses} type="button" onClick={() => setForm(f => ({ ...f, duracaoMeses: d.meses, isBolsa: d.meses > 1 }))}
                      className={cn("py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        form.duracaoMeses === d.meses ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-muted/40 border-border text-muted-foreground hover:border-indigo-400")}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aulas por semana</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" onClick={() => setForm(f => ({ ...f, aulasPorSemana: n }))}
                      className={cn("py-2.5 rounded-xl border text-sm font-black transition-all",
                        form.aulasPorSemana === n ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-muted/40 border-border text-muted-foreground hover:border-indigo-400")}>
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor mensal *</Label>
                <Input value={form.valorMensal} onChange={(e) => setForm(f => ({ ...f, valorMensal: e.target.value }))} placeholder="R$ 180,00" className="h-11 rounded-xl font-bold" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Taxa de inscrição</Label>
                <Input value={form.taxaInscricao} onChange={(e) => setForm(f => ({ ...f, taxaInscricao: e.target.value }))} placeholder="R$ 60,00" className="h-11 rounded-xl font-bold" inputMode="decimal" />
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/30 border border-border/50">
              <div>
                <p className="text-xs font-black text-foreground flex items-center gap-1.5"><BadgeCheck size={13} className="text-indigo-500" /> É uma bolsa (com prazo)?</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Desligue para planos de valor cheio mensal.</p>
              </div>
              <Switch checked={form.isBolsa} onCheckedChange={(v) => setForm(f => ({ ...f, isBolsa: v }))} />
            </div>

            {form.isBolsa && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dias de vencimento</Label>
                    <Input value={form.diasLimite} onChange={(e) => setForm(f => ({ ...f, diasLimite: e.target.value }))} placeholder="10,20" className="h-11 rounded-xl font-bold" inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor cheio (atraso)</Label>
                    <Input value={form.valorCheio} onChange={(e) => setForm(f => ({ ...f, valorCheio: e.target.value }))} placeholder="R$ 300,00" className="h-11 rounded-xl font-bold" inputMode="decimal" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium -mt-2">Após o dia limite sem pagamento, será cobrado o valor cheio (automação do valor cheio entra na próxima fase).</p>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição (opcional)</Label>
              <Input value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: 48 aulas no ano, certificado incluso" className="h-11 rounded-xl font-semibold" />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/30 border border-border/50">
              <p className="text-xs font-black text-foreground">Plano ativo (visível no cadastro)</p>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm(f => ({ ...f, ativo: v }))} />
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="flex-1 h-11 rounded-xl font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
            <Button onClick={handleSave} disabled={isPending} className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px]">
              {isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="w-[92vw] max-w-sm rounded-[2rem] bg-card border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Excluir plano?</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">
              Se ele já estiver em uso por algum aluno, ele será apenas arquivado para preservar o histórico financeiro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)} className="flex-1 h-11 rounded-xl font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
            <Button disabled={deleteMutation.isPending} onClick={() => deleteId != null && deleteMutation.mutate({ id: deleteId })} className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-[10px]">
              {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
