import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trophy, TrendingUp, TrendingDown, Minus, Users, Loader2, Flame, X } from "lucide-react";
import { ChallengesSection } from "@/components/student/ChallengesSection";

// ─── Helpers visuais ───────────────────────────────────────────────────────────
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function TrendIndicator({ diff }: { diff: number | null | undefined }) {
  if (diff == null || diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <Minus size={11} /> Manteve
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
        <TrendingUp size={11} /> Subiu {diff} {diff === 1 ? "posição" : "posições"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-500">
      <TrendingDown size={11} /> Caiu {Math.abs(diff)}
    </span>
  );
}

function Avatar({ name, avatar, size = "w-10 h-10" }: { name: string; avatar?: string | null; size?: string }) {
  return avatar ? (
    <img src={avatar} alt={name} className={cn("rounded-full object-cover border border-border shrink-0", size)} />
  ) : (
    <div className={cn("rounded-full bg-primary/10 text-primary flex items-center justify-center font-black uppercase shrink-0 border border-primary/20", size, size.includes("w-12") ? "text-sm" : "text-[10px]")}>
      {name.split(" ")[0].slice(0, 2)}
    </div>
  );
}

/**
 * Card "🏆 Meu Ranking" do dashboard do aluno (PRD §4) + modal de ranking
 * completo (§5-§8) com podium, lista, evolução, proximidade e privacidade.
 */
export function RankingCard() {
  const [modalRankingId, setModalRankingId] = useState<number | null>(null);

  const { data: myRankings, isLoading } = trpc.rankings.myRankings.useQuery();
  const { data: badges = [] } = trpc.rankings.myBadges.useQuery();

  const featured = (myRankings || []).find((r: any) => r.status === "ativo")
    ?? (myRankings || []).find((r: any) => r.status === "encerrado");
  const isActive = featured?.status === "ativo";
  const ended = featured?.status === "encerrado";

  if (isLoading) {
    return (
      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl rounded-[2rem] h-40 animate-pulse" />
    );
  }

  // Estado: sem participação no ranking — o card some, mas os DESAFIOS soltos continuam visíveis
  return (
    <>
      {featured && (<>
      <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.2)] bg-background/60 backdrop-blur-3xl rounded-[2rem] md:rounded-[2.5rem] overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-amber-500/10 rounded-full blur-[70px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <CardContent className="p-6 md:p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">
                <Trophy size={11} /> {isActive ? "Ranking em andamento" : ended ? "Ranking encerrado" : "Ranking"}
              </div>
              <h3 className="text-lg md:text-xl font-black tracking-tight">{featured.name}</h3>
              {ended ? (
                <p className="text-sm font-bold text-muted-foreground">
                  🏆 Ranking encerrado — você terminou em <span className="text-foreground font-black">{featured.finalPosition ?? "—"}º</span> lugar.
                </p>
              ) : (
                <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><Users size={12} /> {featured.totalParticipants} participantes</span>
                  <TrendIndicator diff={featured.positionDiff} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-4xl md:text-5xl font-black tracking-tighter">
                  {MEDALS[featured.position ?? featured.finalPosition ?? 0] ?? ""} {featured.position ?? featured.finalPosition ?? "—"}º
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">posição</p>
              </div>
              <div className="text-center">
                <p className="text-2xl md:text-3xl font-black tracking-tighter text-primary">{featured.score ?? featured.finalScore ?? 0}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">pontos</p>
              </div>
              <button
                onClick={() => setModalRankingId(featured.rankingId)}
                className="h-12 px-6 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                Ver ranking completo
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      </>)}

      {featured && modalRankingId && (
        <RankingFullModal rankingId={modalRankingId} myRankings={myRankings || []} badges={badges as any[]} onClose={() => setModalRankingId(null)} />
      )}

      {/* 🎯 DESAFIOS (PRD_RANKINGS §55): disponíveis mesmo sem ranking — seção autônoma */}
      <ChallengesSection />
    </>
  );
}

// ═══ Modal de ranking completo (§5-§8) ═══

interface FullModalProps {
  rankingId: number;
  myRankings: any[];
  badges: any[];
  onClose: () => void;
}

function RankingFullModal({ rankingId, myRankings, badges, onClose }: FullModalProps) {
  const [selectedId, setSelectedId] = useState(rankingId);
  const { data, isLoading } = trpc.rankings.getStandings.useQuery({ rankingId: selectedId });

  const rows = (data?.rows || []) as any[];
  const podium = rows.filter((r) => r.position <= 3).slice(0, 3);
  const rest = rows.filter((r) => !podium.includes(r));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-[2rem] md:rounded-[2.5rem] p-0 bg-background border-none shadow-2xl">
        {/* Header (§5) */}
        <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-xl border-b border-border/50 p-5 md:p-6 rounded-t-[2rem] md:rounded-t-[2.5rem]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[9px] font-black uppercase tracking-widest border border-amber-500/20 mb-2">
                <Trophy size={10} /> {data?.ranking?.status === "encerrado" ? "Ranking encerrado" : "Em andamento"}
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight truncate">🏆 {data?.ranking?.name}</h2>
              <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1 flex flex-wrap items-center gap-2">
                <span>{data && format(new Date(data.ranking.startDate), "dd MMM", { locale: ptBR })} → {data && format(new Date(data.ranking.endDate), "dd MMM yyyy", { locale: ptBR })}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {data?.participantsCount} participantes</span>
                <span className="text-primary">Sua posição: #{data?.myPosition ?? "—"}</span>
              </p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <X size={18} />
            </button>
          </div>

          {/* Seletor de competições (§8 filtros MVP) */}
          {myRankings.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-4">
              {myRankings.map((r: any) => (
                <button
                  key={r.rankingId}
                  onClick={() => setSelectedId(r.rankingId)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border whitespace-nowrap transition-all shrink-0",
                    selectedId === r.rankingId ? "bg-primary text-white border-primary shadow-lg" : "bg-background border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 md:p-6 space-y-6">
          {isLoading && <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>}

          {!isLoading && data && (
            <>
              {/* Proximidade (§21) */}
              {data.proximity && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                  <Flame size={18} className="text-orange-500 shrink-0" />
                  <p className="text-xs md:text-sm font-bold text-orange-600">
                    🔥 Faltam <span className="font-black">{data.proximity.missingPoints} pontos</span> para você alcançar o {data.proximity.targetPosition}º lugar!
                  </p>
                </div>
              )}
              {data.topRangeNote && (
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                  <p className="text-xs md:text-sm font-bold text-primary">✨ {data.topRangeNote}</p>
                </div>
              )}
              {data.ranking?.history?.podium && data.ranking.status === "encerrado" && data.ranking.history.podium.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.ranking.history.podium.map((p: any) => (
                    <span key={p.position} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-border/50 text-xs font-bold">
                      {MEDALS[p.position] ?? "🏅"} {p.name} · {p.score} pts
                    </span>
                  ))}
                </div>
              )}

              {/* Podium (§6) */}
              {podium.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {podium.map((r) => (
                    <div
                      key={r.studentId}
                      className={cn(
                        "rounded-2xl border p-4 flex flex-col items-center gap-2 text-center bg-gradient-to-b",
                        r.position === 1 ? "from-amber-400/20 to-transparent border-amber-400/40" :
                        r.position === 2 ? "from-slate-300/20 to-transparent border-slate-300/40" :
                        "from-orange-400/20 to-transparent border-orange-400/40"
                      )}
                    >
                      <span className="text-2xl">{MEDALS[r.position]}</span>
                      <Avatar name={r.name} avatar={r.avatar} size={r.position === 1 ? "w-12 h-12" : "w-10 h-10"} />
                      <p className="text-xs font-black truncate w-full">{r.name}</p>
                      {r.score != null && <p className="text-[10px] font-black text-muted-foreground">{r.score} pts</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Lista completa (§7) */}
              {rest.length > 0 && (
                <div className="rounded-2xl border border-border/50 divide-y divide-border/40 overflow-hidden">
                  {rest.map((r) => (
                    <div key={r.studentId} className={cn("flex items-center justify-between gap-3 px-4 py-3", r.isMe && "bg-primary/5")}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 text-center font-black text-sm text-muted-foreground">{r.position}</span>
                        <Avatar name={r.name} avatar={r.avatar} />
                        <span className={cn("text-sm font-bold truncate", r.isMe ? "text-primary font-black" : "text-foreground")}>{r.name}</span>
                        {r.shared && <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">empate</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {r.score != null && <span className="font-black text-sm">{r.score}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Minha posição destacada (privado sem lista) */}
              {rows.length === 1 && rows[0]?.isMe && (
                <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-transparent p-6 text-center space-y-1">
                  <p className="text-4xl font-black tracking-tighter">{MEDALS[data.myPosition ?? 0] ?? ""} {data.myPosition}º</p>
                  <p className="text-sm font-black text-primary">{data.myScore} pontos</p>
                  <TrendIndicator diff={data.myEvolution} />
                </div>
              )}

              {/* Conquistas (§25) */}
              {badges.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Suas conquistas</p>
                  <div className="flex flex-wrap gap-2">
                    {badges.map((b) => (
                      <span key={b.id} title={b.description} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-border/50 text-xs font-bold cursor-default">
                        {b.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
