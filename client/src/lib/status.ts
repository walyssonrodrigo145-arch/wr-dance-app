// Mapas de status e emojis de instrumentos — AUDIT FIX (elimina statusConfig duplicado entre LessonCard e LessonDetailModal)
import type { LucideIcon } from "lucide-react";
import { Clock, CheckCircle2, XCircle, CalendarDays, AlertCircle, Repeat } from "lucide-react";

export type LessonStatus = "agendada" | "concluida" | "cancelada" | "remarcada" | "falta" | "a_repor";

export interface LessonStatusConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
  border: string;
}

/** Configuração visual por status de aula (mesmo formato usado em LessonCard e LessonDetailModal). */
export const LESSON_STATUS_CONFIG: Record<LessonStatus, LessonStatusConfig> = {
  agendada: { icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10", label: "Agendada", border: "border-blue-500/20" },
  concluida: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Concluída", border: "border-emerald-500/20" },
  cancelada: { icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10", label: "Cancelada", border: "border-rose-500/20" },
  remarcada: { icon: CalendarDays, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Remarcada", border: "border-yellow-500/20" },
  falta: { icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-500/10", label: "Falta", border: "border-orange-500/20" },
  a_repor: { icon: Repeat, color: "text-violet-500", bg: "bg-violet-500/10", label: "Aula a Repor", border: "border-violet-500/20" },
};

/** Emoji por instrumento musical (usado em mensagens de WhatsApp). */
export function getInstrumentEmoji(inst?: string | null): string {
  if (!inst) return "🎸";
  const n = inst.toLowerCase();
  if (n.includes("teclado") || n.includes("piano")) return "🎹";
  if (n.includes("bateria")) return "🥁";
  if (n.includes("voz") || n.includes("canto")) return "🎤";
  if (n.includes("violino")) return "🎻";
  if (n.includes("sax")) return "🎷";
  if (n.includes("trompete")) return "🎺";
  return "🎸";
}