// ─── TeacherPaymentEngine (PRD Regras de Cobrança) ─────────────────────────────
// Motor ÚNICO de remuneração de professores. Usado pela Folha de Pagamento
// (calculateAndSaveProfessorPayment) E pelo Simulador (mesma lógica, zero duplicação).
// Classifica CADA aula pela sua situação (realizada/reposição/experimental/falta/
// cancelamento) e aplica a regra vigente no período + condições + regras por
// instrumento (prioridade: instrumento > geral). Gera memória de cálculo.

export type RuleModel = "por_aula" | "percentual" | "fixo_mensal" | "hibrido";

export interface RuleLike {
  id: number;
  ruleType: RuleModel;
  fixedAmount: string | number;
  amountPerClass: string | number;
  percentage: string | number;
  calculationBase: string; // bruto | recebido | liquido | manual
  manualBaseAmount: string | number;
  startDate: string | Date;
  endDate?: string | Date | null;
  name?: string;
}

export interface ConditionLike {
  conditionType: string;
  enabled: boolean;
  action: string; // remunerar | nao_remunerar | parcial | descontar | exigir_reposicao | valor_diferente | gerar_reposicao
  percentage: string | number;
  fixedAmount: string | number;
  minHours: number | null;
}

export interface CourseRuleLike {
  instrumentId: number;
  ruleType: RuleModel;
  amountPerClass: string | number;
  percentage: string | number;
  fixedAmount: string | number;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}

export interface LessonLike {
  id: number;
  status: string; // agendada|concluida|cancelada|remarcada|falta|a_repor
  lessonType: string; // individual|turma|online
  isExperimental: boolean;
  duration: number;
  scheduledAt: string | Date;
  studentId: number | null;
  title?: string | null;
  instrumentId?: number | null;
  updatedAt?: string | Date | null;
}

export interface TeacherPaymentInput {
  lessons: LessonLike[];
  // monthlyFee por studentId (base bruta) — para percentual bruto
  studentFees: Record<number, number>;
  // soma efetivamente PAGA (com descontos aplicados) por studentId no período
  studentPaid: Record<number, number>;
  now?: Date;
}

export interface PaymentMemory {
  ruleId: number;
  ruleName: string;
  ruleModel: string;
  calculationBase: string;
  valorPorAula: number;
  percentual: number;
  remuneradas: number;
  naoRemuneradas: number;
  classificacao: Record<string, number>;
  subtotal: number;
  baseValor: number;
  adicionais: number;
  descontos: number;
  composition: string[];
  warnings: string[];
  total: number;
}

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

/** A regra está vigente em determinada data? (startDate opcional p/ regras de instrumento) */
export function ruleActiveOn(rule: { startDate?: string | Date | null; endDate?: string | Date | null }, at: Date): boolean {
  const start = rule.startDate ? new Date(rule.startDate).getTime() : -Infinity;
  const end = rule.endDate ? new Date(rule.endDate).getTime() : Infinity;
  const t = at.getTime();
  return t >= start && t <= end;
}

/** Escolhe a regra vigente no mês (a mais recente que cobre o período). */
export function pickRuleForMonth(rules: RuleLike[], month: number, year: number): RuleLike | null {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const candidates = rules.filter((r) => {
    const start = new Date(r.startDate);
    const end = r.endDate ? new Date(r.endDate) : null;
    return start <= monthEnd && (!end || end >= monthStart);
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
}

/** Classifica uma aula conforme status/tipo. Retorna o conditionType correspondente. */
export function classifyLesson(l: LessonLike, now: Date): { type: string; remuneravel: boolean } {
  const title = (l.title || "").toLowerCase();
  if (l.status === "concluida") {
    if (title.includes("reposi") || l.lessonType === "reposicao") return { type: "aula_reposicao", remuneravel: true };
    if (title.includes("gratuita")) return { type: "aula_gratuita", remuneravel: true };
    if (title.includes("avulsa")) return { type: "aula_avulsa", remuneravel: true };
    if (title.includes("extra")) return { type: "aula_extra", remuneravel: true };
    if (l.isExperimental) return { type: "aula_experimental", remuneravel: true };
    return { type: "aula_realizada", remuneravel: true };
  }
  if (l.status === "falta") return { type: "falta_aluno", remuneravel: false };
  if (l.status === "falta_professor") return { type: "falta_professor", remuneravel: false };
  if (l.status === "a_repor") return { type: "agendada", remuneravel: false }; // aula a repor não conta até a reposição ser concluída
  if (l.status === "cancelada") return { type: "cancelamento_aluno", remuneravel: false };
  if (l.status === "agendada" || l.status === "remarcada") return { type: "agendada", remuneravel: false };
  return { type: "aula_realizada", remuneravel: true };
}

/** Condição habilitada (com default sensato para cada tipo). */
function conditionFor(conditions: ConditionLike[], type: string): ConditionLike | null {
  const found = conditions.find((c) => c.conditionType === type);
  if (found) return found.enabled ? found : null;
  // Defaults alinhados ao dialog: aulas regulares/reposição/extra/avulsa entram;
  // experimental/gratuita e faltas/cancelamentos NÃO remuneram por padrão.
  if (type === "aula_realizada" || type === "aula_reposicao" || type === "aula_extra" || type === "aula_avulsa") {
    return { conditionType: type, enabled: true, action: "remunerar", percentage: 0, fixedAmount: 0, minHours: null };
  }
  return { conditionType: type, enabled: true, action: "nao_remunerar", percentage: 0, fixedAmount: 0, minHours: null };
}

/**
 * Motor principal: calcula a remuneração de um professor no período.
 * Retorna memória de cálculo completa (para exibir e auditar).
 */
export function computeTeacherPayment(
  rule: RuleLike,
  conditions: ConditionLike[],
  courseRules: CourseRuleLike[],
  input: TeacherPaymentInput
): PaymentMemory {
  const now = input.now || new Date();
  const warnings: string[] = [];

  // ── 1. Classificação de cada aula ──
  const classificacao: Record<string, number> = {};
  const counted: { lesson: LessonLike; type: string; condition: ConditionLike | null; instrumentRule: CourseRuleLike | null }[] = [];

  for (const lesson of input.lessons) {
    const cls = classifyLesson(lesson, now);
    if (cls.type === "agendada") continue; // futuras/remarcadas não entram
    classificacao[cls.type] = (classificacao[cls.type] || 0) + 1;

    // Regra por instrumento (prioridade: instrumento > geral)
    let instrumentRule: CourseRuleLike | null = null;
    if (lesson.instrumentId) {
      instrumentRule = courseRules.find(
        (cr) => cr.instrumentId === lesson.instrumentId && ruleActiveOn(cr, new Date(lesson.scheduledAt))
      ) || null;
    }
    counted.push({ lesson, type: cls.type, condition: conditionFor(conditions, cls.type), instrumentRule });
  }

  // ── 2. Aplicação das condições → aulas remuneradas/descontos ──
  let remuneradas = 0;
  let naoRemuneradas = 0;
  let unidadesDesconto = 0;
  let adicionalValorDiferente = 0;
  let somaPorAula = 0;
  const valorPorAulaBase = num(rule.amountPerClass);
  const composition: string[] = [];
  const perTypeCount: Record<string, number> = {};
  const perTypeRemun: Record<string, number> = {};

  for (const item of counted) {
    const cond = item.condition;
    const type = item.type;
    let remunera = false;
    let fator = 1;
    let valorEspecial: number | null = null;

    if (!cond) {
      // sem condição → não remunera (falta/cancelamento), remunera (aula)
      remunera = type.startsWith("aula_");
    } else if (cond.action === "remunerar") {
      remunera = true;
    } else if (cond.action === "nao_remunerar") {
      remunera = false;
    } else if (cond.action === "parcial") {
      remunera = true;
      fator = num(cond.percentage) / 100;
    } else if (cond.action === "valor_diferente") {
      remunera = true;
      valorEspecial = num(cond.fixedAmount);
    } else if (cond.action === "descontar") {
      // falta da professora → desconta o valor correspondente
      remunera = false;
      naoRemuneradas += 1;
      // desconto calculado depois com valorPorAula (base geral ou instrumento)
      unidadesDesconto += 1; // marca 1 unidade de desconto
      continue;
    } else if (cond.action === "exigir_reposicao") {
      remunera = false;
    } else if (cond.action === "gerar_reposicao") {
      remunera = false;
    }

    // Cancelamento: antecedência mínima — se cancelou COM antecedência (>= minHours) → não remunera;
    // sem antecedência (menos que minHours) → remunera normalmente (regra do PRD).
    if (type === "cancelamento_aluno" && cond && cond.minHours) {
      // canceledAt = momento da baixa (updatedAt é atualizado no cancelamento);
      // sem canceledAt (ex.: simulador) usa `now` (aula já cancelada no passado → remunera).
      const canceledAt = item.lesson.updatedAt ? new Date(item.lesson.updatedAt) : now;
      const antecHoras = (new Date(item.lesson.scheduledAt).getTime() - canceledAt.getTime()) / 3_600_000;
      remunera = antecHoras < cond.minHours; // < minHours = sem antecedência = remunera
    }

    if (remunera) {
      remuneradas += 1;
      perTypeRemun[type] = (perTypeRemun[type] || 0) + 1;
      // Valor da aula com regra por instrumento (prioridade: instrumento > geral)
      const ir = item.instrumentRule;
      let valorItem = valorPorAulaBase;
      if (ir) {
        if (ir.ruleType === "por_aula") valorItem = num(ir.amountPerClass);
        else if (ir.ruleType === "percentual" || ir.ruleType === "hibrido") {
          const fee = item.lesson.studentId ? (input.studentFees[item.lesson.studentId] || 0) : 0;
          valorItem = (fee * num(ir.percentage)) / 100;
        } else if (ir.ruleType === "fixo_mensal") valorItem = 0;
      }
      if (valorEspecial !== null) {
        adicionalValorDiferente += valorEspecial;
      } else {
        somaPorAula += valorItem * fator;
      }
    } else {
      naoRemuneradas += 1;
    }
    perTypeCount[type] = (perTypeCount[type] || 0) + 1;
  }

  // ── 3. Modelo de remuneração ──
  const ruleModel = rule.ruleType;
  const basePercentual = num(rule.percentage);
  const valorPorAula = valorPorAulaBase;
  let subtotal = 0;
  let baseValor = 0;

  if (ruleModel === "por_aula") {
    subtotal = somaPorAula;
    composition.push(`${remuneradas} aulas remuneradas = R$ ${somaPorAula.toFixed(2)}`);
  } else if (ruleModel === "fixo_mensal") {
    subtotal = num(rule.fixedAmount);
    composition.push(`Valor fixo mensal: R$ ${subtotal.toFixed(2)}`);
  } else if (ruleModel === "percentual") {
    baseValor = computeBase(rule, input, remuneradas);
    subtotal = (baseValor * basePercentual) / 100;
    composition.push(`${basePercentual.toFixed(1)}% sobre base ${baseLabel(rule)} (R$ ${baseValor.toFixed(2)}) = R$ ${subtotal.toFixed(2)}`);
  } else if (ruleModel === "hibrido") {
    const fixo = num(rule.fixedAmount);
    if (num(rule.amountPerClass) > 0) {
      const perAula = somaPorAula;
      subtotal = fixo + perAula;
      composition.push(`Fixo R$ ${fixo.toFixed(2)} + aulas remuneradas (R$ ${perAula.toFixed(2)}) = R$ ${subtotal.toFixed(2)}`);
    } else {
      baseValor = computeBase(rule, input, remuneradas);
      const varial = (baseValor * basePercentual) / 100;
      subtotal = fixo + varial;
      composition.push(`Fixo R$ ${fixo.toFixed(2)} + ${basePercentual.toFixed(1)}% sobre ${baseLabel(rule)} (R$ ${baseValor.toFixed(2)}) = R$ ${subtotal.toFixed(2)}`);
    }
  }

  // Adicionais (aulas com valor diferente — ex: reposição R$ 30 específico)
  const adicionais = adicionalValorDiferente;
  // Descontos (faltas da professora descontadas a valorPorAula)
  const descontos = unidadesDesconto * valorPorAula;

  if (descontos > 0) composition.push(`Descontos: R$ ${descontos.toFixed(2)}`);
  if (adicionais > 0) composition.push(`Adicionais: R$ ${adicionais.toFixed(2)}`);

  if (num(rule.amountPerClass) <= 0 && ruleModel === "por_aula") {
    warnings.push("Valor por aula não configurado — resultando em R$ 0.");
  }

  const total = Math.max(0, Math.round((subtotal + adicionais - descontos) * 100) / 100);

  return {
    ruleId: rule.id,
    ruleName: rule.name || "Regra",
    ruleModel,
    calculationBase: rule.calculationBase,
    valorPorAula,
    percentual: basePercentual,
    remuneradas,
    naoRemuneradas,
    classificacao,
    subtotal: Math.round(subtotal * 100) / 100,
    baseValor,
    adicionais,
    descontos,
    composition,
    warnings,
    total,
  };
}

function computeBase(rule: RuleLike, input: TeacherPaymentInput, remuneradas: number): number {
  if (rule.calculationBase === "manual") return num(rule.manualBaseAmount);
  // Base por alunos com aulas remuneradas: bruto = soma das mensalidades;
  // recebido/liquido = soma efetivamente paga (com descontos) no período.
  const studentIds = Array.from(new Set(
    input.lessons
      .filter((l) => l.status === "concluida")
      .map((l) => l.studentId)
      .filter((id): id is number => id != null)
  ));
  if (rule.calculationBase === "recebido" || rule.calculationBase === "liquido") {
    return studentIds.reduce((sum, id) => sum + (input.studentPaid[id] || 0), 0);
  }
  return studentIds.reduce((sum, id) => sum + (input.studentFees[id] || 0), 0);
}

function baseLabel(rule: RuleLike): string {
  if (rule.calculationBase === "recebido") return "valor efetivamente recebido";
  if (rule.calculationBase === "liquido") return "valor líquido após descontos";
  if (rule.calculationBase === "manual") return "valor definido manualmente";
  return "valor bruto da mensalidade";
}
