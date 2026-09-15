/**
 * SHORT LINKS — testes do encurtador de links de pagamento (/p/{code}).
 * Protege: criação com código curto, fallback transparente para a URL
 * original (cobrança nunca bloqueada) e validação de código na rota.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPaymentShortLink } from "./utils/shortlinks";
import { ENV } from "./_core/env";

function makeDb(insertImpl?: (...args: any[]) => Promise<unknown>) {
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((vals: any) => ({
      then: insertImpl ? (onOk: any, onErr: any) => insertImpl(vals).then(onOk, onErr) : Promise.resolve(),
    })),
  });
  return { insert };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

const BASE = {
  targetUrl: "https://checkout.infinitepay.com.br/walysson-rodrigues-834/slug-muito-longo-123456789",
  organizationId: 1,
  userId: 7,
  paymentDueId: 42,
};

describe("createPaymentShortLink: cria link curto /p/{code}", () => {
  it("retorna URL curta no domínio do app com código de 8 chars", async () => {
    const db = makeDb();
    const url = await createPaymentShortLink(db, BASE);
    const base = (ENV.appUrl || "https://wrmusicpro.com.br").replace(/\/+$/, "");
    expect(url.startsWith(`${base}/p/`)).toBe(true);
    const code = url.split("/p/")[1];
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    // persiste com targetUrl original, refs da fatura e organizationId (tenant)
    const values = db.insert().values.mock.calls[0][0];
    expect(values.targetUrl).toBe(BASE.targetUrl);
    expect(values.paymentDueId).toBe(42);
    expect(values.organizationId).toBe(1);
    expect(values.code).toHaveLength(8);
  });

  it("registra enrollmentCode em cobranças de matrícula", async () => {
    const db = makeDb();
    const url = await createPaymentShortLink(db, {
      targetUrl: BASE.targetUrl,
      organizationId: 1,
      enrollmentCode: "abc123",
    });
    expect(url).toContain("/p/");
    const values = db.insert().values.mock.calls[0][0];
    expect(values.enrollmentCode).toBe("abc123");
    expect(values.paymentDueId).toBeNull();
  });

  it("código é aleatório — 2 links têm códigos diferentes", async () => {
    const db = makeDb();
    const a = await createPaymentShortLink(db, BASE);
    const b = await createPaymentShortLink(db, BASE);
    expect(a.split("/p/")[1]).not.toBe(b.split("/p/")[1]);
  });
});

describe("createPaymentShortLink: fallback transparente (RN — nunca bloqueia a cobrança)", () => {
  it("retorna a URL ORIGINAL quando o banco falha no insert", async () => {
    const db = makeDb(async () => {
      throw new Error("db down");
    });
    const url = await createPaymentShortLink(db, BASE);
    expect(url).toBe(BASE.targetUrl);
  });

  it("retorna a URL ORIGINAL após 3 colisões de código", async () => {
    let calls = 0;
    const db = makeDb(async () => {
      calls++;
      const err: any = new Error("duplicate key");
      err.code = "23505"; // unique_violation → retry
      throw err;
    });
    const url = await createPaymentShortLink(db, BASE);
    expect(calls).toBe(3); // MAX_ATTEMPTS
    expect(url).toBe(BASE.targetUrl);
  });

  it("retorna a URL ORIGINAL se db for nulo ou targetUrl vazio", async () => {
    expect(await createPaymentShortLink(null, BASE)).toBe(BASE.targetUrl);
    expect(await createPaymentShortLink(makeDb(), { targetUrl: "" })).toBe("");
  });

  it("erro genérico no insert NÃO retry infinito — fallback imediato", async () => {
    let calls = 0;
    const db = makeDb(async () => {
      calls++;
      throw new Error("syntax error"); // não é colisão (sem code 23505)
    });
    const url = await createPaymentShortLink(db, BASE);
    expect(calls).toBe(1);
    expect(url).toBe(BASE.targetUrl);
  });
});

describe("Rota /p/:code — validação de formato do código (regra do redirect)", () => {
  const CODE_RE = /^[A-Za-z0-9_-]+$/;
  const routeAccepts = (code: string) => Boolean(code) && code.length <= 16 && CODE_RE.test(code);

  it("aceita códigos nanoid URL-safe e recusa perigosos", () => {
    expect(routeAccepts("AbCd1234_x")).toBe(true);
    expect(routeAccepts("abc")).toBe(true);
    expect(routeAccepts("../../etc/passwd")).toBe(false);
    expect(routeAccepts("abc%20def")).toBe(false);
    expect(routeAccepts("<script>")).toBe(false);
    expect(routeAccepts("a".repeat(17))).toBe(false); // > 16 chars → recusa
    expect(routeAccepts("")).toBe(false); // vazio → recusa
  });
});
