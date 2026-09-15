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
import { toast } from "sonner";
import { Loader2, Calendar, Clock, MessageCircle, Bot } from "lucide-react";
import { format, addDays, isSameDay, parseISO, startOfDay, addMinutes, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Label } from "@/components/ui/label";

interface RescheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: number;
  lessonTitle: string;
}

export function RescheduleModal({ open, onOpenChange, lessonId, lessonTitle }: RescheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const utils = trpc.useContext();

  const { data: scheduleData, isLoading: isLoadingSchedule } = trpc.studentPortal.getTeacherSchedule.useQuery(
    { lessonId },
    { enabled: open }
  );

  const rescheduleMutation = trpc.studentPortal.autoReschedule.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onOpenChange(false);
      utils.studentPortal.getDashboard.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao reagendar aula");
    }
  });

  // Calculate available days (next 14 days)
  const availableDays = useMemo(() => {
    if (!scheduleData?.schoolHours) return [];
    const days = [];
    const today = startOfDay(new Date());
    
    // Check next 14 days
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i);
      const dayOfWeekMap: Record<number, string> = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      const dayName = dayOfWeekMap[d.getDay()];
      const hoursConfig = (scheduleData.schoolHours as any)[dayName];
      
      if (hoursConfig?.active) {
        days.push(d);
      }
    }
    return days;
  }, [scheduleData]);

  // Calculate available times for the selected date
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
    
    // Arredondar para o bloco de 30 mins mais próximo
    if (startM > 0 && startM <= 30) {
      startM = 30;
    } else if (startM > 30) {
      startM = 0;
      startH += 1;
    }
    
    current.setHours(startH, startM, 0, 0);
    
    const end = new Date(selectedDate);
    const [endH, endM] = hoursConfig.end.split(':').map(Number);
    end.setHours(endH, endM, 0, 0);
    
    // Generate 30 mins slots
    while (isBefore(current, end)) {
      const timeStr = format(current, "HH:mm");
      // Check if slot is booked (overlap detection)
      const currentEnd = addMinutes(current, scheduleData.lessonDuration || 60);
      const isBooked = scheduleData.bookedSlots.some((slot: any) => {
        if (typeof slot === 'string') {
          const booked = parseISO(slot);
          return isSameDay(booked, current) && format(booked, "HH:mm") === timeStr;
        }
        const bookedStart = parseISO(slot.scheduledAt);
        const bookedEnd = addMinutes(bookedStart, slot.duration || 60);
        
        return isSameDay(bookedStart, current) && 
               (current < bookedEnd && currentEnd > bookedStart);
      });
      
      if (!isBooked) {
        times.push(timeStr);
      }
      current = addMinutes(current, 30);
    }
    
    return times;
  }, [selectedDate, scheduleData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
       toast.error("Por favor, selecione uma data e horário.");
       return;
    }
    
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newDateObj = new Date(selectedDate);
    newDateObj.setHours(hours, minutes, 0, 0);
    
    rescheduleMutation.mutate({
      lessonId,
      newDateIso: newDateObj.toISOString(),
    });
  };

  const handleWhatsApp = () => {
    if (scheduleData?.teacherPhone) {
      const phone = scheduleData.teacherPhone.replace(/\D/g, '');
      window.open(`https://wa.me/55${phone}?text=Olá, preciso de ajuda com o reagendamento da aula de ${lessonTitle}.`, '_blank');
    } else {
      toast.error("O professor não possui um número de telefone cadastrado.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-y-auto rounded-[2rem] border-none shadow-2xl bg-card/95 backdrop-blur-xl p-5 sm:p-8">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 relative">
               <Bot size={20} className="sm:w-6 sm:h-6" />
               <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse border-2 border-card"></div>
            </div>
            {scheduleData?.teacherPhone && (
              <Button variant="outline" size="sm" onClick={handleWhatsApp} className="text-[10px] sm:text-xs font-bold text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10 gap-1 sm:gap-2 rounded-xl h-8">
                <MessageCircle size={12} /> Ajuda
              </Button>
            )}
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black leading-tight">Reagendamento Inteligente</DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground/80 mt-1">
            Eu sou o robô assistente. Escolha um dos horários livres na agenda para reagendar automaticamente a aula de <span className="text-foreground font-black">{lessonTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        {isLoadingSchedule ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Analisando agenda...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 py-2">
            
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-primary" />
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Escolha a Nova Data</Label>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 sm:gap-3">
                {availableDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic p-2 col-span-full">Nenhum dia disponível configurado.</p>
                ) : (
                  availableDays.map(day => (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                      className={`flex flex-col items-center justify-center w-full py-4 rounded-2xl border transition-all ${selectedDate && isSameDay(selectedDate, day) ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-card border-border hover:border-primary/50 text-foreground hover:scale-105'}`}
                    >
                      <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest opacity-80">{format(day, 'EEE', { locale: ptBR })}</span>
                      <span className="text-xl sm:text-2xl font-black mt-1">{format(day, 'dd')}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {selectedDate && (
              <div className="space-y-3 animate-in slide-in-from-top-4 fade-in duration-300">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-primary" />
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Horários Disponíveis</Label>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {availableTimes.length === 0 ? (
                    <div className="col-span-3 sm:col-span-4 p-4 text-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <p className="text-xs font-bold text-rose-600">Nenhum horário livre neste dia.</p>
                    </div>
                  ) : (
                    availableTimes.map(time => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        className={`py-3 rounded-xl border text-sm font-black transition-all ${selectedTime === time ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 scale-105' : 'bg-muted/50 border-border hover:border-primary/50 text-foreground'}`}
                      >
                        {time}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button 
                type="submit" 
                disabled={rescheduleMutation.isPending || !selectedDate || !selectedTime}
                className="w-full bg-primary text-white font-black uppercase tracking-widest py-6 rounded-2xl shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                {rescheduleMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
                {selectedTime ? `Confirmar para ${selectedTime}` : "Selecione data e hora"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
