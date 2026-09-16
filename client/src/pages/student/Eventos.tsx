import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Theater, MapPin, CalendarDays, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion } from "framer-motion";

const TYPE_LABEL: Record<string, string> = {
  recital: "Recital",
  festival: "Festival",
  competicao: "Competição",
  workshop: "Workshop",
  audicao: "Audição",
  ensaio_geral: "Ensaio geral",
  outro: "Outro",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  planejado: { label: "Planejado", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  confirmado: { label: "Confirmado", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  realizado: { label: "Realizado", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
};

function EventCard({ evento, onConfirm, confirming }: {
  evento: any;
  onConfirm: (eventId: number) => void;
  confirming: boolean;
}) {
  const startsAt = new Date(evento.startsAt);
  const isPast = startsAt.getTime() < Date.now();
  const statusMeta = STATUS_META[evento.status] ?? STATUS_META.planejado;
  const confirmed = evento.participantStatus === "confirmado";
  const fullyAuthorized = !evento.requiresAuthorization || (evento.imageAuthorization && evento.participationAuthorization);

  return (
    <Card className="border-none shadow-lg bg-card overflow-hidden">
      <div className="flex">
        <div className="w-20 shrink-0 bg-indigo-600 text-white flex flex-col items-center justify-center py-4">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{format(startsAt, "MMM")}</span>
          <span className="text-2xl font-black leading-none">{format(startsAt, "dd")}</span>
          <span className="text-[10px] font-bold mt-1 opacity-80">{format(startsAt, "HH:mm")}</span>
        </div>

        <CardContent className="flex-1 p-5 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-black text-foreground leading-tight">{evento.name}</h3>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                {TYPE_LABEL[evento.type] ?? evento.type}
              </p>
            </div>
            <Badge variant="outline" className={cn("shrink-0 text-[10px] font-black", statusMeta.className)}>
              {statusMeta.label}
            </Badge>
          </div>

          {evento.venueName && (
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin size={13} className="shrink-0 text-indigo-500" />
              {evento.venueName}
              {evento.venueAddress ? ` — ${evento.venueAddress}` : ""}
            </p>
          )}

          {evento.description && (
            <p className="text-xs font-medium text-muted-foreground leading-relaxed line-clamp-3">{evento.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {confirmed ? (
              <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-600">
                <CheckCircle2 size={13} /> Presença confirmada
              </span>
            ) : isPast ? (
              <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                <Clock size={13} /> Evento encerrado
              </span>
            ) : (
              <Button size="sm" onClick={() => onConfirm(evento.id)} disabled={confirming} className="bg-indigo-600 hover:bg-indigo-700">
                {confirming ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CheckCircle2 size={14} className="mr-1.5" />}
                Confirmar presença
              </Button>
            )}

            {evento.requiresAuthorization && (
              <span className={cn(
                "flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest",
                fullyAuthorized ? "text-emerald-600" : "text-amber-600"
              )}>
                <ShieldCheck size={13} />
                {fullyAuthorized ? "Autorizações em dia" : "Autorização pendente com a escola"}
              </span>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default function StudentEventos() {
  const utils = trpc.useUtils();
  const { data: eventos = [], isLoading } = trpc.eventos.myEvents.useQuery();

  const confirmParticipation = trpc.eventos.confirmParticipation.useMutation({
    onSuccess: () => {
      toast.success("Presença confirmada! Nos vemos lá!");
      utils.eventos.myEvents.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const upcoming = eventos.filter((evento: any) => new Date(evento.startsAt).getTime() >= Date.now());
  const past = eventos.filter((evento: any) => new Date(evento.startsAt).getTime() < Date.now());

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Theater className="text-indigo-500" size={28} />
          Meus Eventos
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Recitais, festivais e apresentações em que você participa.
        </p>
      </div>

      {eventos.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Theater className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Nenhum evento por enquanto</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando a escola incluir você em um evento, ele aparecerá aqui.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <CalendarDays size={14} className="text-indigo-500" /> Próximos eventos
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {upcoming.map((evento: any, index: number) => (
                  <motion.div key={evento.participantId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                    <EventCard
                      evento={evento}
                      confirming={confirmParticipation.isPending}
                      onConfirm={(eventId) => confirmParticipation.mutate({ eventId })}
                    />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" /> Histórico
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 opacity-80">
                {past.map((evento: any) => (
                  <EventCard
                    key={evento.participantId}
                    evento={evento}
                    confirming={false}
                    onConfirm={() => undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
