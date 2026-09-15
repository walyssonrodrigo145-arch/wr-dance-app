import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  MoreHorizontal, 
  Music,
  Trash2,
  CalendarDays,
  CheckCircle,
  Beaker
} from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LESSON_STATUS_CONFIG } from "@/lib/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LessonCardProps {
  lesson: {
    id: number;
    title: string;
    scheduledAt: string | Date;
    duration: number;
    status: "agendada" | "concluida" | "cancelada" | "remarcada" | "falta";
    studentName?: string | null;
    isExperimental?: boolean;
    experimentalName?: string | null;
    instrumentName?: string | null;
    instrumentColor?: string | null;
    instrumentIcon?: string | null;
    description?: string | null;
    notes?: string | null;
  };
  onStatusChange?: (id: number, status: string) => void;
  onDelete?: (id: number) => void;
  onEdit?: (id: number) => void;
  onClick?: () => void;
}

export default function LessonCard({ lesson, onStatusChange, onDelete, onEdit, onClick }: LessonCardProps) {
  const date = new Date(lesson.scheduledAt);
  
  const config = LESSON_STATUS_CONFIG[lesson.status] || LESSON_STATUS_CONFIG.agendada;
  const StatusIcon = config.icon;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      onClick={() => onClick?.()}
      className={cn(
        "group relative flex items-center gap-3 p-3 md:p-4 rounded-[1.5rem] md:rounded-[2.2rem] border bg-card/50 backdrop-blur-sm transition-all hover:bg-card hover:shadow-xl hover:shadow-primary/5 cursor-pointer",
        lesson.isExperimental ? "bg-yellow-500/10 border-yellow-500/40 shadow-lg shadow-yellow-500/5 hover:bg-yellow-500/20" : config.border
      )}
    >
      {/* ── Status Indicator Loop ── */}
      <div className={cn("w-1 h-8 md:w-1.5 md:h-10 rounded-full", lesson.isExperimental ? "bg-yellow-500" : config.bg.replace('/10', ''))} />

      {/* ── Time & Duration ── */}
      <div className="flex flex-col min-w-[50px] md:min-w-[55px]">
        <span className="text-sm md:text-base font-bold tracking-tight text-foreground">
          {format(date, "HH:mm")}
        </span>
        <span className="text-[8px] md:text-[9px] font-semibold text-muted-foreground/50 uppercase">
          {lesson.duration} MIN
        </span>
      </div>

      {/* ── Info Content ── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
           <h4 className={cn("font-bold text-sm truncate text-foreground/80 leading-tight max-w-[150px] md:max-w-none", lesson.isExperimental && "text-yellow-900")}>
             {lesson.isExperimental ? (lesson.experimentalName || "Aula Teste") : (lesson.studentName || "Aluno")}
           </h4>
           
           {lesson.isExperimental && (
             <div className="p-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex-shrink-0">
               <Beaker size={10} className="text-yellow-600" />
             </div>
           )}
           
           {/* ── Status Icon (Aligned with Name) ── */}
           <div className={cn("p-1 rounded-full shadow-sm border border-border/10 flex-shrink-0", config.bg)}>
             <StatusIcon size={12} className={config.color} />
           </div>

           {lesson.instrumentName && (
             <div 
               className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/50 border border-border/40 w-fit shrink-0"
               style={{ borderColor: lesson.instrumentColor ? `${lesson.instrumentColor}40` : undefined }}
             >
               <Music size={8} className="md:size-[10px]" style={{ color: lesson.instrumentColor || undefined }} />
               <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-tight text-muted-foreground/60">{lesson.instrumentName}</span>
             </div>
           )}
        </div>
        
        {/* Short observation preview */}
        {(lesson.description || lesson.notes) && (
          <p className="text-[11px] text-muted-foreground/50 line-clamp-1 italic">
            {lesson.description || lesson.notes}
          </p>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-muted rounded-full text-muted-foreground/40 hover:text-foreground transition-colors">
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5 shadow-2xl border-border/40">
            <DropdownMenuItem onClick={() => onStatusChange?.(lesson.id, 'concluida')} className="gap-2 p-2.5 rounded-xl text-xs font-semibold uppercase">
              <CheckCircle size={16} className="text-emerald-500" />
              <span>Concluída</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange?.(lesson.id, 'falta')} className="gap-2 p-2.5 rounded-xl text-xs font-semibold uppercase">
              <AlertCircle size={16} className="text-orange-500" />
              <span>Marcar Falta</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange?.(lesson.id, 'remarcada')} className="gap-2 p-2.5 rounded-xl text-xs font-semibold uppercase">
              <CalendarDays size={16} className="text-yellow-500" />
              <span>Remarcada</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange?.(lesson.id, 'cancelada')} className="gap-2 p-2.5 rounded-xl">
              <XCircle size={16} className="text-rose-500" />
              <span className="font-medium">Cancelar Aula</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/40" />
            <DropdownMenuItem onClick={() => onEdit?.(lesson.id)} className="gap-2 p-2.5 rounded-xl">
              <CalendarDays size={16} />
              <span className="font-medium">Editar Detalhes</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete?.(lesson.id)} className="gap-2 p-2.5 rounded-xl text-rose-500 focus:text-rose-500">
              <Trash2 size={16} />
              <span className="font-medium">Excluir Registro</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

