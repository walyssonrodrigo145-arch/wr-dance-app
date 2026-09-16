import { trpc } from "@/lib/trpc";
import { Loader2, Users, Clock, DoorOpen, ArrowUpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const LEVEL_LABEL: Record<string, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  todas: "Todas as idades",
};

function formatGrade(weekdays: number[] | null | undefined, timeStr: string | null | undefined, durationMinutes: number) {
  const days = (weekdays ?? []).slice().sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day] ?? day).join(", ");
  if (!days && !timeStr) return "Grade a definir";
  return `${days || "Dia a definir"}${timeStr ? ` · ${timeStr}` : ""}${durationMinutes ? ` (${durationMinutes}min)` : ""}`;
}

export default function StudentTurmas() {
  const { data: turmas = [], isLoading } = trpc.turmas.myTurmas.useQuery();

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
          <Users className="text-indigo-500" size={28} />
          Minhas Turmas
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Suas turmas fixas, horários e status da matrícula.
        </p>
      </div>

      {turmas.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border-2 border-dashed border-border">
          <Users className="mx-auto text-muted-foreground opacity-20 mb-4" size={48} />
          <p className="font-black text-foreground">Você ainda não está em nenhuma turma</p>
          <p className="text-sm text-muted-foreground mt-1">
            Quando a escola matricular você em uma turma, ela aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {turmas.map((turma: any, index: number) => {
            const naEspera = turma.enrollmentStatus === "espera";
            return (
              <motion.div key={turma.enrollmentId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="border-none shadow-lg bg-card h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-foreground leading-tight truncate">{turma.name}</h3>
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                          {turma.modalidadeName || "Sem modalidade"} · {LEVEL_LABEL[turma.level] ?? turma.level}
                        </p>
                      </div>
                      {naEspera ? (
                        <Badge variant="outline" className="shrink-0 text-[10px] font-black bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <ArrowUpCircle size={11} className="mr-1" /> Lista de espera
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px] font-black bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          Matriculado
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs font-medium text-muted-foreground space-y-1.5">
                      <p className="flex items-center gap-1.5">
                        <Clock size={13} className="shrink-0 text-indigo-500" />
                        {formatGrade(turma.weekdays, turma.timeStr, turma.durationMinutes)}
                      </p>
                      {turma.professorName && <p>Professor(a): {turma.professorName}</p>}
                      {turma.roomName && (
                        <p className="flex items-center gap-1.5">
                          <DoorOpen size={13} className="shrink-0 text-indigo-500" /> {turma.roomName}
                        </p>
                      )}
                    </div>

                    {naEspera && (
                      <p className={cn("text-[11px] font-bold text-amber-600")}>
                        Você está na fila — assim que abrir uma vaga, sua matrícula é ativada automaticamente.
                      </p>
                    )}
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
