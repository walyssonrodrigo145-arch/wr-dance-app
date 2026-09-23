import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Users, Plus, Search, Pencil, Trash2, Loader2, DoorOpen, Clock, X,
  UserPlus, ArrowUpCircle, Star, GraduationCap, CalendarPlus, ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { GerarAulasModal } from "@/components/turmas/GerarAulasModal";
import { TurmaAttendanceModal } from "@/components/turmas/TurmaAttendanceModal";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const LEVEL_LABEL: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  todas: "Todas as idades",
};

const TURMA_STATUS_META: Record<string, { label: string; className: string }> = {
  ativa: { label: "Ativa", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  pausada: { label: "Pausada", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  encerrada: { label: "Encerrada", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
};

const ENROLLMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  ativa: { label: "Matriculado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  espera: { label: "Lista de espera", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  cancelada: { label: "Cancelada", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
};

function formatGrade(weekdays: number[] | null | undefined, timeStr: string | null | undefined, durationMinutes: number) {
  const days = (weekdays ?? []).slice().sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day] ?? day).join(", ");
  if (!days && !timeStr) return "Grade a definir";
  return `${days || "Dia a definir"}${timeStr ? ` · ${timeStr}` : ""}${durationMinutes ? ` (${durationMinutes}min)` : ""}`;
}

/** "6 a 9 anos" | "A partir de 6 anos" | "Até 9 anos" | null */
function formatFaixaEtaria(ageMin: number | null | undefined, ageMax: number | null | undefined): string | null {
  if (ageMin != null && ageMax != null) return `${ageMin} a ${ageMax} anos`;
  if (ageMin != null) return `A partir de ${ageMin} anos`;
  if (ageMax != null) return `Até ${ageMax} anos`;
  return null;
}

type TurmaRow = {
  id: number;
  name: string;
  modalidadeId: number | null;
  modalidadeName: string | null;
  professorId: number | null;
  professorName: string | null;
  studioRoomId: number | null;
  roomName: string | null;
  weekdays: number[] | null;
  timeStr: string | null;
  durationMinutes: number;
  capacity: number;
  ageMin: number | null;
  ageMax: number | null;
  shift: string | null;
  matriculados: number;
  espera: number;
  vagas: number;
  level: string;
  status: string;
  notes: string | null;
};

// ─── Modal de turma ───────────────────────────────────────────────────────────

function TurmaModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: TurmaRow | null }) {
  const utils = trpc.useUtils();
  const { data: modalidades = [] } = trpc.instruments.list.useQuery();
  const { data: professores = [] } = trpc.professores.list.useQuery();
  const { data: salas = [] } = trpc.studioRooms.list.useQuery();
  const { data: turnos = [] } = trpc.settings.getShifts.useQuery();

  const [form, setForm] = useState(() => editing ? {
    name: editing.name,
    modalidadeId: editing.modalidadeId ? String(editing.modalidadeId) : "none",
    professorId: editing.professorId ? String(editing.professorId) : "none",
    studioRoomId: editing.studioRoomId ? String(editing.studioRoomId) : "none",
    weekdays: editing.weekdays ?? [],
    timeStr: editing.timeStr ?? "",
    durationMinutes: String(editing.durationMinutes),
    capacity: String(editing.capacity),
    ageMin: editing.ageMin != null ? String(editing.ageMin) : "",
    ageMax: editing.ageMax != null ? String(editing.ageMax) : "",
    shift: editing.shift ?? "none",
    level: editing.level,
    status: editing.status,
    notes: editing.notes ?? "",
  } : {
    name: "", modalidadeId: "none", professorId: "none", studioRoomId: "none",
    weekdays: [] as number[], timeStr: "", durationMinutes: "60", capacity: "20",
    ageMin: "", ageMax: "", shift: "none",
    level: "todas", status: "ativa", notes: "",
  });

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleWeekday = (day: number) => {
    set("weekdays", form.weekdays.includes(day)
      ? form.weekdays.filter((item) => item !== day)
      : [...form.weekdays, day].sort((a, b) => a - b));
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    modalidadeId: form.modalidadeId === "none" ? null : Number(form.modalidadeId),
    professorId: form.professorId === "none" ? null : Number(form.professorId),
    studioRoomId: form.studioRoomId === "none" ? null : Number(form.studioRoomId),
    weekdays: form.weekdays,
    timeStr: form.timeStr || null,
    durationMinutes: Math.max(15, parseInt(form.durationMinutes, 10) || 60),
    capacity: Math.max(1, parseInt(form.capacity, 10) || 20),
    ageMin: form.ageMin ? Math.max(0, parseInt(form.ageMin, 10) || 0) : null,
    ageMax: form.ageMax ? Math.max(0, parseInt(form.ageMax, 10) || 0) : null,
    shift: form.shift === "none" ? null : form.shift,
    level: form.level as any,
    status: form.status as any,
    notes: form.notes.trim() || null,
  });

  const createMutation = trpc.turmas.create.useMutation({
    onSuccess: () => { toast.success("Turma criada!"); utils.turmas.list.invalidate(); utils.turmas.stats.invalidate(); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.turmas.update.useMutation({
    onSuccess: () => { toast.success("Turma atualizada!"); utils.turmas.list.invalidate(); utils.turmas.stats.invalidate(); onClose(); },
    onError: (error) => toast.error(error.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (form.name.trim().length < 2) { toast.error("Informe o nome da turma."); return; }
    if (editing) updateMutation.mutate({ id: editing.id, ...buildPayload() });
    else createMutation.mutate(buildPayload());
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Users className="text-indigo-500" size={20} />
            {editing ? "Editar turma" : "Nova turma"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome da turma *</Label>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: Ballet Infantil — Seg/Qua 18h" maxLength={255} />
          </div>

          <div className="space-y-1.5">
            <Label>Modalidade / Ritmo</Label>
            <Select value={form.modalidadeId} onValueChange={(value) => set("modalidadeId", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definir</SelectItem>
                {modalidades.map((modalidade: any) => (
                  <SelectItem key={modalidade.id} value={String(modalidade.id)}>{modalidade.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Professor / Coreógrafo</Label>
            <Select value={form.professorId} onValueChange={(value) => set("professorId", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definir</SelectItem>
                {professores.map((professor: any) => (
                  <SelectItem key={professor.userId} value={String(professor.userId)}>{professor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Sala / Estúdio</Label>
            <Select value={form.studioRoomId} onValueChange={(value) => set("studioRoomId", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definir</SelectItem>
                {salas.map((sala: any) => (
                  <SelectItem key={sala.id} value={String(sala.id)}>{sala.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Nível</Label>
            <Select value={form.level} onValueChange={(value) => set("level", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEVEL_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Idade mínima (anos)</Label>
            <Input type="number" min={0} max={120} value={form.ageMin} onChange={(event) => set("ageMin", event.target.value)} placeholder="Ex.: 6" />
          </div>

          <div className="space-y-1.5">
            <Label>Idade máxima (anos)</Label>
            <Input type="number" min={0} max={120} value={form.ageMax} onChange={(event) => set("ageMax", event.target.value)} placeholder="Ex.: 9" />
          </div>

          <div className="space-y-1.5">
            <Label>Turno</Label>
            <Select value={form.shift} onValueChange={(value) => set("shift", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definir</SelectItem>
                {(turnos as any[]).map((turno, index) => (
                  <SelectItem key={`${turno.name}-${index}`} value={turno.name}>{turno.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs font-black border transition-all",
                    form.weekdays.includes(day)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-card text-muted-foreground border-border hover:border-indigo-400"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Horário</Label>
            <Input type="time" value={form.timeStr} onChange={(event) => set("timeStr", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Duração (min)</Label>
            <Input type="number" min={15} value={form.durationMinutes} onChange={(event) => set("durationMinutes", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Capacidade (vagas)</Label>
            <Input type="number" min={1} value={form.capacity} onChange={(event) => set("capacity", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TURMA_STATUS_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} maxLength={2000} placeholder="Requisitos, uniforme, observações da turma..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar alterações" : "Criar turma"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de matrículas ──────────────────────────────────────────────────────

function TurmaDetalhes({ turmaId, onClose }: { turmaId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [studentSearch, setStudentSearch] = useState("");

  const { data, isLoading } = trpc.turmas.getById.useQuery({ id: turmaId! }, { enabled: turmaId !== null });

  const { data: searchResults = [] } = trpc.turmas.searchAlunos.useQuery(
    { q: studentSearch, turmaId: turmaId ?? undefined },
    { enabled: turmaId !== null && studentSearch.trim().length >= 2 }
  );

  const invalidate = () => {
    utils.turmas.getById.invalidate({ id: turmaId! });
    utils.turmas.list.invalidate();
    utils.turmas.stats.invalidate();
  };

  const enroll = trpc.turmas.enroll.useMutation({
    onSuccess: (result) => {
      toast.success(result.waitlisted
        ? "Turma lotada — aluno entrou na lista de espera."
        : "Aluno matriculado!");
      setStudentSearch("");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateEnrollment = trpc.turmas.updateEnrollment.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const cancelEnrollment = trpc.turmas.cancelEnrollment.useMutation({
    onSuccess: (result) => {
      toast.success(result.promoted
        ? "Matrícula removida — o próximo da lista de espera foi promovido automaticamente."
        : "Matrícula removida.");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const promoteFromWaitlist = trpc.turmas.promoteFromWaitlist.useMutation({
    onSuccess: () => { toast.success("Aluno promovido para a turma!"); invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  const alunos = data?.alunos ?? [];
  const ativos = alunos.filter((aluno: any) => aluno.status === "ativa");
  const espera = alunos.filter((aluno: any) => aluno.status === "espera");

  return (
    <Dialog open={turmaId !== null} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Users className="text-indigo-500" size={20} />
            {data?.name ?? "..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>
        ) : (
          <div className="space-y-6 mt-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground">
              <span className="flex items-center gap-1"><Clock size={12} className="text-indigo-500" /> {formatGrade(data?.weekdays, data?.timeStr, data?.durationMinutes ?? 60)}</span>
              <span>·</span>
              <span>{ativos.length}/{data?.capacity} vagas ocupadas</span>
              <span>·</span>
              <span className="flex items-center gap-1"><ArrowUpCircle size={12} className="text-amber-500" /> {espera.length} na espera</span>
            </div>

            {/* Adicionar aluno */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <UserPlus size={14} /> Matricular aluno
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                <Input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Buscar aluno ativo por nome ou e-mail..."
                  className="pl-9"
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((student: any) => (
                      <button
                        key={student.id}
                        onClick={() => { enroll.mutate({ turmaId: turmaId!, studentId: student.id }); setStudentSearch(""); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        {student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium">
                Sem vaga disponível? O aluno entra automaticamente na lista de espera.
              </p>
            </div>

            {/* Matriculados */}
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Matriculados ({ativos.length})
              </p>
              {ativos.length === 0 ? (
                <p className="text-sm font-medium text-muted-foreground text-center py-6 rounded-2xl border-2 border-dashed border-border">
                  Nenhum aluno matriculado ainda.
                </p>
              ) : (
                ativos.map((aluno: any) => (
                  <div key={aluno.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <Avatar className="w-9 h-9 shrink-0">
                      {aluno.studentAvatar ? (
                        <img src={aluno.studentAvatar} alt={aluno.studentName} className="w-full h-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-indigo-600 text-white text-[10px] font-black">
                          {aluno.studentName?.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{aluno.studentName}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{LEVEL_LABEL[aluno.studentLevel] ?? aluno.studentLevel}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-rose-500"
                      onClick={() => cancelEnrollment.mutate({ id: aluno.id })}
                      title="Remover da turma (promove o próximo da espera)"
                    >
                      <X size={15} />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Lista de espera */}
            {espera.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">
                  <ArrowUpCircle size={14} /> Lista de espera ({espera.length})
                </p>
                {espera.map((aluno: any) => (
                  <div key={aluno.id} className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-700 text-xs font-black flex items-center justify-center shrink-0">
                      {aluno.position}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{aluno.studentName}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => promoteFromWaitlist.mutate({ id: aluno.id })} disabled={promoteFromWaitlist.isPending}>
                      <Star size={13} className="mr-1" /> Promover
                    </Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => cancelEnrollment.mutate({ id: aluno.id })} title="Remover da espera">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Turmas() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TurmaRow | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<TurmaRow | null>(null);
  const [gradeTurma, setGradeTurma] = useState<TurmaRow | null>(null);
  const [chamadaTurma, setChamadaTurma] = useState<TurmaRow | null>(null);

  const { data: stats } = trpc.turmas.stats.useQuery();
  const { data: turmasList = [], isLoading } = trpc.turmas.list.useQuery({
    search: search.trim() || undefined,
    status: statusFilter === "todas" ? undefined : (statusFilter as any),
  });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.turmas.delete.useMutation({
    onSuccess: () => {
      toast.success("Turma excluída.");
      setDeleting(null);
      utils.turmas.list.invalidate();
      utils.turmas.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const kpis = useMemo(() => ([
    { label: "Turmas ativas", value: stats?.turmasAtivas ?? 0, icon: Users, className: "text-indigo-500" },
    { label: "Matriculados", value: stats?.matriculados ?? 0, icon: GraduationCap, className: "text-blue-500" },
    { label: "Vagas abertas", value: stats?.vagasAbertas ?? 0, icon: DoorOpen, className: "text-emerald-500" },
    { label: "Na espera", value: stats?.espera ?? 0, icon: ArrowUpCircle, className: "text-amber-500" },
  ]), [stats]);

  return (
    <div className="flex-1 space-y-6 lg:space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Users className="text-indigo-500" size={28} />
            Turmas & Vagas
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Turmas fixas com capacidade, grade semanal e lista de espera com promoção automática.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus size={16} className="mr-2" /> Nova turma
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
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar turma..." className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {Object.entries(TURMA_STATUS_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : turmasList.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Users className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhuma turma cadastrada</p>
          <p className="text-sm text-muted-foreground mt-1">Crie a primeira turma para controlar vagas e lista de espera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {turmasList.map((turma: TurmaRow, index: number) => {
            const statusMeta = TURMA_STATUS_META[turma.status] ?? TURMA_STATUS_META.ativa;
            const ocupacao = turma.capacity > 0 ? Math.round((turma.matriculados / turma.capacity) * 100) : 0;
            return (
              <motion.div
                key={turma.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3 flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-black text-foreground truncate">{turma.name}</h3>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                      {turma.modalidadeName || "Sem modalidade"} · {LEVEL_LABEL[turma.level] ?? turma.level}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", statusMeta.className)}>
                    {statusMeta.label}
                  </Badge>
                </div>

                <div className="text-xs font-medium text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5"><Clock size={12} className="shrink-0 text-indigo-500" /> {formatGrade(turma.weekdays, turma.timeStr, turma.durationMinutes)}</p>
                  {(turma.shift || formatFaixaEtaria(turma.ageMin, turma.ageMax)) && (
                    <p className="flex flex-wrap items-center gap-1.5">
                      {turma.shift && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest">{turma.shift}</span>
                      )}
                      {formatFaixaEtaria(turma.ageMin, turma.ageMax) && (
                        <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 text-[9px] font-black uppercase tracking-widest">{formatFaixaEtaria(turma.ageMin, turma.ageMax)}</span>
                      )}
                    </p>
                  )}
                  {turma.professorName && <p>Professor(a): {turma.professorName}</p>}
                  {turma.roomName && <p className="flex items-center gap-1.5"><DoorOpen size={12} className="shrink-0 text-indigo-500" /> {turma.roomName}</p>}
                </div>

                <div className="space-y-1.5 mt-auto pt-2">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>{turma.matriculados}/{turma.capacity} vagas</span>
                    <span className={cn(turma.vagas === 0 ? "text-rose-600" : "text-emerald-600")}>
                      {turma.vagas === 0 ? "LOTADA" : `${turma.vagas} livre(s)`}
                    </span>
                  </div>
                  <Progress value={ocupacao} className="h-1.5" />
                  {turma.espera > 0 && (
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1">
                      <ArrowUpCircle size={12} /> {turma.espera} na lista de espera
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetailsId(turma.id)}>
                    <Users size={14} className="mr-1.5" /> Matrículas
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setGradeTurma(turma)} title="Gerar aulas da grade">
                    <CalendarPlus size={15} />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setChamadaTurma(turma)} title="Fazer chamada de hoje">
                    <ClipboardCheck size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(turma); setModalOpen(true); }} title="Editar">
                    <Pencil size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(turma)} title="Excluir">
                    <Trash2 size={15} />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <TurmaModal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} editing={editing} />
      )}

      <TurmaDetalhes turmaId={detailsId} onClose={() => setDetailsId(null)} />

      <GerarAulasModal
        turmaId={gradeTurma?.id ?? null}
        turmaName={gradeTurma?.name}
        open={gradeTurma !== null}
        onOpenChange={(o) => { if (!o) setGradeTurma(null); }}
      />

      <TurmaAttendanceModal
        turmaId={chamadaTurma?.id ?? null}
        turmaName={chamadaTurma?.name}
        open={chamadaTurma !== null}
        onOpenChange={(o) => { if (!o) setChamadaTurma(null); }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir turma?</AlertDialogTitle>
            <AlertDialogDescription>
              A turma "{deleting?.name}" será removida junto com as matrículas e a lista de espera. Esta ação não pode ser desfeita.
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
