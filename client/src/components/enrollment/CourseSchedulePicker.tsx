import { trpc } from "@/lib/trpc";
import { Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { v: 1, label: "Seg" }, { v: 2, label: "Ter" }, { v: 3, label: "Qua" },
  { v: 4, label: "Qui" }, { v: 5, label: "Sex" }, { v: 6, label: "Sáb" }, { v: 0, label: "Dom" },
];

/** Seletor de dia da semana + horário para UM curso (agendamento recorrente). */
export function CourseSchedulePicker({ code, course, courseName, onChange }: {
  code: string;
  course: { instrumentId: number; weekday: number | null; timeStr: string | null };
  courseName: string;
  onChange: (patch: { weekday?: number; timeStr?: string | null; teacherUserId?: number | null; studioRoomId?: number | null }) => void;
}) {
  const { data, isLoading } = trpc.enrollment.getWeekdaySlots.useQuery(
    { code, instrumentId: course.instrumentId, weekday: course.weekday ?? 1 },
    { enabled: !!code && course.weekday !== null }
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/10 p-3">
      <p className="text-xs font-black text-foreground">{courseName}</p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => (
          <button
            key={d.v}
            type="button"
            onClick={() => onChange({ weekday: d.v, timeStr: null, teacherUserId: null, studioRoomId: null })}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all",
              course.weekday === d.v ? "bg-emerald-500 text-white border-emerald-500" : "border-border/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {course.weekday !== null && (
        isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="animate-spin text-primary" size={16} /></div>
        ) : data?.closedDay ? (
          <p className="text-[11px] text-muted-foreground">Escola fechada neste dia. Escolha outro.</p>
        ) : (data?.slots?.length ?? 0) === 0 ? (
          <p className="text-[11px] text-muted-foreground">Sem horários disponíveis neste dia.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {data!.slots.map((s: any) => (
              <button
                key={s.time}
                type="button"
                disabled={!s.available}
                onClick={() => onChange({ timeStr: s.time, teacherUserId: data?.teacher?.userId ?? null, studioRoomId: data?.room?.id ?? null })}
                className={cn(
                  "py-2 rounded-lg border-2 text-[11px] font-bold transition-all",
                  !s.available
                    ? "opacity-25 line-through cursor-not-allowed border-border/20 text-muted-foreground"
                    : course.timeStr === s.time
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                    : "border-border/40 hover:border-emerald-400/50 text-foreground"
                )}
              >
                {s.time}
              </button>
            ))}
          </div>
        )
      )}

      {data?.teacher && course.weekday !== null && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <User size={11} /> Professor: <strong className="text-foreground">{data.teacher.name}</strong>
        </p>
      )}
    </div>
  );
}
