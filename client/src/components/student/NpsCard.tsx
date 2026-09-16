import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Gauge, Loader2, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function scoreColor(score: number) {
  if (score >= 9) return "hover:bg-emerald-600 hover:text-white";
  if (score >= 7) return "hover:bg-amber-500 hover:text-white";
  return "hover:bg-rose-600 hover:text-white";
}

/** Convite de NPS no portal do aluno — reaparece a cada 90 dias após responder. */
export function NpsCard() {
  const utils = trpc.useUtils();
  const { data: latest, isLoading } = trpc.nps.myLatest.useQuery();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const respond = trpc.nps.respond.useMutation({
    onSuccess: () => {
      toast.success("Obrigado pela sua avaliação! 💜");
      utils.nps.myLatest.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || dismissed) return null;
  if (latest && Date.now() - new Date(latest.respondedAt).getTime() < NINETY_DAYS_MS) return null;

  return (
    <Card className="border-none shadow-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Gauge size={20} />
          </div>
          <div>
            <h3 className="font-black text-base leading-tight">Como está sendo sua experiência?</h3>
            <p className="text-xs font-medium text-white/80 mt-1">
              Sua opinião é sigilosa e ajuda a escola a melhorar. De 0 a 10, quanto você recomendaria a escola para um amigo?
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, index) => index).map((value) => (
            <button
              key={value}
              onClick={() => setScore(value)}
              className={cn(
                "w-9 h-9 rounded-xl text-xs font-black border border-white/25 bg-white/10 transition-all",
                score === value ? "bg-white text-indigo-700 border-white" : scoreColor(value)
              )}
            >
              {value}
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Quer deixar um comentário? (opcional)"
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-2xl bg-white/10 border border-white/20 px-4 py-3 text-sm font-medium placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
        />

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setDismissed(true)} className="text-[11px] font-bold text-white/70 hover:text-white">
            Responder depois
          </button>
          <Button
            disabled={score === null || respond.isPending}
            onClick={() => score !== null && respond.mutate({ score, comment: comment.trim() || null })}
            className="bg-white text-indigo-700 hover:bg-white/90 font-black"
          >
            {respond.isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Send size={15} className="mr-1.5" />}
            Enviar avaliação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
