import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Clock, DoorOpen, RefreshCw, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  livre: { label: "Livre", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  parcial: { label: "Parcial", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  ocupado: { label: "Ocupado", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  passado: { label: "Passado", cls: "bg-muted text-muted-foreground border-border" },
};

/** RF-001 — Relatório de horários livres do dia (visão geral + filtros por professor/sala). */
export function FreeSlotsCard() {
  const { isAdmin } = useDashboardPrefs();
  const [professorId, setProfessorId] = useState<number | undefined>(undefined);
  const [roomId, setRoomId] = useState<number | undefined>(undefined);

  const { data: profs = [] } = trpc.professores.list.useQuery(undefined, { enabled: isAdmin, staleTime: 5 * 60 * 1000 });
  const { data: rooms = [] } = trpc.studioRooms.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const { data, isLoading, isError, refetch, isFetching } = trpc.dashboard.freeSlotsToday.useQuery(
    { professorId, roomId },
    { refetchInterval: 60_000, staleTime: 30_000 },
  );

  const dateLabel = data?.date ? format(parseISO(`${data.date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }) : "";

  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-black text-foreground tracking-tight">Horários Livres</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1 capitalize">
            {dateLabel || "Hoje"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && !data.isClosed && (
            <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
              {data.summary.freeCount} livre{data.summary.freeCount === 1 ? "" : "s"}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="w-8 h-8 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            aria-label="Atualizar horários"
            title="Atualizar"
          >
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={professorId ?? ""}
            onChange={(e) => setProfessorId(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-muted border border-border rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:outline-none cursor-pointer"
          >
            <option value="">Todos os professores</option>
            {profs.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={roomId ?? ""}
            onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-muted border border-border rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:outline-none cursor-pointer"
          >
            <option value="">Todas as salas</option>
            {rooms.filter((r: any) => r.active).map((r: any) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="py-8 text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Não foi possível carregar os horários.
          </p>
          <button onClick={() => refetch()} className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            Tentar novamente
          </button>
        </div>
      ) : !data ? (
        <div className="py-10 text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sem dados de horários</p>
        </div>
      ) : data.isClosed ? (
        <div className="py-10 text-center">
          <CalendarOff size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Hoje a escola está fechada</p>
        </div>
      ) : data.slots.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sem horários restantes hoje</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {data.slots.map((slot: any) => {
            const meta = STATUS_META[slot.status] ?? STATUS_META.livre;
            return (
              <div
                key={slot.time}
                className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-transparent hover:bg-card/80 hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
                    <Clock size={16} className="text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground tracking-tight">
                      {slot.time} – {slot.endTime}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <DoorOpen size={11} className="text-indigo-500" />
                      {slot.freeRoomsCount} sala{slot.freeRoomsCount === 1 ? "" : "s"} livre{slot.freeRoomsCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <span className={cn("px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0", meta.cls)}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
