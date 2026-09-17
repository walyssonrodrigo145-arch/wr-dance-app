import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Theater, Plus, Search, Pencil, Trash2, Users, Loader2, MapPin,
  CalendarDays, Music, X, UserPlus, ShieldCheck, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Metadados ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  recital: "Recital",
  festival: "Festival",
  competicao: "Competição",
  workshop: "Workshop",
  audicao: "Audição",
  ensaio_geral: "Ensaio geral",
  outro: "Outro",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  planejado: { label: "Planejado", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  confirmado: { label: "Confirmado", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  realizado: { label: "Realizado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

const PARTICIPANT_STATUS_META: Record<string, { label: string; className: string }> = {
  convidado: { label: "Convidado", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  confirmado: { label: "Confirmado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  recusado: { label: "Recusado", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

/** datetime-local exige "YYYY-MM-DDTHH:mm" no fuso local. */
function toLocalInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

type EventoRow = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: string | Date;
  endsAt: string | Date | null;
  status: string;
  requiresAuthorization: boolean;
  coreografiasCount: number;
  participantesCount: number;
  confirmadosCount: number;
  autorizadosCount: number;
};

type EventoForm = {
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  description: string;
  requiresAuthorization: boolean;
};

const EMPTY_FORM: EventoForm = {
  name: "",
  type: "recital",
  status: "planejado",
  startsAt: "",
  endsAt: "",
  venueName: "",
  venueAddress: "",
  description: "",
  requiresAuthorization: true,
};

// ─── Modal de criação/edição ─────────────────────────────────────────────────

function EventoModal({ open, onClose, editing }: {
  open: boolean;
  onClose: () => void;
  editing: EventoRow | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<EventoForm>(() => editing ? {
    name: editing.name,
    type: editing.type,
    status: editing.status,
    startsAt: toLocalInputValue(editing.startsAt),
    endsAt: toLocalInputValue(editing.endsAt),
    venueName: editing.venueName ?? "",
    venueAddress: editing.venueAddress ?? "",
    description: editing.description ?? "",
    requiresAuthorization: editing.requiresAuthorization,
  } : EMPTY_FORM);

  const set = (key: keyof EventoForm, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    name: form.name.trim(),
    type: form.type as any,
    status: form.status as any,
    startsAt: new Date(form.startsAt),
    endsAt: form.endsAt ? new Date(form.endsAt) : null,
    venueName: form.venueName.trim() || null,
    venueAddress: form.venueAddress.trim() || null,
    description: form.description.trim() || null,
    requiresAuthorization: form.requiresAuthorization,
  });

  const createMutation = trpc.eventos.create.useMutation({
    onSuccess: () => {
      toast.success("Evento criado!");
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.eventos.update.useMutation({
    onSuccess: () => {
      toast.success("Evento atualizado!");
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
      utils.eventos.getById.invalidate({ id: editing!.id });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (form.name.trim().length < 2) { toast.error("Informe o nome do evento."); return; }
    if (!form.startsAt) { toast.error("Informe a data e hora de início."); return; }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...buildPayload() });
    } else {
      createMutation.mutate(buildPayload());
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Theater className="text-indigo-500" size={20} />
            {editing ? "Editar evento" : "Novo evento"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome do evento *</Label>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: Recital de Fim de Ano 2026" maxLength={255} />
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
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Início *</Label>
            <Input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Término</Label>
            <Input type="datetime-local" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={form.venueName} onChange={(event) => set("venueName", event.target.value)} placeholder="Ex.: Teatro Municipal" maxLength={255} />
          </div>

          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input value={form.venueAddress} onChange={(event) => set("venueAddress", event.target.value)} placeholder="Rua, número, cidade" maxLength={500} />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição / Orientações</Label>
            <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Horário de concentração, figurino, instruções aos responsáveis..." rows={3} maxLength={5000} />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
            <Checkbox
              id="requiresAuthorization"
              checked={form.requiresAuthorization}
              onCheckedChange={(checked) => set("requiresAuthorization", checked === true)}
            />
            <label htmlFor="requiresAuthorization" className="text-sm font-bold text-foreground cursor-pointer select-none">
              Exigir autorização de imagem e participação (recomendado para menores)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar alterações" : "Criar evento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de detalhes (coreografias + participantes) ───────────────────────

function EventoDetalhes({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [studentSearch, setStudentSearch] = useState("");
  // Adição por filtro (turma / modalidade / coreografia) + seleção em massa
  const [filterModalidade, setFilterModalidade] = useState("none");
  const [filterTurma, setFilterTurma] = useState("none");
  const [filterCoreografia, setFilterCoreografia] = useState("none");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);

  const { data: modalidades = [] } = trpc.instruments.list.useQuery();
  const { data: turmasAtivas = [] } = trpc.turmas.list.useQuery({ status: "ativa" });
  const { data: coreografiasTodas = [] } = trpc.coreografias.list.useQuery({});

  const { data: candidates = [], isLoading: isLoadingCandidates } = trpc.eventos.candidatesForEvent.useQuery(
    {
      eventId: eventId ?? 0,
      modalidadeId: filterModalidade === "none" ? undefined : Number(filterModalidade),
      turmaId: filterTurma === "none" ? undefined : Number(filterTurma),
      coreografiaId: filterCoreografia === "none" ? undefined : Number(filterCoreografia),
    },
    { enabled: eventId !== null }
  );

  const turmasFiltradas = (turmasAtivas as any[]).filter((turma) =>
    filterModalidade === "none" ? true : String(turma.modalidadeId) === filterModalidade
  );
  const availableCandidates = (candidates as any[]).filter((candidate) => !candidate.alreadyIn);

  const { data, isLoading } = trpc.eventos.getById.useQuery(
    { id: eventId! },
    { enabled: eventId !== null }
  );

  const { data: coreografiasDisponiveis = [] } = trpc.eventos.coreografiasDisponiveis.useQuery(
    { eventId: eventId ?? undefined },
    { enabled: eventId !== null }
  );

  const { data: searchResults = [] } = trpc.eventos.searchAlunos.useQuery(
    { q: studentSearch, eventId: eventId ?? undefined },
    { enabled: eventId !== null && studentSearch.trim().length >= 2 }
  );

  const invalidate = () => {
    utils.eventos.getById.invalidate({ id: eventId! });
    utils.eventos.list.invalidate();
    utils.eventos.stats.invalidate();
  };

  const linkCoreografia = trpc.eventos.linkCoreografia.useMutation({
    onSuccess: () => { toast.success("Coreografia vinculada!"); invalidate(); },
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

  const participantes = data?.participantes ?? [];
  const coreografiasVinculadas = data?.coreografias ?? [];

  return (
    <Dialog open={eventId !== null} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Theater className="text-indigo-500" size={20} />
            {data?.name ?? "..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>
        ) : (
          <div className="space-y-8 mt-2">
            {/* Resumo */}
            <div className="flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5"><CalendarDays size={13} className="text-indigo-500" /> {data?.startsAt ? format(new Date(data.startsAt), "dd/MM/yyyy 'às' HH:mm") : "-"}</span>
              {data?.venueName && <span className="flex items-center gap-1.5"><MapPin size={13} className="text-indigo-500" /> {data.venueName}</span>}
              <Badge variant="outline" className={cn("text-[10px] font-black", STATUS_META[data?.status ?? "planejado"]?.className)}>
                {STATUS_META[data?.status ?? "planejado"]?.label}
              </Badge>
            </div>

            {/* Coreografias */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Music size={14} /> Coreografias no programa ({coreografiasVinculadas.length})
              </p>

              <div className="flex gap-2">
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (!value || !eventId) return;
                    linkCoreografia.mutate({ eventId, coreografiaId: Number(value) });
                  }}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Vincular coreografia..." /></SelectTrigger>
                  <SelectContent>
                    {coreografiasDisponiveis.length === 0 && (
                      <SelectItem value="__none" disabled>Nenhuma coreografia disponível</SelectItem>
                    )}
                    {coreografiasDisponiveis.map((coreografia: any) => (
                      <SelectItem key={coreografia.id} value={String(coreografia.id)}>{coreografia.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {coreografiasVinculadas.length === 0 ? (
                <p className="text-sm font-medium text-muted-foreground text-center py-6 rounded-2xl border-2 border-dashed border-border">
                  Nenhuma coreografia vinculada ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {coreografiasVinculadas.map((coreografia: any) => (
                    <div key={coreografia.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                      <span className="w-7 h-7 rounded-lg bg-indigo-600/10 text-indigo-600 text-xs font-black flex items-center justify-center shrink-0">
                        {coreografia.ordem}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground truncate">{coreografia.title}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{coreografia.formacao}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => unlinkCoreografia.mutate({ id: coreografia.id })} title="Remover do evento">
                        <X size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Participantes */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Users size={14} /> Participantes ({participantes.length})
              </p>

              {/* Adicionar por filtro (turma / modalidade / coreografia) + seleção em massa */}
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Adicionar por filtro (turma, modalidade ou coreografia)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Select
                    value={filterModalidade}
                    onValueChange={(value) => { setFilterModalidade(value); setFilterTurma("none"); setSelectedCandidateIds([]); }}
                  >
                    <SelectTrigger className="h-11 text-xs"><SelectValue placeholder="Modalidade" /></SelectTrigger>
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
                    <SelectTrigger className="h-11 text-xs"><SelectValue placeholder="Turma" /></SelectTrigger>
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
                    <SelectTrigger className="h-11 text-xs"><SelectValue placeholder="Coreografia" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas as coreografias</SelectItem>
                      {(coreografiasTodas as any[]).map((coreografia) => (
                        <SelectItem key={coreografia.id} value={String(coreografia.id)}>{coreografia.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border border-border bg-card max-h-56 overflow-y-auto">
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

                <div className="flex items-center justify-between gap-3">
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
                      if (!eventId) return;
                      addParticipant.mutate({ eventId, studentIds: selectedCandidateIds });
                      setSelectedCandidateIds([]);
                    }}
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
                          if (!eventId) return;
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
                <p className="text-sm font-medium text-muted-foreground text-center py-6 rounded-2xl border-2 border-dashed border-border">
                  Nenhum participante adicionado ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {participantes.map((participante: any) => {
                    const isMinor = participante.birthDate
                      ? (Date.now() - new Date(participante.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000) < 18
                      : false;
                    const fullyAuthorized = participante.imageAuthorization && participante.participationAuthorization;
                    return (
                      <div key={participante.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col xl:flex-row xl:items-center gap-4">
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
                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
                              <Checkbox
                                checked={participante.participationAuthorization}
                                onCheckedChange={(checked) => updateParticipant.mutate({ id: participante.id, participationAuthorization: checked === true })}
                              />
                              Participação
                            </label>
                            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
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
                            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
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
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Eventos() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventoRow | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<EventoRow | null>(null);

  const { data: stats } = trpc.eventos.stats.useQuery();
  const { data: eventos = [], isLoading } = trpc.eventos.list.useQuery({
    search: search.trim() || undefined,
    status: statusFilter === "todos" ? undefined : (statusFilter as any),
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

  const kpis = useMemo(() => ([
    { label: "Eventos", value: stats?.total ?? 0, icon: Theater, className: "text-indigo-500" },
    { label: "Próximos", value: stats?.proximos ?? 0, icon: CalendarDays, className: "text-blue-500" },
    { label: "Realizados", value: stats?.realizados ?? 0, icon: CheckCircle2, className: "text-emerald-500" },
    { label: "Participações", value: stats?.participantes ?? 0, icon: Users, className: "text-purple-500" },
  ]), [stats]);

  return (
    <div className="flex-1 space-y-6 lg:space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Theater className="text-indigo-500" size={28} />
            Eventos & Espetáculos
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Recitais, festivais, competições e workshops: programa, elenco e autorizações em um só lugar.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus size={16} className="mr-2" /> Novo evento
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Icon size={16} className={kpi.className} />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-2xl font-black text-foreground mt-2">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou local..." className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : eventos.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Theater className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhum evento encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">Crie o primeiro evento para organizar o próximo espetáculo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {eventos.map((evento: EventoRow, index: number) => {
            const statusMeta = STATUS_META[evento.status] ?? STATUS_META.planejado;
            const startsAt = new Date(evento.startsAt);
            return (
              <motion.div
                key={evento.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col"
              >
                <div className="flex">
                  <div className="w-20 shrink-0 bg-indigo-600 text-white flex flex-col items-center justify-center py-4">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                      {format(startsAt, "MMM")}
                    </span>
                    <span className="text-2xl font-black leading-none">{format(startsAt, "dd")}</span>
                    <span className="text-[10px] font-bold mt-1 opacity-80">{format(startsAt, "HH:mm")}</span>
                  </div>

                  <div className="flex-1 p-4 space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-foreground leading-tight truncate">{evento.name}</h3>
                      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", statusMeta.className)}>
                        {statusMeta.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      {TYPE_LABEL[evento.type] ?? evento.type}
                    </p>
                    {evento.venueName && (
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin size={12} className="shrink-0" /> {evento.venueName}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center gap-1"><Music size={11} /> {evento.coreografiasCount} coreografias</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {evento.participantesCount} alunos</span>
                    </div>
                    {evento.requiresAuthorization && evento.participantesCount > 0 && (
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        evento.autorizadosCount === evento.participantesCount ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {evento.autorizadosCount}/{evento.participantesCount} autorizações completas
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 pt-0 mt-auto">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetailsId(evento.id)}>
                    <Users size={14} className="mr-1.5" /> Programa & Elenco
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(evento); setModalOpen(true); }} title="Editar">
                    <Pencil size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(evento)} title="Excluir">
                    <Trash2 size={15} />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <EventoModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} />
      )}

      <EventoDetalhes eventId={detailsId} onClose={() => setDetailsId(null)} />

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
