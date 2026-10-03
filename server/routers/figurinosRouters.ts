// ─── Figurinos / Vestuário (DancePro) ────────────────────────────────────────
// Acervo de figurinos com controle de empréstimo por aluno/coreografia.
// Disponibilidade = quantidade total − quantidade em uso (não devolvida).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coreografias, costumeLoans, costumeSales, costumes, events, organizations, asaasCustomers, paymentDues, settings, students } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getStoreSalesRules, resolveOrgAsaasApiKey, resolveOrgMpAccessToken } from "./helpers";
import { buildPixPayload } from "../utils/pix";

const COSTUME_TYPES = ["saia", "collant", "sapatilha", "top", "calca", "acessorio", "uniforme", "outro"] as const;
const COSTUME_CONDITIONS = ["novo", "bom", "usado", "danificado"] as const;

// Anti-duplicação de cobrança: cliques concorrentes em "Cobrar" não podem gerar
// duas cobranças no mesmo gateway. Lock em memória por venda+provider (o deploy é
// um único container; multi-instância exigiria Redis — mesma limitação do login).
const saleChargeLocks = new Set<string>();

function assertStaff(ctx: { user: { role: string; openId: string } | null }) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  const role = ctx.user.role;
  const isStaff = role === "admin" || role === "professor" || role === "superadmin" || ctx.user.openId === ENV.ownerOpenId;
  if (!isStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores e professores." });
  }
}

async function resolveStudentId(db: any, ctx: { user: { id: number; studentId?: number | null; organizationId?: number | null } }) {
  if (ctx.user.studentId) return ctx.user.studentId as number;
  const [found] = await db.select({ id: students.id })
    .from(students)
    .where(and(eq(students.studentUserId, ctx.user.id), eq(students.organizationId, ctx.user.organizationId!)))
    .limit(1);
  return found?.id ?? null;
}

/**
 * AUDITORIA Fase 2 — "cobrar junto com a mensalidade": soma o valor da venda na
 * fatura ABERTA do aluno. Prefere o mês atual; se a do mês já estiver paga (ou
 * não existir), usa a do mês seguinte; se nenhuma existir, cria uma.
 * Nunca lança erro (venda não pode falhar por causa disso).
 */
async function addSaleAmountToStudentDue(
  db: any,
  orgId: number,
  studentId: number,
  amount: number,
  label: string,
  actorUserId: number,
): Promise<{ dueId: number; addedAmount: number } | null> {
  try {
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const [student] = await db.select({ dueDay: students.dueDay }).from(students)
      .where(and(eq(students.id, studentId), eq(students.organizationId, orgId))).limit(1);
    if (!student) return null;

    const brNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const candidates: Array<{ month: number; year: number }> = [];
    for (let offset = 0; offset <= 1; offset++) {
      const d = new Date(brNow.getFullYear(), brNow.getMonth() + offset, 1);
      candidates.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    for (const c of candidates) {
      const [existing] = await db.select().from(paymentDues)
        .where(and(
          eq(paymentDues.organizationId, orgId),
          eq(paymentDues.studentId, studentId),
          eq(paymentDues.month, c.month),
          eq(paymentDues.year, c.year),
        )).limit(1);

      if (existing) {
        if (existing.status === "pago") continue; // tenta o próximo mês
        const newAmount = Number(existing.amount) + amount;
        const newOriginal = Number(existing.originalAmount ?? existing.amount) + amount;
        const mergedNotes = [existing.notes, `${label} — R$ ${amount.toFixed(2)}`].filter(Boolean).join(" • ");
        await db.update(paymentDues)
          .set({
            amount: newAmount.toFixed(2),
            originalAmount: newOriginal.toFixed(2),
            notes: mergedNotes,
            updatedAt: new Date(),
          })
          .where(eq(paymentDues.id, existing.id));
        return { dueId: existing.id, addedAmount: amount };
      }
    }

    // Nenhuma fatura aberta nos próximos meses → cria uma no primeiro mês livre.
    const target = candidates[candidates.length - 1];
    const dueDay = Math.min(28, Math.max(1, Number(student.dueDay) || 10));
    const dueDate = new Date(target.year, target.month - 1, dueDay);
    const [created] = await db.insert(paymentDues).values({
      organizationId: orgId,
      userId: actorUserId,
      studentId,
      amount: amount.toFixed(2),
      originalAmount: amount.toFixed(2),
      dueDate,
      status: "pendente",
      month: target.month,
      year: target.year,
      notes: label,
    }).returning({ id: paymentDues.id });
    return created ? { dueId: created.id, addedAmount: amount } : null;
  } catch (error) {
    console.warn("[Loja] Falha ao somar venda na mensalidade:", error);
    return null;
  }
}

/** Configuração de cobrança da Loja (gateways disponíveis + PIX estático). */
async function resolveOrgStorePaymentConfig(db: any, orgId: number) {
  const rows = await db.select({
    paymentGateway: settings.paymentGateway,
    pixKey: settings.pixKey,
    schoolName: settings.schoolName,
    schoolCity: settings.schoolCity,
    infinitepayHandle: settings.infinitepayHandle,
    infinitepayApiKey: settings.infinitepayApiKey,
    mpAccessToken: settings.mpAccessToken,
    asaasEnabled: settings.asaasEnabled,
    asaasApiKey: settings.asaasApiKey,
  }).from(settings).where(eq(settings.organizationId, orgId));
  const [org] = await db.select({ name: organizations.name }).from(organizations)
    .where(eq(organizations.id, orgId)).limit(1);

  const list = rows as any[];
  const firstWith = (predicate: (row: any) => boolean) => list.find(predicate);
  const pixRow = firstWith((row) => row.pixKey && String(row.pixKey).trim() !== "");
  const infiniteRow = firstWith((row) => row.infinitepayHandle && String(row.infinitepayHandle).trim() !== "");
  const gatewayRow = firstWith((row) => row.paymentGateway && String(row.paymentGateway).trim() !== "");

  return {
    hasAsaas: Boolean(firstWith((row) => Number(row.asaasEnabled) === 1 && row.asaasApiKey)),
    hasMp: Boolean(firstWith((row) => row.mpAccessToken && String(row.mpAccessToken).trim() !== "")),
    hasInfinitePay: Boolean(infiniteRow),
    hasPixKey: Boolean(pixRow),
    defaultProvider: (gatewayRow?.paymentGateway as string | undefined) ?? null,
    pixKey: pixRow ? String(pixRow.pixKey).trim() : null,
    merchantName: (pixRow?.schoolName && String(pixRow.schoolName).trim()) || org?.name || "ESCOLA",
    merchantCity: (pixRow?.schoolCity && String(pixRow.schoolCity).trim()) || "CIDADE",
    infinitepayHandle: infiniteRow ? String(infiniteRow.infinitepayHandle).trim() : null,
    infinitepayApiKey: (infiniteRow?.infinitepayApiKey as string | null) ?? null,
  };
}

const costumeInput = z.object({
  name: z.string().min(2, "Informe o nome do figurino").max(255),
  code: z.string().max(60).nullable().optional(),
  type: z.enum(COSTUME_TYPES).default("outro"),
  size: z.string().max(30).nullable().optional(),
  color: z.string().max(60).nullable().optional(),
  quantity: z.number().int().min(1).max(10000).default(1),
  condition: z.enum(COSTUME_CONDITIONS).default("bom"),
  cost: z.number().min(0).max(1000000).default(0),
  salePrice: z.number().min(0).max(1000000).default(0),
  promoPrice: z.number().min(0).max(1000000).nullable().optional(),
  sellable: z.boolean().default(true),
  photoUrl: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const figurinosRouters = {
  figurinos: router({
    list: protectedProcedure.input(z.object({
      search: z.string().max(120).optional(),
      type: z.enum(COSTUME_TYPES).optional(),
      condition: z.enum(COSTUME_CONDITIONS).optional(),
      onlyAvailable: z.boolean().default(false),
      incluirArquivados: z.boolean().default(false),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const rows = await db.select({
        id: costumes.id,
        name: costumes.name,
        code: costumes.code,
        type: costumes.type,
        size: costumes.size,
        color: costumes.color,
        quantity: costumes.quantity,
        condition: costumes.condition,
        cost: costumes.cost,
        salePrice: costumes.salePrice,
        promoPrice: costumes.promoPrice,
        sellable: costumes.sellable,
        photoUrl: costumes.photoUrl,
        notes: costumes.notes,
        active: costumes.active,
        createdAt: costumes.createdAt,
      })
        .from(costumes)
        .where(and(
          eq(costumes.organizationId, orgId),
          input?.incluirArquivados ? undefined : eq(costumes.active, true),
          input?.type ? eq(costumes.type, input.type) : undefined,
          input?.condition ? eq(costumes.condition, input.condition) : undefined,
          input?.search ? or(ilike(costumes.name, `%${input.search}%`), ilike(costumes.code, `%${input.search}%`)) : undefined,
        ))
        .orderBy(asc(costumes.name));

      // AUDITORIA postgres.js: aliases em subqueries escalares (.as()) vinham 0 —
      // empréstimos/vendidos agregados por costumeId (groupBy) e mesclados em JS.
      const costumeIds = rows.map((row) => row.id);
      const loanRows = costumeIds.length > 0 ? await db.select({
        costumeId: costumeLoans.costumeId,
        total: sql<number>`CAST(COALESCE(SUM(${costumeLoans.quantity}), 0) AS INT)`,
      }).from(costumeLoans).where(and(
        inArray(costumeLoans.costumeId, costumeIds),
        isNull(costumeLoans.returnedAt),
      )).groupBy(costumeLoans.costumeId) : [];
      const soldRows = costumeIds.length > 0 ? await db.select({
        costumeId: costumeSales.costumeId,
        total: sql<number>`CAST(COALESCE(SUM(${costumeSales.quantity}), 0) AS INT)`,
      }).from(costumeSales).where(and(
        inArray(costumeSales.costumeId, costumeIds),
        sql`${costumeSales.status} <> 'cancelado'`,
      )).groupBy(costumeSales.costumeId) : [];
      const loanMap = new Map<number, number>(loanRows.map((r: any) => [r.costumeId, Number(r.total) || 0]));
      const soldMap = new Map<number, number>(soldRows.map((r: any) => [r.costumeId, Number(r.total) || 0]));

      return rows
        .map((row) => {
          const emUsoNum = loanMap.get(row.id) ?? 0;
          const vendidosNum = soldMap.get(row.id) ?? 0;
          return {
            ...row,
            emUso: emUsoNum,
            vendidos: vendidosNum,
            disponivel: Math.max(0, row.quantity - emUsoNum),
            disponivelVenda: Math.max(0, row.quantity - vendidosNum),
            cost: Number(row.cost) || 0,
            salePrice: Number(row.salePrice) || 0,
          };
        })
        .filter((row) => !input?.onlyAvailable || row.disponivel > 0);
    }),

    stats: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { pecas: 0, unidades: 0, emUso: 0, atrasados: 0, valorAcervo: 0 };
      const orgId = ctx.user.organizationId!;

      const [pecas] = await db.select({
        count: sql<number>`CAST(COUNT(*) AS INT)`,
        unidades: sql<number>`CAST(COALESCE(SUM(${costumes.quantity}), 0) AS INT)`,
        valor: sql<number>`COALESCE(SUM(${costumes.quantity} * ${costumes.cost}), 0)`,
      }).from(costumes).where(and(eq(costumes.organizationId, orgId), eq(costumes.active, true)));

      const [emUso] = await db.select({ count: sql<number>`CAST(COALESCE(SUM(${costumeLoans.quantity}), 0) AS INT)` })
        .from(costumeLoans)
        .where(and(eq(costumeLoans.organizationId, orgId), isNull(costumeLoans.returnedAt)));

      const [atrasados] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(costumeLoans)
        .where(and(
          eq(costumeLoans.organizationId, orgId),
          isNull(costumeLoans.returnedAt),
          sql`${costumeLoans.dueDate} IS NOT NULL AND ${costumeLoans.dueDate} < CURRENT_DATE`,
        ));

      return {
        pecas: Number(pecas?.count) || 0,
        unidades: Number(pecas?.unidades) || 0,
        emUso: Number(emUso?.count) || 0,
        atrasados: Number(atrasados?.count) || 0,
        valorAcervo: Number(pecas?.valor) || 0,
      };
    }),

    create: protectedProcedure.input(costumeInput).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [created] = await db.insert(costumes).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        name: input.name.trim(),
        code: input.code?.trim() || null,
        type: input.type,
        size: input.size?.trim() || null,
        color: input.color?.trim() || null,
        quantity: input.quantity,
        condition: input.condition,
        cost: input.cost.toFixed(2),
        salePrice: input.salePrice.toFixed(2),
        promoPrice: input.promoPrice != null && input.promoPrice > 0 ? input.promoPrice.toFixed(2) : null,
        sellable: input.sellable,
        photoUrl: input.photoUrl?.trim() || null,
        notes: input.notes?.trim() || null,
      }).returning({ id: costumes.id });

      return { success: true, id: created.id };
    }),

    update: protectedProcedure.input(z.object({ id: z.number() }).extend(costumeInput.shape)).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: costumes.id }).from(costumes)
        .where(and(eq(costumes.id, input.id), eq(costumes.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Figurino não encontrado." });

      const [uso] = await db.select({ count: sql<number>`CAST(COALESCE(SUM(${costumeLoans.quantity}), 0) AS INT)` })
        .from(costumeLoans)
        .where(and(eq(costumeLoans.costumeId, input.id), isNull(costumeLoans.returnedAt)));
      if (Number(uso?.count) > input.quantity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Existem ${uso.count} unidade(s) em uso — a quantidade total não pode ficar abaixo disso.`,
        });
      }

      await db.update(costumes).set({
        name: input.name.trim(),
        code: input.code?.trim() || null,
        type: input.type,
        size: input.size?.trim() || null,
        color: input.color?.trim() || null,
        quantity: input.quantity,
        condition: input.condition,
        cost: input.cost.toFixed(2),
        salePrice: input.salePrice.toFixed(2),
        promoPrice: input.promoPrice != null && input.promoPrice > 0 ? input.promoPrice.toFixed(2) : null,
        sellable: input.sellable,
        photoUrl: input.photoUrl?.trim() || null,
        notes: input.notes?.trim() || null,
        updatedAt: new Date(),
      }).where(eq(costumes.id, input.id));

      return { success: true };
    }),

    /** Exclui peças sem empréstimos; com histórico, arquiva (active=false). */
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [existing] = await db.select({ id: costumes.id }).from(costumes)
        .where(and(eq(costumes.id, input.id), eq(costumes.organizationId, orgId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Figurino não encontrado." });

      const [emUso] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(costumeLoans)
        .where(and(eq(costumeLoans.costumeId, input.id), isNull(costumeLoans.returnedAt)));
      if (Number(emUso?.count) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este figurino possui unidades em uso. Devolva antes de excluir." });
      }

      const [historico] = await db.select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
        .from(costumeLoans).where(eq(costumeLoans.costumeId, input.id));

      if (Number(historico?.count) > 0) {
        await db.update(costumes).set({ active: false, updatedAt: new Date() }).where(eq(costumes.id, input.id));
        return { success: true, archived: true, message: "Figurino com histórico de empréstimos — arquivado." };
      }

      await db.delete(costumes).where(eq(costumes.id, input.id));
      return { success: true, archived: false };
    }),

    /** Registra a saída de um figurino (baixa na disponibilidade). */
    checkout: protectedProcedure.input(z.object({
      costumeId: z.number(),
      studentId: z.number(),
      quantity: z.number().int().min(1).max(1000).default(1),
      dueDate: z.coerce.date().nullable().optional(),
      coreografiaId: z.number().nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [costume] = await db.select({ id: costumes.id, quantity: costumes.quantity, name: costumes.name }).from(costumes)
        .where(and(eq(costumes.id, input.costumeId), eq(costumes.organizationId, orgId), eq(costumes.active, true))).limit(1);
      if (!costume) throw new TRPCError({ code: "NOT_FOUND", message: "Figurino não encontrado." });

      const [student] = await db.select({ id: students.id }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });

      if (input.coreografiaId != null) {
        const [coreografia] = await db.select({ id: coreografias.id }).from(coreografias)
          .where(and(eq(coreografias.id, input.coreografiaId), eq(coreografias.organizationId, orgId)))
          .limit(1);
        if (!coreografia) throw new TRPCError({ code: "NOT_FOUND", message: "Coreografia não encontrada nesta escola." });
      }

      const [emUso] = await db.select({ count: sql<number>`CAST(COALESCE(SUM(${costumeLoans.quantity}), 0) AS INT)` })
        .from(costumeLoans)
        .where(and(eq(costumeLoans.costumeId, input.costumeId), isNull(costumeLoans.returnedAt)));

      const disponivel = costume.quantity - (Number(emUso?.count) || 0);
      if (input.quantity > disponivel) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: disponivel === 0
            ? `"${costume.name}" está totalmente emprestado no momento.`
            : `Só há ${disponivel} unidade(s) disponível(is) de "${costume.name}".`,
        });
      }

      const [created] = await db.insert(costumeLoans).values({
        organizationId: orgId,
        createdByUserId: ctx.user.id,
        costumeId: input.costumeId,
        studentId: input.studentId,
        coreografiaId: input.coreografiaId ?? null,
        quantity: input.quantity,
        dueDate: input.dueDate ? input.dueDate.toISOString().slice(0, 10) : null,
        notes: input.notes?.trim() || null,
      }).returning({ id: costumeLoans.id });

      return { success: true, id: created.id };
    }),

    /** Registra a devolução. */
    checkin: protectedProcedure.input(z.object({
      loanId: z.number(),
      conditionOnReturn: z.enum(COSTUME_CONDITIONS).optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [loan] = await db.select({ id: costumeLoans.id, returnedAt: costumeLoans.returnedAt }).from(costumeLoans)
        .where(and(eq(costumeLoans.id, input.loanId), eq(costumeLoans.organizationId, orgId))).limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Empréstimo não encontrado." });
      if (loan.returnedAt) throw new TRPCError({ code: "CONFLICT", message: "Este empréstimo já foi devolvido." });

      await db.update(costumeLoans).set({
        returnedAt: new Date(),
        conditionOnReturn: input.conditionOnReturn ?? null,
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(eq(costumeLoans.id, input.loanId));

      return { success: true };
    }),

    /** Lista empréstimos (em uso, atrasados ou histórico). */
    loans: protectedProcedure.input(z.object({
      status: z.enum(["todos", "em_uso", "atrasado", "devolvido"]).default("em_uso"),
      search: z.string().max(120).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;
      const status = input?.status ?? "em_uso";

      const rows = await db.select({
        id: costumeLoans.id,
        costumeId: costumeLoans.costumeId,
        costumeName: costumes.name,
        costumeType: costumes.type,
        costumeSize: costumes.size,
        studentId: costumeLoans.studentId,
        studentName: students.name,
        quantity: costumeLoans.quantity,
        checkedOutAt: costumeLoans.checkedOutAt,
        dueDate: costumeLoans.dueDate,
        returnedAt: costumeLoans.returnedAt,
        conditionOnReturn: costumeLoans.conditionOnReturn,
        notes: costumeLoans.notes,
        coreografiaId: costumeLoans.coreografiaId,
        coreografiaTitle: coreografias.title,
      })
        .from(costumeLoans)
        .innerJoin(costumes, eq(costumes.id, costumeLoans.costumeId))
        .innerJoin(students, eq(students.id, costumeLoans.studentId))
        .leftJoin(coreografias, eq(coreografias.id, costumeLoans.coreografiaId))
        .where(and(eq(costumeLoans.organizationId, orgId)))
        .orderBy(desc(costumeLoans.checkedOutAt));

      return rows
        .map((row) => {
          const atrasado = !row.returnedAt && row.dueDate ? new Date(row.dueDate).getTime() < Date.now() : false;
          return {
            ...row,
            situacao: row.returnedAt ? "devolvido" : atrasado ? "atrasado" : "em_uso",
          };
        })
        .filter((row) => status === "todos" || row.situacao === status)
        .filter((row) => {
          if (!input?.search) return true;
          const term = input.search.toLowerCase();
          return row.costumeName.toLowerCase().includes(term) || row.studentName.toLowerCase().includes(term);
        });
    }),

    searchAlunos: protectedProcedure.input(z.object({ q: z.string().max(120) })).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      if (!input.q.trim()) return [];
      const orgId = ctx.user.organizationId!;
      const term = `%${input.q.trim().toLowerCase()}%`;
      return db.select({ id: students.id, name: students.name, level: students.level })
        .from(students)
        .where(and(
          eq(students.organizationId, orgId),
          eq(students.status, "ativo"),
          sql`(LOWER(${students.name}) LIKE ${term} OR LOWER(COALESCE(${students.email}, '')) LIKE ${term})`,
        ))
        .limit(10);
    }),

    coreografiasAtivas: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: coreografias.id, title: coreografias.title })
        .from(coreografias)
        .where(and(
          eq(coreografias.organizationId, ctx.user.organizationId!),
          eq(coreografias.active, true),
          sql`${coreografias.status} <> 'arquivada'`,
        ))
        .orderBy(asc(coreografias.title));
    }),

    /** Catálogo de venda (Loja / Loja do evento): produtos vendáveis com estoque. */
    storeCatalog: protectedProcedure.input(z.object({ eventId: z.number().optional() }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      if (input?.eventId) {
        const [event] = await db.select({ id: events.id }).from(events)
          .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
      }

      const allSoldRows = await db.select({
        costumeId: costumeSales.costumeId,
        total: sql<number>`CAST(COALESCE(SUM(${costumeSales.quantity}), 0) AS INT)`,
      }).from(costumeSales).where(and(
        eq(costumeSales.organizationId, orgId),
        sql`${costumeSales.status} <> 'cancelado'`,
      )).groupBy(costumeSales.costumeId);
      const eventSoldRows = input?.eventId ? await db.select({
        costumeId: costumeSales.costumeId,
        total: sql<number>`CAST(COALESCE(SUM(${costumeSales.quantity}), 0) AS INT)`,
      }).from(costumeSales).where(and(
        eq(costumeSales.eventId, input.eventId),
        sql`${costumeSales.status} <> 'cancelado'`,
      )).groupBy(costumeSales.costumeId) : [];
      const allSoldMap = new Map<number, number>(allSoldRows.map((r: any) => [r.costumeId, Number(r.total) || 0]));
      const eventSoldMap = new Map<number, number>(eventSoldRows.map((r: any) => [r.costumeId, Number(r.total) || 0]));

      const rows = await db.select({
        id: costumes.id,
        name: costumes.name,
        type: costumes.type,
        size: costumes.size,
        color: costumes.color,
        photoUrl: costumes.photoUrl,
        quantity: costumes.quantity,
        salePrice: costumes.salePrice,
        promoPrice: costumes.promoPrice,
      })
        .from(costumes)
        .where(and(
          eq(costumes.organizationId, orgId),
          eq(costumes.active, true),
          eq(costumes.sellable, true),
        ))
        .orderBy(asc(costumes.name));

      return rows.map((row) => {
        const vendidosNum = allSoldMap.get(row.id) ?? 0;
        return {
          ...row,
          salePrice: Number(row.salePrice) || 0,
          promoPrice: row.promoPrice != null && Number(row.promoPrice) > 0 ? Number(row.promoPrice) : null,
          vendidos: allSoldMap.get(row.id) ?? 0,
          vendidosEvento: eventSoldMap.get(row.id) ?? 0,
          disponivelVenda: Math.max(0, row.quantity - (allSoldMap.get(row.id) ?? 0)),
        };
      });
    }),

    /** Registra a venda de figurino (Loja do evento ou avulsa). Preço SEMPRE do servidor. */
    sell: protectedProcedure.input(z.object({
      costumeId: z.number(),
      studentId: z.number(),
      eventId: z.number().nullable().optional(),
      quantity: z.number().int().min(1).max(1000).default(1),
      paymentMode: z.enum(["mensalidade", "avulso"]).default("mensalidade"),
      discountPercent: z.number().min(0).max(100).default(0),
      notes: z.string().max(2000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      // Regras de venda da escola (Configurações → Loja) — validadas no servidor
      const rules = await getStoreSalesRules(db, orgId);
      const isEventSale = input.eventId != null;
      if (isEventSale && !rules.enableEventSales) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "As vendas dentro de eventos estão desativadas nas regras da Loja." });
      }
      if (!isEventSale && !rules.enableStoreSales) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "As vendas da Loja estão desativadas nas regras da escola." });
      }
      if (input.paymentMode === "mensalidade" && !rules.allowMonthlyPayment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pagamento junto com a mensalidade está desativado nas regras da Loja." });
      }
      if (input.paymentMode === "avulso" && !rules.allowStandalonePayment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cobrança avulsa está desativada nas regras da Loja." });
      }

      const [costume] = await db.select({
        id: costumes.id,
        name: costumes.name,
        quantity: costumes.quantity,
        salePrice: costumes.salePrice,
        promoPrice: costumes.promoPrice,
        sellable: costumes.sellable,
      }).from(costumes)
        .where(and(eq(costumes.id, input.costumeId), eq(costumes.organizationId, orgId), eq(costumes.active, true))).limit(1);
      if (!costume) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado na Loja." });
      if (!costume.sellable) throw new TRPCError({ code: "BAD_REQUEST", message: "Este produto não está disponível para venda." });

      const [student] = await db.select({ id: students.id, status: students.status }).from(students)
        .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId))).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado nesta escola." });
      if (rules.requireActiveStudent && student.status !== "ativo") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aluno não está ativo — venda bloqueada pelas regras da Loja." });
      }

      if (input.eventId != null) {
        const [event] = await db.select({ id: events.id, status: events.status }).from(events)
          .where(and(eq(events.id, input.eventId), eq(events.organizationId, orgId))).limit(1);
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Evento não encontrado." });
        // AUDITORIA: não vender figurino de evento cancelado.
        if (event.status === "cancelado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este evento foi cancelado — a venda de figurinos está bloqueada." });
        }
      }

      const [vendidos] = await db.select({ count: sql<number>`CAST(COALESCE(SUM(${costumeSales.quantity}), 0) AS INT)` })
        .from(costumeSales)
        .where(and(eq(costumeSales.costumeId, input.costumeId), sql`${costumeSales.status} <> 'cancelado'`));
      const disponivel = costume.quantity - (Number(vendidos?.count) || 0);

      // Desconto (regra da Loja)
      const discountPercent = Math.max(0, Math.min(100, Number(input.discountPercent) || 0));
      if (discountPercent > 0 && !rules.allowDiscount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Desconto não permitido nas regras da Loja." });
      }
      if (discountPercent > rules.maxDiscountPercent) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Desconto máximo permitido: ${rules.maxDiscountPercent}%.` });
      }

      // Estoque: sem disponibilidade só vende com "sob encomenda" habilitado
      let madeToOrder = false;
      if (input.quantity > disponivel) {
        if (!rules.allowMadeToOrder) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: disponivel === 0
              ? `"${costume.name}" está esgotado para venda.`
              : `Só há ${disponivel} unidade(s) de "${costume.name}" disponível(is) para venda.`,
          });
        }
        madeToOrder = true;
      }

      let saleRow: any = null;
      // Loja: preço promocional (promoPrice) é o praticado quando definido
      const basePrice = Number((costume as any).promoPrice ?? costume.salePrice) || 0;
      const unitPrice = Number((basePrice * (1 - discountPercent / 100)).toFixed(2));
      const totalPrice = Number((unitPrice * input.quantity).toFixed(2));

      await db.insert(costumeSales).values({
        organizationId: orgId,
        costumeId: input.costumeId,
        studentId: input.studentId,
        eventId: input.eventId ?? null,
        quantity: input.quantity,
        unitPrice: unitPrice.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        paymentMode: input.paymentMode,
        discountPercent: discountPercent.toFixed(2),
        madeToOrder,
        status: "pendente",
        notes: input.notes?.trim() || null,
        createdByUserId: ctx.user.id,
      }).returning({ id: costumeSales.id }).then(async (r: any) => {
        // Código do pedido determinístico (ex.: VDA-2023) — id serial garante unicidade
        saleRow = r?.[0] ?? null;
        if (saleRow?.id) {
          await db.update(costumeSales).set({ orderCode: `VDA-${1000 + saleRow.id}` }).where(eq(costumeSales.id, saleRow.id));
        }
        return r;
      });

      // AUDITORIA Fase 2: modo "junto com a mensalidade" soma o valor na fatura
      // aberta do aluno (antes a venda não entrava em nenhuma cobrança).
      let addedToDue: { dueId: number; addedAmount: number } | null = null;
      if (input.paymentMode === "mensalidade") {
        addedToDue = await addSaleAmountToStudentDue(db, orgId, input.studentId, totalPrice, `Loja: ${costume.name} (x${input.quantity})`, ctx.user.id);
      }

      return { success: true, unitPrice, totalPrice, quantity: input.quantity, madeToOrder, addedToDue, orderCode: saleRow?.id ? `VDA-${1000 + saleRow.id}` : null };
    }),

    /** Gateways disponíveis para cobrar uma venda da Loja. */
    salePaymentOptions: protectedProcedure.query(async ({ ctx }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return { asaas: false, mercadopago: false, infinitepay: false, pixKey: false, defaultProvider: null as string | null };
      const config = await resolveOrgStorePaymentConfig(db, ctx.user.organizationId!);
      return {
        asaas: config.hasAsaas,
        mercadopago: config.hasMp,
        infinitepay: config.hasInfinitePay,
        pixKey: config.hasPixKey,
        defaultProvider: config.defaultProvider,
      };
    }),

    /**
     * Gera a cobrança de uma venda da Loja (PIX copia-e-cola ou link de checkout).
     * - Asaas → PIX com conciliação automática pelo webhook
     * - Mercado Pago → PIX (payload + QR) com conciliação pelo webhook
     * - InfinitePay → link de checkout (PIX/cartão) com conciliação pelo webhook
     * - pixkey → PIX estático da escola (baixa manual)
     */
    saleCharge: protectedProcedure.input(z.object({
      id: z.number(),
      provider: z.enum(["asaas", "mercadopago", "infinitepay", "pixkey"]),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [sale] = await db.select().from(costumeSales)
        .where(and(eq(costumeSales.id, input.id), eq(costumeSales.organizationId, orgId))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
      if (sale.status === "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta venda já está paga." });
      if (sale.status === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta venda está cancelada." });

      const [student] = await db.select({ id: students.id, name: students.name, email: students.email, phone: students.phone, cpf: students.cpf })
        .from(students).where(eq(students.id, sale.studentId)).limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado." });

      const amount = Number(sale.totalPrice) || 0;
      if (amount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Venda sem valor para cobrar." });
      const description = `Loja #${sale.id} — ${student.name}`;
      const appUrl = ENV.appUrl || "https://wrmusicpro.com.br";

      // Lock anti-cobrança-duplicada (cliques simultâneos)
      const chargeLockKey = `${sale.id}:${input.provider}`;
      if (saleChargeLocks.has(chargeLockKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cobrança já está sendo gerada. Aguarde alguns segundos e tente novamente." });
      }
      saleChargeLocks.add(chargeLockKey);

      try {

      // ── Asaas: PIX com conciliação automática ──
      if (input.provider === "asaas") {
        const apiKey = await resolveOrgAsaasApiKey(db, orgId);
        if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Asaas não está configurado nesta escola (Configurações → Integrações)." });
        const { createAsaasCustomer, createAsaasCharge, getAsaasPixQrCode } = await import("../utils/asaas");

        let paymentId = sale.paymentProvider === "asaas" ? (sale.externalPaymentId as string | null) : null;
        let invoiceUrl = sale.paymentProvider === "asaas" ? (sale.paymentLink as string | null) : null;

        if (!paymentId) {
          let asaasCustomerId: string;
          const [existingCustomer] = await db.select().from(asaasCustomers)
            .where(and(eq(asaasCustomers.studentId, student.id), eq(asaasCustomers.organizationId, orgId))).limit(1);
          if (existingCustomer) {
            asaasCustomerId = existingCustomer.asaasCustomerId;
          } else {
            asaasCustomerId = await createAsaasCustomer({
              name: student.name,
              email: student.email ?? undefined,
              phone: student.phone ?? undefined,
              cpfCnpj: student.cpf ?? undefined,
            }, apiKey);
            await db.insert(asaasCustomers).values({ organizationId: orgId, studentId: student.id, asaasCustomerId });
          }

          const charge = await createAsaasCharge({
            asaasCustomerId,
            billingType: "PIX",
            value: amount,
            dueDate: new Date().toISOString().slice(0, 10),
            description,
            externalReference: `costume_sale:${sale.id}`,
          }, apiKey);
          paymentId = charge.id;
          invoiceUrl = charge.invoiceUrl ?? null;
          await db.update(costumeSales).set({
            paymentProvider: "asaas",
            externalPaymentId: paymentId,
            paymentLink: invoiceUrl,
            pixPayload: null,
            updatedAt: new Date(),
          }).where(eq(costumeSales.id, sale.id));
        }

        const qr = await getAsaasPixQrCode(paymentId!, apiKey);
        await db.update(costumeSales).set({ pixPayload: qr.payload, updatedAt: new Date() }).where(eq(costumeSales.id, sale.id));
        return { provider: "asaas" as const, pixPayload: qr.payload, encodedImage: qr.encodedImage, paymentLink: invoiceUrl };
      }

      // ── Mercado Pago: PIX (copia-e-cola) com conciliação automática ──
      if (input.provider === "mercadopago") {
        const token = await resolveOrgMpAccessToken(db, orgId);
        if (!token) throw new TRPCError({ code: "BAD_REQUEST", message: "Mercado Pago não está configurado nesta escola (Configurações → Integrações)." });
        const { createMPPixPayment } = await import("../utils/mercadopago");
        const payerEmail = student.email && student.email.includes("@") ? student.email : "pagador@mercadopago.com";
        const mp = await createMPPixPayment({
          transactionAmount: amount,
          description,
          payerEmail,
          externalReference: `sale_${sale.id}`,
          notificationUrl: `${appUrl}/api/webhooks/mercadopago/student?dueId=sale_${sale.id}`,
        }, token);
        await db.update(costumeSales).set({
          paymentProvider: "mercadopago",
          externalPaymentId: mp.paymentId,
          paymentLink: mp.ticketUrl,
          pixPayload: mp.qrCode,
          updatedAt: new Date(),
        }).where(eq(costumeSales.id, sale.id));
        return { provider: "mercadopago" as const, pixPayload: mp.qrCode, encodedImage: mp.qrCodeBase64, paymentLink: mp.ticketUrl };
      }

      // ── InfinitePay: link de checkout (PIX/cartão) com conciliação automática ──
      if (input.provider === "infinitepay") {
        const config = await resolveOrgStorePaymentConfig(db, orgId);
        if (!config.infinitepayHandle) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "InfinitePay não está configurada nesta escola (InfiniteTag em Configurações → Integrações)." });
        }
        const { createInfinitePayLink, buildInfinitePaySaleWebhookUrl, brlToCents, resolveInfinitePayApiKey } = await import("../utils/infinitepay");
        const link = await createInfinitePayLink({
          handle: config.infinitepayHandle,
          orderNsu: `sale_${sale.id}`,
          items: [{ description, quantity: 1, price: brlToCents(amount.toFixed(2)) }],
          redirectUrl: `${appUrl}/alunos`,
          webhookUrl: buildInfinitePaySaleWebhookUrl(sale.id),
          apiKey: resolveInfinitePayApiKey(config.infinitepayApiKey),
        });
        await db.update(costumeSales).set({
          paymentProvider: "infinitepay",
          externalPaymentId: link.slug,
          paymentLink: link.url,
          pixPayload: null,
          updatedAt: new Date(),
        }).where(eq(costumeSales.id, sale.id));
        return { provider: "infinitepay" as const, pixPayload: null, encodedImage: null, paymentLink: link.url };
      }

      // ── Chave PIX da escola (estático, baixa manual) ──
      const config = await resolveOrgStorePaymentConfig(db, orgId);
      if (!config.pixKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma forma de pagamento configurada: conecte Asaas/Mercado Pago/InfinitePay ou cadastre uma chave PIX." });
      }
      const payload = buildPixPayload({
        pixKey: config.pixKey,
        amount,
        merchantName: config.merchantName,
        merchantCity: config.merchantCity,
        txid: `VENDA${sale.id}${Date.now().toString().slice(-4)}`,
      });
      if (!payload) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível gerar o PIX desta venda (valor inválido)." });
      await db.update(costumeSales).set({
        paymentProvider: "pixkey",
        externalPaymentId: null,
        paymentLink: null,
        pixPayload: payload,
        updatedAt: new Date(),
      }).where(eq(costumeSales.id, sale.id));
      return { provider: "pixkey" as const, pixPayload: payload, encodedImage: null, paymentLink: null };
      } finally {
        saleChargeLocks.delete(chargeLockKey);
      }
    }),

    /** Vendas registradas (filtro por evento e status). */
    sales: protectedProcedure.input(z.object({
      eventId: z.number().optional(),
      status: z.enum(["todos", "pendente", "em_separacao", "pago", "entregue", "cancelado"]).default("todos"),
      search: z.string().max(120).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) return [];
      const orgId = ctx.user.organizationId!;

      const rows = await db.select({
        id: costumeSales.id,
        costumeId: costumeSales.costumeId,
        costumeName: costumes.name,
        studentId: costumeSales.studentId,
        studentName: students.name,
        eventId: costumeSales.eventId,
        eventName: events.name,
        quantity: costumeSales.quantity,
        unitPrice: costumeSales.unitPrice,
        totalPrice: costumeSales.totalPrice,
        paymentMode: costumeSales.paymentMode,
        discountPercent: costumeSales.discountPercent,
        madeToOrder: costumeSales.madeToOrder,
        paymentProvider: costumeSales.paymentProvider,
        paymentLink: costumeSales.paymentLink,
        status: costumeSales.status,
        deliveryStatus: costumeSales.deliveryStatus,
        orderCode: costumeSales.orderCode,
        deliveredAt: costumeSales.deliveredAt,
        notes: costumeSales.notes,
        paidAt: costumeSales.paidAt,
        createdAt: costumeSales.createdAt,
      })
        .from(costumeSales)
        .innerJoin(costumes, eq(costumes.id, costumeSales.costumeId))
        .innerJoin(students, eq(students.id, costumeSales.studentId))
        .leftJoin(events, eq(events.id, costumeSales.eventId))
        .where(and(
          eq(costumeSales.organizationId, orgId),
          input?.eventId ? eq(costumeSales.eventId, input.eventId) : undefined,
          input?.status && input.status !== "todos" ? eq(costumeSales.status, input.status) : undefined,
        ))
        .orderBy(desc(costumeSales.createdAt))
        .limit(500);

      const q = input?.search?.trim().toLowerCase() ?? "";
      const filtered = q
        ? rows.filter((r: any) =>
            r.orderCode?.toLowerCase().includes(q) ||
            r.studentName?.toLowerCase().includes(q) ||
            r.costumeName?.toLowerCase().includes(q))
        : rows;
      return filtered;

      return rows.map((row) => ({
        ...row,
        unitPrice: Number(row.unitPrice) || 0,
        totalPrice: Number(row.totalPrice) || 0,
        discountPercent: Number(row.discountPercent) || 0,
      }));
    }),

    /** Atualiza o status da venda (somente pendente → pago/cancelado). */
    /** Situação FINANCEIRA da venda (pendente | pago | cancelado). Não mexe na entrega. */
    updateSaleStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["pendente", "pago", "cancelado"]),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [sale] = await db.select({ id: costumeSales.id, status: costumeSales.status, paidAt: costumeSales.paidAt }).from(costumeSales)
        .where(and(eq(costumeSales.id, input.id), eq(costumeSales.organizationId, orgId))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });

      const from = sale.status;
      const to = input.status;
      if (from === to) return { success: true };
      if (from === "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda cancelada não pode ser reaberta. Crie uma nova venda." });
      }
      if (to === "pendente" && from === "pago") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda paga não volta para pendente." });
      }

      await db.update(costumeSales).set({
        status: to,
        paidAt: to === "pago" ? (sale.paidAt ?? new Date()) : undefined,
        canceledAt: to === "cancelado" ? new Date() : (to === "pendente" ? null : undefined),
        updatedAt: new Date(),
      }).where(eq(costumeSales.id, input.id));

      return { success: true };
    }),

    /** Situação LOGÍSTICA do pedido (pendente | em_separacao | entregue). Não mexe no pagamento. */
    updateSaleDelivery: protectedProcedure.input(z.object({
      id: z.number(),
      deliveryStatus: z.enum(["pendente", "em_separacao", "entregue"]),
    })).mutation(async ({ ctx, input }) => {
      assertStaff(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });
      const orgId = ctx.user.organizationId!;

      const [sale] = await db.select({
        id: costumeSales.id,
        status: costumeSales.status,
        deliveryStatus: costumeSales.deliveryStatus,
      }).from(costumeSales)
        .where(and(eq(costumeSales.id, input.id), eq(costumeSales.organizationId, orgId))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
      if (sale.status === "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda cancelada — a entrega não pode ser alterada." });
      }

      const from = sale.deliveryStatus ?? "pendente";
      const to = input.deliveryStatus;
      if (from === to) return { success: true };
      if (from === "entregue") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido já entregue — situação final de entrega." });
      }

      await db.update(costumeSales).set({
        deliveryStatus: to,
        deliveredAt: to === "entregue" ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(costumeSales.id, input.id));

      return { success: true };
    }),

    /** Portal do aluno: compras na Loja. */
    myPurchases: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      const rows = await db.select({
        id: costumeSales.id,
        costumeName: costumes.name,
        costumeType: costumes.type,
        costumeSize: costumes.size,
        quantity: costumeSales.quantity,
        totalPrice: costumeSales.totalPrice,
        paymentMode: costumeSales.paymentMode,
        status: costumeSales.status,
        deliveryStatus: costumeSales.deliveryStatus,
        orderCode: costumeSales.orderCode,
        deliveredAt: costumeSales.deliveredAt,
        createdAt: costumeSales.createdAt,
        eventName: events.name,
      })
        .from(costumeSales)
        .innerJoin(costumes, eq(costumes.id, costumeSales.costumeId))
        .leftJoin(events, eq(events.id, costumeSales.eventId))
        .where(and(
          eq(costumeSales.studentId, studentId),
          eq(costumeSales.organizationId, ctx.user.organizationId!),
        ))
        .orderBy(desc(costumeSales.createdAt));

      return rows.map((row) => ({ ...row, totalPrice: Number(row.totalPrice) || 0 }));
    }),

    /** Portal do aluno: figurinos em sua posse + histórico. */
    myFigurinos: studentProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const studentId = await resolveStudentId(db, ctx);
      if (!studentId) return [];

      return db.select({
        id: costumeLoans.id,
        costumeName: costumes.name,
        costumeType: costumes.type,
        costumeSize: costumes.size,
        quantity: costumeLoans.quantity,
        checkedOutAt: costumeLoans.checkedOutAt,
        dueDate: costumeLoans.dueDate,
        returnedAt: costumeLoans.returnedAt,
        coreografiaTitle: coreografias.title,
      })
        .from(costumeLoans)
        .innerJoin(costumes, eq(costumes.id, costumeLoans.costumeId))
        .leftJoin(coreografias, eq(coreografias.id, costumeLoans.coreografiaId))
        .where(and(
          eq(costumeLoans.studentId, studentId),
          eq(costumeLoans.organizationId, ctx.user.organizationId!),
        ))
        .orderBy(desc(costumeLoans.checkedOutAt));
    }),
  }),
};
