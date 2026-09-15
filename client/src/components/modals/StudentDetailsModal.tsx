import { Calendar, DollarSign, Clock, Loader2, Edit3, Trash2, CheckCircle2, Activity, Mail, Phone, Users, MapPin, Music, Eye, Award, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { StudentContractsSection } from "./StudentContractsSection";

interface StudentDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number | null;
  onEdit: () => void;
  onDelete: () => void;
}

/** PRD Repertório — resumo das músicas do aluno no perfil (leitura; gestão na aba Repertório do Progresso). */
function RepertoireSummarySection({ studentId }: { studentId: number }) {
  const { data: items = [], isLoading, error } = trpc.repertoire.list.useQuery(
    { studentId },
    { enabled: !!studentId, retry: false }
  );
  // Professor não-dono do aluno → erro FORBIDDEN → seção discreta (não é erro de tela)
  if (error || isLoading) {
    if (error) return null;
    return (
      <div className="rounded-2xl border border-border/30 bg-muted/20 p-3.5 flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
        <Loader2 size={13} className="animate-spin text-pink-500" /> Carregando repertório...
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-pink-500/20 bg-pink-500/5 p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Music size={12} className="text-pink-500" /> Repertório ({items.length})
        </p>
        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">Gerenciar em Progresso → Repertório</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground font-medium">Nenhuma música ainda — adicione na aba Repertório do Progresso.</p>
      ) : (
        <div className="space-y-1">
          {(items as any[]).slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-background/70 border border-border/30 px-2.5 py-1.5">
              <span className="text-[11px] font-bold text-foreground truncate">{r.title}</span>
              <div className="flex items-center gap-1 shrink-0">
                {r.learnedAt ? (
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5"><Award size={8} /> Aprendida</span>
                ) : r.viewedAt ? (
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center gap-0.5"><Eye size={8} /> Ouvida</span>
                ) : (
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-600 dark:text-pink-400">Nova</span>
                )}
              </div>
            </div>
          ))}
          {items.length > 5 && (
            <p className="text-[9px] text-muted-foreground font-bold text-center pt-0.5">+ {items.length - 5} música(s) — veja todas na aba Repertório</p>
          )}
        </div>
      )}
    </div>
  );
}

// Mini-card de métrica — densidade alta, hierarquia label pequeno + valor forte
function MetricCard({ icon: Icon, label, value, accent }: {
  icon: typeof Calendar;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="bg-muted/30 p-3 rounded-2xl border border-border/30 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground/50 mb-1.5">
        <Icon size={12} strokeWidth={2.5} className={accent} />
        <span className="text-[9px] font-black uppercase tracking-[0.15em] truncate">{label}</span>
      </div>
      <p className="text-[13px] font-black text-foreground tracking-tight leading-tight truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

// Linha de informação densa (contato/modalidade)
function InfoRow({ icon: Icon, label, value, action }: {
  icon: typeof Mail;
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0 group">
      <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground/60 shrink-0">
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest leading-none mb-0.5">{label}</p>
        <p className="text-xs font-bold text-foreground truncate" title={value}>{value}</p>
      </div>
      {action}
    </div>
  );
}

export function StudentDetailsModal({ open, onOpenChange, studentId, onEdit, onDelete }: StudentDetailsModalProps) {
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const utils = trpc.useUtils();
  
  const { data: student, isLoading } = trpc.students.getDetails.useQuery(
    { id: studentId as number },
    { enabled: !!studentId && open }
  );

  const enableAccessMutation = trpc.students.enablePortalAccess.useMutation({
    onSuccess: (data) => {
      setCredentials(data ? { email: data.email, password: data.password || "" } : null);
      utils.students.getDetails.invalidate({ id: studentId as number });
      utils.students.list.invalidate();
      toast.success("Acesso liberado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao liberar acesso: " + e.message),
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ativo": return { label: "Ativo", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" };
      case "pausado": return { label: "Pausado", color: "text-amber-600 bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500" };
      case "inativo": return { label: "Inativo", color: "text-rose-600 bg-rose-500/10 border-rose-500/20", dot: "bg-rose-500" };
      default: return { label: status, color: "text-muted-foreground bg-muted border-border", dot: "bg-muted-foreground" };
    }
  };

  const statusConfig = student ? getStatusConfig(student.status) : null;
  const initials = student?.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";
  const brl = (v: number | string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[440px] max-h-[calc(100dvh-8rem)] md:max-h-[92vh] flex flex-col rounded-3xl border-border/40 p-0 overflow-hidden bg-card shadow-2xl">
        {isLoading && !student ? (
          <div className="flex flex-col items-center justify-center p-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground animate-pulse">Sincronizando dados...</p>
          </div>
        ) : !student ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Aluno não encontrado</p>
            <p className="text-[10px] text-muted-foreground/60 mt-2">Não foi possível carregar os dados ou você não tem permissão.</p>
          </div>
        ) : (
          <>
            {/* ── Header compacto: avatar + identidade + ações em 1 linha ── */}
            <div className="px-5 pt-5 pb-4 border-b border-border/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex-shrink-0">
              <div className="flex items-start gap-3.5">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-primary/20 text-white font-black text-lg border-2 border-background">
                    {initials}
                  </div>
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-[3px] border-background",
                    statusConfig?.dot
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-[15px] font-black text-foreground leading-snug line-clamp-2">
                    {student.name}
                  </DialogTitle>
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">
                      {student.instrumentName || "Estudante"}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider", statusConfig?.color)}>
                      {statusConfig?.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={onEdit}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-background hover:bg-primary hover:text-white text-muted-foreground transition-all shadow-sm active:scale-90 border border-border/40"
                    title="Editar Aluno"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={onDelete}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-background hover:bg-destructive hover:text-white text-muted-foreground transition-all shadow-sm active:scale-90 border border-border/40"
                    title="Excluir Aluno"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-background hover:bg-muted text-muted-foreground transition-all shadow-sm active:scale-90 border border-border/40"
                    title="Fechar"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Conteúdo scrollável — grid denso, tudo visível com pouco scroll ── */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 no-scrollbar">
              {/* Métricas 2×2: cadastro, mensalidade, vencimento, último pagamento */}
              <div className="grid grid-cols-2 gap-2.5">
                <MetricCard
                  icon={Calendar}
                  label="Matrícula"
                  accent="text-primary/60"
                  value={student.createdAt ? format(new Date(student.createdAt), "dd MMM yyyy", { locale: ptBR }) : "—"}
                />
                <MetricCard
                  icon={DollarSign}
                  label="Mensalidade"
                  accent="text-emerald-500/70"
                  value={brl(student.monthlyFee)}
                />
                <MetricCard
                  icon={Clock}
                  label="Próx. vencimento"
                  accent="text-amber-500/70"
                  value={student.nextDueDate ? format(new Date(student.nextDueDate), "dd MMM yyyy", { locale: ptBR }) : "Em dia"}
                />
                <MetricCard
                  icon={CheckCircle2}
                  label="Último pagamento"
                  accent="text-emerald-500/70"
                  value={student.lastPaymentDate ? format(new Date(student.lastPaymentDate), "dd MMM yyyy", { locale: ptBR }) : "Sem registros"}
                />
              </div>

              {/* Contato e modalidade — lista densa */}
              <div className="px-1">
                {student.email && (
                  <InfoRow icon={Mail} label="E-mail" value={student.email} />
                )}
                {student.phone && (
                  <InfoRow icon={Phone} label="WhatsApp" value={student.phone} />
                )}
                <InfoRow
                  icon={Users}
                  label="Modalidade"
                  value={`Aula ${student.lessonType || "Individual"}`}
                />
                {student.studioRoomName && (
                  <InfoRow icon={MapPin} label="Sala de aula" value={student.studioRoomName} />
                )}
              </div>

              {/* PRD Repertório — músicas do aluno visíveis no perfil */}
              <RepertoireSummarySection studentId={student.id} />

              {/* Contratos digitais */}
              <StudentContractsSection studentId={student.id} student={student} />
            </div>

            {/* ── Footer: 1 ação principal (fechar = X do Dialog) ── */}
            <div className="px-5 py-4 border-t border-border/30 flex-shrink-0 bg-muted/10">
              <Button
                className={cn(
                  "w-full h-11 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] shadow-lg transition-all active:scale-95 border-none gap-2",
                  student.hasPortalAccess 
                   ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-amber-500/20" 
                   : "bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white shadow-indigo-500/30"
                )}
                onClick={() => {
                  enableAccessMutation.mutate({ studentId: student.id });
                }}
                disabled={enableAccessMutation.isPending}
              >
                {enableAccessMutation.isPending ? (
                   <Loader2 size={15} className="animate-spin" />
                ) : (
                   <Activity size={15} />
                )}
                {student.hasPortalAccess ? "Gerar Novo Acesso" : "Liberar Acesso ao Portal"}
              </Button>
            </div>
          </>
        )}

        {/* Credentials Modal */}
        {credentials && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-card border border-border shadow-2xl rounded-[2rem] p-8 max-w-sm w-full text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black">Acesso Liberado!</h3>
                <p className="text-xs text-muted-foreground font-medium mt-2">Compartilhe as credenciais com o aluno:</p>
              </div>
              
              <div className="bg-muted/30 p-6 rounded-2xl border border-border/40 space-y-4">
                <div className="text-left">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">E-mail de Acesso</p>
                  <p className="text-sm font-black text-foreground break-all">{credentials.email}</p>
                </div>
                <div className="text-left">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Senha Temporária</p>
                  <p className="text-lg font-black text-primary tracking-widest">{credentials.password}</p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground font-medium italic">O aluno poderá alterar a senha após o primeiro acesso.</p>

              <Button 
                className="w-full h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest"
                onClick={() => setCredentials(null)}
              >
                Entendido
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
