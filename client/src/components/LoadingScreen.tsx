import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  label?: string;
}

/** Loading unificado das rotas/layout (mesmo visual do boot loader do index.html). */
export default function LoadingScreen({ label = "Carregando DancePro..." }: LoadingScreenProps) {
  return (
    <div
      className="flex-1 h-full min-h-[50vh] flex flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center shadow-xl shadow-pink-500/20">
        <img src="/logo.svg" alt="" aria-hidden className="w-8 h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-primary/60">{label}</span>
      </div>
    </div>
  );
}
