// ─── Efeitos colaterais de um pagamento confirmado (AUDITORIA Fase 2) ────────
// Fonte única para os efeitos que precisam acontecer SEMPRE que uma fatura é
// baixada como paga, seja por webhook (Asaas/MP/InfinitePay), pelo portal do
// aluno (comprovante validado por IA) ou manualmente:
//   1. persiste o comprovante (quando houver);
//   2. cancela lembretes de cobrança pendentes daquela fatura;
//   3. (opcional) cancela/limpa links de cobrança ainda pagáveis — evita
//      pagamento em duplicidade quando o aluno paga por fora do link;
//   4. enfileira a NFS-e automática (quando a escola ativou).
// Nunca lança erro: efeitos colaterais não podem derrubar a baixa.
import { and, eq } from "drizzle-orm";
import { fiscalCompanies, paymentDues, reminders, settings } from "../../drizzle/schema";

export type PaymentEffectSource = "webhook" | "portal" | "manual";

export interface PaymentEffectOptions {
  organizationId: number;
  dueId: number;
  source: PaymentEffectSource;
  receiptUrl?: string | null;
  actorUserId?: number;
  actorUserName?: string;
  /** Quando true, tenta cancelar a cobrança Asaas e limpa todos os links abertos. */
  cancelOpenCharges?: boolean;
}

export async function afterPaymentConfirmed(db: any, opts: PaymentEffectOptions): Promise<void> {
  try {
    const [due] = await db.select().from(paymentDues)
      .where(and(eq(paymentDues.id, opts.dueId), eq(paymentDues.organizationId, opts.organizationId)))
      .limit(1);
    if (!due) return;

    // 1. Comprovante
    if (opts.receiptUrl && !due.receiptUrl) {
      await db.update(paymentDues)
        .set({ receiptUrl: opts.receiptUrl, updatedAt: new Date() })
        .where(eq(paymentDues.id, due.id));
    }

    // 2. Lembretes pendentes desta fatura (não avisar quem já pagou)
    await db.update(reminders)
      .set({ status: "cancelado", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(reminders.paymentDueId, due.id),
        eq(reminders.organizationId, opts.organizationId),
        eq(reminders.status, "pendente"),
      ));

    // 3. Cobranças ainda pagáveis (portal confirmou por fora do link)
    if (opts.cancelOpenCharges) {
      if (due.asaasId) {
        try {
          const { deleteAsaasCharge } = await import("../utils/asaas");
          const { decryptSecret } = await import("../utils/integrationCrypto");
          const [s] = await db.select({ k: settings.asaasApiKey }).from(settings)
            .where(eq(settings.userId, due.userId)).limit(1);
          await deleteAsaasCharge(due.asaasId, s?.k ? decryptSecret(s.k) : undefined);
        } catch (e) {
          console.warn("[paymentEffects] Falha ao cancelar cobrança Asaas:", e);
        }
      }
      if (due.asaasId || due.asaasPaymentLink || due.asaasBillingType || due.mpPaymentId || due.mpPaymentLink
        || due.infinitepayPaymentLink || due.infinitepaySlug || due.infinitepayPaymentId) {
        await db.update(paymentDues).set({
          asaasId: null,
          asaasPaymentLink: null,
          asaasBillingType: null,
          mpPaymentId: null,
          mpPaymentLink: null,
          infinitepayPaymentLink: null,
          infinitepaySlug: null,
          infinitepayPaymentId: null,
          updatedAt: new Date(),
        }).where(eq(paymentDues.id, due.id));
      }
    }

    // 4. NFS-e automática
    try {
      const [fComp] = await db.select({ autoEmit: fiscalCompanies.autoEmitOnPayment })
        .from(fiscalCompanies).where(eq(fiscalCompanies.organizationId, opts.organizationId)).limit(1);
      if (fComp?.autoEmit) {
        const { FiscalService } = await import("./fiscal/FiscalService");
        await FiscalService.createInvoiceForPayment(opts.organizationId, due.id, {
          userId: opts.actorUserId ?? due.userId,
          userName: opts.actorUserName ?? "Sistema",
          autoQueue: true,
        });
      }
    } catch (e: any) {
      console.warn("[paymentEffects] Falha ao enfileirar NFS-e:", e?.message);
    }
  } catch (error) {
    console.warn("[paymentEffects] Erro ao aplicar efeitos do pagamento:", error);
  }
}
