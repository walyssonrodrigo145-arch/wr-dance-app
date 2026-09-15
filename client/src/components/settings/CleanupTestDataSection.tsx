import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Shield } from "lucide-react";

export function CleanupTestDataSection() {
  const [cleaning, setCleaning] = useState(false);
  const utils = trpc.useUtils();
  const cleanupMutation = trpc.system.cleanupTestData.useMutation({
    onSuccess: (data: { studentsRemoved: number; lessonsRemoved: number }) => {
      toast.success(`Limpeza concluída! ${data.studentsRemoved} alunos e ${data.lessonsRemoved} aulas de teste removidos.`);
      utils.invalidate(); // Refresh all data
    },
    onError: (e: any) => toast.error("Erro ao limpar dados: " + e.message),
    onSettled: () => setCleaning(false),
  });

  const handleCleanup = () => {
    if (window.confirm("🚨 ATENÇÃO: Tem certeza que deseja excluir TODOS os dados de teste? Esta ação é permanente e não pode ser desfeita.")) {
      setCleaning(true);
      cleanupMutation.mutate();
    }
  };

  return (
    <div className="p-4 bg-red-500/10 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/30 space-y-3">
      <div>
        <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-2">
          <AlertTriangle size={14} /> Zona de Perigo
        </p>
        <p className="text-[10px] text-red-600/80 dark:text-red-500">
          Remover todos os registros que contenham a palavra "teste" no nome, e-mail ou título.
        </p>
      </div>
      <Button 
        variant="destructive" 
        size="sm" 
        className="text-xs rounded-xl gap-2 font-bold bg-red-600 hover:bg-red-700" 
        disabled={cleaning}
        onClick={handleCleanup}
      >
        {cleaning ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
        Limpar Dados de Teste
      </Button>
    </div>
  );
}