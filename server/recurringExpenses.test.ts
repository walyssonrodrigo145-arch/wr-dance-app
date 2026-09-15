import { describe, expect, it, vi, beforeEach } from "vitest";
// DESPESAS FIXAS — geração automática no virar do mês:
// 1. Clona despesas 'mensal' para o mês corrente (status pendente);
// 2. Não duplica lançamentos já existentes no mês (dedup por descrição);
// 3. Clamp de dia (dia 31 em mês de 30 dias → último dia do mês);
// 4. Guard mensal: segunda chamada no mesmo mês não gera nada.
const selectQueue: any[][] = [];
function enqueueSelectResult(rows: any[]) {
  selectQueue.push(rows);
}

const insertCalls: Array<{ table: any; values: any }> = [];

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
    update: vi.fn(() => makeChain([])),
    delete: vi.fn(() => makeChain([])),
    select: vi.fn(() => makeChain([], true)),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

let currentDb: ReturnType<typeof makeFakeDb>;

vi.mock("./db", () => ({
  getDb: vi.fn(async () => currentDb),
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
}));

const TEMPLATES = [
  {
    organizationId: 1, userId: 1, description: "Aluguel da Sala", supplier: "Imobiliária",
    account: "PJ", recurrence: "mensal", amount: "1500.00", date: "2026-05-31",
    category: "Aluguel", notes: null,
  },
  {
    organizationId: 1, userId: 1, description: "Internet", supplier: "Vivo",
    account: "PJ", recurrence: "mensal", amount: "99.90", date: "2026-05-10",
    category: "Utilidades", notes: null,
  },
];

describe("despesas fixas — geração automática (virada de mês)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertCalls.length = 0;
    currentDb = makeFakeDb();
  });

  it("gera despesas fixas do mês corrente com dedup por descrição", async () => {
    const { runRecurringExpensesMaintenance, resetRecurringExpensesGuardForTests } = await import("./services/RecurringExpenseEngine");
    resetRecurringExpensesGuardForTests();
    // now = setembro/2026; fila: [templates], [existentes em setembro → só Aluguel]
    enqueueSelectResult(TEMPLATES);
    enqueueSelectResult([{ description: "Aluguel da Sala" }]);
    const count = await runRecurringExpensesMaintenance(new Date("2026-09-05T12:00:00Z"));
    expect(count).toBe(1);
    expect(insertCalls.length).toBe(1);
    const values = insertCalls[0].values;
    expect(values.description).toBe("Internet");
    expect(values.status).toBe("pendente");
    expect(values.recurrence).toBe("mensal");
    expect(values.date).toBe("2026-09-10"); // mesmo dia do template
  });

  it("clampa dia 31 para o último dia de meses curtos", async () => {
    const { runRecurringExpensesMaintenance, resetRecurringExpensesGuardForTests } = await import("./services/RecurringExpenseEngine");
    resetRecurringExpensesGuardForTests();
    // now = abril/2026 (30 dias); nenhum lançamento existente
    enqueueSelectResult(TEMPLATES);
    enqueueSelectResult([]);
    const count = await runRecurringExpensesMaintenance(new Date("2026-04-02T12:00:00Z"));
    expect(count).toBe(2);
    const aluguel = insertCalls.find((c) => c.values.description === "Aluguel da Sala");
    expect(aluguel!.values.date).toBe("2026-04-30"); // 31 → clamp 30
  });

  it("guard mensal: segunda chamada no mesmo mês não gera nada", async () => {
    const { runRecurringExpensesMaintenance, resetRecurringExpensesGuardForTests } = await import("./services/RecurringExpenseEngine");
    resetRecurringExpensesGuardForTests();
    enqueueSelectResult(TEMPLATES);
    enqueueSelectResult([]);
    await runRecurringExpensesMaintenance(new Date("2026-04-02T12:00:00Z"));
    // Segunda chamada no mesmo mês — guard impede novas consultas/inserts
    selectQueue.length = 0;
    const count = await runRecurringExpensesMaintenance(new Date("2026-04-20T12:00:00Z"));
    expect(count).toBe(0);
    expect(insertCalls.length).toBe(2); // apenas as da primeira chamada
  });

  it("clampDayToMonth cobre fevereiro e anos bissextos", async () => {
    const { clampDayToMonth } = await import("./services/RecurringExpenseEngine");
    expect(clampDayToMonth(2026, 2, 31)).toBe(28); // 2026 não é bissexto
    expect(clampDayToMonth(2028, 2, 31)).toBe(29); // 2028 é bissexto
    expect(clampDayToMonth(2026, 12, 31)).toBe(31);
  });
});
