import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, CalendarDays, X } from "lucide-react";
import LessonCard from "@/components/LessonCard";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface Lesson {
  id: number;
  title: string;
  scheduledAt: string;
  duration: number;
  status: "agendada" | "concluida" | "cancelada" | "remarcada" | "falta";
  studentName?: string | null;
  instrumentName?: string | null;
  instrumentColor?: string | null;
  instrumentIcon?: string | null;
  description?: string | null;
  notes?: string | null;
}

interface DayLessonsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: Date;
  lessons: Lesson[];
  onStatusChange: (id: number, status: string) => void;
  onOpenDetail: (lesson: Lesson) => void;
  onAddLesson: (day: Date) => void;
}

export default function DayLessonsModal({
  open,
  onOpenChange,
  day,
  lessons,
  onStatusChange,
  onOpenDetail,
  onAddLesson,
}: DayLessonsModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[100] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-background rounded-2xl border border-border shadow-2xl p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-foreground">
                Aulas de {format(day, "dd 'de' MMMM", { locale: ptBR })}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
                {lessons.length} aulas agendadas para este dia
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Quick Add Button */}
          <Button
            onClick={() => {
              onOpenChange(false);
              onAddLesson(day);
            }}
            className="w-full h-12 rounded-2xl gap-2 font-bold uppercase tracking-wider text-[10px]"
            variant="outline"
          >
            <Plus size={16} />
            Agendar Aula para este dia
          </Button>

          {/* Lessons List */}
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {lessons.length > 0 ? (
              lessons.map((l) => (
                <LessonCard
                  key={l.id}
                  lesson={l}
                  onStatusChange={onStatusChange}
                  onClick={() => onOpenDetail(l)}
                />
              ))
            ) : (
              <div className="py-16 flex flex-col items-center justify-center text-center bg-muted/5 rounded-[2rem] border border-dashed border-border/20">
                <CalendarDays size={40} className="mb-3 text-muted-foreground/30" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 italic">
                  Nenhuma aula para este dia
                </p>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
