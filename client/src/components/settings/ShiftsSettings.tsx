import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Clock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Shift = { name: string; start: string | null; end: string | null };

/**
 * Turnos personalizáveis da escola (D3): o admin define os nomes e as faixas de
 * horário usados nas turmas e matrículas (ex.: Manhã, Tarde, Noite, Integral).
 */
export function ShiftsSettings() {
  const utils = trpc.useUtils();
  const { data: shifts, isLoading } = trpc.settings.getShifts.useQuery();
  const [draft, setDraft] = useState<Shift[]>([]);

  useEffect(() => {
    if (shifts) {
      setDraft((shifts as Shift[]).map((shift) => ({ name: shift.name, start: shift.start ?? "", end: shift.end ?? "" })));
    }
  }, [shifts]);

  const updateShifts = trpc.settings.updateShifts.useMutation({
    onSuccess: () => {
      toast.success("Turnos atualizados!");
      utils.settings.getShifts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setShift = (index: number, patch: Partial<Shift>) => {
    setDraft((prev) => prev.map((shift, i) => (i === index ? { ...shift, ...patch } : shift)));
  };

  const handleSave = () => {
    const cleaned = draft
      .map((shift) => ({ name: shift.name.trim(), start: shift.start || null, end: shift.end || null }))
      .filter((shift) => shift.name.length > 0);
    if (cleaned.length === 0) {
      toast.error("Adicione ao menos um turno com nome.");
      return;
    }
    updateShifts.mutate({ shifts: cleaned });
  };

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={22} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
            <Clock size={16} className="text-indigo-500" /> Turnos da escola
          </h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            Nomes usados nas turmas e matrículas (ex.: Manhã, Tarde, Noite). As faixas de horário são opcionais.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft((prev) => [...prev, { name: "", start: "", end: "" }])}
          >
            <Plus size={14} className="mr-1.5" /> Novo turno
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={updateShifts.isPending}>
            {updateShifts.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {draft.map((shift, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_40px] gap-2 items-center rounded-xl border border-border bg-card p-2">
            <div className="space-y-1">
              <Label className="sr-only">Nome do turno</Label>
              <Input
                value={shift.name}
                onChange={(event) => setShift(index, { name: event.target.value })}
                placeholder="Ex.: Manhã"
                maxLength={40}
                className="h-10 rounded-lg text-sm font-bold"
              />
            </div>
            <Input
              type="time"
              value={shift.start ?? ""}
              onChange={(event) => setShift(index, { start: event.target.value })}
              className="h-10 rounded-lg text-xs font-bold"
              title="Início (opcional)"
            />
            <Input
              type="time"
              value={shift.end ?? ""}
              onChange={(event) => setShift(index, { end: event.target.value })}
              className="h-10 rounded-lg text-xs font-bold"
              title="Fim (opcional)"
            />
            <button
              type="button"
              onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
              className="h-10 rounded-lg text-muted-foreground hover:text-rose-500 flex items-center justify-center transition-colors"
              title="Remover turno"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
