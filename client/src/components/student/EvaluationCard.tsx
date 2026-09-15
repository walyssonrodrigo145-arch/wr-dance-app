// ─── ⭐ Card de Avaliação de Professor (portal do aluno — PRD módulo 2) ──────
// Aparece no dashboard quando há ciclo aberto e o aluno ainda não avaliou.
// A nota vai EXCLUSIVAMENTE para o admin — o professor nunca a vê.
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, MessageCircle, Check } from "lucide-react";

export function EvaluationCard() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.avaliacoes.currentPeriod.useQuery();
  const [openModal, setOpenModal] = useState(false);
  const [nota, setNota] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");

  const submitMutation = trpc.avaliacoes.submit.useMutation({
    onSuccess: () => {
      toast.success("Avaliação enviada. Obrigado pelo feedback!");
      utils.avaliacoes.currentPeriod.invalidate();
      setOpenModal(false);
      setNota(0);
      setComentario("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !status) return null;

  const s = status as any;

  // Sem ciclo aberto ou sem professor: nada aparece
  if (!s.open || s.alreadyRated) {
    // Já avaliou neste ciclo → feedback discreto
    if (s.open === false && s.alreadyRated === false) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] relative overflow-hidden">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Check size={16} className="text-emerald-500" />
            </div>
            <p className="text-xs font-bold text-muted-foreground">
              Obrigado! Sua avaliação deste ciclo já foi enviada com sucesso.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[220px] h-[220px] bg-amber-500/10 rounded-full blur-[70px] -translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        <CardContent className="p-6 md:p-8 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">
              <Star size={11} /> Avaliação do ciclo
            </div>
            <p className="text-sm font-black text-foreground">Como foram as aulas com {s.professorName || "seu professor"}?</p>
            <p className="text-xs text-muted-foreground font-medium">Sua nota é privada e vai direto para a administração da escola.</p>
          </div>
          <Button
            onClick={() => setOpenModal(true)}
            className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-500/25 px-6 shrink-0 hover:-translate-y-0.5 transition-all"
          >
            <Star size={14} className="mr-1.5 fill-white" /> Avaliar agora
          </Button>
        </CardContent>
      </Card>
      </motion.div>

      {/* ── Modal de avaliação ── */}
      <Dialog open={openModal} onOpenChange={(o) => !o && setOpenModal(false)}>
        <DialogContent className="w-[95vw] max-w-md rounded-[2rem] bg-card border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2">
              <Star size={18} className="fill-amber-400 text-amber-500" /> Avaliar {s.professorName ?? "seu professor"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Sua nota é sigilosa — apenas a administração da escola tem acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setNota(i)}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(0)}
                  className={cn(
                    "w-12 h-12 rounded-2xl border flex items-center justify-center transition-all active:scale-90",
                    (hover || nota) >= i
                      ? "bg-amber-500/15 border-amber-500/40"
                      : "bg-muted/30 border-border/40"
                  )}
                >
                  <Star size={22} className={cn(
                    "transition-colors",
                    (hover || nota) >= i ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                  )} />
                </button>
              ))}
            </div>
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {nota === 0 ? "Toque nas estrelas" : nota === 5 ? "Excelente!" : nota === 4 ? "Muito bom" : nota === 3 ? "Bom" : nota === 2 ? "Regular" : "Insatisfeito"}
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MessageCircle size={11} /> Comentário (opcional)
              </label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                maxLength={500}
                placeholder="O que você destacaria nesse professor?"
                className="min-h-[80px] rounded-2xl font-medium text-sm resize-none"
              />
              <p className="text-[9px] font-bold text-muted-foreground/60 text-right">{comentario.length}/500</p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpenModal(false)} className="flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
            <Button
              disabled={nota === 0 || submitMutation.isPending}
              onClick={() => submitMutation.mutate({ nota, comentario: comentario.trim() || undefined })}
              className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest"
            >
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <Check size={14} className="mr-1" />} Enviar avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
