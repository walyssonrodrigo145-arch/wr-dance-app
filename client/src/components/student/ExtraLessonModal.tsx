import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Calendar, Clock, MessageCircle, Sparkles, X } from "lucide-react";
import { format, addDays, isSameDay, parseISO, startOfDay, addMinutes, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_PREFERENCES = 2;

interface ExtraLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PRD_AULA_EXTRA: modal do aluno para solicitar aula extra.
 * - Se a escola tem horários configurados: escolhe até 2 slots livres do professor.
 * - Caso contrário (hasConfiguredHours=false): preferência em texto livre (RN-003).
 * - Motivo opcional. RN-001 (1 pendente por aluno) é validada no servidor.
 */
export function ExtraLessonModal({ open, onOpenChange }: ExtraLessonModalProps) {
  const utils = trpc.useContext();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [reason, setReason] = useState("");

  const { data: scheduleData, isLoading: isLoadingSchedule } = trpc.studentPortal.getExtraLessonSchedule.useQuery(
    undefined,
    { enabled: open }
  );
  const hasConfiguredHours = !!scheduleData?.hasConfiguredHours;

  const requestMutation = trpc.studentPortal.requestExtraLesson.useMutation({
    onSuccess: () => {
      toast.success("Solicitação enviada! Seu professor foi notificado e responderá em breve.");
      onOpenChange(false);
      setPreferences([]);
      setFreeText("");
      setReason("");
      setSelectedDate(null);
      setSelectedTime(null);
    },
    onError: (error) => toast.error(error.message || "Erro ao enviar solicitação"),
  });

  // Dias disponíveis: próximos 14 dias com horário ativo (mesma lógica do RescheduleModal)
  const availableDays = useMemo(() => {
    if (!scheduleData?.schoolHours) return [];
    const days = [];
    const today = startOfDay(new Date());
    const dayOfWeekMap: Record<number, string> = {
      0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
    };
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i);
      const dayName = dayOfWeekMap[d.getDay()];
      const hoursConfig = (scheduleData.schoolHours as any)[dayName];
      if (hoursConfig?.active) days.push(d);
    }
    return days;
  }, [scheduleData]);

  // Horários livres do dia selecionado (slots de 30min sem conflito com aulas agendadas)
  const availableTimes = useMemo(() => {
    if (!selectedDate || !scheduleData?.schoolHours) return [];
    const dayOfWeekMap: Record<number, string> = {
      0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
    };
    const dayName = dayOfWeekMap[selectedDate.getDay()];
    const hoursConfig = (scheduleData.schoolHours as any)[dayName];
    if (!hoursConfig?.active) return [];

    const times = [];
    let current = new Date(selectedDate);
    let [startH, startM] = hoursConfig.start.split(':').map(Number);

    if (startM > 0 && startM <= 30) startM = 30;
    else if (startM > 30) { startM = 0; startH += 1; }
    current.setHours(startH, startM, 0, 0);

    const end = new Date(selectedDate);
    const [endH, endM] = hoursConfig.end.split(':').map(Number);
    end.setHours(endH, endM, 0, 0);

    while (isBefore(current, end)) {
      const timeStr = format(current, "HH:mm");
      const currentEnd = addMinutes(current, scheduleData.lessonDuration || 60);
      const isBooked = scheduleData.bookedSlots.some((slot: any) => {
        const bookedStart = parseISO(slot.scheduledAt);
        const bookedEnd = addMinutes(bookedStart, slot.duration || 60);
        return isSameDay(bookedStart, current) && (current < bookedEnd && currentEnd > bookedStart);
      });
      if (!isBooked) times.push(timeStr);
      current = addMinutes(current, 30);
    }
    return times;
  }, [selectedDate, scheduleData]);

  const slotLabel = (day: Date, time: string) =>
    `${format(day, "EEE, dd MMM", { locale: ptBR })} às ${time}`;

  const togglePreference = () => {
    if (!selectedDate || !selectedTime) return;
    const label = slotLabel(selectedDate, selectedTime);
    setPreferences((prev) =>
      prev.includes(label) ? prev.filter((p) => p !== label) : prev.length >= MAX_PREFERENCES ? prev : [...prev, label]
    );
    setSelectedTime(null);
  };

  const handleSubmit = () => {
    const preferred = hasConfiguredHours
      ? preferences.join(" • ")
      : freeText.trim();

    if (preferred.length < 3) {
      toast.error(hasConfiguredHours
        ? `Selecione até ${MAX_PREFERENCES} horários de preferência.`
        : "Descreva suas preferências de dia e horário.");
      return;
    }
    if (reason.length > 1000) {
      toast.error("O motivo é muito longo (máx. 1000 caracteres).");
      return;
    }
    requestMutation.mutate({ preferredDates: preferred, reason: reason.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-y-auto rounded-[2rem] border-none shadow-2xl bg-card/95 backdrop-blur-xl p-5 sm:p-8">
        <DialogHeader>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
            <Sparkles size={20} className="sm:w-6 sm:h-6" />
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black leading-tight">Solicitar Aula Extra</DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground/80 mt-1">
            Quer acelerar sua evolução? Escolha seus horários preferidos e seu professor vai confirmar o melhor encaixe.
          </DialogDescription>
        </DialogHeader>

        {isLoadingSchedule ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Consultando agenda...</p>
          </div>
        ) : (
          <div className="space-y-6 py-2">

            {hasConfiguredHours ? (
              <>
                {/* Dias disponíveis */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-primary" />
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Escolha o Dia</Label>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-3">
                    {availableDays.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic p-2 col-span-full">Nenhum dia disponível configurado pela escola.</p>
                    ) : (
                      availableDays.map(day => (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                          className={cn(
                            "flex flex-col items-center justify-center w-full py-4 rounded-2xl border transition-all",
                            selectedDate && isSameDay(selectedDate, day)
                              ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                              : 'bg-card border-border hover:border-primary/50 text-foreground hover:scale-105'
                          )}
                        >
                          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest opacity-80">{format(day, 'EEE', { locale: ptBR })}</span>
                          <span className="text-xl sm:text-2xl font-black mt-1">{format(day, 'dd')}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Horários livres */}
                {selectedDate && (
                  <div className="space-y-3 animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-primary" />
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Horários Livres</Label>
                    </div>
                    {availableTimes.length === 0 ? (
                      <div className="p-4 text-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <p className="text-xs font-bold text-rose-600">Nenhum horário livre neste dia.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableTimes.map(time => (
                          <button
                            key={time}
                            type="button"
                            onClick={() => setSelectedTime(time)}
                            className={cn(
                              "py-3 rounded-xl border text-sm font-black transition-all",
                              selectedTime === time
                                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 scale-105'
                                : 'bg-muted/50 border-border hover:border-primary/50 text-foreground'
                            )}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedTime && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={togglePreference}
                        disabled={preferences.length >= MAX_PREFERENCES}
                        className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5 hover:bg-primary/10"
                      >
                        + Adicionar preferência ({preferences.length}/{MAX_PREFERENCES})
                      </Button>
                    )}
                  </div>
                )}

                {/* Preferências selecionadas */}
                {preferences.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Suas preferências</Label>
                    <div className="flex flex-wrap gap-2">
                      {preferences.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs font-black text-primary">
                          <Calendar size={11} /> {p}
                          <button type="button" onClick={() => setPreferences((prev) => prev.filter((x) => x !== p))} className="hover:text-rose-500 transition-colors" title="Remover">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* RN-003: escola sem horários configurados → texto livre */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-primary" />
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Suas preferências de dia e horário</Label>
                </div>
                <Textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Ex: Terças ou quintas depois das 19h..."
                  className="min-h-[80px] bg-background border-border rounded-xl font-medium text-sm resize-none"
                />
              </div>
            )}

            {/* Motivo (opcional) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-primary" />
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo (opcional)</Label>
              </div>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Quero reforçar o conteúdo da última aula antes da apresentação..."
                className="min-h-[70px] bg-background border-border rounded-xl font-medium text-sm resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-4">
          <Button
            onClick={handleSubmit}
            disabled={requestMutation.isPending || isLoadingSchedule}
            className="w-full bg-primary text-white font-black uppercase tracking-widest py-6 rounded-2xl shadow-xl shadow-primary/20 disabled:opacity-50"
          >
            {requestMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
            Enviar Solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
