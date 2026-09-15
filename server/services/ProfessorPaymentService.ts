// Service de folha de pagamento de professores — PRD Regras de Cobrança
// Núcleo único de cálculo + upsert compartilhado por professorPayments.calculate
// e professorPayments.calculateAll. Agora usa o TeacherPaymentEngine (mesmo
// motor do Simulador). Sem regra configurada: cai no modelo LEGADO (paymentType
// fixo/porcentagem do cadastro) com warning — nunca calcula errado em silêncio.
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { lessons, professorPayments, students, paymentDues, teacherPaymentRules, teacherPaymentRuleConditions, teacherPaymentRuleCourses } from "../../drizzle/schema";
import { computeTeacherPayment, pickRuleForMonth, type RuleLike, type ConditionLike, type CourseRuleLike, type LessonLike } from "./TeacherPaymentEngine";

export interface ProfessorPaymentCalculation {
  paymentId: number;
  professorId: number;
  totalClasses: number;
  totalMinutes: number;
  totalCredits: number;
  totalAmount: number;
  warnings: string[];
}

export async function calculateAndSaveProfessorPayment(
  db: any,
  orgId: number,
  prof: any,
  month: number,
  year: number
): Promise<ProfessorPaymentCalculation> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  // ── 1. Regra vigente no período (PRD Regras de Cobrança) ──
  const ruleRows: any[] = await db
    .select()
    .from(teacherPaymentRules)
    .where(and(
      eq(teacherPaymentRules.organizationId, orgId),
      eq(teacherPaymentRules.teacherId, prof.id),
      eq(teacherPaymentRules.active, true)
    ));
  const rule = pickRuleForMonth(ruleRows as RuleLike[], month, year);
  const warnings: string[] = [];

  if (!rule) {
    // LEGADO: sem regra → comportamento atual (paymentType do cadastro)
    warnings.push("Esta professora ainda não possui uma regra de remuneração configurada. Cálculo feito pelo modelo legado (cadastro).");
    return await legacyCalculation(db, orgId, prof, month, year, startDate, endDate, warnings);
  }

  // Condições + regras por instrumento da versão vigente
  const conditions: ConditionLike[] = await db
    .select()
    .from(teacherPaymentRuleConditions)
    .where(eq(teacherPaymentRuleConditions.ruleId, rule.id));
  const courseRules: CourseRuleLike[] = await db
    .select()
    .from(teacherPaymentRuleCourses)
    .where(eq(teacherPaymentRuleCourses.ruleId, rule.id));

  // ── 2. Alunos da professora + instrumentos + fees + pagamentos reais ──
  const profStudents: any[] = await db.select({
    id: students.id,
    instrumentId: students.instrumentId,
    monthlyFee: students.monthlyFee,
  }).from(students).where(and(eq(students.organizationId, orgId), eq(students.professorId, prof.userId)));
  const professorStudentIds = profStudents.map((s) => s.id);

  const lessonCondition = professorStudentIds.length > 0
    ? or(eq(lessons.userId, prof.userId), inArray(lessons.studentId, professorStudentIds))
    : eq(lessons.userId, prof.userId);

  // TODAS as aulas do período (classificação é feita pelo motor)
  const allLessons: LessonLike[] = await db
    .select({
      id: lessons.id,
      status: lessons.status,
      lessonType: lessons.lessonType,
      isExperimental: lessons.isExperimental,
      duration: lessons.duration,
      scheduledAt: lessons.scheduledAt,
      studentId: lessons.studentId,
      title: lessons.title,
      updatedAt: lessons.updatedAt,
    })
    .from(lessons)
    .where(and(
      eq(lessons.organizationId, orgId),
      lessonCondition,
      gte(lessons.scheduledAt, startDate),
      lt(lessons.scheduledAt, endDate),
    ));

  const studentById = new Map(profStudents.map((s) => [s.id, s]));
  const lessonsWithInstrument = allLessons.map((l) => ({
    ...l,
    instrumentId: l.studentId ? studentById.get(l.studentId)?.instrumentId ?? null : null,
  }));

  const studentFees: Record<number, number> = {};
  const studentPaid: Record<number, number> = {};
  for (const s of profStudents) studentFees[s.id] = Number(s.monthlyFee || 0) || 0;

  if (professorStudentIds.length > 0) {
    const paidRows = await db
      .select({ studentId: paymentDues.studentId, amount: paymentDues.amount })
      .from(paymentDues)
      .where(and(
        eq(paymentDues.organizationId, orgId),
        eq(paymentDues.status, "pago"),
        eq(paymentDues.month, month),
        eq(paymentDues.year, year),
        inArray(paymentDues.studentId, professorStudentIds)
      ));
    for (const p of paidRows) studentPaid[p.studentId] = (studentPaid[p.studentId] || 0) + Number(p.amount || 0);
  }

  // ── 3. Motor de cálculo (mesmo do Simulador) ──
  const memory = computeTeacherPayment(
    rule as RuleLike,
    conditions,
    courseRules,
    { lessons: lessonsWithInstrument, studentFees, studentPaid }
  );
  warnings.push(...memory.warnings);

  const totalMinutes = lessonsWithInstrument
    .filter((l) => l.status === "concluida")
    .reduce((sum, l) => sum + (l.duration || 60), 0);
  const total = memory.total;
  const totalClasses = memory.remuneradas;

  // ── 4. Upsert com snapshot + memória (folhas fechadas NÃO são sobrescritas) ──
  const [existing] = await db
    .select()
    .from(professorPayments)
    .where(and(
      eq(professorPayments.organizationId, orgId),
      eq(professorPayments.professorId, prof.id),
      eq(professorPayments.month, month),
      eq(professorPayments.year, year),
    ))
    .limit(1);

  const snapshot = { rule, conditions, courseRules, engineVersion: "1.0.0" };
  const memoryJson = JSON.stringify(memory);

  let paymentId: number;
  if (existing) {
    // Folha fechada/paga: não recalcular retroativamente
    if (existing.status !== "aberto") {
      return {
        paymentId: existing.id,
        professorId: prof.id,
        totalClasses: Number(existing.totalClasses),
        totalMinutes: Number(existing.totalMinutes),
        totalCredits: Number(existing.totalCredits),
        totalAmount: Number(existing.totalAmount),
        warnings: ["Folha já fechada — cálculo não foi alterado retroativamente."],
      };
    }
    await db.update(professorPayments)
      .set({
        totalClasses,
        totalMinutes,
        totalCredits: total.toFixed(2),
        totalAmount: total.toFixed(2),
        ruleSnapshot: snapshot,
        calculationMemory: memoryJson,
        status: "aberto",
        updatedAt: new Date(),
      })
      .where(eq(professorPayments.id, existing.id));
    paymentId = existing.id;
  } else {
    const [newPayment] = await db.insert(professorPayments).values({
      organizationId: orgId,
      professorId: prof.id,
      month,
      year,
      totalClasses,
      totalMinutes,
      totalCredits: total.toFixed(2),
      totalDebits: "0.00",
      totalAmount: total.toFixed(2),
      status: "aberto",
      ruleSnapshot: snapshot,
      calculationMemory: memoryJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: professorPayments.id });
    paymentId = newPayment.id;
  }

  return { paymentId, professorId: prof.id, totalClasses, totalMinutes, totalCredits: total, totalAmount: total, warnings };
}

/** Fallback legado (professora sem regra) — comportamento original intacto. */
async function legacyCalculation(db: any, orgId: number, prof: any, month: number, year: number, startDate: Date, endDate: Date, warnings: string[]): Promise<ProfessorPaymentCalculation> {
  const profStudents: any[] = await db.select({ id: students.id }).from(students).where(and(
    eq(students.organizationId, orgId),
    eq(students.professorId, prof.userId)
  ));
  const professorStudentIds = profStudents.map((s) => s.id);
  const lessonCondition = professorStudentIds.length > 0
    ? or(eq(lessons.userId, prof.userId), inArray(lessons.studentId, professorStudentIds))
    : eq(lessons.userId, prof.userId);

  const completedLessons: any[] = await db.select({
    id: lessons.id,
    duration: lessons.duration,
    studentId: lessons.studentId,
  }).from(lessons).where(and(
    eq(lessons.organizationId, orgId),
    lessonCondition,
    eq(lessons.status, "concluida"),
    gte(lessons.scheduledAt, startDate),
    lt(lessons.scheduledAt, endDate),
  ));

  const totalClasses = completedLessons.length;
  const totalMinutes = completedLessons.reduce((sum, l) => sum + (l.duration || 60), 0);
  let totalCredits = 0;

  if (prof.paymentType === "fixo") {
    const hourlyRate = parseFloat(prof.hourlyRate || "0");
    totalCredits = (totalMinutes / 60) * hourlyRate;
  } else if (prof.paymentType === "porcentagem") {
    const uniqueStudentIds = Array.from(new Set(completedLessons.map((l) => l.studentId).filter(Boolean))) as number[];
    if (uniqueStudentIds.length > 0) {
      const studentList: any[] = await db.select({ id: students.id, monthlyFee: students.monthlyFee })
        .from(students).where(and(eq(students.organizationId, orgId), inArray(students.id, uniqueStudentIds)));
      const totalFees = studentList.reduce((sum, s) => sum + parseFloat(s.monthlyFee || "0"), 0);
      const percentage = parseFloat(prof.paymentPercentage || "0");
      totalCredits = (totalFees * percentage) / 100;
    }
  }

  const totalAmount = totalCredits;
  const [existing] = await db.select().from(professorPayments).where(and(
    eq(professorPayments.organizationId, orgId),
    eq(professorPayments.professorId, prof.id),
    eq(professorPayments.month, month),
    eq(professorPayments.year, year),
  )).limit(1);

  let paymentId: number;
  if (existing) {
    if (existing.status !== "aberto") {
      return { paymentId: existing.id, professorId: prof.id, totalClasses: Number(existing.totalClasses), totalMinutes: Number(existing.totalMinutes), totalCredits: Number(existing.totalCredits), totalAmount: Number(existing.totalAmount), warnings };
    }
    await db.update(professorPayments).set({
      totalClasses, totalMinutes,
      totalCredits: totalCredits.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      status: "aberto",
      updatedAt: new Date(),
    }).where(eq(professorPayments.id, existing.id));
    paymentId = existing.id;
  } else {
    const [newPayment] = await db.insert(professorPayments).values({
      organizationId: orgId, professorId: prof.id, month, year,
      totalClasses, totalMinutes,
      totalCredits: totalCredits.toFixed(2),
      totalDebits: "0.00",
      totalAmount: totalAmount.toFixed(2),
      status: "aberto",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: professorPayments.id });
    paymentId = newPayment.id;
  }

  return { paymentId, professorId: prof.id, totalClasses, totalMinutes, totalCredits, totalAmount, warnings };
}
