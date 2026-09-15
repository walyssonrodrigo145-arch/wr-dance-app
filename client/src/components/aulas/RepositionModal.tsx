import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { Repeat, Loader2, Lock, AlertCircle, CalendarClock, User, Music, Clock } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RepositionModalProps {
  lesson: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

/**
 * Modal "Aula a Repor" (PRD 01 §3): exibe os dados da aula (preenchidos
 * automaticamente), motivo obrigatório da escola e observações.
 * Ao confirmar: cria o crédito de reposição e marca a aula como 'a_repor'.
 */
export default function RepositionModal({ lesson, open, onOpenChange, onCreated }: RepositionModalProps) {
  const utils = trpc.useUtils();
  const [reasonId, setReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: reasons = [], isLoading: isLoadingReasons } = trpc.repositions.listReasons.useQuery(undefined, {
    enabled: open,
  });
  const creditReasons = reasons.filter((r: any) => r.active && r.generatesCredit);

  useEffect(() => {
    if (open) {
      setReasonId("");
      setNotes("");
    }
  }, [open, lesson?.id]);

  const createMutation = trpc.repositions.createFromLesson.useMutation({
    onSuccess: (data) => {
      toast.success(
        data?.status === "disponivel"
          ? "Aula marcada como reposição e crédito liberado!"
          : "Aula marcada como reposição — crédito aguardando liberação.",
        { description: data?.status === "disponivel" ? "Acesse Reposições para agendar." : "Disponível após o fim do contrato." }
      );
      utils.lessons.list.invalidate();
      utils.repositions.list.invalidate();
      utils.repositions.stats.invalidate();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar reposição."),
  });

  if (!lesson) return null;

  const date = new Date(lesson.scheduledAt);
  const handleSubmit = () => {
    if (!reasonId) {
      toast.error("Selecione o motivo da reposição.");
      return;
    }
    createMutation.mutate({ lessonId: lesson.id, reasonId: Number(reasonId), notes: notes.trim() || undefined });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Aula a Repor"
      description="Registre o motivo e gere o crédito de reposição do aluno"
    >
      <div className="space-y-4 pt-1">
        {/* Dados preenchidos automaticamente */}
        <div className="rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
              <Repeat size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Aula original</p>
              <h4 className="text-sm font-bold text-foreground truncate">{lesson.title || "Aula"}</h4>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InfoChip icon={<User size={13} />} label="Aluno" value={lesson.studentName || lesson.experimentalName || "—"} />
            <InfoChip icon={<CalendarClock size={13} />} label="Data e horário" value={format(date, "dd/MM/yyyy 'às' HH:mm")} />
            <InfoChip icon={<Music size={13} />} label="Instrumento" value={lesson.instrumentName || "Geral"} />
            <InfoChip icon={<Clock size={13} />} label="Duração" value={`${lesson.duration || 60} min`} />
          </div>
        </div>

        {/* Motivo (obrigatório) */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            Motivo <span className="text-rose-500">*</span>
          </label>
          {isLoadingReasons ? (
            <div className="h-10 rounded-xl bg-muted/30 flex items-center px-3 gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Carregando motivos...
            </div>
          ) : creditReasons.length === 0 ? (
            <div className="h-auto py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 px-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              Nenhum motivo ativo com direito à reposição. Cadastre motivos em Configurações → Reposições.
            </div>
          ) : (
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger className="w-full h-10 rounded-xl text-xs font-bold">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {creditReasons.map((r: any) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Observações</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Detalhes adicionais (opcional)"
            className="w-full rounded-xl border border-border/60 bg-background p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>

        {/* Aviso de política de liberação */}
        <div className="flex items-start gap-2 rounded-xl bg-muted/30 border border-dashed border-border/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
          <Lock size={13} className="mt-0.5 shrink-0" />
          A liberação do crédito segue a política da escola (imediata ou no encerramento do contrato) e o prazo de validade é calculado automaticamente.
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 px-4 bg-muted/20 hover:bg-muted/30 text-muted-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !reasonId}
            className={cn(
              "flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2",
              "bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-600/20 active:scale-[0.98]",
              (createMutation.isPending || !reasonId) && "opacity-60 cursor-not-allowed"
            )}
          >
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
            Gerar Crédito de Reposição
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-background border border-border/50 p-2 min-w-0 hover:border-violet-500/30 transition-all duration-300">
      <span className="text-violet-500 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs font-bold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
