import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface EditStudyPlanModalProps {
  planId: number | null;
  initialText: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditStudyPlanModal({ planId, initialText, isOpen, onClose, onSuccess }: EditStudyPlanModalProps) {
  const [planText, setPlanText] = useState(initialText);

  useEffect(() => {
    if (isOpen) {
      setPlanText(initialText);
    }
  }, [isOpen, initialText]);

  const utils = trpc.useUtils();
  const editMutation = trpc.progress.editStudyPlanText.useMutation({
    onSuccess: () => {
      toast.success("Plano atualizado com sucesso!");
      utils.progress.getActiveStudyPlan.invalidate();
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error("Erro ao atualizar plano: " + err.message);
    }
  });

  const handleSave = () => {
    if (!planId) return;
    editMutation.mutate({ planId, planText });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col bg-white border-slate-100 rounded-3xl p-0">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-black text-slate-800">
            Editar Plano de Estudo
          </DialogTitle>
          <p className="text-sm text-slate-500 font-medium">
            Altere os exercícios ou detalhes do plano de estudos gerado.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <Textarea 
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            className="min-h-[300px] font-mono text-sm resize-y"
            placeholder="JSON do plano..."
          />
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
          <Button variant="ghost" onClick={onClose} disabled={editMutation.isPending}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={editMutation.isPending || !planText.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-200"
          >
            {editMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
