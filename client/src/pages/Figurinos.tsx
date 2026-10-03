import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EVENT_PAYMENT_META, EVENT_DELIVERY_META } from "@/components/eventos/EventoModal";
import { SmartImage } from "@/components/common/SmartImage";
import { ImageUploadField } from "@/components/common/ImageUploadField";

/** Separa as duas dimensões do status único da venda: pagamento × entrega. */
function saleDimensions(status: string): { payment: { label: string; className: string }; delivery: { label: string; className: string } | null } {
  if (status === "cancelado") return { payment: { label: "Cancelado", className: SALE_STATUS_META.cancelado.className }, delivery: null };
  const payment = status === "pago" || status === "entregue"
    ? { label: "Pago", className: SALE_STATUS_META.pago.className }
    : { label: "Pagamento pendente", className: SALE_STATUS_META.pendente.className };
  const delivery = status === "em_separacao"
    ? EVENT_DELIVERY_META.em_separacao
    : status === "entregue" ? EVENT_DELIVERY_META.entregue : null;
  return { payment, delivery };
}
import { formatBRL } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import {
  Shirt, Plus, Search, Pencil, Trash2, Loader2, Package, AlertTriangle,
  ArrowUpRight, ArrowDownLeft, X, CheckCircle2, ShoppingBag, QrCode, Copy, ExternalLink,
  LayoutGrid, List, Eye, Tag, Tags, ChevronLeft, ChevronRight, Wallet, Clock,
  TrendingUp, Truck, PackageCheck, PackageOpen, Percent, History,
} from "lucide-react";
import { motion } from "framer-motion";
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
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  em_separacao: { label: "Em separação", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  pago: { label: "Pago", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  entregue: { label: "Entregue", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

/** Preço praticado: promoPrice quando definido (>0), senão salePrice. */
function effectiveSalePrice(item: Pick<CostumeRow, "salePrice" | "promoPrice">): number {
  const promo = Number((item as any).promoPrice);
  return promo > 0 ? promo : Number(item.salePrice) || 0;
}

/** Estado do estoque de venda (dot + rótulo), padrão da Loja. */
function stockState(avail: number): { label: string; dot: string; text: string } {
  if (avail <= 3) return { label: "estoque crítico", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (avail <= 8) return { label: "estoque baixo", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { label: "em estoque", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
}

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
  promoPrice: number | null;
  sellable: boolean;
  photoUrl: string | null;
  notes: string | null;
  active: boolean;
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
    promoPrice: editing.promoPrice != null && Number(editing.promoPrice) > 0 ? String(editing.promoPrice) : "",
    sellable: editing.sellable === false ? "nao" : "sim",
    notes: editing.notes ?? "",
    photoUrl: editing.photoUrl ?? "",
  } : {
    name: "", code: "", type: "outro", size: "", color: "",
    quantity: "1", condition: "bom", cost: "0", salePrice: "0", promoPrice: "", sellable: "sim", notes: "", photoUrl: "",
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
    promoPrice: form.promoPrice.trim() ? Math.max(0, parseFloat(form.promoPrice.replace(",", ".")) || 0) : null,
    sellable: form.sellable === "sim",
    notes: form.notes.trim() || null,
    photoUrl: form.photoUrl.trim() || null,
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
            <ShoppingBag className="text-indigo-500" size={20} />
            {editing ? "Editar produto" : "Novo produto"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <p className="sm:col-span-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-indigo-500" /> Informações
          </p>
          <div className="space-y-1.5">
            <Label>Nome do produto *</Label>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: Saia tutu clássico" maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
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
            <Label>SKU / Código</Label>
            <Input value={form.code} onChange={(event) => set("code", event.target.value)} placeholder="COL-001" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label>Disponível para venda</Label>
            <Select value={form.sellable} onValueChange={(value) => set("sellable", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim — Loja e eventos</SelectItem>
                <SelectItem value="nao">Não — somente acervo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="sm:col-span-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-emerald-500" /> Preços
          </p>
          <div className="space-y-1.5">
            <Label>Custo unitário (R$)</Label>
            <Input value={form.cost} onChange={(event) => set("cost", event.target.value)} placeholder="0,00" />
          </div>
          {form.sellable === "sim" ? (
            <>
              <div className="space-y-1.5">
                <Label>Preço de venda (R$)</Label>
                <Input value={form.salePrice} onChange={(event) => set("salePrice", event.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Preço promocional (opcional)</Label>
                <Input value={form.promoPrice} onChange={(event) => set("promoPrice", event.target.value)} placeholder="Ex.: 69,90" />
                <p className="text-[10px] text-muted-foreground font-medium">Quando definido, este é o preço praticado na Loja.</p>
              </div>
            </>
          ) : (
            <p className="sm:col-span-2 text-[11px] font-bold text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2">
              Produto de acervo — sem preço de venda. Marque "Disponível para venda" para vender na Loja e nos eventos.
            </p>
          )}

          <p className="sm:col-span-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-amber-500" /> Estoque & Acervo
          </p>
          <div className="space-y-1.5">
            <Label>Quantidade em estoque</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(event) => set("quantity", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado (conservação)</Label>
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
            <Label>Tamanho</Label>
            <Input value={form.size} onChange={(event) => set("size", event.target.value)} placeholder="P, M, G, 36..." maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input value={form.color} onChange={(event) => set("color", event.target.value)} placeholder="Rosa, branco..." maxLength={60} />
          </div>
          <div className="sm:col-span-2">
            <ImageUploadField
              value={form.photoUrl}
              onChange={(url) => set("photoUrl", url)}
              label="Foto do produto"
              hint="Aparece no catálogo, na Loja do evento e no portal da aluna."
              fallbackIcon={<Shirt size={18} />}
            />
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
            {editing ? "Salvar produto" : "Cadastrar produto"}
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
  const unitPrice = selectedCostume ? effectiveSalePrice(selectedCostume) * (1 - discountNumber / 100) : 0;
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
                    {item.name} — {formatBRL(effectiveSalePrice(item))} ({item.disponivelVenda} disp.)
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
              <Label>Como cobrar</Label>
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
                  {formatBRL(effectiveSalePrice(selectedCostume))} − {discountNumber}% = {formatBRL(unitPrice)}/un
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

// ─── Modal de cobrança da venda (PIX copia-e-cola / link) ────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  asaas: "Asaas (PIX)",
  mercadopago: "Mercado Pago (PIX)",
  infinitepay: "InfinitePay (link PIX/cartão)",
  pixkey: "Chave PIX da escola",
};

export function SaleChargeModal({ sale, onClose }: { sale: any | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [result, setResult] = useState<any>(null);

  const { data: options, isLoading: isLoadingOptions } = trpc.figurinos.salePaymentOptions.useQuery(undefined, {
    enabled: sale !== null,
  });

  const charge = trpc.figurinos.saleCharge.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success("Cobrança gerada!");
      utils.figurinos.sales.invalidate();
      utils.figurinos.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const availableProviders = [
    { id: "asaas", enabled: options?.asaas },
    { id: "mercadopago", enabled: options?.mercadopago },
    { id: "infinitepay", enabled: options?.infinitepay },
    { id: "pixkey", enabled: options?.pixKey },
  ].filter((provider) => provider.enabled);

  return (
    <Dialog open={sale !== null} onOpenChange={(value) => { if (!value) { setResult(null); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <QrCode className="text-indigo-500" size={20} />
            Cobrar venda #{sale?.id}
          </DialogTitle>
        </DialogHeader>

        {sale && (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <p className="text-sm font-black text-foreground">
                {sale.costumeName} ×{sale.quantity} — {formatBRL(sale.totalPrice)}
              </p>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{sale.studentName}</p>
            </div>

            {isLoadingOptions ? (
              <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={22} /></div>
            ) : availableProviders.length === 0 ? (
              <p className="text-xs font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                Nenhuma forma de pagamento configurada. Conecte Asaas, Mercado Pago ou InfinitePay em Configurações → Integrações — ou cadastre uma chave PIX.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    variant={provider.id === options?.defaultProvider ? "default" : "outline"}
                    disabled={charge.isPending}
                    onClick={() => charge.mutate({ id: sale.id, provider: provider.id as any })}
                  >
                    {charge.isPending && charge.variables?.provider === provider.id
                      ? <Loader2 size={14} className="animate-spin mr-1.5" />
                      : <QrCode size={14} className="mr-1.5" />}
                    {PROVIDER_LABEL[provider.id]}
                  </Button>
                ))}
              </div>
            )}

            {result?.pixPayload && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">PIX copia e cola</p>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] font-mono break-all text-muted-foreground line-clamp-4">{result.pixPayload}</p>
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(result.pixPayload);
                      toast.success("PIX copiado! Envie para o aluno.");
                    } catch {
                      toast.error("Não foi possível copiar — selecione o código manualmente.");
                    }
                  }}
                >
                  <Copy size={14} className="mr-1.5" /> Copiar PIX copia e cola
                </Button>
              </div>
            )}

            {result?.encodedImage && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${result.encodedImage}`}
                  alt="QR Code PIX"
                  className="w-52 h-52 rounded-xl border border-border bg-white p-2"
                />
              </div>
            )}

            {result?.paymentLink && (
              <Button variant="outline" className="w-full" onClick={() => window.open(result.paymentLink, "_blank", "noopener,noreferrer")}>
                <ExternalLink size={14} className="mr-1.5" /> Abrir link de pagamento
              </Button>
            )}

            {result?.provider === "pixkey" && (
              <p className="text-[10px] font-bold text-amber-600">
                PIX da chave da escola: a baixa é manual — marque a venda como paga após confirmar o recebimento.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

const PRODUCT_PAGE_SIZE = 12;
const CATALOG_TYPES = ["saia", "collant", "sapatilha", "top", "calca", "acessorio", "uniforme", "outro"];

const CAT_COLORS: Record<string, string> = {
  saia: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30",
  collant: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
  sapatilha: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  top: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
  calca: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  acessorio: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
  uniforme: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  outro: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

/** Payload completo para figurinos.update (bulk/promoções), preservando a peça. */
function buildUpdatePayload(row: any, overrides: Record<string, unknown> = {}) {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    type: row.type,
    size: row.size ?? null,
    color: row.color ?? null,
    quantity: Math.max(1, Number(row.quantity) || 1),
    condition: row.condition,
    cost: Number(row.cost) || 0,
    salePrice: Number(row.salePrice) || 0,
    promoPrice: Number(row.promoPrice) > 0 ? Number(row.promoPrice) : null,
    sellable: row.sellable !== false,
    photoUrl: row.photoUrl ?? null,
    notes: row.notes ?? null,
    ...overrides,
  };
}

function growthPct(current: number, previous: number): { text: string; up: boolean; neutral: boolean } {
  if (previous <= 0) return current > 0 ? { text: "novo", up: true, neutral: false } : { text: "—", up: true, neutral: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? "+" : ""}${pct}%`, up: pct >= 0, neutral: false };
}

const ORDER_TOAST: Record<string, string> = {
  pendente: "Pedido voltou para pendente.",
  em_separacao: "Pedido em separação.",
  pago: "Pedido marcado como pago!",
  entregue: "Pedido entregue!",
  cancelado: "Pedido cancelado.",
};

export default function Figurinos() {
  const [tab, setTab] = useState("produtos");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortKey, setSortKey] = useState("recentes");
  const [view, setView] = useState<"tabela" | "grade">("tabela");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loanStatus, setLoanStatus] = useState("em_uso");
  const [orderStatus, setOrderStatus] = useState("todos");
  const [orderSearch, setOrderSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [editing, setEditing] = useState<CostumeRow | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<CostumeRow | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellItem, setSellItem] = useState<CostumeRow | null>(null);
  const [chargeSale, setChargeSale] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<CostumeRow | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.figurinos.stats.useQuery();
  const { data: costumes = [], isLoading } = trpc.figurinos.list.useQuery({});
  const { data: loans = [], isLoading: isLoadingLoans } = trpc.figurinos.loans.useQuery({ status: loanStatus as any, search: search.trim() || undefined });
  const { data: sales = [], isLoading: isLoadingSales } = trpc.figurinos.sales.useQuery({ status: "todos" as any });

  const updateSaleStatus = trpc.figurinos.updateSaleStatus.useMutation({
    onSuccess: (_, variables) => {
      toast.success(ORDER_TOAST[variables.status] ?? "Pedido atualizado.");
      utils.figurinos.sales.invalidate();
      utils.figurinos.list.invalidate();
      utils.figurinos.storeCatalog.invalidate();
      utils.figurinos.myPurchases.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.figurinos.update.useMutation({
    onSuccess: () => {
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
      toast.success(result.message || "Produto excluído.");
      setDeleting(null);
      utils.figurinos.list.invalidate();
      utils.figurinos.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  // ─── KPIs da Loja (RF-001) ──────────────────────────────────────────────────
  const nowDate = new Date();
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const prevMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);

  const activeProducts = useMemo(() => costumes.filter((c: any) => c.active !== false), [costumes]);
  const validSales = useMemo(() => sales.filter((s: any) => s.status !== "cancelado"), [sales]);
  const paidSales = useMemo(() => sales.filter((s: any) => s.status === "pago" || s.status === "entregue"), [sales]);
  const monthSales = useMemo(() => validSales.filter((s: any) => new Date(s.createdAt) >= monthStart), [validSales, monthStart]);
  const prevMonthSales = useMemo(
    () => validSales.filter((s: any) => new Date(s.createdAt) >= prevMonthStart && new Date(s.createdAt) < monthStart),
    [validSales, prevMonthStart, monthStart],
  );
  const revenueMonth = useMemo(
    () => paidSales.filter((s: any) => new Date(s.paidAt ?? s.createdAt) >= monthStart).reduce((acc: number, s: any) => acc + (Number(s.totalPrice) || 0), 0),
    [paidSales, monthStart],
  );
  const revenuePrevMonth = useMemo(
    () => paidSales.filter((s: any) => { const d = new Date(s.paidAt ?? s.createdAt); return d >= prevMonthStart && d < monthStart; }).reduce((acc: number, s: any) => acc + (Number(s.totalPrice) || 0), 0),
    [paidSales, prevMonthStart, monthStart],
  );
  const pendingOrders = useMemo(() => sales.filter((s: any) => s.status === "pendente" || s.status === "em_separacao").length, [sales]);
  const lowStockProducts = useMemo(() => activeProducts.filter((c: any) => c.sellable && c.disponivelVenda <= 3), [activeProducts]);
  const newProductsMonth = useMemo(() => activeProducts.filter((c: any) => new Date(c.createdAt) >= monthStart).length, [activeProducts, monthStart]);

  const kpis = useMemo(() => ([
    { label: "Total de produtos", icon: Package, iconBg: "bg-indigo-500/10 text-indigo-500", value: String(activeProducts.length), delta: null as any, sub: `${newProductsMonth} novo(s) este mês` },
    { label: "Estoque baixo", icon: AlertTriangle, iconBg: "bg-amber-500/10 text-amber-500", value: String(lowStockProducts.length), delta: null as any, sub: "produtos com estoque crítico" },
    { label: "Vendas do mês", icon: ShoppingBag, iconBg: "bg-emerald-500/10 text-emerald-500", value: String(monthSales.length), delta: growthPct(monthSales.length, prevMonthSales.length), sub: prevMonthSales.length > 0 ? `mês anterior: ${prevMonthSales.length}` : "mês anterior: sem vendas" },
    { label: "Faturamento do mês", icon: Wallet, iconBg: "bg-blue-500/10 text-blue-500", value: formatBRL(revenueMonth), delta: growthPct(revenueMonth, revenuePrevMonth), sub: revenuePrevMonth > 0 ? `mês anterior: ${formatBRL(revenuePrevMonth)}` : "mês anterior: sem vendas pagas" },
    { label: "Pedidos pendentes", icon: Clock, iconBg: "bg-rose-500/10 text-rose-500", value: String(pendingOrders), delta: null as any, sub: "aguardando processamento" },
  ]), [activeProducts, lowStockProducts, monthSales, prevMonthSales, revenueMonth, revenuePrevMonth, pendingOrders, newProductsMonth]);

  // ─── Produtos: busca + filtros + ordenação + paginação (RF-004) ─────────────
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
    let rows = (costumes as any[]).filter((c) => {
      if (q && !(c.name?.toLowerCase().includes(q) || typeLabel(c.type).toLowerCase().includes(q) || c.code?.toLowerCase().includes(q))) return false;
      if (catFilter !== "todas" && c.type !== catFilter) return false;
      if (statusFilter === "ativos" && c.active === false) return false;
      if (statusFilter === "inativos" && c.active !== false) return false;
      return true;
    });
    rows = [...rows];
    if (sortKey === "recentes") rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortKey === "preco_asc") rows.sort((a, b) => effectiveSalePrice(a) - effectiveSalePrice(b));
    else if (sortKey === "preco_desc") rows.sort((a, b) => effectiveSalePrice(b) - effectiveSalePrice(a));
    else if (sortKey === "nome") rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    else if (sortKey === "estoque") rows.sort((a, b) => (a.sellable ? a.disponivelVenda : a.disponivel) - (b.sellable ? b.disponivelVenda : b.disponivel));
    return rows;
  }, [costumes, search, catFilter, statusFilter, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PRODUCT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedProducts = useMemo(
    () => filteredProducts.slice((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE),
    [filteredProducts, safePage],
  );
  const resetPage = () => setPage(1);
  const pageNumbers = useMemo(() => {
    const all = Array.from({ length: pageCount }, (_, i) => i + 1);
    if (pageCount <= 5) return all;
    const window = [safePage - 1, safePage, safePage + 1].filter((p) => p >= 1 && p <= pageCount);
    const result = new Set<number>([1, pageCount, ...window]);
    return all.filter((p) => result.has(p));
  }, [pageCount, safePage]);

  // ─── Seleção em massa (Ativar/Inativar) ────────────────────────────────────
  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every((c: any) => selectedIds.has(c.id));
  const togglePageSelection = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allPageSelected) pagedProducts.forEach((c: any) => next.delete(c.id));
    else pagedProducts.forEach((c: any) => next.add(c.id));
    return next;
  });
  const bulkSetActive = (active: boolean) => {
    const rows = (costumes as any[]).filter((c) => selectedIds.has(c.id));
    if (rows.length === 0) return;
    Promise.all(rows.map((row) => updateMutation.mutateAsync(buildUpdatePayload(row, { active }) as any)))
      .then(() => {
        toast.success(`${rows.length} produto(s) ${active ? "ativado(s)" : "inativado(s)"}.`);
        setSelectedIds(new Set());
      })
      .catch((error: any) => toast.error(error?.message ?? "Falha ao atualizar seleção."));
  };

  // ─── Rail: vendas recentes + mais vendidos (RF-008/RF-009) ─────────────────
  const recentSales = useMemo(() => validSales.slice(0, 6), [validSales]);
  const topProducts = useMemo(() => {
    const map = new Map<number, { name: string; count: number; price: number }>();
    validSales.forEach((s: any) => {
      const cur = map.get(s.costumeId) ?? { name: s.costumeName, count: 0, price: Number(s.unitPrice) || 0 };
      cur.count += Number(s.quantity) || 0;
      map.set(s.costumeId, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [validSales]);

  // ─── Categorias (RF-006) ───────────────────────────────────────────────────
  const categories = useMemo(() => {
    const typeById = new Map<number, string>((costumes as any[]).map((c) => [c.id, c.type]));
    return CATALOG_TYPES.map((type) => {
      const items = activeProducts.filter((c: any) => c.type === type);
      const soldQty = validSales.filter((s: any) => typeById.get(s.costumeId) === type).reduce((acc: number, s: any) => acc + (Number(s.quantity) || 0), 0);
      const avgPrice = items.length > 0 ? items.reduce((acc: number, c: any) => acc + effectiveSalePrice(c), 0) / items.length : 0;
      return { type, count: items.length, units: items.reduce((acc: number, c: any) => acc + (Number(c.quantity) || 0), 0), soldQty, avgPrice };
    });
  }, [activeProducts, validSales, costumes]);

  const goProductsFiltered = (type: string) => { setCatFilter(type); setTab("produtos"); resetPage(); };

  // ─── Pedidos (RF-003) ──────────────────────────────────────────────────────
  const orders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return (sales as any[]).filter((s) => {
      if (orderStatus !== "todos" && s.status !== orderStatus) return false;
      if (q && !((s.orderCode ?? "").toLowerCase().includes(q) || s.costumeName?.toLowerCase().includes(q) || s.studentName?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [sales, orderStatus, orderSearch]);

  const renderEmpty = (icon: any, title: string, subtitle?: string) => (
    <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
      <div className="flex justify-center mb-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary/60">{(() => { const I = icon; return <I size={26} />; })()}</span>
      </div>
      <p className="font-black text-foreground">{title}</p>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );

  const spinner = (
    <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={32} /></div>
  );

  const renderProductThumb = (item: any, size = "h-10 w-10") => (
    <SmartImage
      src={item.photoUrl}
      alt={item.name}
      className={cn(size, "rounded-xl object-cover border border-border")}
      fallback={<span className={cn(size, "flex items-center justify-center rounded-xl bg-primary/10 text-primary/70")}><Shirt size={16} /></span>}
    />
  );

  const renderPrice = (item: any, big = false) => {
    const promo = Number(item.promoPrice) > 0;
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
        {promo && <span className={cn("text-muted-foreground line-through whitespace-nowrap", big ? "text-xs" : "text-[10px]")}>{formatBRL(item.salePrice)}</span>}
        <span className={cn("font-black whitespace-nowrap", big ? "text-base" : "text-sm", promo && "text-emerald-600 dark:text-emerald-400")}>{formatBRL(effectiveSalePrice(item))}</span>
        {promo && big && <Badge variant="outline" className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-1 py-0"><Percent size={8} className="mr-0.5" />Promo</Badge>}
      </div>
    );
  };

  const renderCards = (list: any[], className = "") => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4", className)}>
      {list.map((costume: any, idx: number) => (
        <motion.div key={costume.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }} className="group rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <div className="relative aspect-[4/3] bg-muted/40 overflow-hidden">
            <SmartImage
              src={costume.photoUrl}
              alt={costume.name}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
              fallback={<div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-violet-500/10"><Shirt className="text-primary/30" size={44} /></div>}
            />
            {Number(costume.promoPrice) > 0 && (
              <Badge className="absolute top-2 left-2 bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] font-black border-0"><Percent size={8} className="mr-0.5" />Promo</Badge>
            )}
            {costume.active === false && (
              <Badge className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-700 text-white text-[9px] font-black border-0">Inativo</Badge>
            )}
          </div>
          <div className="p-4 space-y-2.5">
            <div className="min-w-0">
              <h3 className="font-black text-foreground truncate">{costume.name}</h3>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{costume.code ? `SKU: ${costume.code}` : TYPE_LABEL[costume.type] ?? costume.type}</p>
            </div>
            <Badge variant="outline" className={cn("text-[10px] font-black", CAT_COLORS[costume.type] ?? CAT_COLORS.outro)}>
              {TYPE_LABEL[costume.type] ?? costume.type}
            </Badge>
            <div className="flex items-center justify-between">
              {renderPrice(costume, true)}
              {(() => { const st = stockState(costume.sellable ? costume.disponivelVenda : costume.disponivel); return (
                <span className={cn("flex items-center gap-1.5 text-[11px] font-bold", st.text)}>
                  <span className={cn("h-2 w-2 rounded-full", st.dot)} /> {costume.sellable ? costume.disponivelVenda : costume.disponivel}
                </span>
              ); })()}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <Button size="sm" variant="outline" className="flex-1" disabled={costume.disponivel === 0} onClick={() => { setCheckoutItem(costume); setCheckoutOpen(true); }}>
                <ArrowUpRight size={13} className="mr-1" /> Emprestar
              </Button>
              {costume.sellable && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSellItem(costume); setSellOpen(true); }}>
                  <ShoppingBag size={13} className="mr-1" /> Vender
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => { setEditing(costume); setModalOpen(true); }} title="Editar"><Pencil size={14} /></Button>
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(costume)} title="Excluir"><Trash2 size={14} /></Button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const productsTable = (list: any[]) => (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[36px_minmax(0,2fr)_110px_155px_150px_80px_150px] gap-3 px-4 py-3 border-b border-border bg-muted/30">
            <button className="flex items-center" onClick={togglePageSelection}>
              <span className={cn("h-4 w-4 rounded border flex items-center justify-center transition-colors", allPageSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
                {allPageSelected && <CheckCircle2 size={11} />}
              </span>
            </button>
            {["Produto", "Categoria", "Preço", "Estoque", "Status", "Ações"].map((h) => (
              <p key={h} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center">{h}</p>
            ))}
          </div>
          {list.map((costume: any) => {
            const st = stockState(costume.sellable ? costume.disponivelVenda : costume.disponivel);
            const selected = selectedIds.has(costume.id);
            return (
              <div key={costume.id} className={cn("grid grid-cols-[36px_minmax(0,2fr)_110px_155px_150px_80px_150px] gap-3 px-4 py-3 border-b border-border/60 items-center hover:bg-primary/[0.03] transition-colors", selected && "bg-primary/[0.05]")}>
                <button className="flex items-center" onClick={() => toggleSelect(costume.id)}>
                  <span className={cn("h-4 w-4 rounded border flex items-center justify-center transition-colors", selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
                    {selected && <CheckCircle2 size={11} />}
                  </span>
                </button>
                <div className="flex items-center gap-3 min-w-0">
                  {renderProductThumb(costume)}
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground truncate">{costume.name}</p>
                    <p className="text-[11px] font-bold text-muted-foreground">SKU: {costume.code ?? "—"}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn("w-fit text-[10px] font-black", CAT_COLORS[costume.type] ?? CAT_COLORS.outro)}>
                  {TYPE_LABEL[costume.type] ?? costume.type}
                </Badge>
                {renderPrice(costume)}
                <span className={cn("flex items-center gap-2 text-xs font-bold", st.text)}>
                  <span className={cn("h-2 w-2 rounded-full", st.dot)} />
                  <span>{costume.sellable ? costume.disponivelVenda : costume.disponivel}<span className="font-medium opacity-80"> {st.label}</span></span>
                </span>
                <Badge variant="outline" className={cn("w-fit text-[10px] font-black", costume.active === false ? "bg-slate-500/10 text-slate-500 border-slate-500/30" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30")}>
                  {costume.active === false ? "Inativo" : "Ativo"}
                </Badge>
                <div className="flex items-center gap-0.5 justify-end">
                  <Button size="icon" variant="ghost" title="Emprestar" disabled={costume.disponivel === 0} onClick={() => { setCheckoutItem(costume); setCheckoutOpen(true); }}><ArrowUpRight size={15} /></Button>
                  {costume.sellable && (
                    <Button size="icon" variant="ghost" title="Vender" onClick={() => { setSellItem(costume); setSellOpen(true); }}><ShoppingBag size={15} /></Button>
                  )}
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(costume); setModalOpen(true); }}><Pencil size={15} /></Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Excluir" onClick={() => setDeleting(costume)}><Trash2 size={15} /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ── Header (padrão da referência) ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-outfit font-black tracking-tight text-foreground flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25"><Shirt size={22} /></span>
            Loja
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1.5">Venda produtos, figurinos e acessórios da sua escola de dança.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTab("categorias")}><Tags size={16} className="mr-2" /> Categorias</Button>
          <Button variant="outline" onClick={() => setPromoOpen(true)}><Tag size={16} className="mr-2" /> Promoções</Button>
          <Button variant="outline" onClick={() => { setSellItem(null); setSellOpen(true); }}><ShoppingBag size={16} className="mr-2" /> Nova venda</Button>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25"><Plus size={16} className="mr-2" /> Novo produto</Button>
        </div>
      </motion.div>

      {/* ── KPIs (RF-001) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", kpi.iconBg)}><Icon size={18} /></span>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-tight">{kpi.label}</p>
              </div>
              <div className="flex items-end gap-2 mt-3 flex-wrap">
                <p className="text-2xl lg:text-[26px] font-outfit font-black tracking-tight text-foreground leading-none">{kpi.value}</p>
                {kpi.delta && !kpi.delta.neutral && (
                  <span className={cn("flex items-center gap-0.5 text-[11px] font-black", kpi.delta.up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    <TrendingUp size={11} /> {kpi.delta.text}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground mt-1">{kpi.sub}</p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Conteúdo + rail lateral ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(value) => setTab(value)}>
            <TabsList className="w-full sm:w-auto h-auto flex-wrap">
              <TabsTrigger value="produtos"><Shirt size={14} className="mr-1.5" /> Produtos</TabsTrigger>
              <TabsTrigger value="vendas"><ShoppingBag size={14} className="mr-1.5" /> Vendas</TabsTrigger>
              <TabsTrigger value="pedidos"><PackageCheck size={14} className="mr-1.5" /> Pedidos{pendingOrders > 0 && <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white">{pendingOrders}</span>}</TabsTrigger>
              <TabsTrigger value="categorias"><Tags size={14} className="mr-1.5" /> Categorias</TabsTrigger>
              <TabsTrigger value="emprestimos"><ArrowUpRight size={14} className="mr-1.5" /> Empréstimos{stats && stats.atrasados > 0 && <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">{stats.atrasados}</span>}</TabsTrigger>
            </TabsList>

            {/* ── PRODUTOS ── */}
            <TabsContent value="produtos" className="mt-4 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="Buscar por nome do produto, categoria ou SKU..." className="pl-9" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 xl:flex gap-2">
                  <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); resetPage(); }}>
                    <SelectTrigger className="w-full xl:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      {CATALOG_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
                    <SelectTrigger className="w-full xl:w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="inativos">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortKey} onValueChange={(v) => { setSortKey(v); resetPage(); }}>
                    <SelectTrigger className="w-full xl:w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recentes">Mais recentes</SelectItem>
                      <SelectItem value="preco_asc">Menor preço</SelectItem>
                      <SelectItem value="preco_desc">Maior preço</SelectItem>
                      <SelectItem value="nome">Nome (A–Z)</SelectItem>
                      <SelectItem value="estoque">Menor estoque</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 shrink-0 sm:col-span-3 xl:col-span-1 justify-center">
                    <button onClick={() => setView("tabela")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black transition-colors", view === "tabela" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}><List size={13} /> Tabela</button>
                    <button onClick={() => setView("grade")} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black transition-colors", view === "grade" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}><LayoutGrid size={13} /> Grade</button>
                  </div>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                  <p className="text-xs font-black text-foreground">{selectedIds.size} selecionado(s)</p>
                  <Button size="sm" variant="outline" onClick={() => bulkSetActive(true)}>Ativar</Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetActive(false)}>Inativar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
                </div>
              )}

              {isLoading ? spinner : filteredProducts.length === 0 ? (
                search.trim() || catFilter !== "todas" || statusFilter !== "todos" || sortKey !== "recentes" ? (
                  <div className="text-center py-14 rounded-3xl border-2 border-dashed border-border">
                    <div className="flex justify-center mb-3"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Search size={24} /></span></div>
                    <p className="font-black text-foreground">Nenhum produto com esses filtros</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">Ajuste a busca ou limpe os filtros para ver todo o catálogo.</p>
                    <Button size="sm" variant="outline" onClick={() => { setSearch(""); setCatFilter("todas"); setStatusFilter("todos"); setSortKey("recentes"); resetPage(); }}>Limpar filtros</Button>
                  </div>
                ) : (
                  <div className="text-center py-14 rounded-3xl border-2 border-dashed border-border">
                    <div className="flex justify-center mb-3"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500"><PackageOpen size={24} /></span></div>
                    <p className="font-black text-foreground">Catálogo vazio</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">Cadastre seu primeiro produto para vender na Loja e nos eventos.</p>
                    <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25"><Plus size={15} className="mr-2" /> Cadastrar primeiro produto</Button>
                  </div>
                )
              ) : (
                <>
                  {view === "tabela" ? (
                    <>
                      <div className="hidden md:block">{productsTable(pagedProducts)}</div>
                      <div className="md:hidden">{renderCards(pagedProducts)}</div>
                    </>
                  ) : renderCards(pagedProducts)}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                    <p className="text-xs font-bold text-muted-foreground">
                      Mostrando {(safePage - 1) * PRODUCT_PAGE_SIZE + 1}–{Math.min(safePage * PRODUCT_PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length} produtos
                    </p>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={14} /></Button>
                        {pageNumbers.map((p, i) => (
                          <span key={p} className="contents">
                            {i > 0 && p - pageNumbers[i - 1] > 1 && <span className="text-xs text-muted-foreground px-0.5">…</span>}
                            <button onClick={() => setPage(p)} className={cn("h-8 w-8 rounded-lg text-xs font-black transition-colors", p === safePage ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted")}>{p}</button>
                          </span>
                        ))}
                        <Button size="icon" variant="outline" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}><ChevronRight size={14} /></Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── VENDAS ── */}
            <TabsContent value="vendas" className="mt-4 space-y-4">
              <p className="text-[11px] font-bold text-muted-foreground">
                Histórico financeiro das vendas da Loja: cobranças em aberto, valores pagos e cancelamentos. A preparação/entrega fica na aba Pedidos.
              </p>
              {isLoadingSales ? spinner : sales.length === 0 ? renderEmpty(ShoppingBag, "Nenhuma venda registrada", 'Use o botão "Nova venda" para registrar a primeira.') : (
                <div className="space-y-2">
                  {(sales as any[]).map((sale) => {
                    const dims = saleDimensions(sale.status);
                    return (
                      <div key={sale.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground truncate">
                            {sale.orderCode ?? `VDA-${1000 + sale.id}`}
                            <span className="text-muted-foreground font-bold ml-2">{sale.costumeName} ×{sale.quantity}</span>
                            <span className="text-indigo-600 dark:text-indigo-400 ml-2">{formatBRL(sale.totalPrice)}</span>
                          </p>
                          <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                            {sale.studentName}
                            {sale.eventName ? ` · ${sale.eventName}` : ""}
                            {" · "}{new Date(sale.createdAt).toLocaleDateString("pt-BR")}
                            {sale.paymentMode === "mensalidade" ? " · junto com a mensalidade" : " · cobrança avulsa"}
                            {sale.discountPercent > 0 ? ` · desconto ${sale.discountPercent}%` : ""}
                          </p>
                        </div>
                        {sale.madeToOrder && (
                          <Badge variant="outline" className="w-fit text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">Sob encomenda</Badge>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={cn("text-[10px] font-black", dims.payment.className)}>{dims.payment.label}</Badge>
                          {dims.delivery && <Badge variant="outline" className={cn("text-[10px] font-black", dims.delivery.className)}>{dims.delivery.label}</Badge>}
                        </div>
                        {(sale.status === "pendente" || sale.status === "em_separacao") && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setChargeSale(sale)}><QrCode size={13} className="mr-1" /> Cobrar</Button>
                            <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "pago" })} disabled={updateSaleStatus.isPending}><CheckCircle2 size={13} className="mr-1" /> Pago</Button>
                            <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Cancelar venda" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "cancelado" })} disabled={updateSaleStatus.isPending}><X size={15} /></Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── PEDIDOS (RF-003) ── */}
            <TabsContent value="pedidos" className="mt-4 space-y-4">
              <p className="text-[11px] font-bold text-muted-foreground">
                Preparação e entrega dos pedidos: em separação → pago → entregue. Cobranças e histórico financeiro ficam na aba Vendas.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Buscar por código do pedido, produto ou aluna..." className="pl-9" />
                </div>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_separacao">Em separação</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isLoadingSales ? spinner : orders.length === 0 ? renderEmpty(PackageCheck, "Nenhum pedido neste filtro", "Pedidos aparecem aqui assim que uma venda é registrada.") : (
                <div className="space-y-2">
                  {orders.map((sale: any) => {
                    const dims = saleDimensions(sale.status);
                    return (
                      <div key={sale.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><PackageCheck size={18} /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground flex flex-wrap items-center gap-2">
                            {sale.orderCode ?? `VDA-${1000 + sale.id}`}
                            <Badge variant="outline" className={cn("text-[10px] font-black", dims.payment.className)}>{dims.payment.label}</Badge>
                            {dims.delivery && <Badge variant="outline" className={cn("text-[10px] font-black", dims.delivery.className)}>{dims.delivery.label}</Badge>}
                          </p>
                          <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                            {sale.costumeName} ×{sale.quantity} · {sale.studentName} · {new Date(sale.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <p className="text-sm font-black text-foreground lg:text-right">{formatBRL(sale.totalPrice)}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sale.status === "pendente" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setChargeSale(sale)}><QrCode size={12} className="mr-1" /> Cobrar</Button>
                              <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "em_separacao" })} disabled={updateSaleStatus.isPending}><Truck size={12} className="mr-1" /> Em separação</Button>
                            </>
                          )}
                          {(sale.status === "pendente" || sale.status === "em_separacao") && (
                            <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "pago" })} disabled={updateSaleStatus.isPending}><CheckCircle2 size={12} className="mr-1" /> Pago</Button>
                          )}
                          {sale.status === "pago" && (
                            <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "entregue" })} disabled={updateSaleStatus.isPending}><PackageCheck size={12} className="mr-1" /> Entregar</Button>
                          )}
                          {sale.status !== "entregue" && sale.status !== "cancelado" && (
                            <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Cancelar pedido" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "cancelado" })} disabled={updateSaleStatus.isPending}><X size={15} /></Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── CATEGORIAS (RF-006) ── */}
            <TabsContent value="categorias" className="mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                {categories.map((cat) => (
                  <button key={cat.type} onClick={() => goProductsFiltered(cat.type)} className={cn("text-left rounded-2xl border border-border bg-card p-4 space-y-2 hover:-translate-y-1 hover:shadow-lg transition-all duration-300", cat.count === 0 && "opacity-50")}>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn("text-[10px] font-black", CAT_COLORS[cat.type] ?? CAT_COLORS.outro)}>{TYPE_LABEL[cat.type] ?? cat.type}</Badge>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-outfit font-black tracking-tight text-foreground">
                      {cat.count} <span className="text-xs font-bold text-muted-foreground">produto(s)</span>
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground">{cat.units} unid. · {cat.soldQty} vendido(s) · ticket médio {formatBRL(cat.avgPrice)}</p>
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* ── EMPRÉSTIMOS ── */}
            <TabsContent value="emprestimos" className="mt-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={loanStatus} onValueChange={setLoanStatus}>
                  <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_uso">Em uso</SelectItem>
                    <SelectItem value="atrasado">Atrasados</SelectItem>
                    <SelectItem value="devolvido">Devolvidos</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => { setCheckoutItem(null); setCheckoutOpen(true); }}><Plus size={15} className="mr-1.5" /> Novo empréstimo</Button>
              </div>
              {isLoadingLoans ? spinner : loans.length === 0 ? renderEmpty(ArrowUpRight, "Nenhum empréstimo neste filtro") : (
                <div className="space-y-2">
                  {loans.map((loan: any) => {
                    const statusMeta = LOAN_STATUS_META[loan.situacao] ?? LOAN_STATUS_META.em_uso;
                    return (
                      <div key={loan.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground truncate">{loan.costumeName} <span className="text-muted-foreground font-bold">×{loan.quantity}</span></p>
                          <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                            {loan.studentName}
                            {loan.coreografiaTitle ? ` · ${loan.coreografiaTitle}` : ""}
                            {loan.dueDate ? ` · devolver até ${formatDateOnly(loan.dueDate)}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("w-fit text-[10px] font-black", statusMeta.className)}>{statusMeta.label}</Badge>
                        {!loan.returnedAt && (
                          <Button size="sm" variant="outline" onClick={() => checkin.mutate({ loanId: loan.id })} disabled={checkin.isPending}><ArrowDownLeft size={14} className="mr-1.5" /> Registrar devolução</Button>
                        )}
                        {loan.returnedAt && (
                          <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} /> Devolvido em {new Date(loan.returnedAt).toLocaleDateString("pt-BR")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Rail (RF-008/RF-009) ── */}
        <aside className="hidden xl:flex flex-col gap-4">
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-black text-foreground flex items-center gap-2"><History size={15} className="text-primary" /> Vendas recentes</p>
              <button onClick={() => setTab("vendas")} className="text-[11px] font-black text-primary hover:underline">Ver todas</button>
            </div>
            {recentSales.length === 0 ? (
              <p className="text-xs text-muted-foreground font-bold py-4 text-center">Sem vendas ainda.</p>
            ) : (
              <div className="space-y-2.5">
                {recentSales.map((sale: any) => {
                  const statusMeta = SALE_STATUS_META[sale.status] ?? SALE_STATUS_META.pendente;
                  return (
                    <div key={sale.id} className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary/80"><Shirt size={15} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{sale.costumeName}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{sale.orderCode ?? `VDA-${1000 + sale.id}`} · {new Date(sale.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-foreground">{formatBRL(sale.totalPrice)}</p>
                        <Badge variant="outline" className={cn("text-[9px] font-black px-1 py-0", statusMeta.className)}>{statusMeta.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-black text-foreground flex items-center gap-2"><TrendingUp size={15} className="text-emerald-500" /> Produtos mais vendidos</p>
              <button onClick={() => setTab("produtos")} className="text-[11px] font-black text-primary hover:underline">Ver produtos</button>
            </div>
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground font-bold py-4 text-center">Sem vendas para o ranking.</p>
            ) : (
              <div className="space-y-2.5">
                {topProducts.map((prod, idx) => (
                  <div key={prod.name} className="flex items-center gap-2.5">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black", idx === 0 ? "bg-amber-400/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-foreground truncate">{prod.name}</p>
                      <p className="text-[10px] font-bold text-muted-foreground">{prod.count} venda(s)</p>
                    </div>
                    <p className="text-xs font-black text-foreground shrink-0">{formatBRL(prod.price)}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </aside>
      </div>

      {/* ── Modais ── */}
      {modalOpen && <CostumeModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} />}
      {checkoutOpen && <CheckoutModal open={checkoutOpen} onClose={() => { setCheckoutOpen(false); setCheckoutItem(null); }} preselected={checkoutItem} />}
      {sellOpen && <SellModal open={sellOpen} onClose={() => { setSellOpen(false); setSellItem(null); }} preselected={sellItem} />}
      <SaleChargeModal sale={chargeSale} onClose={() => setChargeSale(null)} />
      {promoOpen && <PromocoesModal open={promoOpen} onClose={() => setPromoOpen(false)} costumes={costumes as any[]} />}

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>"{deleting?.name}" será removido da Loja. Produtos com histórico de vendas/empréstimos são arquivados em vez de excluídos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** ─── Modal de Promoções (RF-007): define/remove preço promocional ─── */
function PromocoesModal({ open, onClose, costumes }: { open: boolean; onClose: () => void; costumes: CostumeRow[] }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const update = trpc.figurinos.update.useMutation({
    onSuccess: () => {
      toast.success("Promoção atualizada!");
      utils.figurinos.list.invalidate();
      utils.figurinos.storeCatalog.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const sellable = (costumes as any[]).filter((c) => c.active !== false && c.sellable);
  const draftFor = (item: any) => drafts[item.id] ?? (item.promoPrice != null && Number(item.promoPrice) > 0 ? String(item.promoPrice) : "");
  const save = (item: any) => {
    const raw = draftFor(item).trim();
    const value = raw ? Math.max(0, parseFloat(raw.replace(",", ".")) || 0) : null;
    update.mutate(buildUpdatePayload(item, { promoPrice: value }) as any);
  };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag size={18} className="text-emerald-500" /> Promoções da Loja</DialogTitle>
          <p className="text-xs text-muted-foreground font-medium">Defina um preço promocional por produto — ele passa a ser o preço praticado nas vendas. Deixe vazio para remover.</p>
        </DialogHeader>
        {sellable.length === 0 ? (
          <p className="text-sm text-muted-foreground font-bold py-6 text-center">Nenhum produto vendável cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {sellable.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-border p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-foreground truncate">{item.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">Preço cheio: {formatBRL(item.salePrice)}{Number(item.promoPrice) > 0 ? ` · promo ativa: ${formatBRL(item.promoPrice)}` : ""}</p>
                </div>
                <Input value={drafts[item.id] ?? draftFor(item)} onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))} placeholder="Promo (R$)" className="w-28" inputMode="decimal" />
                <Button size="sm" onClick={() => save(item)} disabled={update.isPending} className="bg-emerald-600 hover:bg-emerald-700">Salvar</Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
