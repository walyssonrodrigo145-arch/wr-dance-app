import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { 
  DollarSign, Plus, X, Loader2, Trash2, Pencil, Search, 
  MoreVertical, CreditCard, CheckCircle2, TrendingUp, Calendar, 
  Filter, Download, RefreshCw, FileUp, FileCheck, Building2, 
  Tag, Wallet, ArrowUpRight, ArrowDownRight, PieChart as PieIcon,
  TrendingDown, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseBRL } from "@/lib/money";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CATEGORIES = ["Aluguel", "Equipamentos", "Impostos", "Salários", "Marketing", "Utilidades", "RH", "Transporte", "Outros"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pago:     { label: "Paga",     cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    pendente: { label: "Pendente", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    atrasado: { label: "Atrasada", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  };
  const c = map[status] ?? map.pendente;
  return (
    <span className={cn("inline-flex items-center justify-center text-[10px] font-black px-3 py-1.5 rounded-xl border shadow-sm uppercase tracking-wider", c.cls)}>
      {c.label}
    </span>
  );
}

function NovaDespesaModal({ open, onClose }: { open: boolean; onClose: () => void; }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    description: "",
    supplier: "",
    account: "",
    amount: "",
    date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    category: "Outros",
    recurrence: "unica",
    status: "pendente" as any,
    notes: ""
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success(`Despesa registrada com sucesso!`);
      utils.expenses.invalidate();
      onClose();
      setForm({ description: "", supplier: "", account: "", amount: "", date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), category: "Outros", recurrence: "unica", status: "pendente", notes: "" });
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSubmit = () => {
    if (!form.description || !form.amount || !form.date || !form.category) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    // AUDIT FIX: parseBRL evita NaN quando o campo vem com vírgula decimal
    const amountVal = parseBRL(form.amount);
    if (!amountVal || amountVal <= 0) {
      toast.error("Informe um valor válido para a despesa");
      return;
    }
    createMutation.mutate({
      description: form.description,
      supplier: form.supplier.trim() || undefined,
      account: form.account.trim() || undefined,
      recurrence: form.recurrence,
      amount: amountVal,
      date: form.date,
      category: form.category,
      status: form.status,
      notes: form.notes.trim() || undefined
    });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-[2.5rem] border border-border shadow-2xl w-full max-w-2xl max-h-[calc(100dvh-8rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-6 lg:p-8 border-b border-border bg-gradient-to-r from-purple-500/10 via-background to-background shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-600 flex items-center justify-center shadow-sm">
                 <DollarSign size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight">Nova Despesa</h3>
                <p className="text-xs text-muted-foreground font-medium mt-1">Preencha os dados para registrar uma saída financeira.</p>
              </div>
           </div>
           <button onClick={onClose} className="w-10 h-10 rounded-2xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
             <X size={20} />
           </button>
        </div>

        <div className="p-6 lg:p-8 space-y-6 overflow-y-auto scrollbar-none flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Descrição / Título *</label>
                <Input value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Ex: Conta de Luz Mensal, Compra de Macbook" className="h-12 text-sm font-bold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Fornecedor / Favorecido</label>
                <Input value={form.supplier} onChange={e => set("supplier", e.target.value)}
                  placeholder="Ex: Enel Distribuição, Apple Inc." className="h-12 text-sm font-semibold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Conta Financeira</label>
                <Input value={form.account} onChange={e => set("account", e.target.value)}
                  placeholder="Ex: Itaú PJ, Cartão Nubank, Caixinha" className="h-12 text-sm font-semibold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Valor (R$) *</label>
                <Input value={form.amount} onChange={e => set("amount", e.target.value)}
                  type="number" placeholder="0.00" className="h-12 text-base font-black rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all text-purple-600" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Data de Vencimento *</label>
                <Input value={form.date} onChange={e => set("date", e.target.value)}
                  type="date" className="h-12 text-sm font-bold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Categoria *</label>
                <select value={form.category} onChange={e => set("category", e.target.value)}
                  className="w-full h-12 text-sm font-bold rounded-2xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:bg-card transition-all cursor-pointer">
                  {CATEGORIES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Recorrência *</label>
                <select value={form.recurrence} onChange={e => set("recurrence", e.target.value)}
                  className="w-full h-12 text-sm font-bold rounded-2xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:bg-card transition-all cursor-pointer">
                  <option value="unica">Única (Não repete)</option>
                  <option value="mensal">Mensal (Despesa Fixa)</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Status do Pagamento *</label>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => set("status", "pendente")}
                    className={cn("h-12 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2", form.status === "pendente" ? "border-amber-500 bg-amber-500/10 text-amber-600 shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40")}>
                    Pendente / A Vencer
                  </button>
                  <button type="button" onClick={() => set("status", "pago")}
                    className={cn("h-12 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2", form.status === "pago" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40")}>
                    <CheckCircle2 size={16} /> Pago
                  </button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Observações Adicionais</label>
                <Input value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Detalhes adicionais, centro de custo, número da NF..." className="h-12 text-sm font-medium rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>
            </div>
        </div>

        <div className="p-6 lg:p-8 border-t border-border bg-muted/20 flex gap-4 shrink-0">
          <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-xl shadow-purple-500/20 gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
            onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
            Registrar Despesa
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function EditDespesaModal({ open, onClose, expense }: { open: boolean; onClose: () => void; expense: any; }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    description: expense?.description || "",
    supplier: expense?.supplier || "",
    account: expense?.account || "",
    amount: expense?.amount ? String(expense.amount) : "",
    date: expense?.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    category: expense?.category || "Outros",
    recurrence: expense?.recurrence || "unica",
    status: expense?.status || "pendente",
    notes: expense?.notes || ""
  });

  useEffect(() => {
    if (expense) {
      setForm({
        description: expense.description || "",
        supplier: expense.supplier || "",
        account: expense.account || "",
        amount: expense.amount ? String(expense.amount) : "",
        date: expense.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        category: expense.category || "Outros",
        recurrence: expense.recurrence || "unica",
        status: expense.status || "pendente",
        notes: expense.notes || ""
      });
    }
  }, [expense]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      toast.success(`Despesa atualizada com sucesso!`);
      utils.expenses.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      toast.success("Despesa removida!");
      utils.expenses.invalidate();
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao excluir: " + e.message),
  });

  const handleSubmit = () => {
    if (!form.description || !form.amount || !form.date || !form.category) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    updateMutation.mutate({
      id: expense.id,
      description: form.description,
      supplier: form.supplier.trim() || null,
      account: form.account.trim() || null,
      recurrence: form.recurrence,
      amount: Number(form.amount),
      date: form.date,
      category: form.category,
      status: form.status,
      notes: form.notes.trim() || null
    });
  };

  if (!open || !expense) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-card rounded-[2.5rem] border border-border shadow-2xl w-full max-w-2xl max-h-[calc(100dvh-8rem)] md:max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-6 lg:p-8 border-b border-border bg-gradient-to-r from-blue-500/10 via-background to-background shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-600 flex items-center justify-center shadow-sm">
                 <Pencil size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight">Editar Despesa</h3>
                <p className="text-xs text-muted-foreground font-medium mt-1">Modifique os dados do registro financeiro.</p>
              </div>
           </div>
           <button onClick={onClose} className="w-10 h-10 rounded-2xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
             <X size={20} />
           </button>
        </div>

        <div className="p-6 lg:p-8 space-y-6 overflow-y-auto scrollbar-none flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Descrição / Título *</label>
                <Input value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Ex: Conta de Luz Mensal" className="h-12 text-sm font-bold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Fornecedor / Favorecido</label>
                <Input value={form.supplier} onChange={e => set("supplier", e.target.value)}
                  placeholder="Ex: Enel Distribuição" className="h-12 text-sm font-semibold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Conta Financeira</label>
                <Input value={form.account} onChange={e => set("account", e.target.value)}
                  placeholder="Ex: Itaú PJ" className="h-12 text-sm font-semibold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Valor (R$) *</label>
                <Input value={form.amount} onChange={e => set("amount", e.target.value)}
                  type="number" placeholder="0.00" className="h-12 text-base font-black rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all text-blue-600" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Data de Vencimento *</label>
                <Input value={form.date} onChange={e => set("date", e.target.value)}
                  type="date" className="h-12 text-sm font-bold rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Categoria *</label>
                <select value={form.category} onChange={e => set("category", e.target.value)}
                  className="w-full h-12 text-sm font-bold rounded-2xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-card transition-all cursor-pointer">
                  {CATEGORIES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Recorrência *</label>
                <select value={form.recurrence} onChange={e => set("recurrence", e.target.value)}
                  className="w-full h-12 text-sm font-bold rounded-2xl border border-border bg-muted/50 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-card transition-all cursor-pointer">
                  <option value="unica">Única (Não repete)</option>
                  <option value="mensal">Mensal (Despesa Fixa)</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Status do Pagamento *</label>
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => set("status", "pendente")}
                    className={cn("h-12 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2", form.status === "pendente" ? "border-amber-500 bg-amber-500/10 text-amber-600 shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40")}>
                    Pendente / A Vencer
                  </button>
                  <button type="button" onClick={() => set("status", "pago")}
                    className={cn("h-12 rounded-2xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2", form.status === "pago" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40")}>
                    <CheckCircle2 size={16} /> Pago
                  </button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Observações Adicionais</label>
                <Input value={form.notes} onChange={e => set("notes", e.target.value)}
                  placeholder="Detalhes adicionais..." className="h-12 text-sm font-medium rounded-2xl border-border bg-muted/50 px-4 focus:bg-card transition-all" />
              </div>
            </div>
        </div>

        <div className="p-6 lg:p-8 border-t border-border bg-muted/20 flex flex-col sm:flex-row gap-4 shrink-0">
          <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 uppercase tracking-widest"
            onClick={() => {
              if(confirm("Deseja realmente excluir esta despesa?")) {
                deleteMutation.mutate({ id: expense.id });
              }
            }} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={18} className="mr-2" />}
            Excluir
          </Button>
          <div className="flex flex-1 gap-4">
            <Button variant="ghost" className="flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest shadow-xl shadow-blue-500/20 gap-3 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSubmit} disabled={updateMutation.isPending || deleteMutation.isPending}>
              {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={18} />}
              Salvar
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function DespesasTab({ viewMonth, viewYear, expenses, isLoading }: { viewMonth: number, viewYear: number, expenses: any[], isLoading: boolean }) {
  const utils = trpc.useUtils();
  const { maskBRL } = useDashboardPrefs();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("todas");
  const [filterAccount, setFilterAccount] = useState("todas");
  const [filterStatus, setFilterStatus] = useState("todas");
  const [novaOpen, setNovaOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: allExpenses = [] } = trpc.expenses.list.useQuery({ all: true });

  const updateStatusMutation = trpc.expenses.update.useMutation({
    onSuccess: () => { 
      toast.success("Status atualizado!"); 
      utils.expenses.invalidate();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      toast.success("Despesa removida!");
      utils.expenses.invalidate();
    },
    onError: (e: any) => toast.error("Erro ao excluir: " + e.message),
  });

  const generateRecurringMutation = trpc.expenses.generateRecurring.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} despesa(s) recorrente(s) gerada(s)!`);
      utils.expenses.invalidate();
    },
    onError: (e: any) => toast.error("Erro ao gerar: " + e.message),
  });

  const uploadReceiptMutation = trpc.expenses.uploadReceipt.useMutation({
    onSuccess: () => {
      toast.success("Comprovante anexado com sucesso!");
      utils.expenses.invalidate();
      setUploadingFor(null);
    },
    onError: (e: any) => {
      toast.error("Erro ao enviar comprovante: " + e.message);
      setUploadingFor(null);
    }
  });

  const generateReport = trpc.reportEngine.generate.useMutation();

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
        expenseId: uploadingFor,
        fileData: base64,
        fileName: file.name,
        fileType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const uniqueAccounts = useMemo(() => {
    const accs = expenses.map(e => e.account).filter(Boolean);
    return Array.from(new Set(accs)) as string[];
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((p: any) => {
      const nameMatch = p.description?.toLowerCase().includes(search.toLowerCase()) || p.supplier?.toLowerCase().includes(search.toLowerCase());
      const catMatch = filterCategory === "todas" || p.category === filterCategory;
      const accMatch = filterAccount === "todas" || p.account === filterAccount;
      const statusMatch = filterStatus === "todas" || p.status === filterStatus;
      return nameMatch && catMatch && accMatch && statusMatch;
    });
  }, [expenses, search, filterCategory, filterAccount, filterStatus]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;

  const stats = useMemo(() => {
    const sum = (arr: any[]) => arr.reduce((acc, p) => acc + Number(p.amount), 0);
    const currentSum = sum(expenses);

    // Prev month calculation
    let prevM = viewMonth - 1;
    let prevY = viewYear;
    if (prevM < 1) { prevM = 12; prevY -= 1; }
    const prevExpenses = allExpenses.filter((e: any) => {
      const d = new Date(e.date + "T12:00:00");
      return d.getMonth() + 1 === prevM && d.getFullYear() === prevY;
    });
    const prevSum = sum(prevExpenses);
    const prevVarSum = sum(prevExpenses.filter((e:any) => e.recurrence === "unica"));

    const fixasSum = sum(expenses.filter(e => e.recurrence === "mensal"));
    const variaveisSum = sum(expenses.filter(e => e.recurrence === "unica"));

    const percentTotal = prevSum === 0 ? 0 : ((currentSum - prevSum) / prevSum) * 100;
    const percentFixas = currentSum === 0 ? 0 : (fixasSum / currentSum) * 100;
    const percentVariaveis = prevVarSum === 0 ? 0 : ((variaveisSum - prevVarSum) / prevVarSum) * 100;

    const currentDay = viewMonth === new Date().getMonth() + 1 ? Math.max(1, new Date().getDate()) : 30;
    const mediaDiaria = currentSum / currentDay;

    return {
      currentSum, prevSum, percentTotal,
      fixasSum, percentFixas,
      variaveisSum, percentVariaveis,
      mediaDiaria
    };
  }, [expenses, allExpenses, viewMonth, viewYear]);

  const categoryChartData = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e: any) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    return Object.keys(map).map(k => ({ name: k, value: map[k] }));
  }, [expenses]);

  const monthlyEvolutionData = useMemo(() => {
    const result = [];
    const now = new Date(viewYear, viewMonth - 1, 1);
    for (let i = 5; i >= 0; i--) {
      const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = target.getMonth() + 1;
      const y = target.getFullYear();
      const monthExpenses = allExpenses.filter((e: any) => {
        const d = new Date(e.date + "T12:00:00");
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });
      const sum = monthExpenses.reduce((acc: number, e: any) => acc + Number(e.amount), 0);
      result.push({
        name: `${MONTHS_PT[m-1]}`,
        total: sum
      });
    }
    return result;
  }, [allExpenses, viewMonth, viewYear]);

  const upcomingExpenses = useMemo(() => {
    return expenses
      .filter((e: any) => e.status === "pendente")
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [expenses]);

  const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#6b7280'];

  const exportCSV = () => {
    let columns = ["ID", "Descrição", "Fornecedor", "Conta", "Categoria", "Valor", "Data", "Recorrência", "Status"];
    let rows: any[][] = [];
    filtered.forEach((e: any) => {
      rows.push([e.id, e.description, e.supplier || '-', e.account || '-', e.category, Number(e.amount), format(new Date(e.date + "T12:00:00"), 'dd/MM/yyyy'), e.recurrence, e.status.toUpperCase()]);
    });

    toast.loading("Gerando relatório em Excel com IA...", { id: 'export-despesas' });
    generateReport.mutate({ 
      format: 'excel', 
      title: `Despesas — ${MONTHS_PT[viewMonth-1]}/${viewYear}`, 
      columns, 
      rows, 
      period: `${MONTHS_PT[viewMonth-1]}/${viewYear}`, 
      includeAiInsights: true 
    }, {
      onSuccess: (data) => {
        toast.dismiss('export-despesas');
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.data}`;
        link.download = `relatorio_despesas_${MONTHS_PT[viewMonth-1]}_${viewYear}.xlsx`;
        link.click();
        toast.success("Relatório Premium gerado com sucesso!");
      },
      onError: (e) => {
        toast.dismiss('export-despesas');
        toast.error("Erro ao gerar relatório: " + e.message);
      }
    });
  };

  return (
    <div className="space-y-6 lg:space-y-8 font-sans animate-fade-in pb-12">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,application/pdf"
        onChange={handleFileChange}
      />

      <NovaDespesaModal open={novaOpen} onClose={() => setNovaOpen(false)} />
      <EditDespesaModal open={!!editExpense} onClose={() => setEditExpense(null)} expense={editExpense} />

      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 lg:p-8 bg-card rounded-[2rem] border border-border shadow-sm">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
            Despesas e Custos <span className="text-xs font-black px-3 py-1 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20 uppercase tracking-widest">Financeiro</span>
          </h1>
          <p className="text-xs lg:text-sm text-muted-foreground font-medium mt-1">Visão completa e controle centralizado de todas as saídas financeiras da sua escola.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Button 
            onClick={() => generateRecurringMutation.mutate({ startMonth: viewMonth, startYear: viewYear, monthsCount: 1 })} 
            disabled={generateRecurringMutation.isPending}
            variant="outline"
            className="h-11 rounded-xl px-4 border-border hover:bg-muted text-xs font-bold gap-2 text-muted-foreground hover:text-foreground transition-all shadow-sm flex-1 md:flex-initial"
          >
            {generateRecurringMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} className="text-purple-500" />}
            Gerar Fixas do Mês
          </Button>

          <Button 
            onClick={exportCSV} 
            variant="outline"
            className="h-11 rounded-xl px-4 border-border hover:bg-muted text-xs font-bold gap-2 text-muted-foreground hover:text-foreground transition-all shadow-sm flex-1 md:flex-initial"
          >
            <Download size={15} />
            Exportar Relatório
          </Button>

          <Button 
            onClick={() => setNovaOpen(true)}
            className="h-11 rounded-xl px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black gap-2 shadow-lg shadow-purple-500/20 transition-all active:scale-95 w-full md:w-auto"
          >
            <Plus size={16} />
            Nova Despesa
          </Button>
        </div>
      </div>

      {/* 4 CARDS FINANCEIROS SUPERIORES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {/* Card 1 */}
        <div className="p-5 lg:p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Total de Despesas</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shadow-xs shrink-0">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">{maskBRL(stats.currentSum)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={cn("inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md", stats.percentTotal <= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>
                {stats.percentTotal <= 0 ? <TrendingDown size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1" />}
                {Math.abs(stats.percentTotal).toFixed(1)}%
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">vs mês anterior</span>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="p-5 lg:p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Despesas Fixas</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shadow-xs shrink-0">
              <Building2 size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">{maskBRL(stats.fixasSum)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600">
                {stats.percentFixas.toFixed(1)}% do total
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">recorrentes</span>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="p-5 lg:p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Despesas Variáveis</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-xs shrink-0">
              <Tag size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">{maskBRL(stats.variaveisSum)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={cn("inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md", stats.percentVariaveis <= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>
                {stats.percentVariaveis <= 0 ? <TrendingDown size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1" />}
                {Math.abs(stats.percentVariaveis).toFixed(1)}%
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">vs mês anterior</span>
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="p-5 lg:p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Média Diária</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-xs shrink-0">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">{maskBRL(stats.mediaDiaria)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                Período Atual
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">por dia</span>
            </div>
          </div>
        </div>
      </div>

      {/* PAINEL DE GRÁFICOS & RESUMO (3 COLUNAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Donut de Categorias */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
              <PieIcon size={16} className="text-purple-500" /> Distribuição por Categoria
            </h3>
          </div>

          <div className="h-52 w-full">
            {categoryChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-medium italic">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => maskBRL(Number(val))}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.75rem', fontSize: '12px', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border max-h-24 overflow-y-auto scrollbar-none">
            {categoryChartData.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[11px] font-semibold text-muted-foreground truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico Mensal de Evolução */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-500" /> Evolução de Despesas
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">6 meses</span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyEvolutionData}>
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={45} tickFormatter={(val) => `R$${val/1000}k`} />
                <Tooltip 
                  formatter={(val: any) => maskBRL(Number(val))}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.75rem', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Próximos Vencimentos */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-black text-foreground tracking-tight flex items-center gap-2">
              <Calendar size={16} className="text-amber-500" /> Próximos Vencimentos
            </h3>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-56 pr-1 scrollbar-none">
            {upcomingExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground font-medium italic text-center py-8">Nenhuma despesa pendente no momento.</p>
            ) : (
              upcomingExpenses.map((exp: any) => (
                <div key={exp.id} onClick={() => setEditExpense(exp)} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border hover:bg-muted transition-all cursor-pointer group">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-xs font-bold text-foreground truncate group-hover:text-purple-600 transition-colors">{exp.description}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{format(new Date(exp.date + "T12:00:00"), "dd/MM")} • {exp.account || "Sem conta"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-amber-600 tracking-tight">{maskBRL(Number(exp.amount))}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* BARRA DE BUSCA E FILTROS ESPAÇOSOS */}
      <div className="p-5 bg-card rounded-2xl border border-border shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input 
              placeholder="Buscar descrição ou fornecedor..." 
              className="pl-10 h-11 border-border bg-muted/30 rounded-xl text-xs font-bold focus:bg-card transition-all"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Categoria Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Categoria</label>
            <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}
              className="w-full h-11 text-xs font-bold rounded-xl border border-border bg-muted/30 px-3 focus:bg-card transition-all cursor-pointer text-foreground">
              <option value="todas">Todas Categorias</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Conta Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Conta Financeira</label>
            <select value={filterAccount} onChange={e => { setFilterAccount(e.target.value); setCurrentPage(1); }}
              className="w-full h-11 text-xs font-bold rounded-xl border border-border bg-muted/30 px-3 focus:bg-card transition-all cursor-pointer text-foreground">
              <option value="todas">Todas Contas</option>
              {uniqueAccounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Status de Pagamento</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="w-full h-11 text-xs font-bold rounded-xl border border-border bg-muted/30 px-3 focus:bg-card transition-all cursor-pointer text-foreground">
              <option value="todas">Todos Status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
            </select>
          </div>
        </div>

        {(search || filterCategory !== "todas" || filterAccount !== "todas" || filterStatus !== "todas") && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs font-medium text-muted-foreground">Filtros ativos aplicados</span>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterCategory("todas"); setFilterAccount("todas"); setFilterStatus("todas"); setCurrentPage(1); }}
              className="h-8 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10">
              Limpar Todos os Filtros
            </Button>
          </div>
        )}
      </div>

      {/* SEÇÃO PRINCIPAL: TABELA EM LARGURA TOTAL (SEM CORTES) */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 lg:p-6 border-b border-border flex items-center justify-between">
           <h3 className="text-base font-black text-foreground tracking-tight flex items-center gap-2">
             <Filter size={18} className="text-purple-500" /> Registros de Despesas
           </h3>
           <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-lg border border-border">{filtered.length} encontrados</span>
        </div>

        {/* Tabela Desktop Largura Total */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Descrição / Fornecedor</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Categoria</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Conta</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Vencimento</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Valor (R$)</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Comprovante / Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="py-20 text-center"><Loader2 size={32} className="animate-spin text-purple-500 mx-auto" /></td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center text-xs text-muted-foreground font-medium italic">Nenhuma despesa atende aos filtros atuais.</td></tr>
              ) : (
                paginated.map((expense: any) => (
                  <tr key={expense.id} className="group hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => setEditExpense(expense)}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-foreground tracking-tight group-hover:text-purple-600 transition-colors">{expense.description}</p>
                      {expense.supplier && <p className="text-[11px] text-muted-foreground font-semibold uppercase mt-0.5">{expense.supplier}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border uppercase tracking-wider">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-semibold text-muted-foreground">{expense.account || "—"}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <p className="text-xs font-bold text-foreground">{format(new Date(expense.date + "T12:00:00"), "dd/MM/yyyy")}</p>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase mt-0.5">{expense.recurrence}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm font-black text-foreground tracking-tight">
                        {maskBRL(Number(expense.amount))}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={expense.status} />
                    </td>
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {expense.receiptUrl ? (
                          <Button
                            variant="outline" size="sm"
                            onClick={() => window.open(expense.receiptUrl, "_blank")}
                            className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-emerald-600 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 gap-1.5"
                          >
                            <FileCheck size={14} /> Comprovante
                          </Button>
                        ) : (
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => {
                              setUploadingFor(expense.id);
                              setTimeout(() => fileInputRef.current?.click(), 100);
                            }}
                            className="h-8 rounded-lg px-2 text-[11px] font-bold text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 gap-1.5"
                          >
                            <FileUp size={14} /> Anexar
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5 border-border shadow-xl">
                            {expense.status !== "pago" && (
                              <DropdownMenuItem className="gap-2.5 rounded-lg p-2.5 text-xs font-bold" onClick={() => updateStatusMutation.mutate({ id: expense.id, status: "pago" })}>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Marcar como Pago
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="gap-2.5 rounded-lg p-2.5 text-xs font-bold" onClick={() => setEditExpense(expense)}>
                              <Pencil className="w-4 h-4 text-blue-500" /> Editar Despesa
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-muted" />
                            <DropdownMenuItem className="gap-2.5 rounded-lg p-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10" onClick={() => {
                              if(confirm("Deseja excluir esta despesa?")) {
                                deleteMutation.mutate({ id: expense.id });
                              }
                            }}>
                              <Trash2 className="w-4 h-4" /> Excluir Registro
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Tabela Mobile Cards */}
        <div className="md:hidden grid grid-cols-1 gap-4 p-4">
          {isLoading ? (
            <div className="py-10 text-center"><Loader2 size={32} className="animate-spin text-purple-500 mx-auto" /></div>
          ) : paginated.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground font-medium italic">Nenhuma despesa encontrada.</div>
          ) : (
            paginated.map((expense: any) => (
              <div key={expense.id} onClick={() => setEditExpense(expense)} className="bg-muted/30 rounded-2xl p-4 border border-border shadow-xs space-y-3 active:scale-[0.98] transition-all cursor-pointer min-w-0">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground truncate">{expense.description}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5 truncate">{expense.supplier || expense.category}</p>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={expense.status} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Vencimento</p>
                    <p className="text-xs font-black text-foreground">{format(new Date(expense.date + "T12:00:00"), "dd/MM/yyyy")}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Valor</p>
                    <p className="text-sm font-black text-foreground">{maskBRL(Number(expense.amount))}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginação */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
           <p className="text-xs text-muted-foreground font-bold tracking-wider">Página {currentPage} de {totalPages}</p>
           <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="h-9 rounded-xl px-3 text-xs font-bold border-border hover:bg-card">
                Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="h-9 rounded-xl px-3 text-xs font-bold border-border hover:bg-card">
                Próxima
              </Button>
           </div>
        </div>
      </div>
    </div>
  );
}
