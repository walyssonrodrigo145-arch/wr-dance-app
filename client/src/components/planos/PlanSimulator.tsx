import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatBRL, parseBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  computePlanRange,
  normalizeStudentCount,
  planMaxAllowedStudents,
  recommendPlan,
  simulateMonthly,
  type SimPlan,
} from "@shared/planPricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, CheckCircle2, MessageCircle, Sparkles, Users } from "lucide-react";

const WHATSAPP_URL =
  "https://wa.me/5533984055949?text=ola%20gostaria%20de%20um%20plano%20sob%20medida%20para%20minha%20escola%20de%20danca";

const nf = new Intl.NumberFormat("pt-BR");

/**
 * Simulador de preços do DancePro: escolha quantas alunas a escola tem e veja o
 * plano recomendado, o total mensal com excedentes e quando falar com a gente.
 * Os preços vêm do banco (Super Admin → Planos), nunca hardcoded.
 */
export default function PlanSimulator({ className }: { className?: string }) {
  const { data: dbPlans, isLoading } = trpc.publicData.getPlans.useQuery();

  const plans = useMemo<SimPlan[]>(
    () =>
      (dbPlans ?? [])
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          priceMonthly: parseBRL(p.priceMonthly),
          maxStudents: Number(p.maxStudents) || 0,
          allowExtraStudents: Boolean(p.allowExtraStudents ?? true),
          extraStudentPrice: parseBRL(p.extraStudentPrice ?? 1.49),
          isPopular: Boolean(p.isPopular),
          order: p.order ?? 0,
        }))
        .filter((p) => p.maxStudents > 0 && p.priceMonthly > 0),
    [dbPlans]
  );

  const range = useMemo(() => computePlanRange(plans), [plans]);
  const [students, setStudents] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const studentCount = normalizeStudentCount(students ?? range.initial, range);
  const recommendation = useMemo(() => recommendPlan(plans, studentCount), [plans, studentCount]);
  const recommended = recommendation.plan;

  const ordered = useMemo(
    () => [...plans].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [plans]
  );

  if (isLoading || plans.length === 0) {
    return (
      <div className={cn("mt-14", className)}>
        <Skeleton className="h-6 w-56 mx-auto" />
        <Skeleton className="mt-4 h-64 rounded-3xl" />
      </div>
    );
  }

  const applyStudents = (value: number) => {
    setStudents(normalizeStudentCount(value, range));
    setDraft("");
  };

  return (
    <div className={cn("mt-14", className)}>
      <div className="text-center mb-8">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Simulador de preço</p>
        <h3 className="text-2xl md:text-3xl font-outfit font-extrabold tracking-tight mt-2">
          Quantas alunas a sua escola tem?
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          Arraste e veja na hora o plano ideal — e quanto fica com alunas excedentes.
        </p>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Users size={12} /> Alunas ativas
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-foreground tabular-nums">{nf.format(studentCount)}</span>
                <span className="text-xs font-bold text-muted-foreground">alunas</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => draft && applyStudents(Number(draft))}
                onKeyDown={(e) => { if (e.key === "Enter" && draft) applyStudents(Number(draft)); }}
                placeholder="Digitar"
                inputMode="numeric"
                className="h-11 w-28 rounded-xl text-sm font-bold"
              />
              <Button type="button" variant="outline" onClick={() => draft && applyStudents(Number(draft))} className="h-11 rounded-xl px-4 text-xs font-bold">
                Aplicar
              </Button>
            </div>
          </div>

          <Slider
            value={[studentCount]}
            min={range.min}
            max={range.max}
            step={range.step}
            onValueChange={(v) => applyStudents(v[0] ?? range.initial)}
            aria-label="Número de alunas"
          />
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>{nf.format(range.min)}</span>
            <span>{nf.format(range.max)}+</span>
          </div>

          {recommended && (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                {recommendation.needsCustomQuote ? (
                  <>
                    <p className="text-sm font-black text-foreground flex items-center gap-1.5">
                      <Sparkles size={14} className="text-primary" /> Plano sob medida para {nf.format(studentCount)} alunas
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Acima de {nf.format(planMaxAllowedStudents(recommended))} alunas no {recommended.name}, montamos uma proposta personalizada.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-foreground flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" /> Recomendado: {recommended.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(() => {
                        const sim = simulateMonthly(recommended, studentCount);
                        return sim.excessCount > 0
                          ? `Inclui ${sim.excessCount} aluna(s) excedente(s) a ${formatBRL(recommended.extraStudentPrice)} cada.`
                          : `Cobre até ${nf.format(recommended.maxStudents)} alunas ativas.`;
                      })()}
                    </p>
                  </>
                )}
              </div>
              <div className="text-right">
                {recommendation.needsCustomQuote ? (
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <Button className="h-11 rounded-xl px-5 text-xs font-bold gap-2 bg-emerald-600 hover:bg-emerald-700">
                      <MessageCircle size={14} /> Falar com a gente
                    </Button>
                  </a>
                ) : (
                  <>
                    <p className="text-2xl font-black text-foreground">{formatBRL(simulateMonthly(recommended, studentCount).total)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">por mês</p>
                    <Link href="/cadastro">
                      <Button className="mt-2 h-10 rounded-xl px-4 text-xs font-bold gap-2">
                        Começar 7 dias grátis <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 p-4 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            Todos os planos com {nf.format(studentCount)} alunas
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ordered.map((plan) => {
              const sim = simulateMonthly(plan, studentCount);
              const isRecommended = recommended?.id === plan.id && !recommendation.needsCustomQuote;
              const unavailable = sim.exceedsLimit && !sim.isExcessAllowed;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl border p-4 space-y-1.5",
                    isRecommended ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background/60",
                    unavailable && "opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-foreground">{plan.name}</p>
                    {isRecommended && <Badge className="text-[8px] font-black uppercase tracking-widest">Recomendado</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Até {nf.format(plan.maxStudents)} alunas
                    {plan.allowExtraStudents ? ` • +${formatBRL(plan.extraStudentPrice)}/excedente` : " • sem excedentes"}
                  </p>
                  {sim.needsNegotiation ? (
                    <p className="text-sm font-black text-amber-600">Proposta sob medida</p>
                  ) : unavailable ? (
                    <p className="text-sm font-black text-muted-foreground">Não cobre {nf.format(studentCount)} alunas</p>
                  ) : (
                    <>
                      <p className="text-lg font-black text-foreground">
                        {formatBRL(sim.total)}
                        <span className="text-[10px] font-bold text-muted-foreground"> /mês</span>
                      </p>
                      {sim.excessCount > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {formatBRL(sim.basePrice)} + {sim.excessCount} × {formatBRL(plan.extraStudentPrice)}
                        </p>
                      )}
                      <p className="text-[10px] text-emerald-600 font-bold">No anual, 2 meses grátis</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
