import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Guitar, Users, Plus, X, Loader2, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ─── Preset colors ────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

const CATEGORIES = ["Cordas", "Teclas", "Percussão", "Sopro", "Voz", "Outro"];

// ─── Emoji map por instrumento ────────────────────────────────────────────────
const INSTRUMENT_EMOJI: Record<string, string> = {
  // Cordas
  violao: "🎸", guitarra: "🎸", baixo: "🎸", contrabaixo: "🎸",
  ukulele: "🪕", cavaquinho: "🪕", bandolim: "🪕", banjo: "🪕",
  violino: "🎻", viola: "🎻", cello: "🎻", violoncelo: "🎻", contrabaixo_arco: "🎻",
  harpa: "🎵", citara: "🎵",
  // Teclas
  piano: "🎹", teclado: "🎹", orgao: "🎹", órgão: "🎹", sintetizador: "🎹", acordeao: "🪗", acordeão: "🪗",
  // Percussão
  bateria: "🥁", caixa: "🥁", bumbo: "🥁", surdo: "🥁", pandeiro: "🪘",
  cajón: "🪘", cajon: "🪘", congas: "🪘", bongo: "🪘", timbal: "🪘",
  xilofone: "🎵", marimba: "🎵", vibrafone: "🎵", glockenspiel: "🎵",
  // Sopro
  flauta: "🪈", flautim: "🪈", oboé: "🎵", clarinete: "🎵", fagote: "🎵",
  saxofone: "🎷", sax: "🎷",
  trompete: "🎺", trompa: "🎺", trombone: "🎺", tuba: "🎺", flugelhorn: "🎺",
  gaita: "🪗", harmonica: "🪗",
  // Voz
  canto: "🎤", voz: "🎤", vocal: "🎤", coro: "🎤",
  // Outros
  djembe: "🪘", berimbau: "🎵", cuica: "🪘", agogo: "🎵",
};

/** Retorna o emoji mais adequado para o nome do instrumento */
function getInstrumentEmoji(name: string): string {
  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, "");      // remove espaços/símbolos

  // Busca exata
  if (INSTRUMENT_EMOJI[key]) return INSTRUMENT_EMOJI[key];

  // Busca parcial (ex: "Violão Clássico" → "violao")
  for (const [k, emoji] of Object.entries(INSTRUMENT_EMOJI)) {
    if (key.includes(k) || k.includes(key)) return emoji;
  }

  return "🎵"; // fallback genérico
}

type InstrumentRow = {
  id: number; name: string; category: string; color?: string | null;
  studentCount: number | string;
};

// ─── Instrument Icon ──────────────────────────────────────────────────────────
function InstrumentIcon({ name, color, size = 44 }: { name: string; color?: string | null; size?: number }) {
  const emoji = getInstrumentEmoji(name);
  const bg = (color ?? "#6366f1") + "20";
  return (
    <div
      className="rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}
    >
      {emoji}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function InstrumentModal({ open, onClose, editData }: {
  open: boolean; onClose: () => void; editData?: InstrumentRow | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: editData?.name ?? "",
    category: editData?.category ?? "Cordas",
    color: editData?.color ?? "#6366f1",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const createMutation = trpc.instruments.create.useMutation({
    onSuccess: () => {
      toast.success("Instrumento cadastrado!");
      utils.instruments.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.instruments.update.useMutation({
    onSuccess: () => {
      toast.success("Instrumento atualizado!");
      utils.instruments.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editData) {
      updateMutation.mutate({ id: editData.id, name: form.name.trim(), category: form.category, color: form.color });
    } else {
      createMutation.mutate({ name: form.name.trim(), category: form.category, color: form.color });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">{editData ? "Editar Instrumento" : "Novo Instrumento"}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <InstrumentIcon name={form.name} color={form.color} size={48} />
            <div>
              <p className="text-sm font-bold text-foreground">{form.name || "Nome do instrumento"}</p>
              <p className="text-xs text-muted-foreground">{form.category}</p>
            </div>
          </div>
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Nome *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Violão, Piano, Bateria..." className="h-9 text-sm rounded-xl" />
          </div>
          {/* Categoria */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Categoria</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}
              className="w-full h-9 text-sm rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Cor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => set("color", c)}
                  className={cn("w-7 h-7 rounded-full transition-all hover:scale-110", form.color === c && "ring-2 ring-offset-2 ring-offset-card ring-foreground")}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 rounded-xl gap-2" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {editData ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel, isPending }: {
  name: string; onConfirm: () => void; onCancel: () => void; isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">Excluir instrumento?</h3>
        <p className="text-xs text-muted-foreground mb-5">
          Tem certeza que deseja excluir <strong>{name}</strong>? Os alunos associados ficarão sem instrumento.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" className="flex-1 rounded-xl gap-2" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Instrumentos() {
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [editInstrument, setEditInstrument] = useState<InstrumentRow | null>(null);
  const [deleteInstrument, setDeleteInstrument] = useState<InstrumentRow | null>(null);

  const { data: instruments, isLoading } = trpc.instruments.list.useQuery();

  const deleteMutation = trpc.instruments.delete.useMutation({
    onSuccess: () => {
      toast.success("Instrumento excluído!");
      utils.instruments.list.invalidate();
      setDeleteInstrument(null);
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const maxCount = Math.max(...(instruments ?? []).map(i => Number(i.studentCount)), 1);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-6 bg-background">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 scrollbar-thin no-scrollbar">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 lg:gap-4 w-full sm:w-auto">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center shadow-sm shrink-0">
              <Guitar size={24} className="text-teal-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-none">Instrumentos</h2>
              <p className="text-[10px] lg:text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1 lg:mt-2">{instruments?.length ?? 0} instrumentos ativos</p>
            </div>
          </div>
          <Button 
            className="w-full sm:w-auto h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest gap-2 shadow-lg shadow-indigo-500/20 transition-all active:scale-95" 
            onClick={() => { setEditInstrument(null); setModalOpen(true); }}
          >
            <Plus size={18} /> Novo Instrumento
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-indigo-200" />
          </div>
        ) : (instruments ?? []).length === 0 ? (
          <div className="bg-card rounded-[2rem] border border-border p-20 flex flex-col items-center text-center shadow-sm">
            <div className="w-20 h-20 rounded-[2rem] bg-muted flex items-center justify-center text-4xl mb-6 shadow-inner">
              🎸
            </div>
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest">Nenhum instrumento</h3>
            <p className="text-sm text-muted-foreground font-medium mt-2 max-w-xs">
              Cadastre os instrumentos que sua escola oferece para vincular aos alunos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(instruments ?? []).map((inst: InstrumentRow) => (
              <div 
                key={inst.id} 
                className="bg-card rounded-[2rem] border border-border p-6 hover:shadow-xl transition-all duration-300 group relative overflow-hidden"
              >
                {/* Decorative background element */}
                <div 
                  className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-[0.03] group-hover:opacity-[0.08] transition-opacity"
                  style={{ background: inst.color ?? "#6366f1" }}
                />

                <div className="flex items-start justify-between mb-6">
                  <InstrumentIcon name={inst.name} color={inst.color} size={56} />
                  <span className="text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest"
                    style={{ background: (inst.color ?? "#6366f1") + "15", color: inst.color ?? "#6366f1" }}>
                    {inst.category}
                  </span>
                </div>

                <div className="mb-6">
                   <h3 className="text-base font-black text-foreground mb-1 group-hover:text-indigo-600 transition-colors">{inst.name}</h3>
                   <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                     <Users size={12} className="text-muted-foreground" />
                     <span>{inst.studentCount} Aluno{Number(inst.studentCount) !== 1 ? "s" : ""}</span>
                   </div>
                </div>

                <div className="space-y-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden border border-border">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (Number(inst.studentCount) / maxCount) * 100)}%` }}
                      className="h-full rounded-full"
                      style={{ background: inst.color ?? "#6366f1" }} 
                    />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 opacity-0 lg:group-hover:opacity-100 lg:translate-y-2 lg:group-hover:translate-y-0 transition-all">
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-indigo-600 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20"
                      onClick={() => { setEditInstrument(inst); setModalOpen(true); }}
                    >
                      <Pencil size={12} className="mr-2" /> Editar
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                      onClick={() => setDeleteInstrument(inst)}
                    >
                      <Trash2 size={12} className="mr-2" /> Excluir
                    </Button>
                  </div>
                  
                  {/* Mobile Actions Always Visible */}
                  <div className="flex lg:hidden gap-2">
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground active:bg-muted border border-border"
                      onClick={() => { setEditInstrument(inst); setModalOpen(true); }}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground active:bg-rose-500/10 active:text-rose-600 border border-border"
                      onClick={() => setDeleteInstrument(inst)}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <InstrumentModal open={modalOpen} onClose={() => { setModalOpen(false); setEditInstrument(null); }} editData={editInstrument} />
      )}
      {deleteInstrument && (
        <DeleteConfirm
          name={deleteInstrument.name}
          onConfirm={() => deleteMutation.mutate({ id: deleteInstrument.id })}
          onCancel={() => setDeleteInstrument(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}


