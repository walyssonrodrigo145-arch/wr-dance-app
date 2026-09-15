import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
// AGENDA FIX — testes da remarcação pelo portal do aluno:
// 1. getTeacherSchedule usa professor efetivo + fallback de horários quando a
//    escola não configurou "Horário de Funcionamento" (remarcação morta antes);
// 2. autoReschedule valida conflito e horário futuro no servidor.
const selectQueue: any[][] = [];
function enqueueSelectResult(rows: any[]) {
  selectQueue.push(rows);
}

function makeChain(defaultResult: any = [], useSelectQueue = false) {
  const chain: any = {};
  const selfReturning = [
    "where", "orderBy", "limit", "offset", "groupBy", "having",
    "leftJoin", "innerJoin", "rightJoin", "fullJoin", "crossJoin",
    "returning", "onConflict", "onConflictDoUpdate", "onConflictDoNothing",
    "from", "not", "and", "or",
  ];
  for (const m of selfReturning) {
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

const insertCalls: Array<{ table: any; values: any }> = [];
const updateCalls: Array<{ table: any; sets: any[] }> = [];

function makeFakeDb() {
  return {
    insert: vi.fn((table: any) => {
      const c = makeChain([{ id: 1 }]);
      const origValues = c.values;
      c.values = (vals: any) => {
        insertCalls.push({ table, values: vals });
        return origValues(vals);
      };
      return c;
    }),
    update: vi.fn((table: any) => {
      const c = makeChain([]);
      const entry = { table, sets: [] as any[] };
      updateCalls.push(entry);
      const origSet = c.set;
      c.set = (vals: any) => {
        entry.sets.push(vals);
        return origSet(vals);
      };
      return c;
    }),
    delete: vi.fn(() => makeChain([])),
    select: vi.fn(() => makeChain([], true)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

let currentDb: ReturnType<typeof makeFakeDb>;

vi.mock("./db", () => ({
  getDb: vi.fn(async () => currentDb),
}));

vi.mock("./_core/notification", () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOwner: vi.fn(async () => ({ success: true })),
}));

function makeStudentContext(): TrpcContext {
  return {
    user: {
      id: 50,
      openId: "student-user",
      email: "aluno@test.com",
      name: "Aluno Teste",
      loginMethod: "manus",
      role: "aluno",
      organizationId: 1,
      studentId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// Aula em uma quarta-feira às 13:00 BRT (16:00 UTC)
function makeLessonRow(overrides: any = {}) {
  return {
    id: 7,
    organizationId: 1,
    userId: 2, // criador: admin (sem vínculo de professor)
    studentId: 1,
    title: "Violão",
    scheduledAt: new Date("2026-09-02T16:00:00.000Z"), // qua 13:00 BRT
    duration: 60,
    status: "agendada",
    lessonType: "individual",
    studioRoomId: null,
    ...overrides,
  };
}

describe("portal do aluno — remarcação (agenda)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertCalls.length = 0;
    updateCalls.length = 0;
    currentDb = makeFakeDb();
  });

  it("getTeacherSchedule usa o professor efetivo do aluno (não o criador admin)", async () => {
    const ctx = makeStudentContext();
    const caller = appRouter.createCaller(ctx);
    // Fila: [aula], [professorId do aluno], [settings do professor], [aulas ocupadas]
    enqueueSelectResult([makeLessonRow()]);
    enqueueSelectResult([{ professorId: 5 }]);
    enqueueSelectResult([{ schoolHours: '{"monday":{"active":true,"start":"08:00","end":"18:00"}}', schoolPhone: "11999990000", phone: "" }]);
    enqueueSelectResult([]);
    const result = await caller.studentPortal.getTeacherSchedule({ lessonId: 7 });
    expect(result.teacherPhone).toBe("11999990000");
    expect(Array.isArray(result.bookedSlots)).toBe(true);
  });

  it("getTeacherSchedule gera horários sintéticos quando a escola não configurou horários (fallback)", async () => {
    const ctx = makeStudentContext();
    const caller = appRouter.createCaller(ctx);
    // Fila: [aula], [professorId], [settings VAZIAS do professor], [settings VAZIAS do criador], [aulas ocupadas]
    enqueueSelectResult([makeLessonRow()]);
    enqueueSelectResult([{ professorId: 5 }]);
    enqueueSelectResult([null]);
    enqueueSelectResult([null]);
    enqueueSelectResult([]);
    const result = await caller.studentPortal.getTeacherSchedule({ lessonId: 7 });
    const hours = result.schoolHours as any;
    // Fallback: apenas o dia da semana da aula fica ativo, com o horário da aula
    expect(hours.wednesday.active).toBe(true);
    expect(hours.monday.active).toBe(false);
    expect(hours.wednesday.start).toBe("13:00"); // horário da aula em BRT
    // Janela cobre a duração + 1 slot de 30min
    expect(hours.wednesday.end).toBe("14:30");
  });

  it("autoReschedule REJEITA horário no passado (BAD_REQUEST)", async () => {
    const ctx = makeStudentContext();
    const caller = appRouter.createCaller(ctx);
    // Fila: [aula do aluno] — validação de data ocorre logo após a aula
    enqueueSelectResult([makeLessonRow()]);
    await expect(
      caller.studentPortal.autoReschedule({
        lessonId: 7,
        newDateIso: new Date(Date.now() - 86400000).toISOString(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("autoReschedule REJEITA conflito com outra aula do professor (CONFLICT)", async () => {
    const ctx = makeStudentContext();
    const caller = appRouter.createCaller(ctx);
    const futureDate = new Date(Date.now() + 3 * 86400000);
    futureDate.setHours(14, 0, 0, 0);
    // Fila: [aula do aluno], [professorId do aluno], [aulas existentes no dia]
    enqueueSelectResult([makeLessonRow({ scheduledAt: futureDate })]);
    enqueueSelectResult([{ professorId: 5 }]);
    enqueueSelectResult([
      { id: 99, scheduledAt: futureDate, duration: 60, lessonType: "individual", userId: 5, studioRoomId: null, studentProfessorId: null },
    ]);
    await expect(
      caller.studentPortal.autoReschedule({ lessonId: 7, newDateIso: futureDate.toISOString() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("autoReschedule permite horário livre e atualiza a aula + cancela lembretes", async () => {
    const ctx = makeStudentContext();
    const caller = appRouter.createCaller(ctx);
    const futureDate = new Date(Date.now() + 3 * 86400000);
    futureDate.setHours(15, 0, 0, 0);
    const currentDate = new Date(Date.now() + 2 * 86400000); // horário atual da aula ≠ novo horário
    currentDate.setHours(10, 0, 0, 0);
    // Fila: [aula], [professorId], [aulas existentes = vazia],
    // [nome do aluno p/ notificação], [whatsapp: settings], [whatsapp: professor], [extras async]
    enqueueSelectResult([makeLessonRow({ scheduledAt: currentDate })]);
    enqueueSelectResult([{ professorId: 5 }]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ name: "Aluno Teste" }]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const result = await caller.studentPortal.autoReschedule({ lessonId: 7, newDateIso: futureDate.toISOString() });
    expect(result).toHaveProperty("success", true);

    // Aula atualizada com novo horário e status agendada
    const lessonUpdate = updateCalls.find((u) => u.table && (u.table as any).getSQL && JSON.stringify(u.sets[0] ?? {}).includes("scheduledAt"));
    expect(lessonUpdate).toBeTruthy();

    // Lembretes pendentes cancelados
    const reminderUpdate = updateCalls.find((u) => u.table && JSON.stringify(u.sets[0] ?? {}).includes("cancelado"));
    expect(reminderUpdate).toBeTruthy();

    // Notificação criada para o professor
    const notificationInsert = insertCalls.find((c) => c.table && JSON.stringify(c.values ?? {}).includes("Reagendada"));
    expect(notificationInsert).toBeTruthy();
  });
});
