import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  DollarSign, CheckCircle2, Clock, AlertCircle, X,
  Loader2, Calendar, User, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseBRL } from "@/lib/money";
import { toast } from "sonner";
import { format } from "date-fns";

interface EditMensalidadeModalProps {
  open: boolean;
  onClose: () => void;
  payment: {
    id: number;
    studentId: number | null;
    studentName?: string | null;
    amount: string | number;
    dueDate: string | Date;
    paidAt?: Date | string | null;
    status: string;
    notes?: string | null;
  };
}

export function EditMensalidadeModal({ open, onClose, payment }: EditMensalidadeModalProps) {
  const utils = trpc.useUtils();
  
  // Buscar mensalidade base do aluno
  const { data: student } = trpc.students.getDetails.useQuery(
    { id: payment.studentId as number },
    { enabled: !!payment.studentId && open }
  );

  const [form, setForm] = useState({
    amount: String(Number(payment.amount)),
    dueDate: typeof payment.dueDate === 'string' ? payment.dueDate : format(payment.dueDate, "yyyy-MM-dd"),
    paidAt: payment.paidAt ? (typeof payment.paidAt === 'string' ? payment.paidAt.slice(0, 10) : format(payment.paidAt, "yyyy-MM-dd")) : "",
    status: payment.status as "pendente" | "pago" | "atrasado",
    notes: payment.notes || "",
    baseFee: "",
  });

  const [updateFutureDues, setUpdateFutureDues] = useState(false);

  useEffect(() => {
    if (student) {
      setForm(f => ({ ...f, baseFee: String(Number(student.monthlyFee)) }));
    }
  }, [student]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const updatePaymentMutation = trpc.paymentDues.update.useMutation({
    onSuccess: () => {
      utils.paymentDues.invalidate();
      utils.dashboard.invalidate();
      utils.reminders.invalidate();
      if (!updateStudentMutation.isPending) {
        toast.success("Mensalidade atualizada com sucesso!");
        onClose();
      }
    },
    onError: (e) => toast.error("Erro ao atualizar mensalidade: " + e.message),
  });

  const updateStudentMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      utils.students.getDetails.invalidate({ id: payment.studentId as number });
      if (!updatePaymentMutation.isPending) {
        toast.success("Dados atualizados com sucesso!");
        onClose();
      }
    },
    onError: (e) => toast.error("Erro ao atualizar base do aluno: " + e.message),
  });

  const handleSubmit = async () => {
    if (!form.amount || !form.dueDate) {
      toast.error("Preencha o valor e a data de vencimento");
      return;
    }

    // AUDIT FIX: parseBRL evita NaN quando o campo vem com vírgula decimal
    const amountVal = parseBRL(form.amount);
    if (!amountVal || amountVal <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    const paymentPayload = {
      id: payment.id,
      amount: amountVal,
      dueDate: form.dueDate,
      status: form.status,
      paidAt: form.status === "pago" ? (form.paidAt || format(new Date(), "yyyy-MM-dd")) : null,
      notes: form.notes.trim() || null,
      updateFutureDues: updateFutureDues,
    };

    updatePaymentMutation.mutate(paymentPayload);

    // Se o valor base foi alterado, atualizar o aluno
    if (student && parseBRL(form.baseFee) !== parseBRL(student.monthlyFee)) {
      updateStudentMutation.mutate({
        id: student.id,
        monthlyFee: parseBRL(form.baseFee),
      });
    }
  };

  if (!open) return null;

  const isPending = updatePaymentMutation.isPending || updateStudentMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-[2rem] border border-border/40 shadow-2xl w-full max-w-md max-h-[calc(100dvh-8rem)] md:max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Profile Header (Compact) */}
        <div className="px-6 pt-8 pb-6 bg-gradient-to-b from-primary/5 to-transparent flex flex-col items-center text-center relative border-b border-border/20 shrink-0">
          <button onClick={onClose} className="absolute right-6 top-6 w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-all">
            <X size={16} />
          </button>
          
          <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-3 text-white font-black text-xl italic border-4 border-background">
             {payment.studentName?.[0]?.toUpperCase() || <DollarSign />}
          </div>
          
          <h3 className="text-lg font-black uppercase tracking-tighter text-foreground leading-tight">
            Editar Mensalidade
            <span className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mt-1">
              {payment.studentName || "Aluno"}
            </span>
          </h3>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          
          {/* Valor do Registro */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Valor Desta Cobrança (R$)</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <DollarSign size={14} strokeWidth={3} />
              </div>
              <Input 
                value={form.amount} 
                onChange={e => set("amount", e.target.value)}
                type="number" 
                step="0.01"
                className="h-12 pl-14 text-sm font-black rounded-2xl border-border/40 bg-muted/20 focus:ring-emerald-500/20 focus:border-emerald-500/30 transition-all" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Vencimento */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Vencimento</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <Input 
                  type="date"
                  value={form.dueDate}
                  onChange={e => set("dueDate", e.target.value)}
                  className="h-12 pl-11 text-xs font-black rounded-2xl border-border/40 bg-muted/20"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Status</label>
              <select 
                value={form.status} 
                onChange={e => set("status", e.target.value as any)}
                className="w-full h-12 px-4 rounded-2xl border border-border/40 bg-muted/20 text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
              </select>
            </div>
          </div>

          {/* Data de Pagamento (Condicional) */}
          {form.status === "pago" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600/70 ml-1">Data do Pagamento</label>
              <div className="relative">
                <CheckCircle2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40" />
                <Input 
                  type="date"
                  value={form.paidAt}
                  onChange={e => set("paidAt", e.target.value)}
                  className="h-12 pl-11 text-xs font-black rounded-2xl border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-700"
                />
              </div>
            </div>
          )}

          {/* Sincronização com Cadastro (Destaque) */}
          <div className="p-4 rounded-[1.5rem] bg-indigo-500/[0.03] border border-indigo-500/10 space-y-3 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-12 h-12 bg-indigo-500/5 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
            
            <div className="flex items-center gap-2 mb-1">
              <User size={12} className="text-indigo-500" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500/70 italic">Sincronizar com Perfil</span>
            </div>
            
            <div className="space-y-1.5">
               <label className="text-[10px] font-bold text-foreground/60">Mensalidade Base do Aluno (R$)</label>
               <div className="relative">
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-500/40">R$</span>
                 <Input 
                   value={form.baseFee} 
                   onChange={e => set("baseFee", e.target.value)}
                   type="number"
                   step="0.01"
                   placeholder="Ex: 150,00"
                   className="h-10 pl-10 text-xs font-bold rounded-xl border-indigo-500/20 bg-background/50"
                 />
               </div>
               <p className="text-[8px] font-bold text-muted-foreground/40 leading-relaxed uppercase tracking-tighter mt-1">
                 * Alterar este valor afetará o cadastro principal do aluno.
               </p>
            </div>

            {/* Sincronização de Data */}
            <div className="pt-2 border-t border-indigo-500/10 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[9px] font-black text-indigo-500/70 uppercase tracking-wider italic">Próximos Vencimentos</p>
                <p className="text-[8px] text-muted-foreground/60 leading-tight">Aplicar este novo dia para os meses futuros?</p>
              </div>
              <input 
                type="checkbox" 
                checked={updateFutureDues} 
                onChange={e => setUpdateFutureDues(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-indigo-500/20 text-indigo-500 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Ex: Pagamento parcial, desconto aplicado..."
              rows={2}
              className="w-full px-4 py-3 text-xs font-medium rounded-2xl border border-border/40 bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-6 pt-0 mt-auto bg-gradient-to-t from-background to-transparent relative z-10 shrink-0">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest border-border/40 hover:bg-muted/50 transition-all active:scale-95" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              className="flex-1 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95 gap-2" 
              onClick={handleSubmit} 
              disabled={isPending}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} strokeWidth={3} />}
              Salvar Alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

