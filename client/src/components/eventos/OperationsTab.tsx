import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import {
  Users, ClipboardList, AlertTriangle, LayoutList, Plus, Pencil, Trash2,
  Loader2, CheckCircle2, Clock, Phone, MapPin, Wallet, TrendingDown, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { BackstageTab } from "@/components/eventos/BackstageTab";

type OpsView = "backstage" | "equipe" | "checklist" | "ocorrencias";

export function OperationsTab({ eventId }: { eventId: number }) {
  const [view, setView] = useState<OpsView>("backstage");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { key: "backstage", label: "Backstage", icon: LayoutList },
          { key: "equipe", label: "Equipe", icon: Users },
          { key: "checklist", label: "Checklist", icon: ClipboardList },
          { key: "ocorrencias", label: "Ocorrências", icon: AlertTriangle },
        ] as Array<{ key: OpsView; label: string; icon: any }>).map((v) => {
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
              <Icon size={13} /> {v.label}
            </button>
          );
        })}
      </div>
      {view === "backstage" && <BackstageTab eventId={eventId} />}
      {view === "equipe" && <StaffView eventId={eventId} />}
      {view === "checklist" && <ChecklistView eventId={eventId} />}
      {view === "ocorrencias" && <IncidentsView eventId={eventId} />}
    </div>
  );
}

// ═══════════════ EQUIPE ═══════════════

const STAFF_ROLE_SUGGESTIONS = ["Backstage infantil", "Camarim", "Check-in", "Bilheteria", "Palco", "Som", "Recepção", "Iluminação", "Segurança"];

function StaffView({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: staff = [], isLoading } = trpc.eventos.staffList.useQuery({ eventId });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const invalidate = () => utils.eventos.staffList.invalidate({ eventId });
  const delMut = trpc.eventos.staffDelete.useMutation({
    onSuccess: () => { toast.success("Membro removido."); setDeleting(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20">
          <Plus size={14} className="mr-1.5" /> Adicionar membro
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Users size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Nenhum membro na equipe</p>
          <p className="text-xs text-muted-foreground mt-1">Cadastre backstage, camarim, check-in, palco, som e recepção com horário e responsabilidade.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(staff as any[]).map((m) => (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500"><Users size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-foreground flex flex-wrap items-center gap-2">
                  {m.name}
                  <Badge variant="outline" className="text-[9px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30">{m.role}</Badge>
                </p>
                <p className="text-[11px] font-bold text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {m.timeLabel && <span className="flex items-center gap-1"><Clock size={11} /> {m.timeLabel}</span>}
                  {m.location && <span className="flex items-center gap-1"><MapPin size={11} /> {m.location}</span>}
                  {m.phone && <span className="flex items-center gap-1"><Phone size={11} /> {m.phone}</span>}
                  {m.responsibility && <span className="truncate">{m.responsibility}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(m); setDialogOpen(true); }}><Pencil size={14} /></Button>
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Remover" onClick={() => setDeleting(m)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <StaffDialog eventId={eventId} editing={editing} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); invalidate(); }} />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleting?.name} da equipe?</AlertDialogTitle>
            <AlertDialogDescription>O membro será removido apenas deste evento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && delMut.mutate({ id: deleting.id })}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StaffDialog({ eventId, editing, onClose, onSaved }: {
  eventId: number; editing: any | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState(editing?.role ?? "");
  const [timeLabel, setTimeLabel] = useState(editing?.timeLabel ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [responsibility, setResponsibility] = useState(editing?.responsibility ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");

  const createMut = trpc.eventos.staffCreate.useMutation({
    onSuccess: () => { toast.success("Membro adicionado!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.eventos.staffUpdate.useMutation({
    onSuccess: () => { toast.success("Membro atualizado!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const saving = createMut.isPending || updateMut.isPending;

  const submit = () => {
    if (name.trim().length < 2) { toast.error("Informe o nome."); return; }
    if (role.trim().length < 2) { toast.error("Informe a função."); return; }
    const payload = {
      name: name.trim(), role: role.trim(),
      timeLabel: timeLabel.trim() || null, location: location.trim() || null,
      responsibility: responsibility.trim() || null, phone: phone.trim() || null,
    };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate({ eventId, ...payload });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black"><Users className="text-indigo-500" size={20} /> {editing ? "Editar membro" : "Novo membro da equipe"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fernanda" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Função *</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex.: Backstage infantil" maxLength={80} list="staff-roles" />
            <datalist id="staff-roles">
              {STAFF_ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Horário</Label>
            <Input value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="Ex.: 17:00–22:00" maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Camarim 2 / Portaria" maxLength={120} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Responsabilidade</Label>
            <Textarea value={responsibility} onChange={(e) => setResponsibility(e.target.value)} rows={2} maxLength={2000} placeholder="Ex.: Receber e liberar as turmas do backstage infantil" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 9..." maxLength={30} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="shadow-md shadow-indigo-500/20">
            {saving && <Loader2 size={14} className="animate-spin mr-2" />} {editing ? "Salvar" : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════ CHECKLIST ═══════════════

const TASK_PRIORITY_META: Record<string, { label: string; className: string }> = {
  baixa: { label: "Baixa", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  media: { label: "Média", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  alta: { label: "Alta", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

const TASK_STATUS_META: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  fazendo: { label: "Fazendo", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  concluida: { label: "Concluída", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

function ChecklistView({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: tasks = [], isLoading } = trpc.eventos.tasksList.useQuery({ eventId });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [filter, setFilter] = useState("todas");

  const invalidate = () => utils.eventos.tasksList.invalidate({ eventId });
  const updateMut = trpc.eventos.taskUpdate.useMutation({ onSuccess: () => invalidate(), onError: (e) => toast.error(e.message) });
  const delMut = trpc.eventos.taskDelete.useMutation({
    onSuccess: () => { toast.success("Tarefa removida."); setDeleting(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (tasks as any[]).filter((t) => filter === "todas" ? true : t.status === filter);
  const done = (tasks as any[]).filter((t) => t.status === "concluida").length;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <p className="text-[11px] font-bold text-muted-foreground flex-1">{done} de {tasks.length} tarefa(s) concluída(s)</p>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="fazendo">Fazendo</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 shrink-0">
          <Plus size={14} className="mr-1.5" /> Nova tarefa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><ClipboardList size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Sem tarefas neste filtro</p>
          <p className="text-xs text-muted-foreground mt-1">Ex.: contratar teatro, confirmar iluminação, receber figurinos, preparar camarins, imprimir programa.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const pr = TASK_PRIORITY_META[t.priority] ?? TASK_PRIORITY_META.media;
            const st = TASK_STATUS_META[t.status] ?? TASK_STATUS_META.pendente;
            return (
              <div key={t.id} className={cn("rounded-2xl border border-border bg-card p-3.5 flex flex-col lg:flex-row lg:items-center gap-3", t.status === "concluida" && "opacity-70")}>
                <button
                  type="button"
                  onClick={() => updateMut.mutate({ id: t.id, status: t.status === "concluida" ? "pendente" : "concluida" })}
                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    t.status === "concluida" ? "bg-emerald-600 border-emerald-600 text-white" : "border-border text-muted-foreground hover:border-emerald-500")}
                  title={t.status === "concluida" ? "Reabrir" : "Concluir"}
                >
                  <CheckCircle2 size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-black text-foreground", t.status === "concluida" && "line-through")}>{t.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {t.responsible && <span>Resp.: {t.responsible}</span>}
                    {t.dueDate && <span className="flex items-center gap-1"><Clock size={11} /> {formatDateOnly(t.dueDate)}</span>}
                    {t.notes && <span className="truncate">{t.notes}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("text-[9px] font-black", pr.className)}>{pr.label}</Badge>
                  <Badge variant="outline" className={cn("text-[9px] font-black", st.className)}>{st.label}</Badge>
                  <Select value={t.status} onValueChange={(v) => updateMut.mutate({ id: t.id, status: v as any })}>
                    <SelectTrigger className="w-[120px] h-8 text-[11px] bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="fazendo">Fazendo</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(t); setDialogOpen(true); }}><Pencil size={14} /></Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Excluir" onClick={() => setDeleting(t)}><Trash2 size={14} /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <TaskDialog eventId={eventId} editing={editing} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); invalidate(); }} />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>"{deleting?.title}" será removida do checklist.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && delMut.mutate({ id: deleting.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaskDialog({ eventId, editing, onClose, onSaved }: {
  eventId: number; editing: any | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [responsible, setResponsible] = useState(editing?.responsible ?? "");
  const [dueDate, setDueDate] = useState(editing?.dueDate ? String(editing.dueDate).slice(0, 10) : "");
  const [priority, setPriority] = useState(editing?.priority ?? "media");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  const createMut = trpc.eventos.taskCreate.useMutation({
    onSuccess: () => { toast.success("Tarefa criada!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.eventos.taskUpdate.useMutation({
    onSuccess: () => { toast.success("Tarefa atualizada!"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const saving = createMut.isPending || updateMut.isPending;

  const submit = () => {
    if (title.trim().length < 2) { toast.error("Informe o título da tarefa."); return; }
    const payload = {
      title: title.trim(),
      responsible: responsible.trim() || null,
      priority: priority as any,
      notes: notes.trim() || null,
      dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
    };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate({ eventId, ...payload });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black"><ClipboardList className="text-indigo-500" size={20} /> {editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Confirmar iluminação com o teatro" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Ex.: Fernanda" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="shadow-md shadow-indigo-500/20">
            {saving && <Loader2 size={14} className="animate-spin mr-2" />} {editing ? "Salvar" : "Criar tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════ OCORRÊNCIAS ═══════════════

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  baixa: { label: "Baixa", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  media: { label: "Média", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  alta: { label: "Alta", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

function IncidentsView({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: incidents = [], isLoading } = trpc.eventos.incidentsList.useQuery({ eventId });
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("media");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);

  const invalidate = () => utils.eventos.incidentsList.invalidate({ eventId });
  const createMut = trpc.eventos.incidentCreate.useMutation({
    onSuccess: () => { toast.success("Ocorrência registrada."); setTitle(""); setDescription(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resolveMut = trpc.eventos.incidentResolve.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const delMut = trpc.eventos.incidentDelete.useMutation({
    onSuccess: () => { toast.success("Ocorrência removida."); setDeleting(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const openCount = (incidents as any[]).filter((i) => i.status === "aberto").length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><AlertTriangle size={13} /> Registrar ocorrência</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que aconteceu? (ex.: figurino rasgou)" maxLength={200} />
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-full sm:w-[140px] bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => { if (title.trim().length < 2) { toast.error("Descreva a ocorrência."); return; } createMut.mutate({ eventId, title: title.trim(), severity: severity as any, description: description.trim() || null }); }}
            disabled={createMut.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 shrink-0"
          >
            {createMut.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />} Registrar
          </Button>
        </div>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes (opcional)" maxLength={2000} className="bg-background" />
      </div>

      <p className="text-[11px] font-bold text-muted-foreground">{openCount} ocorrência(s) em aberto</p>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><AlertTriangle size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Nenhuma ocorrência</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(incidents as any[]).map((i) => {
            const sev = SEVERITY_META[i.severity] ?? SEVERITY_META.media;
            const open = i.status === "aberto";
            return (
              <div key={i.id} className={cn("rounded-2xl border border-border bg-card p-3.5 flex flex-col lg:flex-row lg:items-center gap-3", !open && "opacity-70")}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", open ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500")}>
                  <AlertTriangle size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground">{i.title}</p>
                  <p className="text-[11px] font-bold text-muted-foreground mt-0.5 truncate">
                    {new Date(i.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {i.description ? ` · ${i.description}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("text-[9px] font-black", sev.className)}>{sev.label}</Badge>
                  <Button size="sm" variant="outline" onClick={() => resolveMut.mutate({ id: i.id, resolved: open })} disabled={resolveMut.isPending}>
                    {open ? <><CheckCircle2 size={12} className="mr-1" /> Resolver</> : "Reabrir"}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" title="Excluir" onClick={() => setDeleting(i)}><Trash2 size={14} /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
            <AlertDialogDescription>"{deleting?.title}" será removida do histórico do evento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && delMut.mutate({ id: deleting.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════ FINANCEIRO DO EVENTO ═══════════════

const REVENUE_CATEGORIES = ["Ingressos", "Participações", "Loja", "Figurinos", "Patrocínios", "Fotografia", "Outros"];
const EXPENSE_CATEGORIES = ["Local", "Som", "Iluminação", "Fotografia", "Filmagem", "Segurança", "Figurino", "Decoração", "Equipe", "Outros"];

export function FinanceiroTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: summary } = trpc.eventos.financeSummary.useQuery({ eventId });
  const { data: launches = [], isLoading } = trpc.eventos.financesList.useQuery({ eventId });

  const [kind, setKind] = useState<"receita" | "despesa">("despesa");
  const [category, setCategory] = useState("Local");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("pago");
  const [deleting, setDeleting] = useState<any | null>(null);

  const invalidate = () => {
    utils.eventos.financesList.invalidate({ eventId });
    utils.eventos.financeSummary.invalidate({ eventId });
  };
  const createMut = trpc.eventos.financeCreate.useMutation({
    onSuccess: () => { toast.success("Lançamento adicionado!"); setDescription(""); setAmount(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const delMut = trpc.eventos.financeDelete.useMutation({
    onSuccess: () => { toast.success("Lançamento removido."); setDeleting(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const s = summary ?? {
    lojaArrecadado: 0, lojaPrevisto: 0, ingressos: 0, receitasManuais: 0,
    despesas: 0, despesasPendentes: 0, receitaTotal: 0, resultado: 0,
    ticketMedioLoja: 0, occupancyPct: 0, ticketsSold: 0, pedidosLoja: 0,
  };

  const categories = kind === "receita" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-muted-foreground">
        Financeiro do evento = Loja (pago) + Ingressos (vendidos) + lançamentos manuais − despesas. O financeiro geral continua na área Financeiro do sistema.
      </p>

      {/* Dashboard */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "Receita total", value: formatBRL(s.receitaTotal), note: `loja ${formatBRL(s.lojaArrecadado)} · ingressos ${formatBRL(s.ingressos)}${s.receitasManuais > 0 ? ` · manuais ${formatBRL(s.receitasManuais)}` : ""}`, icon: TrendingUp, tint: "bg-emerald-500/10 text-emerald-500" },
          { label: "Despesas", value: formatBRL(s.despesas), note: s.despesasPendentes > 0 ? `${formatBRL(s.despesasPendentes)} pendente(s)` : "todas pagas", icon: TrendingDown, tint: "bg-rose-500/10 text-rose-500" },
          { label: "Resultado", value: formatBRL(s.resultado), note: s.resultado >= 0 ? "lucro" : "prejuízo até agora", icon: Wallet, tint: s.resultado >= 0 ? "bg-indigo-500/10 text-indigo-500" : "bg-rose-500/10 text-rose-500" },
          { label: "Ocupação & ticket", value: `${s.occupancyPct}%`, note: `ticket médio loja ${formatBRL(s.ticketMedioLoja)}`, icon: Users, tint: "bg-amber-500/10 text-amber-500" },
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="rounded-2xl border border-border bg-card p-4 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tile.tint)}><Icon size={16} /></span>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{tile.label}</p>
              </div>
              <p className="text-lg lg:text-xl font-outfit font-black text-foreground mt-2 truncate">{tile.value}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5 truncate" title={tile.note}>{tile.note}</p>
            </div>
          );
        })}
      </div>

      {/* Lançamento */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Novo lançamento</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <Select value={kind} onValueChange={(v) => { setKind(v as any); setCategory(v === "receita" ? "Patrocínios" : "Local"); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="receita">Receita</SelectItem>
              <SelectItem value="despesa">Despesa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" maxLength={255} className="sm:col-span-2" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" />
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                const value = parseFloat(amount.replace(",", ".")) || 0;
                if (value <= 0) { toast.error("Informe o valor."); return; }
                createMut.mutate({ eventId, kind, category, description: description.trim() || null, amount: value, status: status as any });
              }}
              disabled={createMut.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 shrink-0"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Lançamentos */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : launches.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border-2 border-dashed border-border">
          <div className="flex justify-center mb-2"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary/60"><Wallet size={22} /></span></div>
          <p className="font-black text-foreground text-sm">Sem lançamentos manuais</p>
          <p className="text-xs text-muted-foreground mt-1">Loja e ingressos já entram automaticamente no resumo acima.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(launches as any[]).map((l) => (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", l.kind === "receita" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                {l.kind === "receita" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-foreground truncate">{l.category}{l.description ? ` · ${l.description}` : ""}</p>
                <p className="text-[11px] font-bold text-muted-foreground">{new Date(l.date).toLocaleDateString("pt-BR")}{l.status !== "pago" ? " · pendente" : ""}</p>
              </div>
              <p className={cn("text-sm font-black shrink-0", l.kind === "receita" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {l.kind === "receita" ? "+" : "−"} {formatBRL(l.amount)}
              </p>
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500 shrink-0" title="Excluir" onClick={() => setDeleting(l)}><Trash2 size={14} /></Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.category} — {formatBRL(deleting?.amount ?? 0)} será removido do financeiro do evento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && delMut.mutate({ id: deleting.id })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
