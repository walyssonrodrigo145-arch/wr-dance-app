import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, User, Check, X, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';

export function EarlySlotBanner() {
  const utils = trpc.useUtils();
  const [dismissedOfferIds, setDismissedOfferIds] = useState<number[]>([]);
  const [confirmingOffer, setConfirmingOffer] = useState<any>(null);

  const { data: offers = [], isLoading } = trpc.slotAdvance.getAvailableEarlySlots.useQuery(undefined, {
    refetchInterval: 8000, // Atualiza a cada 8s para sincronizar vagas concorrentes
  });

  const acceptMutation = trpc.slotAdvance.acceptEarlySlot.useMutation({
    onSuccess: (data) => {
      toast.success(data.message, {
        description: "Seu professor já foi notificado e você recebeu a confirmação no WhatsApp.",
        duration: 6000,
      });
      if (confirmingOffer) {
        setDismissedOfferIds(prev => [...prev, confirmingOffer.id]);
      }
      setConfirmingOffer(null);
      utils.slotAdvance.getAvailableEarlySlots.invalidate();
      utils.lessons.list.invalidate();
      utils.studentPortal.getLessons.invalidate();
      utils.studentPortal.getDashboard.invalidate();
    },
    onError: (error) => {
      toast.error("Não foi possível antecipar", {
        description: error.message,
      });
      setConfirmingOffer(null);
      utils.slotAdvance.getAvailableEarlySlots.invalidate();
    }
  });

  const visibleOffers = offers.filter(o => !dismissedOfferIds.includes(o.id));

  if (isLoading || visibleOffers.length === 0) return null;

  const currentOffer = visibleOffers[0];

  const handleDismiss = (id: number) => {
    setDismissedOfferIds(prev => [...prev, id]);
  };

  const handleAccept = () => {
    if (!currentOffer) return;
    acceptMutation.mutate({ slotOfferId: currentOffer.id });
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -15, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          className="mb-6 relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-amber-500/15 via-primary/10 to-emerald-500/15 border-2 border-amber-500/40 dark:border-amber-500/50 p-5 sm:p-6 shadow-lg shadow-amber-500/5 backdrop-blur-md"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            {/* Left Content */}
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30 animate-bounce">
                <Zap size={26} className="fill-white" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                    <Sparkles size={11} /> Vaga Antecipada Disponível Hoje
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {currentOffer.formattedDate}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  Quer adiantar sua aula para às <span className="text-amber-600 dark:text-amber-400 underline font-black">{currentOffer.formattedSlotTime}</span>?
                </h3>

                <p className="text-xs text-muted-foreground font-medium flex items-center gap-2 flex-wrap">
                  <span>Horário atual: <strong className="text-foreground">{currentOffer.formattedCurrentTime}</strong></span>
                  <span>•</span>
                  <span>Prof. <strong className="text-foreground">{currentOffer.teacherName || "Seu Professor"}</strong></span>
                  {currentOffer.instrumentName && (
                    <>
                      <span>•</span>
                      <span>{currentOffer.instrumentName}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleDismiss(currentOffer.id)}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-border/60 hover:bg-muted/50 text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                Manter meu horário
              </button>

              <button
                type="button"
                onClick={() => setConfirmingOffer(currentOffer)}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
              >
                <Check size={16} className="stroke-[3]" />
                <span>Sim, Quero Antecipar</span>
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── MODAL DE CONFIRMAÇÃO DE ANTECIPAÇÃO ── */}
      <ResponsiveDialog
        open={!!confirmingOffer}
        onOpenChange={(open) => !open && !acceptMutation.isPending && setConfirmingOffer(null)}
        title="Confirmar Antecipação de Horário"
        description="Confirme a alteração da sua aula para o horário liberado"
      >
        {confirmingOffer && (
          <div className="p-6 space-y-6">
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-muted-foreground">Horário Marcado Atual:</span>
                <span className="font-black text-rose-500 line-through text-base">{confirmingOffer.formattedCurrentTime}</span>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 font-black text-xs uppercase tracking-widest">
                <ArrowRight size={16} /> Novo Horário Antecipado <ArrowRight size={16} />
              </div>

              <div className="flex items-center justify-between text-sm pt-1">
                <span className="font-bold text-foreground">Novo Horário de Hoje:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-2xl">{confirmingOffer.formattedSlotTime}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground font-medium">
              <p>• O professor <strong>{confirmingOffer.teacherName}</strong> será avisado automaticamente da sua antecipação.</p>
              <p>• A alteração é confirmada em tempo real e garantida para você.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={() => setConfirmingOffer(null)}
                className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={handleAccept}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {acceptMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Confirmando vaga...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} className="stroke-[3]" />
                    <span>Confirmar para às {confirmingOffer.formattedSlotTime}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
