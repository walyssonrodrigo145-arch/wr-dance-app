import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDateOnly } from "@/lib/dates";
import {
  HeartPulse, Plus, Loader2, Trash2, Pencil, AlertTriangle, Ruler, Weight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CONDITIONING_META: Record<string, { label: string; className: string }> = {
  ruim: { label: "Ruim", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  regular: { label: "Regular", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  bom: { label: "Bom", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  excelente: { label: "Excelente", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
};

type HealthRecord = {
  id: number;
  recordDate: string;
  weightKg: string | null;
  heightCm: number | null;
  flexibilityCm: string | null;
  conditioning: string | null;
  injuryNotes: string | null;
  restrictions: string | null;
  notes: string | null;
};

function HealthModal({ open, onClose, studentId, editing }: {
  open: boolean;
  onClose: () => void;
  studentId: number;
  editing: HealthRecord | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(() => editing ? {
    recordDate: editing.recordDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    weightKg: editing.weightKg ?? "",
    heightCm: editing.heightCm != null ? String(editing.heightCm) : "",
    flexibilityCm: editing.flexibilityCm ?? "",
    conditioning: editing.conditioning ?? "bom",
    injuryNotes: editing.injuryNotes ?? "",
    restrictions: editing.restrictions ?? "",
    notes: editing.notes ?? "",
  } : {
    recordDate: new Date().toISOString().slice(0, 10),
    weightKg: "", heightCm: "", flexibilityCm: "",
    conditioning: "bom", injuryNotes: "", restrictions: "", notes: "",
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    studentId,
    recordDate: new Date(`${form.recordDate}T12:00:00`),
    weightKg: form.weightKg ? parseFloat(form.weightKg.replace(",", ".")) : null,
    heightCm: form.heightCm ? parseInt(form.heightCm, 10) : null,
    flexibilityCm: form.flexibilityCm ? parseFloat(form.flexibilityCm.replace(",", ".")) : null,
    conditioning: form.conditioning as any,
    injuryNotes: form.injuryNotes.trim() || null,
    restrictions: form.restrictions.trim() || null,
    notes: form.notes.trim() || null,
  });

  const createMutation = trpc.saude.create.useMutation({
    onSuccess: () => { toast.success("Avaliação registrada!"); utils.saude.list.invalidate({ studentId }); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.saude.update.useMutation({
    onSuccess: () => { toast.success("Avaliação atualizada!"); utils.saude.list.invalidate({ studentId }); onClose(); },
    onError: (error) => toast.error(error.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <HeartPulse className="text-rose-500" size={20} />
            {editing ? "Editar avaliação" : "Nova avaliação física"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="space-y-1.5">
            <Label>Data da avaliação *</Label>
            <Input type="date" value={form.recordDate} onChange={(event) => set("recordDate", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Condicionamento</Label>
            <Select value={form.conditioning} onValueChange={(value) => set("conditioning", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONDITIONING_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Peso (kg)</Label>
            <Input value={form.weightKg} onChange={(event) => set("weightKg", event.target.value)} placeholder="Ex.: 52,4" />
          </div>
          <div className="space-y-1.5">
            <Label>Altura (cm)</Label>
            <Input type="number" value={form.heightCm} onChange={(event) => set("heightCm", event.target.value)} placeholder="Ex.: 165" />
          </div>
          <div className="space-y-1.5">
            <Label>Flexibilidade (cm)</Label>
            <Input value={form.flexibilityCm} onChange={(event) => set("flexibilityCm", event.target.value)} placeholder="Teste de sentar e alcançar" />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Lesões / histórico de saúde</Label>
            <Textarea value={form.injuryNotes} onChange={(event) => set("injuryNotes", event.target.value)} rows={2} maxLength={2000} placeholder="Lesões prévias, dores recorrentes, acompanhamento médico..." />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Restrições</Label>
            <Textarea value={form.restrictions} onChange={(event) => set("restrictions", event.target.value)} rows={2} maxLength={2000} placeholder="Movimentos a evitar, recomendações médicas..." />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} maxLength={2000} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => editing ? updateMutation.mutate({ id: editing.id, ...buildPayload() }) : createMutation.mutate(buildPayload())} disabled={isPending}>
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar" : "Registrar avaliação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Aba de Saúde & Condicionamento Físico (uso da escola/professor). */
export function SaudeTab({ studentId }: { studentId: number }) {
  const utils = trpc.useUtils();
  const { data: records = [], isLoading } = trpc.saude.list.useQuery({ studentId });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HealthRecord | null>(null);
  const [deleting, setDeleting] = useState<HealthRecord | null>(null);

  const deleteMutation = trpc.saude.delete.useMutation({
    onSuccess: () => {
      toast.success("Avaliação removida.");
      setDeleting(null);
      utils.saude.list.invalidate({ studentId });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-black text-foreground uppercase tracking-tighter">Saúde & Condicionamento</h3>
          <p className="text-xs text-muted-foreground font-medium">
            Avaliações periódicas, flexibilidade, lesões e restrições — acompanhamento interno.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} size="sm">
          <Plus size={15} className="mr-1.5" /> Nova avaliação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border">
          <HeartPulse className="mx-auto text-muted-foreground opacity-25 mb-3" size={36} />
          <p className="text-sm font-black text-foreground">Nenhuma avaliação registrada</p>
          <p className="text-xs text-muted-foreground mt-1">Registre a primeira avaliação física do aluno.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record: any) => {
            const meta = record.conditioning ? CONDITIONING_META[record.conditioning] : null;
            return (
              <div key={record.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black text-foreground flex items-center gap-2">
                    <HeartPulse size={15} className="text-rose-500" />
                    {formatDateOnly(record.recordDate)}
                  </p>
                  <div className="flex items-center gap-2">
                    {meta && (
                      <Badge variant="outline" className={`text-[10px] font-black ${meta.className}`}>{meta.label}</Badge>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(record); setModalOpen(true); }} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-500" onClick={() => setDeleting(record)} title="Excluir">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] font-bold text-muted-foreground">
                  {record.weightKg && <span className="flex items-center gap-1"><Weight size={12} /> {record.weightKg} kg</span>}
                  {record.heightCm && <span className="flex items-center gap-1"><Ruler size={12} /> {record.heightCm} cm</span>}
                  {record.flexibilityCm && <span className="flex items-center gap-1"><Sparkles size={12} /> Flexibilidade {record.flexibilityCm} cm</span>}
                </div>

                {record.injuryNotes && (
                  <p className="text-xs text-muted-foreground font-medium flex items-start gap-1.5">
                    <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" /> {record.injuryNotes}
                  </p>
                )}
                {record.restrictions && (
                  <p className="text-xs text-rose-600/90 font-medium">Restrições: {record.restrictions}</p>
                )}
                {record.notes && <p className="text-xs text-muted-foreground font-medium">{record.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <HealthModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          studentId={studentId}
          editing={editing}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover avaliação?</AlertDialogTitle>
            <AlertDialogDescription>
              A avaliação de {deleting ? formatDateOnly(deleting.recordDate) : ""} será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
