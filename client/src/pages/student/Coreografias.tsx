import { trpc } from "@/lib/trpc";
import { Loader2, Music, Users, Video, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const STATUS_META: Record<string, { label: string; className: string }> = {
  em_montagem: { label: "Em montagem", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  ensaiando: { label: "Ensaiando", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  pronta: { label: "Pronta", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  arquivada: { label: "Arquivada", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" },
};

const CAST_STATUS_LABEL: Record<string, string> = {
  convidado: "Convidado",
  confirmado: "Confirmado",
  desistiu: "Desistiu",
  substituto: "Substituto",
};

const FORMACAO_LABEL: Record<string, string> = {
  solo: "Solo",
  duo: "Duo",
  grupo: "Grupo",
  formacao: "Formação",
};

export default function StudentCoreografias() {
  const { data: coreografias = [], isLoading } = trpc.coreografias.myCoreografias.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Music className="text-indigo-500" size={28} />
          Minhas Coreografias
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Acompanhe as coreografias em que você está escalado e assista aos vídeos de marcação.
        </p>
      </div>

      {coreografias.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Music className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Você ainda não está em nenhuma coreografia</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando seu professor escalar você, a coreografia aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coreografias.map((coreografia: any, index: number) => {
            const statusMeta = STATUS_META[coreografia.status] ?? STATUS_META.em_montagem;
            const thumb = coreografia.videoId
              ? `https://i.ytimg.com/vi/${coreografia.videoId}/hqdefault.jpg`
              : null;
            return (
              <motion.div
                key={coreografia.castId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-none shadow-lg bg-card overflow-hidden h-full flex flex-col">
                  {thumb ? (
                    <a
                      href={coreografia.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-40 w-full overflow-hidden group block"
                      title="Assistir vídeo de marcação"
                    >
                      <img src={thumb} alt={coreografia.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Video className="text-white" size={28} />
                      </div>
                    </a>
                  ) : null}

                  <CardContent className="p-5 space-y-3 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-foreground leading-tight truncate">{coreografia.title}</h3>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                          {coreografia.modalidadeName || "Sem modalidade"} · {FORMACAO_LABEL[coreografia.formacao]}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", statusMeta.className)}>
                        {statusMeta.label}
                      </Badge>
                    </div>

                    {coreografia.musica && (
                      <p className="text-xs font-medium text-muted-foreground truncate">🎵 {coreografia.musica}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Sparkles size={12} className="text-indigo-500" />
                        {coreografia.papel || "Sem papel definido"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} className="text-indigo-500" />
                        {CAST_STATUS_LABEL[coreografia.castStatus] ?? coreografia.castStatus}
                      </span>
                    </div>

                    <div className="space-y-1.5 mt-auto pt-2">
                      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                        <span>Seu domínio da coreografia</span>
                        <span>{coreografia.progresso}%</span>
                      </div>
                      <Progress value={coreografia.progresso} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
