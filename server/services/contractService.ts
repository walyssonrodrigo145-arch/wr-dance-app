/**
 * contractService.ts — Orquestração do módulo de contratos digitais.
 *
 * Fluxo: renderiza o PDF do contrato → envia para o provedor (Assinafy)
 * → cria signatário → gera processo de assinatura → persiste contrato + eventos.
 *
 * Multi-tenancy: TODA operação recebe orgId validado pelo chamador.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DEFAULT_TEMPLATE_CONTENT = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS

Pelo presente instrumento particular, de um lado {{school_name}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{school_cnpj}}, com sede em {{school_address}}, doravante denominada CONTRATADA, e de outro lado {{student_name}}, inscrito(a) no CPF sob o nº {{student_cpf}}, residente em {{student_address}}, doravante denominado(a) CONTRATANTE, têm entre si justo e acertado o presente Contrato de Prestação de Serviços Educacionais, que se regerá pelas seguintes cláusulas:

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem como objeto a prestação de serviços educacionais de aulas de {{instrument}}, ministradas pela CONTRATADA ao CONTRATANTE, conforme grade pedagógica da instituição.

CLÁUSULA 2ª — DA MENSAALIDADE
Pela prestação dos serviços, o CONTRATANTE pagará à CONTRATADA o valor mensal de R$ {{monthly_fee}}, com vencimento todo dia {{due_date}} de cada mês.

CLÁUSULA 3ª — DA VIGÊNCIA
O presente contrato terá vigência de {{contract_start_date}} a {{contract_end_date}}.

CLÁUSULA 4ª — DO PAGAMENTO
O pagamento será realizado por meio de boleto, PIX ou cartão de crédito, conforme disponibilizado pela CONTRATADA. O atraso no pagamento sujeitará o CONTRATANTE aos encargos previstos na política financeira da instituição.

CLÁUSULA 5ª — DA RESCISÃO
O CONTRATANTE poderá solicitar a rescisão deste contrato mediante comunicação prévia, respeitando as condições previstas na política interna da CONTRATADA.

CLÁUSULA 6ª — DO FORO
Fica eleito o foro da comarca da CONTRATADA para dirimir quaisquer dúvidas oriundas do presente contrato.

E, por estarem assim justos e contratados, firmam o presente instrumento em via digital, para que produza seus jurídicos e legais efeitos.

{{school_name}}
CNPJ: {{school_cnpj}}
E-mail: {{school_email}} • Telefone: {{school_phone}}

{{student_name}}
CPF: {{student_cpf}}
E-mail: {{student_email}} • Telefone: {{student_phone}}`;

const DEFAULT_MINOR_TEMPLATE_CONTENT = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS
(ALUNO MENOR DE IDADE — REPRESENTADO POR RESPONSÁVEL LEGAL)

Pelo presente instrumento particular, de um lado {{school_name}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{school_cnpj}}, com sede em {{school_address}}, doravante denominada CONTRATADA, e de outro lado:

CONTRATANTE / RESPONSÁVEL LEGAL:
Nome: {{guardian_name}}
CPF: {{guardian_cpf}}
Telefone: {{guardian_phone}} • E-mail: {{guardian_email}}
Endereço: {{guardian_address}}

REPRESENTANDO O(A) ALUNO(A) BENEFICIÁRIO(A):
Nome do(a) Aluno(a): {{student_name}}
Data de Nascimento: {{student_birth_date}} • CPF: {{student_cpf}}

Têm entre si justo e acertado o presente Contrato de Prestação de Serviços Educacionais, que se regerá pelas seguintes cláusulas:

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem como objeto a prestação de serviços educacionais de aulas de {{instrument}}, ministradas pela CONTRATADA ao(à) ALUNO(A) beneficiário(a), devidamente representado(a) pelo(a) CONTRATANTE, conforme grade pedagógica e horários estabelecidos pela instituição.

CLÁUSULA 2ª — DAS OBRIGAÇÕES DO RESPONSÁVEL LEGAL (CONTRATANTE)
O(A) CONTRATANTE, na qualidade de responsável legal pelo(a) menor de idade, assume integral responsabilidade civil e financeira por todas as obrigações decorrentes deste instrumento, comprometendo-se a honrar a pontualidade nos pagamentos, acompanhar a assiduidade escolar e zelar pelo cumprimento das normas da instituição.

CLÁUSULA 3ª — DA MENSALIDADE E FORMA DE PAGAMENTO
Pela prestação dos serviços educacionais, o(a) CONTRATANTE pagará à CONTRATADA o valor mensal de R$ {{monthly_fee}}, com vencimento todo dia {{due_date}} de cada mês.
Parágrafo Único: O pagamento poderá ser realizado por meio de boleto bancário, PIX ou cartão de crédito. O atraso sujeitará o(a) CONTRATANTE aos encargos de mora e multa previstos na política da CONTRATADA.

CLÁUSULA 4ª — DA VIGÊNCIA
O presente contrato terá vigência de {{contract_start_date}} a {{contract_end_date}}.

CLÁUSULA 5ª — DA RESCISÃO
O(A) CONTRATANTE poderá solicitar a rescisão deste contrato mediante comunicação prévia por escrito com antecedência mínima de 30 (trinta) dias, quitando eventuais débitos pendentes até a data do encerramento.

CLÁUSULA 6ª — DO FORO
Fica eleito o foro da comarca da CONTRATADA para dirimir quaisquer dúvidas oriundas do presente contrato.

E, por estarem assim justos e contratados, firmam o presente instrumento em via digital, para que produza seus jurídicos e legais efeitos.

{{school_name}}
CNPJ: {{school_cnpj}}
E-mail: {{school_email}} • Telefone: {{school_phone}}

CONTRATANTE / RESPONSÁVEL LEGAL:
Nome: {{guardian_name}}
CPF: {{guardian_cpf}}
E-mail: {{guardian_email}} • Telefone: {{guardian_phone}}

ALUNO(A) BENEFICIÁRIO(A):
Nome: {{student_name}}`;

export function buildDefaultTemplateContent(): string {
  return DEFAULT_TEMPLATE_CONTENT;
}

export function buildMinorTemplateContent(): string {
  return DEFAULT_MINOR_TEMPLATE_CONTENT;
}

// ─── Renderização do PDF ──────────────────────────────────────────────────────
export async function renderContractPdf(
  templateContent: string,
  variables: Record<string, string>
): Promise<Buffer> {
  let text = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    text = text.split(`{{${key}}}`).join(value ?? "");
  }
  // Remove qualquer variável não preenchida
  text = text.replace(/\{\{[^}]+\}\}/g, "");

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89; // A4
  const margin = 50;
  const maxWidth = PAGE_WIDTH - margin * 2;
  const lineHeight = 15;

  let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - margin;

  const pushLine = (lineText: string, font: any, size: number) => {
    // Se não couber mais nesta página, cria a próxima página e reseta o cursor Y
    if (y < margin + lineHeight) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - margin;
    }
    currentPage.drawText(lineText, {
      x: margin,
      y,
      size,
      font,
      color: rgb(0.12, 0.12, 0.12),
      lineHeight,
    });
    y -= lineHeight;
  };

  const drawParagraph = (paragraph: string, opts: { bold?: boolean; size?: number; gapAfter?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? helveticaBold : helvetica;
    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, size) > maxWidth && currentLine) {
        pushLine(currentLine, font, size);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      pushLine(currentLine, font, size);
    }
    y -= (opts.gapAfter ?? 6);
  };

  const lines = text.split(/\n+/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const trimmed = line.trim();
    const isMainTitle = trimmed === "CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS";
    const isClause = trimmed.startsWith("CLÁUSULA ") || trimmed.startsWith("CONTRATANTE") || trimmed.startsWith("CONTRATADA") || trimmed.startsWith("ALUNO(A)") || trimmed.startsWith("REPRESENTANDO");
    const isSubTitle = trimmed.startsWith("(") && trimmed.endsWith(")");

    if (isMainTitle) {
      drawParagraph(trimmed, { bold: true, size: 13, gapAfter: 4 });
    } else if (isSubTitle) {
      drawParagraph(trimmed, { bold: true, size: 10, gapAfter: 12 });
    } else if (isClause) {
      drawParagraph(trimmed, { bold: true, size: 11, gapAfter: 6 });
    } else {
      drawParagraph(trimmed, { bold: false, size: 10.5, gapAfter: 6 });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Variáveis do contrato ────────────────────────────────────────────────────
export interface ContractVariablesInput {
  schoolName?: string | null;
  schoolCnpj?: string | null;
  schoolAddress?: string | null;
  schoolCity?: string | null;
  schoolPhone?: string | null;
  schoolEmail?: string | null;
  studentName: string;
  studentCpf?: string | null;
  studentRg?: string | null;
  studentBirthDate?: string | null;
  studentEmail?: string | null;
  studentPhone?: string | null;
  studentAddress?: string | null;
  guardianName?: string | null;
  guardianCpf?: string | null;
  guardianRg?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianAddress?: string | null;
  instrument?: string | null;
  monthlyFee?: string | null;
  dueDay?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function buildContractVariables(input: ContractVariablesInput): Record<string, string> {
  const fmtDate = (d?: string | null) => {
    if (!d) return "____/____/________";
    const [y, m, day] = String(d).slice(0, 10).split("-");
    if (!y || !m || !day) return d;
    return `${day}/${m}/${y}`;
  };
  return {
    school_name: input.schoolName || "A escola",
    school_cnpj: input.schoolCnpj || "__________",
    school_address: [input.schoolAddress, input.schoolCity].filter(Boolean).join(", ") || "__________",
    school_phone: input.schoolPhone || "__________",
    school_email: input.schoolEmail || "__________",
    student_name: input.studentName,
    student_cpf: input.studentCpf || "__________",
    student_rg: input.studentRg || "__________",
    student_birth_date: fmtDate(input.studentBirthDate),
    student_email: input.studentEmail || "__________",
    student_phone: input.studentPhone || "__________",
    student_address: input.studentAddress || "__________",
    guardian_name: input.guardianName || input.studentName || "__________",
    guardian_cpf: input.guardianCpf || "__________",
    guardian_rg: input.guardianRg || "__________",
    guardian_phone: input.guardianPhone || input.studentPhone || "__________",
    guardian_email: input.guardianEmail || input.studentEmail || "__________",
    guardian_address: input.guardianAddress || input.studentAddress || "__________",
    instrument: input.instrument || "música",
    monthly_fee: input.monthlyFee || "__________",
    due_date: input.dueDay || "10",
    contract_start_date: fmtDate(input.startDate),
    contract_end_date: fmtDate(input.endDate),
  };
}

// ─── Eventos de contrato (histórico) ──────────────────────────────────────────
export async function addContractEvent(
  db: any,
  contractId: number,
  eventType: string,
  description: string,
  providerEventId?: string | null,
  metadata?: Record<string, unknown> | null
) {
  const { contractEvents } = await import("../../drizzle/schema");
  try {
    await db.insert(contractEvents).values({
      contractId,
      provider: "assinafy",
      providerEventId: providerEventId ?? null,
      eventType,
      description,
      metadata: metadata ?? null,
      createdAt: new Date(),
    }).onConflictDoNothing();
  } catch (e) {
    console.error(`[Contracts] Falha ao registrar evento ${eventType} do contrato ${contractId}:`, e);
  }
}

// ─── Mapeamento de status do provedor → status interno ─────────────────────────
export function mapProviderStatus(status: string): {
  internalStatus: "rascunho" | "enviado" | "assinado" | "cancelado" | "aguardando_assinatura" | "expirado" | "erro";
  signed?: boolean;
} {
  switch (status) {
    case "certificated":
    case "certificating":
      return { internalStatus: "assinado", signed: true };
    case "rejected_by_signer":
    case "rejected_by_user":
      return { internalStatus: "cancelado" };
    case "expired":
      return { internalStatus: "expirado" };
    case "failed":
    case "uploading":
      return { internalStatus: "erro" };
    case "pending_signature":
    case "metadata_ready":
    case "uploaded":
    case "metadata_processing":
      return { internalStatus: "aguardando_assinatura" };
    default:
      return { internalStatus: "aguardando_assinatura" };
  }
}

// ─── Contexto de renderização (compartilhado entre criar, prévia e renovar) ──
// Busca tudo que o PDF precisa (aluno, modelo, dados da escola) e já renderiza.
export interface PreparedContract {
  student: any;
  template: any;
  variables: Record<string, string>;
  pdfBuffer: Buffer;
  title: string;
}

export async function prepareContractRender(
  db: any,
  orgId: number,
  studentId: number,
  templateId: number,
  opts: { startDate?: string | null; endDate?: string | null; monthlyFeeOverride?: string | null }
): Promise<PreparedContract> {
  const { students, instruments, settings: settingsT, organizations: orgs, contractTemplates: templates } =
    await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const [student] = await db.select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
    .limit(1);
  if (!student) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });
  }

  const [template] = await db.select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.organizationId, orgId)))
    .limit(1);
  if (!template) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "NOT_FOUND", message: "Modelo de contrato não encontrado" });
  }

  // ─── FIX: busca TODOS os registros de settings desta org e prioriza o que
  // tem schoolName preenchido (o admin que configurou a escola).
  // O bug anterior era que .limit(1) podia retornar o registro de um professor
  // sem dados da escola, deixando todas as variáveis do contrato como "__________".
  const allOrgSettings = await db
    .select()
    .from(settingsT)
    .where(eq(settingsT.organizationId, orgId))
    .orderBy(settingsT.id); // mais antigo primeiro = geralmente o admin/dono

  // Prioridade: (1) settings com schoolName preenchido, (2) settings mais antigo (admin), (3) null
  const orgSettings =
    allOrgSettings.find((s: any) => s.schoolName && String(s.schoolName).trim() !== "") ??
    allOrgSettings[0] ??
    null;

  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);

  // AUDIT-CONTRACTS FIX: o CNPJ pode ter sido salvo em outra linha de settings
  // (tabela é POR USUÁRIO — userId UNIQUE). Coleta de todas as linhas + espelho
  // da organizations antes de renderizar "__________" no contrato.
  const schoolCnpjResolved =
    [orgSettings?.schoolCnpj, ...allOrgSettings.map((s: any) => s.schoolCnpj), (org as any)?.cnpj]
      .find((c: any) => c && String(c).trim() !== "") || null;

  const [instrument] = student.instrumentId    ? await db.select().from(instruments).where(and(eq(instruments.id, student.instrumentId), eq(instruments.organizationId, orgId))).limit(1)
    : [null];

  const monthlyFee = opts.monthlyFeeOverride ?? (student.monthlyFee as string | null) ?? null;

  // ─── Constrói endereço completo do aluno a partir de múltiplos campos ──────
  const studentAddressParts = [
    student.address,
    student.city,
    student.state,
  ].filter(Boolean);
  const studentAddressFull = studentAddressParts.length > 0
    ? studentAddressParts.join(", ")
    : null;

  // ─── Fallback triplo: orgSettings (admin settings) → org (espelho) → placeholder
  const variables = buildContractVariables({
    schoolName:       orgSettings?.schoolName    || (org as any)?.name     || null,
    schoolCnpj:       schoolCnpjResolved,
    schoolAddress:    orgSettings?.schoolAddress || (org as any)?.address  || null,
    schoolCity:      orgSettings?.schoolCity    || (org as any)?.city     || null,
    schoolPhone:     orgSettings?.schoolPhone   || (org as any)?.phone    || null,
    schoolEmail:     orgSettings?.schoolEmail   || (org as any)?.email    || null,
    studentName:     student.name,
    studentCpf:      student.cpf,
    studentRg:       student.rg,
    studentBirthDate: student.birthDate ? String(student.birthDate) : null,
    studentEmail:    student.email,
    studentPhone:    student.phone,
    studentAddress:  studentAddressFull,
    guardianName:    student.guardianName || null,
    guardianCpf:     (student as any).guardianCpf || null,
    guardianRg:      (student as any).guardianRg || null,
    guardianPhone:   student.guardianPhone || null,
    guardianEmail:   student.guardianEmail || null,
    guardianAddress: (student as any).guardianAddress || studentAddressFull,
    instrument:      instrument?.name,
    monthlyFee,
    dueDay:          student.dueDay ? String(student.dueDay) : "10",
    startDate:       opts.startDate,
    endDate:         opts.endDate,
  });

  const pdfBuffer = await renderContractPdf(template.content || buildDefaultTemplateContent(), variables);
  return {
    student,
    template,
    variables,
    pdfBuffer,
    title: `Contrato - ${student.name}`,
  };
}

// ─── Numeração sequencial por escola (ex: CT-2026-0003) ───────────────────────
export async function getNextContractNumber(db: any, orgId: number): Promise<string> {
  const { sql } = await import("drizzle-orm");
  const { contracts } = await import("../../drizzle/schema");
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(contracts).where(sql`"organizationId" = ${orgId}`);
  const seq = Number(row?.n || 0) + 1;
  const year = new Date().getFullYear();
  return `CT-${year}-${String(seq).padStart(4, "0")}`;
}
