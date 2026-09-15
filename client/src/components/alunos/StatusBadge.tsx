import { useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ─── Badges ───────────────────────────────────────────────────────────────────
export function LevelBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; className: string }> = {
    iniciante: { label: "Iniciante", className: "bg-muted text-muted-foreground border-border" },
    intermediario: { label: "Intermediário", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
    avancado: { label: "Avançado", className: "bg-primary/5 text-primary border-primary/10" },
  };
  const c = config[level] ?? config.iniciante;
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border", c.className)}>
      {c.label}
    </span>
  );
}

export function StatusBadge({ status, id, onUpdate }: { status: string; id: number; onUpdate: (id: number, s: string, deletePendingData: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean, newStatus: string }>({ open: false, newStatus: "" });
  const [deletePending, setDeletePending] = useState(true);

  const cfg: Record<string, { cls: string }> = {
    ativo: { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    pausado: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    inativo: { cls: "bg-red-500/10 text-red-600 border-red-500/20" },
  };
  const c = cfg[status] ?? cfg.ativo;

  const handleSelectStatus = (s: string) => {
    if (s === "inativo" || s === "pausado") {
      setConfirmModal({ open: true, newStatus: s });
      setOpen(false);
    } else {
      onUpdate(id, s, false);
      setOpen(false);
    }
  };

  const confirmUpdate = () => {
    onUpdate(id, confirmModal.newStatus, deletePending);
    setConfirmModal({ open: false, newStatus: "" });
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border transition-all hover:bg-opacity-80", c.cls)}
      >
        {status} <ChevronDown size={10} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-20 top-8 right-0 bg-background border border-border/40 rounded-xl shadow-xl overflow-hidden min-w-[120px] p-1 animate-in fade-in slide-in-from-top-2 duration-200">
          {(["ativo", "pausado", "inativo"] as const).map(s => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); handleSelectStatus(s); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all mb-0.5 last:mb-0",
                s === status ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <AlertDialog open={confirmModal.open} onOpenChange={(v) => !v && setConfirmModal({ open: false, newStatus: "" })}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()} className="bg-card border-white/5 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} />
              Confirmar alteração de status
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              Você está alterando o status deste aluno para <strong className="uppercase">{confirmModal.newStatus}</strong>.
              Como ele não terá mais vínculo ativo, você deseja excluir as aulas agendadas e faturas pendentes geradas para o futuro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-3 py-4 bg-background/50 rounded-lg px-4 border border-border/50">
            <Checkbox id="deletePending" checked={deletePending} onCheckedChange={(v) => setDeletePending(!!v)} />
            <label
              htmlFor="deletePending"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Excluir aulas futuras e faturas pendentes
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdate} className="bg-primary hover:bg-primary/90">Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}