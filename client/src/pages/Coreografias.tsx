import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Music, Plus, Search, Pencil, Trash2, Users, Loader2, Video,
  UserPlus, X, Sparkles, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

// ─── Metadados de exibição ────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; className: string }> = {
  em_montagem: { label: "Em montagem", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  ensaiando: { label: "Ensaiando", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  pronta: { label: "Pronta", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  arquivada: { label: "Arquivada", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
};

const NIVEL_LABEL: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  todas: "Todas as idades",
};

const FORMACAO_LABEL: Record<string, string> = {
  solo: "Solo",
  duo: "Duo",
  grupo: "Grupo",
  formacao: "Formação",
};

const CAST_STATUS_META: Record<string, { label: string; className: string }> = {
  convidado: { label: "Convidado", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  confirmado: { label: "Confirmado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  desistiu: { label: "Desistiu", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  substituto: { label: "Substituto", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
};

function youtubeThumb(videoId?: string | null) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

type CoreografiaRow = {
  id: number;
  title: string;
  modalidadeId: number | null;
  modalidadeName: string | null;
  professorId: number | null;
  professorName: string | null;
  nivel: string;
  formacao: string;
  musica: string | null;
  descricao: string | null;
  videoUrl: string | null;
  videoId: string | null;
  status: string;
  eventId: number | null;
  elencoCount: number;
  progressoMedio: number;
};

type CoreografiaForm = {
  title: string;
  modalidadeId: string;
  professorId: string;
  nivel: string;
  formacao: string;
  musica: string;
  videoUrl: string;
  descricao: string;
  status: string;
};

const EMPTY_FORM: CoreografiaForm = {
  title: "",
  modalidadeId: "none",
  professorId: "none",
  nivel: "todas",
  formacao: "grupo",
  musica: "",
  videoUrl: "",
  descricao: "",
  status: "em_montagem",
};

// ─── Modal de criação/edição ─────────────────────────────────────────────────

function CoreografiaModal({ open, onClose, editing }: {
  open: boolean;
  onClose: () => void;
  editing: CoreografiaRow | null;
}) {
  const utils = trpc.useUtils();
  const { data: modalidades = [] } = trpc.instruments.list.useQuery();
  const { data: professores = [] } = trpc.professores.list.useQuery();

  const [form, setForm] = useState<CoreografiaForm>(() => editing ? {
    title: editing.title,
    modalidadeId: editing.modalidadeId ? String(editing.modalidadeId) : "none",
    professorId: editing.professorId ? String(editing.professorId) : "none",
    nivel: editing.nivel,
    formacao: editing.formacao,
    musica: editing.musica ?? "",
    videoUrl: editing.videoUrl ?? "",
    descricao: editing.descricao ?? "",
    status: editing.status,
  } : EMPTY_FORM);

  const set = (key: keyof CoreografiaForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    title: form.title.trim(),
    modalidadeId: form.modalidadeId === "none" ? null : Number(form.modalidadeId),
    professorId: form.professorId === "none" ? null : Number(form.professorId),
    nivel: form.nivel as any,
    formacao: form.formacao as any,
    musica: form.musica.trim() || null,
    videoUrl: form.videoUrl.trim() || null,
    descricao: form.descricao.trim() || null,
    status: form.status as any,
    eventId: editing?.eventId ?? null,
  });

  const createMutation = trpc.coreografias.create.useMutation({
    onSuccess: () => {
      toast.success("Coreografia criada!");
      utils.coreografias.list.invalidate();
      utils.coreografias.stats.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.coreografias.update.useMutation({
    onSuccess: () => {
      toast.success("Coreografia atualizada!");
      utils.coreografias.list.invalidate();
      utils.coreografias.stats.invalidate();
      utils.coreografias.getById.invalidate({ id: editing!.id });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (form.title.trim().length < 2) {
      toast.error("Informe o nome da coreografia.");
      return;
    }
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
            <Music className="text-indigo-500" size={20} />
            {editing ? "Editar coreografia" : "Nova coreografia"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome da coreografia *</Label>
            <Input
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Ex.: Quebra-Nozes — Valsa das Flores"
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Modalidade / Ritmo</Label>
            <Select value={form.modalidadeId} onValueChange={(value) => set("modalidadeId", value)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não definir</SelectItem>
                {professores.map((professor: any) => (
                  <SelectItem key={professor.userId} value={String(professor.userId)}>{professor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Nível</Label>
            <Select value={form.nivel} onValueChange={(value) => set("nivel", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NIVEL_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Formação</Label>
            <Select value={form.formacao} onValueChange={(value) => set("formacao", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FORMACAO_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Música / Trilha</Label>
            <Input
              value={form.musica}
              onChange={(event) => set("musica", event.target.value)}
              placeholder="Ex.: Valsa das Flores — Tchaikovsky"
              maxLength={255}
            />
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

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Vídeo de marcação (YouTube)</Label>
            <Input
              value={form.videoUrl}
              onChange={(event) => set("videoUrl", event.target.value)}
              placeholder="https://youtu.be/..."
            />
            <p className="text-[11px] text-muted-foreground font-medium">
              O link é validado pelo sistema — o aluno assiste dentro do portal.
            </p>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição / Observações</Label>
            <Textarea
              value={form.descricao}
              onChange={(event) => set("descricao", event.target.value)}
              placeholder="Notas de montagem, figurino, formação de palco..."
              rows={3}
              maxLength={5000}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar alterações" : "Criar coreografia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de elenco ─────────────────────────────────────────────────────────

function ElencoModal({ coreografiaId, onClose }: { coreografiaId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string } | null>(null);
  const [papel, setPapel] = useState("");
  // Buffer do slider de progresso: evita 1 mutation por tick do arrasto.
  const [progressDraft, setProgressDraft] = useState<Record<number, number>>({});

  const { data, isLoading } = trpc.coreografias.getById.useQuery(
    { id: coreografiaId! },
    { enabled: coreografiaId !== null }
  );

  const { data: searchResults = [] } = trpc.coreografias.searchAlunos.useQuery(
    { q: studentSearch, coreografiaId: coreografiaId ?? undefined },
    { enabled: coreografiaId !== null && studentSearch.trim().length >= 2 }
  );

  const invalidate = () => {
    utils.coreografias.getById.invalidate({ id: coreografiaId! });
    utils.coreografias.list.invalidate();
    utils.coreografias.stats.invalidate();
  };

  const addAluno = trpc.coreografias.addAluno.useMutation({
    onSuccess: () => {
      toast.success("Aluno adicionado ao elenco!");
      setSelectedStudent(null);
      setStudentSearch("");
      setPapel("");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateAluno = trpc.coreografias.updateAluno.useMutation({
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const removeAluno = trpc.coreografias.removeAluno.useMutation({
    onSuccess: () => {
      toast.success("Aluno removido do elenco.");
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const commitProgress = (memberId: number) => {
    const value = progressDraft[memberId];
    if (value === undefined) return;
    updateAluno.mutate({ id: memberId, progresso: value }, {
      onSettled: () => {
        setProgressDraft((prev) => {
          const next = { ...prev };
          delete next[memberId];
          return next;
        });
      },
    });
  };

  const elenco = data?.elenco ?? [];

  return (
    <Dialog open={coreografiaId !== null} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Users className="text-indigo-500" size={20} />
            Elenco — {data?.title ?? "..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : (
          <div className="space-y-6 mt-2">
            {/* Adicionar aluno */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <UserPlus size={14} /> Escalar aluno
              </p>

              {selectedStudent ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-bold">{selectedStudent.name}</Badge>
                  <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-rose-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
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
                          onClick={() => { setSelectedStudent(student); setStudentSearch(""); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                        >
                          {student.name}
                          <span className="text-[10px] uppercase font-black text-muted-foreground ml-2">{student.level}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={papel}
                  onChange={(event) => setPapel(event.target.value)}
                  placeholder="Papel (ex.: Solo, Corpo de baile)"
                  maxLength={120}
                  className="flex-1"
                />
                <Button
                  disabled={!selectedStudent || addAluno.isPending}
                  onClick={() => {
                    if (!selectedStudent || !coreografiaId) return;
                    addAluno.mutate({ coreografiaId, studentId: selectedStudent.id, papel: papel.trim() || null });
                  }}
                >
                  {addAluno.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} className="mr-1" />}
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Lista do elenco */}
            <div className="space-y-3">
              {elenco.length === 0 && (
                <div className="text-center py-10 rounded-2xl border-2 border-dashed border-border">
                  <Users className="mx-auto text-muted-foreground opacity-30 mb-2" size={32} />
                  <p className="text-sm font-bold text-muted-foreground">Nenhum aluno escalado ainda.</p>
                </div>
              )}

              {elenco.map((membro: any) => (
                <div key={membro.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="w-10 h-10 shrink-0">
                      {membro.studentAvatar ? (
                        <img src={membro.studentAvatar} alt={membro.studentName} className="w-full h-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-indigo-600 text-white text-xs font-black">
                          {membro.studentName?.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{membro.studentName}</p>
                      <p className="text-[11px] text-muted-foreground font-medium truncate">
                        {membro.papel || "Sem papel definido"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={membro.status}
                      onValueChange={(value) => updateAluno.mutate({ id: membro.id, status: value as any })}
                    >
                      <SelectTrigger className="w-[140px] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CAST_STATUS_META).map(([value, meta]) => (
                          <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3 lg:w-[240px]">
                    <Progress value={progressDraft[membro.id] ?? membro.progresso} className="h-2 flex-1" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progressDraft[membro.id] ?? membro.progresso}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setProgressDraft((prev) => ({ ...prev, [membro.id]: value }));
                      }}
                      onPointerUp={() => commitProgress(membro.id)}
                      onTouchEnd={() => commitProgress(membro.id)}
                      onKeyUp={() => commitProgress(membro.id)}
                      onBlur={() => commitProgress(membro.id)}
                      className="w-24 accent-indigo-600"
                      title={`Domínio da coreografia: ${progressDraft[membro.id] ?? membro.progresso}%`}
                    />
                    <span className="text-xs font-black text-muted-foreground w-9 text-right">
                      {progressDraft[membro.id] ?? membro.progresso}%
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-rose-500 shrink-0"
                    onClick={() => removeAluno.mutate({ id: membro.id })}
                    title="Remover do elenco"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Coreografias() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todas");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CoreografiaRow | null>(null);
  const [elencoId, setElencoId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<CoreografiaRow | null>(null);

  const { data: stats } = trpc.coreografias.stats.useQuery();
  const { data: coreografias = [], isLoading } = trpc.coreografias.list.useQuery({
    search: search.trim() || undefined,
    status: statusFilter === "todas" ? undefined : (statusFilter as any),
  });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.coreografias.delete.useMutation({
    onSuccess: () => {
      toast.success("Coreografia excluída.");
      setDeleting(null);
      utils.coreografias.list.invalidate();
      utils.coreografias.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const kpis = useMemo(() => ([
    { label: "Coreografias", value: stats?.total ?? 0, icon: Music, className: "text-indigo-500" },
    { label: "Em montagem", value: stats?.em_montagem ?? 0, icon: Timer, className: "text-amber-500" },
    { label: "Ensaiando", value: stats?.ensaiando ?? 0, icon: Sparkles, className: "text-blue-500" },
    { label: "Prontas p/ palco", value: stats?.pronta ?? 0, icon: Video, className: "text-emerald-500" },
    { label: "Alunos no elenco", value: stats?.elenco ?? 0, icon: Users, className: "text-purple-500" },
  ]), [stats]);

  return (
    <div className="flex-1 space-y-6 lg:space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Music className="text-indigo-500" size={28} />
            Coreografias
          </h1>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Monte o repertório de palco: elenco, trilha, vídeo de marcação e progresso de cada bailarino.
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus size={16} className="mr-2" /> Nova coreografia
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou música..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os status</SelectItem>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : coreografias.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Music className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhuma coreografia encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Crie a primeira coreografia para começar a montar o elenco.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {coreografias.map((coreografia: CoreografiaRow, index: number) => {
            const statusMeta = STATUS_META[coreografia.status] ?? STATUS_META.em_montagem;
            const thumb = youtubeThumb(coreografia.videoId);
            return (
              <motion.div
                key={coreografia.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col"
              >
                {thumb ? (
                  <button
                    className="relative h-36 w-full overflow-hidden group"
                    onClick={() => window.open(coreografia.videoUrl!, "_blank", "noopener,noreferrer")}
                    title="Assistir vídeo de marcação"
                  >
                    <img src={thumb} alt={coreografia.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Video className="text-white" size={28} />
                    </div>
                  </button>
                ) : null}

                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-foreground leading-tight truncate">{coreografia.title}</h3>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                        {coreografia.modalidadeName || "Sem modalidade"} · {FORMACAO_LABEL[coreografia.formacao]}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                  </div>

                  {coreografia.musica && (
                    <p className="text-xs font-medium text-muted-foreground truncate">🎵 {coreografia.musica}</p>
                  )}

                  <div className="text-xs font-medium text-muted-foreground">
                    {coreografia.professorName ? `Professor(a): ${coreografia.professorName}` : "Sem professor definido"}
                    {" · "}
                    {NIVEL_LABEL[coreografia.nivel]}
                  </div>

                  <div className="space-y-1.5 mt-auto">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center gap-1"><Users size={12} /> {coreografia.elencoCount} no elenco</span>
                      <span>{coreografia.progressoMedio}% domínio</span>
                    </div>
                    <Progress value={coreografia.progressoMedio} className="h-1.5" />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setElencoId(coreografia.id)}>
                      <Users size={14} className="mr-1.5" /> Elenco
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(coreografia); setModalOpen(true); }} title="Editar">
                      <Pencil size={15} />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(coreografia)} title="Excluir">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <CoreografiaModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          editing={editing}
        />
      )}

      <ElencoModal coreografiaId={elencoId} onClose={() => setElencoId(null)} />

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coreografia?</AlertDialogTitle>
            <AlertDialogDescription>
              A coreografia "{deleting?.title}" e todo o elenco escalado serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
