import { useState, useRef } from "react";
import { X, Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { parseDueDaysOptions } from "@/lib/settings";
import { parseBRL } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatFriendlyError } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StudentRow, FormData, EMPTY_FORM } from "./types";

// ─── Modal ────────────────────────────────────────────────────────────────────
export function StudentModal({
  open, onClose, editData, instruments,
}: {
  open: boolean;
  onClose: () => void;
  editData?: StudentRow | null;
  instruments: { id: number; name: string; color?: string | null }[];
}) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();

  const dueDaysOptions = parseDueDaysOptions(settings?.dueDaysForecast);

  const [form, setForm] = useState<FormData>(() =>
    editData
      ? {
          name: editData.name,
          email: editData.email,
          phone: editData.phone ?? "",
          instrumentId: String(editData.instrumentId || ""), 
          level: editData.level as FormData["level"],
          monthlyFee: String(Number(editData.monthlyFee)),
          billingPeriodicity: ((editData as any).billingPeriodicity || "mensal") as FormData["billingPeriodicity"],
          dueDay: String(editData.dueDay || 10),
          notes: editData.notes || "",
          status: editData.status as FormData["status"],
          lessonType: (editData as any).lessonType as FormData["lessonType"] || "individual",
          avatar: editData.avatar || "",
        }
      : EMPTY_FORM
  );

  const uploadAvatarMutation = trpc.musicLibrary.upload.useMutation();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return toast.error("A foto deve ter no máximo 2MB");
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const { url } = await uploadAvatarMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          base64Data: base64
        });
        set("avatar", url);
        toast.success("Foto carregada com sucesso!");
      } catch (err) {
        toast.error("Erro ao carregar foto");
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };

  const [updateFutureDues, setUpdateFutureDues] = useState(false);
  const [generatePortalAccess, setGeneratePortalAccess] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password?: string } | null>(null);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const enableAccessMutation = trpc.students.enablePortalAccess.useMutation({
    onSuccess: (data) => {
      setCredentials(data);
      utils.students.list.invalidate();
    },
    onError: (e) => toast.error(formatFriendlyError(e, "Erro ao liberar acesso ao portal")),
  });

  const createMutation = trpc.students.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("Aluno cadastrado com sucesso!");
      utils.dashboard.stats.invalidate();
      if (generatePortalAccess && data.studentId) {
        enableAccessMutation.mutate({ studentId: data.studentId });
      } else {
        utils.students.list.invalidate();
        onClose();
      }
    },
    onError: (e) => {
      toast.error(formatFriendlyError(e, "Não foi possível cadastrar o aluno"));
    },
  });

  const updateMutation = trpc.students.update.useMutation({
    onSuccess: () => {
      toast.success("Aluno atualizado com sucesso!");
      utils.students.list.invalidate();
      onClose();
    },
    onError: (e) => {
      toast.error(formatFriendlyError(e, "Não foi possível atualizar o aluno"));
    },
  });

  const handleSubmit = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    // AUDIT FIX: usar parseBRL compartilhado — o parser antigo (replace(',','.'))
    // convertia "1.234,56" em 1.234 (perda de 3 ordens de magnitude)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim(),
      instrumentId: form.instrumentId ? Number(form.instrumentId) : undefined,
      level: form.level,
      monthlyFee: parseBRL(form.monthlyFee),
      billingPeriodicity: form.billingPeriodicity,
      dueDay: Number(form.dueDay) || 10,
      notes: form.notes.trim() || undefined,
      status: form.status,
      lessonType: form.lessonType,
      avatar: form.avatar || undefined,
    };
    if (editData) {
      updateMutation.mutate({ 
        id: editData.id, 
        ...payload,
        updateFutureDues 
      }, {
        onSuccess: () => {
          if (generatePortalAccess) {
            enableAccessMutation.mutate({ studentId: editData.id });
          }
        }
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/40">
          <h3 className="text-sm font-bold text-foreground">{editData ? "Editar Aluno" : "Novo Aluno"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="w-16 h-16 border-2 border-background shadow-sm">
                <AvatarImage src={form.avatar} className="object-cover" />
                <AvatarFallback className="bg-indigo-50 text-indigo-600 font-bold uppercase">
                  {form.name ? form.name.substring(0, 2) : "?"}
                </AvatarFallback>
              </Avatar>
              <input 
                type="file" 
                ref={avatarInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleAvatarChange} 
              />
              <button 
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-indigo-600 cursor-pointer z-10 hover:bg-indigo-50 transition-colors"
              >
                {uploadAvatarMutation.isPending ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Pencil size={10} />
                )}
              </button>
            </div>
            <div className="space-y-1.5 flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Nome completo</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: João da Silva" className="h-9 text-xs rounded-lg bg-muted/10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">E-mail</label>
              <Input value={form.email} onChange={e => set("email", e.target.value)} placeholder="Opcional" type="email" className="h-9 text-xs rounded-lg bg-muted/10" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Telefone / WhatsApp (DDI Opcional)</label>
              <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-9999 ou +55..." className="h-9 text-xs rounded-lg bg-muted/10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Instrumento</label>
              <select
                value={form.instrumentId}
                onChange={e => set("instrumentId", e.target.value)}
                className="w-full h-9 text-xs rounded-lg border border-border/40 bg-muted/10 px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
              >
                <option value="">Selecionar...</option>
                {instruments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Nível</label>
              <select
                value={form.level}
                onChange={e => set("level", e.target.value as FormData["level"])}
                className="w-full h-9 text-xs rounded-lg border border-border/40 bg-muted/10 px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
              >
                <option value="iniciante">Iniciante</option>
                <option value="intermediario">Intermediário</option>
                <option value="avancado">Avançado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Mensalidade (R$)</label>
              <Input
                value={form.monthlyFee}
                onChange={e => set("monthlyFee", e.target.value)}
                type="number"
                className="h-9 text-xs rounded-lg bg-muted/10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Vencimento (Dia)</label>
              <select
                value={form.dueDay}
                onChange={e => set("dueDay", e.target.value)}
                className="w-full h-9 text-xs rounded-lg border border-border/40 bg-muted/10 px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
              >
                <optgroup label="Padrão da Escola">
                  {dueDaysOptions.map(d => (
                    <option key={`school-${d}`} value={String(d)}>
                      Dia {d} (Padrão)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Outros Dias">
                  {Array.from({ length: 31 }, (_, i) => i + 1)
                    .filter(d => !dueDaysOptions.includes(d))
                    .map(d => (
                      <option key={`other-${d}`} value={String(d)}>
                        Dia {d}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Periodicidade de Cobrança</label>
            <select
              value={form.billingPeriodicity}
              onChange={e => set("billingPeriodicity", e.target.value as FormData["billingPeriodicity"])}
              className="w-full h-9 text-xs rounded-lg border border-border/40 bg-muted/10 px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
            >
              <option value="mensal">Mensal (1 em 1 mês)</option>
              <option value="bimestral">Bimestral (2 em 2 meses)</option>
              <option value="trimestral">Trimestral (3 em 3 meses)</option>
              <option value="semestral">Semestral (6 em 6 meses)</option>
              <option value="anual">Anual (12 em 12 meses)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Tipo de Aula</label>
            <select
              value={form.lessonType}
              onChange={e => set("lessonType", e.target.value as FormData["lessonType"])}
              className="w-full h-9 text-xs rounded-lg border border-border/40 bg-muted/10 px-3 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
            >
              <option value="individual">Individual</option>
              <option value="turma">Turma / Coletiva</option>
            </select>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-500/10/50 border border-indigo-500/20 flex items-center justify-between group cursor-pointer" onClick={() => setGeneratePortalAccess(!generatePortalAccess)}>
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Liberar Portal?</p>
              <p className="text-[9px] text-muted-foreground font-medium">Gera e-mail e senha automaticamente</p>
            </div>
            <div className={cn(
              "w-10 h-5 rounded-full p-1 transition-all duration-300",
              generatePortalAccess ? "bg-indigo-600" : "bg-muted"
            )}>
              <div className={cn(
                "w-3 h-3 bg-card rounded-full transition-all duration-300",
                generatePortalAccess ? "translate-x-5" : "translate-x-0"
              )} />
            </div>
          </div>
        </div>

        {/* Credentials Feedback */}
        {credentials && (
          <div className="absolute inset-0 z-[60] bg-background flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
             <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} />
             </div>
             <h4 className="text-lg font-black text-foreground">Acesso Criado!</h4>
             <p className="text-xs text-muted-foreground mt-2 mb-6">O aluno foi cadastrado e o acesso ao portal liberado.</p>
             
             <div className="w-full bg-muted/50 p-4 rounded-2xl border border-border text-left space-y-3 mb-6">
                <div>
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">E-mail</p>
                   <p className="text-xs font-black text-foreground">{credentials.email}</p>
                </div>
                <div>
                   <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Senha</p>
                   <p className="text-base font-black text-primary tracking-widest">{credentials.password}</p>
                </div>
             </div>
             
             <Button className="w-full h-11 rounded-xl text-xs font-black uppercase tracking-widest" onClick={onClose}>
                Concluir Cadastro
             </Button>
          </div>
        )}
        <div className="p-6 border-t border-border/40 bg-muted/5 flex gap-3">
          <Button variant="ghost" className="flex-1 h-9 text-xs font-bold" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 h-9 text-xs font-bold gap-2" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 size={12} className="animate-spin" />}
            {editData ? "Salvar alterações" : "Cadastrar aluno"}
          </Button>
        </div>
      </div>
    </div>
  );
}