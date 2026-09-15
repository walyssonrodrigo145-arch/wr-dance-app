// ─── 🏆 Aba Resultados (portal do aluno) ─────────────────────────────────────
// Histórico completo: desafios avaliados (com feedback), medalhas e rankings.
// O dashboard (/aluno) mostra apenas desafios ATIVOS — aqui fica o histórico.
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy, Medal, Target, Sparkles, Check, X, Clock, MessageCircle,
  Loader2, Flag, Crown,
} from "lucide-react";

interface HistoryItem {
  id: number;
  challengeId: number;
  titulo: string;
  tipo: string;
  pontosBase: number;
  rankingName: string | null;
  status: string;
  pontos: number | null;
  feedback: string | null;
  respostaTexto: string | null;
  createdAt: string | Date | null;
  avaliadoAt: string | Date | null;
}

interface BadgeItem {
  id: number;
  badge: string;
  title: string;
  description: string | null;
  rankingId: number | null;
  awardedAt: string | Date;
}

interface RankingItem {
  rankingId: number;
  name: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  image: string | null;
  position: number | null;
  score: number | null;
  finalPosition: number | null;
  finalScore: number | null;
  totalParticipants: number;
}

const TIPO_LABEL: Record<string, string> = {
  performance: "Performance",
  quiz: "Quiz",
  pratica: "Prática",
  relampago: "Relâmpago",
  batalha: "Batalha 1v1",
  turma: "Turma",
};

const RANK_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ativo: { label: "Em andamento", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  agendado: { label: "Agendado", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  encerrado: { label: "Finalizado", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
};

const positionIcon = (pos: number | null) => {
  if (pos === 1) return <Crown size={16} className="text-amber-400" />;
  if (pos === 2) return <Medal size={16} className="text-slate-300" />;
  if (pos === 3) return <Medal size={16} className="text-amber-600" />;
  return null;
};

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function StudentResults() {
  const { data: history = [], isLoading: loadingHistory } = trpc.challenges.myHistory.useQuery();
  const { data: badges = [], isLoading: loadingBadges } = trpc.rankings.myBadges.useQuery();
  const { data: myRankings = [], isLoading: loadingRankings } = trpc.rankings.myRankings.useQuery();

  const desafios = (history || []) as HistoryItem[];
  const medalhas = (badges || []) as BadgeItem[];
  const rankings = (myRankings || []) as RankingItem[];

  const aprovados = desafios.filter((d) => d.status === "aprovado");
  const pontosDesafios = aprovados.reduce((acc, d) => acc + (d.pontos ?? 0), 0);
  const aguardando = desafios.filter((d) => d.status === "enviado").length;

  return (
    <div className="space-y-5">
      {/* ── Anúncio da nova aba ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden rounded-[2rem] p-5 md:p-7 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 text-white shadow-2xl shadow-indigo-500/20"
      >
        <div className="absolute top-0 right-0 w-52 h-52 bg-white/10 rounded-full blur-[60px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex items-start gap-3.5 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 backdrop-blur">
            <Trophy size={20} className="md:hidden text-amber-300" />
            <Trophy size={22} className="hidden md:block text-amber-300" />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Novidade no seu portal</p>
            <h1 className="text-base md:text-xl font-black font-outfit tracking-tight text-white leading-tight">
              Esta é a aba <span className="text-amber-300">Resultados</span>!
            </h1>
            <p className="text-[11px] md:text-sm font-medium text-white/85 max-w-xl leading-relaxed">
              Aqui fica guardado o seu histórico completo: desafios avaliados com o feedback do seu professor, medalhas conquistadas e todas as competições de ranking que você participou. O seu painel agora fica limpo, mostrando só os desafios ativos.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── KPIs (divs custom — padrão Dashboard admin) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Desafios aprovados", value: aprovados.length, icon: <Check size={18} className="text-emerald-500" />, box: "bg-emerald-500/10", delay: 0.05 },
          { label: "Pontos em desafios", value: pontosDesafios, icon: <Sparkles size={18} className="text-amber-500" />, box: "bg-amber-500/10", delay: 0.1 },
          { label: "Medalhas", value: medalhas.length, icon: <Medal size={18} className="text-violet-500" />, box: "bg-violet-500/10", delay: 0.1 },
          { label: "Competições", value: rankings.length, icon: <Flag size={18} className="text-indigo-500" />, box: "bg-indigo-500/10", delay: 0.15 },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: kpi.delay, duration: 0.35, ease: "easeOut" }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", kpi.box)}>{kpi.icon}</div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">{kpi.label}</p>
              <p className="text-xl md:text-2xl font-black font-outfit text-foreground leading-none mt-1">{kpi.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Abas ── */}
      <Tabs defaultValue="desafios">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex h-auto sm:h-11 gap-1 p-1 rounded-2xl bg-muted/50">
          <TabsTrigger value="desafios" className="rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 gap-1.5 min-h-[40px]">
            <Target size={12} /> <span>Desafios</span>
            {aguardando > 0 && <span className="px-1.5 rounded-full bg-amber-500 text-white text-[8px] leading-4">{aguardando}</span>}
          </TabsTrigger>
          <TabsTrigger value="medalhas" className="rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 gap-1.5 min-h-[40px]">
            <Medal size={12} /> <span>Medalhas</span>
          </TabsTrigger>
          <TabsTrigger value="rankings" className="rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 gap-1.5 min-h-[40px]">
            <Trophy size={12} /> <span>Rankings</span>
          </TabsTrigger>
        </TabsList>

        {/* Desafios — histórico */}
        <TabsContent value="desafios" className="mt-4">
          {loadingHistory ? (
            <Loading />
          ) : desafios.length === 0 ? (
            <EmptyState icon={<Target size={32} className="text-muted-foreground/25" />} title="Nenhum desafio respondido ainda" desc="Quando você responder os desafios do seu professor, o resultado e o feedback aparecem aqui." />
          ) : (
            <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {desafios.map((d) => (
                <motion.div key={d.id} variants={itemVariants} className={cn(
                  "p-4 rounded-2xl border flex flex-col gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                  d.status === "aprovado" ? "bg-emerald-500/5 border-emerald-500/20"
                    : d.status === "reprovado" ? "bg-rose-500/5 border-rose-500/20"
                    : "bg-card/60 border-border/40"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground text-[9px] font-black uppercase tracking-widest border border-border/50 shrink-0">
                      {TIPO_LABEL[d.tipo] ?? "Desafio"}
                    </span>
                    {d.status === "aprovado" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0">
                        <Check size={11} /> Aprovado • {d.pontos ?? 0} pts
                      </span>
                    ) : d.status === "reprovado" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest shrink-0">
                        <X size={11} /> Não aprovado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest shrink-0">
                        <Clock size={11} /> Avaliando
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-black text-foreground leading-snug">{d.titulo}</p>
                  {d.respostaTexto && <p className="text-[11px] text-muted-foreground font-medium line-clamp-2 italic">"{d.respostaTexto}"</p>}
                  <div className="flex items-center gap-2 flex-wrap text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {d.createdAt && <span>{format(new Date(d.createdAt), "dd MMM yyyy", { locale: ptBR })}</span>}
                    {d.rankingName && <span className="text-indigo-500">🏆 {d.rankingName}</span>}
                    {d.status !== "aprovado" && <span>valia {d.pontosBase} pts</span>}
                  </div>
                  {d.feedback && (
                    <p className="text-[11px] text-muted-foreground font-medium italic flex items-start gap-1.5 bg-background/60 rounded-xl p-2.5">
                      <MessageCircle size={12} className="shrink-0 mt-0.5" /> Feedback do professor: "{d.feedback}"
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </TabsContent>

        {/* Medalhas */}
        <TabsContent value="medalhas" className="mt-4">
          {loadingBadges ? (
            <Loading />
          ) : medalhas.length === 0 ? (
            <EmptyState icon={<Medal size={32} className="text-muted-foreground/25" />} title="Nenhuma medalha ainda" desc="Complete desafios, frequente as aulas e participe dos rankings para conquistar medalhas." />
          ) : (
            <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {medalhas.map((m) => (
                <motion.div key={m.id} variants={itemVariants} className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/8 to-amber-500/8 border border-amber-500/20 flex flex-col items-center text-center gap-2 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300">
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-inner">
                    <Medal size={22} className="text-amber-500" />
                  </div>
                  <p className="text-sm font-black text-foreground leading-snug">{m.title}</p>
                  {m.description && <p className="text-[11px] text-muted-foreground font-medium">{m.description}</p>}
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                    {format(new Date(m.awardedAt), "dd MMM yyyy", { locale: ptBR })}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </TabsContent>

        {/* Rankings */}
        <TabsContent value="rankings" className="mt-4">
          {loadingRankings ? (
            <Loading />
          ) : rankings.length === 0 ? (
            <EmptyState icon={<Trophy size={32} className="text-muted-foreground/25" />} title="Nenhuma competição ainda" desc="Quando seu professor criar um ranking e você entrar nele, seu histórico de competições aparece aqui." />
          ) : (
            <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rankings.map((r) => {
                const st = RANK_STATUS_LABEL[r.status] ?? RANK_STATUS_LABEL.ativo;
                const pos = r.status === "encerrado" ? r.finalPosition : r.position;
                const score = r.status === "encerrado" ? r.finalScore : r.score;
                return (
                  <motion.div key={r.rankingId} variants={itemVariants} className="p-4 rounded-2xl bg-card/60 backdrop-blur-md border border-border/40 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex flex-col items-center justify-center shrink-0 overflow-hidden">
                      {r.image ? (
                        <img src={r.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          {positionIcon(pos) ?? <Flag size={18} className="text-indigo-400" />}
                          <span className="text-[9px] font-black text-muted-foreground mt-0.5">{pos ? `${pos}º` : "—"}</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-foreground truncate">{r.name}</p>
                        <span className={cn("px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0", st.cls)}>{st.label}</span>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                        {format(new Date(r.startDate), "dd MMM", { locale: ptBR })} → {format(new Date(r.endDate), "dd MMM yyyy", { locale: ptBR })} · {r.totalParticipants} participante{r.totalParticipants === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black font-outfit text-foreground leading-none">{score ?? 0}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">pontos</p>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 size={26} className="animate-spin text-primary" />
      <span className="text-[10px] font-black uppercase tracking-widest">Carregando...</span>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 bg-card/40 rounded-[2rem] border-2 border-dashed border-border/50 text-center px-6">
      {icon}
      <p className="text-sm font-black text-foreground mt-3">{title}</p>
      <p className="text-xs text-muted-foreground font-medium mt-1.5 max-w-sm">{desc}</p>
    </div>
  );
}
