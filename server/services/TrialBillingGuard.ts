// ─── TrialBillingGuard ────────────────────────────────────────────────────────
// REGRA DE NEGÓCIO: o período de 7 dias grátis NÃO pode gerar cobrança automática.
// Assinaturas pré-criadas no cadastro (comportamento antigo) ficam pendentes no
// Asaas e seriam cobradas ao fim do trial SEM consentimento do cliente. Esta
// guarda cancela essas assinaturas para organizações ainda em "trialing" e zera
// `asaasSubscriptionId`. A cobrança só volta a existir quando o cliente confirmar
// em /checkout (platform.checkout), que recria a assinatura sob demanda.
//
// Segurança: só limpa o vínculo local quando a assinatura é confirmadamente
// removida do Asaas (delete OK ou 404 = já inexistente). Se a remoção falhar por
// outro motivo, mantém o vínculo para nova tentativa no próximo ciclo.
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { organizations } from "../../drizzle/schema";
import { debugLog } from "../_core/logger";

export async function runTrialBillingGuard(): Promise<{ processed: number }> {
  try {
    const db = await getDb();
    if (!db) return { processed: 0 };

    const pending = await db
      .select({ id: organizations.id, subId: organizations.asaasSubscriptionId })
      .from(organizations)
      .where(and(
        eq(organizations.subscriptionStatus, "trialing"),
        isNotNull(organizations.asaasSubscriptionId),
      ));

    if (pending.length === 0) return { processed: 0 };

    const { deleteAsaasSubscription } = await import("../utils/asaas");
    let processed = 0;

    const clearLocal = async (orgId: number) => {
      await db.update(organizations)
        .set({ asaasSubscriptionId: null, updatedAt: new Date() })
        .where(eq(organizations.id, orgId));
    };

    for (const org of pending) {
      if (!org.subId) {
        await clearLocal(org.id);
        processed++;
        continue;
      }
      try {
        await deleteAsaasSubscription(org.subId);
        await clearLocal(org.id);
        processed++;
        debugLog(`[TrialGuard] Assinatura de trial cancelada — org #${org.id} (sem cobrança automática).`);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("404")) {
          // Assinatura já não existe no Asaas — seguro limpar o vínculo local
          await clearLocal(org.id);
          processed++;
          debugLog(`[TrialGuard] Assinatura ${org.subId} já inexistente no Asaas — vínculo limpo (org #${org.id}).`);
        } else {
          console.warn(`[TrialGuard] Não foi possível cancelar a assinatura ${org.subId} (org #${org.id}) — nova tentativa no próximo ciclo:`, e);
        }
      }
    }

    return { processed };
  } catch (err) {
    console.error("[TrialGuard] Erro ao processar guarda de trial:", err);
    return { processed: 0 };
  }
}
