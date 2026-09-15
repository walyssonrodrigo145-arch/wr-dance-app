/**
 * CRITICAL REGRESSION — suíte de regressão da auditoria geral (AUDIT-P0/P1).
 * Cada teste protege uma correção aplicada. Se algum teste falhar, um bug
 * crítico da auditoria REGREDIU.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { ENV } from "./_core/env";
import { parseBRL, formatBRL } from "../client/src/lib/money";

// ─── Mock de banco (padrão fila de resultados, igual music.test.ts) ──────────
const selectQueue: any[][] = [];
function enqueueSelectResult(rows: any[]) {
  selectQueue.push(rows);
}
let lastDb: any = null;

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
  const db: any = {
    insert: vi.fn().mockReturnValue(makeChainable([{ id: 1 }])),
    update: vi.fn().mockReturnValue(makeChainable([])),
    delete: vi.fn().mockReturnValue(makeChainable([])),
    select: vi.fn().mockReturnValue(makeChainable([], true)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockImplementation(async (fn: any) => fn(makeFakeDb())),
  };
  lastDb = db;
  return db;
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockImplementation(async () => makeFakeDb()),
  getSettingsByUserId: vi.fn().mockResolvedValue(null),
  upsertSettings: vi.fn().mockResolvedValue(undefined),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function makeUserCtx(overrides: Partial<any> = {}): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "regression-user",
      email: "director@escola.com",
      name: "Director",
      loginMethod: "local",
      role: "admin",
      organizationId: 1,
      studentId: null,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  lastDb = null;
});

// ─── 1. Backdoor de login removido ──────────────────────────────────────────
describe("AUDIT-P0: backdoor de senha master removido do login", () => {
  const GOOD_PASSWORD = "SenhaForte123";

  function enqueueUser(email: string) {
    enqueueSelectResult([{
      id: 7,
      openId: "regression-user",
      email,
      name: "Director",
      passwordHash: hashPassword(GOOD_PASSWORD),
      role: "admin",
      organizationId: 1,
      studentId: null,
      isEmailVerified: true,
    }]);
  }

  function loginCtx(email: string): TrpcContext {
    return {
      user: null,
      req: { protocol: "https", headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } } as any,
      res: { clearCookie: vi.fn(), cookie: vi.fn() } as any,
    };
  }

  it("aceita login com senha correta", async () => {
    enqueueUser("ok1@escola.com");
    const caller = appRouter.createCaller(loginCtx("ok1@escola.com"));
    const result = await caller.auth.login({ email: "ok1@escola.com", password: GOOD_PASSWORD });
    expect(result.success).toBe(true);
  });

  it("REJEITA a senha master hardcoded 'Walysson2003@' (backdoor antigo)", async () => {
    enqueueUser("bd1@escola.com");
    const caller = appRouter.createCaller(loginCtx("bd1@escola.com"));
    await expect(
      caller.auth.login({ email: "bd1@escola.com", password: "Walysson2003@" })
    ).rejects.toThrow(/Credenciais inválidas/i);
  });

  it("REJEITA a senha master hardcoded 'Walysson@MasterAdmin2026' (backdoor antigo)", async () => {
    enqueueUser("bd2@escola.com");
    const caller = appRouter.createCaller(loginCtx("bd2@escola.com"));
    await expect(
      caller.auth.login({ email: "bd2@escola.com", password: "Walysson@MasterAdmin2026" })
    ).rejects.toThrow(/Credenciais inválidas/i);
  });

  it("sem SUPER_ADMIN_PASSWORD no ambiente, a senha master fica desativada para QUALQUER conta", async () => {
    expect(ENV.superAdminPassword).toBe(""); // ambiente de teste não define a senha
    // Mesmo um e-mail de super admin (via env) não loga sem senha válida da conta
    enqueueUser("owner@wrmusicpro.com.br");
    const caller = appRouter.createCaller(loginCtx("owner@wrmusicpro.com.br"));
    await expect(
      caller.auth.login({ email: "owner@wrmusicpro.com.br", password: "Walysson2003@" })
    ).rejects.toThrow(/Credenciais inválidas/i);
  });
});

// ─── 2. Super admin exclusivamente via env ───────────────────────────────────
describe("AUDIT-P0: super admin vem exclusivamente de variáveis de ambiente", () => {
  it("ENV.superAdminEmails não contém e-mails hardcoded", () => {
    // No ambiente de teste nenhuma variável SUPER_ADMIN_EMAIL(S) é definida
    expect(ENV.superAdminEmails).toEqual([]);
  });

  it("e-mail que era hardcoded NÃO tem mais acesso ao superAdminRouter", async () => {
    const ctx = makeUserCtx({ email: "walyssonrodrigo145@gmail.com" });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.superAdmin.getDashboardStats()).rejects.toThrow();
  });
});

// ─── 3. Idempotência financeira ──────────────────────────────────────────────
describe("AUDIT-P1: markPaid é idempotente", () => {
  it("mensalidade JÁ paga retorna alreadyPaid e NÃO executa updates", async () => {
    // select 0: middleware de assinatura (org ativa)
    enqueueSelectResult([{ subscriptionStatus: "active", trialEndsAt: new Date(Date.now() + 86400000) }]);
    // select 1: mensalidade já paga
    enqueueSelectResult([{ id: 12, status: "pago", asaasId: null, organizationId: 1, amount: "150.00" }]);
    const caller = appRouter.createCaller(makeUserCtx());
    const result = await caller.paymentDues.markPaid({ id: 12 });
    expect(result).toEqual({ success: true, alreadyPaid: true });
    expect(lastDb.update).not.toHaveBeenCalled();
  });
});

describe("AUDIT-P1: paymentDues.create rejeita mensalidade duplicada", () => {
  it("não cria 2 mensalidades para o mesmo aluno/mês/ano", async () => {
    // select 0: middleware de assinatura (org ativa)
    enqueueSelectResult([{ subscriptionStatus: "active", trialEndsAt: new Date(Date.now() + 86400000) }]);
    // select 1: ownedStudent (posse do aluno)
    enqueueSelectResult([{ id: 5, name: "Aluno", email: null, phone: "", cpf: null }]);
    // select 2: duplicata existente
    enqueueSelectResult([{ id: 10, status: "pendente" }]);

    const caller = appRouter.createCaller(makeUserCtx());
    await expect(
      caller.paymentDues.create({
        studentId: 5,
        amount: 150,
        dueDate: "2026-09-10",
        month: 9,
        year: 2026,
      })
    ).rejects.toThrow(/Já existe uma mensalidade/i);
    expect(lastDb.insert).not.toHaveBeenCalled();
  });
});

// ─── 4. Webhook WhatsApp exige token ────────────────────────────────────────
describe("AUDIT-P0: webhook WhatsApp autenticado", () => {
  // Timeout ampliado: o import dinâmico do webhook (firebaseAdmin, db, gemini...)
  // acontece dentro do teste e, sob execução paralela da suíte, o event loop fica
  // congestionado — o teste estourava o padrão de 5s sem ser falha de lógica.
  it("sem token → 401; token errado → 401; token correto → processa", async () => {
    expect(ENV.whatsappWebhookToken).toBe("test-webhook-secret");
    const whatsappWebhook = (await import("./webhooks/whatsapp")).default;

    const callWebhook = (headers: any, body: any) =>
      new Promise<{ status?: number; body?: any }>((resolve) => {
        const res: any = {
          statusCode: 200,
          status(code: number) { this.statusCode = code; return this; },
          json(payload: any) { resolve({ status: this.statusCode, body: payload }); return this; },
          end() { resolve({ status: this.statusCode, body: null }); return this; },
        };
        const req: any = {
          method: "POST",
          url: "/",
          headers,
          body,
          query: {},
          get: (h: string) => headers[h.toLowerCase()],
        };
        whatsappWebhook(req as any, res as any, () => resolve({ status: 404 }));
      });

    // Sem token
    let r = await callWebhook({}, { event: "IGNORED" });
    expect(r.status).toBe(401);

    // Token errado
    r = await callWebhook({ "x-webhook-token": "wrong" }, { event: "IGNORED" });
    expect(r.status).toBe(401);

    // Token correto → passa do gate (evento ignorado responde 200)
    r = await callWebhook({ "x-webhook-token": "test-webhook-secret" }, { event: "IGNORED" });
    expect(r.status).toBe(200);
  }, 20000);
});

// ─── 5. Parsing monetário do client ─────────────────────────────────────────
describe("AUDIT-P1: parseBRL/formatBRL (integridade monetária no client)", () => {
  it("parseBRL trata formatos pt-BR sem perda de magnitude", () => {
    expect(parseBRL("1.234,56")).toBe(1234.56);
    expect(parseBRL("R$ 1.234,56")).toBe(1234.56);
    expect(parseBRL("1234.56")).toBe(1234.56);
    expect(parseBRL(1234.56)).toBe(1234.56);
    expect(parseBRL("49,90")).toBe(49.9);
  });

  it("parseBRL retorna 0 para entradas inválidas (nunca NaN)", () => {
    expect(parseBRL("")).toBe(0);
    expect(parseBRL(null)).toBe(0);
    expect(parseBRL(undefined)).toBe(0);
    expect(parseBRL("abc")).toBe(0);
  });

  it("formatBRL exibe R$ 1.234,56 no padrão pt-BR", () => {
    expect(formatBRL(1234.56)).toContain("1.234,56");
    expect(formatBRL("150.00")).toContain("150,00");
  });
});

// ─── 6. auth.me não vaza segredos ───────────────────────────────────────────
describe("AUDIT-P1: auth.me não expõe passwordHash/tokens", () => {
  it("retorna usuário sem passwordHash, verificationToken e resetPasswordToken", async () => {
    const caller = appRouter.createCaller(makeUserCtx({ passwordHash: "x:y", verificationToken: "v", resetPasswordToken: "r" }));
    const me: any = await caller.auth.me();
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).not.toHaveProperty("verificationToken");
    expect(me).not.toHaveProperty("resetPasswordToken");
    expect(me.name).toBe("Director");
  });
});

// ─── 7. Rate Limiter Persistente WhatsApp e Idempotência Webhook ────────────
describe("AUDIT-P1: Rate Limit Persistente de WhatsApp e Idempotência de Webhook", () => {
  it("checkAndIncrementWhatsAppRateLimit bloqueia envio ao atingir maxPerHour", async () => {
    const { checkAndIncrementWhatsAppRateLimit } = await import("./routers/helpers");
    const fakeDb = makeFakeDb();
    
    // Simula janela com 30 mensagens já enviadas
    enqueueSelectResult([{ id: 1, organizationId: 1, messageCount: 30 }]);
    const allowed = await checkAndIncrementWhatsAppRateLimit(fakeDb, 1, 10, 30);
    expect(allowed).toBe(false);
  });

  it("registerWebhookEventOnce identifica eventos duplicados de gateways", async () => {
    const { registerWebhookEventOnce } = await import("./routers/helpers");
    const fakeDb = makeFakeDb();

    // Primeiro evento inédito (select vazio)
    enqueueSelectResult([]);
    const firstCall = await registerWebhookEventOnce(fakeDb, "asaas", "evt_12345", "PAYMENT_RECEIVED", 1);
    expect(firstCall.isDuplicate).toBe(false);

    // Segundo evento idêntico já gravado (select retorna linha)
    enqueueSelectResult([{ id: 99, status: "received" }]);
    const secondCall = await registerWebhookEventOnce(fakeDb, "asaas", "evt_12345", "PAYMENT_RECEIVED", 1);
    expect(secondCall.isDuplicate).toBe(true);
    expect(secondCall.eventId).toBe(99);
  });
});

