import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWhatsNew } from "./WhatsNewProvider";
import type { ReleaseItemType } from "@shared/releases";

const TYPE_META: Record<ReleaseItemType, { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  melhoria: { label: "Melhoria", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  correcao: { label: "Correção", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

/** Modal automático de novidades (mostra a última versão não vista). */
export function WhatsNewModal() {
  const { isOpen, closeModal, unseenRelease } = useWhatsNew();
  const [, navigate] = useLocation();

  if (!unseenRelease) return null;

  const dateLabel = unseenRelease.date
    ? format(parseISO(`${unseenRelease.date}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto rounded-[2rem] p-0 gap-0 border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/10">
        {/* Header */}
        <div className="relative overflow-hidden px-6 pt-7 pb-5 border-b border-border/50">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex items-start gap-3 pr-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
              <Sparkles size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Novidades no DancePro</p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                Versão {unseenRelease.version}{dateLabel ? ` • ${dateLabel}` : ""}
              </p>
            </div>
          </div>
          <h2 className="relative text-xl md:text-2xl font-outfit font-black text-foreground tracking-tight mt-4">
            {unseenRelease.title}
          </h2>
          {unseenRelease.summary && (
            <p className="relative text-sm text-muted-foreground mt-1.5">{unseenRelease.summary}</p>
          )}
        </div>

        {/* Itens (entrada em cascata) */}
        <motion.div
          className="px-6 py-5 space-y-3.5"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
        >
          {unseenRelease.items.map((item, i) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.melhoria;
            return (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                className="flex items-start gap-3"
              >
                <span className={cn("mt-0.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0", meta.cls)}>
                  {meta.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground leading-snug">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-2.5 px-6 pb-6">
          <Button
            variant="outline"
            className="w-full sm:w-auto rounded-xl h-12 gap-2 hover:-translate-y-0.5 transition-all duration-300"
            onClick={() => { closeModal(); navigate("/novidades"); }}
          >
            Ver todas as novidades <ArrowRight size={16} />
          </Button>
          <Button
            className="w-full sm:flex-1 rounded-xl h-12 bg-primary hover:bg-primary/90 hover:-translate-y-0.5 transition-all duration-300 shadow-lg shadow-primary/20"
            onClick={closeModal}
          >
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
