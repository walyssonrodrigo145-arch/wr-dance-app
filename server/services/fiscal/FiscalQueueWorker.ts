import { debugLog } from "../../_core/logger";
import { getDb } from "../../db";
import { fiscalJobs, fiscalInvoices } from "../../../drizzle/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { FiscalService } from "./FiscalService";

export class FiscalQueueWorker {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;

  public static start(intervalMs: number = 20000) {
    if (this.timer) return;
    debugLog("[FiscalQueue] Worker de processamento fiscal iniciado.");
    this.timer = setInterval(() => this.processNextBatch(), intervalMs);
    // Processa uma primeira rodada após 5s
    setTimeout(() => this.processNextBatch(), 5000);
  }

  public static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      debugLog("[FiscalQueue] Worker parado.");
    }
  }

  public static async processNextBatch() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const db = await getDb();
      if (!db) return;

      const now = new Date();

      // 1. Buscar até 10 jobs pendentes
      const pendingJobs = await db
        .select()
        .from(fiscalJobs)
        .where(
          and(
            eq(fiscalJobs.status, "pending"),
            lte(fiscalJobs.nextAttemptAt, now)
          )
        )
        .limit(10);

      for (const job of pendingJobs) {
        await this.executeJob(job);
      }

      // 2. Consultar notas que estão presas em 'processing' há mais de 1 minuto
      const processingInvoices = await db
        .select()
        .from(fiscalInvoices)
        .where(
          and(
            eq(fiscalInvoices.status, "processing"),
            lte(fiscalInvoices.updatedAt, new Date(Date.now() - 60000))
          )
        )
        .limit(5);

      for (const inv of processingInvoices) {
        await this.syncProcessingInvoice(inv);
      }
    } catch (err) {
      console.error("[FiscalQueue] Erro no ciclo de execução:", err);
    } finally {
      this.isRunning = false;
    }
  }

  private static async executeJob(job: typeof fiscalJobs.$inferSelect) {
    const db = await getDb();
    if (!db) return;

    try {
      await db
        .update(fiscalJobs)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(fiscalJobs.id, job.id));

      if (job.type === "emit") {
        await FiscalService.processInvoiceEmission(job.invoiceId);
      }

      // Marcar como concluído
      await db
        .update(fiscalJobs)
        .set({
          status: "completed",
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fiscalJobs.id, job.id));
    } catch (err: any) {
      const newAttempts = job.attempts + 1;
      const isFailed = newAttempts >= job.maxAttempts;
      const errorMsg = err.message || "Erro desconhecido ao processar job fiscal";

      // Exponential backoff: 30s, 2m, 8m, 32m
      const backoffSeconds = Math.min(30 * Math.pow(4, job.attempts), 3600);
      const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

      await db
        .update(fiscalJobs)
        .set({
          status: isFailed ? "failed" : "pending",
          attempts: newAttempts,
          lastError: errorMsg,
          nextAttemptAt: nextAttempt,
          updatedAt: new Date(),
        })
        .where(eq(fiscalJobs.id, job.id));

      console.warn(
        `[FiscalQueue] Job #${job.id} falhou (tentativa ${newAttempts}/${job.maxAttempts}):`,
        errorMsg
      );
    }
  }

  private static async syncProcessingInvoice(invoice: typeof fiscalInvoices.$inferSelect) {
    const db = await getDb();
    if (!db) return;

    try {
      const companyData = await FiscalService.getCompanyFiscal(invoice.organizationId);
      if (!companyData) return;

      const provider = FiscalService.getProvider();
      const statusRes = await provider.queryNfse(invoice.reference, companyData);

      if (statusRes.status && statusRes.status !== "processing" && statusRes.status !== "pending") {
        await db
          .update(fiscalInvoices)
          .set({
            status: statusRes.status as any,
            providerId: statusRes.providerId || invoice.providerId,
            numero: statusRes.numero || invoice.numero,
            serie: statusRes.serie || invoice.serie,
            codigoVerificacao: statusRes.codigoVerificacao || invoice.codigoVerificacao,
            pdfUrl: statusRes.pdfUrl || invoice.pdfUrl,
            xmlUrl: statusRes.xmlUrl || invoice.xmlUrl,
            errorCode: statusRes.errorCode || null,
            errorMessage: statusRes.errorMessage || null,
            dataEmissao: statusRes.status === "authorized" ? new Date() : invoice.dataEmissao,
            updatedAt: new Date(),
          })
          .where(eq(fiscalInvoices.id, invoice.id));

        await FiscalService.logEvent(
          invoice.organizationId,
          invoice.id,
          `NFS-E_${statusRes.status.toUpperCase()}`,
          { syncedViaWorker: true, result: statusRes }
        );
      }
    } catch (e) {
      console.error(`[FiscalQueue] Erro ao sincronizar nota #${invoice.id}:`, e);
    }
  }
}
