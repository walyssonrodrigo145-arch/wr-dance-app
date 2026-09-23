import { useEffect, useMemo, useRef, useState } from "react";
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
import { RefreshCw, Loader2, CalendarCheck } from "lucide-react";

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Rematrícula por período: novo ciclo de aulas + mensalidades para as turmas. */
export function RenewalModal({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const now = new Date();
  const [months, setMonths] = useState("6");
  const [startMonth, setStartMonth] = useState(String(now.getMonth() + 1));
  const [startYear, setStartYear] = useState(String(now.getFullYear()));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deactivateUnselected, setDeactivateUnselected] = useState(false);
  const touchedRef = useRef(false);

  const { data: rows = [], isLoading } = trpc.renewals.list.useQuery({}, { enabled: open });

  useEffect(() => {
    if (open && rows.length > 0 && !touchedRef.current) {
      setSelected(new Set(rows.map((r: any) => r.studentId)));
    }
  }, [open, rows]);

  useEffect(() => {
    if (!open) touchedRef.current = false;
  }, [open]);

  const groups = useMemo(() => {
    const map = new Map<number, { turmaId: number; turmaName: string; students: any[] }>();
    for (const r of rows as any[]) {
      if (!map.has(r.turmaId)) map.set(r.turmaId, { turmaId: r.turmaId, turmaName: r.turmaName, students: [] });
      map.get(r.turmaId)!.students.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  const toggleStudent = (id: number) => {
    touchedRef.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTurma = (students: any[], allSelected: boolean) => {
    touchedRef.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of students) {
        if (allSelected) next.delete(s.studentId); else next.add(s.studentId);
      }
      return next;
    });
  };

  const apply = trpc.renewals.run.useMutation({
    onSuccess: (res: any) => {
      toast.success(
        `${res.renewed} aluno(s) renovado(s) • ${res.duesCreated} mensalidade(s) • ${res.lessonsCreated} aula(s)` +
        (res.deactivated > 0 ? ` • ${res.deactivated} não renovado(s) desativado(s)` : "")
      );
      utils.renewals.list.invalidate();
      utils.turmas.list.invalidate();
      utils.students.list.invalidate();
      onOpenChange(false);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Não foi possível aplicar a rematrícula."),
  });

  const submit = () => {
    const studentIds = Array.from(selected);
    if (studentIds.length === 0) { toast.error("Selecione ao menos um aluno para renovar."); return; }
    apply.mutate({
      startMonth: Number(startMonth),
      startYear: Number(startYear),
      monthsCount: Number(months),
      studentIds,
      turmaIds: groups.map((g) => g.turmaId),
      deactivateUnselected,
    });
  };

  const totalStudents = (rows as any[]).length;
  const years = [now.getFullYear(), now.getFullYear() + 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={18} className="text-primary" /> Rematrícula do período
          </DialogTitle>
          <DialogDescription>
            Renova o ciclo dos alunos selecionados: gera as mensalidades do período e as aulas da grade das turmas.
            Quem não renovar pode sair da grade automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Início</label>
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ano</label>
              <Select value={startYear} onValueChange={setStartYear}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duração</label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader2 size={14} className="animate-spin" /> Carregando alunos...
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-5 text-center text-xs text-muted-foreground">
              Nenhum aluno matriculado em turmas ativas. Matricule alunos em Turmas &amp; Vagas.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {selected.size} de {totalStudents} aluno(s) selecionado(s)
              </p>
              {groups.map((g) => {
                const allSelected = g.students.every((s) => selected.has(s.studentId));
                return (
                  <div key={g.turmaId} className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground truncate">{g.turmaName}</p>
                      <button
                        type="button"
                        onClick={() => toggleTurma(g.students, allSelected)}
                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                      >
                        {allSelected ? "Desmarcar" : "Marcar todos"}
                      </button>
                    </div>
                    <div className="divide-y divide-border/40 max-h-52 overflow-y-auto">
                      {g.students.map((s: any) => (
                        <label key={s.studentId} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20">
                          <input
                            type="checkbox"
                            checked={selected.has(s.studentId)}
                            onChange={() => toggleStudent(s.studentId)}
                            className="w-3.5 h-3.5 accent-primary cursor-pointer"
                          />
                          <span className="flex-1 min-w-0 text-xs font-bold text-foreground truncate">{s.studentName}</span>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            R$ {Number(s.monthlyFee || 0).toFixed(2)}
                          </span>
                          {s.studentStatus !== "ativo" && (
                            <span className="text-[9px] font-black uppercase text-amber-600">{s.studentStatus}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deactivateUnselected}
                  onChange={(e) => setDeactivateUnselected(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer"
                />
                <span className="text-[11px] font-bold text-muted-foreground">
                  Desativar quem não renovar (sai da grade e libera a vaga para a lista de espera)
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-xs font-bold">
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={apply.isPending || selected.size === 0} className="h-10 rounded-xl px-5 text-xs font-bold gap-2">
              {apply.isPending ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
              Renovar {selected.size} aluno(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
