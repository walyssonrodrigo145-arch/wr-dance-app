// ─── Encurtador de links de pagamento (wrmusicpro.com.br/p/{code}) ───────────
// PRD: links curtos no domínio próprio para o envio por WhatsApp (InfinitePay
// hoje; rota genérica para futuros gateways). Padrão para TODAS as escolas.
//
// SEGURANÇA: só o servidor cria links — dentro dos fluxos de cobrança. Não
// existe endpoint público de criação (elimina open redirect por terceiros).
// CONFIABILIDADE: o encurtador NUNCA bloqueia a cobrança — em qualquer falha
// (insert, colisão repetida, indisponibilidade) retorna a URL original.
import { nanoid } from "nanoid";
import { ENV } from "../_core/env";
import { shortLinks } from "../../drizzle/schema";

const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 3; // retries em colisão de código único

function baseUrl(): string {
  return (ENV.appUrl || "https://wrmusicpro.com.br").replace(/\/+$/, "");
}

export interface CreateShortLinkParams {
  targetUrl: string;
  organizationId?: number | null;
  userId?: number | null;
  paymentDueId?: number | null;
  enrollmentCode?: string | null;
}

/**
 * Cria um link curto /p/{code} apontando para targetUrl.
 * Em caso de falha (db indisponível, erro de insert, colisões), retorna a
 * própria targetUrl — o fluxo de cobrança segue funcionando com o link longo.
 */
export async function createPaymentShortLink(
  db: any,
  params: CreateShortLinkParams
): Promise<string> {
  if (!params.targetUrl || !db) return params.targetUrl;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = nanoid(CODE_LENGTH);
      try {
        await db.insert(shortLinks).values({
          organizationId: params.organizationId ?? null,
          userId: params.userId ?? null,
          code,
          targetUrl: params.targetUrl,
          paymentDueId: params.paymentDueId ?? null,
          enrollmentCode: params.enrollmentCode ?? null,
          clicks: 0,
        });
        return `${baseUrl()}/p/${code}`;
      } catch (insertErr: any) {
        // Colisão de código único (23505) → tenta novo código; outro erro → desiste
        const isCollision = String(insertErr?.code ?? "") === "23505";
        if (!isCollision) break;
      }
    }
    return params.targetUrl;
  } catch (e) {
    console.error("[ShortLinks] Falha ao criar link curto — usando URL original:", (e as Error)?.message ?? e);
    return params.targetUrl;
  }
}
