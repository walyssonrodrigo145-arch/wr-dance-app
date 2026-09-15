import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import {
  Loader2, Save, DollarSign, GraduationCap, CalendarClock, History, FlaskConical,
  Plus, Trash2, AlertTriangle, CheckCircle2, Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const MODELS = [
  { id: "por_aula", label: "💵 Valor fixo por aula", hint: "Ex: R$ 30 por aula" },
  { id: "percentual", label: "📊 Percentual", hint: "Ex: 40% da base" },
  { id: "fixo_mensal", label: "🏦 Valor fixo mensal", hint: "Ex: R$ 2.000/mês" },
  { id: "hibrido", label: "🧩 Modelo híbrido", hint: "Fixo + variável" },
] as const;

const CONDITION_TYPES: { id: string; label: string; group: "aulas" | "faltas" | "cancel" }[] = [
  { id: "aula_realizada", label: "Aula realizada", group: "aulas" },
  { id: "aula_reposicao", label: "Aula de reposição", group: "aulas" },
  { id: "aula_experimental", label: "Aula experimental", group: "aulas" },
  { id: "aula_gratuita", label: "Aula gratuita", group: "aulas" },
  { id: "aula_extra", label: "Aula extra", group: "aulas" },
  { id: "aula_avulsa", label: "Aula avulsa", group: "aulas" },
  { id: "falta_aluno", label: "Falta do aluno", group: "faltas" },
  { id: "falta_professor", label: "Falta da professora", group: "faltas" },
  { id: "cancelamento_aluno", label: "Cancelamento pelo aluno", group: "cancel" },
  { id: "cancelamento_escola", label: "Cancelamento pela escola", group: "cancel" },
];

const ACTIONS_BY_GROUP: Record<string, string[]> = {
  aulas: ["remunerar", "nao_remunerar", "valor_diferente"],
  faltas: ["nao_remunerar", "remunerar", "parcial", "descontar", "exigir_reposicao"],
  cancel: ["nao_remunerar", "remunerar", "parcial", "gerar_reposicao"],
};

const ACTION_LABEL: Record<string, string> = {
  remunerar: "Remunerar normalmente",
  nao_remunerar: "Não remunerar",
  parcial: "Remunerar parcialmente",
  descontar: "Descontar automaticamente",
  exigir_reposicao: "Exigir reposição",
  valor_diferente: "Valor diferente",
  gerar_reposicao: "Gerar reposição",
};

function defaultConditions(): Record<string, any> {
  return {
    aula_realizada: { enabled: true, action: "remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    aula_reposicao: { enabled: true, action: "remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    aula_experimental: { enabled: false, action: "nao_remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    aula_gratuita: { enabled: false, action: "nao_remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    aula_extra: { enabled: true, action: "remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    aula_avulsa: { enabled: true, action: "remunerar", percentage: 0, fixedAmount: 0, minHours: null },
    falta_aluno: { enabled: true, action: "nao_remunerar", percentage: 50, fixedAmount: 0, minHours: null },
    falta_professor: { enabled: true, action: "descontar", percentage: 100, fixedAmount: 0, minHours: null },
    cancelamento_aluno: { enabled: true, action: "nao_remunerar", percentage: 0, fixedAmount: 0, minHours: 24 },
    cancelamento_escola: { enabled: true, action: "nao_remunerar", percentage: 0, fixedAmount: 0, minHours: null },
  };
}

function emptyForm() {
  return {
    name: "Regra de remuneração",
    ruleType: "por_aula" as string,
    fixedAmount: "0",
    amountPerClass: "30",
    percentage: "40",
    calculationBase: "bruto",
    manualBaseAmount: "0",
    closingPeriod: "mensal",
    closingDay: "30",
    paymentDay: "5",
    paymentDaysAfter: "0",
  };
}

export function PaymentRulesDialog({ professor, open, onOpenChange }: { professor: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(emptyForm());
  const [conditions, setConditions] = useState<Record<string, any>>(defaultConditions());
  const [courseRules, setCourseRules] = useState<any[]>([]);
  const [active, setActive] = useState(true);
  const [sim, setSim] = useState({ aulasRealizadas: "30", reposicoes: "2", faltasAluno: "1", faltasProfessora: "0", aulasExperimentais: "1", cancelamentos: "0", valorRecebidoMensalidades: "5000", valorBrutoMensalidades: "5000" });
  const [simResult, setSimResult] = useState<any>(null);

  const { data: rules = [], isLoading } = trpc.teacherPaymentRules.list.useQuery(
    { teacherId: professor.id },
    { enabled: open }
  );
  const { data: defaultRule } = trpc.teacherPaymentRules.getDefault.useQuery(undefined, { enabled: open });
  const { data: instruments = [] } = trpc.teacherPaymentRules.getInstruments.useQuery(undefined, { enabled: open });

  const saveMutation = trpc.teacherPaymentRules.save.useMutation({
    onSuccess: () => {
      toast.success("Regra salva como nova versão!");
      utils.teacherPaymentRules.list.invalidate({ teacherId: professor.id });
      utils.teacherPaymentRules.getDefault.invalidate();
      utils.professores.overview.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar a regra."),
  });
  const toggleMutation = trpc.teacherPaymentRules.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("Regra atualizada.");
      utils.teacherPaymentRules.list.invalidate({ teacherId: professor.id });
    },
    onError: (e) => toast.error(e.message || "Erro ao alterar a regra."),
  });
  const simulateMutation = trpc.teacherPaymentRules.simulate.useMutation({
    onSuccess: (r) => setSimResult(r),
    onError: (e) => toast.error(e.message || "Erro no simulador."),
  });

  // Preenche o form a partir da regra vigente
  const current = rules[0];
  useEffect(() => {
    if (!current) return;
    setForm({
      name: current.name || "Regra de remuneração",
      ruleType: current.ruleType,
      fixedAmount: String(Number(current.fixedAmount || 0)),
      amountPerClass: String(Number(current.amountPerClass || 0)),
      percentage: String(Number(current.percentage || 0)),
      calculationBase: current.calculationBase || "bruto",
      manualBaseAmount: String(Number(current.manualBaseAmount || 0)),
      closingPeriod: current.closingPeriod || "mensal",
      closingDay: String(current.closingDay || 30),
      paymentDay: String(current.paymentDay || 5),
      paymentDaysAfter: String(current.paymentDaysAfter || 0),
    });
    setActive(current.active !== false);
    const conds = defaultConditions();
    for (const c of current.conditions || []) conds[c.conditionType] = { enabled: c.enabled, action: c.action, percentage: Number(c.percentage || 0), fixedAmount: Number(c.fixedAmount || 0), minHours: c.minHours };
    setConditions(conds);
    setCourseRules((current.courses || []).map((c: any) => ({ instrumentId: c.instrumentId, ruleType: c.ruleType, amountPerClass: String(Number(c.amountPerClass || 0)), percentage: String(Number(c.percentage || 0)), fixedAmount: String(Number(c.fixedAmount || 0)) })));
  }, [current]);

  const applyDefault = () => {
    if (!defaultRule) return toast.error("Nenhuma regra padrão configurada na escola.");
    setForm({
      name: defaultRule.name || "Regra padrão",
      ruleType: defaultRule.ruleType,
      fixedAmount: String(Number(defaultRule.fixedAmount || 0)),
      amountPerClass: String(Number(defaultRule.amountPerClass || 0)),
      percentage: String(Number(defaultRule.percentage || 0)),
      calculationBase: defaultRule.calculationBase || "bruto",
      manualBaseAmount: String(Number(defaultRule.manualBaseAmount || 0)),
      closingPeriod: defaultRule.closingPeriod || "mensal",
      closingDay: String(defaultRule.closingDay || 30),
      paymentDay: String(defaultRule.paymentDay || 5),
      paymentDaysAfter: String(defaultRule.paymentDaysAfter || 0),
    });
    const conds = defaultConditions();
    for (const c of defaultRule.conditions || []) conds[c.conditionType] = { enabled: c.enabled, action: c.action, percentage: Number(c.percentage || 0), fixedAmount: Number(c.fixedAmount || 0), minHours: c.minHours };
    setConditions(conds);
    setCourseRules((defaultRule.courses || []).map((c: any) => ({ instrumentId: c.instrumentId, ruleType: c.ruleType, amountPerClass: String(Number(c.amountPerClass || 0)), percentage: String(Number(c.percentage || 0)), fixedAmount: String(Number(c.fixedAmount || 0)) })));
    toast.success("Regra padrão aplicada ao formulário — revise e salve.");
  };

  const handleSave = () => {
    const payload = {
      teacherId: professor.id,
      name: form.name.trim() || "Regra de remuneração",
      ruleType: form.ruleType as any,
      fixedAmount: Number(form.fixedAmount) || 0,
      amountPerClass: Number(form.amountPerClass) || 0,
      percentage: Number(form.percentage) || 0,
      calculationBase: form.calculationBase as any,
      manualBaseAmount: Number(form.manualBaseAmount) || 0,
      closingPeriod: form.closingPeriod as any,
      closingDay: Number(form.closingDay) || 30,
      paymentDay: Number(form.paymentDay) || 5,
      paymentDaysAfter: Number(form.paymentDaysAfter) || 0,
      conditions: CONDITION_TYPES.map((ct) => ({ conditionType: ct.id, ...conditions[ct.id] })).filter((c) => c.enabled),
      courseRules: courseRules.map((cr) => ({
        instrumentId: Number(cr.instrumentId) || 0,
        ruleType: cr.ruleType,
        amountPerClass: Number(cr.amountPerClass) || 0,
        percentage: Number(cr.percentage) || 0,
        fixedAmount: Number(cr.fixedAmount) || 0,
      })),
    };
    saveMutation.mutate(payload);
  };

  const runSimulate = () => {
    simulateMutation.mutate({
      rule: {
        name: form.name,
        ruleType: form.ruleType as any,
        fixedAmount: Number(form.fixedAmount) || 0,
        amountPerClass: Number(form.amountPerClass) || 0,
        percentage: Number(form.percentage) || 0,
        calculationBase: form.calculationBase as any,
        manualBaseAmount: Number(form.manualBaseAmount) || 0,
        closingPeriod: form.closingPeriod as any,
        closingDay: Number(form.closingDay) || 30,
        paymentDay: Number(form.paymentDay) || 5,
        paymentDaysAfter: Number(form.paymentDaysAfter) || 0,
        conditions: CONDITION_TYPES.map((ct) => ({ conditionType: ct.id, ...conditions[ct.id] })).filter((c) => c.enabled),
        courseRules: courseRules.map((cr) => ({
          instrumentId: Number(cr.instrumentId) || 0,
          ruleType: cr.ruleType,
          amountPerClass: Number(cr.amountPerClass) || 0,
          percentage: Number(cr.percentage) || 0,
          fixedAmount: Number(cr.fixedAmount) || 0,
        })),
      },
      aulasRealizadas: Number(sim.aulasRealizadas) || 0,
      reposicoes: Number(sim.reposicoes) || 0,
      faltasAluno: Number(sim.faltasAluno) || 0,
      faltasProfessora: Number(sim.faltasProfessora) || 0,
      aulasExperimentais: Number(sim.aulasExperimentais) || 0,
      cancelamentos: Number(sim.cancelamentos) || 0,
      valorRecebidoMensalidades: Number(sim.valorRecebidoMensalidades) || 0,
      valorBrutoMensalidades: Number(sim.valorBrutoMensalidades) || 0,
    });
  };

  const section = (title: string, icon: any, children: any) => (
    <section className="border-t border-border/50 pt-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
      </div>
      {children}
    </section>
  );

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder = "", type = "text") => (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input type={type} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 rounded-xl" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto no-scrollbar p-0 gap-0 rounded-2xl">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4 rounded-t-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-black">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><DollarSign size={16} /></div>
              Regras de Cobrança — {professor.name}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>
          ) : (
            <>
              {/* Resumo da regra atual */}
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge className={cn("font-black", active ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-500 border-zinc-500/30")}>
                    {active ? "🟢 Regra ativa" : "⚪ Regra inativa"}
                  </Badge>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Regra atual</p>
                    <p className="text-sm font-black">{MODELS.find((m) => m.id === form.ruleType)?.label} · {form.ruleType === "por_aula" ? formatBRL(Number(form.amountPerClass)) : form.ruleType === "percentual" ? `${form.percentage}%` : formatBRL(Number(form.fixedAmount))}</p>
                  </div>
                </div>
                {defaultRule && (
                  <Button variant="outline" size="sm" onClick={applyDefault} className="rounded-xl text-xs">Copiar regra padrão</Button>
                )}
              </div>

              {/* Modelo de remuneração */}
              {section("Modelo de remuneração", <DollarSign size={13} />, (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MODELS.map((m) => (
                    <button key={m.id} type="button" onClick={() => setForm({ ...form, ruleType: m.id })}
                      className={cn("text-left rounded-xl p-3 border transition-all cursor-pointer", form.ruleType === m.id ? "bg-emerald-500/10 border-emerald-500/40" : "bg-muted/20 border-border/40 hover:bg-muted/40")}>
                      <p className="text-xs font-black">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.hint}</p>
                    </button>
                  ))}
                </div>
              ))}

              {/* Valores (condicional ao modelo) */}
              {(form.ruleType === "por_aula" || form.ruleType === "hibrido") && (
                section("Valor por aula", <GraduationCap size={13} />, (
                  <div className="grid grid-cols-2 gap-3">
                    {form.ruleType === "hibrido" && field("Valor fixo mensal", form.fixedAmount, (v) => setForm({ ...form, fixedAmount: v }), "R$ 1.000", "number")}
                    {field("Valor por aula (R$)", form.amountPerClass, (v) => setForm({ ...form, amountPerClass: v }), "R$ 30,00", "number")}
                  </div>
                ))
              )}
              {form.ruleType === "fixo_mensal" && (
                section("Valor fixo mensal", <DollarSign size={13} />, (
                  field("Valor mensal (R$)", form.fixedAmount, (v) => setForm({ ...form, fixedAmount: v }), "R$ 2.000", "number")
                ))
              )}
              {(form.ruleType === "percentual" || form.ruleType === "hibrido") && (
                section("Percentual e base de cálculo", <DollarSign size={13} />, (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {field("Percentual da professora (%)", form.percentage, (v) => setForm({ ...form, percentage: v }), "40", "number")}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Base de cálculo</label>
                      <select value={form.calculationBase} onChange={(e) => setForm({ ...form, calculationBase: e.target.value })}
                        className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20">
                        <option value="bruto">Valor bruto da mensalidade</option>
                        <option value="recebido">Valor efetivamente recebido</option>
                        <option value="liquido">Valor líquido após descontos</option>
                        <option value="manual">Valor definido manualmente</option>
                      </select>
                      {form.calculationBase === "manual" && (
                        <Input type="number" step="0.01" value={form.manualBaseAmount} onChange={(e) => setForm({ ...form, manualBaseAmount: e.target.value })} placeholder="R$ 5.000" className="h-10 rounded-xl mt-1.5" />
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Quais aulas entram no cálculo */}
              {section("Quais aulas entram no cálculo?", <CheckCircle2 size={13} />, (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CONDITION_TYPES.filter((ct) => ct.group === "aulas").map((ct) => {
                    const c = conditions[ct.id];
                    return (
                      <label key={ct.id} className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border cursor-pointer transition-all", c.enabled ? "bg-emerald-500/8 border-emerald-500/25" : "bg-muted/20 border-border/40")}>
                        <span className="text-[11px] font-bold">{ct.label}</span>
                        <Switch checked={c.enabled} onCheckedChange={(v) => setConditions({ ...conditions, [ct.id]: { ...c, enabled: v } })} />
                      </label>
                    );
                  })}
                </div>
              ))}

              {/* Faltas */}
              {section("Faltas", <AlertTriangle size={13} />, (
                <div className="space-y-3">
                  {CONDITION_TYPES.filter((ct) => ct.group === "faltas").map((ct) => {
                    const c = conditions[ct.id];
                    return (
                      <div key={ct.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black">{ct.label}</span>
                          <Switch checked={c.enabled} onCheckedChange={(v) => setConditions({ ...conditions, [ct.id]: { ...c, enabled: v } })} />
                        </div>
                        {c.enabled && (
                          <div className="flex gap-2 flex-wrap">
                            <select value={c.action} onChange={(e) => setConditions({ ...conditions, [ct.id]: { ...c, action: e.target.value } })}
                              className="h-9 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none flex-1 min-w-[160px]">
                              {ACTIONS_BY_GROUP[ct.group].map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                            </select>
                            {c.action === "parcial" && (
                              <div className="flex items-center gap-1.5">
                                <Input type="number" value={String(c.percentage)} onChange={(e) => setConditions({ ...conditions, [ct.id]: { ...c, percentage: Number(e.target.value) } })} className="h-9 w-20 rounded-lg" />
                                <span className="text-[11px] font-bold">%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Cancelamentos */}
              {section("Cancelamentos", <CalendarClock size={13} />, (
                <div className="space-y-3">
                  {CONDITION_TYPES.filter((ct) => ct.group === "cancel").map((ct) => {
                    const c = conditions[ct.id];
                    return (
                      <div key={ct.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black">{ct.label}</span>
                          <Switch checked={c.enabled} onCheckedChange={(v) => setConditions({ ...conditions, [ct.id]: { ...c, enabled: v } })} />
                        </div>
                        {c.enabled && (
                          <div className="flex gap-2 flex-wrap">
                            <select value={c.action} onChange={(e) => setConditions({ ...conditions, [ct.id]: { ...c, action: e.target.value } })}
                              className="h-9 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none flex-1 min-w-[160px]">
                              {ACTIONS_BY_GROUP[ct.group].map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                            </select>
                            {ct.id === "cancelamento_aluno" && (
                              <div className="flex items-center gap-1.5">
                                <Input type="number" value={String(c.minHours ?? 24)} onChange={(e) => setConditions({ ...conditions, [ct.id]: { ...c, minHours: Number(e.target.value) } })} className="h-9 w-20 rounded-lg" />
                                <span className="text-[11px] font-bold">h antecedência</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Regras por instrumento */}
              {section("Regras específicas por instrumento (prioridade: instrumento > regra geral)", <GraduationCap size={13} />, (
                <div className="space-y-2">
                  {courseRules.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma regra específica — usa a regra geral.</p>}
                  {courseRules.map((cr, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end rounded-xl border border-border/40 bg-muted/20 p-2.5">
                      <select value={cr.instrumentId} onChange={(e) => { const copy = [...courseRules]; copy[i] = { ...cr, instrumentId: Number(e.target.value) }; setCourseRules(copy); }}
                        className="h-9 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none col-span-1 sm:col-span-2">
                        {instruments.map((ins: any) => <option key={ins.id} value={ins.id}>{ins.name}</option>)}
                      </select>
                      <select value={cr.ruleType} onChange={(e) => { const copy = [...courseRules]; copy[i] = { ...cr, ruleType: e.target.value }; setCourseRules(copy); }}
                        className="h-9 rounded-lg border border-border/60 bg-background px-2 text-[11px] font-bold outline-none">
                        {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <Input type="number" value={cr.amountPerClass} onChange={(e) => { const copy = [...courseRules]; copy[i] = { ...cr, amountPerClass: e.target.value }; setCourseRules(copy); }} placeholder="R$/aula" className="h-9 rounded-lg" />
                      <div className="flex gap-1.5">
                        <Input type="number" value={cr.percentage} onChange={(e) => { const copy = [...courseRules]; copy[i] = { ...cr, percentage: e.target.value }; setCourseRules(copy); }} placeholder="%" className="h-9 rounded-lg" />
                        <button onClick={() => setCourseRules(courseRules.filter((_, j) => j !== i))} className="h-9 w-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 flex items-center justify-center cursor-pointer"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setCourseRules([...courseRules, { instrumentId: instruments[0]?.id || 0, ruleType: "por_aula", amountPerClass: "30", percentage: "0", fixedAmount: "0" }])} className="rounded-xl text-xs">
                    <Plus size={13} /> Adicionar regra por instrumento
                  </Button>
                </div>
              ))}

              {/* Fechamento */}
              {section("Fechamento e pagamento", <CalendarClock size={13} />, (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Periodicidade</label>
                    <select value={form.closingPeriod} onChange={(e) => setForm({ ...form, closingPeriod: e.target.value })} className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-xs font-bold outline-none">
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </div>
                  {field("Dia de fechamento", form.closingDay, (v) => setForm({ ...form, closingDay: v }), "30", "number")}
                  {field("Dia do pagamento", form.paymentDay, (v) => setForm({ ...form, paymentDay: v }), "05", "number")}
                  {field("Dias após fechamento", form.paymentDaysAfter, (v) => setForm({ ...form, paymentDaysAfter: v }), "0", "number")}
                </div>
              ))}

              {/* Histórico */}
              {section("Histórico de alterações (versões)", <History size={13} />, (
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                  {rules.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma versão registrada.</p>}
                  {rules.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 px-3 py-2">
                      <div>
                        <p className="text-[11px] font-black">{new Date(r.startDate).toLocaleDateString("pt-BR")} — {MODELS.find((m) => m.id === r.ruleType)?.label} {r.ruleType === "por_aula" ? formatBRL(Number(r.amountPerClass)) : r.ruleType === "percentual" ? `${r.percentage}%` : formatBRL(Number(r.fixedAmount))}</p>
                        {r.endDate && <p className="text-[9px] text-muted-foreground">até {new Date(r.endDate).toLocaleDateString("pt-BR")} · {r.active ? "ativa" : "encerrada"}</p>}
                      </div>
                      {!r.endDate && (
                        <Switch checked={r.active !== false} onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, active: v })} />
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Simulador */}
              {section("Simulador (mesmo motor da folha)", <FlaskConical size={13} />, (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ["aulasRealizadas", "Aulas realizadas"],
                      ["reposicoes", "Reposições"],
                      ["faltasAluno", "Faltas do aluno"],
                      ["faltasProfessora", "Faltas da prof."],
                      ["aulasExperimentais", "Aulas experimentais"],
                      ["cancelamentos", "Cancelamentos"],
                    ].map(([key, label]) => field(label as string, (sim as any)[key as string], (v) => setSim({ ...sim, [key as string]: v }), "0", "number"))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {field("Valor recebido das mensalidades (R$)", sim.valorRecebidoMensalidades, (v) => setSim({ ...sim, valorRecebidoMensalidades: v }), "R$ 5.000", "number")}
                    {field("Valor bruto das mensalidades (R$)", sim.valorBrutoMensalidades, (v) => setSim({ ...sim, valorBrutoMensalidades: v }), "R$ 5.000", "number")}
                  </div>
                  <Button onClick={runSimulate} disabled={simulateMutation.isPending} className="rounded-xl text-xs">
                    {simulateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} Simular
                  </Button>
                  {simResult && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1.5">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Resultado estimado</p>
                      {simResult.composition.map((line: string, i: number) => <p key={i} className="text-[11px] font-medium">{line}</p>)}
                      <p className="text-lg font-black font-outfit text-emerald-600 dark:text-emerald-400">TOTAL: {formatBRL(simResult.total)}</p>
                      {simResult.warnings.length > 0 && simResult.warnings.map((w: string, i: number) => <p key={i} className="text-[10px] text-amber-600">{w}</p>)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border px-6 py-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">Fechar</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-xl text-xs">
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar como nova versão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
