import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  X, CheckCircle2, Mail, RefreshCw, AlertCircle,
  Copy, ChevronRight, Calendar, User, ShieldCheck,
  Phone, ChevronLeft, DollarSign, FileText, BarChart3, Clock, MessageSquare
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";

interface GenerateAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number | null;
}

export function GenerateAccessModal({ open, onOpenChange, studentId }: GenerateAccessModalProps) {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState({
    canSeeFinanceiro: true,
    canSeeProgress: true,
    canSeeFiles: true,
    canSeeSchedule: true,
    canSeeMessages: true,
  });

  const utils = trpc.useUtils();

  const { data: student, isLoading, error } = trpc.students.getDetails.useQuery(
    { id: studentId as number },
    { enabled: !!studentId && open, retry: false }
  );

  const generatePassword = () => {
    if (!student?.name) return;
    const namePart = student.name.split(" ")[0];
    const lastNamePart = student.name.split(" ").pop() || "";
    const pass = namePart.charAt(0).toUpperCase() + namePart.slice(1) + "@2025!" + lastNamePart;
    setPassword(pass);
  };

  useEffect(() => {
    if (open && student) {
      generatePassword();
      setStep(1);

      if (student.permissions) {
        try {
          const parsed = JSON.parse(student.permissions);
          setPermissions({
            canSeeFinanceiro: true,
            canSeeProgress: true,
            canSeeFiles: true,
            canSeeSchedule: true,
            canSeeMessages: true,
            ...parsed
          });
        } catch (e) {
          console.error("Error parsing student permissions in modal:", e);
        }
      } else {
        setPermissions({
          canSeeFinanceiro: true,
          canSeeProgress: true,
          canSeeFiles: true,
          canSeeSchedule: true,
          canSeeMessages: true,
        });
      }
    }
  }, [open, student]);

  const enableAccessMutation = trpc.students.enablePortalAccess.useMutation({
    onSuccess: () => {
      utils.students.getDetails.invalidate({ id: studentId as number });
      utils.students.list.invalidate();
      toast.success("Acesso liberado com sucesso!");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Erro ao liberar acesso: " + e.message),
  });

  const handleSubmit = () => {
    if (!studentId || !student?.email) {
      toast.error("O aluno precisa ter um e-mail cadastrado.");
      return;
    }
    enableAccessMutation.mutate({ studentId, email: student.email, password, permissions });
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(password);
    toast.success("Senha copiada!");
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  if (!open) return null;

  const isDataLoading = isLoading || (!!studentId && !student && !error);

  const permissionList = [
    { id: "canSeeFinanceiro", label: "Financeiro", desc: "Faturas e histórico de pagamentos", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { id: "canSeeProgress", label: "Progresso", desc: "Diário de classe e avaliações", icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { id: "canSeeFiles", label: "Arquivos", desc: "Partituras, PDFs e materiais", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
    { id: "canSeeSchedule", label: "Agenda", desc: "Calendário de aulas", icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
    { id: "canSeeMessages", label: "Mensagens", desc: "Chat e mensagens com o professor", icon: MessageSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  const initials = student?.name
    ? student.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[860px] w-[95vw] max-h-[92vh] p-0 overflow-hidden bg-white dark:bg-card rounded-2xl border border-border shadow-2xl flex flex-col gap-0 focus:outline-none">

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="px-8 pt-7 pb-5 border-b border-border/60">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold text-foreground tracking-tight">
                Gerar acesso do aluno
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Crie o acesso de login para o aluno acessar sua área
              </DialogDescription>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* STEPPER */}
          <div className="mt-5 flex items-center gap-2">
            {/* Step 1 */}
            <div className={`flex items-center gap-2 ${step >= 1 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${step === 1 ? 'bg-primary text-white' : step > 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                {step > 1 ? <CheckCircle2 size={14} /> : "1"}
              </div>
              <span className={`text-sm font-medium ${step === 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
                Dados do aluno
              </span>
            </div>

            <div className={`flex-1 h-px mx-3 ${step > 1 ? 'bg-primary' : 'bg-border'}`} />

            {/* Step 2 */}
            <div className={`flex items-center gap-2 ${step >= 2 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${step === 2 ? 'bg-primary text-white' : step > 2 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                {step > 2 ? <CheckCircle2 size={14} /> : "2"}
              </div>
              <span className={`text-sm font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
                Acesso e permissões
              </span>
            </div>

            <div className={`flex-1 h-px mx-3 ${step > 2 ? 'bg-primary' : 'bg-border'}`} />

            {/* Step 3 */}
            <div className={`flex items-center gap-2 ${step >= 3 ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${step === 3 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                3
              </div>
              <span className={`text-sm font-medium ${step >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
                Resumo
              </span>
            </div>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────────── */}
        {isDataLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="animate-spin text-primary" size={32} />
            <p className="text-sm text-muted-foreground">Carregando dados do aluno...</p>
          </div>
        ) : error || !student ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <AlertCircle className="text-destructive" size={32} />
            <p className="text-sm text-muted-foreground">Não foi possível carregar os dados deste aluno.</p>
            {error && <p className="text-xs text-destructive mt-2">{error.message}</p>}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── LEFT PANEL – Form ─────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

              {/* ── STEP 1 ── */}
              {step === 1 && (
                <>
                  {/* Dados pessoais */}
                  <div>
                    <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-4">Dados pessoais</p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Nome completo <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={student.name}
                          readOnly
                          className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          E-mail <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={student.email || ""}
                          readOnly
                          className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Será o usuário para login do aluno</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">Telefone (WhatsApp)</label>
                          <Input
                            value={student.phone || ""}
                            readOnly
                            className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">Data de nascimento</label>
                          <Input
                            value={student.birthDate ? format(new Date(student.birthDate), "dd/MM/yyyy") : ""}
                            readOnly
                            className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">Nome do responsável</label>
                          <Input
                            value={student.guardianName || ""}
                            readOnly
                            className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1.5">Telefone do responsável</label>
                          <Input
                            value={student.guardianPhone || ""}
                            readOnly
                            className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Acesso do aluno */}
                  <div>
                    <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-4">Acesso do aluno</p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Login (e-mail)</label>
                        <div className="relative">
                          <Input
                            value={student.email || ""}
                            readOnly
                            className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm pr-10"
                          />
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" size={15} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Será utilizado para login no portal do aluno</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Senha temporária</label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={password}
                              readOnly
                              className="h-10 bg-muted/40 border-border/60 rounded-lg text-sm font-mono pr-10"
                            />
                            <button
                              onClick={handleCopyPassword}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Copy size={15} />
                            </button>
                          </div>
                          <button
                            onClick={generatePassword}
                            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                          >
                            Gerar nova
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">O aluno deverá alterar a senha no primeiro acesso</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 2 – Permissions ── */}
              {step === 2 && (
                <div>
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-4">Permissões de acesso</p>
                  <p className="text-sm text-muted-foreground mb-6">Selecione quais módulos este aluno poderá visualizar no portal.</p>
                  <div className="space-y-3">
                    {permissionList.map((perm) => {
                      const Icon = perm.icon;
                      const isChecked = permissions[perm.id as keyof typeof permissions];
                      return (
                        <div
                          key={perm.id}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${isChecked ? 'border-primary/20 bg-primary/[0.03]' : 'border-border/50 bg-muted/20 opacity-60'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg ${perm.bg} ${perm.color} flex items-center justify-center`}>
                              <Icon size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{perm.label}</p>
                              <p className="text-xs text-muted-foreground">{perm.desc}</p>
                            </div>
                          </div>
                          <Switch
                            checked={isChecked}
                            onCheckedChange={(val) => setPermissions(prev => ({ ...prev, [perm.id]: val }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── STEP 3 – Summary ── */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-4">Resumo do acesso</p>
                    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                      <div className="p-5 space-y-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Aluno</p>
                          <p className="text-sm font-semibold text-foreground">{student.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Login</p>
                            <p className="text-sm font-semibold text-foreground">{student.email}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Senha temporária</p>
                            <p className="text-sm font-mono font-semibold text-foreground">{password}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Módulos liberados</p>
                          <div className="flex flex-wrap gap-2">
                            {permissionList.map(p => permissions[p.id as keyof typeof permissions] && (
                              <span key={p.id} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${p.bg} ${p.color}`}>
                                <p.icon size={12} />
                                {p.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/20">
                    <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={16} />
                    <p className="text-sm text-amber-800 dark:text-amber-400">
                      Ao confirmar, o portal será liberado imediatamente. Envie a senha temporária ao aluno para que ele possa fazer seu primeiro acesso.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT PANEL – Preview ─────────────────────────── */}
            <div className="w-[220px] shrink-0 border-l border-border/60 bg-muted/20 flex flex-col items-center justify-start pt-8 px-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-6 text-center">
                Pré-visualização do acesso
              </p>

              {/* Card de preview */}
              <div className="w-full flex flex-col items-center">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/20 mb-4">
                  {initials}
                </div>

                {/* Nome */}
                <p className="text-base font-bold text-foreground text-center leading-tight">
                  {student.name}
                </p>

                {/* Subtítulo */}
                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest text-center mt-1 mb-4 leading-tight">
                  Portal<br />do<br />Aluno
                </p>

                {/* Badge de status */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Acesso ativo
                  </span>
                </div>

                {/* E-mail */}
                <div className="w-full mt-6 p-3 rounded-lg bg-background border border-border/60">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">E-mail de acesso</p>
                  <p className="text-xs font-medium text-foreground truncate">{student.email || "—"}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border/60 px-8 py-5 bg-white dark:bg-card">
          <Button
            variant="ghost"
            onClick={step > 1 ? handleBack : () => onOpenChange(false)}
            className="h-10 px-6 rounded-lg text-muted-foreground hover:text-foreground font-medium"
          >
            {step > 1 ? (
              <><ChevronLeft size={16} className="mr-1" /> Voltar</>
            ) : (
              "Cancelar"
            )}
          </Button>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={isDataLoading || !!error || !student}
              className="h-10 px-7 rounded-lg bg-primary text-white font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              Continuar <ChevronRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={enableAccessMutation.isPending || !student?.email}
              className="h-10 px-7 rounded-lg bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
            >
              {enableAccessMutation.isPending && <RefreshCw className="animate-spin mr-2" size={16} />}
              Liberar acesso <ChevronRight size={16} className="ml-1" />
            </Button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
