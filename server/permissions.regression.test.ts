import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { organizations } from "../drizzle/schema";

// ─── AUDITORIA P0 (Fase 0): regressão de permissões ─────────────────────────
// Garante que aluno/professor NÃO executam procedures administrativas e que o
// paywall de assinatura vale para todos os papéis (não só admin/professor).

function makeChain(defaultResult: any = []) {
  const chain: any = {};
  const selfReturning = [
    "where", "orderBy", "limit", "offset", "groupBy", "having",
    "leftJoin", "innerJoin", "rightJoin", "fullJoin", "crossJoin",
    "returning", "onConflict", "onConflictDoUpdate", "onConflictDoNothing",
    "from", "not", "and", "or",
  ];
  for (const m of selfReturning) chain[m] = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.then = (ok: any, err: any) => Promise.resolve(defaultResult).then(ok, err);
  chain.catch = (err: any) => Promise.resolve(defaultResult).catch(err);
  chain.finally = (cb: any) => Promise.resolve(defaultResult).finally(cb);
  return chain;
}

let orgRow: any = { subscriptionStatus: "active", trialEndsAt: null };

function makeFakeDb() {
  return {
    insert: vi.fn(() => makeChain([{ id: 1 }])),
    update: vi.fn(() => makeChain([])),
    delete: vi.fn(() => makeChain([])),
    execute: vi.fn(async () => ({ rows: [] })),
    select: vi.fn(() => {
      const c = makeChain([]);
      const origFrom = c.from;
      c.from = (table: any) => {
        if (table === organizations) return makeChain([orgRow]);
        return origFrom(table);
      };
      return c;
    }),
  };
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => makeFakeDb()),
}));

vi.mock("./_core/notification", () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOwner: vi.fn(async () => ({ success: true })),
}));

function makeCtx(role: "aluno" | "professor" | "admin"): TrpcContext {
  return {
    user: {
      id: role === "aluno" ? 50 : 10,
      openId: `${role}-user`,
      email: `${role}@test.com`,
      name: `Usuário ${role}`,
      loginMethod: "manus",
      role,
      organizationId: 1,
      studentId: role === "aluno" ? 1 : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  orgRow = { subscriptionStatus: "active", trialEndsAt: null };
});

describe("permissões — aluno NÃO acessa módulos administrativos", () => {
  it.each([
    ["expenses.create", () => appRouter.createCaller(makeCtx("aluno")).expenses.create({} as any)],
    ["announcements.create", () => appRouter.createCaller(makeCtx("aluno")).announcements.create({} as any)],
    ["reminders.list", () => appRouter.createCaller(makeCtx("aluno")).reminders.list()],
    ["reminderTemplates.list", () => appRouter.createCaller(makeCtx("aluno")).reminderTemplates.list()],
    ["professorPayments.getHistory", () => appRouter.createCaller(makeCtx("aluno")).professorPayments.getHistory({} as any)],
    ["studioRooms.create", () => appRouter.createCaller(makeCtx("aluno")).studioRooms.create({} as any)],
    ["instruments.create", () => appRouter.createCaller(makeCtx("aluno")).instruments.create({} as any)],
    ["schoolPlans.create", () => appRouter.createCaller(makeCtx("aluno")).schoolPlans.create({} as any)],
    ["contractTemplates.delete", () => appRouter.createCaller(makeCtx("aluno")).contractTemplates.delete({} as any)],
    ["advancedAi.applySmartSchedule", () => appRouter.createCaller(makeCtx("aluno")).advancedAi.applySmartSchedule({} as any)],
    ["attendance.generateToken", () => appRouter.createCaller(makeCtx("aluno")).attendance.generateToken()],
    ["reschedule.respond", () => appRouter.createCaller(makeCtx("aluno")).reschedule.respond({} as any)],
    ["whatsapp.startSession", () => appRouter.createCaller(makeCtx("aluno")).whatsapp.startSession()],
    ["automations.create", () => appRouter.createCaller(makeCtx("aluno")).automations.create({} as any)],
  ])("%s → FORBIDDEN", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("contracts.my continua acessível ao aluno (leitura própria)", async () => {
    const result = await appRouter.createCaller(makeCtx("aluno")).contracts.my();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("permissões — professor NÃO acessa administração financeira", () => {
  it.each([
    ["expenses.create", () => appRouter.createCaller(makeCtx("professor")).expenses.create({} as any)],
    ["professorPayments.getDetails", () => appRouter.createCaller(makeCtx("professor")).professorPayments.getDetails({} as any)],
    ["contractTemplates.update", () => appRouter.createCaller(makeCtx("professor")).contractTemplates.update({} as any)],
    ["schoolPlans.delete", () => appRouter.createCaller(makeCtx("professor")).schoolPlans.delete({} as any)],
    ["studioRooms.delete", () => appRouter.createCaller(makeCtx("professor")).studioRooms.delete({} as any)],
    ["automations.toggle", () => appRouter.createCaller(makeCtx("professor")).automations.toggle({} as any)],
    ["advancedAi.applySmartSchedule", () => appRouter.createCaller(makeCtx("professor")).advancedAi.applySmartSchedule({} as any)],
  ])("%s → FORBIDDEN", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("paywall de assinatura vale para todos os papéis", () => {
  it("aluno de escola bloqueada recebe FORBIDDEN", async () => {
    orgRow = { subscriptionStatus: "canceled", trialEndsAt: new Date("2020-01-01") };
    await expect(
      appRouter.createCaller(makeCtx("aluno")).contracts.my()
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("bloqueado") });
  });

  it("professor de escola bloqueada recebe FORBIDDEN até no módulo de aulas", async () => {
    orgRow = { subscriptionStatus: "canceled", trialEndsAt: null };
    await expect(
      appRouter.createCaller(makeCtx("professor")).turmas.myTurmas()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aluno de trial vigente segue com acesso", async () => {
    orgRow = { subscriptionStatus: "trialing", trialEndsAt: new Date(Date.now() + 86400000) };
    const result = await appRouter.createCaller(makeCtx("aluno")).contracts.my();
    expect(Array.isArray(result)).toBe(true);
  });
});
