import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  Calendar as CalendarIcon,
  Plus,
  MoreVertical,
  Music,
  MapPin,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addDays, isSameDay, addWeeks, subWeeks, addMonths, subMonths, addDays as addDaysFns, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { EarlySlotBanner } from "@/components/student/EarlySlotBanner";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const item = {
  hidden: { y: 10, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function StudentAgenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<"mes" | "semana" | "dia">("semana");
  const { data: lessons, isLoading } = trpc.studentPortal.getSchedule.useQuery();

  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const startDateWeek = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = [...Array(7)].map((_, i) => addDaysFns(startDateWeek, i));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDateMonth = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDateMonth = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const monthDays = eachDayOfInterval({ start: startDateMonth, end: endDateMonth });

  const handlePrev = () => {
    if (viewType === "mes") setCurrentDate(subMonths(currentDate, 1));
    else if (viewType === "semana") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  
  const handleNext = () => {
    if (viewType === "mes") setCurrentDate(addMonths(currentDate, 1));
    else if (viewType === "semana") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDaysFns(currentDate, 1));
  };
  
  const handleToday = () => setCurrentDate(new Date());

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-10 pb-10 max-w-[1400px] mx-auto">
      {/* Banner de Antecipação Inteligente de Horário por Falta */}
      <EarlySlotBanner />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 p-8 md:p-10 rounded-[2.5rem] bg-card text-card-foreground border border-border shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter drop-shadow-sm">Minha Agenda</h1>
          <p className="text-muted-foreground font-medium mt-2 max-w-md">Consulte seus horários de aula e eventos musicais em um só lugar.</p>
        </div>
        <div className="relative z-10 flex items-center gap-2 bg-muted/50 backdrop-blur-md p-1.5 rounded-2xl border border-border shadow-sm">
           <button onClick={() => setViewType("mes")} className={cn("px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all", viewType === "mes" ? "bg-background text-foreground shadow-sm" : "hover:bg-muted text-muted-foreground")}>Mês</button>
           <button onClick={() => setViewType("semana")} className={cn("px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all", viewType === "semana" ? "bg-background text-foreground shadow-sm" : "hover:bg-muted text-muted-foreground")}>Semana</button>
           <button onClick={() => setViewType("dia")} className={cn("px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all", viewType === "dia" ? "bg-background text-foreground shadow-sm" : "hover:bg-muted text-muted-foreground")}>Dia</button>
        </div>
      </div>

      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl overflow-hidden rounded-[2.5rem]">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card/30">
             <div className="flex items-center gap-6">
                <div className="flex items-center gap-1">
                  <button onClick={handlePrev} className="p-2.5 hover:bg-muted rounded-xl transition-all active:scale-95"><ChevronLeft size={16} /></button>
                  <button onClick={handleNext} className="p-2.5 hover:bg-muted rounded-xl transition-all active:scale-95"><ChevronRight size={16} /></button>
                </div>
                <h2 className="text-xl font-black tracking-tight first-letter:uppercase">
                  {viewType === "dia" ? format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR }) : format(currentDate, "MMMM yyyy", { locale: ptBR })}
                </h2>
             </div>
             <div className="flex items-center gap-3">
                <button onClick={handleToday} className="text-[10px] font-black uppercase tracking-widest text-primary px-5 py-2.5 bg-primary/5 rounded-xl border border-primary/10 hover:bg-primary/10 transition-colors">Hoje</button>
                <button
                   onClick={() => toast.info("Para solicitar um novo agendamento, entre em contato com seu professor! 📅")}
                   className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95"
                   title="Solicitar agendamento"
                 >
                   <Plus size={16} />
                 </button>
             </div>
          </div>

          {viewType !== "dia" && (
            <div className="grid grid-cols-7 border-b border-border/10 bg-background/80 shadow-sm">
               {days.map(day => (
                 <div key={day} className="py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">{day}</div>
               ))}
            </div>
          )}

          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className={cn("grid min-h-[600px] bg-background/40", 
              viewType === "mes" ? "grid-cols-7" : 
              viewType === "semana" ? "grid-cols-7" : 
              "grid-cols-1"
            )}
          >
             {(viewType === "mes" ? monthDays : viewType === "semana" ? weekDays : [currentDate]).map((day, dayIdx) => {
               const dayLessons = lessons?.filter(l => isSameDay(new Date(l.scheduledAt), day)) || [];
               const isToday = isSameDay(day, new Date());
               const isCurrentMonth = day.getMonth() === currentDate.getMonth();
               
               return (
                 <motion.div 
                   variants={item}
                   key={day.toString()} 
                   className={cn(
                     "border-r border-border/10 p-3 space-y-3 last:border-r-0 transition-colors relative group",
                     viewType === "mes" && !isCurrentMonth ? "opacity-30 grayscale pointer-events-none" : "",
                     viewType === "mes" ? "min-h-[140px] border-b" : "",
                     isToday ? "bg-primary/[0.03]" : "hover:bg-background/80"
                   )}
                 >
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black mx-auto mb-4 transition-transform group-hover:scale-110",
                      isToday ? "bg-gradient-to-tr from-primary to-purple-500 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)]" : "text-foreground bg-background/80 shadow-sm"
                    )}>
                       {format(day, "dd")}
                    </div>

                    <div className={cn("space-y-3", viewType === "dia" ? "max-w-2xl mx-auto" : "")}>
                      <AnimatePresence>
                        {dayLessons.map(lesson => (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={lesson.id} 
                            className={cn(
                              "p-3 rounded-2xl border-l-4 text-[10px] font-bold cursor-pointer hover:shadow-lg transition-all group/item relative overflow-hidden",
                              lesson.status === 'concluida' 
                                ? "bg-green-500/5 border-green-500/30 text-green-700" 
                                : "bg-primary/5 border-primary text-primary"
                            )}
                          >
                             <div className="flex items-center justify-between mb-1.5">
                               <div className="flex items-center gap-1.5 opacity-80">
                                  <Clock size={10} />
                                  <span>{format(new Date(lesson.scheduledAt), "HH:mm")}</span>
                               </div>
                               {lesson.status === 'concluida' && <CheckCircle2 size={10} />}
                             </div>
                             <p className="text-foreground font-black truncate mb-1">{lesson.title}</p>
                             
                             {lesson.teacherName && (
                               <div className="flex items-center gap-1.5 mt-2 mb-1.5 opacity-90">
                                 <Avatar className="w-4 h-4 ring-1 ring-border shadow-sm">
                                   {lesson.teacherFoto ? (
                                     <img src={lesson.teacherFoto} alt={lesson.teacherName} className="object-cover w-full h-full" />
                                   ) : (
                                     <AvatarFallback className="text-[7px] bg-primary/10 text-primary font-black">
                                       {lesson.teacherName.charAt(0).toUpperCase()}
                                     </AvatarFallback>
                                   )}
                                 </Avatar>
                                 <span className="text-[10px] font-semibold text-foreground/80 truncate">Prof. {lesson.teacherName}</span>
                               </div>
                             )}
                             
                              <div className="flex items-center gap-1.5 opacity-80 text-[9px]">
                                <MapPin size={10} className="text-primary shrink-0" />
                                {lesson.lessonType === 'online' ? (
                                  <span className="truncate text-indigo-400 font-semibold">Online</span>
                                ) : (
                                  <span className="flex items-center gap-1 truncate max-w-[90%] font-medium">
                                    {(lesson as any).studioRoomColor && (
                                      <span 
                                        className="w-1.5 h-1.5 rounded-full inline-block shrink-0" 
                                        style={{ backgroundColor: (lesson as any).studioRoomColor }}
                                      />
                                    )}
                                    <span className="truncate">{(lesson as any).studioRoomName || "Sala Principal"}</span>
                                  </span>
                                )}
                              </div>
                             
                             <div className="absolute top-1 right-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <MoreVertical size={12} className="text-muted-foreground" />
                             </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    {dayLessons.length === 0 && (
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center opacity-0 group-hover:opacity-[0.03] transition-opacity pointer-events-none text-foreground">
                         <Music size={32} className="opacity-50" />
                      </div>
                    )}
                 </motion.div>
               );
             })}
          </motion.div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4">
         <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aula Agendada</span>
         </div>
         <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/5 border border-green-500/10">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aula Concluída</span>
         </div>
         <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/5 border border-orange-500/10">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Compromisso</span>
         </div>
      </div>
    </div>
  );
}
