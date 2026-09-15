/**
 * FERRAMENTAS DA RECEPCIONISTA VIRTUAL — testes das Fases 1+2 do PRD
 * "Evolução do Sistema de Atendimento WhatsApp".
 *
 * Cobre: canonicalização de JID (RF-005), parser/limpeza de ACTIONs,
 * ferramentas de consulta com dados reais (RF-001/002) e regras do prompt
 * (RN-001..004: proibição de "número de matrícula", limite de coleta etc.).
 */
import { describe, expect, it, vi } from "vitest";
import { canonicalizeWaPhone } from "./utils/whatsapp";
import { parseToolActions, stripToolMarkers, executeChatbotTool, generateAvailableSlots } from "./utils/chatbotTools";
import { getAttendancePrompt } from "./utils/aiPrompts";

// ─── Mock de banco (padrão encadeável com fila, igual critical.regression) ───
function makeFakeDb(selectQueue: any[][]) {
  const makeChainable = (): any => {
    const chain: any = {};
    for (const m of ["where", "orderBy", "limit", "offset", "from"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (onFulfilled: any, onRejected: any) => {
      const rows = selectQueue.length > 0 ? selectQueue.shift()! : [];
      return Promise.resolve(rows).then(onFulfilled, onRejected);
    };
    return chain;
  };
  return {
    select: vi.fn().mockImplementation(() => makeChainable()),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

describe("RF-005 — chave canônica de sessão (JID com/sem 9º dígito)", () => {
  it("insere o 9º dígito no formato BR antigo (12 dígitos)", () => {
    expect(canonicalizeWaPhone("553399958830")).toBe("5533999958830");
  });

  it("mantém números BR já com 9º dígito (13 dígitos)", () => {
    expect(canonicalizeWaPhone("5533999958830")).toBe("5533999958830");
  });

  it("mantém números não-BR inalterados", () => {
    expect(canonicalizeWaPhone("13051234567")).toBe("13051234567");
  });

  it("ambas as variantes do MESMO contato geram a MESMA chave", () => {
    expect(canonicalizeWaPhone("553399958830@s.whatsapp.net".split("@")[0]))
      .toBe(canonicalizeWaPhone("5533999958830@s.whatsapp.net".split("@")[0]));
  });
});

describe("Parser e limpeza de ACTIONs de consulta", () => {
  it("extrai múltiplas ações com argumentos JSON", () => {
    const text = 'Um instante! 🎵<!--ACTION:LOOKUP_STUDENT {"name":"Iatsa"}--> <!--ACTION:GET_FREE_SLOTS {}-->';
    const actions = parseToolActions(text);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ name: "LOOKUP_STUDENT", args: { name: "Iatsa" } });
    expect(actions[1].name).toBe("GET_FREE_SLOTS");
  });

  it("aceita ESCALATE_HUMAN com atributo reason e sem argumentos", () => {
    const withReason = parseToolActions('Não consegui...<!--ACTION:ESCALATE_HUMAN reason="cadastro nao localizado"-->');
    expect(withReason).toHaveLength(1);
    expect(withReason[0].name).toBe("ESCALATE_HUMAN");
    expect(withReason[0].args).toEqual({ reason: "cadastro nao localizado" });

    const bare = parseToolActions("<!--ACTION:ESCALATE_HUMAN-->");
    expect(bare[0].args).toEqual({});
  });

  it("ignora ACTION desconhecida e JSON malformado", () => {
    const text = '<!--ACTION:DROP_TABLE {"x":1}--> <!--ACTION:GET_MY_DUES {"studentId":broken}-->';
    expect(parseToolActions(text)).toHaveLength(0);
  });

  it("stripToolMarkers remove todos os comentários técnicos", () => {
    const clean = stripToolMarkers("Oi! 🎵<!--ACTION:LOOKUP_STUDENT {\"name\":\"a\"}--> Tudo bem?<!--ACTION:ESCALATE_HUMAN-->");
    expect(clean).toBe("Oi! 🎵 Tudo bem?");
  });
});

describe("RF-001/002 — execução das ferramentas com dados reais", () => {
  const baseCtx = {
    organizationId: 1,
    professorUserId: 163,
    contactStudentId: null as number | null,
    schoolHours: '{"monday":{"active":true,"start":"08:00","end":"18:00"}}',
    lessonDuration: 60,
  };

  it("GET_MY_DUES sem vínculo e sem studentId → avisa que o contato não tem cadastro", async () => {
    const db = makeFakeDb([]);
    const result = await executeChatbotTool(db, { ...baseCtx, contactStudentId: null }, "GET_MY_DUES", {});
    expect(result).toContain("não está vinculado");
  });

  it("LOOKUP_STUDENT retorna candidatos com ID (busca por nome)", async () => {
    const db = makeFakeDb([[{ id: 344, name: "Iatsa Barbosa" }]]);
    const result = await executeChatbotTool(db, baseCtx, "LOOKUP_STUDENT", { name: "Iatsa" });
    expect(result).toContain("ID 344");
    expect(result).toContain("Iatsa Barbosa");
  });

  it("GET_MY_DUES com pendências formata valor real e vencimento", async () => {
    const db = makeFakeDb([
      [{ id: 344 }], // validação do studentId
      [{ id: 1, amount: "200.00", dueDate: "2026-09-15", status: "pendente" }], // dues
    ]);
    const result = await executeChatbotTool(db, { ...baseCtx, contactStudentId: null }, "GET_MY_DUES", { studentId: 344 });
    expect(result).toContain("R$ 200,00");
    expect(result).toContain("15/09/2026");
  });

  it("GET_MY_DUES sem pendências → aluno em dia", async () => {
    const db = makeFakeDb([[{ id: 344 }], []]);
    const result = await executeChatbotTool(db, baseCtx, "GET_MY_DUES", { studentId: 344 });
    expect(result).toContain("EM DIA");
  });

  it("studentId de OUTRA organização é rejeitado (isolamento de dados)", async () => {
    const db = makeFakeDb([[]]); // validação não encontra o aluno
    const result = await executeChatbotTool(db, { ...baseCtx, contactStudentId: null }, "GET_NEXT_LESSONS", { studentId: 999 });
    expect(result).toContain("não está vinculado");
  });

  it("GET_FREE_SLOTS gera horários a partir da configuração da escola", () => {
    const slots = generateAvailableSlots(baseCtx.schoolHours);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].label).toMatch(/Seg/); // próximo dia útil ativo
  });
});

describe("RN-001..004 — regras anti-alucinação no prompt da recepcionista", () => {
  const input = {
    schoolName: "WR Escola de Música",
    isStudent: true,
    studentName: "Iatsa",
    nowInfo: "terça-feira, 25/08",
  };

  it("documenta as ferramentas de consulta reais", () => {
    const p = getAttendancePrompt(input);
    expect(p).toContain("LOOKUP_STUDENT");
    expect(p).toContain("GET_MY_DUES");
    expect(p).toContain("ESCALATE_HUMAN");
  });

  it("proíbe pedir número de matrícula (dado inexistente)", () => {
    const p = getAttendancePrompt(input);
    expect(p).toContain('PROIBIDO pedir "número de matrícula"');
  });

  it("limita coleta a uma pergunta e exige escala humana depois", () => {
    const p = getAttendancePrompt(input);
    expect(p).toContain("NO MÁXIMO UMA pergunta de esclarecimento");
  });

  it("proíbe tratar aluna declarada como lead (link de matrícula)", () => {
    const p = getAttendancePrompt(input);
    expect(p).toContain("NUNCA ofereça link de matrícula");
  });
});
