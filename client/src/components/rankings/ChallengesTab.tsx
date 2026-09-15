import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Clock, Users, Check, X, Swords, FileQuestion, Music, Timer, Target, Sparkles, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Tipos ────────────────────────────────────────────────────────────────────
const TIPOS = [
  { id: "performance", label: "Performance", desc: "Aluno responde com vídeo/áudio", icon: Music },
  { id: "quiz", label: "Quiz", desc: "Perguntas de teoria com alternativas", icon: FileQuestion },
  { id: "pratica", label: "Prática", desc: "Meta de treino (minutos/dias)", icon: Timer },
  { id: "relampago", label: "Relâmpago", desc: "Prazo curto (24-48h)", icon: Sparkles },
  { id: "batalha", label: "Batalha 1v1", desc: "Dois alunos, mesmo desafio", icon: Swords },
  { id: "turma", label: "Turma", desc: "Alunos de uma turma", icon: Users },
] as const;

const emptyQuizQ = { q: "", opts: ["", "", "", ""], correct: 0 };

interface PlanFormLike {
  id: number | null;
  titulo: string;
  descricao: string;
  tipo: string;
  pontos: string;
  prazo: string;
  rankingId: string;
  turmaNome: string;
  batalhaStudentA: string;
  batalhaStudentB: string;
  quiz: Array<{ q: string; opts: string[]; correct: number }>;
  praticaMinutos: string;
  praticaDias: string;
}

const emptyForm: PlanFormLike = {
  id: null, titulo: "", descricao: "", tipo: "performance", pontos: "50", prazo: "",
  rankingId: "", turmaNome: "", batalhaStudentA: "", batalhaStudentB: "",
  quiz: [{ ...emptyQuizQ }], praticaMinutos: "30", praticaDias: "3",
};

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  performance: { label: "Performance", cls: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  quiz: { label: "Quiz", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  pratica: { label: "Prática", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  relampago: { label: "Relâmpago", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  batalha: { label: "Batalha 1v1", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  turma: { label: "Turma", cls: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
};

export function ChallengesTab() {
  const utils = trpc.useUtils();
  const { data: challenges = [], isLoading } = trpc.challenges.list.useQuery();
  const { data: rankings = [] } = trpc.rankings.list.useQuery({ status: "todos" });
  const { data: studentsList = [] } = trpc.rankings.listStudents.useQuery();

  const [form, setForm] = useState<PlanFormLike | null>(null);
  const [responsesId, setResponsesId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMutation = trpc.challenges.create.useMutation({
    onSuccess: () => { toast.success("Desafio criado! Alunos foram notificados."); utils.challenges.list.invalidate(); setForm(null); },
    onError: (e) => toast.error("Erro ao criar desafio: " + e.message),
  });
  const encerrarMutation = trpc.challenges.encerrar.useMutation({
    onSuccess: () => { toast.success("Desafio encerrado."); utils.challenges.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.challenges.delete.useMutation({
    onSuccess: () => { toast.success("Desafio excluído."); utils.challenges.list.invalidate(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form) return;
    if (form.titulo.trim().length < 3) { toast.error("Informe o título do desafio."); return; }
    if (form.tipo === "batalha" && form.batalhaStudentA && form.batalhaStudentA === form.batalhaStudentB) {
      toast.error("Selecione dois alunos diferentes para a batalha.");
      return;
    }
    let quizPayload: { q: string; opts: string[]; correct: number }[] | null = null;
    if (form.tipo === "quiz") {
      // Reindexa a correta após remover alternativas vazias; descarta pergunta sem correta válida
      quizPayload = [];
      for (const q of form.quiz) {
        if (!q.q.trim()) continue;
        const kept: string[] = [];
        let correct = -1;
        q.opts.forEach((o, oi) => {
          const t = o.trim();
          if (t) { if (oi === q.correct) correct = kept.length; kept.push(t); }
        });
        if (kept.length >= 2 && correct >= 0) quizPayload.push({ q: q.q.trim(), opts: kept, correct });
      }
      if (quizPayload.length === 0) { toast.error("Adicione ao menos uma pergunta com 2+ alternativas e a correta marcada."); return; }
    }
    createMutation.mutate({
      titulo: form.titulo.trim(),
      descricao: form.descricao || null,
      tipo: form.tipo as any,
      pontos: Number(form.pontos) || 50,
      prazo: form.prazo || null,
      rankingId: form.rankingId ? Number(form.rankingId) : null,
      turmaNome: form.tipo === "turma" ? form.turmaNome : null,
      batalhaStudentA: form.tipo === "batalha" && form.batalhaStudentA ? Number(form.batalhaStudentA) : null,
      batalhaStudentB: form.tipo === "batalha" && form.batalhaStudentB ? Number(form.batalhaStudentB) : null,
      quizQuestions: quizPayload,
      praticaMinutos: form.tipo === "pratica" ? Number(form.praticaMinutos) || 30 : null,
      praticaDias: form.tipo === "pratica" ? Number(form.praticaDias) || 3 : null,
    });
  };

  const batalhaName = (c: any) => {
    const a = (studentsList as any[]).find(s => s.id === c.batalhaStudentA)?.name ?? "?";
    const b = (studentsList as any[]).find(s => s.id === c.batalhaStudentB)?.name ?? "?";
    return `${a} vs ${b}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base lg:text-lg font-black text-foreground uppercase tracking-widest">Desafios</h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-1 max-w-xl">
            Crie desafios para os alunos responderem. A sua aprovação é <b>obrigatória</b> para pontuar — desafios soltos aprovados viram medalhas; ligados a um ranking, somam no total.
          </p>
        </div>
        <Button onClick={() => setForm({ ...emptyForm })} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-6 shadow-lg shadow-indigo-500/20 shrink-0">
          <Plus size={16} /> <span className="text-xs font-black uppercase tracking-widest">Novo Desafio</span>
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
      ) : challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card/40 rounded-[2rem] border-2 border-dashed border-border/50 text-center px-6">
          <Target size={36} className="text-muted-foreground/30 mb-4" />
          <p className="text-sm font-black text-foreground">Nenhum desafio criado</p>
          <p className="text-xs text-muted-foreground font-medium mt-1.5 max-w-sm">Crie desafios de performance (vídeo), quiz de teoria, metas de prática e mais. Aprovados, viram pontos e medalhas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(challenges as any[]).map((c) => {
            const badge = TIPO_BADGE[c.tipo] ?? TIPO_BADGE.performance;
            const isOver = c.prazo && new Date(c.prazo) < new Date();
            return (
              <div key={c.id} className={cn(
                "bg-card/60 backdrop-blur-xl rounded-[1.5rem] border border-border/40 p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5",
                c.status !== "ativa" && "opacity-60"
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border", badge.cls)}>{badge.label}</span>
                    {c.status !== "ativa" && <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest border border-slate-500/20">Encerrado</span>}
                    {c.prazo && isOver && c.status === "ativa" && <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest border border-rose-500/20">Prazo passado</span>}
                  </div>
                  <button onClick={() => setDeleteId(c.id)} title="Excluir" className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white flex items-center justify-center text-rose-500 transition-all active:scale-95 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>

                <p className="text-sm font-black text-foreground leading-snug">{c.titulo}</p>
                {c.descricao && <p className="text-[11px] text-muted-foreground font-medium line-clamp-2">{c.descricao}</p>}

                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span className="flex items-center gap-1"><Sparkles size={11} className="text-amber-500" /> {c.pontos} pts</span>
                  {c.prazo && <span className="flex items-center gap-1"><Clock size={11} /> {format(new Date(c.prazo), "dd MMM HH:mm", { locale: ptBR })}</span>}
                  {c.rankingName && <span className="flex items-center gap-1 truncate">🏆 {c.rankingName}</span>}
                </div>

                <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {c.tipo === "batalha" ? batalhaName(c) : `${c.totalRespostas} resposta${c.totalRespostas === 1 ? "" : "s"}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {c.pendentes > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-600 text-[9px] font-black uppercase tracking-widest border border-amber-500/20">
                        {c.pendentes} pendente{c.pendentes > 1 ? "s" : ""}
                      </span>
                    )}
                    <Button onClick={() => setResponsesId(c.id)} size="sm" className="h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white text-[10px] font-black uppercase tracking-widest border-none px-3">
                      Respostas <ExternalLink size={11} className="ml-1" />
                    </Button>
                    {c.status === "ativa" && (
                      <button onClick={() => encerrarMutation.mutate({ id: c.id })} title="Encerrar desafio" className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground transition-all active:scale-95 shrink-0">
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de criação */}
      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto no-scrollbar rounded-[2rem] bg-card border-none shadow-2xl p-5 sm:p-7">
            <DialogHeader>
              <DialogTitle className="text-xl font-black tracking-tight">Novo Desafio</DialogTitle>
              <DialogDescription className="text-sm font-medium text-muted-foreground">Escolha o tipo e defina os pontos. Você avaliará cada resposta.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Tipo */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TIPOS.map((t) => (
                  <button key={t.id} type="button" onClick={() => setForm(f => ({ ...(f as PlanFormLike), tipo: t.id }))}
                    className={cn("p-3 rounded-xl border text-left transition-all", form.tipo === t.id ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-muted/40 border-border text-foreground hover:border-indigo-400")}>
                    <t.icon size={15} className={cn("mb-1", form.tipo === t.id ? "text-white" : "text-indigo-500")} />
                    <p className="text-[11px] font-black">{t.label}</p>
                    <p className={cn("text-[9px] font-medium leading-tight", form.tipo === t.id ? "text-white/80" : "text-muted-foreground")}>{t.desc}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm(f => f && ({ ...f, titulo: e.target.value }))} placeholder="Ex: Grave a escala de Dó maior em 2 oitavas" className="h-11 rounded-xl font-semibold" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instruções</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm(f => f && ({ ...f, descricao: e.target.value }))} placeholder="Detalhe o que o aluno deve fazer..." className="min-h-[70px] rounded-xl font-medium text-sm resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pontos base</Label>
                  <Input value={form.pontos} onChange={(e) => setForm(f => f && ({ ...f, pontos: e.target.value.replace(/\D/g, "") }))} className="h-11 rounded-xl font-bold" inputMode="numeric" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prazo (opcional)</Label>
                  <Input type="datetime-local" value={form.prazo} onChange={(e) => setForm(f => f && ({ ...f, prazo: e.target.value }))} className="h-11 rounded-xl font-semibold" />
                </div>
              </div>

              {/* Quiz builder */}
              {form.tipo === "quiz" && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5"><FileQuestion size={12} /> Perguntas do Quiz</p>
                  {form.quiz.map((q, qi) => (
                    <div key={qi} className="p-3 rounded-xl bg-card border border-border/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-muted-foreground">P{qi + 1}</span>
                        <Input value={q.q} onChange={(e) => setForm(f => f && ({ ...f, quiz: f.quiz.map((x, i) => i === qi ? { ...x, q: e.target.value } : x) }))} placeholder="Pergunta..." className="h-9 rounded-lg text-sm font-semibold" />
                        {form.quiz.length > 1 && (
                          <button type="button" onClick={() => setForm(f => f && ({ ...f, quiz: f.quiz.filter((_, i) => i !== qi) }))} className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center shrink-0"><X size={13} /></button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.opts.map((o, oi) => (
                          <div key={oi} className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setForm(f => f && ({ ...f, quiz: f.quiz.map((x, i) => i === qi ? { ...x, correct: oi } : x) }))}
                              title="Marcar como correta"
                              className={cn("w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-all",
                                q.correct === oi ? "bg-emerald-500 border-emerald-500 text-white" : "bg-muted/40 border-border text-muted-foreground hover:border-emerald-400")}>
                              {q.correct === oi ? <Check size={12} /> : String.fromCharCode(65 + oi)}
                            </button>
                            <Input value={o} onChange={(e) => setForm(f => f && ({ ...f, quiz: f.quiz.map((x, i) => i === qi ? { ...x, opts: x.opts.map((y, j) => j === oi ? e.target.value : y) } : x) }))} placeholder={`Alternativa ${String.fromCharCode(65 + oi)}`} className="h-9 rounded-lg text-xs font-medium" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={() => setForm(f => f && ({ ...f, quiz: [...f.quiz, { ...emptyQuizQ }] }))} className="w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 border-blue-500/20 hover:bg-blue-500/10">
                    <Plus size={13} className="mr-1" /> Adicionar pergunta
                  </Button>
                </div>
              )}

              {form.tipo === "pratica" && (
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Minutos por dia</Label>
                    <Input value={form.praticaMinutos} onChange={(e) => setForm(f => f && ({ ...f, praticaMinutos: e.target.value.replace(/\D/g, "") }))} className="h-11 rounded-xl font-bold" inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dias de treino</Label>
                    <Input value={form.praticaDias} onChange={(e) => setForm(f => f && ({ ...f, praticaDias: e.target.value.replace(/\D/g, "") }))} className="h-11 rounded-xl font-bold" inputMode="numeric" />
                  </div>
                </div>
              )}

              {form.tipo === "batalha" && (
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-rose-600">Aluno A</Label>
                    <select value={form.batalhaStudentA} onChange={(e) => setForm(f => f && ({ ...f, batalhaStudentA: e.target.value }))} className="w-full h-11 rounded-xl border-border bg-background text-sm font-semibold px-3">
                      <option value="">Selecione...</option>
                      {(studentsList as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-rose-600">Aluno B</Label>
                    <select value={form.batalhaStudentB} onChange={(e) => setForm(f => f && ({ ...f, batalhaStudentB: e.target.value }))} className="w-full h-11 rounded-xl border-border bg-background text-sm font-semibold px-3">
                      <option value="">Selecione...</option>
                      {(studentsList as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {form.tipo === "turma" && (
                <div className="space-y-1.5 p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Turma (nome exato da aula em grupo)</Label>
                  <Input value={form.turmaNome} onChange={(e) => setForm(f => f && ({ ...f, turmaNome: e.target.value }))} placeholder="Ex: Turma de Violão — Manhã" className="h-11 rounded-xl font-semibold" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vincular a um ranking (opcional)</Label>
                <select value={form.rankingId} onChange={(e) => setForm(f => f && ({ ...f, rankingId: e.target.value }))} className="w-full h-11 rounded-xl border-border bg-background text-sm font-semibold px-3">
                  <option value="">Desafio solto (aprovado vira medalha)</option>
                  {(rankings as any[]).filter((r: any) => r.status === "ativo").map((r: any) => (
                    <option key={r.id} value={r.id}>🏆 {r.name} — pontos somam no ranking</option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => setForm(null)} className="flex-1 h-11 rounded-xl font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px]">
                {createMutation.isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null} Criar Desafio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Fila de respostas */}
      {responsesId != null && (
        <ResponsesPanel challengeId={responsesId} challenges={challenges as any[]} onClose={() => setResponsesId(null)} />
      )}

      {/* Confirmação de exclusão */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="w-[92vw] max-w-sm rounded-[2rem] bg-card border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Excluir desafio?</DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">As respostas enviadas também serão excluídas.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)} className="flex-1 h-11 rounded-xl font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
            <Button disabled={deleteMutation.isPending} onClick={() => deleteId != null && deleteMutation.mutate({ id: deleteId })} className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-[10px]">
              {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══ Painel de respostas (fila de avaliação) ═══
function ResponsesPanel({ challengeId, challenges, onClose }: { challengeId: number; challenges: any[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const challenge = challenges.find((c) => c.id === challengeId);
  const { data: responses = [], isLoading } = trpc.challenges.responses.useQuery({ challengeId });
  const avaliarMutation = trpc.challenges.avaliar.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.status === "aprovado" ? `Aprovado — ${data.pontos} pontos!` : "Resposta reprovada com feedback.");
      utils.challenges.responses.invalidate({ challengeId });
      utils.challenges.list.invalidate();
      utils.rankings.standings.invalidate();
    },
    onError: (e) => toast.error("Erro ao avaliar: " + e.message),
  });
  const [pontos, setPontos] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [playing, setPlaying] = useState<{ id: number; url: string; type: string } | null>(null);

  // Mídia via token temporário (/uploads-token) — o link cru /uploads exige cookie
  // de sessão e quebra no mobile/players (mesma causa dos PDFs do portal).
  const mediaMutation = trpc.challenges.mediaUrl.useMutation({
    onSuccess: (data: any, vars: any) => {
      if (data.fileNotFound) { toast.error("Mídia não disponível (removida após o encerramento do desafio ou perdida em rebuild)."); return; }
      setPlaying({ id: vars.responseId, url: data.url, type: data.fileType || "" });
    },
    onError: (e) => toast.error("Erro ao abrir a mídia: " + e.message),
  });

  const quizQs = challenge?.quizQuestions ? (() => { try { return JSON.parse(challenge.quizQuestions); } catch { return []; } })() : [];

  const suggestedPoints = (r: any) => {
    if (challenge?.tipo !== "quiz" || !r.respostasQuiz) return challenge?.pontos ?? 50;
    try {
      const answers = JSON.parse(r.respostasQuiz) as number[];
      const correct = quizQs.reduce((acc: number, q: any, i: number) => acc + (answers[i] === q.correct ? 1 : 0), 0);
      return Math.round((challenge.pontos ?? 50) * (quizQs.length ? correct / quizQs.length : 0));
    } catch { return challenge?.pontos ?? 50; }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-[2rem] bg-card border-none shadow-2xl p-5 sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">Respostas — {challenge?.titulo}</DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">Aprove para pontuar (a aprovação é obrigatória para o desafio valer pontos).</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={26} className="animate-spin text-indigo-500" /></div>
          ) : responses.length === 0 ? (
            <div className="py-12 text-center">
              <Users size={32} className="mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Nenhuma resposta ainda.</p>
            </div>
          ) : (
            (responses as any[]).map((r) => (
              <div key={r.id} className={cn("p-4 rounded-2xl border space-y-3", r.status === "aprovado" ? "bg-emerald-500/5 border-emerald-500/20" : r.status === "reprovado" ? "bg-rose-500/5 border-rose-500/20" : "bg-muted/30 border-border/50")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                      {(r.studentName || "??").slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-black text-foreground truncate">{r.studentName ?? "Aluno"}</p>
                  </div>
                  {r.status !== "enviado" ? (
                    <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest", r.status === "aprovado" ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600")}>
                      {r.status === "aprovado" ? `Aprovado • ${r.pontos} pts` : "Reprovado"}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 text-[9px] font-black uppercase tracking-widest">Aguardando</span>
                  )}
                </div>

                {r.respostaTexto && <p className="text-xs text-foreground font-medium italic bg-background/60 rounded-xl p-3">"{r.respostaTexto}"</p>}

                {r.fileUrl ? (playing && playing.id === r.id ? (
                  <div className="space-y-1.5">
                    {playing.type.startsWith("video") ? (
                      <video src={playing.url} controls autoPlay className="w-full max-h-72 rounded-xl bg-black" />
                    ) : playing.type.startsWith("audio") ? (
                      <audio src={playing.url} controls autoPlay className="w-full" />
                    ) : playing.type.startsWith("image") ? (
                      <img src={playing.url} alt="Anexo do aluno" className="max-h-72 rounded-xl mx-auto" />
                    ) : (
                      <a href={playing.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] font-black text-primary hover:underline">
                        <ExternalLink size={12} /> Abrir anexo
                      </a>
                    )}
                    <button onClick={() => setPlaying(null)} className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest">Fechar mídia</button>
                  </div>
                ) : (
                  <button
                    onClick={() => mediaMutation.mutate({ responseId: r.id })}
                    disabled={mediaMutation.isPending && mediaMutation.variables?.responseId === r.id}
                    className="flex items-center gap-2 text-[11px] font-black text-primary hover:underline disabled:opacity-60"
                  >
                    {mediaMutation.isPending && mediaMutation.variables?.responseId === r.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    {mediaMutation.isPending && mediaMutation.variables?.responseId === r.id
                      ? "Carregando..."
                      : (r.fileType || "").startsWith("video") ? "▶ Ver vídeo do aluno" : (r.fileType || "").startsWith("audio") ? "▶ Ouvir áudio do aluno" : "📄 Abrir anexo"}
                  </button>
                )) : null}

                {r.respostasQuiz && quizQs.length > 0 && (
                  <div className="space-y-1.5">
                    {quizQs.map((q: any, i: number) => {
                      const answer = (JSON.parse(r.respostasQuiz) as number[])[i];
                      const ok = answer === q.correct;
                      return (
                        <p key={i} className={cn("text-[11px] font-bold", ok ? "text-emerald-600" : "text-rose-500")}>
                          {ok ? "✓" : "✗"} P{i + 1}: {q.opts[answer] ?? "—"} {ok ? "" : `· correta: ${q.opts[q.correct]}`}
                        </p>
                      );
                    })}
                  </div>
                )}

                {r.status === "enviado" ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <Input value={pontos[r.id] ?? String(suggestedPoints(r))} onChange={(e) => setPontos(p => ({ ...p, [r.id]: e.target.value.replace(/\D/g, "") }))} placeholder="Pontos" className="h-10 rounded-xl font-black w-full sm:w-24 text-center" inputMode="numeric" />
                    <Input value={feedback[r.id] ?? ""} onChange={(e) => setFeedback(f => ({ ...f, [r.id]: e.target.value }))} placeholder="Feedback para o aluno (opcional)" className="h-10 rounded-xl text-xs font-medium flex-1" />
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => avaliarMutation.mutate({ responseId: r.id, aprovado: false, feedback: feedback[r.id] })}
                        className="h-10 px-4 rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white bg-transparent text-[10px] font-black uppercase tracking-widest border">
                        <X size={13} className="mr-1" /> Recusar
                      </Button>
                      <Button size="sm" disabled={avaliarMutation.isPending} onClick={() => avaliarMutation.mutate({ responseId: r.id, aprovado: true, pontos: Number(pontos[r.id] ?? suggestedPoints(r)), feedback: feedback[r.id] })}
                        className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest">
                        <Check size={13} className="mr-1" /> Aprovar
                      </Button>
                    </div>
                  </div>
                ) : r.feedback ? (
                  <p className="text-[11px] text-muted-foreground font-medium italic">Seu feedback: "{r.feedback}"</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
