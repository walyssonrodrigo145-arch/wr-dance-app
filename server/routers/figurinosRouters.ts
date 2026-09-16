// ─── Figurinos / Vestuário (DancePro) ────────────────────────────────────────
// Acervo de figurinos com controle de empréstimo por aluno/coreografia.
// Disponibilidade = quantidade total − quantidade em uso (não devolvida).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { protectedProcedure, studentProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coreografias, costumeLoans, costumes, students } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const COSTUME_TYPES = ["saia", "collant", "sapatilha", "top", "calca", "acessorio", "uniforme", "outro"] as const;
const COSTUME_CONDITIONS = ["novo", "bom", "usado", "danificado"] as const;

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

const costumeInput = z.object({
  name: z.string().min(2, "Informe o nome do figurino").max(255),
  code: z.string().max(60).nullable().optional(),
  type: z.enum(COSTUME_TYPES).default("outro"),
  size: z.string().max(30).nullable().optional(),
  color: z.string().max(60).nullable().optional(),
  quantity: z.number().int().min(1).max(10000).default(1),
  condition: z.enum(COSTUME_CONDITIONS).default("bom"),
  cost: z.number().min(0).max(1000000).default(0),
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

      const emUso = sql<number>`(SELECT COALESCE(SUM(cl."quantity"), 0) FROM "costume_loans" cl WHERE cl."costumeId" = ${costumes.id} AND cl."returnedAt" IS NULL)`.as("emUso");

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
        photoUrl: costumes.photoUrl,
        notes: costumes.notes,
        active: costumes.active,
        createdAt: costumes.createdAt,
        emUso,
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

      return rows
        .map((row) => {
          const emUsoNum = Number(row.emUso) || 0;
          return {
            ...row,
            emUso: emUsoNum,
            disponivel: Math.max(0, row.quantity - emUsoNum),
            cost: Number(row.cost) || 0,
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
