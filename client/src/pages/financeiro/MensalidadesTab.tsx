import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  DollarSign, CheckCircle2, Plus, X,
  Loader2, Trash2, ChevronLeft, ChevronRight, Pencil,
  Search, MoreVertical, CreditCard,
  ChevronDown, TrendingUp, Zap, Link2, Copy, QrCode, Ban,
  FileUp, FileCheck, FileText, Info, Wallet, Download, Send, Receipt
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { exportToCSV } from "@/lib/exportUtils";
import { parseBRL } from "@/lib/money";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditMensalidadeModal } from "@/components/modals/EditMensalidadeModal";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatFriendlyError } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type PaymentRow = {
  id: number; studentId: number | null; amount: string | number;
  dueDate: string | Date; paidAt?: Date | string | null;
  status: string; month: number; year: number;
  notes?: string | null; studentName?: string | null; studentPhone?: string | null;
  email?: string | null;
  asaasId?: string | null;
  asaasPaymentLink?: string | null;
  asaasBillingType?: string | null;
  mpPaymentId?: string | null;
  mpPaymentLink?: string | null;
  infinitepayPaymentLink?: string | null;
  receiptUrl?: string | null;
  studentStatus?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pago:     { label: "Paga",     cls: "bg-emerald-500/10 text-emerald-600" },
    pendente: { label: "A vencer", cls: "bg-amber-500/10 text-amber-600" },
    atrasado: { label: "Vencida", cls: "bg-rose-500/10 text-rose-600" },
    agendada: { label: "Agendada", cls: "bg-blue-500/10 text-blue-600" },
  };
  const c = map[status] ?? map.pendente;
  return (
    <span className={cn("inline-flex items-center justify-center text-[10px] font-bold px-3 py-1.5 rounded-lg", c.cls)}>
      {c.label}
    </span>
  );
}

// ─── Modal: Gerar Cobrança (Asaas / Mercado Pago / InfinitePay) ───────────────
function GatewayChargeModal({ open, onClose, payment, gateway }: {
  open: boolean;
  onClose: () => void;
  payment: PaymentRow | null;
  gateway: "asaas" | "mercadopago" | "infinitepay";
}) {
  const utils = trpc.useUtils();
  const { maskBRL } = useDashboardPrefs();
  const [billingType, setBillingType] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [result, setResult] = useState<{
    paymentLink: string;
    pixQrCode?: string | null;
    billingType: string;
  } | null>(null);

  const generateAsaasMutation = trpc.paymentDues.generateAsaasCharge.useMutation({
    onSuccess: (data) => {
      setResult(data);
      utils.paymentDues.invalidate();
      toast.success("Cobrança gerada no Asaas!");
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro ao gerar cobrança no Asaas")),
  });

  const generateMPMutation = trpc.paymentDues.generateMPCharge.useMutation({
    onSuccess: (data) => {
      setResult({ paymentLink: data.paymentLink, billingType: "MP" });
      utils.paymentDues.invalidate();
      toast.success("Link gerado no Mercado Pago!");
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro ao gerar link no Mercado Pago")),
  });

  const generateInfinitePayMutation = trpc.paymentDues.generateInfinitePayCharge.useMutation({
    onSuccess: (data) => {
      setResult({ paymentLink: data.paymentLink, billingType: "IP" });
      utils.paymentDues.invalidate();
      toast.success("Link gerado no InfinitePay!");
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro ao gerar link no InfinitePay")),
  });

  const handleGenerate = () => {
    if (!payment) return;
    if (gateway === "mercadopago") {
      generateMPMutation.mutate({ paymentDueId: payment.id });
    } else if (gateway === "infinitepay") {
      generateInfinitePayMutation.mutate({ paymentDueId: payment.id });
    } else {
      generateAsaasMutation.mutate({ paymentDueId: payment.id, billingType });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  if (!open || !payment) return null;

  const isPending = generateAsaasMutation.isPending || generateMPMutation.isPending || generateInfinitePayMutation.isPending;

  const gatewayLabel = gateway === "mercadopago" ? "Mercado Pago" : gateway === "infinitepay" ? "InfinitePay" : "Asaas";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={handleClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
              {gateway === "mercadopago" ? <Wallet size={20} className="text-blue-500" /> : <Zap size={20} />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Gerar Cobrança {gatewayLabel}</h3>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{payment.studentName}</p>
            </div>
          </div>
          <button onClick={handleClose} className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Valor */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 border border-border">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Valor da cobrança</span>
            <span className="text-lg font-black text-foreground">{maskBRL(Number(payment.amount))}</span>
          </div>

          {!result ? (
            <>
              {/* Seleção de Método - Only for Asaas; MP e InfinitePay decidem no checkout hospedado */}
              {gateway === "asaas" && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Método de pagamento</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: "PIX", label: "PIX", icon: QrCode, color: "emerald" },
                      { key: "CREDIT_CARD", label: "Cartão de Crédito", icon: CreditCard, color: "blue" },
                    ] as const).map(({ key, label, icon: Icon, color }) => (
                      <button
                        key={key}
                        onClick={() => setBillingType(key)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                          billingType === key
                            ? color === "emerald"
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                              : "border-blue-500 bg-blue-500/10 text-blue-600"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40"
                        )}
                      >
                        <Icon size={22} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {gateway === "mercadopago" && (
                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">O link gerado permitirá que o aluno pague via Pix ou Cartão de Crédito no ambiente seguro do Mercado Pago.</p>
                </div>
              )}

              {gateway === "infinitepay" && (
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">O link gerado permitirá que o aluno pague via Pix (taxa zero) ou Cartão de Crédito em até 12x no checkout seguro da InfinitePay.</p>
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={isPending}
                className={cn("w-full h-12 rounded-xl text-white font-bold text-xs gap-2 shadow-lg",
                  gateway === "mercadopago" ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  : gateway === "infinitepay" ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                  : "bg-violet-600 hover:bg-violet-700 shadow-violet-500/20")}
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : (gateway === "mercadopago" ? <Wallet size={16} /> : <Zap size={16} />)}
                Gerar Link
              </Button>
            </>
          ) : (
            /* Resultado */
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-700">Link gerado com sucesso!</span>
                </div>

                {/* QR Code PIX (somente Asaas) */}
                {result.billingType === "PIX" && result.pixQrCode && (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-muted/50 border border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">QR Code PIX</p>
                    <img
                      src={`data:image/png;base64,${result.pixQrCode}`}
                      alt="QR Code PIX"
                      className="w-40 h-40 rounded-xl border border-border"
                    />
                  </div>
                )}

                {/* Link de Pagamento */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                    Link Seguro
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                    <Link2 size={14} className="text-violet-500 shrink-0" />
                    <p className="text-[10px] text-muted-foreground font-medium truncate flex-1">{result.paymentLink}</p>
                    <button
                      onClick={() => copyToClipboard(result.paymentLink)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                <Button variant="outline" onClick={handleClose} className="w-full h-10 rounded-xl text-xs font-bold">
                  Fechar
                </Button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal: Observação / Justificativa ────────────────────────────────────────
function ObservacaoModal({ open, onClose, payment }: {
  open: boolean;
  onClose: () => void;
  payment: PaymentRow | null;
}) {
  const utils = trpc.useUtils();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (payment) {
      setNotes(payment.notes || "");
    }
  }, [payment]);

  const updateMutation = trpc.paymentDues.update.useMutation({
    onSuccess: () => {
      utils.paymentDues.invalidate();
      toast.success("Observação salva com sucesso!");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao salvar observação: " + e.message),
  });

  const handleSave = () => {
    if (!payment) return;
    updateMutation.mutate({
      id: payment.id,
      notes: notes.trim() || null,
    });
  };

  if (!open || !payment) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-b from-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-sm">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-tight">Observação / Justificativa</h3>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{payment.studentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Caixa de Alerta Explicativa SaaS Premium */}
          <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/20 space-y-2">
            <div className="flex items-center gap-2 text-amber-600">
              <Info size={16} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Regra de Automação do Robô</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              O robô continuará enviando os lembretes de <strong className="text-foreground">3 dias antes</strong> e do <strong className="text-foreground">dia do vencimento</strong> normalmente. No entanto, se este campo estiver preenchido com qualquer justificativa de atraso ou acordo, o aviso de <strong className="text-rose-500">inadimplência</strong> será suspenso automaticamente.
            </p>
          </div>

          {/* Campo de Texto */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
              Observação da Mensalidade
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Digite o motivo do atraso, acordo realizado ou observação interna..."
              rows={4}
              className="w-full p-4 text-xs font-medium rounded-2xl border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none text-foreground placeholder:text-muted-foreground/50 transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 h-11 rounded-xl text-xs font-bold border-border hover:bg-muted/50">
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs gap-2 shadow-lg shadow-amber-500/20"
            >
              {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Salvar Observação
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NovaModal({ open, onClose, students, dueDays }: {
  open: boolean; onClose: () => void;
  students: any[];
  /** Dias de vencimento configurados no perfil da escola (ex: [5,10,15,20]). */
  dueDays?: number[];
}) {
  const utils = trpc.useUtils();
  const now = new Date();
  const [form, setForm] = useState({
    studentId: "",
    amount: "",
    dueDay: "10",
    dueDayCustom: "",
    startMonth: String(now.getMonth() + 1),
    startYear: String(now.getFullYear()),
    notes: "",
  });
  const [monthsCount, setMonthsCount] = useState(1);
  const [generationMode, setGenerationMode] = useState<"individual" | "bulk">("individual");
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentChange = (id: string) => {
    const s = students.find(s => String(s.id) === id);
    set("studentId", id);
    if (s?.monthlyFee) set("amount", String(s.monthlyFee));
    if (s?.dueDay) set("dueDay", String(s.dueDay));
    set("dueDayCustom", "");
    if (s?.startDate) {
      const d = new Date(s.startDate);
      // Ensure we use the date components correctly
      set("startMonth", String(d.getUTCMonth() + 1));
      set("startYear", String(d.getUTCFullYear()));
    }
  };

  const generateMutation = trpc.paymentDues.generateMonthly.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} mensalidade(s) gerada(s)!`);
      utils.paymentDues.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const generateBulkMutation = trpc.paymentDues.generateBulkAll.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} mensalidade(s) gerada(s)!`);
      utils.paymentDues.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSubmit = () => {
    if (generationMode === "individual") {
      const finalDueDay = form.dueDay === "outro" ? form.dueDayCustom : form.dueDay;
      if (!form.studentId || !form.amount || !finalDueDay) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
      }
      const dayNum = Number(finalDueDay);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
        toast.error("Dia de vencimento inválido (1 a 31)");
        return;
      }
      // AUDIT FIX: parseBRL evita NaN quando o campo vem com vírgula decimal
      const amountVal = parseBRL(form.amount);
      if (!amountVal || amountVal <= 0) {
        toast.error("Informe um valor de mensalidade válido");
        return;
      }
      generateMutation.mutate({
        studentId: Number(form.studentId),
        amount: amountVal,
        dueDay: dayNum,
        startMonth: Number(form.startMonth),
        startYear: Number(form.startYear),
        monthsCount,
        notes: form.notes.trim() || undefined,
      });
    } else {
      generateBulkMutation.mutate({
        startMonth: Number(form.startMonth),
        startYear: Number(form.startYear),
        monthsCount,
      });
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-[2rem] border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                 <DollarSign size={20} />
              </div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">Nova Mensalidade</h3>
           </div>
           <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
             <X size={20} />
           </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto scrollbar-none">
          <div className="flex bg-muted p-1 rounded-xl">
             <button
                onClick={() => setGenerationMode("individual")}
                className={cn("flex-1 h-9 rounded-lg text-[10px] font-bold uppercase transition-all", generationMode === "individual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
             >
                Individual
             </button>
             <button
                onClick={() => setGenerationMode("bulk")}
                className={cn("flex-1 h-9 rounded-lg text-[10px] font-bold uppercase transition-all", generationMode === "bulk" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
             >
                Para Todos
             </button>
          </div>

          {generationMode === "individual" && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Selecione o Aluno</label>
                <select value={form.studentId} onChange={e => handleStudentChange(e.target.value)}
                  className="w-full h-12 text-sm font-semibold rounded-xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/10 text-foreground transition-all cursor-pointer">
                  <option value="">Selecionar aluno...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Valor (R$)</label>
                   <Input value={form.amount} onChange={e => set("amount", e.target.value)}
                     type="number" className="h-12 text-sm font-bold rounded-xl border-border bg-muted/50" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Dia Vencimento</label>
                   {form.dueDay === "outro" ? (
                     <Input
                       type="number"
                       min={1}
                       max={31}
                       value={form.dueDayCustom}
                       onChange={e => set("dueDayCustom", e.target.value)}
                       placeholder="Digite o dia (1-31)"
                       className="h-12 text-sm font-bold rounded-xl border-border bg-muted/50"
                     />
                   ) : (
                     <select value={form.dueDay} onChange={e => set("dueDay", e.target.value)}
                       className="w-full h-12 text-sm font-semibold rounded-xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/10 text-foreground cursor-pointer">
                       {(dueDays && dueDays.length > 0 ? dueDays : [5,10,15,20,25]).map(d => <option key={d} value={String(d)}>{d}</option>)}
                       <option value="outro">Outro...</option>
                     </select>
                   )}
                 </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Mês inicial</label>
              <select value={form.startMonth} onChange={e => set("startMonth", e.target.value)}
                className="w-full h-12 text-sm font-semibold rounded-xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/10">
                {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Ano</label>
              <select value={form.startYear} onChange={e => set("startYear", e.target.value)}
                className="w-full h-12 text-sm font-semibold rounded-xl border border-border bg-muted/50 px-4">
                {[now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-blue-500/10/50 border border-blue-500/20 space-y-4">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest text-center">Geração em Lote</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[1, 2, 3, 6, 12].map(n => (
                <button key={n} onClick={() => setMonthsCount(n)}
                  className={cn(
                    "h-10 rounded-xl text-[10px] font-bold uppercase transition-all shadow-sm",
                    monthsCount === n
                      ? "bg-blue-600 text-white shadow-blue-500/10 scale-105"
                      : "bg-card text-blue-400 border border-blue-500/20 hover:bg-blue-500/10"
                  )}>
                  {n} {n === 1 ? "mês" : "meses"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-muted/30 flex gap-4">
          <Button variant="ghost" className="flex-1 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-blue-500/10 gap-3 bg-blue-600 hover:bg-blue-700"
            onClick={handleSubmit} disabled={generateMutation.isPending || generateBulkMutation.isPending}>
            {(generateMutation.isPending || generateBulkMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {generationMode === "individual" ? "Gerar" : "Gerar para Todos"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default function MensalidadesTab({ viewMonth, viewYear, payments, isLoading }: { viewMonth: number, viewYear: number, payments: any[], isLoading: boolean }) {
  const { user } = useAuth();
  const { maskBRL } = useDashboardPrefs();
  const { data: settings } = trpc.settings.get.useQuery();
  const paymentGateway = (settings?.paymentGateway as "asaas" | "mercadopago" | "infinitepay") || "asaas";
  const isGatewayEnabled = paymentGateway === "mercadopago"
    ? !!settings?.mpAccessToken
    : paymentGateway === "infinitepay"
      ? (settings?.infinitepayEnabled === 1 && !!settings?.infinitepayHandle)
      : settings?.asaasEnabled === 1;
  const isWhatsAppEnabled = settings?.whatsappBotUrl && settings?.whatsappBotToken;

  // Dias de vencimento configurados no perfil da escola (usados no cadastro de nova mensalidade)
  const dueDaysFromSettings = useMemo(() => {
    const raw = (settings?.dueDaysForecast ?? "5,10,15,20") as string;
    return raw.split(",").map(d => Number(d.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 31);
  }, [settings?.dueDaysForecast]);
  const utils = trpc.useUtils();
  const now = new Date();
  const [filterStatus, setFilterStatus] = useState<string>("todas");
  const [lessonTypeFilter, setLessonTypeFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [novaOpen, setNovaOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<PaymentRow | null>(null);
  const [notesPayment, setNotesPayment] = useState<PaymentRow | null>(null);
  const [detailsPaymentId, setDetailsPaymentId] = useState<number | null>(null);
  const [asaasPayment, setAsaasPayment] = useState<PaymentRow | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPaymentIds, setSelectedPaymentIds] = useState<number[]>([]);

  const handleExportCSV = (itemsToExport: PaymentRow[]) => {
    const headers = ["ID", "Aluno", "Telefone", "E-mail", "Valor (R$)", "Vencimento", "Data Pagamento", "Status", "Notas"];
    const rows = itemsToExport.map(p => [
      p.id,
      p.studentName || "Sem Aluno",
      p.studentPhone || "",
      p.email || "",
      p.amount,
      p.dueDate ? format(new Date(p.dueDate), "dd/MM/yyyy") : "",
      p.paidAt ? format(new Date(p.paidAt), "dd/MM/yyyy") : "",
      p.status,
      p.notes || ""
    ]);
    exportToCSV(`mensalidades_${viewMonth}_${viewYear}`, headers, rows);
    toast.success(`${itemsToExport.length} mensalidades exportadas!`);
  };

  const handleSelectAll = (checked: boolean, allList: PaymentRow[]) => {
    if (checked) {
      setSelectedPaymentIds(allList.map((p) => p.id));
    } else {
      setSelectedPaymentIds([]);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedPaymentIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const { data: students = [] } = trpc.students.list.useQuery();

  const updateMutation = trpc.paymentDues.update.useMutation({
    onSuccess: () => { 
      toast.success("Status atualizado!"); 
      utils.paymentDues.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.paymentDues.delete.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade removida!");
      utils.paymentDues.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: (e: any) => toast.error("Erro ao excluir: " + e.message),
  });

  const cancelAsaasMutation = trpc.paymentDues.cancelAsaasCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança Asaas cancelada!");
      utils.paymentDues.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const cancelInfinitePayMutation = trpc.paymentDues.cancelInfinitePayCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança InfinitePay cancelada!");
      utils.paymentDues.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const emitNfseMutation = trpc.fiscal.invoices.emitForPayment.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) {
        toast.info("Esta mensalidade já possui uma NFS-e gerada.");
      } else {
        toast.success("NFS-e enviada para processamento com sucesso!");
      }
      utils.fiscal.invoices.invalidate();
    },
    onError: (e: any) => toast.error("Erro ao emitir NFS-e: " + e.message),
  });

  const uploadReceiptMutation = trpc.paymentDues.uploadReceipt.useMutation({
    onSuccess: () => {
      toast.success("Comprovante anexado com sucesso!");
      utils.paymentDues.invalidate();
      setUploadingFor(null);
    },
    onError: (e: any) => {
      toast.error("Erro ao enviar comprovante: " + e.message);
      setUploadingFor(null);
    }
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFor) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      uploadReceiptMutation.mutate({
        paymentDueId: uploadingFor,
        fileData: base64,
        fileName: file.name,
        fileType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };



  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const nameMatch = p.studentName?.toLowerCase().includes(search.toLowerCase());
      const statusMatch = filterStatus === "todas" || p.status === filterStatus;
      const lessonTypeMatch = lessonTypeFilter === "todos" || p.lessonType === lessonTypeFilter;
      return nameMatch && statusMatch && lessonTypeMatch;
    });
  }, [payments, search, filterStatus, lessonTypeFilter]);

  // BUG#5 FIX: paginação real (antes os botões eram decorativos sem onClick)
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  // Resetar para página 1 quando filtros mudam
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, lessonTypeFilter]);

  const stats = useMemo(() => {
    const sum = (arr: any[]) => arr.reduce((acc, p) => acc + Number(p.amount), 0);
    const recebido = sum(payments.filter(p => p.status === "pago"));
    const pendente = sum(payments.filter(p => p.status === "pendente"));
    const atrasado = sum(payments.filter(p => p.status === "atrasado"));
    const total = recebido + pendente + atrasado;
    return { recebido, pendente, atrasado, total };
  }, [payments]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,application/pdf"
        onChange={handleFileChange}
      />
        {/* Header Section */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 lg:w-12 lg:h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center shadow-sm shrink-0">
              <CreditCard size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg lg:text-2xl font-bold text-foreground tracking-tight leading-none">Mensalidades</h2>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 hidden sm:block">Controle financeiro da escola</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
             <div className="relative hidden md:flex items-center w-48 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input 
                  placeholder="Buscar..." 
                  className="pl-9 h-10 border-border bg-card rounded-xl shadow-sm text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
             </div>
             <Button
               variant="outline"
               onClick={() => handleExportCSV(payments)}
               className="h-10 rounded-xl px-3 lg:px-4 text-xs font-bold gap-2 border-border/80 shadow-sm shrink-0"
               title="Exportar mensalidades atuais para Excel/CSV"
             >
               <Download size={16} />
               <span className="hidden md:inline">Exportar CSV</span>
             </Button>

             <Button 
               id="tour-new-charge"
               onClick={() => setNovaOpen(true)}
               className="h-10 w-10 md:w-auto md:px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 shrink-0"
             >
                <Plus size={18} />
                <span className="hidden md:inline">Nova</span>
             </Button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input 
            placeholder="Buscar aluno..."
            className="pl-9 h-11 border-border bg-card rounded-2xl shadow-sm text-xs w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>



        {/* METRICS CARDS - 2x2 grid on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
           {[
             { label: "Recebido", amount: stats.recebido, color: "text-emerald-600", bg: "from-emerald-500/10 to-background", border: "border-emerald-100/50" },
             { label: "Pendente", amount: stats.pendente, color: "text-amber-600", bg: "from-amber-500/10 to-background", border: "border-amber-100/50" },
             { label: "Atrasado", amount: stats.atrasado, color: "text-rose-600", bg: "from-rose-500/10 to-background", border: "border-rose-100/50" },
             { label: "Previsto", amount: stats.total, color: "text-blue-600", bg: "from-blue-500/10 to-background", border: "border-blue-500/20" },
           ].map((item, i) => (
             <div key={i} className={cn("relative p-3.5 lg:p-6 lg:h-32 rounded-2xl bg-gradient-to-br border shadow-sm overflow-hidden", item.bg, item.border)}>
               <div className="relative z-10">
                 <p className={cn("text-[9px] lg:text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1 lg:mb-2", item.color)}>{item.label}</p>
                 <p className="text-sm lg:text-2xl font-black text-foreground leading-none">
                    {maskBRL(item.amount)}
                 </p>
               </div>
             </div>
           ))}
        </div>

        {/* FLOW BY DUE DATE (Day 5, 10, 15, 20) */}
        <div className="bg-card rounded-2xl lg:rounded-[2rem] border border-border p-4 lg:p-8 shadow-sm space-y-4">
           <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                 <TrendingUp size={18} />
              </div>
              <div>
                 <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Previsão por Vencimento</h3>
                 <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Quanto você irá receber em cada dia do mês</p>
              </div>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {useMemo(() => {
                const dueDaysString = settings?.dueDaysForecast ?? "5,10,15,20";
                const days = dueDaysString.split(",").map(d => Number(d.trim())).filter(n => !isNaN(n) && n > 0 && n <= 31);
                
                const dayMap: Record<string, number> = { "OUTROS": 0 };
                days.forEach(d => {
                  dayMap[String(d).padStart(2, '0')] = 0;
                });
                
                const validPayments = payments.filter(p => 
                  p.status === "pago" || p.studentStatus === "ativo"
                );
                
                validPayments.forEach(p => {
                  const day = Number(p.dueDate.toString().split('-')[2]);
                  if (days.includes(day)) {
                    dayMap[String(day).padStart(2, '0')] += Number(p.amount);
                  } else {
                    dayMap["OUTROS"] += Number(p.amount);
                  }
                });
                
                const result = days.map(d => {
                  const strDay = String(d).padStart(2, '0');
                  return { label: `Dia ${strDay}`, amount: dayMap[strDay] };
                });
                
                result.push({ label: "Outros", amount: dayMap["OUTROS"] });
                return result;
              }, [payments, settings?.dueDaysForecast]).map((item, i) => (
                <div key={i} className="p-3.5 lg:p-4 rounded-2xl bg-muted/50 border border-border group hover:border-blue-200 transition-all">
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 group-hover:text-blue-500 transition-colors">{item.label}</p>
                   <p className="text-sm font-black text-foreground tracking-tighter">
                      {maskBRL(item.amount)}
                   </p>
                </div>
              ))}
           </div>
        </div>

        {/* FILTERS SECTION */}
        <div className="space-y-3 bg-card p-3 lg:p-4 rounded-2xl border border-border shadow-sm">
           {/* Status filter - horizontal scroll on mobile */}
           <div className="flex items-center gap-2">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest shrink-0 hidden sm:block">Status</p>
              <div className="flex overflow-x-auto gap-1.5 no-scrollbar">
                 {["todas", "pendente", "pago", "atrasado"].map(st => (
                   <button key={st} onClick={() => setFilterStatus(st)} className={cn("px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0", filterStatus === st ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground bg-muted/50")}
                   >
                      {st}
                   </button>
                 ))}
              </div>
           </div>
           
           {/* Modalidade filter */}
           <div className="flex items-center gap-2">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest shrink-0 hidden sm:block">Tipo</p>
              <div className="flex overflow-x-auto gap-1.5 no-scrollbar">
                 {[
                   { id: "todos", label: "Todas" },
                   { id: "individual", label: "Individual" },
                   { id: "turma", label: "Turma" }
                 ].map(t => (
                   <button key={t.id} onClick={() => setLessonTypeFilter(t.id)} className={cn("px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0", lessonTypeFilter === t.id ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground bg-muted/50")}
                   >
                      {t.label}
                   </button>
                 ))}
              </div>
           </div>
        </div>

        {/* MAIN CONTENT SECTION */}
        <div className="bg-card md:rounded-[2rem] border-0 md:border border-border md:shadow-sm overflow-hidden flex flex-col -mx-4 md:mx-0">
           {/* Desktop Table View */}
           <div className="hidden md:block overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-[5%] px-4 py-5 text-center">
                      <Checkbox
                        checked={paginated.length > 0 && selectedPaymentIds.length === paginated.length}
                        onCheckedChange={(c) => handleSelectAll(!!c, paginated)}
                      />
                    </th>
                    <th className="px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Aluno</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Valor</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Vencimento</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr><td colSpan={6} className="py-20 text-center"><Loader2 size={32} className="animate-spin text-primary/20 mx-auto" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-xs text-muted-foreground font-medium italic">Nenhuma mensalidade encontrada.</td></tr>
                  ) : (
                    paginated.map((payment) => (
                      <tr key={payment.id} className={cn("group hover:bg-muted/50 transition-colors cursor-pointer", selectedPaymentIds.includes(payment.id) && "bg-primary/10")} onClick={() => setDetailsPaymentId(payment.id)}>
                        <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedPaymentIds.includes(payment.id)}
                            onCheckedChange={() => handleToggleSelect(payment.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-9 h-9 border-2 border-background shadow-sm shrink-0">
                              <AvatarFallback className="bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase">
                                {payment.studentName?.substring(0, 2) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-foreground truncate">{payment.studentName}</p>
                                {payment.notes && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20" title={payment.notes}>
                                    <FileText size={10} /> Obs
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">{payment.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex flex-col">
                            <p className="text-sm font-black text-foreground">
                               {maskBRL(Number(payment.amount))}
                            </p>
                            {(payment as any).calculation && ((payment as any).calculation.lateFeeAmount > 0 || (payment as any).calculation.interestAmount > 0 || (payment as any).calculation.earlyDiscountAmount > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium mt-0.5">
                                <span className="text-muted-foreground line-through">
                                  Orig: {maskBRL((payment as any).calculation.originalAmount)}
                                </span>
                                {(payment as any).calculation.lateFeeAmount > 0 && (
                                  <span className="text-emerald-500 font-bold">
                                    +Multa: {maskBRL((payment as any).calculation.lateFeeAmount)}
                                  </span>
                                )}
                                {(payment as any).calculation.interestAmount > 0 && (
                                  <span className="text-indigo-500 font-bold">
                                    +Juros: {maskBRL((payment as any).calculation.interestAmount)}
                                  </span>
                                )}
                                {(payment as any).calculation.earlyDiscountAmount > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    -Desconto: {maskBRL((payment as any).calculation.earlyDiscountAmount)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-4 text-center">
                          <div className="flex flex-col items-center">
                             <p className="text-xs font-bold text-muted-foreground">{format(new Date(payment.dueDate + "T12:00:00"), "dd/MM")}</p>
                             <p className="text-[9px] text-muted-foreground font-medium uppercase mt-1">Dia {payment.dueDate.toString().split('-')[2]}</p>
                          </div>
                        </td>
                         <td className="px-8 py-4">
                            <div className="flex items-center justify-center gap-2">
                               <StatusBadge status={payment.status} />
                               {payment.asaasId && (
                                 <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg bg-violet-500/10 text-violet-600">
                                   <Zap size={9} /> Asaas
                                 </span>
                               )}
                               {!payment.asaasId && payment.infinitepayPaymentLink && (
                                 <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600">
                                   <Zap size={9} /> InfinitePay
                                 </span>
                               )}
                            </div>
                         </td>
                        <td className="px-8 py-4 text-right" onClick={e => e.stopPropagation()}>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-muted-foreground">
                                    <MoreVertical size={16} />
                                 </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 border-border">
                                 {payment.receiptUrl ? (
                                   <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => window.open(payment.receiptUrl!, "_blank")}>
                                      <FileCheck className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-bold text-muted-foreground">Ver Comprovante</span>
                                   </DropdownMenuItem>
                                 ) : (
                                   <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => {
                                     setUploadingFor(payment.id);
                                     setTimeout(() => fileInputRef.current?.click(), 100);
                                   }}>
                                      <FileUp className="w-4 h-4 text-amber-500" />
                                      <span className="text-xs font-bold text-muted-foreground">Anexar Comprovante</span>
                                   </DropdownMenuItem>
                                 )}
                                 <DropdownMenuSeparator className="bg-muted" />
                                  {payment.status !== "pago" && (
                                    <DropdownMenuItem
                                      className="gap-2 rounded-lg"
                                      disabled={updateMutation.isPending || updateMutation.variables?.id === payment.id}
                                      onClick={() => updateMutation.mutate({ id: payment.id, status: "pago" })}
                                    >
                                       <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                       <span className="text-xs font-bold text-muted-foreground">Marcar como Pago</span>
                                    </DropdownMenuItem>
                                  )}
                                 <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => setNotesPayment(payment)}>
                                    <FileText className="w-4 h-4 text-amber-500" />
                                    <span className="text-xs font-bold text-muted-foreground">Observação / Justificativa</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => setEditPayment(payment)}>
                                    <Pencil className="w-4 h-4 text-blue-500" />
                                    <span className="text-xs font-bold text-muted-foreground">Editar Registro</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => emitNfseMutation.mutate({ paymentId: payment.id })}>
                                    <Receipt className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-bold text-muted-foreground">Emitir NFS-e</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator className="bg-muted" />
                                  {!payment.asaasId && !payment.mpPaymentId && !payment.infinitepayPaymentLink ? (
                                     isGatewayEnabled && (
                                      <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => setAsaasPayment(payment)}>
                                        <Zap className="w-4 h-4 text-violet-500" />
                                        <span className="text-xs font-bold text-muted-foreground">Gerar Cobrança</span>
                                      </DropdownMenuItem>
                                    )
                                  ) : payment.infinitepayPaymentLink ? (
                                    <>
                                      <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => {
                                        navigator.clipboard.writeText(payment.infinitepayPaymentLink!).then(() => toast.success("Link copiado!"));
                                      }}>
                                        <Copy className="w-4 h-4 text-indigo-500" />
                                        <span className="text-xs font-bold text-muted-foreground">Copiar Link InfinitePay</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="gap-2 rounded-lg text-rose-500" onClick={() => {
                                        if (confirm("Cancelar a cobrança no InfinitePay?")) cancelInfinitePayMutation.mutate({ paymentDueId: payment.id });
                                      }}>
                                        <Ban className="w-4 h-4" />
                                        <span className="text-xs font-bold">Cancelar no InfinitePay</span>
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem className="gap-2 rounded-lg" onClick={() => {
                                        if (payment.asaasPaymentLink) navigator.clipboard.writeText(payment.asaasPaymentLink).then(() => toast.success("Link copiado!"));
                                      }}>
                                        <Copy className="w-4 h-4 text-violet-500" />
                                        <span className="text-xs font-bold text-muted-foreground">Copiar Link Asaas</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="gap-2 rounded-lg text-rose-500" onClick={() => {
                                        if (confirm("Cancelar a cobrança no Asaas?")) cancelAsaasMutation.mutate({ paymentDueId: payment.id });
                                      }}>
                                        <Ban className="w-4 h-4" />
                                        <span className="text-xs font-bold">Cancelar no Asaas</span>
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                 <DropdownMenuSeparator className="bg-muted" />
                                 <DropdownMenuItem className="gap-2 rounded-lg text-rose-500" onClick={() => {
                                   if(confirm("Deseja excluir esta mensalidade?")) {
                                     deleteMutation.mutate({ id: payment.id });
                                   }
                                 }}>
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-xs font-bold">Excluir</span>
                                 </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
           </div>

           {/* Mobile Card View */}
           <div className="md:hidden grid grid-cols-1 gap-4 p-4">
              {isLoading ? (
                <div className="py-10 text-center"><Loader2 size={32} className="animate-spin text-primary/20 mx-auto" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground font-medium italic">Nenhuma mensalidade encontrada.</div>
              ) : (
                paginated.map((payment) => (
                  <div 
                    key={payment.id} 
                    className="bg-card rounded-2xl p-4 border border-border shadow-sm active:scale-[0.98] transition-all min-w-0"
                    onClick={() => setDetailsPaymentId(payment.id)}
                  >
                    <div className="card-head mb-4">
                      <div className="card-head-main">
                        <Avatar className="w-9 h-9 border-2 border-background shadow-sm shrink-0">
                          <AvatarFallback className="bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase">
                            {payment.studentName?.substring(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{payment.studentName}</p>
                            {payment.notes && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0" title={payment.notes}>
                                <FileText size={10} /> Obs
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate">{MONTHS_PT[payment.month-1]} {payment.year}</p>
                        </div>
                      </div>
                      <div className="card-head-fixed flex items-center gap-2">
                        <StatusBadge status={payment.status} />
                        {payment.asaasId && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg bg-violet-500/10 text-violet-600">
                            <Zap size={9} /> Asaas
                          </span>
                        )}
                        {!payment.asaasId && payment.infinitepayPaymentLink && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600">
                            <Zap size={9} /> InfinitePay
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 py-3 border-y border-border">
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Valor</p>
                        <p className="text-xs font-black text-foreground">
                          {maskBRL(Number(payment.amount))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Vencimento</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-foreground">{format(new Date(payment.dueDate + "T12:00:00"), "dd/MM/yyyy")}</p>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-blue-500 hover:bg-blue-500/10 -mr-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditPayment(payment);
                            }}
                          >
                            <Pencil size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-4">
                       {payment.receiptUrl ? (
                         <Button variant="ghost" size="sm" className="h-9 px-2 rounded-lg text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10 shrink-0" asChild>
                           <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer" download onClick={(e) => e.stopPropagation()}>
                             <FileCheck size={12} className="mr-1" /> Ver
                           </a>
                         </Button>
                       ) : (
                         <Button variant="ghost" size="sm" className="h-9 px-2 rounded-lg text-[10px] font-bold text-amber-600 hover:bg-amber-500/10 shrink-0"
                           onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUploadingFor(payment.id); setTimeout(() => fileInputRef.current?.click(), 100); }}>
                           <FileUp size={12} className="mr-1" /> Anexar
                         </Button>
                       )}

                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-lg text-rose-500 hover:bg-rose-500/10 shrink-0"
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          if(confirm("Deseja excluir esta mensalidade?")) deleteMutation.mutate({ id: payment.id });
                        }}>
                        <Trash2 size={14} />
                      </Button>

                      <Button variant="ghost" size="sm" className="h-9 px-2 rounded-lg text-[10px] font-bold text-amber-600 hover:bg-amber-500/10 shrink-0"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNotesPayment(payment); }}>
                        <FileText size={12} className="mr-1" /> Obs
                      </Button>

                      {!payment.asaasId && !payment.infinitepayPaymentLink ? (
                         <Button
                           variant="outline" size="sm"
                           className="h-9 px-3 rounded-lg border-violet-200 text-[10px] font-black uppercase gap-1.5 text-violet-600 hover:bg-violet-500/10 shrink-0"
                           onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsaasPayment(payment); }}
                         >
                           <Zap size={12} /> Gerar Link
                         </Button>
                       ) : payment.infinitepayPaymentLink ? (
                         <Button
                           variant="outline" size="sm"
                           className="h-9 px-3 rounded-lg border-indigo-200 text-[10px] font-black uppercase gap-1.5 text-indigo-600 hover:bg-indigo-500/10 shrink-0"
                           onClick={() => payment.infinitepayPaymentLink && navigator.clipboard.writeText(payment.infinitepayPaymentLink).then(() => toast.success("Link copiado!"))}
                         >
                           <Copy size={12} /> Copiar Link
                         </Button>
                       ) : (
                         <Button
                           variant="outline" size="sm"
                           className="h-9 px-3 rounded-lg border-violet-200 text-[10px] font-black uppercase gap-1.5 text-violet-600 shrink-0"
                           onClick={() => payment.asaasPaymentLink && navigator.clipboard.writeText(payment.asaasPaymentLink).then(() => toast.success("Link copiado!"))}
                         >
                           <Copy size={12} /> Copiar Link
                         </Button>
                       )}
                        {payment.status !== "pago" && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-9 px-3 rounded-lg text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10 shrink-0"
                            disabled={updateMutation.isPending || updateMutation.variables?.id === payment.id}
                            onClick={() => updateMutation.mutate({ id: payment.id, status: "pago" })}
                          >
                            <CheckCircle2 size={12} className="mr-1" /> Pago
                          </Button>
                        )}
                    </div>
                  </div>
                ))
              )}
           </div>

           {/* Pagination - funcional */}
           <div className="p-4 lg:p-6 border-t border-border flex items-center justify-between bg-muted/20">
               <p className="hidden sm:block text-[11px] text-muted-foreground font-medium">
                 Mostrando {Math.min((currentPage - 1) * itemsPerPage + 1, filtered.length)}–{Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} registros
               </p>
               <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                    <ChevronDown className="rotate-90" size={14} />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce((acc: (number | string)[], p, idx, arr) => {
                      if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) => p === '...' ? (
                      <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button key={p} variant="ghost"
                        className={`h-8 w-8 text-xs font-bold ${currentPage === p ? 'bg-primary text-white hover:bg-primary' : 'text-muted-foreground'}`}
                        onClick={() => setCurrentPage(p as number)}>
                        {p}
                      </Button>
                    ))
                  }
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                    <ChevronDown className="-rotate-90" size={14} />
                  </Button>
               </div>
           </div>
        </div>
      
      {/* Barra de Ações em Massa (Bulk Actions - Financeiro) */}
      {selectedPaymentIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[90%] bg-slate-950/90 text-white dark:bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/20 flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-white font-bold text-xs px-2.5 py-1 rounded-lg">{selectedPaymentIds.length} selecionadas</span>
            <button onClick={() => setSelectedPaymentIds([])} className="text-xs text-muted-foreground hover:text-white underline">Desmarcar</button>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                const selected = payments.filter((p: PaymentRow) => selectedPaymentIds.includes(p.id));
                handleExportCSV(selected);
              }}
              className="h-8 text-xs font-bold gap-1 bg-white/10 hover:bg-white/20 border-white/20 text-white"
            >
              <Download size={14} /> Exportar CSV
            </Button>
            <Button 
              size="sm" 
              onClick={() => {
                selectedPaymentIds.forEach(id => updateMutation.mutate({ id, status: "pago" }));
                toast.success(`${selectedPaymentIds.length} mensalidades marcadas como pagas!`);
                setSelectedPaymentIds([]);
              }}
              className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <CheckCircle2 size={14} /> Marcar como Pagas
            </Button>
          </div>
        </div>
      )}

      {/* MODALS */}
      {novaOpen && (
        <NovaModal open={novaOpen} onClose={() => setNovaOpen(false)} students={students} dueDays={dueDaysFromSettings} />
      )}
      {editPayment && (
        <EditMensalidadeModal open={!!editPayment} onClose={() => setEditPayment(null)} payment={editPayment} />
      )}
      <ObservacaoModal open={!!notesPayment} onClose={() => setNotesPayment(null)} payment={notesPayment} />
      <GatewayChargeModal
        open={!!asaasPayment}
        onClose={() => setAsaasPayment(null)}
        payment={asaasPayment}
        gateway={(settings?.paymentGateway as "asaas" | "mercadopago" | "infinitepay") || "asaas"}
      />
    </div>
  );
}


