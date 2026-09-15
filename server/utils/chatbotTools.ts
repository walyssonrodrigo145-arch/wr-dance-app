/**
 * FERRAMENTAS DE CONSULTA DA RECEPCIONISTA VIRTUAL
 * (PRD "Evolução do Sistema de Atendimento WhatsApp" — RF-001/RF-002)
 *
 * A IA conversacional do WhatsApp emite blocos ACTION de consulta e o webhook
 * executa estas funções contra dados REAIS do banco, devolvendo o resultado
 * para a IA redigir a resposta final. Proibido inventar valores: tudo que a
 * IA afirma sobre mensalidades/agenda vem exclusivamente daqui.
 */
import { and, eq, gte, ilike } from "drizzle-orm";
import { students, paymentDues, lessons } from "../../drizzle/schema";

export interface ChatbotToolCtx {
  organizationId: number;
  professorUserId: number;
  /** studentId do contato atual (quando o telefone casa com um cadastro) */
  contactStudentId: number | null;
  schoolHours: string;
  lessonDuration: number;
}

export interface ParsedToolAction {
  name: string;
  args: any;
}

const TOOL_NAMES = "LOOKUP_STUDENT|GET_MY_DUES|GET_NEXT_LESSONS|GET_FREE_SLOTS|ESCALATE_HUMAN";

/** Extrai blocos <!--ACTION:NOME ...--> (JSON ou atributos simples tipo reason="..."). */
export function parseToolActions(text: string): ParsedToolAction[] {
  const out: ParsedToolAction[] = [];
  if (!text) return out;
  const regex = new RegExp(`<!--ACTION:(${TOOL_NAMES})\\s*([\\s\\S]*?)-->`, "g");
  let m;
  while ((m = regex.exec(text)) !== null) {
    const raw = (m[2] || "").trim();
    let args: any = {};
    if (!raw) {
      args = {};
    } else if (raw.startsWith("{")) {
      try {
        args = JSON.parse(raw);
      } catch (_) {
        continue; // JSON malformado → ação ignorada com segurança
      }
    } else {
      // Atributos simples: reason="cadastro nao localizado"
      const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
      let kv: RegExpExecArray | null;
      while ((kv = attrRegex.exec(raw)) !== null) {
        args[kv[1]] = kv[2];
      }
    }
    out.push({ name: m[1], args });
  }
  return out;
}

/** Remove todos os comentários técnicos <!-- ... --> do texto visível. */
export function stripToolMarkers(text: string): string {
  return (text || "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

// ─── Agenda: slots disponíveis (movido do webhook — fonte única) ─────────────
export function generateAvailableSlots(schoolHoursStr: string) {
  let schoolHours: any;
  try {
    schoolHours = JSON.parse(schoolHoursStr);
  } catch (e) {
    schoolHours = {
      monday: { active: true, start: "08:00", end: "18:00" },
      tuesday: { active: true, start: "08:00", end: "18:00" },
      wednesday: { active: true, start: "08:00", end: "18:00" },
      thursday: { active: true, start: "08:00", end: "18:00" },
      friday: { active: true, start: "08:00", end: "18:00" },
      saturday: { active: false },
      sunday: { active: false },
    };
  }

  const daysMap: Record<number, string> = {
    0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
    4: "thursday", 5: "friday", 6: "saturday"
  };

  const slots: { label: string; date: Date }[] = [];
  let added = 0;
  let offset = 1;

  while (added < 9 && offset <= 14) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    offset++;

    const dow = d.getDay();
    const dayKey = daysMap[dow];
    const dayConfig = schoolHours[dayKey];

    if (!dayConfig || !dayConfig.active) continue;

    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const diaNome = diasSemana[dow];
    const diaMes = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

    const startHour = parseInt(String(dayConfig.start || "08:00").split(":")[0]);
    const endHour = parseInt(String(dayConfig.end || "18:00").split(":")[0]);

    // Gera horários de hora em hora
    for (let h = startHour; h < endHour; h++) {
      if (added < 20) { // Limit total slots to process
        const slot = new Date(d);
        slot.setHours(h, 0, 0, 0);
        slots.push({ label: `${diaNome} (${diaMes}) às ${String(h).padStart(2, '0')}h00`, date: slot });
        added++;
      }
    }
  }

  return slots;
}

// AUDIT-05 FIX preservado: usa a duração de aula configurada pela escola.
export function isSlotFree(slotDate: Date, ocupadas: any[], schoolDefaultDurationMin: number = 60) {
  const sStart = slotDate.getTime();
  const sEnd = sStart + Math.max(1, schoolDefaultDurationMin) * 60 * 1000;

  return !ocupadas.some((l) => {
    const lStart = l.scheduledAt.getTime();
    const lEnd = lStart + (l.duration || schoolDefaultDurationMin) * 60 * 1000;
    // Sobreposição: Slot inicia antes da aula ocupada terminar E Slot termina depois da aula ocupada iniciar
    return (sStart < lEnd && sEnd > lStart);
  });
}

const fmtBRL = (v: any) => parseFloat(String(v)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDia = (dueDate: string) => new Date(dueDate + "T12:00:00").toLocaleDateString("pt-BR");

/**
 * Valida que o studentId pertence à organização/professor da sessão antes de
 * expor qualquer dado (isolamento entre escolas).
 */
async function resolveStudentId(db: any, ctx: ChatbotToolCtx, args: any): Promise<number | null> {
  const sid = Number(args?.studentId);
  if (!sid || isNaN(sid)) return ctx.contactStudentId;
  const [row] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(
      eq(students.id, sid),
      eq(students.organizationId, ctx.organizationId),
      eq(students.professorId, ctx.professorUserId)
    ))
    .limit(1);
  return row ? row.id : null;
}

/** Executa uma ferramenta de consulta e devolve texto puro (fonte da verdade p/ IA). */
export async function executeChatbotTool(db: any, ctx: ChatbotToolCtx, name: string, args: any): Promise<string> {
  switch (name) {
    case "LOOKUP_STUDENT": {
      const q = String(args?.name || "").trim();
      if (q.length < 3) return "Nenhum resultado: nome muito curto para busca segura.";
      const rows = await db
        .select({ id: students.id, name: students.name })
        .from(students)
        .where(and(eq(students.organizationId, ctx.organizationId), ilike(students.name, `%${q}%`)))
        .limit(3);
      if (!rows.length) return "Nenhum aluno cadastrado encontrado com o nome \"" + q + "\".";
      return "Alunos encontrados:\n" + rows.map((r: any) => `- ID ${r.id} | ${r.name}`).join("\n") + "\nConfirme com a pessoa qual é ela antes de usar o ID.";
    }

    case "GET_MY_DUES": {
      const sid = await resolveStudentId(db, ctx, args);
      if (!sid) return "Este contato não está vinculado a nenhum cadastro de aluno no sistema.";
      const dues = await db
        .select()
        .from(paymentDues)
        .where(and(eq(paymentDues.studentId, sid), eq(paymentDues.status, "pendente")));
      if (!dues.length) return "Este aluno está EM DIA ✅ — nenhuma mensalidade pendente.";
      const total = dues.reduce((acc: number, d: any) => acc + parseFloat(String(d.amount)), 0);
      const lista = dues.slice(0, 5).map((d: any) => `- ${fmtBRL(d.amount)} — vencimento ${fmtDia(d.dueDate)}`).join("\n");
      return `Mensalidades pendentes (${dues.length}), total ${fmtBRL(total)}:\n${lista}`;
    }

    case "GET_NEXT_LESSONS": {
      const sid = await resolveStudentId(db, ctx, args);
      if (!sid) return "Este contato não está vinculado a nenhum cadastro de aluno no sistema.";
      const rows = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.studentId, sid), gte(lessons.scheduledAt, new Date()), eq(lessons.status, "agendada")))
        .orderBy(lessons.scheduledAt)
        .limit(5);
      if (!rows.length) return "Nenhuma aula futura agendada para este aluno.";
      return "Próximas aulas:\n" + rows.map((l: any) => {
        const d = l.scheduledAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const h = l.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        return `- ${d} às ${h} (${l.duration} min)`;
      }).join("\n");
    }

    case "GET_FREE_SLOTS": {
      const slots = generateAvailableSlots(ctx.schoolHours);
      const ocupadas = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.userId, ctx.professorUserId), gte(lessons.scheduledAt, new Date()), eq(lessons.status, "agendada")));
      const free = slots.filter((s) => isSlotFree(s.date, ocupadas, ctx.lessonDuration)).slice(0, 5);
      if (!free.length) return "Nenhum horário livre encontrado nos próximos dias.";
      return "Horários realmente livres na agenda:\n" + free.map((s) => `- ${s.label}`).join("\n");
    }

    default:
      return "Ferramenta desconhecida.";
  }
}
