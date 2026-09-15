// ─── InfinitePay — Checkout Integrado (client da API) ────────────────────────
// Docs: https://www.infinitepay.io/checkout-documentacao
// Modelo: link de checkout HOSPEDADO (paridade Mercado Pago). O aluno escolhe
// PIX (taxa zero) ou Cartão (até 12x) dentro do checkout da InfinitePay.
// SEGURANÇA (limitação do provedor): o webhook da InfinitePay NÃO envia
// assinatura criptográfica. O corpo do POST NÃO é prova de pagamento — toda
// baixa deve ser revalidada server-to-server via `payment_check` (RF-003/RN-003).
import { ENV } from "../_core/env";
import { decryptSecret } from "./integrationCrypto";

// A tabela settings guarda a chave BYOK criptografada (AES-256-GCM). Routers que
// leem settings com select cru recebem o valor cifrado — este helper resolve
// (decryptSecret mantém texto puro legado inalterado, paridade com Asaas/MP).
export function resolveInfinitePayApiKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return decryptSecret(raw) || null;
}

const INFINITEPAY_API_BASE = "https://api.checkout.infinitepay.io";
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Normalização da InfiniteTag (handle) ────────────────────────────────────
// A InfiniteTag chega às vezes com "$" na frente (ex.: "$minhaescola").
// A API espera o valor SEM o símbolo. RN-006: minúsculas + [a-z0-9_.-].
export function normalizeInfinitePayHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^\$/, "").toLowerCase();
  if (!cleaned) return null;
  if (!/^[a-z0-9_.-]+$/.test(cleaned)) return null;
  return cleaned;
}

// ─── Conversão BRL → centavos (RN-002: nunca usar float direto na API) ───────
// `amount` é decimal(10,2) do Postgres (string) ou número já arredondado
// pelo BillingEngine. Sempre inteiro em centavos no payload da InfinitePay.
export function brlToCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export interface InfinitePayItem {
  quantity: number;
  price: number; // inteiro em centavos
  description: string;
}

export interface InfinitePayCustomer {
  name: string;
  email?: string;
  phone?: string;
}

export interface CreateInfinitePayLinkParams {
  handle: string; // InfiniteTag sem "$"
  orderNsu: string; // referência do pedido no nosso sistema (ex.: due.id ou enrollment_{code})
  items: InfinitePayItem[];
  redirectUrl: string;
  webhookUrl: string;
  customer?: InfinitePayCustomer;
  apiKey?: string | null; // Chave da API da InfinitePay (BYOK) — enviada como Bearer quando informada
}

// A documentação pública da API de checkout não exige autenticação (identifica o
// vendedor pelo `handle`). A chave da API (quando o merchant possuir uma) é
// enviada como header Authorization Bearer — cabeçalhos desconhecidos são
// ignorados pela API, então é seguro enviar sempre que a escola configurar uma.
function authHeaders(apiKey?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = (apiKey || "").trim();
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

function extractSlugFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length > 0) return segs[segs.length - 1];
  } catch {
    // URL inválida — ignora
  }
  return null;
}

export interface InfinitePayLinkResult {
  url: string;
  slug: string | null;
}

// ─── Criação do link de checkout hospedado ───────────────────────────────────
// POST https://api.checkout.infinitepay.io/links
// O webhook_url é dinâmico POR LINK — não é preciso configurar nada no painel.
export async function createInfinitePayLink(
  params: CreateInfinitePayLinkParams
): Promise<InfinitePayLinkResult> {
  const payload: Record<string, unknown> = {
    handle: params.handle,
    order_nsu: params.orderNsu,
    items: params.items,
    redirect_url: params.redirectUrl,
    webhook_url: params.webhookUrl,
  };
  if (params.customer) payload.customer = params.customer;

  const response = await fetch(`${INFINITEPAY_API_BASE}/links`, {
    method: "POST",
    headers: authHeaders(params.apiKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[InfinitePay] Erro ao criar link de pagamento: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const url: string = String(data?.url ?? "");
  if (!url) {
    throw new Error("[InfinitePay] Resposta sem URL de checkout");
  }
  const slug =
    (typeof data?.invoice_slug === "string" && data.invoice_slug) ||
    (typeof data?.slug === "string" && data.slug) ||
    extractSlugFromUrl(url);

  return { url, slug: slug || null };
}

// ─── Verificação de pagamento (server-to-server) ─────────────────────────────
// POST https://api.checkout.infinitepay.io/payment_check
// É a ÚNICA prova confiável de pagamento (o webhook não é assinado).
export interface InfinitePayPaymentCheckResult {
  success: boolean;
  paid: boolean;
  amount?: number; // centavos
  paidAmount?: number; // centavos
  installments?: number;
  captureMethod?: string | null; // "pix" | "credit_card"
}

export async function checkInfinitePayPayment(params: {
  handle: string;
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
  apiKey?: string | null; // Chave da API BYOK (Bearer) — opcional
}): Promise<InfinitePayPaymentCheckResult> {
  const body: Record<string, string> = {
    handle: params.handle,
    order_nsu: params.orderNsu,
  };
  if (params.transactionNsu) body.transaction_nsu = params.transactionNsu;
  if (params.slug) body.slug = params.slug;

  try {
    const response = await fetch(`${INFINITEPAY_API_BASE}/payment_check`, {
      method: "POST",
      headers: authHeaders(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[InfinitePay] payment_check falhou: ${response.status}`);
      return { success: false, paid: false };
    }

    const data = await response.json();
    return {
      success: data?.success === true,
      paid: data?.paid === true,
      amount: Number(data?.amount) > 0 ? Number(data.amount) : undefined,
      paidAmount: Number(data?.paid_amount) > 0 ? Number(data.paid_amount) : undefined,
      installments: Number(data?.installments) > 0 ? Number(data.installments) : undefined,
      captureMethod: typeof data?.capture_method === "string" ? data.capture_method : null,
    };
  } catch (e) {
    console.error("[InfinitePay] Falha ao consultar payment_check:", (e as Error)?.message ?? e);
    return { success: false, paid: false };
  }
}

// ─── Decisão de baixa (RN-003) — função pura, testável ───────────────────────
// "paid"     → valor pago ≥ esperado: baixa automática liberada
// "mismatch" → pago, mas com valor MENOR que o esperado: não baixa (revisão manual)
// "unverified" → payment_check não confirmou (indisponível/pending/falha)
export function evaluateInfinitePayPayment(
  expectedCents: number,
  check: InfinitePayPaymentCheckResult
): "paid" | "mismatch" | "unverified" {
  if (!check.success || !check.paid) return "unverified";
  const paidAmount = check.paidAmount ?? check.amount ?? 0;
  if (paidAmount >= expectedCents) return "paid";
  return "mismatch";
}

// ─── URL do webhook de mensalidades (token embutido — mitigação de webhook não assinado) ──
export function buildInfinitePayWebhookUrl(dueId: number): string {
  const base = `${ENV.appUrl || "https://wrmusicpro.com.br"}/api/webhooks/infinitepay/student`;
  return `${base}?dueId=${dueId}&token=${encodeURIComponent(ENV.infinitepayWebhookToken)}`;
}
