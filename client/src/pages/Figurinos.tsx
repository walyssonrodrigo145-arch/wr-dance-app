import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import {
  Shirt, Plus, Search, Pencil, Trash2, Loader2, Package, AlertTriangle,
  ArrowUpRight, ArrowDownLeft, X, CheckCircle2, ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TYPE_LABEL: Record<string, string> = {
  saia: "Saia", collant: "Collant", sapatilha: "Sapatilha", top: "Top",
  calca: "Calça", acessorio: "Acessório", uniforme: "Uniforme", outro: "Outro",
};

const CONDITION_META: Record<string, { label: string; className: string }> = {
  novo: { label: "Novo", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  bom: { label: "Bom estado", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  usado: { label: "Usado", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  danificado: { label: "Danificado", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

const LOAN_STATUS_META: Record<string, { label: string; className: string }> = {
  em_uso: { label: "Em uso", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  atrasado: { label: "Atrasado", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  devolvido: { label: "Devolvido", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
};

const SALE_STATUS_META: Record<string, { label: string; className: string }> = {
  pendente: { label: "Venda pendente", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  pago: { label: "Venda paga", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Venda cancelada", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

type CostumeRow = {
  id: number;
  name: string;
  code: string | null;
  type: string;
  size: string | null;
  color: string | null;
  quantity: number;
  emUso: number;
  disponivel: number;
  vendidos: number;
  disponivelVenda: number;
  condition: string;
  cost: number;
  salePrice: number;
  sellable: boolean;
  photoUrl: string | null;
  notes: string | null;
};

// ─── Modal de peça ────────────────────────────────────────────────────────────

function CostumeModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: CostumeRow | null }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(() => editing ? {
    name: editing.name,
    code: editing.code ?? "",
    type: editing.type,
    size: editing.size ?? "",
    color: editing.color ?? "",
    quantity: String(editing.quantity),
    condition: editing.condition,
    cost: String(editing.cost),
    salePrice: String(editing.salePrice ?? 0),
    sellable: editing.sellable === false ? "nao" : "sim",
    notes: editing.notes ?? "",
  } : {
    name: "", code: "", type: "outro", size: "", color: "",
    quantity: "1", condition: "bom", cost: "0", salePrice: "0", sellable: "sim", notes: "",
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    name: form.name.trim(),
    code: form.code.trim() || null,
    type: form.type as any,
    size: form.size.trim() || null,
    color: form.color.trim() || null,
    quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
    condition: form.condition as any,
    cost: Math.max(0, parseFloat(form.cost.replace(",", ".")) || 0),
    salePrice: Math.max(0, parseFloat(form.salePrice.replace(",", ".")) || 0),
    sellable: form.sellable === "sim",
    notes: form.notes.trim() || null,
    // Preserva a foto existente ao editar (o modal não expõe upload ainda)
    photoUrl: editing?.photoUrl ?? null,
  });

  const createMutation = trpc.figurinos.create.useMutation({
    onSuccess: () => { toast.success("Figurino cadastrado!"); utils.figurinos.list.invalidate(); utils.figurinos.stats.invalidate(); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.figurinos.update.useMutation({
    onSuccess: () => { toast.success("Figurino atualizado!"); utils.figurinos.list.invalidate(); utils.figurinos.stats.invalidate(); onClose(); },
    onError: (error) => toast.error(error.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (form.name.trim().length < 2) { toast.error("Informe o nome do figurino."); return; }
    if (editing) updateMutation.mutate({ id: editing.id, ...buildPayload() });
    else createMutation.mutate(buildPayload());
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Shirt className="text-indigo-500" size={20} />
            {editing ? "Editar figurino" : "Novo figurino"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome da peça *</Label>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: Saia tutu clássico" maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Código / Tombamento</Label>
            <Input value={form.code} onChange={(event) => set("code", event.target.value)} placeholder="FIG-001" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(value) => set("type", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tamanho</Label>
            <Input value={form.size} onChange={(event) => set("size", event.target.value)} placeholder="P, M, G, 36..." maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input value={form.color} onChange={(event) => set("color", event.target.value)} placeholder="Rosa, branco..." maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={form.condition} onValueChange={(value) => set("condition", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONDITION_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Custo unitário (R$)</Label>
            <Input value={form.cost} onChange={(event) => set("cost", event.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Preço de venda (R$) — Loja</Label>
            <Input value={form.salePrice} onChange={(event) => set("salePrice", event.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Disponível para venda</Label>
            <Select value={form.sellable} onValueChange={(value) => set("sellable", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim — aparece na Loja e no evento</SelectItem>
                <SelectItem value="nao">Não — apenas empréstimo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} maxLength={2000} placeholder="Conservação, onde está guardado..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de empréstimo ──────────────────────────────────────────────────────

function CheckoutModal({ open, onClose, preselected }: { open: boolean; onClose: () => void; preselected: CostumeRow | null }) {
  const utils = trpc.useUtils();
  const [costumeId, setCostumeId] = useState<string>(preselected ? String(preselected.id) : "");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string } | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [coreografiaId, setCoreografiaId] = useState("none");
  const [notes, setNotes] = useState("");

  const { data: costumes = [] } = trpc.figurinos.list.useQuery({ onlyAvailable: true });
  const { data: coreografias = [] } = trpc.figurinos.coreografiasAtivas.useQuery();
  const { data: searchResults = [] } = trpc.figurinos.searchAlunos.useQuery(
    { q: studentSearch },
    { enabled: studentSearch.trim().length >= 2 }
  );

  const checkout = trpc.figurinos.checkout.useMutation({
    onSuccess: () => {
      toast.success("Empréstimo registrado!");
      utils.figurinos.list.invalidate();
      utils.figurinos.stats.invalidate();
      utils.figurinos.loans.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedCostume = costumes.find((item: any) => String(item.id) === costumeId);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ArrowUpRight className="text-indigo-500" size={20} />
            Emprestar figurino
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Figurino *</Label>
            <Select value={costumeId} onValueChange={setCostumeId}>
              <SelectTrigger><SelectValue placeholder="Selecione a peça" /></SelectTrigger>
              <SelectContent>
                {costumes.map((item: any) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} ({item.disponivel} disponível(is))
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Aluno *</Label>
            {selectedStudent ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-bold">{selectedStudent.name}</Badge>
                <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-rose-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar aluno ativo..." className="pl-9" />
                {searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((student: any) => (
                      <button key={student.id} onClick={() => { setSelectedStudent(student); setStudentSearch(""); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                        {student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} max={selectedCostume?.disponivel ?? 1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Devolução prevista</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Coreografia (opcional)</Label>
            <Select value={coreografiaId} onValueChange={setCoreografiaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não vincular</SelectItem>
                {coreografias.map((coreografia: any) => (
                  <SelectItem key={coreografia.id} value={String(coreografia.id)}>{coreografia.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={2000} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={checkout.isPending}>Cancelar</Button>
          <Button
            disabled={!costumeId || !selectedStudent || checkout.isPending}
            onClick={() => {
              if (!selectedStudent) return;
              checkout.mutate({
                costumeId: Number(costumeId),
                studentId: selectedStudent.id,
                quantity: Math.max(1, parseInt(quantity, 10) || 1),
                dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null,
                coreografiaId: coreografiaId === "none" ? null : Number(coreografiaId),
                notes: notes.trim() || null,
              });
            }}
          >
            {checkout.isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            Confirmar empréstimo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de venda (Loja) ────────────────────────────────────────────────────

function SellModal({ open, onClose, preselected }: { open: boolean; onClose: () => void; preselected: CostumeRow | null }) {
  const utils = trpc.useUtils();
  const { data: rules } = trpc.settings.getStoreRules.useQuery();
  const [costumeId, setCostumeId] = useState<string>(preselected ? String(preselected.id) : "");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string } | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("mensalidade");
  const [notes, setNotes] = useState("");

  const { data: costumes = [] } = trpc.figurinos.list.useQuery({});
  const { data: searchResults = [] } = trpc.figurinos.searchAlunos.useQuery(
    { q: studentSearch },
    { enabled: studentSearch.trim().length >= 2 }
  );

  const sellableCostumes = (costumes as any[]).filter((item) => item.sellable && item.active !== false);
  const selectedCostume = sellableCostumes.find((item: any) => String(item.id) === costumeId);

  const sell = trpc.figurinos.sell.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.madeToOrder
          ? `Venda sob encomenda registrada! Total ${formatBRL(result.totalPrice)}`
          : `Venda registrada! Total ${formatBRL(result.totalPrice)}`
      );
      utils.figurinos.list.invalidate();
      utils.figurinos.stats.invalidate();
      utils.figurinos.sales.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const allowMonthly = rules?.allowMonthlyPayment !== false;
  const allowStandalone = rules?.allowStandalonePayment !== false;
  const allowDiscount = rules?.allowDiscount === true;
  const maxDiscount = Number((rules as any)?.maxDiscountPercent ?? 0);
  const quantityNumber = Math.max(1, parseInt(quantity, 10) || 1);
  const discountNumber = allowDiscount ? Math.max(0, Math.min(maxDiscount, parseFloat(discount.replace(",", ".")) || 0)) : 0;
  const unitPrice = selectedCostume ? Number(selectedCostume.salePrice) * (1 - discountNumber / 100) : 0;
  const total = Number((unitPrice * quantityNumber).toFixed(2));

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ShoppingBag className="text-indigo-500" size={20} />
            Vender na Loja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Produto *</Label>
            <Select value={costumeId} onValueChange={setCostumeId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {sellableCostumes.length === 0 && (
                  <SelectItem value="none" disabled>Nenhum produto marcado como vendável</SelectItem>
                )}
                {sellableCostumes.map((item: any) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} — {formatBRL(item.salePrice)} ({item.disponivelVenda} disp.)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Aluno *</Label>
            {selectedStudent ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-bold">{selectedStudent.name}</Badge>
                <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-rose-500"><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar aluno ativo..." className="pl-9" />
                {searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((student: any) => (
                      <button key={student.id} onClick={() => { setSelectedStudent(student); setStudentSearch(""); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                        {student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "") || "1")} />
            </div>
            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowMonthly && <SelectItem value="mensalidade">Junto com a mensalidade</SelectItem>}
                  {allowStandalone && <SelectItem value="avulso">Cobrança avulsa</SelectItem>}
                  {!allowMonthly && !allowStandalone && <SelectItem value="none" disabled>Formas de pagamento desativadas</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          {allowDiscount && (
            <div className="space-y-1.5">
              <Label>Desconto (%) — máx. {maxDiscount}%</Label>
              <Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value.replace(/[^\d,\.]/g, ""))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={2000} />
          </div>

          {selectedCostume && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-right">
              {discountNumber > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {formatBRL(Number(selectedCostume.salePrice))} − {discountNumber}% = {formatBRL(unitPrice)}/un
                </p>
              )}
              <p className="text-sm font-black text-foreground">Total: {formatBRL(total)}</p>
              {selectedCostume.disponivelVenda < quantityNumber && (
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                  Sem estoque suficiente — será registrada como sob encomenda
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={sell.isPending}>Cancelar</Button>
          <Button
            disabled={!costumeId || costumeId === "none" || !selectedStudent || sell.isPending || (!allowMonthly && !allowStandalone)}
            onClick={() => {
              if (!selectedStudent) return;
              sell.mutate({
                costumeId: Number(costumeId),
                studentId: selectedStudent.id,
                quantity: quantityNumber,
                paymentMode: paymentMode as "mensalidade" | "avulso",
                discountPercent: discountNumber,
                notes: notes.trim() || null,
              });
            }}
          >
            {sell.isPending && <Loader2 size={15} className="animate-spin mr-1.5" />}
            Registrar venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Figurinos() {
  const [tab, setTab] = useState("acervo");
  const [search, setSearch] = useState("");
  const [loanStatus, setLoanStatus] = useState("em_uso");
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [editing, setEditing] = useState<CostumeRow | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<CostumeRow | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellItem, setSellItem] = useState<CostumeRow | null>(null);
  const [deleting, setDeleting] = useState<CostumeRow | null>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.figurinos.stats.useQuery();
  const { data: costumes = [], isLoading } = trpc.figurinos.list.useQuery({ search: search.trim() || undefined });
  const { data: loans = [], isLoading: isLoadingLoans } = trpc.figurinos.loans.useQuery({ status: loanStatus as any, search: search.trim() || undefined });
  const { data: sales = [], isLoading: isLoadingSales } = trpc.figurinos.sales.useQuery({ status: "todos" });

  const updateSaleStatus = trpc.figurinos.updateSaleStatus.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.status === "pago" ? "Venda marcada como paga!" : "Venda cancelada.");
      utils.figurinos.sales.invalidate();
      utils.figurinos.list.invalidate();
      utils.figurinos.storeCatalog.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const checkin = trpc.figurinos.checkin.useMutation({
    onSuccess: () => {
      toast.success("Devolução registrada!");
      utils.figurinos.list.invalidate();
      utils.figurinos.stats.invalidate();
      utils.figurinos.loans.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.figurinos.delete.useMutation({
    onSuccess: (result) => {
      toast.success(result.message || "Figurino excluído.");
      setDeleting(null);
      utils.figurinos.list.invalidate();
      utils.figurinos.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const kpis = useMemo(() => ([
    { label: "Peças", value: stats?.pecas ?? 0, icon: Shirt, className: "text-indigo-500" },
    { label: "Unidades", value: stats?.unidades ?? 0, icon: Package, className: "text-blue-500" },
    { label: "Em uso", value: stats?.emUso ?? 0, icon: ArrowUpRight, className: "text-amber-500" },
    { label: "Atrasados", value: stats?.atrasados ?? 0, icon: AlertTriangle, className: "text-rose-500" },
    { label: "Valor do acervo", value: formatBRL(stats?.valorAcervo ?? 0), icon: Package, className: "text-emerald-500" },
  ]), [stats]);

  return (
    <div className="flex-1 space-y-6 lg:space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Shirt className="text-indigo-500" size={28} />
            Loja
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Acervo de figurinos e produtos: empréstimo, devolução e disponibilidade.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setCheckoutItem(null); setCheckoutOpen(true); }}>
            <ArrowUpRight size={16} className="mr-2" /> Emprestar
          </Button>
          <Button variant="outline" onClick={() => { setSellItem(null); setSellOpen(true); }}>
            <ShoppingBag size={16} className="mr-2" /> Vender
          </Button>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus size={16} className="mr-2" /> Nova peça
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Icon size={16} className={kpi.className} />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-xl lg:text-2xl font-black text-foreground mt-2">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar peça ou aluno..." className="pl-10" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="acervo">Acervo</TabsTrigger>
          <TabsTrigger value="emprestimos">Empréstimos</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
        </TabsList>

        <TabsContent value="acervo" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : costumes.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
              <Shirt className="mx-auto text-muted-foreground opacity-20 mb-3" size={44} />
              <p className="font-black text-foreground">Nenhum figurino cadastrado</p>
              <p className="text-sm text-muted-foreground mt-1">Cadastre as peças do acervo para controlar empréstimos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {costumes.map((costume: CostumeRow) => {
                const conditionMeta = CONDITION_META[costume.condition] ?? CONDITION_META.bom;
                return (
                  <div key={costume.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-foreground truncate">{costume.name}</h3>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                          {TYPE_LABEL[costume.type] ?? costume.type}
                          {costume.size ? ` · Tam. ${costume.size}` : ""}
                          {costume.color ? ` · ${costume.color}` : ""}
                          {costume.code ? ` · ${costume.code}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", conditionMeta.className)}>
                        {conditionMeta.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-bold">
                      <span className={cn(
                        "px-2 py-1 rounded-lg",
                        costume.disponivel === 0 ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
                      )}>
                        {costume.disponivel} disponível(is)
                      </span>
                      <span className="text-muted-foreground">{costume.emUso} em uso</span>
                      <span className="text-muted-foreground">Total: {costume.quantity}</span>
                    </div>

                    <div className="space-y-1 pt-1">
                      <p className="text-[11px] font-bold text-muted-foreground">
                        Custo {formatBRL(costume.cost)}/un
                        {costume.sellable ? (
                          <span className="text-indigo-600 dark:text-indigo-400"> · Venda {formatBRL(costume.salePrice)}</span>
                        ) : (
                          <span className="text-muted-foreground/70"> · não vendável</span>
                        )}
                      </p>
                      {costume.sellable && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {costume.vendidos} vendido(s) · {costume.disponivelVenda} disp. p/ venda
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end pt-1">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={costume.disponivel === 0}
                          onClick={() => { setCheckoutItem(costume); setCheckoutOpen(true); }}
                        >
                          <ArrowUpRight size={13} className="mr-1" /> Emprestar
                        </Button>
                        {costume.sellable && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSellItem(costume); setSellOpen(true); }}
                          >
                            <ShoppingBag size={13} className="mr-1" /> Vender
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(costume); setModalOpen(true); }} title="Editar">
                          <Pencil size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(costume)} title="Excluir">
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="emprestimos" className="mt-4 space-y-4">
          <Select value={loanStatus} onValueChange={setLoanStatus}>
            <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="em_uso">Em uso</SelectItem>
              <SelectItem value="atrasado">Atrasados</SelectItem>
              <SelectItem value="devolvido">Devolvidos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>

          {isLoadingLoans ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : loans.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
              <ArrowUpRight className="mx-auto text-muted-foreground opacity-20 mb-3" size={44} />
              <p className="font-black text-foreground">Nenhum empréstimo neste filtro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loans.map((loan: any) => {
                const statusMeta = LOAN_STATUS_META[loan.situacao] ?? LOAN_STATUS_META.em_uso;
                return (
                  <div key={loan.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">
                        {loan.costumeName} <span className="text-muted-foreground font-bold">×{loan.quantity}</span>
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                        {loan.studentName}
                        {loan.coreografiaTitle ? ` · ${loan.coreografiaTitle}` : ""}
                        {loan.dueDate ? ` · devolver até ${formatDateOnly(loan.dueDate)}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("w-fit text-[10px] font-black", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                    {!loan.returnedAt && (
                      <Button size="sm" variant="outline" onClick={() => checkin.mutate({ loanId: loan.id })} disabled={checkin.isPending}>
                        <ArrowDownLeft size={14} className="mr-1.5" /> Registrar devolução
                      </Button>
                    )}
                    {loan.returnedAt && (
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-600">
                        <CheckCircle2 size={13} /> Devolvido em {new Date(loan.returnedAt).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vendas" className="mt-4 space-y-4">
          {isLoadingSales ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : sales.length === 0 ? (
            <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
              <ShoppingBag className="mx-auto text-muted-foreground opacity-20 mb-3" size={44} />
              <p className="font-black text-foreground">Nenhuma venda registrada</p>
              <p className="text-sm text-muted-foreground mt-1">Use o botão "Vender" para registrar a primeira venda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(sales as any[]).map((sale) => {
                const statusMeta = SALE_STATUS_META[sale.status] ?? SALE_STATUS_META.pendente;
                return (
                  <div key={sale.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">
                        {sale.costumeName} <span className="text-muted-foreground font-bold">×{sale.quantity}</span>
                        <span className="text-indigo-600 dark:text-indigo-400 ml-2">{formatBRL(sale.totalPrice)}</span>
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                        {sale.studentName}
                        {sale.eventName ? ` · ${sale.eventName}` : ""}
                        {" · "}{sale.paymentMode === "mensalidade" ? "junto com a mensalidade" : "cobrança avulsa"}
                        {sale.discountPercent > 0 ? ` · desconto ${sale.discountPercent}%` : ""}
                      </p>
                    </div>
                    {sale.madeToOrder && (
                      <Badge variant="outline" className="w-fit text-[10px] font-black bg-amber-500/10 text-amber-600 border-amber-500/30">
                        Sob encomenda
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn("w-fit text-[10px] font-black", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                    {sale.status === "pendente" && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "pago" })} disabled={updateSaleStatus.isPending}>
                          <CheckCircle2 size={13} className="mr-1" /> Marcar pago
                        </Button>
                        <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Cancelar venda" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "cancelado" })} disabled={updateSaleStatus.isPending}>
                          <X size={15} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {modalOpen && (
        <CostumeModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} />
      )}

      {checkoutOpen && (
        <CheckoutModal
          open={checkoutOpen}
          onClose={() => { setCheckoutOpen(false); setCheckoutItem(null); }}
          preselected={checkoutItem}
        />
      )}

      {sellOpen && (
        <SellModal
          open={sellOpen}
          onClose={() => { setSellOpen(false); setSellItem(null); }}
          preselected={sellItem}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir figurino?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" será removido do acervo. Peças com histórico de empréstimos são arquivadas em vez de excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
