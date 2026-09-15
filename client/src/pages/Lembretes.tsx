import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Plus, Loader2,
  BookOpen, CreditCard, AlertTriangle, ListTodo, FileText, Bell, RefreshCw, CheckCheck, Sparkles, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

import { Reminder, ReminderType, ReminderStatus, Template, openWhatsApp } from "../components/lembretes/types";
import { ReminderCard } from "../components/lembretes/ReminderCard";
import { RemindersSummary } from "../components/lembretes/RemindersSummary";
import { RemindersFilter } from "../components/lembretes/RemindersFilter";
import { ManualReminderModal, TemplatesModal, DeleteConfirmModal } from "../components/lembretes/ReminderModals";

export default function Lembretes() {
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<ReminderType | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<ReminderStatus | "todos">("todos");
  const [filterStudent, setFilterStudent] = useState("");
  const [pendingActionMap, setPendingActionMap] = useState<Record<number, "markSent" | "cancel" | "sendBot">>({});

  const { data: allReminders = [], isLoading } = trpc.reminders.list.useQuery(
    undefined,
    {
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
    }
  );
  const { data: students = [] } = trpc.students.list.useQuery(undefined, { staleTime: 300_000 });
  const { data: templates = [] } = trpc.reminderTemplates.list.useQuery(undefined, { staleTime: 300_000 });

  const seenPendingIds = useRef<Set<number>>(new Set());

  // REMOVIDO: useEffect que disparava showNotification local.
  // O backend (automationJob.ts e routers.ts) já dispara push notifications globais via FCM
  // usando a função notifyUser(). Manter esse useEffect causava notificações duplicadas.
  useEffect(() => {
    const currentPendings = (allReminders as Reminder[]).filter(r => r.status === "pendente");
    currentPendings.forEach(r => seenPendingIds.current.add(r.id));
  }, [allReminders]);

  const invalidate = useCallback(() => {
    utils.reminders.list.invalidate();
    utils.reminders.pendingCount.invalidate();
  }, [utils]);

  const applyOptimistic = useCallback((id: number, status: Reminder["status"], extra?: Partial<Reminder>) => {
    utils.reminders.list.setData(undefined, (old) =>
      old?.map((r: any) => r.id === id ? { ...r, status, sentAt: status === "enviado" ? new Date() : r.sentAt, cancelledAt: status === "cancelado" ? new Date() : r.cancelledAt, ...extra } : r) ?? []
    );
    utils.reminders.pendingCount.setData(undefined, (old) =>
      old != null && status !== "pendente" ? Math.max(0, old - 1) : old
    );
  }, [utils]);

  const markSentMut = trpc.reminders.markSent.useMutation({
    onMutate: async ({ id }) => {
      await utils.reminders.list.cancel();
      const prev = utils.reminders.list.getData();
      applyOptimistic(id, "enviado");
      toast.success("Marcado como enviado!");
      setPendingActionMap(m => ({ ...m, [id]: "markSent" }));
      return { prev };
    },
    onError: (e, _, ctx) => {
      if (!e.data && ctx?.prev) utils.reminders.list.setData(undefined, ctx.prev);
      else toast.error("Erro: " + e.message);
    },
    onSettled: (_, __, vars) => {
      setPendingActionMap(m => { const n = { ...m }; delete n[vars.id]; return n; });
      invalidate();
    },
  });

  const cancelMut = trpc.reminders.cancel.useMutation({
    onMutate: async ({ id }) => {
      await utils.reminders.list.cancel();
      const prev = utils.reminders.list.getData();
      applyOptimistic(id, "cancelado");
      toast.success("Lembrete cancelado");
      setPendingActionMap(m => ({ ...m, [id]: "cancel" }));
      return { prev };
    },
    onError: (e, _, ctx) => {
      if (!e.data && ctx?.prev) utils.reminders.list.setData(undefined, ctx.prev);
      else toast.error("Erro: " + e.message);
    },
    onSettled: (_, __, vars) => {
      setPendingActionMap(m => { const n = { ...m }; delete n[vars.id]; return n; });
      invalidate();
    },
  });

  const sendBotMut = trpc.reminders.sendViaBot.useMutation({
    onMutate: async ({ id }) => {
      await utils.reminders.list.cancel();
      const prev = utils.reminders.list.getData();
      applyOptimistic(id, "enviado", { errorMessage: null });
      setPendingActionMap(m => ({ ...m, [id]: "sendBot" }));
      return { prev };
    },
    onSuccess: () => { toast.success("Enviado via Robo com sucesso!"); invalidate(); },
    onError: (e, vars, ctx) => {
      if (ctx?.prev) utils.reminders.list.setData(undefined, ctx.prev);
      utils.reminders.pendingCount.setData(undefined, (old) => (old != null ? old + 1 : old));
      const msg = e.message.includes("transform") || e.message.includes("parse")
        ? "Falha de conexao com o servidor do robo. Tente novamente."
        : "Erro ao enviar via robo: " + e.message;
      toast.error(msg);
    },
    onSettled: (_, __, vars) => {
      setPendingActionMap(m => { const n = { ...m }; delete n[vars.id]; return n; });
      invalidate();
    },
  });

  const deleteMut = trpc.reminders.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.reminders.list.cancel();
      const prev = utils.reminders.list.getData();
      // Remove imediatamente da lista — sem esperar o servidor
      utils.reminders.list.setData(undefined, (old) => old?.filter((r: any) => r.id !== id) ?? []);
      utils.reminders.pendingCount.setData(undefined, (old) => {
        if (old == null) return old;
        const item = prev?.find((r: any) => r.id === id);
        return (item as any)?.status === "pendente" ? Math.max(0, old - 1) : old;
      });
      setDeleteId(null);
      toast.success("Excluido!");
      return { prev };
    },
    onError: (e, _, ctx) => {
      // Erro de parsing/rede: servidor provavelmente deletou — nao reverte
      if (!e.data) { console.warn("[delete] Erro de parsing ignorado — servidor processou."); return; }
      // Erro real: reverte
      if (ctx?.prev) utils.reminders.list.setData(undefined, ctx.prev);
      toast.error("Erro ao excluir: " + e.message);
    },
    onSettled: () => invalidate(),
  });

  const generateLessons = trpc.reminders.generateLessonReminders.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.created} lembrete(s) de aula gerado(s)! ${r.skipped} ignorado(s).`);
      invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const generatePayments = trpc.reminders.generatePaymentReminders.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.created} lembrete(s) de cobranca gerado(s)! ${r.skipped} ignorado(s).`);
      invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });



  const [completeAllModalOpen, setCompleteAllModalOpen] = useState(false);

  const completeAllMut = trpc.reminders.completeAllPending.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setCompleteAllModalOpen(false);
      invalidate();
    },
    onError: (e) => toast.error("Erro ao concluir lembretes: " + e.message),
  });

  const handleGenerateAll = async () => {
    try {
      await generateLessons.mutateAsync();
      await generatePayments.mutateAsync();
    } catch {}
  };

  const filtered = useMemo(() => {
    const raw = allReminders as Reminder[];
    return raw.filter(r => {
      if (filterType !== "todos" && r.type !== filterType) return false;
      if (filterStatus !== "todos" && r.status !== filterStatus) return false;
      if (filterStudent && !r.studentName?.toLowerCase().includes(filterStudent.toLowerCase())) return false;
      return true;
    });
  }, [allReminders, filterType, filterStatus, filterStudent]);

  const groups = useMemo(() => {
    const now = new Date();
    const atrasados: Reminder[] = [];
    const aulas: Reminder[] = [];
    const pagamentos: Reminder[] = [];
    const outros: Reminder[] = [];
    filtered.forEach(r => {
      const isPast = new Date(r.scheduledAt) < now;
      if (isPast && r.status === "pendente") { atrasados.push(r); return; }
      if (r.type === "aula") aulas.push(r);
      else if (r.type === "cobranca" || r.type === "inadimplencia") pagamentos.push(r);
      else outros.push(r);
    });
    return { atrasados, aulas, pagamentos, outros };
  }, [filtered]);

  const rawPendingCount = (allReminders as Reminder[]).filter(r => r.status === "pendente").length;
  const rawDelayedCount = (allReminders as Reminder[]).filter(r => new Date(r.scheduledAt) < new Date() && r.status === "pendente").length;
  const isGenerating = generateLessons.isPending || generatePayments.isPending;
  const studentList = (students as { id: number; name: string; phone?: string | null }[]);

  const renderSection = (title: string, icon: React.ElementType, items: Reminder[], colorClass: string) => {
    if (items.length === 0) return null;
    const Icon = icon;
    return (
      <div className="mb-10 will-change-transform">
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className={cn("p-1.5 rounded-lg text-white", colorClass)}>
            <Icon size={16} />
          </div>
          <h3 className="text-lg font-black text-foreground uppercase tracking-wider">{title}</h3>
          <span className="ml-2 text-xs font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(r => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onDelete={() => setDeleteId(r.id)}
              onMarkSent={(id) => markSentMut.mutate({ id })}
              onCancel={(id) => cancelMut.mutate({ id })}
              onSendBot={(id) => sendBotMut.mutate({ id })}
              pendingAction={pendingActionMap[r.id] ?? null}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden -m-4 sm:-m-6 bg-background">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 scrollbar-thin no-scrollbar">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center shadow-sm shrink-0">
              <Bell size={24} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-none">Lembretes</h2>
              <p className="text-[10px] lg:text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1 lg:mt-2">Gestao de avisos e notificacoes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
            {rawPendingCount > 0 && (
              <Button
                variant="outline"
                className="h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0 shadow-xs cursor-pointer"
                onClick={() => setCompleteAllModalOpen(true)}
              >
                <CheckCheck size={16} />
                <span>Concluir Pendentes ({rawPendingCount})</span>
              </Button>
            )}
            <Button variant="outline" className="h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest gap-2 bg-card border-border shrink-0" onClick={() => setTemplatesOpen(true)}>
              <FileText size={16} /> <span className="hidden xs:inline">Modelos</span>
            </Button>
            <Button variant="outline" className="h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest gap-2 bg-card border-border shrink-0" onClick={() => setModalOpen(true)}>
              <Plus size={16} /> <span className="hidden xs:inline">Manual</span>
            </Button>
            <Button className="h-11 rounded-xl px-5 text-[10px] font-black uppercase tracking-widest gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 shrink-0" onClick={handleGenerateAll} disabled={isGenerating}>
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Gerar
            </Button>
          </div>
        </div>

        <div className="shrink-0">
          <RemindersSummary total={allReminders.length} pending={rawPendingCount} delayed={rawDelayedCount} />
        </div>

        <div className="shrink-0">
          <RemindersFilter {...{filterStudent, setFilterStudent, filterType, setFilterType, filterStatus, setFilterStatus}} />
        </div>

        <div className="flex-1 space-y-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={32} className="animate-spin text-indigo-200" />
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sincronizando...</p>
            </div>
          ) : allReminders.length === 0 ? (
            <div className="bg-card rounded-[2rem] border border-dashed border-border p-20 flex flex-col items-center text-center shadow-sm">
              <div className="w-20 h-20 bg-muted rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
                <Bell size={36} className="text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-black text-foreground uppercase tracking-widest">Sem lembretes</h3>
              <p className="text-sm text-muted-foreground font-medium mt-2 mb-8 max-w-xs">Sua caixa esta limpa.</p>
            </div>
          ) : (
            <div className="space-y-10 pb-10">
              {renderSection("Atrasados", AlertTriangle, groups.atrasados, "bg-rose-500 shadow-rose-500/20")}
              {renderSection("Aulas", BookOpen, groups.aulas, "bg-indigo-500 shadow-indigo-500/20")}
              {renderSection("Pagamentos", CreditCard, groups.pagamentos, "bg-emerald-500 shadow-emerald-500/20")}
              {renderSection("Manuais", ListTodo, groups.outros, "bg-slate-700 shadow-slate-500/20")}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <ManualReminderModal open={modalOpen} onClose={() => setModalOpen(false)} students={studentList} templates={templates as Template[]} />
      )}
      {templatesOpen && <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />}
      {deleteId !== null && (
        <DeleteConfirmModal
          onConfirm={() => deleteMut.mutate({ id: deleteId })}
          onCancel={() => setDeleteId(null)}
          isPending={deleteMut.isPending}
        />
      )}

      {/* ── MODAL: CONCLUIR TODOS OS PENDENTES EM MASSA ── */}
      {completeAllModalOpen && (
        <ResponsiveDialog
          open={completeAllModalOpen}
          onOpenChange={(open) => !completeAllMut.isPending && setCompleteAllModalOpen(open)}
          title="Concluir Lembretes Pendentes"
          description="Evite o envio em massa de lembretes antigos acumulados"
        >
          <div className="p-6 space-y-6">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 font-black text-sm">
                <AlertTriangle size={20} className="shrink-0" />
                <span>Você possui {rawPendingCount} lembrete(s) pendente(s)</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ao marcar como <strong>Concluídos</strong>, esses lembretes serão marcados como já finalizados no sistema e <strong>não serão disparados pelo WhatsApp</strong> quando o robô for ativado.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl h-12 text-xs font-bold"
                onClick={() => setCompleteAllModalOpen(false)}
                disabled={completeAllMut.isPending}
              >
                Voltar
              </Button>

              <Button
                variant="outline"
                className="flex-1 rounded-xl h-12 text-xs font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-rose-500/30 cursor-pointer"
                onClick={() => completeAllMut.mutate({ targetStatus: "cancelado" })}
                disabled={completeAllMut.isPending}
              >
                {completeAllMut.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                Cancelar Todos
              </Button>

              <Button
                className="flex-1 rounded-xl h-12 text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 cursor-pointer"
                onClick={() => completeAllMut.mutate({ targetStatus: "enviado" })}
                disabled={completeAllMut.isPending}
              >
                {completeAllMut.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCheck size={16} className="mr-2" />}
                Concluir Todos ({rawPendingCount})
              </Button>
            </div>
          </div>
        </ResponsiveDialog>
      )}
    </div>
  );
}
