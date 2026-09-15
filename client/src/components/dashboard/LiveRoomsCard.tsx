import { trpc } from "@/lib/trpc";
import { Radio, DoorOpen, Wrench, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function roomBadge(room: any) {
  if (room.status === "manutencao") return { label: "Manutenção", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  if (room.status === "inativa") return { label: "Inativa", cls: "bg-muted text-muted-foreground border-border" };
  if (room.isOccupiedNow) return { label: "Ocupada agora", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" };
  return { label: "Livre", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
}

/** RF-002 — Status em tempo quase real das salas de estúdio (24h). */
export function LiveRoomsCard() {
  const { data, isLoading, isError, refetch } = trpc.dashboard.liveRooms.useQuery(undefined, {
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const rooms = data?.rooms ?? [];

  return (
    <div className="bg-card/40 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 lg:p-8 border border-white/10 shadow-2xl shadow-primary/5 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-foreground tracking-tight flex items-center gap-2">
            <Radio size={16} className="text-rose-500 animate-pulse" /> Salas ao Vivo (24h)
          </h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
            {data?.schoolOpen ? "Expediente aberto" : "Fora do expediente"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="py-8 text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Não foi possível carregar as salas.</p>
          <button onClick={() => refetch()} className="mt-3 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            Tentar novamente
          </button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="py-10 text-center">
          <DoorOpen size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhuma sala cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {rooms.map((room: any) => {
            const badge = roomBadge(room);
            return (
              <div
                key={room.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-transparent hover:bg-card/80 hover:border-white/10 transition-all gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/5"
                    style={{ backgroundColor: `${room.color || "#3b82f6"}20`, color: room.color || "#3b82f6" }}
                  >
                    {room.status === "manutencao" ? <Wrench size={16} /> : <DoorOpen size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground tracking-tight truncate">{room.name}</p>
                    {room.isOccupiedNow && room.currentLesson ? (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                        {room.currentLesson.studentName || "Aluno"} • até {format(new Date(room.currentLesson.endsAt), "HH:mm")}
                      </p>
                    ) : room.nextLessonAt ? (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Clock size={11} className="text-blue-500" /> próxima {format(new Date(room.nextLessonAt), "HH:mm")}
                      </p>
                    ) : (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sem aulas hoje</p>
                    )}
                  </div>
                </div>
                <span className={cn("px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0", badge.cls)}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
