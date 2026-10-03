import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { format, formatEventPeriod, eventSituation, isMultiDay } from "@/lib/dates";
import { ptBR } from "date-fns/locale";
import {
  Theater, Plus, Search, Pencil, Trash2, Users, Loader2, MapPin,
  CalendarDays, Send, Copy, FileText, Shirt, ShieldCheck, CheckCircle2,
  Clock, TrendingUp, MoreVertical, Settings2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  EVENT_TYPE_LABEL, EVENT_STATUS_META, EventoModal, type EventoRow,
} from "@/components/eventos/EventoModal";
import { SmartImage } from "@/components/common/SmartImage";

const CHIP_META: Array<{ key: string; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "proximos", label: "Próximos" },
  { key: "realizados", label: "Realizados" },
  { key: "rascunhos", label: "Rascunhos" },
  { key: "cancelados", label: "Cancelados" },
];

const DATE_BADGE_BG: Record<string, string> = {
  planejado: "bg-amber-500",
  confirmado: "bg-indigo-600",
  realizado: "bg-emerald-600",
  cancelado: "bg-slate-500",
};

export default function Eventos() {
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventoRow | null>(null);
  const [deleting, setDeleting] = useState<EventoRow | null>(null);
  const [, setLocation] = useLocation();

  const { data: stats } = trpc.eventos.stats.useQuery();
  const queryParams = useMemo(() => {
    if (chip === "proximos") return { upcomingOnly: true };
    if (chip === "realizados") return { status: "realizado" as const };
    if (chip === "rascunhos") return { status: "planejado" as const };
    if (chip === "cancelados") return { status: "cancelado" as const };
    return {};
  }, [chip]);
  const { data: eventos = [], isLoading } = trpc.eventos.list.useQuery({
    search: search.trim() || undefined,
    type: typeFilter === "todos" ? undefined : (typeFilter as any),
    ...queryParams,
  });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.eventos.delete.useMutation({
    onSuccess: () => {
      toast.success("Evento excluído.");
      setDeleting(null);
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
    },
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
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
      utils.eventos.getById.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicateMut = trpc.eventos.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Evento duplicado como rascunho — edite a data e publique.");
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const chipCounts: Record<string, number> = {
    todos: stats?.total ?? 0,
    proximos: stats?.proximos ?? 0,
    realizados: stats?.realizados ?? 0,
    rascunhos: stats?.planejados ?? 0,
    cancelados: stats?.cancelados ?? 0,
  };

  const concl = stats && stats.total > 0 ? Math.round((stats.realizados / stats.total) * 100) : 0;

  const kpis = useMemo(() => ([
    { label: "Total de eventos", value: String(stats?.total ?? 0), icon: CalendarDays, iconBg: "bg-violet-500/10 text-violet-500", sub: stats && (stats.novosEsteMes ?? 0) > 0 ? `+${stats.novosEsteMes} este mês` : "nenhum novo este mês", subClass: stats && (stats.novosEsteMes ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "" },
    { label: "Próximos eventos", value: String(stats?.proximos30 ?? 0), icon: Clock, iconBg: "bg-blue-500/10 text-blue-500", sub: "Nos próximos 30 dias", subClass: "" },
    { label: "Eventos realizados", value: String(stats?.realizados ?? 0), icon: CheckCircle2, iconBg: "bg-emerald-500/10 text-emerald-500", sub: `${concl}% de conclusão`, subClass: "" },
    { label: "Total de participações", value: String(stats?.participantes ?? 0), icon: Users, iconBg: "bg-purple-500/10 text-purple-500", sub: "alunas convidadas nos eventos", subClass: "" },
  ]), [stats, concl]);

  const hasActiveFilters = search.trim() !== "" || typeFilter !== "todos" || chip !== "todos";

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-outfit font-black tracking-tight text-foreground flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25"><Theater size={22} /></span>
            Eventos & Espetáculos
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1.5">Organize recitais, festivais, competições e workshops da sua escola em um só lugar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLocation("/aulas")}><CalendarDays size={16} className="mr-2" /> Calendário</Button>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25"><Plus size={16} className="mr-2" /> Novo evento</Button>
        </div>
      </motion.div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
                  <p className="text-[26px] lg:text-3xl font-outfit font-black tracking-tight text-foreground leading-none mt-2">{kpi.value}</p>
                  <p className={cn("text-[10px] font-bold text-muted-foreground mt-1.5 flex items-center gap-1", kpi.subClass)}>
                    {kpi.subClass && <TrendingUp size={10} />}{kpi.sub}
                  </p>
                </div>
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", kpi.iconBg)}><Icon size={22} /></span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Chips + busca + tipo ── */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHIP_META.map((c) => (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-black transition-all",
                chip === c.key ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25" : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60"
              )}
            >
              {c.label} ({chipCounts[c.key] ?? 0})
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 xl:ml-auto xl:w-[560px] xl:min-w-[420px]">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, local ou descrição..." className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[170px] shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : eventos.length === 0 ? (
        hasActiveFilters ? (
          <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
            <Theater className="mx-auto text-muted-foreground opacity-20 mb-4" size={44} />
            <p className="font-black text-foreground">Nenhum evento com esses filtros</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => { setSearch(""); setTypeFilter("todos"); setChip("todos"); }}>Limpar filtros</Button>
          </div>
        ) : (
          <div className="text-center py-16 rounded-3xl border-2 border-dashed border-border">
            <Theater className="mx-auto text-muted-foreground opacity-20 mb-4" size={44} />
            <p className="font-black text-foreground">Nenhum evento cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1 mb-3">Crie o primeiro evento para organizar o próximo espetáculo.</p>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700"><Plus size={15} className="mr-2" /> Cadastrar primeiro evento</Button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {eventos.map((evento: EventoRow, index: number) => {
            const statusMeta = EVENT_STATUS_META[evento.status] ?? EVENT_STATUS_META.planejado;
            const startsAt = new Date(evento.startsAt);
            const endsAt = evento.endsAt ? new Date(evento.endsAt) : null;
            const situation = eventSituation(evento.startsAt, evento.endsAt);
            const multiDay = isMultiDay(evento.startsAt, evento.endsAt);
            return (
              <motion.div
                key={evento.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.25) }}
                className="rounded-3xl border border-border bg-card shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
              >
                <div className="flex flex-col lg:flex-row lg:items-stretch">
                  {/* Foto + selo de data (um dia ou faixa) */}
                  <div className="relative h-[130px] lg:h-auto lg:w-[215px] lg:min-w-[215px] shrink-0">
                    <SmartImage
                      src={evento.photoUrl}
                      alt={evento.name}
                      className="h-full w-full object-cover"
                      fallback={<div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-transparent"><Theater className="text-indigo-400/50" size={40} /></div>}
                    />
                    <div className={cn("absolute left-3 top-3 rounded-xl px-2.5 py-1.5 text-center text-white shadow-lg", DATE_BADGE_BG[evento.status] ?? DATE_BADGE_BG.planejado)}>
                      {multiDay && endsAt ? (
                        <>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-90">
                            {format(startsAt, "dd MMM", { locale: ptBR }).replace(".", "")} – {format(endsAt, "dd MMM", { locale: ptBR }).replace(".", "")}
                          </p>
                          <p className="text-lg font-black leading-none">{format(startsAt, "yyyy")}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-90">{format(startsAt, "MMM", { locale: ptBR }).replace(".", "")}</p>
                          <p className="text-xl font-black leading-none">{format(startsAt, "dd")}</p>
                          <p className="text-[9px] font-bold opacity-90">{format(startsAt, "yyyy")}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-black text-foreground text-base lg:text-lg leading-tight truncate">{evento.name}</h3>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] font-black", situation.className)} title="Situação calculada pelas datas">{situation.label}</Badge>
                        <Badge variant="outline" className={cn("text-[10px] font-black", statusMeta.className)} title="Status do evento (manual)">{statusMeta.label}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {formatEventPeriod(evento.startsAt, evento.endsAt)}</span>
                      {evento.venueName && <span className="flex items-center gap-1 truncate max-w-full"><MapPin size={12} /> {evento.venueName}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge variant="outline" className="text-[10px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">{EVENT_TYPE_LABEL[evento.type] ?? evento.type}</Badge>
                      <Badge variant="outline" className={cn("text-[10px] font-black", evento.requiresAuthorization ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30")}>
                        <ShieldCheck size={9} className="mr-1" /> {evento.requiresAuthorization ? "Autorização" : "Sem autorização"}
                      </Badge>
                      {evento.coreografiasCount > 0 && (
                        <Badge variant="outline" className="text-[10px] font-black bg-primary/5 text-muted-foreground border-border">{evento.coreografiasCount} coreografia(s)</Badge>
                      )}
                    </div>
                  </div>

                  {/* Métricas (Participações · Vendas · Receita — base: loja do evento) */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 lg:py-0 lg:px-0 lg:pr-7 lg:border-l border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500"><Users size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-lg font-outfit font-black leading-none text-foreground">{evento.participantesCount}</p>
                        <p className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">Participações</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500"><Shirt size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-lg font-outfit font-black leading-none text-foreground">{evento.vendasQty}</p>
                        <p className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">Vendas da loja</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><TrendingUp size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-lg font-outfit font-black leading-none text-foreground truncate">{formatBRL(evento.status === "realizado" ? evento.receitaArrecadada : evento.receitaPrevista)}</p>
                        <p className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">{evento.status === "realizado" ? "Receita arrecadada" : "Receita prevista"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col gap-2 p-4 pt-0 lg:pt-4 lg:w-[215px] shrink-0 border-t lg:border-t-0 lg:border-l border-border">
                    {evento.status === "planejado" && (
                      <>
                        <Button size="sm" onClick={() => setStatusMut.mutate({ id: evento.id, status: "confirmado" })} disabled={setStatusMut.isPending} className="bg-indigo-600 hover:bg-indigo-700"><Send size={13} className="mr-1.5" /> Publicar evento</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(evento); setModalOpen(true); }}><Pencil size={13} className="mr-1.5" /> Editar evento</Button>
                      </>
                    )}
                    {evento.status === "confirmado" && (
                      <>
                        <Button size="sm" onClick={() => setLocation(`/eventos/${evento.id}`)} className="bg-indigo-600 hover:bg-indigo-700"><Settings2 size={13} className="mr-1.5" /> Gerenciar evento</Button>
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/eventos/${evento.id}?aba=loja`)}><Shirt size={13} className="mr-1.5" /> Loja do evento</Button>
                      </>
                    )}
                    {evento.status === "realizado" && (
                      <>
                        <Button size="sm" onClick={() => setLocation(`/eventos/${evento.id}`)} className="bg-indigo-600 hover:bg-indigo-700"><Settings2 size={13} className="mr-1.5" /> Gerenciar evento</Button>
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/eventos/${evento.id}?aba=relatorios`)}><FileText size={13} className="mr-1.5" /> Relatório</Button>
                      </>
                    )}
                    {evento.status === "cancelado" && (
                      <Button size="sm" variant="outline" onClick={() => setLocation(`/eventos/${evento.id}`)}><Settings2 size={13} className="mr-1.5" /> Gerenciar evento</Button>
                    )}
                    <div className="flex items-center justify-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"><MoreVertical size={15} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setLocation(`/eventos/${evento.id}`)}><Settings2 size={13} className="mr-2" /> Gerenciar evento</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(evento); setModalOpen(true); }}><Pencil size={13} className="mr-2" /> Editar evento</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateMut.mutate({ id: evento.id })} disabled={duplicateMut.isPending}><Copy size={13} className="mr-2" /> Duplicar</DropdownMenuItem>
                          {evento.status === "confirmado" && <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: evento.id, status: "realizado" })}><CheckCircle2 size={13} className="mr-2" /> Encerrar como realizado</DropdownMenuItem>}
                          {evento.status === "cancelado" && <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: evento.id, status: "confirmado" })}><CheckCircle2 size={13} className="mr-2" /> Reativar evento</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={() => setDeleting(evento)}><Trash2 size={13} className="mr-2" /> Excluir evento</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <EventoModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O evento "{deleting?.name}" será removido junto com o programa e a lista de participantes. Esta ação não pode ser desfeita.
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
