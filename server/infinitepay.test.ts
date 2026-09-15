/**
 * INFINITEPAY — testes da integração InfinitePay (Checkout Integrado).
 * Protege as regras do PRD: RN-001 (gateway ativo), RN-002 (centavos),
 * RN-003 (baixa exige revalidação + valor), RN-006 (handle) e a
 * idempotência do webhook via registerWebhookEventOnce.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  brlToCents,
  normalizeInfinitePayHandle,
  evaluateInfinitePayPayment,
  createInfinitePayLink,
  checkInfinitePayPayment,
  resolveInfinitePayApiKey,
} from "./utils/infinitepay";
import { encryptSecret } from "./utils/integrationCrypto";
import { resolveActivePaymentGateway, registerWebhookEventOnce } from "./routers/helpers";

// ─── Mock de banco (padrão fila de resultados, igual critical.regression.test.ts) ──
const selectQueue: any[][] = [];
function enqueueSelectResult(rows: any[]) {
  selectQueue.push(rows);
}

function makeChainable(defaultResult: any = [], useSelectQueue = false) {
  const chain: any = {};
  for (const m of [
    "where", "orderBy", "limit", "offset", "groupBy", "having",
    "leftJoin", "innerJoin", "rightJoin", "fullJoin", "crossJoin",
    "returning", "onConflict", "onConflictDoUpdate", "onConflictDoNothing",
    "from", "not", "and", "or",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.values = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.then = (onFulfilled: any, onRejected: any) => {
    const result = useSelectQueue && selectQueue.length > 0 ? selectQueue.shift()! : defaultResult;
    return Promise.resolve(result).then(onFulfilled, onRejected);
  };
  chain.catch = (onRejected: any) => Promise.resolve(defaultResult).catch(onRejected);
  chain.finally = (cb: any) => Promise.resolve(defaultResult).finally(cb);
  return chain;
}

function makeFakeDb() {
  return {
    insert: vi.fn().mockReturnValue(makeChainable([{ id: 1 }])),
    update: vi.fn().mockReturnValue(makeChainable([])),
    delete: vi.fn().mockReturnValue(makeChainable([])),
    select: vi.fn().mockReturnValue(makeChainable([], true)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  vi.restoreAllMocks();
});

// ─── RN-002: valor SEMPRE em centavos inteiros ───────────────────────────────
describe("RN-002: brlToCents converte valor BRL em centavos inteiros", () => {
  it("converte decimal do Postgres (string) corretamente", () => {
    expect(brlToCents("150.00")).toBe(15000);
    expect(brlToCents("149.99")).toBe(14999);
    expect(brlToCents("0.05")).toBe(5);
    expect(brlToCents("79.90")).toBe(7990);
  });

  it("converte número corretamente (evita erro de float)", () => {
    expect(brlToCents(150)).toBe(15000);
    expect(brlToCents(19.9)).toBe(1990); // 19.9*100 = 1989.9999... → Math.round corrige
    expect(brlToCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30
  });

  it("retorna 0 para entradas inválidas sem lançar erro", () => {
    expect(brlToCents(null)).toBe(0);
    expect(brlToCents(undefined)).toBe(0);
    expect(brlToCents("")).toBe(0);
    expect(brlToCents("abc")).toBe(0);
    expect(brlToCents(NaN)).toBe(0);
  });
});

// ─── RN-006: InfiniteTag normalizada (sem $, minúsculas, chars válidos) ──────
describe("RN-006: normalizeInfinitePayHandle sanitiza a InfiniteTag", () => {
  it("remove o símbolo $ e normaliza para minúsculas", () => {
    expect(normalizeInfinitePayHandle("$MinhaEscola")).toBe("minhaescola");
    expect(normalizeInfinitePayHandle("MinhaEscola")).toBe("minhaescola");
    expect(normalizeInfinitePayHandle("  escola-01  ")).toBe("escola-01");
  });

  it("rejeita tags com caracteres inválidos ou vazias", () => {
    expect(normalizeInfinitePayHandle("")).toBeNull();
    expect(normalizeInfinitePayHandle("   ")).toBeNull();
    expect(normalizeInfinitePayHandle("minha escola")).toBeNull();
    expect(normalizeInfinitePayHandle("escola@x")).toBeNull();
    expect(normalizeInfinitePayHandle(null)).toBeNull();
    expect(normalizeInfinitePayHandle(undefined)).toBeNull();
  });
});

// ─── RN-003: baixa automática exige payment_check confirmado e valor ≥ esperado ──
describe("RN-003: evaluateInfinitePayPayment decide a baixa com segurança", () => {
  const EXPECTED = 15000; // R$ 150,00

  it("baixa liberada quando pago e valor ≥ esperado", () => {
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: true, paidAmount: 15000 })).toBe("paid");
    // Pagou com juros/multa (valor maior) — segue liberando a baixa
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: true, paidAmount: 15500 })).toBe("paid");
    // paidAmount ausente mas amount presente
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: true, amount: 15000 })).toBe("paid");
  });

  it("NÃO baixa quando pago com valor MENOR que o esperado (mismatch)", () => {
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: true, paidAmount: 10000 })).toBe("mismatch");
  });

  it("NÃO baixa quando payment_check não confirma o pagamento", () => {
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: false })).toBe("unverified");
    expect(evaluateInfinitePayPayment(EXPECTED, { success: false, paid: false })).toBe("unverified");
    expect(evaluateInfinitePayPayment(EXPECTED, { success: true, paid: true, paidAmount: 0 })).toBe("mismatch");
  });
});

// ─── RN-001: resolução do gateway ativo por escola ───────────────────────────
describe("RN-001: resolveActivePaymentGateway seleciona o gateway configurado", () => {
  const base = {
    asaasApiKey: null as string | null,
    asaasEnabled: 0,
    mpAccessToken: null as string | null,
    infinitepayHandle: null as string | null,
    infinitepayEnabled: 0,
    paymentGateway: "asaas" as string,
  };

  it("usa o InfinitePay quando selecionado e configurado", () => {
    expect(resolveActivePaymentGateway({
      ...base,
      paymentGateway: "infinitepay",
      infinitepayHandle: "minhaescola",
      infinitepayEnabled: 1,
    })).toBe("infinitepay");
  });

  it("fallback para Asaas quando InfinitePay selecionado mas sem handle", () => {
    expect(resolveActivePaymentGateway({
      ...base,
      paymentGateway: "infinitepay",
      asaasApiKey: "ak_live_x",
      asaasEnabled: 1,
    })).toBe("asaas");
  });

  it("mantém paridade: selecionado + configurado vence (MP)", () => {
    expect(resolveActivePaymentGateway({
      ...base,
      paymentGateway: "mercadopago",
      mpAccessToken: "APP_USR-x",
    })).toBe("mercadopago");
  });

  it("fallback em cascata asaas > mercadopago > infinitepay", () => {
    // Sem seleção válida, prioridade histórica asaas primeiro
    expect(resolveActivePaymentGateway({
      ...base,
      asaasApiKey: "ak",
      asaasEnabled: 1,
      mpAccessToken: "MP",
      infinitepayHandle: "escola",
      infinitepayEnabled: 1,
    })).toBe("asaas");

    expect(resolveActivePaymentGateway({
      ...base,
      mpAccessToken: "MP",
      infinitepayHandle: "escola",
      infinitepayEnabled: 1,
    })).toBe("mercadopago");

    expect(resolveActivePaymentGateway({
      ...base,
      infinitepayHandle: "escola",
      infinitepayEnabled: 1,
    })).toBe("infinitepay");
  });

  it("retorna none quando nada está configurado", () => {
    expect(resolveActivePaymentGateway(base)).toBe("none");
    expect(resolveActivePaymentGateway(null)).toBe("none");
    expect(resolveActivePaymentGateway(undefined)).toBe("none");
  });
});

// ─── Idempotência do webhook: dedup por transaction_nsu ──────────────────────
describe("Webhook InfinitePay: registerWebhookEventOnce deduplica por transaction_nsu", () => {
  it("detecta evento duplicado (mesmo transaction_nsu já registrado)", async () => {
    enqueueSelectResult([{ id: 42, status: "received" }]);
    const db = makeFakeDb();
    const res = await registerWebhookEventOnce(db, "infinitepay", "nsu-abc-123", "payment.paid", 1, {});
    expect(res.isDuplicate).toBe(true);
    expect(res.eventId).toBe(42);
  });

  it("registra evento novo quando transaction_nsu é inédito", async () => {
    enqueueSelectResult([]);
    const db = makeFakeDb();
    const res = await registerWebhookEventOnce(db, "infinitepay", "nsu-novo-456", "payment.paid", 1, { transaction_nsu: "nsu-novo-456" });
    expect(res.isDuplicate).toBe(false);
    expect(db.insert).toHaveBeenCalled();
  });

  it("falha de banco não quebra o fluxo (fail-open como no padrão atual)", async () => {
    const brokenDb = {
      select: vi.fn().mockImplementation(() => {
        throw new Error("db down");
      }),
    };
    const res = await registerWebhookEventOnce(brokenDb, "infinitepay", "nsu-x", "payment.paid");
    expect(res.isDuplicate).toBe(false);
  });
});

// ─── Integração com a API (fetch mockado — sem chamada real) ─────────────────
describe("API InfinitePay: createInfinitePayLink e checkInfinitePayPayment", () => {
  it("createInfinitePayLink monta payload com centavos e extrai slug da resposta", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.infinitepay.com.br/abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await createInfinitePayLink({
      handle: "minhaescola",
      orderNsu: "77",
      items: [{ quantity: 1, price: 15000, description: "Mensalidade 9/2026" }],
      redirectUrl: "https://app.com/obrigado",
      webhookUrl: "https://app.com/api/webhooks/infinitepay/student?dueId=77&token=segredo",
    });

    expect(res.url).toBe("https://checkout.infinitepay.com.br/abc123");
    expect(res.slug).toBe("abc123"); // fallback: último segmento da URL
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.handle).toBe("minhaescola");
    expect(payload.order_nsu).toBe("77");
    expect(payload.items[0].price).toBe(15000);
    expect(payload.webhook_url).toContain("dueId=77");
  });

  it("createInfinitePayLink lança erro controlado quando a API falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid handle",
    }));
    await expect(createInfinitePayLink({
      handle: "bad",
      orderNsu: "1",
      items: [{ quantity: 1, price: 1000, description: "x" }],
      redirectUrl: "https://app.com",
      webhookUrl: "https://app.com/w",
    })).rejects.toThrow(/\[InfinitePay\]/);
  });

  it("checkInfinitePayPayment degrada graciosamente em falha de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const res = await checkInfinitePayPayment({ handle: "escola", orderNsu: "1" });
    expect(res.success).toBe(false);
    expect(res.paid).toBe(false);
  });

  it("checkInfinitePayPayment interpreta resposta paga com centavos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, paid: true, amount: 15000, paid_amount: 15000, installments: 1, capture_method: "pix" }),
    }));
    const res = await checkInfinitePayPayment({ handle: "escola", orderNsu: "1", transactionNsu: "uuid", slug: "abc" });
    expect(res.paid).toBe(true);
    expect(res.paidAmount).toBe(15000);
    expect(res.captureMethod).toBe("pix");
  });
});

// ─── Chave da API (BYOK): paridade com Asaas/Mercado Pago ────────────────────
describe("Chave da API InfinitePay (BYOK): resolve e envia como Bearer", () => {
  const BASE_PARAMS = {
    handle: "minhaescola",
    orderNsu: "77",
    items: [{ quantity: 1, price: 15000, description: "Mensalidade 9/2026" }],
    redirectUrl: "https://app.com/obrigado",
    webhookUrl: "https://app.com/api/webhooks/infinitepay/student?dueId=77&token=segredo",
  };

  it("envia Authorization Bearer quando a chave da API está configurada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.infinitepay.com.br/abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createInfinitePayLink({ ...BASE_PARAMS, apiKey: "ip_api_key_secreta" });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["Authorization"]).toBe("Bearer ip_api_key_secreta");
    expect(init.headers["Content-Type"]).toBe("application/json");
    // A chave NUNCA vai no payload (só no header)
    expect(JSON.parse(init.body)).not.toHaveProperty("apiKey");
  });

  it("NÃO envia Authorization quando não há chave (API oficial usa apenas handle)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.infinitepay.com.br/abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createInfinitePayLink(BASE_PARAMS);
    expect(fetchMock.mock.calls[0][1].headers["Authorization"]).toBeUndefined();

    await createInfinitePayLink({ ...BASE_PARAMS, apiKey: null });
    expect(fetchMock.mock.calls[1][1].headers["Authorization"]).toBeUndefined();
  });

  it("resolveInfinitePayApiKey descriptografa valor cifrado (roundtrip AES-256-GCM)", () => {
    const encrypted = encryptSecret("ip_live_minha_chave");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(resolveInfinitePayApiKey(encrypted)).toBe("ip_live_minha_chave");
  });

  it("resolveInfinitePayApiKey mantém texto puro legado e trata nulos", () => {
    expect(resolveInfinitePayApiKey("ip_legacy_plain_key")).toBe("ip_legacy_plain_key");
    expect(resolveInfinitePayApiKey(null)).toBeNull();
    expect(resolveInfinitePayApiKey(undefined)).toBeNull();
    expect(resolveInfinitePayApiKey("")).toBeNull();
  });
});
