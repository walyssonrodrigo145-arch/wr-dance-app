// ─── 🎯 Desafios (PRD_RANKINGS §55) — lado do ALUNO ───────────────────────────
// Lista desafios no escopo do aluno e permite responder (texto, mídia ou quiz).
// A aprovação do professor é obrigatória para pontuar.
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Target, Loader2, Clock, Upload, X, Music, FileQuestion, Timer, Swords, Users, Sparkles, Check, Trophy, MessageCircle,
} from "lucide-react";

// ─── Tipos (contrato de challenges.myChallenges) ─────────────────────────────
interface QuizQ { q: string; opts: string[]; correct: number }
interface MyChallenge {
  id: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  pontos: number;
  prazo: string | Date | null;
  rankingId: number | null;
  praticaMinutos: number | null;
  praticaDias: number | null;
  quizQuestions: QuizQ[];
  minhaResposta: { status: string; pontos: number | null; feedback: string | null } | null;
}

const TIPO_BADGE: Record<string, { label: string; cls: string; icon: typeof Music }> = {
  performance: { label: "Performance", cls: "bg-violet-500/10 text-violet-600 border-violet-500/20", icon: Music },
  quiz: { label: "Quiz", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: FileQuestion },
  pratica: { label: "Prática", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: Timer },
  relampago: { label: "Relâmpago", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Sparkles },
  batalha: { label: "Batalha 1v1", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", icon: Swords },
  turma: { label: "Turma", cls: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", icon: Users },
};

const isExpired = (c: MyChallenge) => !!c.prazo && new Date(c.prazo) < new Date();

export function ChallengesSection() {
  const { data: challenges = [], isLoading } = trpc.challenges.myChallenges.useQuery();
  const [respondId, setRespondId] = useState<number | null>(null);

  if (isLoading) return null;
  if (!challenges.length) return null;

  const respondTarget = (challenges as MyChallenge[]).find((c) => c.id === respondId) ?? null;

  return (
    <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] overflow-hidden relative">
      <div className="absolute top-0 left-0 w-[260px] h-[260px] bg-indigo-500/10 rounded-full blur-[70px] -translate-y-1/2 -translate-x-1/4 pointer-events-none" />
      <CardContent className="p-6 md:p-8 relative z-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
              <Target size={11} /> Desafios
            </div>
            <p className="text-xs font-bold text-muted-foreground">Responda os desafios do seu professor — aprovados, viram pontos e medalhas.</p>
          </div>
        </div>

        {/* Lista */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(challenges as MyChallenge[]).map((c) => {
            const badge = TIPO_BADGE[c.tipo] ?? TIPO_BADGE.performance;
            const BadgeIcon = badge.icon;
            const expired = isExpired(c);
            const mine = c.minhaResposta;
            return (
              <div key={c.id} className="p-4 rounded-2xl bg-card/60 border border-border/40 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border", badge.cls)}>
                    <BadgeIcon size={10} /> {badge.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-600 shrink-0">
                    <Sparkles size={11} /> {c.pontos} pts
                  </span>
                </div>

                <p className="text-sm font-black text-foreground leading-snug">{c.titulo}</p>
                {c.descricao && <p className="text-[11px] text-muted-foreground font-medium line-clamp-2">{c.descricao}</p>}

                {c.tipo === "pratica" && (c.praticaMinutos || c.praticaDias) && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Meta: {c.praticaMinutos ?? 0} min/dia · {c.praticaDias ?? 0} {c.praticaDias === 1 ? "dia" : "dias"}
                  </p>
                )}

                {c.prazo && (
                  <p className={cn("flex items-center gap-1 text-[10px] font-black uppercase tracking-widest", expired ? "text-rose-500" : "text-muted-foreground")}>
                    <Clock size={11} /> Prazo: {format(new Date(c.prazo), "dd MMM HH:mm", { locale: ptBR })}
                  </p>
                )}

                <div className="mt-auto pt-1">
                  {mine ? (
                    mine.status === "aprovado" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                        <Check size={12} /> Aprovado • {mine.pontos ?? 0} pts
                      </span>
                    ) : mine.status === "reprovado" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 text-[10px] font-black uppercase tracking-widest">
                        <X size={12} /> Não aprovado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 text-[10px] font-black uppercase tracking-widest">
                        <Clock size={12} /> Aguardando avaliação
                      </span>
                    )
                  ) : expired ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                      <Clock size={12} /> Prazo encerrado
                    </span>
                  ) : (
                    <Button
                      onClick={() => setRespondId(c.id)}
                      className="h-9 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all px-4"
                    >
                      <Target size={12} className="mr-1" /> Responder
                    </Button>
                  )}
                  {mine?.feedback && (
                    <p className="mt-2 text-[11px] text-muted-foreground font-medium italic flex items-start gap-1.5">
                      <MessageCircle size={12} className="shrink-0 mt-0.5" /> "{mine.feedback}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {respondTarget && <RespondModal challenge={respondTarget} onClose={() => setRespondId(null)} />}
    </Card>
  );
}

// ═══ Modal de resposta ═══
function RespondModal({ challenge, onClose }: { challenge: MyChallenge; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const uploadMutation = trpc.challenges.uploadResponse.useMutation();
  const respondMutation = trpc.challenges.respond.useMutation({
    onSuccess: () => {
      toast.success("Resposta enviada! O professor irá avaliar.");
      utils.challenges.myChallenges.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isQuiz = challenge.tipo === "quiz";
  const quizQs = (challenge.quizQuestions || []) as QuizQ[];
  const allAnswered = quizQs.length > 0 && quizQs.every((_, i) => answers[i] != null);

  const pickFile = (file: File | null) => {
    if (file && file.size > 60 * 1024 * 1024) { toast.error("Arquivo maior que 60MB."); return; }
    setUploadFile(file);
  };

  const submit = async () => {
    if (!texto.trim() && !uploadFile && !isQuiz) { toast.error("Escreva uma resposta ou anexe um vídeo/áudio."); return; }
    if (isQuiz && quizQs.length === 0) { toast.error("Este quiz não tem perguntas. Avise o professor."); return; }
    if (isQuiz && !allAnswered) { toast.error("Responda todas as perguntas do quiz."); return; }
    if (challenge.tipo === "performance" && !uploadFile) { toast.error("Anexe um vídeo ou áudio da sua performance."); return; }

    let fileUrl: string | undefined;
    let fileType: string | undefined;
    if (uploadFile) {
      const toastId = toast.loading(`Enviando ${uploadFile.name}...`);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
          reader.readAsDataURL(uploadFile);
        });
        const { url } = await uploadMutation.mutateAsync({ fileName: uploadFile.name, fileType: uploadFile.type, base64Data: base64 });
        fileUrl = url;
        fileType = uploadFile.type;
      } catch (e: any) {
        toast.dismiss(toastId);
        toast.error("Erro ao enviar mídia: " + (e?.message ?? "tente novamente."));
        return;
      }
      toast.dismiss(toastId);
    }

    respondMutation.mutate({
      challengeId: challenge.id,
      respostaTexto: texto.trim() || undefined,
      fileUrl,
      fileType,
      respostasQuiz: isQuiz ? quizQs.map((_, i) => answers[i] ?? -1) : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto no-scrollbar rounded-[2rem] bg-card border-none shadow-2xl p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2">
            <Target size={18} className="text-indigo-500" /> {challenge.titulo}
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">
            {challenge.descricao || "Envie sua resposta — o professor irá avaliar para valer pontos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1 text-amber-600"><Sparkles size={11} /> {challenge.pontos} pts</span>
            {challenge.prazo && (
              <span className={cn("flex items-center gap-1", isExpired(challenge) ? "text-rose-500" : "")}>
                <Clock size={11} /> {format(new Date(challenge.prazo), "dd MMM HH:mm", { locale: ptBR })}
              </span>
            )}
            {challenge.rankingId && <span className="flex items-center gap-1"><Trophy size={11} /> Vale ranking</span>}
          </div>

          {/* Meta de prática (informativa) */}
          {challenge.tipo === "pratica" && (challenge.praticaMinutos || challenge.praticaDias) && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5"><Timer size={12} /> Meta de treino</p>
              <p className="text-sm font-black text-foreground mt-1">
                {challenge.praticaMinutos ?? 0} minutos por dia, durante {challenge.praticaDias ?? 0} {challenge.praticaDias === 1 ? "dia" : "dias"}
              </p>
            </div>
          )}

          {/* Quiz */}
          {isQuiz ? (
            <div className="space-y-3">
              {quizQs.map((q, qi) => (
                <div key={qi} className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                  <p className="text-xs font-black text-foreground"><span className="text-blue-600">P{qi + 1}.</span> {q.q}</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {q.opts.map((opt, oi) => (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-bold transition-all",
                          answers[qi] === oi ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-card border-border text-foreground hover:border-blue-400"
                        )}
                      >
                        <span className={cn("w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0", answers[qi] === oi ? "bg-white/20" : "bg-muted/60 text-muted-foreground")}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sua resposta</Label>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={challenge.tipo === "pratica" ? "Conte como foi o treino (opcional)..." : "Escreva aqui ou anexe um vídeo/áudio da sua performance..."}
                className="min-h-[90px] rounded-2xl font-medium text-sm resize-none"
              />
            </div>
          )}

          {/* Upload de mídia (não-quiz) */}
          {!isQuiz && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mídia (vídeo/áudio/imagem — opcional)</Label>
              {uploadFile ? (
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border/50">
                  <p className="text-xs font-bold text-foreground truncate">{uploadFile.name}</p>
                  <button type="button" onClick={() => setUploadFile(null)} className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 p-5 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/40 cursor-pointer transition-all text-center">
                  <Upload size={18} className="text-muted-foreground" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Toque para anexar (até 60MB)</span>
                  <input type="file" accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={respondMutation.isPending} className="flex-1 h-11 rounded-xl font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
          <Button onClick={submit} disabled={respondMutation.isPending || uploadMutation.isPending} className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px]">
            {respondMutation.isPending || uploadMutation.isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Check size={14} className="mr-1.5" />} Enviar Resposta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
