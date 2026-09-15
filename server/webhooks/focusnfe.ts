import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { fiscalInvoices } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { FiscalService } from "../services/fiscal/FiscalService";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const webhookSecret = process.env.FOCUS_NFE_WEBHOOK_SECRET;

    // Se houver secret configurado, valida token no header ou query
    if (webhookSecret) {
      const token = req.headers["x-focus-webhook-token"] || req.query.token;
      if (token !== webhookSecret) {
        console.warn("[FocusNFe Webhook] Token inválido recebido.");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const reference = payload.ref || payload.referencia;
    if (!reference) {
      return res.status(400).json({ error: "Referência não informada" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    const [invoice] = await db
      .select()
      .from(fiscalInvoices)
      .where(eq(fiscalInvoices.reference, reference))
      .limit(1);

    if (!invoice) {
      console.warn(`[FocusNFe Webhook] Nota com referência ${reference} não encontrada no banco.`);
      return res.status(200).json({ status: "ignored", reason: "Invoice not found" });
    }

    await FiscalService.logEvent(
      invoice.organizationId,
      invoice.id,
      "WEBHOOK_RECEIVED",
      payload
    );

    // Mapeia status
    const statusRaw = (payload.status || "").toLowerCase();
    let newStatus: typeof invoice.status = invoice.status;

    if (["autorizado", "emitida", "concluido"].includes(statusRaw)) {
      newStatus = "authorized";
    } else if (["erro_autorizacao", "rejeitado"].includes(statusRaw)) {
      newStatus = "rejected";
    } else if (["cancelado"].includes(statusRaw)) {
      newStatus = "cancelled";
    } else if (["processando_autorizacao", "processando"].includes(statusRaw)) {
      newStatus = "processing";
    }

    const env = process.env.FOCUS_NFE_ENVIRONMENT || "development";
    const defaultBaseUrl =
      env === "production"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";
    const baseUrl = process.env.FOCUS_NFE_BASE_URL || defaultBaseUrl;

    const pdfUrl = payload.caminho_danfe
      ? payload.caminho_danfe.startsWith("http")
        ? payload.caminho_danfe
        : `${baseUrl}${payload.caminho_danfe}`
      : invoice.pdfUrl;

    const xmlUrl = payload.caminho_xml_nota_fiscal
      ? payload.caminho_xml_nota_fiscal.startsWith("http")
        ? payload.caminho_xml_nota_fiscal
        : `${baseUrl}${payload.caminho_xml_nota_fiscal}`
      : invoice.xmlUrl;

    const errorMsg =
      payload.erros && payload.erros.length > 0
        ? payload.erros.map((e: any) => e.mensagem || e).join(" | ")
        : payload.mensagem_sefaz || payload.mensagem;

    await db
      .update(fiscalInvoices)
      .set({
        status: newStatus,
        numero: payload.numero ? String(payload.numero) : invoice.numero,
        serie: payload.serie ? String(payload.serie) : invoice.serie,
        codigoVerificacao: payload.codigo_verificacao || invoice.codigoVerificacao,
        pdfUrl,
        xmlUrl,
        errorCode: payload.codigo_status_sefaz || invoice.errorCode,
        errorMessage: errorMsg || invoice.errorMessage,
        dataEmissao: newStatus === "authorized" && !invoice.dataEmissao ? new Date() : invoice.dataEmissao,
        cancelledAt: newStatus === "cancelled" ? new Date() : invoice.cancelledAt,
        updatedAt: new Date(),
      })
      .where(eq(fiscalInvoices.id, invoice.id));

    await FiscalService.logEvent(
      invoice.organizationId,
      invoice.id,
      "WEBHOOK_PROCESSED",
      { newStatus, numero: payload.numero }
    );

    return res.status(200).json({ status: "success", reference, newStatus });
  } catch (err: any) {
    console.error("[FocusNFe Webhook] Erro ao processar webhook:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
});

export default router;
