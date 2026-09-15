import { motion } from "framer-motion";
import { Music, User, Users, LayoutList } from "lucide-react";
import { safeFormat } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const DAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

// Map from mobile filter chip label to DB status value
export const STATUS_CHIP_MAP: Record<string, string> = {
  "Agendadas": "agendada",
  "Concluídas": "concluida",
  "Canceladas": "cancelada",
  "Remarcadas": "remarcada",
  "Faltas": "falta",
};

export const AULA_STATUS_CONFIG = {
  agendada: { label: "Agendada", badgeBg: "bg-blue-600 text-white", text: "text-blue-700 dark:text-blue-300", cardBg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-300/80 dark:border-blue-800/60 border-l-blue-600" },
  concluida: { label: "Concluída", badgeBg: "bg-emerald-600 text-white", text: "text-emerald-700 dark:text-emerald-300", cardBg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-300/80 dark:border-emerald-800/60 border-l-emerald-600" },
  cancelada: { label: "Cancelada", badgeBg: "bg-rose-600 text-white", text: "text-rose-700 dark:text-rose-300", cardBg: "bg-rose-50 dark:bg-rose-950", border: "border-rose-300/80 dark:border-rose-800/60 border-l-rose-600" },
  remarcada: { label: "Remarcada", badgeBg: "bg-purple-600 text-white", text: "text-purple-700 dark:text-purple-300", cardBg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-300/80 dark:border-purple-800/60 border-l-purple-600" },
  falta: { label: "Falta", badgeBg: "bg-amber-600 text-white", text: "text-amber-700 dark:text-amber-300", cardBg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-300/80 dark:border-amber-800/60 border-l-amber-600" },
  a_repor: { label: "Aula a Repor", badgeBg: "bg-violet-600 text-white", text: "text-violet-700 dark:text-violet-300", cardBg: "bg-violet-50 dark:bg-violet-950", border: "border-violet-300/80 dark:border-violet-800/60 border-l-violet-600" },
};

// Destaque visual TOTAL para aulas que NÃO são semanais (quinzenal/mensal).
// Cores customizadas que NÃO existem em nenhum outro estado do sistema:
// - Quinzenal (15/15): TEAL/verde-azulado (modelo do dono: fundo liso sólido,
//   borda teal completa, selo 16:00 + 15/15 sólidos, card mais esticado).
// - Mensal: rosa-magenta, mesmo modelo estrutural.
export const RECURRENCE_CARD_CONFIG: Record<string, {
  label: string; cardStyle: string; chip: string; hourBadge: string; statusText: string;
}> = {
  quinzenal: {
    label: "15/15",
    cardStyle: "bg-[#f0fdfa] dark:bg-[#042f2e] border-2 border-[#5eead4] dark:border-[#0f766e] border-l-4 border-l-[#0d9488] rounded-2xl p-3.5 backdrop-blur-none",
    chip: "bg-[#0d9488] text-white",
    hourBadge: "bg-[#0d9488] text-white",
    statusText: "text-[#0f766e] dark:text-[#5eead4]",
  },
  mensal30: {
    label: "MENSAL",
    cardStyle: "bg-[#fdf2f9] dark:bg-[#2b0a24] border-2 border-[#f9a8d4] dark:border-[#9d174d] border-l-4 border-l-[#be185d] rounded-2xl p-3.5 backdrop-blur-none",
    chip: "bg-[#be185d] text-white",
    hourBadge: "bg-[#be185d] text-white",
    statusText: "text-[#be185d] dark:text-[#f9a8d4]",
  },
  mensal_fixo: {
    label: "MENSAL",
    cardStyle: "bg-[#fdf2f9] dark:bg-[#2b0a24] border-2 border-[#f9a8d4] dark:border-[#9d174d] border-l-4 border-l-[#be185d] rounded-2xl p-3.5 backdrop-blur-none",
    chip: "bg-[#be185d] text-white",
    hourBadge: "bg-[#be185d] text-white",
    statusText: "text-[#be185d] dark:text-[#f9a8d4]",
  },
};

export const LessonCardDesktop = ({ lesson, onClick }: { lesson: any, onClick: (e: React.MouseEvent) => void }) => {
    const isTurma = lesson.lessonType === 'turma';
    const config = AULA_STATUS_CONFIG[lesson.status as keyof typeof AULA_STATUS_CONFIG] || AULA_STATUS_CONFIG.agendada;
    const titleText = isTurma ? (lesson.title || "Turma") : (lesson.studentName || lesson.experimentalName || "Aula");

    const isConcluida = lesson.status === 'concluida';
    const isFalta = lesson.status === 'falta';

    // Destaque de recorrência (só para quinzenal/mensal — semanais ficam no padrão)
    const recurrenceConfig = !isTurma && lesson.recurrence
      ? RECURRENCE_CARD_CONFIG[lesson.recurrence as string]
      : undefined;

    const cardStyle = isTurma
      ? isConcluida
        ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300/80 dark:border-emerald-800/60 border-l-emerald-600"
        : isFalta
        ? "bg-amber-50 dark:bg-amber-950 border-amber-300/80 dark:border-amber-800/60 border-l-amber-600"
        : "bg-purple-50 dark:bg-purple-950 border-purple-300/80 dark:border-purple-800/60 border-l-purple-600"
      : recurrenceConfig
      ? recurrenceConfig.cardStyle
      : `${config.cardBg} ${config.border}`;

    const badgeStyle = isTurma
      ? isConcluida
        ? "bg-emerald-600 text-white"
        : isFalta
        ? "bg-amber-600 text-white"
        : "bg-purple-600 text-white"
      : recurrenceConfig?.hourBadge ?? config.badgeBg;

    const turmaTagStyle = isConcluida
      ? "text-emerald-700 dark:text-emerald-300 bg-emerald-200/60 dark:bg-emerald-900/60"
      : isFalta
      ? "text-amber-700 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/60"
      : "text-purple-700 dark:text-purple-300 bg-purple-200/60 dark:bg-purple-900/60";

    return (
      <motion.div
        layoutId={`lesson-${lesson.id}`}
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        className={cn(
          "p-3.5 rounded-2xl border border-l-4 transition-all cursor-pointer shadow-sm mb-2 hover:shadow-md backdrop-blur-none select-none overflow-hidden",
          cardStyle
        )}
      >
        {/* Linha 1: Horário + Tag status + selo de recorrência (modelo liso/esticado) */}
        <div className="flex flex-col gap-1.5 mb-2 min-w-0">
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider uppercase shadow-xs w-fit shrink-0", badgeStyle)}>
            {safeFormat(lesson.scheduledAt, "HH:mm")}
          </span>
          {isTurma ? (
            <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full flex items-center gap-0.5 w-fit max-w-full truncate", turmaTagStyle)}>
              {isConcluida ? "✓ CONCLUÍDA" : isFalta ? "FALTA" : "TURMA"}
            </span>
          ) : (
            <span className={cn("text-[9px] font-bold uppercase truncate", recurrenceConfig?.statusText ?? config.text)}>
              {config.label}
            </span>
          )}
          {recurrenceConfig && (
            <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shadow-xs w-fit", recurrenceConfig.chip)}>
              {recurrenceConfig.label}
            </span>
          )}
        </div>

        {/* Linha 2: Título */}
        <p className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100 truncate leading-snug">
          {titleText}
        </p>

        {/* Linha 3: Instrumento e Professor — em coluna para não quebrar */}
        <div className="flex flex-col gap-0.5 mt-2.5 pt-2 border-t border-black/5 dark:border-white/5 text-[9px] min-w-0">
          <div className="flex items-center gap-1 min-w-0 font-bold text-slate-600 dark:text-slate-300">
            <Music size={9} className="shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="truncate uppercase">{lesson.instrumentName || "Geral"}</span>
          </div>
          {lesson.teacherName && (
            <div className="flex items-center gap-1 min-w-0 font-bold text-blue-700 dark:text-blue-300">
              <User size={9} className="shrink-0" />
              <span className="truncate">{lesson.teacherName.split(' ')[0]}</span>
            </div>
          )}
        </div>

        {/* Sala (opcional) */}
        {lesson.studioRoomName && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-black/5 dark:border-white/5 font-black text-indigo-700 dark:text-indigo-300 text-[9px] min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lesson.studioRoomColor || '#6366f1' }} />
            <LayoutList size={9} className="shrink-0 text-indigo-500" />
            <span className="truncate uppercase font-extrabold">{lesson.studioRoomName}</span>
          </div>
        )}

        {/* Badge de alunos (turma) */}
        {isTurma && (
          <div className={cn("mt-2 py-0.5 px-1.5 rounded-full w-fit flex items-center gap-0.5 border text-[8px] font-black uppercase tracking-wider", isConcluida ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" : isFalta ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" : "bg-purple-600/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 border-purple-500/20")}>
            <Users size={9} />
            <span>{lesson.studentCount || 1} Alunos</span>
          </div>
        )}
      </motion.div>
    );
};