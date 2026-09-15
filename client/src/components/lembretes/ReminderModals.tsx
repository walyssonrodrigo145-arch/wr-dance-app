import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Bell, X, FileText, Plus, Loader2, Pencil, Trash2, Eye } from "lucide-react";
import { ReminderType, Template, TYPE_CONFIG, VARIABLES_HELP } from "./types";

function toLocalInput(date?: Date | null) {
  if (!date) {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    date = d;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ManualReminderModal({ open, onClose, students, templates }: {
  open: boolean; onClose: () => void;
  students: { id: number; name: string; phone?: string | null }[];
  templates: Template[];
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    studentId: "",
    type: "manual" as ReminderType,
    templateId: "",
    message: "",
    scheduledAt: toLocalInput(),
  });
  const [preview, setPreview] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const filteredTemplates = templates.filter(t => t.type === form.type);

  const applyTemplate = (tpl: Template) => {
    const student = students.find(s => s.id === Number(form.studentId));
    const msg = tpl.body
      .replace(/\{nome\}/g, student?.name ?? "[nome]")
      .replace(/\{instrumento\}/g, "[instrumento]")
      .replace(/\{data_aula\}/g, "[data]")
      .replace(/\{hora_aula\}/g, "[hora]")
      .replace(/\{valor\}/g, "[valor]")
      .replace(/\{vencimento\}/g, "[vencimento]")
      .replace(/\{chave_pix\}/g, "[chave_pix]");
    set("message", msg);
    set("templateId", String(tpl.id));
  };

  const createMut = trpc.reminders.create.useMutation({
    onSuccess: () => {
      toast.success("Lembrete criado!");
      utils.reminders.list.invalidate();
      utils.reminders.pendingCount.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSubmit = () => {
    if (!form.message.trim()) { toast.error("Mensagem é obrigatória"); return; }
    createMut.mutate({
      studentId: form.studentId ? Number(form.studentId) : undefined,
      type: form.type,
      message: form.message.trim(),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      templateId: form.templateId ? Number(form.templateId) : undefined,
    });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Bell size={18} className="text-violet-500" />
            </div>
            <h3 className="text-base font-bold text-foreground">Novo Lembrete Manual</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tipo</label>
              <select value={form.type} onChange={e => { set("type", e.target.value); set("templateId", ""); set("message", ""); }}
                className="w-full h-11 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer">
                {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Aluno</label>
              <select value={form.studentId} onChange={e => set("studentId", e.target.value)}
                className="w-full h-11 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer">
                <option value="">— Selecionar —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {filteredTemplates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Usar template</label>
              <div className="flex flex-wrap gap-2">
                {filteredTemplates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)}
                    className={cn("text-xs font-medium px-3 py-1.5 rounded-lg border transition-all",
                      form.templateId === String(t.id)
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}>
                    {t.isDefault === 1 && "⭐ "}{t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mensagem *</label>
              <button onClick={() => setPreview(v => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                <Eye size={12} /> {preview ? "Editar texto" : "Ver prévia"}
              </button>
            </div>
            {preview ? (
              <div className="w-full min-h-[100px] text-sm rounded-xl border border-border bg-muted/30 px-4 py-3 text-foreground whitespace-pre-wrap leading-relaxed">
                {form.message || <span className="text-muted-foreground italic">Nenhuma mensagem</span>}
              </div>
            ) : (
              <textarea value={form.message} onChange={e => set("message", e.target.value)}
                placeholder="Digite a mensagem ou selecione um template acima..."
                rows={5}
                className="w-full text-sm rounded-xl border border-border bg-background px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none transition-shadow" />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Agendar para</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={e => set("scheduledAt", e.target.value)}
              className="w-full h-11 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer" />
          </div>
        </div>

        <div className="flex gap-3 p-5 pt-0">
          <Button variant="outline" className="flex-1 rounded-xl h-11 font-semibold" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 rounded-xl h-11 gap-2 border-0 bg-gradient-to-r from-violet-500 to-primary hover:from-violet-400 hover:to-primary text-white font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Criar Lembrete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: templates = [] } = trpc.reminderTemplates.list.useQuery();
  const [form, setForm] = useState({ name: "", type: "aula" as ReminderType, body: "", isDefault: false });
  const [editId, setEditId] = useState<number | null>(null);
  const setF = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const createMut = trpc.reminderTemplates.create.useMutation({
    onSuccess: () => { toast.success("Template criado!"); utils.reminderTemplates.list.invalidate(); setForm({ name: "", type: "aula", body: "", isDefault: false }); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateMut = trpc.reminderTemplates.update.useMutation({
    onSuccess: () => { toast.success("Template atualizado!"); utils.reminderTemplates.list.invalidate(); setEditId(null); setForm({ name: "", type: "aula", body: "", isDefault: false }); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMut = trpc.reminderTemplates.delete.useMutation({
    onSuccess: () => { toast.success("Template excluído!"); utils.reminderTemplates.list.invalidate(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const startEdit = (t: Template) => {
    setEditId(t.id);
    setForm({ name: t.name, type: t.type, body: t.body, isDefault: t.isDefault === 1 });
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.body.trim()) { toast.error("Nome e corpo são obrigatórios"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground">Templates de Mensagem</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 grid md:grid-cols-5 gap-8">
          <div className="md:col-span-2 space-y-4">
            <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest bg-muted/50 p-2 rounded-lg text-center mb-4">{editId ? "Editar template" : "Novo template"}</h4>
            
            <div className="space-y-3">
              <Input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Nome do template" className="h-11 text-sm rounded-xl focus-visible:ring-primary/50 transition-shadow" />
              <select value={form.type} onChange={e => setF("type", e.target.value)}
                className="w-full h-11 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-shadow cursor-pointer">
                {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <textarea value={form.body} onChange={e => setF("body", e.target.value)}
                placeholder="Corpo da mensagem com variáveis..."
                rows={5}
                className="w-full text-sm rounded-xl border border-border bg-background px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none transition-shadow leading-relaxed" />
              
              <div className="space-y-2 bg-primary/5 p-3 rounded-xl border border-primary/10">
                <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Variáveis Dinâmicas</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES_HELP.map(v => (
                    <button key={v} onClick={() => setF("body", form.body + v)}
                      className="text-[10px] px-2 py-1 rounded bg-background text-foreground border hover:border-primary hover:text-primary font-mono transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-muted/30 rounded-lg transition-colors">
                <input type="checkbox" checked={form.isDefault} onChange={e => setF("isDefault", e.target.checked)}
                  className="rounded w-4 h-4 text-primary focus:ring-primary/50" />
                <span className="text-sm font-medium text-foreground">Usar como template principal deste tipo</span>
              </label>

              <div className="flex gap-2 pt-2">
                {editId && (
                  <Button variant="outline" className="flex-1 rounded-xl h-11 font-semibold" onClick={() => { setEditId(null); setForm({ name: "", type: "aula", body: "", isDefault: false }); }}>
                    Cancelar Edição
                  </Button>
                )}
                <Button className="flex-1 rounded-xl h-11 gap-2 font-bold" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                  {(createMut.isPending || updateMut.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {editId ? "Salvar Alterações" : "Criar Template"}
                </Button>
              </div>
            </div>
          </div>

          <div className="md:col-span-3 space-y-4">
            <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest bg-muted/50 p-2 rounded-lg text-center mb-4">Templates Salvos ({templates.length})</h4>
            
            {templates.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-2xl border border-dashed flex flex-col items-center">
                <FileText size={32} className="text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum template criado ainda.</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">Crie templates para agilizar o envio dos seus lembretes manuais.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {(templates as Template[]).map(t => {
                  const conf = TYPE_CONFIG[t.type];
                  return (
                    <div key={t.id} className={cn("p-4 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-sm", conf.bg, conf.border)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md text-white bg-black/10 dark:bg-black/30")}>
                            {conf.label}
                          </span>
                          <span className={cn("font-bold text-sm flex items-center gap-1", conf.color)}>
                            {t.isDefault === 1 && <span className="text-amber-500">⭐</span>}
                            {t.name}
                          </span>
                        </div>
                        <div className="flex gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(t)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-card/50 dark:bg-black/20 hover:bg-card dark:hover:bg-black/50 transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => deleteMut.mutate({ id: t.id })} className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-100/50 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <p className="text-xs text-foreground/80 bg-card/40 dark:bg-black/20 p-2.5 rounded-lg border border-black/5 leading-relaxed">{t.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ onConfirm, onCancel, isPending }: { onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onCancel} />
      <div className="relative bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5 shadow-inner">
          <Trash2 size={28} className="text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2">Excluir Lembrete</h3>
        <p className="text-sm text-muted-foreground mb-8">Esta ação não poderá ser desfeita. Tem certeza que deseja remover?</p>
        <div className="flex flex-col gap-3">
          <Button variant="destructive" className="w-full rounded-xl h-12 text-sm font-bold gap-2 shadow-lg shadow-red-500/20" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={18} />} Sim, excluir
          </Button>
          <Button variant="outline" className="w-full rounded-xl h-12 text-sm font-semibold border-border hover:bg-muted" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

