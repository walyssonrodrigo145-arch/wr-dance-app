import { trpc } from "@/lib/trpc";
import { 
  Calendar, 
  Clock, 
  User,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  History,
  LayoutGrid,
  CalendarDays,
  MoreVertical,
  MapPin,
  Video
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { RescheduleModal } from "@/components/RescheduleModal";
import { ExtraLessonModal } from "@/components/student/ExtraLessonModal";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { EarlySlotBanner } from "@/components/student/EarlySlotBanner";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function StudentLessons() {
  const { data: lessons, isLoading } = trpc.studentPortal.getLessons.useQuery();
  const { data: profile } = trpc.studentPortal.getProfile.useQuery();
  const [activeTab, setActiveTab] = useState("proximas");
  const [selectedLesson, setSelectedLesson] = useState<{ id: number, title: string } | null>(null);
  const [extraLessonOpen, setExtraLessonOpen] = useState(false);
  const [_, setLocation] = useLocation();

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const now = new Date();
  const upcoming = lessons?.filter(l => new Date(l.scheduledAt) >= now && l.status === 'agendada') || [];
  const completed = lessons?.filter(l => new Date(l.scheduledAt) < now || l.status !== 'agendada') || [];

  const StatusBadge = ({ status }: { status: string }) => {
    const configs: Record<string, { label: string, color: string, icon: any }> = {
      agendada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-600', icon: CheckCircle2 },
      concluida: { label: 'Concluída', color: 'bg-green-100 text-green-600', icon: CheckCircle2 },
      cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-600', icon: AlertCircle },
      falta: { label: 'Falta', color: 'bg-orange-100 text-orange-600', icon: AlertCircle },
    };
    const config = configs[status] || configs.agendada;
    return (
      <span className={cn("text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5", config.color)}>
        <config.icon size={10} />
        {config.label}
      </span>
    );
  };

  const LessonCard = ({ lesson }: { lesson: any }) => (
    <motion.div variants={item}>
      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl group hover:-translate-y-1 transition-all duration-300 overflow-hidden relative rounded-[2rem]">
        {lesson.status === 'agendada' && (
           <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-primary to-purple-500" />
        )}
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-stretch md:items-center p-6 gap-6">
            {/* Date Column - Glowing effect */}
            <div className="flex flex-row md:flex-col items-center justify-center md:w-32 md:border-r border-border/20 pr-0 md:pr-6 gap-2">
              <div className="flex flex-col items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] bg-primary/10 text-primary shadow-[0_0_20px_rgba(124,58,237,0.1)] group-hover:shadow-[0_0_30px_rgba(124,58,237,0.3)] transition-all">
                <span className="text-3xl md:text-4xl font-black leading-none">{format(new Date(lesson.scheduledAt), "dd")}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{format(new Date(lesson.scheduledAt), "MMM", { locale: ptBR })}</span>
              </div>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-2 md:mt-3">
                {format(new Date(lesson.scheduledAt), "EEEE", { locale: ptBR })}
              </span>
            </div>

            {/* Info Column */}
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-background/50 px-3 py-1.5 rounded-full border border-border/10 shadow-sm">
                  <Clock size={12} className="text-primary" />
                  <span>{format(new Date(lesson.scheduledAt), "HH:mm")} — {format(new Date(new Date(lesson.scheduledAt).getTime() + (lesson.duration || 60) * 60000), "HH:mm")}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-background/50 px-3 py-1.5 rounded-full border border-border/10 shadow-sm">
                   <MapPin size={12} className="text-primary" />
                   {lesson.studentLessonType === 'online' ? (
                     <span className="text-indigo-400">Aula Online</span>
                   ) : (
                     <span className="flex items-center gap-1.5">
                       {(lesson as any).studioRoomColor && (
                         <span 
                           className="w-2 h-2 rounded-full inline-block" 
                           style={{ backgroundColor: (lesson as any).studioRoomColor }}
                         />
                       )}
                       {(lesson as any).studioRoomName || "Sala Principal"}
                     </span>
                   )}
                </div>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-foreground group-hover:text-primary transition-colors tracking-tight">{lesson.title}</h3>
              <div className="flex items-center gap-3 mt-4">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white text-[10px] font-black shadow-sm overflow-hidden">
                   {(lesson as any).teacherFoto ? (
                     <img src={(lesson as any).teacherFoto} alt={(lesson as any).teacherName || profile?.teacherName} className="w-full h-full object-cover" />
                   ) : (
                     ((lesson as any).teacherName || profile?.teacherName || "PR").slice(0, 2).toUpperCase()
                   )}
                 </div>
                 <p className="text-xs font-bold text-muted-foreground">Prof. <span className="text-foreground">{(lesson as any).teacherName || profile?.teacherName}</span></p>
              </div>
            </div>

            {/* Action Column */}
            <div className="flex flex-row md:flex-col items-center justify-between md:justify-center gap-4 border-t border-border/10 md:border-none pt-6 md:pt-0">
              <StatusBadge status={lesson.status} />
              <div className="flex items-center gap-2">
                 {lesson.status === 'agendada' && (
                   <button 
                     onClick={() => setSelectedLesson({ id: lesson.id, title: lesson.title })}
                     className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary px-5 py-3 rounded-xl border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all"
                   >
                     Remarcar
                   </button>
                 )}
                 {lesson.studentLessonType === 'online' && lesson.onlineMeetingLink && (
                   <button 
                     onClick={() => window.open(lesson.onlineMeetingLink!, '_blank')}
                     className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-background bg-foreground px-5 py-3 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md"
                   >
                     <Video size={12} />
                     Entrar na Aula
                   </button>
                 )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <div className="space-y-10 pb-10 max-w-[1200px] mx-auto">
      {/* Banner de Antecipação Inteligente de Horário por Falta */}
      <EarlySlotBanner />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 p-8 md:p-10 rounded-[2.5rem] bg-card text-card-foreground shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter drop-shadow-sm">Minhas Aulas</h1>
          <p className="text-muted-foreground font-medium mt-2 max-w-md">Gerencie seu cronograma e revise seu histórico musical.</p>
        </div>
        <div className="relative z-10 flex items-center gap-4">
          <button className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center text-foreground hover:bg-muted/80 transition-all shadow-sm">
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setLocation('/aluno/agenda')} className="bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
            <CalendarDays size={14} />
            Ver Agenda
          </button>
        </div>
      </div>

      <Tabs defaultValue="proximas" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-background/60 backdrop-blur-md p-1.5 rounded-2xl mb-10 inline-flex shadow-inner border border-border/10">
          <TabsTrigger value="proximas" className="rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-8 data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-12">
            Próximas Aulas
          </TabsTrigger>
          <TabsTrigger value="concluidas" className="rounded-xl font-black text-[10px] uppercase tracking-[0.2em] px-8 data-[state=active]:bg-primary data-[state=active]:text-white transition-all h-12">
            Histórico
          </TabsTrigger>
        </TabsList>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          key={activeTab}
        >
          <TabsContent value="proximas" className="space-y-6 outline-none">
            {upcoming.length > 0 ? (
              upcoming.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)
            ) : (
              <div className="text-center py-16 bg-background/40 backdrop-blur-md rounded-[2rem] border border-border/20 shadow-sm">
                <div className="w-24 h-24 bg-primary/5 border border-primary/10 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Calendar className="text-primary/30" size={32} />
                </div>
                <h3 className="text-2xl font-black text-foreground tracking-tight">Tudo em dia!</h3>
                <p className="text-muted-foreground font-medium mt-2 max-w-sm mx-auto">Sua rotina está limpa. Você não tem aulas agendadas para os próximos dias.</p>
                <button onClick={() => setExtraLessonOpen(true)} className="mt-8 px-6 py-3 bg-primary/10 text-primary font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-primary/20 active:scale-95 transition-all">
                  Solicitar aula extra
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="concluidas" className="space-y-6 outline-none">
            {completed.length > 0 ? (
              completed.map(lesson => <LessonCard key={lesson.id} lesson={lesson} />)
            ) : (
              <div className="text-center py-16 bg-background/40 backdrop-blur-md rounded-[2rem] border border-border/20 shadow-sm">
                <div className="w-24 h-24 bg-muted/50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner border border-border/10">
                  <History className="text-muted-foreground opacity-20" size={32} />
                </div>
                <h3 className="text-2xl font-black text-foreground tracking-tight">Nada por aqui</h3>
                <p className="text-muted-foreground font-medium mt-2">Seu histórico de aulas ainda está vazio e aparecerá aqui assim que você concluir uma sessão.</p>
              </div>
            )}
          </TabsContent>
        </motion.div>
      </Tabs>

      {selectedLesson && (
        <RescheduleModal 
          open={!!selectedLesson} 
          onOpenChange={(open) => !open && setSelectedLesson(null)}
          lessonId={selectedLesson.id}
          lessonTitle={selectedLesson.title}
        />
      )}

      {/* PRD_AULA_EXTRA: solicitação de aula extra (botão do empty state) */}
      <ExtraLessonModal open={extraLessonOpen} onOpenChange={setExtraLessonOpen} />
    </div>
  );
}
