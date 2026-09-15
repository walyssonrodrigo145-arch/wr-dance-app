import { useEffect } from "react";
import { motion } from "framer-motion";
import { RELEASES } from "@shared/releases";
import type { ReleaseItemType } from "@shared/releases";
import { useWhatsNew } from "@/components/novidades/WhatsNewProvider";
import { Sparkles, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const TYPE_META: Record<ReleaseItemType, { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  melhoria: { label: "Melhoria", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  correcao: { label: "Correção", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

function formatDate(date: string) {
  try {
    return format(parseISO(`${date}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return date;
  }
}

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const cardVariants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };
const itemVariants = { hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } };

export default function Novidades() {
  const { markSeen, isAllowed } = useWhatsNew();

  // Abrir a página marca como visto (RN-005)
  useEffect(() => {
    if (isAllowed) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
          <Megaphone size={22} />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-outfit font-black text-foreground tracking-tight">Novidades</h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Tudo o que lançamos no MusicPro
          </p>
        </div>
      </div>

      {RELEASES.length === 0 ? (
        <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-12 border border-white/10 shadow-2xl shadow-primary/5 text-center">
          <Sparkles size={40} className="mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhuma novidade por aqui ainda</p>
        </div>
      ) : (
        <motion.div className="space-y-6" initial="hidden" animate="show" variants={listVariants}>
          {RELEASES.map((release, idx) => (
            <motion.div
              key={release.version}
              variants={cardVariants}
              className="group relative bg-card/40 backdrop-blur-xl rounded-[2rem] p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-primary/10"
            >
              {/* Acento lateral */}
              <span className={cn("absolute left-0 top-6 bottom-6 w-1 rounded-full", idx === 0 ? "bg-primary" : "bg-border")} />

              {idx === 0 && (
                <span className="absolute top-6 right-6 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase tracking-widest">
                  Mais recente
                </span>
              )}

              <div className="flex items-center gap-3 flex-wrap pl-3">
                <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                  v{release.version}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {formatDate(release.date)}
                </span>
              </div>

              <h2 className="text-lg md:text-xl font-outfit font-black text-foreground tracking-tight mt-3 pl-3">
                {release.title}
              </h2>
              {release.summary && (
                <p className="text-sm text-muted-foreground mt-1 pl-3">{release.summary}</p>
              )}

              <motion.div className="mt-5 space-y-3.5 pl-3" initial="hidden" animate="show" variants={listVariants}>
                {release.items.map((item, i) => {
                  const meta = TYPE_META[item.type] ?? TYPE_META.melhoria;
                  return (
                    <motion.div key={i} variants={itemVariants} className="flex items-start gap-3">
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
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
