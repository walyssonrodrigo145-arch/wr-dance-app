import { z } from "zod";
import { protectedProcedure, professorProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  fiscalCompanies,
  fiscalServices,
  fiscalInvoices,
  fiscalJobs,
  fiscalLogs,
  students,
  paymentDues,
} from "../drizzle/schema";
import { eq, and, desc, sql, ilike, or, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { FiscalService } from "./services/fiscal/FiscalService";

export const fiscalRouter = router({
  // ─── EMPRESA / CONFIGURAÇÃO FISCAL ───────────────────────────────────────────
  company: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [company] = await db
        .select()
        .from(fiscalCompanies)
        .where(eq(fiscalCompanies.organizationId, orgId))
        .limit(1);

      return company || null;
    }),

    save: protectedProcedure
      .input(
        z.object({
          cnpj: z.string().min(14, "CNPJ inválido"),
          razaoSocial: z.string().min(2, "Razão social obrigatória"),
          nomeFantasia: z.string().optional().nullable(),
          inscricaoMunicipal: z.string().optional().nullable(),
          inscricaoEstadual: z.string().optional().nullable(),
          regimeTributario: z.enum(["simples_nacional", "lucro_presumido", "lucro_real", "mei"]).default("simples_nacional"),
          optanteSimplesNacional: z.boolean().default(true),
          tipoEmissaoNfse: z.enum(["municipal", "nacional", "automatico"]).default("automatico"),
          cep: z.string().optional().nullable(),
          logradouro: z.string().optional().nullable(),
          numero: z.string().optional().nullable(),
          complemento: z.string().optional().nullable(),
          bairro: z.string().optional().nullable(),
          cidade: z.string().optional().nullable(),
          uf: z.string().optional().nullable(),
          codigoMunicipio: z.string().optional().nullable(),
          telefone: z.string().optional().nullable(),
          email: z.string().optional().nullable(),
          focusApiKey: z.string().optional().nullable(),
          autoEmitOnPayment: z.boolean().default(false),
          emitTiming: z.string().default("imediato"),
          autoEmailInvoice: z.boolean().default(true),
          autoRetryErrors: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [existing] = await db
          .select()
          .from(fiscalCompanies)
          .where(eq(fiscalCompanies.organizationId, orgId))
          .limit(1);

        if (existing) {
          const [updated] = await db
            .update(fiscalCompanies)
            .set({
              ...input,
              updatedAt: new Date(),
            })
            .where(eq(fiscalCompanies.id, existing.id))
            .returning();
          return updated;
        } else {
          const [created] = await db
            .insert(fiscalCompanies)
            .values({
              organizationId: orgId,
              ...input,
            })
            .returning();
          return created;
        }
      }),
  }),

  // ─── SERVIÇOS FISCAIS ───────────────────────────────────────────────────────
  services: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(fiscalServices)
        .where(eq(fiscalServices.organizationId, orgId))
        .orderBy(desc(fiscalServices.id));
    }),

    create: protectedProcedure
      .input(
        z.object({
          nome: z.string().min(2, "Nome obrigatório"),
          codigoServico: z.string().min(1, "Código do serviço obrigatório"),
          codigoTributacaoMunicipio: z.string().optional().nullable(),
          itemListaServico: z.string().default("08.01"),
          aliquotaIss: z.string().default("0.00"),
          naturezaOperacao: z.string().default("1"),
          descricaoPadrao: z.string().min(5, "Descrição padrão obrigatória"),
          issRetido: z.boolean().default(false),
          ativo: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [created] = await db
          .insert(fiscalServices)
          .values({
            organizationId: orgId,
            ...input,
          })
          .returning();

        return created;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          nome: z.string().min(2),
          codigoServico: z.string().min(1),
          codigoTributacaoMunicipio: z.string().optional().nullable(),
          itemListaServico: z.string().default("08.01"),
          aliquotaIss: z.string().default("0.00"),
          naturezaOperacao: z.string().default("1"),
          descricaoPadrao: z.string().min(5),
          issRetido: z.boolean().default(false),
          ativo: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, ...data } = input;
        const [updated] = await db
          .update(fiscalServices)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(fiscalServices.id, id), eq(fiscalServices.organizationId, orgId)))
          .returning();

        return updated;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db
          .delete(fiscalServices)
          .where(and(eq(fiscalServices.id, input.id), eq(fiscalServices.organizationId, orgId)));

        return { success: true };
      }),
  }),

  // ─── NOTAS FISCAIS & DASHBOARD ──────────────────────────────────────────────
  invoices: router({
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const orgId = ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const invoices = await db
        .select()
        .from(fiscalInvoices)
        .where(eq(fiscalInvoices.organizationId, orgId));

      let emitidas = 0;
      let processando = 0;
      let rejeitadas = 0;
      let canceladas = 0;
      let faturamentoNfse = 0;

      for (const inv of invoices) {
        if (inv.status === "authorized") {
          emitidas++;
          faturamentoNfse += Number(inv.valor || 0);
        } else if (inv.status === "processing" || inv.status === "pending") {
          processando++;
        } else if (inv.status === "rejected" || inv.status === "error") {
          rejeitadas++;
        } else if (inv.status === "cancelled" || inv.status === "cancel_requested") {
          canceladas++;
        }
      }

      // Consumo simulado baseado em cota de 4000 notas
      const totalConsumo = invoices.length;
      const cotaTotal = 4000;

      return {
        emitidas,
        processando,
        rejeitadas,
        canceladas,
        faturamentoNfse,
        consumo: {
          utilizado: totalConsumo,
          total: cotaTotal,
          percentual: Math.min(100, Math.round((totalConsumo / cotaTotal) * 100)),
        },
      };
    }),

    list: protectedProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.string().optional(),
          competencia: z.string().optional(),
          studentId: z.number().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const conditions = [eq(fiscalInvoices.organizationId, orgId)];

        if (input.status && input.status !== "all") {
          conditions.push(eq(fiscalInvoices.status, input.status as any));
        }

        if (input.studentId) {
          conditions.push(eq(fiscalInvoices.studentId, input.studentId));
        }

        if (input.competencia) {
          conditions.push(eq(fiscalInvoices.competencia, input.competencia));
        }

        if (input.search) {
          const s = `%${input.search}%`;
          conditions.push(
            or(
              ilike(fiscalInvoices.customerName, s),
              ilike(fiscalInvoices.customerTaxId, s),
              ilike(fiscalInvoices.numero, s),
              ilike(fiscalInvoices.reference, s)
            )!
          );
        }

        const offset = (input.page - 1) * input.limit;

        const items = await db
          .select()
          .from(fiscalInvoices)
          .where(and(...conditions))
          .orderBy(desc(fiscalInvoices.id))
          .limit(input.limit)
          .offset(offset);

        const [{ totalCount }] = await db
          .select({ totalCount: sql<number>`count(*)` })
          .from(fiscalInvoices)
          .where(and(...conditions));

        return {
          items,
          totalCount: Number(totalCount || 0),
          page: input.page,
          totalPages: Math.ceil(Number(totalCount || 0) / input.limit),
        };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [invoice] = await db
          .select()
          .from(fiscalInvoices)
          .where(and(eq(fiscalInvoices.id, input.id), eq(fiscalInvoices.organizationId, orgId)))
          .limit(1);

        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada" });

        const logs = await db
          .select()
          .from(fiscalLogs)
          .where(and(eq(fiscalLogs.invoiceId, invoice.id), eq(fiscalLogs.organizationId, orgId)))
          .orderBy(desc(fiscalLogs.createdAt));

        return { invoice, logs };
      }),

    emitForPayment: protectedProcedure
      .input(
        z.object({
          paymentId: z.number(),
          serviceId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        try {
          const res = await FiscalService.createInvoiceForPayment(orgId, input.paymentId, {
            userId: ctx.user.id,
            userName: ctx.user.name || "Usuário",
            serviceId: input.serviceId,
            autoQueue: true,
          });

          // Tenta emitir imediatamente
          FiscalService.processInvoiceEmission(res.invoice.id).catch((err) => {
            console.warn(`[FiscalRouter] Emissão assíncrona falhou para #${res.invoice.id}:`, err.message);
          });

          return res;
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
      }),

    emitManual: protectedProcedure
      .input(
        z.object({
          studentId: z.number().optional(),
          customerName: z.string().min(2, "Nome do cliente obrigatório"),
          customerTaxId: z.string().min(11, "CPF/CNPJ obrigatório"),
          customerEmail: z.string().optional().nullable(),
          valor: z.number().min(0.01, "Valor inválido"),
          competencia: z.string(),
          serviceId: z.number().optional(),
          serviceDescription: z.string().min(5, "Descrição do serviço obrigatória"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const reference = FiscalService.generateManualReference(orgId);

        const [invoice] = await db
          .insert(fiscalInvoices)
          .values({
            organizationId: orgId,
            studentId: input.studentId || null,
            serviceId: input.serviceId || null,
            reference,
            provider: "focusnfe",
            status: "pending",
            valor: String(input.valor),
            competencia: input.competencia,
            customerName: input.customerName,
            customerTaxId: input.customerTaxId.replace(/\D/g, ""),
            customerEmail: input.customerEmail || null,
            serviceDescription: input.serviceDescription,
          })
          .returning();

        await FiscalService.logEvent(
          orgId,
          invoice.id,
          "NFS-E_CREATED",
          { reference, manual: true, valor: input.valor },
          ctx.user.id,
          ctx.user.name || "Usuário"
        );

        // Enfileira e dispara
        await db.insert(fiscalJobs).values({
          organizationId: orgId,
          invoiceId: invoice.id,
          type: "emit",
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
        });

        FiscalService.processInvoiceEmission(invoice.id).catch((err) => {
          console.warn(`[FiscalRouter] Emissão avulsa com erro #${invoice.id}:`, err.message);
        });

        return invoice;
      }),

    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        try {
          const updated = await FiscalService.processInvoiceEmission(input.id);
          return updated;
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
      }),

    cancel: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          reason: z.string().min(5, "Informe uma justificativa de no mínimo 5 caracteres"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        try {
          const res = await FiscalService.cancelInvoice(
            input.id,
            input.reason,
            ctx.user.id,
            ctx.user.name || "Usuário"
          );
          return res;
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
      }),
  }),

  // ─── DADOS FISCAIS DO ALUNO ─────────────────────────────────────────────────
  student: router({
    getFiscalData: protectedProcedure
      .input(z.object({ studentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [student] = await db
          .select({
            id: students.id,
            name: students.name,
            email: students.email,
            phone: students.phone,
            cpf: students.cpf,
            personType: students.personType,
            fiscalCpfCnpj: students.fiscalCpfCnpj,
            fiscalLegalName: students.fiscalLegalName,
            fiscalCep: students.fiscalCep,
            fiscalStreet: students.fiscalStreet,
            fiscalNumber: students.fiscalNumber,
            fiscalComplement: students.fiscalComplement,
            fiscalNeighborhood: students.fiscalNeighborhood,
            fiscalCity: students.fiscalCity,
            fiscalState: students.fiscalState,
          })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.organizationId, orgId)))
          .limit(1);

        if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Aluno não encontrado" });

        return student;
      }),

    saveFiscalData: protectedProcedure
      .input(
        z.object({
          studentId: z.number(),
          personType: z.enum(["PF", "PJ"]).default("PF"),
          fiscalCpfCnpj: z.string().min(11, "CPF ou CNPJ inválido"),
          fiscalLegalName: z.string().min(2, "Nome ou Razão Social obrigatório"),
          fiscalCep: z.string().optional().nullable(),
          fiscalStreet: z.string().optional().nullable(),
          fiscalNumber: z.string().optional().nullable(),
          fiscalComplement: z.string().optional().nullable(),
          fiscalNeighborhood: z.string().optional().nullable(),
          fiscalCity: z.string().optional().nullable(),
          fiscalState: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const orgId = ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "UNAUTHORIZED" });

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { studentId, ...data } = input;

        const [updated] = await db
          .update(students)
          .set({
            ...data,
            cpf: data.personType === "PF" ? data.fiscalCpfCnpj : undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(students.id, studentId), eq(students.organizationId, orgId)))
          .returning();

        return updated;
      }),
  }),
});
