import { trpc } from "@/lib/trpc";
import { 
  FileText, 
  Send, 
  CheckCircle2, 
  ClipboardList,
  Clock,
  AlertCircle,
  Trophy,
  Star,
  ChevronRight,
  Info,
  X,
  Calendar as CalendarIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
};

export default function StudentExercises() {
  const utils = trpc.useContext();
  const { data: exercises, isLoading } = trpc.studentPortal.getExercises.useQuery();
  const [activeTab, setActiveTab] = useState("pendentes");
  const [selectedExercise, setSelectedExercise] = useState<any | null>(null);

  const completeMutation = trpc.studentPortal.completeExercise.useMutation({
    onSuccess: () => {
      utils.studentPortal.getExercises.invalidate();
      utils.studentPortal.getDashboard.invalidate();
      toast.success("Atividade enviada com sucesso! O professor será notificado.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao enviar atividade. Tente novamente.");
    }
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const pending = exercises?.filter(e => e.status === 'pendente') || [];
  const completed = exercises?.filter(e => e.status === 'concluida') || [];

  const ExerciseCard = ({ exercise, isCompleted }: { exercise: any, isCompleted?: boolean }) => (
    <motion.div variants={item}>
      <Card className="border-none shadow-xl bg-card/50 backdrop-blur-sm group hover:shadow-2xl transition-all overflow-hidden relative">
        {!isCompleted && (
          <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
        )}
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner transition-transform group-hover:scale-110 group-hover:rotate-3",
              isCompleted ? "bg-green-100 text-green-600 dark:bg-green-500/10" : "bg-orange-100 text-orange-600 dark:bg-orange-500/10"
            )}>
              <ClipboardList size={24} />
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-3">
                <span className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                  isCompleted ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                )}>
                  {isCompleted ? "Concluído" : "Pendente"}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <Clock size={12} className="text-primary" />
                  {exercise.targetDate ? `Entrega até ${format(new Date(exercise.targetDate), "dd 'de' MMMM", { locale: ptBR })}` : "Sem prazo"}
                </div>
              </div>
              <h3 className="text-xl font-black text-foreground group-hover:text-primary transition-colors line-clamp-2">{exercise.title}</h3>
              <p className="text-sm font-medium text-muted-foreground line-clamp-2">{exercise.description || "Nenhuma instrução adicional informada pelo professor."}</p>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              {isCompleted ? (
                <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-green-50 dark:bg-green-500/5 text-green-600 font-black text-[10px] uppercase tracking-widest border border-green-100 dark:border-green-500/10">
                   <Trophy size={14} /> Nota: 9.5
                </div>
              ) : (
                <button 
                  onClick={() => completeMutation.mutate({ id: exercise.id })}
                  disabled={completeMutation.isPending}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-primary text-white px-2 sm:px-8 py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all overflow-hidden disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Send size={14} className={cn("shrink-0", completeMutation.isPending && "animate-pulse")} />
                  <span className="truncate">{completeMutation.isPending ? "Enviando..." : "Enviar Atividade"}</span>
                </button>
              )}
              <button 
                onClick={() => setSelectedExercise(exercise)}
                className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all shadow-sm flex items-center justify-center"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Meus Exercícios</h1>
          <p className="text-muted-foreground font-medium">Pratique e envie suas atividades para avaliação do professor.</p>
        </div>
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
           <div className="text-right">
             <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sua Evolução</p>
             <p className="text-sm font-black text-primary">85% Concluído</p>
           </div>
           <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
             <Star size={16} fill="currentColor" />
           </div>
        </div>
      </div>

      <Tabs defaultValue="pendentes" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 p-1 rounded-2xl border border-border mb-8 w-full max-w-md grid grid-cols-2">
          <TabsTrigger value="pendentes" className="rounded-xl font-black text-[10px] uppercase tracking-wider sm:tracking-widest px-2 sm:px-8 data-[state=active]:bg-card data-[state=active]:shadow-md transition-all h-10">
            Pendentes ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="corrigidos" className="rounded-xl font-black text-[10px] uppercase tracking-wider sm:tracking-widest px-2 sm:px-8 data-[state=active]:bg-card data-[state=active]:shadow-md transition-all h-10">
            Histórico ({completed.length})
          </TabsTrigger>
        </TabsList>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          key={activeTab}
        >
          <TabsContent value="pendentes" className="space-y-6 outline-none">
            {pending.length > 0 ? (
              pending.map(ex => <ExerciseCard key={ex.id} exercise={ex} />)
            ) : (
              <div className="text-center py-24 bg-card/30 rounded-[2rem] border-2 border-dashed border-border">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="text-green-500 opacity-30" size={32} />
                </div>
                <h3 className="text-xl font-black text-foreground">Tudo pronto!</h3>
                <p className="text-muted-foreground font-medium mt-2">Você não tem exercícios pendentes no momento.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="corrigidos" className="space-y-6 outline-none">
            {completed.length > 0 ? (
              completed.map(ex => <ExerciseCard key={ex.id} exercise={ex} isCompleted />)
            ) : (
              <div className="text-center py-24 bg-card/30 rounded-[2rem] border-2 border-dashed border-border">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <ClipboardList className="text-muted-foreground opacity-30" size={32} />
                </div>
                <h3 className="text-xl font-black text-foreground">Sem histórico</h3>
                <p className="text-muted-foreground font-medium mt-2">Seus exercícios concluídos aparecerão aqui.</p>
              </div>
            )}
          </TabsContent>
        </motion.div>
      </Tabs>

      <Card className="border-none shadow-md bg-secondary/30 rounded-2xl overflow-hidden">
        <CardContent className="p-4 sm:p-5 flex items-start sm:items-center gap-3 sm:gap-4">
           <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
             <Info size={16} />
           </div>
           <div className="flex-1 min-w-0">
             <p className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-wider sm:tracking-widest leading-tight">Dica do Professor</p>
             <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-1">A prática diária de 15 minutos é mais eficaz que 2 horas em um único dia. Mantenha o ritmo!</p>
           </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedExercise} onOpenChange={(open) => !open && setSelectedExercise(null)}>
        <DialogContent className="sm:max-w-[600px] rounded-[2rem] p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-3xl shadow-2xl">
          {selectedExercise && (
            <>
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner",
                    selectedExercise.status === 'concluida' ? "bg-green-100 text-green-600 dark:bg-green-500/10" : "bg-orange-100 text-orange-600 dark:bg-orange-500/10"
                  )}>
                    <ClipboardList size={24} />
                  </div>
                  <div className="flex-1 min-w-0 pt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                        selectedExercise.status === 'concluida' ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                      )}>
                        {selectedExercise.status === 'concluida' ? "Concluído" : "Pendente"}
                      </span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-foreground">{selectedExercise.title}</h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarIcon size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Prazo</span>
                    </div>
                    <p className="font-bold text-foreground">
                      {selectedExercise.targetDate ? format(new Date(selectedExercise.targetDate), "dd 'de' MMMM", { locale: ptBR }) : "Sem prazo definido"}
                    </p>
                  </div>
                  {selectedExercise.status === 'concluida' && (
                    <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/20 space-y-1">
                      <div className="flex items-center gap-2 text-green-600">
                        <Trophy size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Nota</span>
                      </div>
                      <p className="font-bold text-green-600">9.5</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <FileText size={14} /> Descrição da Atividade
                  </h3>
                  <div className="p-5 rounded-2xl bg-muted/30 border border-border/50">
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                      {selectedExercise.description || "O professor não incluiu instruções detalhadas adicionais para este exercício."}
                    </p>
                  </div>
                </div>

                {selectedExercise.status !== 'concluida' && (
                  <div className="pt-4 flex justify-end">
                    <button 
                      onClick={() => {
                        completeMutation.mutate({ id: selectedExercise.id });
                        setSelectedExercise(null);
                      }}
                      disabled={completeMutation.isPending}
                      className="flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
                    >
                      <Send size={16} className={cn(completeMutation.isPending && "animate-pulse")} />
                      {completeMutation.isPending ? "Enviando..." : "Marcar como Concluído"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
