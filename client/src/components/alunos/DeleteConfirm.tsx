import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Delete Confirm ───────────────────────────────────────────────────────────
export function DeleteConfirm({ name, onConfirm, onCancel, isPending }: {
  name: string; onConfirm: () => void; onCancel: () => void; isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1">Excluir aluno?</h3>
        <p className="text-xs text-muted-foreground mb-6">
          A exclusão de <strong>{name}</strong> é permanente e removerá todo o histórico.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1 h-9 text-xs font-bold" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" className="flex-1 h-9 text-xs font-bold gap-2" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Excluir
          </Button>
        </div>
      </div>
    </div>
  );
}