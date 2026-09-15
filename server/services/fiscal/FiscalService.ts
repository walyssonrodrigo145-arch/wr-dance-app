import { getDb } from "../../db";
import {
  fiscalCompanies,
  fiscalServices,
  fiscalInvoices,
  fiscalJobs,
  fiscalLogs,
  students,
  paymentDues,
  users,
  notifications,
  FiscalInvoice,
} from "../../../drizzle/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { FocusNFeProvider } from "./FocusNFeProvider";
import {
  IFiscalProvider,
  CompanyFiscalData,
  CustomerFiscalData,
  ServiceFiscalData,
} from "./FiscalProvider.interface";
import { nanoid } from "nanoid";
import { notifyUser } from "../../_core/notification";

export class FiscalService {
  private static provider: IFiscalProvider = new FocusNFeProvider();

  public static getProvider(): IFiscalProvider {
    return this.provider;
  }

  public static setProvider(customProvider: IFiscalProvider) {
    this.provider = customProvider;
  }

  // ─── Reference Generator ──────────────────────────────────────────────────
  public static generatePaymentReference(organizationId: number, paymentId: number): string {
    return `WRMUSIC-${organizationId}-PAY-${paymentId}`;
  }

  public static generateManualReference(organizationId: number): string {
    return `WRMUSIC-${organizationId}-MAN-${nanoid(8).toUpperCase()}`;
  }

  // ─── Format Description ───────────────────────────────────────────────────
  public static formatDescription(template: string, vars: { studentName?: string; instrument?: string; competencia?: string; amount?: string }): string {
    let res = template || "Mensalidade de aulas de música - {competencia}";
    res = res.replace(/\{aluno\}/gi, vars.studentName || "");
    res = res.replace(/\{instrumento\}/gi, vars.instrument || "Música");
    res = res.replace(/\{competencia\}/gi, vars.competencia || "");
    res = res.replace(/\{valor\}/gi, vars.amount || "");
    return res.trim();
  }

  // ─── Log Audit Event ──────────────────────────────────────────────────────
  public static async logEvent(
    organizationId: number,
    invoiceId: number | null,
    event: string,
    payload: any,
    userId?: number,
    userName?: string
  ) {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(fiscalLogs).values({
        organizationId,
        invoiceId,
        event,
        payload: payload || {},
        userId: userId || null,
        userName: userName || null,
      });
    } catch (e) {
      console.error("[FiscalService] Erro ao gravar log fiscal:", e);
    }
  }

  // ─── Obter Configuração da Empresa / Escola ───────────────────────────────
  public static async getCompanyFiscal(organizationId: number): Promise<CompanyFiscalData | null> {
    const db = await getDb();
    if (!db) return null;

    const [company] = await db
      .select()
      .from(fiscalCompanies)
      .where(eq(fiscalCompanies.organizationId, organizationId))
      .limit(1);

    if (!company || !company.cnpj) return null;

    return {
      cnpj: company.cnpj,
      razaoSocial: company.razaoSocial,
      nomeFantasia: company.nomeFantasia,
      inscricaoMunicipal: company.inscricaoMunicipal,
      inscricaoEstadual: company.inscricaoEstadual,
      regimeTributario: company.regimeTributario as any,
      optanteSimplesNacional: company.optanteSimplesNacional,
      cep: company.cep,
      logradouro: company.logradouro,
      numero: company.numero,
      complemento: company.complemento,
      bairro: company.bairro,
      cidade: company.cidade,
      uf: company.uf,
      codigoMunicipio: company.codigoMunicipio,
      telefone: company.telefone,
      email: company.email,
      apiKey: company.focusApiKey,
    };
  }

  // ─── Criar Emissão para Pagamento de Mensalidade ───────────────────────────
  public static async createInvoiceForPayment(
    organizationId: number,
    paymentId: number,
    options?: { userId?: number; userName?: string; serviceId?: number; autoQueue?: boolean }
  ): Promise<{ invoice: FiscalInvoice; alreadyExists: boolean }> {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const reference = this.generatePaymentReference(organizationId, paymentId);

    // 1. Idempotência: verificar se já existe nota para este pagamento
    const [existing] = await db
      .select()
      .from(fiscalInvoices)
      .where(eq(fiscalInvoices.reference, reference))
      .limit(1);

    if (existing) {
      return { invoice: existing, alreadyExists: true };
    }

    // 2. Buscar pagamento e aluno
    const [payment] = await db
      .select()
      .from(paymentDues)
      .where(and(eq(paymentDues.id, paymentId), eq(paymentDues.organizationId, organizationId)))
      .limit(1);

    if (!payment) throw new Error("Pagamento não encontrado");

    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, payment.studentId))
      .limit(1);

    if (!student) throw new Error("Aluno vinculado ao pagamento não encontrado");

    // Validação mínima de dados fiscais
    const taxId = (student.fiscalCpfCnpj || student.cpf || "").replace(/\D/g, "");
    if (!taxId) {
      throw new Error("Dados fiscais incompletos: O aluno não possui CPF ou CNPJ cadastrado.");
    }

    const customerName = student.fiscalLegalName || student.name;
    const competencia = `${String(payment.month).padStart(2, "0")}/${payment.year}`;

    // 3. Buscar serviço fiscal configurado
    let [service] = options?.serviceId
      ? await db.select().from(fiscalServices).where(and(eq(fiscalServices.id, options.serviceId), eq(fiscalServices.organizationId, organizationId))).limit(1)
      : await db.select().from(fiscalServices).where(and(eq(fiscalServices.organizationId, organizationId), eq(fiscalServices.ativo, true))).limit(1);

    if (!service) {
      // Cria serviço padrão se não houver nenhum
      const [newService] = await db
        .insert(fiscalServices)
        .values({
          organizationId,
          nome: "Mensalidade de Aulas de Música",
          codigoServico: "0801",
          itemListaServico: "08.01",
          aliquotaIss: "0.00",
          naturezaOperacao: "1",
          descricaoPadrao: "Mensalidade referente a aulas de música - Competência {competencia}",
          ativo: true,
        })
        .returning();
      service = newService;
    }

    const serviceDescription = this.formatDescription(service.descricaoPadrao, {
      studentName: student.name,
      competencia,
      amount: Number(payment.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    });

    // 4. Inserir nota no banco em estado 'pending'
    const [invoice] = await db
      .insert(fiscalInvoices)
      .values({
        organizationId,
        studentId: student.id,
        paymentId: payment.id,
        serviceId: service.id,
        reference,
        provider: this.provider.name,
        status: "pending",
        valor: String(payment.amount),
        competencia,
        customerName,
        customerTaxId: taxId,
        customerEmail: student.email || student.guardianEmail || null,
        customerPhone: student.phone || student.guardianPhone || null,
        serviceDescription,
      })
      .returning();

    await this.logEvent(
      organizationId,
      invoice.id,
      "NFS-E_CREATED",
      { reference, paymentId, valor: payment.amount, studentId: student.id },
      options?.userId,
      options?.userName
    );

    // 5. Enfileirar Job de processamento se solicitado
    if (options?.autoQueue !== false) {
      await db.insert(fiscalJobs).values({
        organizationId,
        invoiceId: invoice.id,
        type: "emit",
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
      });
    }

    return { invoice, alreadyExists: false };
  }

  // ─── Processar Emissão Direta ou através da Fila ───────────────────────────
  public static async processInvoiceEmission(invoiceId: number): Promise<FiscalInvoice> {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const [invoice] = await db
      .select()
      .from(fiscalInvoices)
      .where(eq(fiscalInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) throw new Error(`Nota fiscal #${invoiceId} não encontrada`);

    if (invoice.status === "authorized") {
      return invoice;
    }

    const companyData = await this.getCompanyFiscal(invoice.organizationId);
    if (!companyData) {
      const errorMsg = "Configuração fiscal da escola incompleta. Preencha os dados em Configurações -> Fiscal.";
      await db
        .update(fiscalInvoices)
        .set({ status: "error", errorCode: "MISSING_COMPANY_CONFIG", errorMessage: errorMsg, updatedAt: new Date() })
        .where(eq(fiscalInvoices.id, invoiceId));
      await this.logEvent(invoice.organizationId, invoiceId, "NFS-E_ERROR", { error: errorMsg });
      throw new Error(errorMsg);
    }

    let serviceData: ServiceFiscalData = {
      codigoServico: "0801",
      aliquotaIss: 0,
      descricao: invoice.serviceDescription,
    };

    if (invoice.serviceId) {
      const [srv] = await db.select().from(fiscalServices).where(eq(fiscalServices.id, invoice.serviceId)).limit(1);
      if (srv) {
        serviceData = {
          codigoServico: srv.codigoServico,
          codigoTributacaoMunicipio: srv.codigoTributacaoMunicipio,
          itemListaServico: srv.itemListaServico,
          aliquotaIss: Number(srv.aliquotaIss || 0),
          naturezaOperacao: srv.naturezaOperacao,
          issRetido: srv.issRetido,
          descricao: invoice.serviceDescription,
        };
      }
    }

    // Buscar endereço do aluno se disponível
    let studentAddress: any = undefined;
    if (invoice.studentId) {
      const [st] = await db.select().from(students).where(eq(students.id, invoice.studentId)).limit(1);
      if (st) {
        studentAddress = {
          cep: st.fiscalCep,
          logradouro: st.fiscalStreet,
          numero: st.fiscalNumber,
          complemento: st.fiscalComplement,
          bairro: st.fiscalNeighborhood,
          cidade: st.fiscalCity,
          uf: st.fiscalState,
        };
      }
    }

    const customerData: CustomerFiscalData = {
      name: invoice.customerName,
      taxId: invoice.customerTaxId,
      email: invoice.customerEmail,
      phone: invoice.customerPhone,
      address: studentAddress,
    };

    // Atualiza status para processing
    await db
      .update(fiscalInvoices)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(fiscalInvoices.id, invoiceId));

    await this.logEvent(invoice.organizationId, invoiceId, "NFS-E_SENT", { reference: invoice.reference });

    // Chama o provedor Focus NFe
    const result = await this.provider.emitNfse({
      reference: invoice.reference,
      valor: Number(invoice.valor),
      competencia: invoice.competencia || undefined,
      company: companyData,
      customer: customerData,
      service: serviceData,
    });

    const updateFields: Partial<typeof fiscalInvoices.$inferInsert> = {
      status: result.status as any,
      providerId: result.providerId || invoice.providerId,
      numero: result.numero || invoice.numero,
      serie: result.serie || invoice.serie,
      codigoVerificacao: result.codigoVerificacao || invoice.codigoVerificacao,
      pdfUrl: result.pdfUrl || invoice.pdfUrl,
      xmlUrl: result.xmlUrl || invoice.xmlUrl,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
      dataEmissao: result.status === "authorized" ? new Date() : invoice.dataEmissao,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(fiscalInvoices)
      .set(updateFields)
      .where(eq(fiscalInvoices.id, invoiceId))
      .returning();

    const eventName =
      result.status === "authorized"
        ? "NFS-E_AUTHORIZED"
        : result.status === "rejected"
        ? "NFS-E_REJECTED"
        : result.status === "processing"
        ? "NFS-E_PROCESSING"
        : "NFS-E_ERROR";

    await this.logEvent(invoice.organizationId, invoiceId, eventName, { result });

    // Notificar administradores se autorizada
    if (result.status === "authorized") {
      this.notifyAdmins(invoice.organizationId, `NFS-e #${result.numero || invoice.id} emitida com sucesso!`, `/notas-fiscais`);
    }

    return updated;
  }

  // ─── Cancelar Nota Fiscal ─────────────────────────────────────────────────
  public static async cancelInvoice(
    invoiceId: number,
    reason: string,
    userId?: number,
    userName?: string
  ): Promise<{ success: boolean; message: string }> {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const [invoice] = await db
      .select()
      .from(fiscalInvoices)
      .where(eq(fiscalInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) throw new Error("Nota fiscal não encontrada");
    if (!invoice.reference) throw new Error("Referência da nota fiscal inválida");

    const companyData = await this.getCompanyFiscal(invoice.organizationId);
    if (!companyData) throw new Error("Dados fiscais da empresa não configurados");

    await db
      .update(fiscalInvoices)
      .set({ status: "cancel_requested", cancelReason: reason, updatedAt: new Date() })
      .where(eq(fiscalInvoices.id, invoiceId));

    await this.logEvent(
      invoice.organizationId,
      invoiceId,
      "NFS-E_CANCEL_REQUESTED",
      { reason },
      userId,
      userName
    );

    const cancelResult = await this.provider.cancelNfse(invoice.reference, reason, companyData);

    if (cancelResult.success) {
      await db
        .update(fiscalInvoices)
        .set({
          status: cancelResult.status as any,
          cancelledAt: cancelResult.status === "cancelled" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(fiscalInvoices.id, invoiceId));

      await this.logEvent(
        invoice.organizationId,
        invoiceId,
        cancelResult.status === "cancelled" ? "NFS-E_CANCELLED" : "NFS-E_CANCEL_REQUESTED",
        { cancelResult },
        userId,
        userName
      );

      return { success: true, message: cancelResult.message || "Cancelamento processado" };
    } else {
      await this.logEvent(
        invoice.organizationId,
        invoiceId,
        "NFS-E_ERROR",
        { error: cancelResult.message },
        userId,
        userName
      );
      throw new Error(cancelResult.message || "Falha ao solicitar cancelamento");
    }
  }

  // ─── Helpers de Notificação ───────────────────────────────────────────────
  private static async notifyAdmins(organizationId: number, message: string, actionUrl: string) {
    try {
      const db = await getDb();
      if (!db) return;

      const admins = await db
        .select()
        .from(users)
        .where(and(eq(users.organizationId, organizationId), eq(users.role, "admin")));

      for (const admin of admins) {
        await db
          .insert(notifications)
          .values({
            organizationId,
            userId: admin.id,
            title: "🧾 NFS-e Atualizada",
            message,
            type: "success",
            actionUrl,
            createdAt: new Date(),
          })
          .onConflictDoNothing()
          .catch(() => {});

        await notifyUser(admin.id, {
          title: "🧾 NFS-e Atualizada",
          content: message,
          url: actionUrl,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("[FiscalService] Erro ao notificar administradores:", e);
    }
  }
}
