import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import {
  Ticket, Plus, Pencil, Trash2, Loader2, Search, QrCode, CheckCircle2,
  XCircle, X, Camera, Armchair, Ban, ScanLine, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import QRCodeView from "react-qr-code";

const ADMISSION_LABEL: Record<string, string> = {
  adulto: "Adulto", infantil: "Infantil", vip: "VIP", meia: "Meia",
  cortesia: "Cortesia", custom: "Personalizado",
};

const TICKET_STATUS_META: Record<string, { label: string; className: string }> = {
  vendido: { label: "Vendido", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  cortesia: { label: "Cortesia", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  reservado: { label: "Reservado", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

type TabKey = "tipos" | "vendas" | "mapa" | "checkin";

export function TicketsTab({ eventId }: { eventId: number }) {
  const [view, setView] = useState<TabKey>("tipos");
  const utils = trpc.useUtils();

  const { data: types = [], isLoading: loadingTypes } = trpc.tickets.typesList.useQuery({ eventId });
  const { data: stats } = trpc.tickets.stats.useQuery({ eventId });

  const invalidateAll = () => {
    utils.tickets.typesList.invalidate({ eventId });
    utils.tickets.list.invalidate();
    utils.tickets.stats.invalidate({ eventId });
    utils.tickets.seatsList.invalidate({ eventId });
  };

  return (
    <div className="space-y-3">
      {/* Sub-abas */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { key: "tipos", label: "Tipos", icon: Ticket },
          { key: "vendas", label: "Vendas", icon: QrCode, count: stats?.issued ?? 0 },
          { key: "mapa", label: "Mapa de assentos", icon: Armchair },
          { key: "checkin", label: "Check-in", icon: ScanLine, count: stats?.checkedIn ?? 0 },
        ] as Array<{ key: TabKey; label: string; icon: any; count?: number }>).map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black transition-colors",
                view === v.key ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={13} /> {v.label}{typeof v.count === "number" ? ` (${v.count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Indicadores do evento */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Emitidos", value: `${stats?.issued ?? 0}${(stats?.capacity ?? 0) > 0 ? ` / ${stats?.capacity}` : ""}`, note: `${stats?.sold ?? 0} vendido(s) · ${stats?.courtesy ?? 0} cortesia(s)` },
          { label: "Check-in", value: `${stats?.checkedIn ?? 0}`, note: `${stats?.waiting ?? 0} aguardado(s)` },
          { label: "Receita de ingressos", value: formatBRL(stats?.revenue ?? 0), note: "somente vendidos" },
          { label: "Ocupação", value: (stats?.capacity ?? 0) > 0 ? `${Math.round(((stats?.issued ?? 0) / (stats?.capacity || 1)) * 100)}%` : "—", note: "emitidos / capacidade" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border bg-card p-3 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{tile.label}</p>
            <p className="text-lg font-outfit font-black text-foreground mt-1 truncate">{tile.value}</p>
            <p className="text-[10px] font-bold text-muted-foreground truncate">{tile.note}</p>
          </div>
        ))}
      </div>

      {view === "tipos" && <TicketTypesView eventId={eventId} types={types as any[]} loading={loadingTypes} onChanged={invalidateAll} />}
      {view === "vendas" && <TicketSalesView eventId={eventId} types={types as any[]} onChanged={invalidateAll} />}
      {view === "mapa" && <SeatMapView eventId={eventId} onChanged={invalidateAll} />}
      {view === "checkin" && <CheckinView eventId={eventId} onChanged={invalidateAll} />}
    </div>
  );
}

// ═══════════════ TIPOS ═══════════════

function TicketTypesView({ eventId, types, loading, onChanged }: {
  eventId: number; types: any[]; loading: boolean; onChanged: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [courtesyFor, setCourtesyFor] = useState<any | null>(null);

  const delMut = trpc.tickets.typeDelete.useMutation({
    onSuccess: () => { toast.success("Tipo excluído."); setDeleting(null); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const courtesyMut = trpc.tickets.issueCourtesyToParticipants.useMutation({
    onSuccess: (r) => { toast.success(`${r.created} cortesia(s) gerada(s) (${r.perStudent} por aluno).`); setCourtesyFor(null); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20">
          <Plus size={14} className="mr-1.5" /> Novo tipo
        </Button>
      </div>
      {types.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Ticket size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Nenhum tipo de ingresso</p>
          <p className="text-xs text-muted-foreground mt-1">Crie Adulto, Infantil, VIP, Meia, Cortesia ou Personalizado com preço e quantidade.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-foreground flex flex-wrap items-center gap-2">
                  {t.name}
                  <Badge variant="outline" className="text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">{ADMISSION_LABEL[t.admissionType] ?? t.admissionType}</Badge>
                  {!t.active && <Badge variant="outline" className="text-[9px] font-black bg-slate-500/10 text-slate-500 border-slate-500/30">Inativo</Badge>}
                  {t.perStudentFree > 0 && <Badge variant="outline" className="text-[9px] font-black bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">{t.perStudentFree} cortesia(s)/aluno</Badge>}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                  {formatBRL(t.price)} · {t.issued}{t.quantity > 0 ? `/${t.quantity}` : ""} emitido(s) · {t.checkedIn} check-in(s)
                  {t.salesStart || t.salesEnd ? " · janela de vendas definida" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.perStudentFree > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setCourtesyFor(t)} disabled={courtesyMut.isPending}>
                    <Ticket size={12} className="mr-1" /> Gerar cortesias
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Editar tipo" onClick={() => { setEditing(t); setDialogOpen(true); }}><Pencil size={14} /></Button>
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Excluir tipo" onClick={() => setDeleting(t)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <TicketTypeDialog
          eventId={eventId}
          editing={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); onChanged(); }}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Tipos com ingressos emitidos não podem ser excluídos — apenas desativados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && delMut.mutate({ id: deleting.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={courtesyFor !== null} onOpenChange={(v) => { if (!v) setCourtesyFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar cortesias dos participantes?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada aluno do evento receberá {courtesyFor?.perStudentFree} ingresso(s) de cortesia do tipo "{courtesyFor?.name}". Quem já tiver recebido não duplica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => courtesyFor && courtesyMut.mutate({ eventId, ticketTypeId: courtesyFor.id })}>
              {courtesyMut.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null} Gerar cortesias
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function TicketTypeDialog({ eventId, editing, onClose, onSaved }: {
  eventId: number; editing: any | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [admissionType, setAdmissionType] = useState(editing?.admissionType ?? "adulto");
  const [price, setPrice] = useState(editing ? String(editing.price) : "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [perStudentFree, setPerStudentFree] = useState(editing ? String(editing.perStudentFree) : "0");
  const [salesStart, setSalesStart] = useState(toLocalInput(editing?.salesStart));
  const [salesEnd, setSalesEnd] = useState(toLocalInput(editing?.salesEnd));
  const [active, setActive] = useState(editing ? editing.active !== false : true);

  const createMut = trpc.tickets.typeCreate.useMutation({
    onSuccess: () => { toast.success("Tipo criado!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.tickets.typeUpdate.useMutation({
    onSuccess: () => { toast.success("Tipo atualizado!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const saving = createMut.isPending || updateMut.isPending;

  const submit = () => {
    if (name.trim().length < 1) { toast.error("Informe o nome do tipo."); return; }
    const payload = {
      name: name.trim(),
      admissionType: admissionType as any,
      price: Math.max(0, parseFloat(price.replace(",", ".")) || 0),
      quantity: Math.max(0, parseInt(quantity, 10) || 0),
      perStudentFree: Math.max(0, parseInt(perStudentFree, 10) || 0),
      salesStart: salesStart ? new Date(salesStart) : null,
      salesEnd: salesEnd ? new Date(salesEnd) : null,
    };
    if (editing) updateMut.mutate({ id: editing.id, ...payload, active });
    else createMut.mutate({ eventId, ...payload });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Ticket className="text-indigo-500" size={20} /> {editing ? "Editar tipo de ingresso" : "Novo tipo de ingresso"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Adulto — 1º lote" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={admissionType} onValueChange={setAdmissionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ADMISSION_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Preço (R$)</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade (lote)</Label>
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0 = sem limite" />
          </div>
          <div className="space-y-1.5">
            <Label>Cortesias por aluno participante</Label>
            <Input type="number" min={0} max={50} value={perStudentFree} onChange={(e) => setPerStudentFree(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vendas a partir de</Label>
            <Input type="datetime-local" value={salesStart} onChange={(e) => setSalesStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vendas até</Label>
            <Input type="datetime-local" value={salesEnd} onChange={(e) => setSalesEnd(e.target.value)} />
          </div>
          {editing && (
            <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 cursor-pointer select-none">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
              <span className="text-sm font-bold text-foreground">Tipo ativo (aparece na emissão de ingressos)</span>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="shadow-md shadow-indigo-500/20">
            {saving && <Loader2 size={14} className="animate-spin mr-2" />} {editing ? "Salvar" : "Criar tipo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════ VENDAS ═══════════════

function TicketSalesView({ eventId, types, onChanged }: { eventId: number; types: any[]; onChanged: () => void }) {
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [qrTicket, setQrTicket] = useState<any | null>(null);
  const [cancelTicket, setCancelTicket] = useState<any | null>(null);

  const { data: list = [], isLoading } = trpc.tickets.list.useQuery({ eventId, status: status as any, search: search.trim() || undefined });
  const cancelMut = trpc.tickets.cancel.useMutation({
    onSuccess: () => { toast.success("Ingresso cancelado."); setCancelTicket(null); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const checkinMut = trpc.tickets.checkin.useMutation({
    onSuccess: (r) => {
      if (r.result === "valido") toast.success("Check-in realizado!");
      else if (r.result === "duplicado") toast.warning("Este ingresso já foi utilizado.");
      else toast.error(r.result === "cancelado" ? "Ingresso cancelado." : "Ingresso inválido.");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const activeTypes = (types as any[]).filter((t) => t.active);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, comprador, tipo ou assento..." className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="vendido">Vendido</SelectItem>
            <SelectItem value="cortesia">Cortesia</SelectItem>
            <SelectItem value="reservado">Reservado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setIssueOpen(true)} disabled={activeTypes.length === 0} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 shrink-0">
          <Plus size={14} className="mr-1.5" /> Emitir ingressos
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><QrCode size={22} /></span></div>
          <p className="font-black text-foreground text-sm">{activeTypes.length === 0 ? "Crie um tipo de ingresso primeiro" : "Nenhum ingresso neste filtro"}</p>
          {activeTypes.length === 0 && <p className="text-xs text-muted-foreground mt-1">A aba Tipos define preço, lote e cortesias.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {(list as any[]).map((t) => {
            const meta = TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.vendido;
            return (
              <div key={t.id} className="rounded-2xl border border-border bg-card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", t.status === "cortesia" ? "bg-violet-500/10 text-violet-500" : t.status === "cancelado" ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                  <Ticket size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground flex flex-wrap items-center gap-2">
                    {t.code}
                    <Badge variant="outline" className={cn("text-[9px] font-black", meta.className)}>{meta.label}</Badge>
                    {t.checkedInAt && <Badge variant="outline" className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Check-in {new Date(t.checkedInAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Badge>}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                    {t.typeName} · {t.buyerName || "sem comprador"}{t.seatSector ? ` · Assento ${t.seatSector} ${t.seatRow}-${t.seatNumber}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button size="icon" variant="ghost" title="Ver QR Code" onClick={() => setQrTicket(t)}><QrCode size={15} /></Button>
                  {t.status !== "cancelado" && !t.checkedInAt && (
                    <Button size="sm" variant="outline" onClick={() => checkinMut.mutate({ code: t.code })} disabled={checkinMut.isPending}>
                      <CheckCircle2 size={12} className="mr-1" /> Check-in
                    </Button>
                  )}
                  {t.status !== "cancelado" && (
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Cancelar ingresso" onClick={() => setCancelTicket(t)}><X size={15} /></Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {issueOpen && (
        <IssueTicketsDialog eventId={eventId} types={activeTypes} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); onChanged(); }} />
      )}

      {/* QR do ingresso */}
      <Dialog open={qrTicket !== null} onOpenChange={(v) => { if (!v) setQrTicket(null); }}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black"><QrCode className="text-indigo-500" size={20} /> Ingresso {qrTicket?.code}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-2xl border border-border bg-white p-3">
              {qrTicket && <QRCodeView value={qrTicket.code} size={180} />}
            </div>
            <p className="text-sm font-black text-foreground tracking-widest">{qrTicket?.code}</p>
            <p className="text-[11px] font-bold text-muted-foreground text-center">
              {qrTicket?.typeName} · {qrTicket?.buyerName || "sem comprador"}
              {qrTicket?.seatSector ? ` · ${qrTicket.seatSector} ${qrTicket.seatRow}-${qrTicket.seatNumber}` : ""}
            </p>
            <p className="text-[10px] font-bold text-muted-foreground">Apresente este QR no check-in do evento.</p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelTicket !== null} onOpenChange={(v) => { if (!v) setCancelTicket(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar ingresso {cancelTicket?.code}?</AlertDialogTitle>
            <AlertDialogDescription>O assento (se houver) volta a ficar disponível e o QR deixa de ser aceito no check-in.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => cancelTicket && cancelMut.mutate({ id: cancelTicket.id })}>Cancelar ingresso</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IssueTicketsDialog({ eventId, types, onClose, onSaved }: {
  eventId: number; types: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [ticketTypeId, setTicketTypeId] = useState(types[0] ? String(types[0].id) : "");
  const [quantity, setQuantity] = useState("1");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [asCourtesy, setAsCourtesy] = useState(false);
  const [notes, setNotes] = useState("");
  const [seatIds, setSeatIds] = useState<number[]>([]);

  const { data: seats = [] } = trpc.tickets.seatsList.useQuery({ eventId });
  const availableSeats = (seats as any[]).filter((s) => s.status !== "bloqueado" && !s.occupant);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  const issueMut = trpc.tickets.issue.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.codes.length} ingresso(s) emitido(s)!`);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSeat = (id: number) => {
    setSeatIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= qty) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black"><Ticket className="text-indigo-500" size={20} /> Emitir ingressos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipo de ingresso *</Label>
              <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} — {formatBRL(t.price)}{t.quantity > 0 ? ` (${Math.max(0, t.quantity - t.issued)} disp.)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} max={200} value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "") || "1")} />
            </div>
            <div className="space-y-1.5">
              <Label>Comprador (opcional)</Label>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nome de quem comprou" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone (opcional)</Label>
              <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="(11) 9..." maxLength={30} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: reserva paga em dinheiro" maxLength={2000} />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 cursor-pointer select-none">
            <Checkbox checked={asCourtesy} onCheckedChange={(v) => setAsCourtesy(v === true)} />
            <span className="text-sm font-bold text-foreground">Emitir como cortesia (sem cobrança, ignora janela de vendas)</span>
          </label>

          {availableSeats.length > 0 && (
            <div className="space-y-2">
              <Label>Assentos (opcional — selecione {qty})</Label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-xl border border-border p-2">
                {availableSeats.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSeat(s.id)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-[10px] font-black transition-colors",
                      seatIds.includes(s.id)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-background text-muted-foreground border-border hover:border-indigo-400",
                    )}
                  >
                    {s.sector} {s.row}-{s.number}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground">{seatIds.length} de {qty} assento(s) selecionado(s).</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={issueMut.isPending}>Cancelar</Button>
          <Button
            disabled={!ticketTypeId || issueMut.isPending}
            onClick={() => issueMut.mutate({
              eventId,
              ticketTypeId: Number(ticketTypeId),
              quantity: qty,
              buyerName: buyerName.trim() || null,
              buyerPhone: buyerPhone.trim() || null,
              asCourtesy,
              seatIds: seatIds.length > 0 ? seatIds : undefined,
              notes: notes.trim() || null,
            })}
            className="shadow-md shadow-indigo-500/20"
          >
            {issueMut.isPending && <Loader2 size={14} className="animate-spin mr-2" />} Emitir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════ MAPA DE ASSENTOS ═══════════════

function SeatMapView({ eventId, onChanged }: { eventId: number; onChanged: () => void }) {
  const [sector, setSector] = useState("");
  const [rows, setRows] = useState("5");
  const [perRow, setPerRow] = useState("10");

  const { data: seats = [], isLoading } = trpc.tickets.seatsList.useQuery({ eventId });
  const generateMut = trpc.tickets.seatsGenerate.useMutation({
    onSuccess: (r) => { toast.success(`${r.created} assento(s) criado(s).`); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const statusMut = trpc.tickets.seatSetStatus.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.tickets.seatsDeleteSector.useMutation({
    onSuccess: (r) => { toast.success(`${r.removed} assento(s) removido(s)${r.kept > 0 ? `, ${r.kept} ocupado(s) mantido(s)` : ""}.`); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  const bySector = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of seats as any[]) {
      const list = map.get(s.sector) ?? [];
      list.push(s);
      map.set(s.sector, list);
    }
    return map;
  }, [seats]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Armchair size={13} /> Gerar setor de assentos</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Setor (ex.: A)" maxLength={40} />
          <Input type="number" min={1} max={60} value={rows} onChange={(e) => setRows(e.target.value)} placeholder="Fileiras" />
          <Input type="number" min={1} max={200} value={perRow} onChange={(e) => setPerRow(e.target.value)} placeholder="Assentos/fileira" />
          <Button
            variant="outline"
            disabled={!sector.trim() || generateMut.isPending}
            onClick={() => generateMut.mutate({ eventId, sector: sector.trim(), rows: parseInt(rows, 10) || 1, perRow: parseInt(perRow, 10) || 1 })}
          >
            {generateMut.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />} Gerar
          </Button>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground">Assentos existentes não são duplicados. Assentos ocupados por ingressos não podem ser removidos.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : bySector.size === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Armchair size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Nenhum assento gerado</p>
          <p className="text-xs text-muted-foreground mt-1">Gere setores acima para escolher assentos na emissão de ingressos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(bySector.entries()).map(([sec, list]) => (
            <div key={sec} className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-black text-foreground">Setor {sec} <span className="text-muted-foreground font-bold text-xs">({list.length} assento(s))</span></p>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-rose-500 h-7" onClick={() => deleteMut.mutate({ eventId, sector: sec })} disabled={deleteMut.isPending}>
                  <Trash2 size={13} className="mr-1" /> Remover setor
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {list.map((s: any) => {
                  const occupied = Boolean(s.occupant);
                  const blocked = s.status === "bloqueado";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={occupied}
                      onClick={() => statusMut.mutate({ id: s.id, status: blocked ? "disponivel" : "bloqueado" })}
                      title={occupied ? `${s.sector} ${s.row}-${s.number} — ${s.occupant === "cortesia" ? "cortesia" : "vendido"}` : blocked ? "Bloqueado (clique para liberar)" : "Disponível (clique para bloquear)"}
                      className={cn(
                        "h-9 min-w-9 rounded-lg border px-1.5 text-[9px] font-black transition-colors",
                        occupied
                          ? s.occupant === "cortesia" ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300 cursor-not-allowed" : "bg-indigo-600 border-indigo-600 text-white cursor-not-allowed"
                          : blocked
                            ? "bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-500"
                            : "bg-background border-border text-muted-foreground hover:border-indigo-400",
                      )}
                    >
                      {s.row}-{s.number}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-bold text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-background border border-border" /> Disponível</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-indigo-600" /> Vendido</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-violet-500/40" /> Cortesia</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-300 dark:bg-slate-600" /> Bloqueado</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════ CHECK-IN ═══════════════

const CHECKIN_RESULT: Record<string, { label: string; className: string; icon: any }> = {
  valido: { label: "Ingresso válido — entrada liberada!", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40", icon: CheckCircle2 },
  duplicado: { label: "Ingresso já utilizado.", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40", icon: Clock },
  invalido: { label: "Ingresso inválido — não encontrado.", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/40", icon: XCircle },
  cancelado: { label: "Ingresso cancelado.", className: "bg-slate-500/10 text-slate-500 border-slate-500/40", icon: Ban },
  reservado: { label: "Ingresso reservado — confirme o pagamento.", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/40", icon: Clock },
};

function CheckinView({ eventId, onChanged }: { eventId: number; onChanged: () => void }) {
  const [code, setCode] = useState("");
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const { data: stats } = trpc.tickets.stats.useQuery({ eventId });
  const { data: list = [] } = trpc.tickets.list.useQuery({ eventId, status: "todos", search: search.trim() || undefined });
  const checkinMut = trpc.tickets.checkin.useMutation({
    onSuccess: (r) => {
      setLastResult(r);
      if (r.result === "valido" || r.result === "duplicado") setCode("");
      onChanged();
      inputRef.current?.focus();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (value?: string) => {
    const c = (value ?? code).trim();
    if (c.length < 3) { toast.error("Digite ou leia o código do ingresso."); return; }
    checkinMut.mutate({ code: c });
  };

  // Leitor por câmera (jsQR) — opcional, sem dependências novas
  const stopCamera = () => {
    setCameraOn(false);
    if (scanLoopRef.current) { window.clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
  };

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    try {
      const { default: jsQR } = await import("jsqr");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCameraOn(true);
      setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play().catch(() => undefined);
        const canvas = document.createElement("canvas");
        scanLoopRef.current = window.setInterval(() => {
          if (!video.videoWidth) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(imageData.data, imageData.width, imageData.height);
          if (found?.data) {
            stopCamera();
            submit(found.data);
          }
        }, 350);
      }, 300);
    } catch {
      toast.error("Não foi possível abrir a câmera. Use o campo de código (leitor USB funciona direto).");
    }
  };

  const counter = stats ?? { checkedIn: 0, issued: 0, waiting: 0 };
  const resMeta = lastResult ? CHECKIN_RESULT[lastResult.result] : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
          <p className="text-2xl font-outfit font-black text-emerald-600 dark:text-emerald-400">{counter.checkedIn}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entraram</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <p className="text-2xl font-outfit font-black text-foreground">{counter.issued}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Emitidos</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <p className="text-2xl font-outfit font-black text-foreground">{counter.waiting}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aguardados</p>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Código do ingresso (ex.: TE-8KQ2M1) — leitor USB digita direto"
            className="h-12 text-base font-black tracking-widest bg-background uppercase"
            autoFocus
          />
          <Button size="lg" className="h-12 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20" onClick={() => submit()} disabled={checkinMut.isPending}>
            {checkinMut.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <ScanLine size={16} className="mr-2" />} Validar
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={cameraOn ? stopCamera : startCamera}>
            <Camera size={16} className="mr-2" /> {cameraOn ? "Parar câmera" : "Ler com câmera"}
          </Button>
        </div>
        {cameraOn && (
          <div className="relative rounded-xl overflow-hidden border border-border bg-black/80 max-w-md mx-auto">
            <video ref={videoRef} className="w-full h-56 object-cover" muted playsInline />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="h-36 w-36 rounded-2xl border-2 border-white/70" />
            </div>
          </div>
        )}
        {resMeta && (
          <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5", resMeta.className)}>
            <resMeta.icon size={18} />
            <div className="min-w-0">
              <p className="text-sm font-black">{resMeta.label}</p>
              {lastResult?.ticket && (
                <p className="text-[11px] font-bold opacity-80 truncate">
                  {lastResult.ticket.typeName}{lastResult.ticket.buyerName ? ` · ${lastResult.ticket.buyerName}` : ""}{lastResult.ticket.seatSector ? ` · ${lastResult.ticket.seatSector} ${lastResult.ticket.seatRow}-${lastResult.ticket.seatNumber}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca manual por código, comprador, tipo ou assento..." className="pl-9" />
        </div>
        {search.trim().length >= 2 && (
          <div className="space-y-1.5">
            {(list as any[]).slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground truncate">{t.code} · {t.typeName}</p>
                  <p className="text-[10px] font-bold text-muted-foreground truncate">{t.buyerName || "sem comprador"}{t.checkedInAt ? " · já entrou" : ""}</p>
                </div>
                {!t.checkedInAt && t.status !== "cancelado" ? (
                  <Button size="sm" variant="outline" onClick={() => submit(t.code)} disabled={checkinMut.isPending}><CheckCircle2 size={12} className="mr-1" /> Check-in</Button>
                ) : (
                  <Badge variant="outline" className={cn("text-[9px] font-black", (TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.vendido).className)}>
                    {(TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.vendido).label}
                  </Badge>
                )}
              </div>
            ))}
            {list.length === 0 && <p className="text-xs font-bold text-muted-foreground text-center py-3">Nenhum ingresso encontrado.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
