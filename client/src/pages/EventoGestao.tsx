import { useMemo, useState } from "react";
import { useParams, useLocation, Redirect } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { format, formatEventPeriod, eventSituation } from "@/lib/dates";
import {
  Theater, Users, Music, Shirt, FileText, LayoutDashboard, ArrowLeft, CalendarDays,
  MapPin, CheckCircle2, Clock, TrendingUp, Pencil, Copy, Send, X, UserPlus,
  ShieldCheck, Search, Plus, Loader2, Trash2, ArrowUp, ArrowDown, ShoppingCart,
  QrCode, PackageCheck, ArrowUpRight, Download, Ticket, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EVENT_TYPE_LABEL, EVENT_STATUS_META, EVENT_PAYMENT_META, EVENT_DELIVERY_META,
  PARTICIPANT_STATUS_META, EventoModal,
} from "@/components/eventos/EventoModal";
import { SaleChargeModal } from "./Figurinos";
import { SmartImage } from "@/components/common/SmartImage";

/** Deriva as duas dimensões a partir do status único da venda. */
function saleDimensions(status: string): { payment: { label: string; className: string }; delivery: { label: string; className: string } | null } {
  if (status === "cancelado") {
    return { payment: EVENT_PAYMENT_META.cancelado, delivery: null };
  }
  const payment = status === "pago" || status === "entregue" ? EVENT_PAYMENT_META.pago : EVENT_PAYMENT_META.pendente;
  const delivery = status === "em_separacao" ? EVENT_DELIVERY_META.em_separacao : status === "entregue" ? EVENT_DELIVERY_META.entregue : null;
  return { payment, delivery };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EventoGestao() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const eventId = params?.id ? Number(params.id) : NaN;
  const hasId = Number.isFinite(eventId) && eventId > 0;

  const abaFromUrl = typeof window !== "undefined" && window.location.hash.includes("aba=")
    ? window.location.hash.split("aba=")[1]
    : "";
  const [tab, setTab] = useState(["visao", "participantes", "programa", "loja", "relatorios"].includes(abaFromUrl) ? abaFromUrl : "visao");

  const [modalOpen, setModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [filterModalidade, setFilterModalidade] = useState("none");
  const [filterTurma, setFilterTurma] = useState("none");
  const [filterCoreografia, setFilterCoreografia] = useState("none");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ status: "realizado" | "cancelado"; label: string } | null>(null);
  const [chargeSale, setChargeSale] = useState<any | null>(null);

  const [sellOpen, setSellOpen] = useState(false);
  const [sellCostumeId, setSellCostumeId] = useState("");
  const [sellStudentId, setSellStudentId] = useState("");
  const [sellQuantity, setSellQuantity] = useState("1");
  const [sellPaymentMode, setSellPaymentMode] = useState("mensalidade");
  const [sellNotes, setSellNotes] = useState("");

  const { data: modalidades = [] } = trpc.instruments.list.useQuery();
  const { data: turmasAtivas = [] } = trpc.turmas.list.useQuery({ status: "ativa" });
  const { data: coreografiasTodas = [] } = trpc.coreografias.list.useQuery({});

  const { data: candidates = [], isLoading: isLoadingCandidates } = trpc.eventos.candidatesForEvent.useQuery(
    {
      eventId: hasId ? eventId : 0,
      modalidadeId: filterModalidade === "none" ? undefined : Number(filterModalidade),
      turmaId: filterTurma === "none" ? undefined : Number(filterTurma),
      coreografiaId: filterCoreografia === "none" ? undefined : Number(filterCoreografia),
    },
    { enabled: hasId }
  );

  const turmasFiltradas = (turmasAtivas as any[]).filter((turma) =>
    filterModalidade === "none" ? true : String(turma.modalidadeId) === filterModalidade
  );
  const availableCandidates = (candidates as any[]).filter((candidate) => !candidate.alreadyIn);

  const { data: storeCatalog = [] } = trpc.figurinos.storeCatalog.useQuery(
    { eventId: hasId ? eventId : undefined },
    { enabled: hasId }
  );
  const { data: sales = [] } = trpc.figurinos.sales.useQuery(
    { eventId: hasId ? eventId : undefined, status: "todos" as any },
    { enabled: hasId }
  );

  const { data, isLoading } = trpc.eventos.getById.useQuery(
    { id: eventId },
    { enabled: hasId }
  );

  const { data: coreografiasDisponiveis = [] } = trpc.eventos.coreografiasDisponiveis.useQuery(
    { eventId: hasId ? eventId : undefined },
    { enabled: hasId }
  );

  const { data: searchResults = [] } = trpc.eventos.searchAlunos.useQuery(
    { q: studentSearch, eventId: hasId ? eventId : undefined },
    { enabled: hasId && studentSearch.trim().length >= 2 }
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.eventos.getById.invalidate({ id: eventId });
    utils.eventos.list.invalidate();
    utils.eventos.stats.invalidate();
  };

  const sell = trpc.figurinos.sell.useMutation({
    onSuccess: (result) => {
      toast.success(`Venda registrada! Pedido ${result.orderCode ?? ""} · Total ${formatBRL(result.totalPrice)}`);
      setSellOpen(false);
      utils.figurinos.storeCatalog.invalidate();
      utils.figurinos.sales.invalidate();
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateSaleStatus = trpc.figurinos.updateSaleStatus.useMutation({
    onSuccess: () => {
      toast.success("Venda atualizada!");
      utils.figurinos.storeCatalog.invalidate();
      utils.figurinos.sales.invalidate();
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const linkCoreografia = trpc.eventos.linkCoreografia.useMutation({
    onSuccess: (result: any) => {
      toast.success(result?.castImported
        ? `Coreografia vinculada + ${result.castImported} aluno(s) do elenco importado(s)!`
        : "Coreografia vinculada!");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const importCast = trpc.eventos.importCast.useMutation({
    onSuccess: (result) => {
      toast.success(result.added > 0
        ? `${result.added} aluno(s) do elenco importado(s)!`
        : "Todos os alunos do elenco já estão no evento.");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reorderCoreografia = trpc.eventos.reorderCoreografia.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const unlinkCoreografia = trpc.eventos.unlinkCoreografia.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const addParticipant = trpc.eventos.addParticipant.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.added} aluno(s) adicionado(s)!`);
      setStudentSearch("");
      setSelectedCandidateIds([]);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateParticipant = trpc.eventos.updateParticipant.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const removeParticipant = trpc.eventos.removeParticipant.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const setStatusMut = trpc.eventos.setStatus.useMutation({
    onSuccess: (_, variables) => {
      const msg: Record<string, string> = {
        confirmado: "Evento publicado e confirmado!",
        planejado: "Evento voltou para rascunho.",
        realizado: "Evento encerrado como realizado!",
        cancelado: "Evento cancelado.",
      };
      toast.success(msg[variables.status] ?? "Status atualizado.");
      setConfirmAction(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicateMut = trpc.eventos.duplicate.useMutation({
    onSuccess: (result: any) => {
      toast.success("Evento duplicado como rascunho — edite a data e publique.");
      if (result?.id) setLocation(`/eventos/${result.id}`);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.eventos.delete.useMutation({
    onSuccess: () => {
      toast.success("Evento excluído.");
      setLocation("/eventos");
    },
    onError: (error) => toast.error(error.message),
  });

  const participantes = data?.participantes ?? [];
  const coreografiasVinculadas = data?.coreografias ?? [];
  const confirmados = participantes.filter((p: any) => p.status === "confirmado").length;
  const recusados = participantes.filter((p: any) => p.status === "recusado").length;
  const autorizCompletas = participantes.filter((p: any) => p.imageAuthorization && p.participationAuthorization).length;
  const autorizPendentes = participantes.filter((p: any) => !(p.imageAuthorization && p.participationAuthorization)).length;
  const vendasValidas = (sales as any[]).filter((s) => s.status !== "cancelado");
  const receitaPrevista = vendasValidas.reduce((acc, s) => acc + (Number(s.totalPrice) || 0), 0);
  const receitaArrecadada = vendasValidas.filter((s) => s.status === "pago" || s.status === "entregue").reduce((acc, s) => acc + (Number(s.totalPrice) || 0), 0);
  const vendasQty = vendasValidas.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);

  const statusMeta = EVENT_STATUS_META[data?.status ?? "planejado"] ?? EVENT_STATUS_META.planejado;
  const situation = eventSituation(data?.startsAt, data?.endsAt);

  const changeTab = (next: string) => {
    setTab(next);
    window.history.replaceState(null, "", `/eventos/${eventId}?aba=${next}`);
  };

  const relatorioParticipantesCsv = () => {
    const rows: string[][] = [["Aluno", "Status", "Autorização de participação", "Autorização de imagem"]];
    for (const p of participantes as any[]) {
      rows.push([p.studentName, PARTICIPANT_STATUS_META[p.status]?.label ?? p.status, p.participationAuthorization ? "Sim" : "Não", p.imageAuthorization ? "Sim" : "Não"]);
    }
    downloadCsv(`participantes-evento-${eventId}.csv`, rows);
  };

  const relatorioVendasCsv = () => {
    const rows: string[][] = [["Pedido", "Produto", "Aluno", "Qtd", "Total", "Pagamento", "Entrega"]];
    for (const s of sales as any[]) {
      const dims = saleDimensions(s.status);
      rows.push([s.orderCode ?? `VDA-${1000 + s.id}`, s.costumeName, s.studentName, String(s.quantity), formatBRL(s.totalPrice), dims.payment.label.replace("Pagamento: ", ""), dims.delivery?.label ?? "—"]);
    }
    downloadCsv(`vendas-evento-${eventId}.csv`, rows);
  };

  const vendasPorProduto = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const s of vendasValidas) {
      const cur = map.get(s.costumeName) ?? { qty: 0, total: 0 };
      cur.qty += Number(s.quantity) || 0;
      cur.total += Number(s.totalPrice) || 0;
      map.set(s.costumeName, cur);
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [sales]);

  if (!hasId) return <Redirect to="/eventos" />;

  return (
    <div className="flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <button onClick={() => setLocation("/eventos")} className="flex items-center gap-1.5 text-xs font-black text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={13} /> Voltar aos eventos
        </button>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
              <Theater size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl lg:text-3xl font-outfit font-black tracking-tight text-foreground truncate">{data?.name ?? "Evento"}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge variant="outline" className={cn("text-[10px] font-black", statusMeta.className)}>{statusMeta.label}</Badge>
                <Badge variant="outline" className={cn("text-[10px] font-black", situation.className)} title="Calculado pelas datas do evento">{situation.label}</Badge>
                <Badge variant="outline" className="text-[10px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">{EVENT_TYPE_LABEL[data?.type ?? "recital"] ?? data?.type}</Badge>
              </div>
              <p className="text-[11px] font-bold text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                <CalendarDays size={12} /> {formatEventPeriod(data?.startsAt, data?.endsAt)}
                {data?.venueName && <><span className="opacity-40">·</span><MapPin size={12} /> {data.venueName}</>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" onClick={() => setModalOpen(true)}><Pencil size={15} className="mr-2" /> Editar</Button>
            <Button variant="outline" onClick={() => duplicateMut.mutate({ id: eventId })} disabled={duplicateMut.isPending}><Copy size={15} className="mr-2" /> Duplicar</Button>
            {data?.status === "planejado" && (
              <Button onClick={() => setStatusMut.mutate({ id: eventId, status: "confirmado" })} disabled={setStatusMut.isPending} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25"><Send size={15} className="mr-2" /> Publicar evento</Button>
            )}
            {(data?.status === "planejado" || data?.status === "confirmado") && (
              <>
                <Button variant="outline" onClick={() => setConfirmAction({ status: "realizado", label: "Encerrar como realizado" })}><CheckCircle2 size={15} className="mr-2" /> Encerrar</Button>
                <Button variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setConfirmAction({ status: "cancelado", label: "Cancelar evento" })}><Ban size={15} className="mr-2" /> Cancelar</Button>
              </>
            )}
            {data?.status === "cancelado" && (
              <Button variant="outline" onClick={() => setStatusMut.mutate({ id: eventId, status: "confirmado" })} disabled={setStatusMut.isPending}><CheckCircle2 size={15} className="mr-2" /> Reativar</Button>
            )}
          </div>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList className="w-full sm:w-auto h-auto flex-wrap">
            <TabsTrigger value="visao"><LayoutDashboard size={13} className="mr-1.5" /> Visão geral</TabsTrigger>
            <TabsTrigger value="participantes"><Users size={13} className="mr-1.5" /> Participações ({participantes.length})</TabsTrigger>
            <TabsTrigger value="programa"><Music size={13} className="mr-1.5" /> Programação ({coreografiasVinculadas.length})</TabsTrigger>
            <TabsTrigger value="loja"><Shirt size={13} className="mr-1.5" /> Loja ({sales.length})</TabsTrigger>
            <TabsTrigger value="relatorios"><FileText size={13} className="mr-1.5" /> Relatórios</TabsTrigger>
          </TabsList>

          {/* ── VISÃO GERAL ── */}
          <TabsContent value="visao" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {[
                { label: "Período", value: formatEventPeriod(data?.startsAt, data?.endsAt), icon: CalendarDays, tint: "bg-indigo-500/10 text-indigo-500", note: data?.endsAt ? "evento de vários dias" : "dia único" },
                { label: "Local", value: data?.venueName ?? "—", icon: MapPin, tint: "bg-blue-500/10 text-blue-500", note: data?.venueAddress ?? "sem endereço" },
                { label: "Participações", value: `${confirmados} de ${participantes.length}`, icon: Users, tint: "bg-purple-500/10 text-purple-500", note: `${recusados} recusado(s) · ${participantes.length - confirmados - recusados} sem resposta` },
                { label: "Autorizações", value: `${autorizCompletas} completas`, icon: ShieldCheck, tint: "bg-emerald-500/10 text-emerald-500", note: data?.requiresAuthorization ? `${autorizPendentes} pendente(s)` : "evento sem autorização exigida" },
                { label: "Vendas da loja", value: `${vendasQty} item(ns)`, icon: Shirt, tint: "bg-teal-500/10 text-teal-500", note: `${sales.length} pedido(s) registrado(s)` },
                { label: "Receita da loja", value: formatBRL(receitaArrecadada), icon: TrendingUp, tint: "bg-amber-500/10 text-amber-500", note: receitaPrevista > 0 ? `prevista: ${formatBRL(receitaPrevista)}` : "sem vendas" },
              ].map((tile, idx) => {
                const TileIcon = tile.icon;
                return (
                  <motion.div key={tile.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tile.tint)}><TileIcon size={16} /></span>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{tile.label}</p>
                    </div>
                    <p className="text-lg lg:text-xl font-outfit font-black text-foreground mt-2 truncate">{tile.value}</p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5 truncate">{tile.note}</p>
                  </motion.div>
                );
              })}
            </div>

            {data?.description && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Descrição / Orientações</p>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed whitespace-pre-line">{data.description}</p>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Como o status funciona</p>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                O <span className="font-black text-foreground">status</span> ({statusMeta.label}) é o workflow manual — Rascunho e Confirmado no formulário; Encerrar e Cancelar por ação. A <span className="font-black text-foreground">situação</span> ({situation.label}) é calculada automaticamente pelas datas: Futuro (antes do início), Em andamento (entre início e término) e Datas encerradas (após o término).
              </p>
            </div>
          </TabsContent>

          {/* ── PARTICIPAÇÕES ── */}
          <TabsContent value="participacoes" className="mt-4 space-y-3">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <UserPlus size={13} /> Adicionar por filtro (turma, modalidade ou coreografia)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select
                  value={filterModalidade}
                  onValueChange={(value) => { setFilterModalidade(value); setFilterTurma("none"); setSelectedCandidateIds([]); }}
                >
                  <SelectTrigger className="h-10 text-xs bg-background"><SelectValue placeholder="Modalidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas as modalidades</SelectItem>
                    {(modalidades as any[]).map((modalidade) => (
                      <SelectItem key={modalidade.id} value={String(modalidade.id)}>{modalidade.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filterTurma}
                  onValueChange={(value) => { setFilterTurma(value); setSelectedCandidateIds([]); }}
                >
                  <SelectTrigger className="h-10 text-xs bg-background"><SelectValue placeholder="Turma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas as turmas</SelectItem>
                    {turmasFiltradas.map((turma: any) => (
                      <SelectItem key={turma.id} value={String(turma.id)}>{turma.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filterCoreografia}
                  onValueChange={(value) => { setFilterCoreografia(value); setSelectedCandidateIds([]); }}
                >
                  <SelectTrigger className="h-10 text-xs bg-background"><SelectValue placeholder="Coreografia" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas as coreografias</SelectItem>
                    {(coreografiasTodas as any[]).map((coreografia) => (
                      <SelectItem key={coreografia.id} value={String(coreografia.id)}>{coreografia.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border border-border bg-card max-h-60 overflow-y-auto">
                {isLoadingCandidates ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={20} /></div>
                ) : (candidates as any[]).length === 0 ? (
                  <p className="text-xs font-bold text-muted-foreground text-center py-6">
                    Nenhum aluno ativo encontrado com esses filtros.
                  </p>
                ) : (
                  (candidates as any[]).map((candidate) => (
                    <label
                      key={candidate.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/40 transition-colors",
                        candidate.alreadyIn && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Checkbox
                        disabled={candidate.alreadyIn}
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCandidateIds((prev) =>
                            checked ? [...prev, candidate.id] : prev.filter((id) => id !== candidate.id)
                          );
                        }}
                      />
                      <span className="text-sm font-bold text-foreground flex-1 truncate">{candidate.name}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">
                        {candidate.instrumentName || "—"}
                      </span>
                      {candidate.alreadyIn && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">No evento</span>
                      )}
                    </label>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = availableCandidates.length > 0 && selectedCandidateIds.length === availableCandidates.length;
                    setSelectedCandidateIds(allSelected ? [] : availableCandidates.map((candidate: any) => candidate.id));
                  }}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {availableCandidates.length > 0 && selectedCandidateIds.length === availableCandidates.length
                    ? "Limpar seleção"
                    : `Selecionar todos disponíveis (${availableCandidates.length})`}
                </button>
                <Button
                  size="sm"
                  disabled={selectedCandidateIds.length === 0 || addParticipant.isPending}
                  onClick={() => {
                    if (!hasId) return;
                    addParticipant.mutate({ eventId, studentIds: selectedCandidateIds });
                    setSelectedCandidateIds([]);
                  }}
                  className="shadow-md shadow-indigo-500/20"
                >
                  {addParticipant.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                  Adicionar selecionados ({selectedCandidateIds.length})
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="Buscar aluno ativo para adicionar..."
                className="pl-9"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((student: any) => (
                    <button
                      key={student.id}
                      onClick={() => {
                        if (!hasId) return;
                        addParticipant.mutate({ eventId, studentIds: [student.id] });
                        setStudentSearch("");
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {student.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {participantes.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
                <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Users size={22} /></span></div>
                <p className="font-black text-foreground text-sm">Nenhum participante ainda</p>
                <p className="text-xs text-muted-foreground mt-1">Adicione por filtro, busca ou importando o elenco na aba Programação.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {participantes.map((participante: any) => {
                  const isMinor = participante.birthDate
                    ? (Date.now() - new Date(participante.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000) < 18
                    : false;
                  const fullyAuthorized = participante.imageAuthorization && participante.participationAuthorization;
                  return (
                    <div key={participante.id} className="rounded-2xl border border-border bg-card p-3.5 flex flex-col xl:flex-row xl:items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="w-10 h-10 shrink-0">
                          {participante.studentAvatar ? (
                            <img src={participante.studentAvatar} alt={participante.studentName} className="w-full h-full object-cover" />
                          ) : (
                            <AvatarFallback className="bg-indigo-600 text-white text-xs font-black">
                              {participante.studentName?.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground truncate flex items-center gap-2">
                            {participante.studentName}
                            {isMinor && <Badge variant="outline" className="text-[9px] font-black">MENOR</Badge>}
                          </p>
                          {data?.requiresAuthorization && (
                            <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
                              {fullyAuthorized ? (
                                <><ShieldCheck size={12} className="text-emerald-500" /> Autorizações em dia</>
                              ) : (
                                <><Clock size={12} className="text-amber-500" /> Autorização pendente</>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {data?.requiresAuthorization && (
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none rounded-lg border border-border px-2.5 py-1.5 bg-background">
                            <Checkbox
                              checked={participante.participationAuthorization}
                              onCheckedChange={(checked) => updateParticipant.mutate({ id: participante.id, participationAuthorization: checked === true })}
                            />
                            Participação
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none rounded-lg border border-border px-2.5 py-1.5 bg-background">
                            <Checkbox
                              checked={participante.imageAuthorization}
                              onCheckedChange={(checked) => updateParticipant.mutate({ id: participante.id, imageAuthorization: checked === true })}
                            />
                            Imagem
                          </label>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Select
                          value={participante.status}
                          onValueChange={(value) => updateParticipant.mutate({ id: participante.id, status: value as any })}
                        >
                          <SelectTrigger className="w-[140px] h-9 text-xs bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(PARTICIPANT_STATUS_META).map(([value, meta]) => (
                              <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => removeParticipant.mutate({ id: participante.id })} title="Remover participante">
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── PROGRAMAÇÃO ── */}
          <TabsContent value="programa" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Music size={13} /> Coreografias no programa
              </p>
              {coreografiasVinculadas.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] font-black"
                  disabled={importCast.isPending}
                  onClick={() => importCast.mutate({ eventId })}
                  title="Adiciona ao evento todos os alunos do elenco das coreografias vinculadas"
                >
                  {importCast.isPending ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <UserPlus size={12} className="mr-1.5" />}
                  Importar elenco
                </Button>
              )}
            </div>

            <Select
              value=""
              onValueChange={(value) => {
                if (!value) return;
                linkCoreografia.mutate({ eventId, coreografiaId: Number(value) });
              }}
            >
              <SelectTrigger className="h-11"><SelectValue placeholder="Vincular coreografia..." /></SelectTrigger>
              <SelectContent>
                {coreografiasDisponiveis.length === 0 && (
                  <SelectItem value="__none" disabled>Nenhuma coreografia disponível</SelectItem>
                )}
                {coreografiasDisponiveis.map((coreografia: any) => (
                  <SelectItem key={coreografia.id} value={String(coreografia.id)}>{coreografia.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {coreografiasDisponiveis.length === 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex-1">
                  Nenhuma coreografia disponível para vincular. Crie suas coreografias na página própria primeiro.
                </p>
                <Button size="sm" variant="outline" onClick={() => setLocation("/coreografias")}><ArrowUpRight size={12} className="mr-1.5" /> Ir para Coreografias</Button>
              </div>
            )}

            {coreografiasVinculadas.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
                <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Music size={22} /></span></div>
                <p className="font-black text-foreground text-sm">Nenhuma coreografia vinculada ainda</p>
                <p className="text-xs text-muted-foreground mt-1">Vincule pelo seletor acima — o elenco pode ser importado automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {coreografiasVinculadas.map((coreografia: any) => (
                  <div key={coreografia.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:shadow-md transition-shadow">
                    <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                      {coreografia.ordem}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{coreografia.title}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{coreografia.formacao}</p>
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 shrink-0">
                      <button
                        type="button"
                        className="p-1.5 text-muted-foreground hover:text-indigo-600 disabled:opacity-30 rounded-md hover:bg-background transition-colors"
                        disabled={reorderCoreografia.isPending || coreografia.ordem <= 1}
                        onClick={() => reorderCoreografia.mutate({ id: coreografia.id, direction: "up" })}
                        title="Subir no programa"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 text-muted-foreground hover:text-indigo-600 disabled:opacity-30 rounded-md hover:bg-background transition-colors"
                        disabled={reorderCoreografia.isPending || coreografia.ordem >= coreografiasVinculadas.length}
                        onClick={() => reorderCoreografia.mutate({ id: coreografia.id, direction: "down" })}
                        title="Descer no programa"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => unlinkCoreografia.mutate({ id: coreografia.id })} title="Remover do evento">
                      <X size={15} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── LOJA DO EVENTO ── */}
          <TabsContent value="loja" className="mt-4 space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground">
              Venda produtos da Loja vinculados a este evento. A receita aparece na Visão geral e nos Relatórios.
            </p>
            {storeCatalog.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
                <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Shirt size={22} /></span></div>
                <p className="font-black text-foreground text-sm">Nenhum produto disponível</p>
                <p className="text-xs text-muted-foreground mt-1">Cadastre produtos com preço de venda na aba Produtos da Loja.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setLocation("/loja")}><ArrowUpRight size={12} className="mr-1.5" /> Ir para a Loja</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {(storeCatalog as any[]).map((product) => {
                  const esgotado = product.disponivelVenda === 0;
                  const promo = product.promoPrice != null && product.promoPrice > 0;
                  return (
                    <div key={product.id} className="rounded-2xl border border-border bg-card p-3 space-y-2 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-2.5">
                        <SmartImage
                          src={product.photoUrl}
                          alt={product.name}
                          className="h-9 w-9 rounded-lg object-cover border border-border shrink-0"
                          fallback={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary/70"><Shirt size={14} /></span>}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground truncate">{product.name}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {product.size ? `Tam. ${product.size}` : ""}{product.color ? ` · ${product.color}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {promo && <span className="text-[10px] text-muted-foreground line-through">{formatBRL(product.salePrice)}</span>}
                          <span className={cn("text-sm font-black", promo && "text-emerald-600 dark:text-emerald-400")}>
                            {formatBRL(promo ? product.promoPrice : product.salePrice)}
                          </span>
                          {promo && <Badge variant="outline" className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-1 py-0">Promo</Badge>}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={esgotado}
                          onClick={() => {
                            setSellCostumeId(String(product.id));
                            setSellStudentId("");
                            setSellQuantity("1");
                            setSellPaymentMode("mensalidade");
                            setSellNotes("");
                            setSellOpen(true);
                          }}
                        >
                          <ShoppingCart size={13} className="mr-1.5" /> Vender
                        </Button>
                      </div>
                      <p className={cn("text-[10px] font-black uppercase tracking-widest", esgotado ? "text-rose-600" : "text-muted-foreground")}>
                        {esgotado ? "Esgotado" : `${product.disponivelVenda} disp.`}{product.vendidosEvento > 0 ? ` · ${product.vendidosEvento} vendido(s) aqui` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {sales.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Vendas deste evento</p>
                {(sales as any[]).map((sale) => {
                  const dims = saleDimensions(sale.status);
                  return (
                    <div key={sale.id} className="rounded-2xl border border-border bg-card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground truncate">
                          {sale.orderCode ?? `VDA-${1000 + sale.id}`}
                          <span className="text-muted-foreground font-bold ml-2">{sale.costumeName} ×{sale.quantity}</span>
                          <span className="text-indigo-600 dark:text-indigo-400 ml-2">{formatBRL(sale.totalPrice)}</span>
                        </p>
                        <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                          {sale.studentName}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] font-black", dims.payment.className)}>{dims.payment.label}</Badge>
                        {dims.delivery && <Badge variant="outline" className={cn("text-[10px] font-black", dims.delivery.className)}>{dims.delivery.label}</Badge>}
                      </div>
                      {(sale.status === "pendente" || sale.status === "em_separacao") && (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setChargeSale(sale)}>
                            <QrCode size={13} className="mr-1" /> Cobrar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "pago" })} disabled={updateSaleStatus.isPending}>
                            <CheckCircle2 size={13} className="mr-1" /> Pago
                          </Button>
                          <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Cancelar venda" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "cancelado" })} disabled={updateSaleStatus.isPending}>
                            <X size={15} />
                          </Button>
                        </div>
                      )}
                      {sale.status === "pago" && (
                        <Button size="sm" variant="outline" onClick={() => updateSaleStatus.mutate({ id: sale.id, status: "entregue" })} disabled={updateSaleStatus.isPending}>
                          <PackageCheck size={13} className="mr-1" /> Entregar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── RELATÓRIOS ── */}
          <TabsContent value="relatorios" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: "Participações", value: String(participantes.length), sub: `${confirmados} confirmado(s) · ${recusados} recusado(s)` },
                { label: "Autorizações", value: `${autorizCompletas}/${participantes.length}`, sub: data?.requiresAuthorization ? `${autorizPendentes} pendente(s)` : "não exigidas" },
                { label: "Vendas da loja", value: `${vendasQty} item(ns)`, sub: `${sales.length} pedido(s)` },
                { label: "Receita arrecadada", value: formatBRL(receitaArrecadada), sub: receitaPrevista > 0 ? `de ${formatBRL(receitaPrevista)} previstos` : "sem vendas" },
              ].map((card, idx) => (
                <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-outfit font-black text-foreground mt-1.5">{card.value}</p>
                  <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{card.sub}</p>
                </motion.div>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lista de participações</p>
                <Button size="sm" variant="outline" onClick={relatorioParticipantesCsv} disabled={participantes.length === 0}><Download size={13} className="mr-1.5" /> CSV participantes</Button>
              </div>
              {participantes.length === 0 ? (
                <p className="text-xs font-bold text-muted-foreground text-center py-6">Sem participações para relatar.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <th className="py-2 pr-3">Aluno</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Participação</th>
                        <th className="py-2">Imagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(participantes as any[]).map((p) => (
                        <tr key={p.id} className="border-b border-border/40 last:border-0">
                          <td className="py-2 pr-3 font-bold text-foreground">{p.studentName}</td>
                          <td className="py-2 pr-3"><Badge variant="outline" className={cn("text-[9px] font-black", PARTICIPANT_STATUS_META[p.status]?.className)}>{PARTICIPANT_STATUS_META[p.status]?.label ?? p.status}</Badge></td>
                          <td className="py-2 pr-3 font-bold">{p.participationAuthorization ? <span className="text-emerald-600 dark:text-emerald-400">Sim</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="py-2 font-bold">{p.imageAuthorization ? <span className="text-emerald-600 dark:text-emerald-400">Sim</span> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vendas por produto</p>
                <Button size="sm" variant="outline" onClick={relatorioVendasCsv} disabled={sales.length === 0}><Download size={13} className="mr-1.5" /> CSV vendas</Button>
              </div>
              {vendasPorProduto.length === 0 ? (
                <p className="text-xs font-bold text-muted-foreground text-center py-6">Sem vendas para relatar.</p>
              ) : (
                <div className="space-y-2">
                  {vendasPorProduto.map((prod) => (
                    <div key={prod.name} className="flex items-center justify-between gap-3 text-xs">
                      <p className="font-bold text-foreground truncate flex-1">{prod.name}</p>
                      <span className="font-black text-muted-foreground">{prod.qty} un.</span>
                      <span className="font-black text-foreground w-24 text-right">{formatBRL(prod.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {modalOpen && (
        <EventoModal open={modalOpen} onClose={() => setModalOpen(false)} editing={data ? {
          ...data,
          startsAt: String(data.startsAt),
          endsAt: data.endsAt ? String(data.endsAt) : null,
          photoUrl: data.photoUrl ?? null,
          coreografiasCount: coreografiasVinculadas.length,
          participantesCount: participantes.length,
          confirmadosCount: confirmados,
          autorizadosCount: autorizCompletas,
          vendasQty,
          receitaPrevista,
          receitaArrecadada,
        } as any : null} />
      )}

      <SaleChargeModal sale={chargeSale} onClose={() => setChargeSale(null)} />

      {/* Dialog: vender figurino do evento */}
      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <ShoppingCart className="text-indigo-500" size={20} />
              Vender produto do evento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Produto *</Label>
              <Select value={sellCostumeId} onValueChange={setSellCostumeId}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {(storeCatalog as any[]).map((product) => {
                    const promo = product.promoPrice != null && product.promoPrice > 0;
                    return (
                      <SelectItem key={product.id} value={String(product.id)} disabled={product.disponivelVenda === 0}>
                        {product.name} — {formatBRL(promo ? product.promoPrice : product.salePrice)} ({product.disponivelVenda} disp.)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Participante *</Label>
              <Select value={sellStudentId} onValueChange={setSellStudentId}>
                <SelectTrigger><SelectValue placeholder="Selecione o participante" /></SelectTrigger>
                <SelectContent>
                  {(participantes as any[]).map((participante) => (
                    <SelectItem key={participante.studentId} value={String(participante.studentId)}>
                      {participante.studentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {participantes.length === 0 && (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Adicione participações antes de vender (aba Participações).</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={sellQuantity}
                  onChange={(event) => setSellQuantity(event.target.value.replace(/\D/g, "") || "1")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Como cobrar</Label>
                <Select value={sellPaymentMode} onValueChange={setSellPaymentMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensalidade">Junto com a mensalidade</SelectItem>
                    <SelectItem value="avulso">Cobrança avulsa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={sellNotes} onChange={(event) => setSellNotes(event.target.value)} rows={2} maxLength={2000} />
            </div>

            {(() => {
              const product = (storeCatalog as any[]).find((item) => String(item.id) === sellCostumeId);
              const quantity = Math.max(1, parseInt(sellQuantity, 10) || 1);
              if (!product) return null;
              const unit = product.promoPrice != null && product.promoPrice > 0 ? product.promoPrice : product.salePrice;
              return (
                <p className="text-sm font-bold text-foreground text-right">
                  Total: <span className="text-indigo-600 dark:text-indigo-400 font-black">{formatBRL(unit * quantity)}</span>
                </p>
              );
            })()}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSellOpen(false)} disabled={sell.isPending}>Cancelar</Button>
            <Button
              disabled={!sellCostumeId || !sellStudentId || sell.isPending}
              onClick={() => {
                if (!hasId) return;
                sell.mutate({
                  eventId,
                  costumeId: Number(sellCostumeId),
                  studentId: Number(sellStudentId),
                  quantity: Math.max(1, parseInt(sellQuantity, 10) || 1),
                  paymentMode: sellPaymentMode as any,
                  notes: sellNotes.trim() || null,
                });
              }}
              className="shadow-md shadow-indigo-500/20"
            >
              {sell.isPending ? <Loader2 size={15} className="animate-spin mr-2" /> : <ShoppingCart size={15} className="mr-2" />}
              Registrar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmações de Encerrar / Cancelar */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(value) => { if (!value) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.status === "realizado" ? "Encerrar como realizado?" : "Cancelar evento?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.status === "realizado"
                ? "O evento fica marcado como realizado (status final). Participantes continuam no histórico e o relatório fica disponível."
                : "As participantes serão avisadas do cancelamento. Um evento cancelado pode ser reativado depois."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.status === "cancelado" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}
              onClick={() => confirmAction && setStatusMut.mutate({ id: eventId, status: confirmAction.status })}
            >
              {confirmAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
