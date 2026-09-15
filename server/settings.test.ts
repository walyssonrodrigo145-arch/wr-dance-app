import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db helpers
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getSettingsByUserId: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      phone: "11999990000",
      bio: "Professor de violão",
      schoolName: "Escola Harmonia",
      schoolAddress: "Rua das Flores, 100",
      schoolCity: "São Paulo",
      schoolPhone: "1133334444",
      schoolWebsite: "https://harmonia.com",
      schoolDescription: "Escola de música completa",
      notifyLessonReminder: 1,
      notifyPaymentDue: 1,
      notifyStudentAbsence: 1,
      notifyNewStudent: 1,
      notifyWeeklyReport: 0,
      theme: "light",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    upsertSettings: vi.fn().mockResolvedValue(null),
    updateUserProfile: vi.fn().mockResolvedValue({ id: 1, name: "Novo Nome", email: "novo@email.com" }),
    // updateSchool espelha dados na tabela organizations via getDb(); sem Postgres
    // local no ambiente de teste, o postgres-js entra em retry infinito (ECONNREFUSED)
    // e o teste estoura o timeout. Mockar getDb → null faz o teste cobrir só o upsertSettings.
    getDb: vi.fn().mockResolvedValue(null),
  };
});

function createCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "Professor Teste",
      email: "professor@teste.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("settings.get", () => {
  it("retorna as configurações do usuário autenticado", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.get();
    expect(result).not.toBeNull();
    expect(result?.schoolName).toBe("Escola Harmonia");
    expect(result?.notifyLessonReminder).toBe(1);
  });
});

describe("settings.updateProfile", () => {
  it("atualiza perfil com nome, email, telefone e bio", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.updateProfile({
      name: "Novo Nome",
      email: "novo@email.com",
      phone: "11988887777",
      bio: "Novo bio",
    });
    expect(result).toEqual({ success: true });
  });

  it("rejeita email inválido", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.settings.updateProfile({ email: "nao-e-email" })
    ).rejects.toThrow();
  });
});

describe("settings.updateSchool", () => {
  it("atualiza dados da escola com sucesso", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.updateSchool({
      schoolName: "Nova Escola",
      schoolCity: "Rio de Janeiro",
      schoolPhone: "2133334444",
      schoolWebsite: "https://novaescola.com",
      schoolDescription: "Escola nova",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("settings.updateNotifications", () => {
  it("salva preferências de notificação", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.updateNotifications({
      notifyLessonReminder: true,
      notifyPaymentDue: false,
      notifyStudentAbsence: true,
      notifyNewStudent: false,
      notifyWeeklyReport: true,
    });
    expect(result).toEqual({ success: true });
  });
});

describe("settings.updateTheme", () => {
  it("salva tema light", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.updateTheme({ theme: "light" });
    expect(result).toEqual({ success: true });
  });

  it("salva tema dark", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.settings.updateTheme({ theme: "dark" });
    expect(result).toEqual({ success: true });
  });

  it("rejeita tema inválido", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.settings.updateTheme({ theme: "blue" as "light" | "dark" })
    ).rejects.toThrow();
  });
});
