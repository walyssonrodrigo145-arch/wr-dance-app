import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Theater, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageUploadField } from "@/components/common/ImageUploadField";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const EVENT_TYPE_LABEL: Record<string, string> = {
  recital: "Recital",
  festival: "Festival",
  competicao: "Competição",
  workshop: "Workshop",
  audicao: "Audição",
  ensaio_geral: "Ensaio geral",
  outro: "Outro",
};

/** Status MANUAL (workflow) — "Realizado" e "Cancelado" só via ações do cartão. */
export const EVENT_STATUS_META: Record<string, { label: string; className: string }> = {
  planejado: { label: "Rascunho", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  confirmado: { label: "Confirmado", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  realizado: { label: "Realizado", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

/** Situação de PAGAMENTO (distinta da entrega). */
export const EVENT_PAYMENT_META: Record<string, { label: string; className: string }> = {
  pago: { label: "Pagamento: pago", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  pendente: { label: "Pagamento: pendente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

/** Situação de ENTREGA (distinta do pagamento). */
export const EVENT_DELIVERY_META: Record<string, { label: string; className: string }> = {
  em_separacao: { label: "Em separação", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  entregue: { label: "Entregue", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
};

export const PARTICIPANT_STATUS_META: Record<string, { label: string; className: string }> = {
  convidado: { label: "Convidado", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
  confirmado: { label: "Confirmado", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  recusado: { label: "Recusado", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

export type EventoRow = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: string | Date;
  endsAt: string | Date | null;
  status: string;
  requiresAuthorization: boolean;
  photoUrl: string | null;
  coreografiasCount: number;
  participantesCount: number;
  confirmadosCount: number;
  autorizadosCount: number;
  vendasQty: number;
  receitaPrevista: number;
  receitaArrecadada: number;
};

/** datetime-local exige "YYYY-MM-DDTHH:mm" no fuso local. */
export function toLocalInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

type EventoForm = {
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  description: string;
  requiresAuthorization: boolean;
  photoUrl: string;
};

const EMPTY_FORM: EventoForm = {
  name: "",
  type: "recital",
  status: "planejado",
  startsAt: "",
  endsAt: "",
  venueName: "",
  venueAddress: "",
  description: "",
  requiresAuthorization: true,
  photoUrl: "",
};

// ─── Modal de criação/edição (compartilhado: lista + gestão) ─────────────────

export function EventoModal({ open, onClose, editing }: {
  open: boolean;
  onClose: () => void;
  editing: EventoRow | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<EventoForm>(() => editing ? {
    name: editing.name,
    type: editing.type,
    status: editing.status,
    startsAt: toLocalInputValue(editing.startsAt),
    endsAt: toLocalInputValue(editing.endsAt),
    venueName: editing.venueName ?? "",
    venueAddress: editing.venueAddress ?? "",
    description: editing.description ?? "",
    requiresAuthorization: editing.requiresAuthorization,
    photoUrl: editing.photoUrl ?? "",
  } : EMPTY_FORM);

  const set = (key: keyof EventoForm, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => ({
    name: form.name.trim(),
    type: form.type as any,
    status: form.status as any,
    startsAt: new Date(form.startsAt),
    endsAt: form.endsAt ? new Date(form.endsAt) : null,
    venueName: form.venueName.trim() || null,
    venueAddress: form.venueAddress.trim() || null,
    description: form.description.trim() || null,
    requiresAuthorization: form.requiresAuthorization,
    photoUrl: form.photoUrl.trim() || null,
  });

  const createMutation = trpc.eventos.create.useMutation({
    onSuccess: () => {
      toast.success("Evento criado!");
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.eventos.update.useMutation({
    onSuccess: () => {
      toast.success("Evento atualizado!");
      utils.eventos.list.invalidate();
      utils.eventos.stats.invalidate();
      utils.eventos.getById.invalidate({ id: editing!.id });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (form.name.trim().length < 2) { toast.error("Informe o nome do evento."); return; }
    if (!form.startsAt) { toast.error("Informe a data e hora de início."); return; }
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...buildPayload() });
    } else {
      createMutation.mutate(buildPayload());
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Theater className="text-indigo-500" size={20} />
            {editing ? "Editar evento" : "Novo evento"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome do evento *</Label>
            <Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex.: Recital de Fim de Ano 2026" maxLength={255} />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(value) => set("type", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Situação (workflow)</Label>
            <Select value={form.status} onValueChange={(value) => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planejado">Rascunho</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] font-bold text-muted-foreground">
              "Realizado" e "Cancelado" são ações no cartão/menu do evento (com avisos às participantes).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Início *</Label>
            <Input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Término</Label>
            <Input type="datetime-local" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={form.venueName} onChange={(event) => set("venueName", event.target.value)} placeholder="Ex.: Teatro Municipal" maxLength={255} />
          </div>

          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input value={form.venueAddress} onChange={(event) => set("venueAddress", event.target.value)} placeholder="Rua, número, cidade" maxLength={500} />
          </div>

          <div className="sm:col-span-2">
            <ImageUploadField
              value={form.photoUrl}
              onChange={(url) => set("photoUrl", url)}
              label="Foto do evento"
              hint="Aparece no cartão da lista e na página de gerenciamento."
              fallbackIcon={<Theater size={18} />}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Descrição / Orientações</Label>
            <Textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Horário de concentração, figurino, instruções aos responsáveis..." rows={3} maxLength={5000} />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
            <Checkbox
              id="requiresAuthorization"
              checked={form.requiresAuthorization}
              onCheckedChange={(checked) => set("requiresAuthorization", checked === true)}
            />
            <label htmlFor="requiresAuthorization" className="text-sm font-bold text-foreground cursor-pointer select-none">
              Exigir autorização de imagem e participação (recomendado para menores)
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="shadow-md shadow-indigo-500/20">
            {isPending && <Loader2 size={16} className="animate-spin mr-2" />}
            {editing ? "Salvar alterações" : "Criar evento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
