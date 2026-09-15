/**
 * TOMADA HUMANA DO WHATSAPP — testes da pausa automática do robô quando o
 * professor responde manualmente (PRD "Pausa Automática do Bot WhatsApp").
 *
 * Cobre:
 * 1. Registro de envios do bot (eco × resposta manual) — utils/whatsapp
 * 2. Janela de resfriamento de 24h (humanTakeoverActive) — webhooks/whatsapp
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

import { registerBotSend, isRecentBotMessage, normalizeWaPhone } from "./utils/whatsapp";

describe("Registro de envios do bot (eco × manual)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconhece eco por messageId", () => {
    registerBotSend("prof_1", "5531999998888@s.whatsapp.net".split("@")[0], "MSG-123", "Olá! Menu");
    expect(isRecentBotMessage("prof_1", "5531999998888", "MSG-123", "")).toBe(true);
  });

  it("reconhece eco por hash do texto quando messageId difere", () => {
    registerBotSend("prof_1", "31999998888", "", "Digite MENU para voltar");
    expect(isRecentBotMessage("prof_1", "5531999998888", "OUTRO-ID", "Digite MENU para voltar")).toBe(true);
  });

  it("não reconhece mensagem manual do professor (sem registro)", () => {
    expect(isRecentBotMessage("prof_1", "5531999998888", "MANUAL-1", "sua aula mudou pra sexta")).toBe(false);
  });

  it("não cruza contatos diferentes nem instâncias diferentes", () => {
    registerBotSend("prof_1", "31988887777", "MSG-X", "oi");
    expect(isRecentBotMessage("prof_1", "31977776666", "MSG-X", "oi")).toBe(false);
    registerBotSend("prof_2", "31988887777", "MSG-Y", "oi");
    expect(isRecentBotMessage("prof_1", "31988887777", "MSG-Y", "oi")).toBe(false);
  });

  it("professor digitando o MESMO texto recente do bot (ids distintos) = manual, não eco", () => {
    registerBotSend("prof_1", "31999998888", "BOT-ID-1", "Sua aula é sexta!");
    expect(isRecentBotMessage("prof_1", "31999998888", "PROF-ID-1", "Sua aula é sexta!")).toBe(false);
    // e o eco real continua reconhecido
    expect(isRecentBotMessage("prof_1", "31999998888", "BOT-ID-1", "Sua aula é sexta!")).toBe(true);
  });

  it("expira após a janela TTL (eco velho vira 'manual')", () => {
    registerBotSend("prof_1", "31999998888", "MSG-TTL", "menu antigo");
    vi.setSystemTime(new Date(Date.now() + 20 * 60 * 1000)); // +20 min > TTL 15 min
    expect(isRecentBotMessage("prof_1", "31999998888", "MSG-TTL", "menu antigo")).toBe(false);
  });

  it("normaliza telefone com e sem 55/DDD", () => {
    expect(normalizeWaPhone("31 99999-8888")).toBe("5531999998888");
    expect(normalizeWaPhone("+5531999998888")).toBe("5531999998888");
    expect(normalizeWaPhone("")).toBe("");
  });
});

describe("Resfriamento de 24h da tomada humana (RN-003/RN-004)", () => {
  const importWebhook = () => import("./webhooks/whatsapp");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Timeout ampliado: o import dinâmico do webhook (firebaseAdmin, db, gemini...)
  // é pesado e, sob execução paralela da suíte, estoura os 5s padrão
  // (mesmo padrão adotado em critical.regression.test.ts).
  it("pausa ativa dentro de 24h da resposta manual", async () => {
    const { humanTakeoverActive } = await importWebhook();
    vi.setSystemTime(new Date("2026-08-26T11:00:00Z")); // +23h
    expect(
      humanTakeoverActive({ pausedBy: "professor_manual", lastHumanReplyAt: new Date("2026-08-25T12:00:00Z").toISOString() })
    ).toBe(true);
  }, 20000);

  it("pausa expira após 24h — MENU volta a reativar o robô", async () => {
    const { humanTakeoverActive } = await importWebhook();
    vi.setSystemTime(new Date("2026-08-26T13:00:00Z")); // +25h
    expect(
      humanTakeoverActive({ pausedBy: "professor_manual", lastHumanReplyAt: new Date("2026-08-25T12:00:00Z").toISOString() })
    ).toBe(false);
  }, 20000);

  it("pausa pedida pelo ALUNO (opção 0) nunca conta como tomada humana", async () => {
    const { humanTakeoverActive } = await importWebhook();
    expect(humanTakeoverActive({ pausedBy: "aluno", lastHumanReplyAt: new Date().toISOString() })).toBe(false);
    expect(humanTakeoverActive({})).toBe(false);
    expect(humanTakeoverActive(null)).toBe(false);
    expect(humanTakeoverActive({ pausedBy: "professor_manual" })).toBe(false); // sem timestamp
  }, 20000);
});
