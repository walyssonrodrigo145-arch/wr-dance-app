import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { CalendarPlus, Loader2, AlertTriangle, CheckCircle2, CalendarX } from "lucide-react";

type Props = {
  turmaId: number | null;
  turmaName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Fluxo de dança: gera as aulas da turma a partir da grade (mesmo sem alunos). */
export function GerarAulasModal({ turmaId, turmaName, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [months, setMonths] = useState("3");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const preview = trpc.turmas.previewLessons.useQuery(
    { id: turmaId!, months: Number(months) },
    { enabled: open && !!turmaId }
  );

  const generate = trpc.turmas.generateLessons.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.created} aula(s) gerada(s)${res.conflicts > 0 ? ` • ${res.conflicts} conflito(s) pulado(s)` : ""}`);
      utils.turmas.previewLessons.invalidate();
      utils.turmas.list.invalidate();
      utils.lessons.list?.invalidate?.();
    },
    onError: (err) => toast.error(err.message || "Não foi possível gerar as aulas."),
  });

  const cancelFuture = trpc.turmas.cancelFutureLessons.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.cancelled} aula(s) futura(s) cancelada(s).`);
      utils.turmas.previewLessons.invalidate();
      utils.turmas.list.invalidate();
      utils.lessons.list?.invalidate?.();
    },
    onError: (err) => toast.error(err.message || "Não foi possível cancelar as aulas."),
  });

  const data = preview.data;
  const hasGrade = (data?.toCreate || 0) + (data?.existing || 0) + (data?.conflicts || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-primary" /> Gerar aulas da grade
          </DialogTitle>
          <DialogDescription>
            {turmaName ? `Turma: ${turmaName}. ` : ""}
            A grade vira a agenda do período — a lista de presença é montada na chamada, com os alunos da turma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Período</label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mês</SelectItem>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preview.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Calculando a grade...
            </div>
          ) : !hasGrade ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
              Esta turma não tem dias/horário definidos na grade. Edite a turma e informe os dias da semana e o horário.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-lg font-black text-emerald-600">{data?.toCreate ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">A criar</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                  <p className="text-lg font-black text-foreground">{data?.existing ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Já existem</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                  <p className="text-lg font-black text-amber-600">{data?.conflicts ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Conflitos</p>
                </div>
              </div>

              {(data?.firstDates?.length || 0) > 0 && (
                <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                  <CheckCircle2 size={12} className="mt-0.5 text-emerald-600 shrink-0" />
                  Próximas datas: {data!.firstDates.join(", ")}{(data!.toCreate > data!.firstDates.length) ? "…" : ""}
                </p>
              )}
              {(data?.conflictDates?.length || 0) > 0 && (
                <div className="text-[10px] text-amber-600 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>Conflitos (não serão criados): {data!.conflictDates.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelFuture.isPending}
              className="h-10 rounded-xl px-4 text-xs font-bold gap-2 border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
            >
              <CalendarX size={14} /> Cancelar aulas futuras
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">
                Fechar
              </Button>
              <Button
                type="button"
                onClick={() => turmaId && generate.mutate({ id: turmaId, months: Number(months) })}
                disabled={generate.isPending || !hasGrade || (data?.toCreate ?? 0) === 0}
                className="h-10 rounded-xl px-5 text-xs font-bold gap-2"
              >
                {generate.isPending ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                Gerar {data?.toCreate ? `${data.toCreate} aula(s)` : "aulas"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar as aulas futuras desta turma?</AlertDialogTitle>
            <AlertDialogDescription>
              As aulas ainda agendadas (a partir de hoje) serão canceladas. O histórico de aulas já realizadas é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { if (turmaId) cancelFuture.mutate({ id: turmaId }); setConfirmCancel(false); }}
            >
              Cancelar aulas futuras
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
