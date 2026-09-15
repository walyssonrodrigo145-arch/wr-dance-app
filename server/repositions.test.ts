import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  lessons,
  lessonRepositions,
  repositionReasons,
  repositionPolicies,
  repositionEvents,
  students,
} from "../drizzle/schema";
import {
  computeExpirationDate,
  canScheduleCredit,
  normalizePolicy,
  resolveInitialCreditStatus,
} from "./services/RepositionService";

// ─── Fake DB encadeável (drizzle-like) para testar o router sem Postgres ─────

type RowMap = Map<any, any[]>;

function makeFakeDb(rows: RowMap) {
  const inserts: Array<{ table: any; values: any }> = [];
  const updates: Array<{ table: any; values: any }> = [];
  const getRows = (table: any) => rows.get(table) || [];

  const db: any = {
    select: () => {
      let current: any = null;
      const chain: any = {
        from: (t: any) => {
          current = t;
          return chain;
        },
        leftJoin: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve([...getRows(current)]),
        then: (resolve: any, reject: any) => Promise.resolve([...getRows(current)]).then(resolve, reject),
        catch: (fn: any) => Promise.resolve([...getRows(current)]).catch(fn),
      };
      return chain;
    },
    insert: (t: any) => ({
      values: (v: any) => {
        inserts.push({ table: t, values: v });
        return {
          returning: () => Promise.resolve([{ id: 999 }]),
          then: (resolve: any) => resolve({ count: 1 }),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        updates.push({ table: t, values: v });
        return {
          where: () => Promise.resolve({ count: 1 }),
          then: (resolve: any) => resolve({ count: 1 }),
        };
      },
    }),
    delete: () => ({
      where: () => Promise.resolve({ count: 1 }),
    }),
  };
  return { db, inserts, updates };
}

const h = vi.hoisted(() => ({ state: { db: null as any } }));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(async () => h.state.db),
    getSettingsByUserId: vi.fn(async () => null),
  };
});

function createCtx(overrides: Partial<any> = {}): TrpcContext {
  return {
    user: {
      id: 5,
      openId: "test-open-id",
      name: "Professor Teste",
      email: "professor@teste.com",
      loginMethod: "manus",
      role: "admin",
      organizationId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["req"],
  } as TrpcContext;
}

const BASE_LESSON = {
  id: 10,
  userId: 5,
  status: "agendada",
  scheduledAt: new Date("2026-09-01T10:00:00"),
  duration: 60,
  studentId: 100,
  studentName: "Alice",
  studentUserId: 200,
  studentProfessorId: 5,
  studentInstrumentId: 3,
};

const VALID_REASON = { id: 7, organizationId: 1, name: "Professor faltou", active: true, generatesCredit: true };
const NO_CREDIT_REASON = { id: 8, organizationId: 1, name: "Falta não justificada", active: true, generatesCredit: false };
const IMMEDIATE_POLICY = { id: 1, organizationId: 1, expirationDays: 30, expirationUnit: "dias", creditRelease: "imediata" };
const CONTRACT_POLICY = { id: 1, organizationId: 1, expirationDays: 15, expirationUnit: "dias", creditRelease: "fim_contrato" };

// ─── Regras puras (RepositionService) ────────────────────────────────────────

describe("RepositionService — regras puras", () => {
  it("calcula expiração em dias/semanas/meses", () => {
    const base = new Date("2026-09-10T12:00:00");
    expect(computeExpirationDate(base, { expirationDays: 30, expirationUnit: "dias", creditRelease: "imediata" }).toISOString()).toBe(
      new Date("2026-10-10T12:00:00").toISOString()
    );
    expect(computeExpirationDate(base, { expirationDays: 2, expirationUnit: "semanas", creditRelease: "imediata" }).getDate()).toBe(24);
    expect(computeExpirationDate(base, { expirationDays: 1, expirationUnit: "meses", creditRelease: "imediata" }).getMonth()).toBe(9);
  });

  it("normaliza política inválida para o padrão", () => {
    const p = normalizePolicy({ expirationDays: -5, expirationUnit: "horas" as any, creditRelease: "x" as any });
    expect(p).toEqual({ expirationDays: 30, expirationUnit: "dias", creditRelease: "imediata" });
  });

  it("política fim_contrato gera crédito bloqueado sem validade; imediata gera disponível com validade", () => {
    const now = new Date();
    const blocked = resolveInitialCreditStatus(CONTRACT_POLICY, now);
    expect(blocked.status).toBe("aguardando_liberacao");
    expect(blocked.expiresAt).toBeNull();

    const free = resolveInitialCreditStatus(IMMEDIATE_POLICY, now);
    expect(free.status).toBe("disponivel");
    expect(free.expiresAt!.getTime() - now.getTime()).toBeCloseTo(30 * 24 * 3600 * 1000, -3);
  });

  it("canScheduleCredit bloqueia: aguardando liberação, expirado e status inválido", () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);

    expect(canScheduleCredit({ status: "aguardando_liberacao", expiresAt: null }).ok).toBe(false);
    expect(canScheduleCredit({ status: "disponivel", expiresAt: past }).ok).toBe(false);
    expect(canScheduleCredit({ status: "agendada", expiresAt: future }).ok).toBe(false);
    expect(canScheduleCredit({ status: "realizada", expiresAt: future }).ok).toBe(false);
    expect(canScheduleCredit({ status: "disponivel", expiresAt: future }).ok).toBe(true);
  });
});

// ─── Fluxos tRPC (isolamento, duplicação, liberação, consumo) ────────────────

beforeEach(() => {
  h.state.db = null as any;
});

describe("repositions.createFromLesson", () => {
  it("bloqueia acesso a aula de outra escola (isolamento multi-tenant)", async () => {
    const { db } = makeFakeDb(new Map([[lessons, []]])); // aula não pertence à org do usuário
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.repositions.createFromLesson({ lessonId: 10, reasonId: 7 })).rejects.toThrow(
      "Aula não encontrada ou você não tem permissão."
    );
  });

  it("nunca gera crédito duplicado para a mesma aula", async () => {
    const { db, inserts } = makeFakeDb(
      new Map([
        [lessons, [BASE_LESSON]],
        [lessonRepositions, [{ id: 55, lessonId: 10, organizationId: 1 }]],
        [repositionReasons, [VALID_REASON]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.repositions.createFromLesson({ lessonId: 10, reasonId: 7 })).rejects.toThrow(
      "Já existe um crédito de reposição para esta aula."
    );
    expect(inserts.filter((i) => i.table === lessonRepositions)).toHaveLength(0);
  });

  it("rejeita motivo que não gera direito à reposição", async () => {
    const { db } = makeFakeDb(
      new Map([
        [lessons, [BASE_LESSON]],
        [lessonRepositions, []],
        [repositionReasons, [NO_CREDIT_REASON]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.repositions.createFromLesson({ lessonId: 10, reasonId: 8 })).rejects.toThrow(
      "Este motivo não gera direito à reposição."
    );
  });

  it("liberação imediata: gera crédito disponível, marca aula a_repor e registra histórico", async () => {
    const { db, inserts, updates } = makeFakeDb(
      new Map([
        [lessons, [BASE_LESSON]],
        [lessonRepositions, []],
        [repositionReasons, [VALID_REASON]],
        [repositionPolicies, [IMMEDIATE_POLICY]],
        [repositionEvents, []],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repositions.createFromLesson({ lessonId: 10, reasonId: 7, notes: "reposição" });

    expect(result.status).toBe("disponivel");
    const credit = inserts.find((i) => i.table === lessonRepositions);
    expect(credit).toBeDefined();
    expect(credit.values.status).toBe("disponivel");
    expect(credit.values.organizationId).toBe(1);
    expect(credit.values.expiresAt).toBeInstanceOf(Date);
    const lessonUpdate = updates.find((u) => u.table === lessons);
    expect(lessonUpdate.values.status).toBe("a_repor");
    const event = inserts.find((i) => i.table === repositionEvents);
    expect(event.values.type).toBe("criado");
  });

  it("liberação no fim do contrato: crédito aguardando liberação, sem data limite", async () => {
    const { db, inserts } = makeFakeDb(
      new Map([
        [lessons, [BASE_LESSON]],
        [lessonRepositions, []],
        [repositionReasons, [VALID_REASON]],
        [repositionPolicies, [CONTRACT_POLICY]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repositions.createFromLesson({ lessonId: 10, reasonId: 7 });

    expect(result.status).toBe("aguardando_liberacao");
    const credit = inserts.find((i) => i.table === lessonRepositions);
    expect(credit.values.status).toBe("aguardando_liberacao");
    expect(credit.values.expiresAt).toBeNull();
    expect(credit.values.releasedAt).toBeNull();
  });
});

describe("repositions.schedule — gate do crédito", () => {
  const buildScheduleDb = (repositionRow: any, extra: RowMap = new Map()) => {
    const rows: RowMap = new Map([
      [lessonRepositions, [repositionRow]],
      [lessons, []],
      [students, [{ id: 100, name: "Alice", professorId: 5, instrumentId: 3, studentUserId: 200 }]],
    ]);
    extra.forEach((v, k) => rows.set(k, v));
    return makeFakeDb(rows);
  };

  it("bloqueia agendamento de crédito aguardando liberação (com mensagem clara)", async () => {
    const { db, inserts } = buildScheduleDb({
      id: 1, organizationId: 1, status: "aguardando_liberacao", expiresAt: null, lessonId: 10, studentId: 100,
    });
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repositions.schedule({ id: 1, scheduledAt: new Date("2026-10-01T10:00:00").toISOString() })
    ).rejects.toThrow("aguardando liberação");
    expect(inserts.filter((i) => i.table === lessons)).toHaveLength(0);
  });

  it("bloqueia agendamento de crédito expirado", async () => {
    const { db } = buildScheduleDb({
      id: 1, organizationId: 1, status: "disponivel", expiresAt: new Date(Date.now() - 86400000), lessonId: 10, studentId: 100,
    });
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.repositions.schedule({ id: 1, scheduledAt: new Date("2026-10-01T10:00:00").toISOString() })
    ).rejects.toThrow("expirou");
  });

  it("agenda com sucesso: cria aula de reposição e marca crédito como agendada", async () => {
    const { db, inserts, updates } = buildScheduleDb({
      id: 1, organizationId: 1, status: "disponivel", expiresAt: new Date(Date.now() + 86400000), lessonId: 10, studentId: 100, originalDuration: 60,
    });
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repositions.schedule({
      id: 1,
      scheduledAt: new Date("2026-10-01T10:00:00").toISOString(),
      duration: 45,
    });
    expect(result.success).toBe(true);
    const newLesson = inserts.find((i) => i.table === lessons);
    expect(newLesson).toBeDefined();
    expect(newLesson.values.title).toContain("Reposição");
    expect(newLesson.values.organizationId).toBe(1);
    expect(newLesson.values.duration).toBe(45);
    const creditUpdate = updates.find((u) => u.table === lessonRepositions);
    expect(creditUpdate.values.status).toBe("agendada");
  });

  it("professor sem vínculo com o aluno não agenda (permissão)", async () => {
    const { db, inserts } = buildScheduleDb({
      id: 1, organizationId: 1, status: "disponivel", expiresAt: new Date(Date.now() + 86400000), lessonId: 10, studentId: 100,
    });
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx({ role: "professor", id: 77 }));
    await expect(
      caller.repositions.schedule({ id: 1, scheduledAt: new Date("2026-10-01T10:00:00").toISOString() })
    ).rejects.toThrow("permissão");
    expect(inserts.filter((i) => i.table === lessons)).toHaveLength(0);
  });
});

describe("repositions.complete — consumo do crédito", () => {
  it("realiza a reposição e consome o crédito (não volta para disponível)", async () => {
    const { db, updates } = makeFakeDb(
      new Map([
        [lessonRepositions, [{ id: 1, organizationId: 1, status: "agendada", scheduledLessonId: 42, studentId: 100 }]],
        [students, [{ id: 100, professorId: 5 }]],
        [lessons, []],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.repositions.complete({ id: 1, notes: "ok" });
    expect(result.success).toBe(true);
    const creditUpdate = updates.find((u) => u.table === lessonRepositions);
    expect(creditUpdate.values.status).toBe("realizada");
    expect(creditUpdate.values.completedAt).toBeInstanceOf(Date);
    const lessonUpdate = updates.find((u) => u.table === lessons);
    expect(lessonUpdate.values.status).toBe("concluida");
  });

  it("não permite concluir reposição que não está agendada", async () => {
    const { db } = makeFakeDb(
      new Map([
        [lessonRepositions, [{ id: 1, organizationId: 1, status: "disponivel", scheduledLessonId: null, studentId: 100 }]],
        [students, [{ id: 100, professorId: 5 }]],
      ])
    );
    h.state.db = db;
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.repositions.complete({ id: 1 })).rejects.toThrow("Somente reposições agendadas");
  });
});
