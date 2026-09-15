import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.DATABASE_URL = "postgres://dummy:dummy@localhost:5432/dummy";
});

import { BillingEngine, SchoolBillingSettings } from "./BillingEngine";

describe("BillingEngine - Financial Calculation Tests", () => {
  const defaultSettings: SchoolBillingSettings = {
    lateFeeEnabled: true,
    lateFeeType: "percentage",
    lateFeeValue: 2.0, // 2%
    interestEnabled: true,
    interestType: "daily",
    interestRate: 0.33, // 0.33% ao dia
    graceDays: 3,
    autoUpdateInvoice: true,
    showFeeBreakdown: true,
  };

  it("deve retornar valor original para cobrança em dia", () => {
    const today = new Date(2026, 6, 29);
    const dueDate = new Date(2026, 6, 30); // Vencimento amanhã

    const invoice = {
      id: 1,
      amount: "200.00",
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "pendente",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, today);

    expect(res.originalAmount).toBe(200.0);
    expect(res.daysOverdue).toBe(0);
    expect(res.lateFeeAmount).toBe(0);
    expect(res.interestAmount).toBe(0);
    expect(res.updatedAmount).toBe(200.0);
  });

  it("não deve cobrar juros ou multa dentro do período de carência", () => {
    const today = new Date(2026, 6, 29);
    const dueDate = new Date(2026, 6, 27); // 2 dias de atraso (carência é 3)

    const invoice = {
      id: 2,
      amount: "200.00",
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "pendente",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, today);

    expect(res.daysOverdue).toBe(0);
    expect(res.lateFeeAmount).toBe(0);
    expect(res.interestAmount).toBe(0);
    expect(res.updatedAmount).toBe(200.0);
  });

  it("deve aplicar multa de 2% e juros diários de 0.33% quando ultrapassar a carência", () => {
    const today = new Date(2026, 6, 29);
    const dueDate = new Date(2026, 6, 24); // 5 dias de atraso (> 3 dias de carência)

    const invoice = {
      id: 3,
      amount: "200.00",
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "pendente",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, today);

    // Multa: 200 * 2% = R$ 4,00
    // Juros: 200 * (0.33 / 100) * 5 dias = R$ 3,30
    // Total Atualizado: 200 + 4 + 3.30 = R$ 207.30
    expect(res.daysOverdue).toBe(5);
    expect(res.lateFeeAmount).toBe(4.0);
    expect(res.interestAmount).toBe(3.3);
    expect(res.updatedAmount).toBe(207.3);
  });

  it("deve suportar multa fixa e juros ao mês", () => {
    const today = new Date(2026, 6, 29);
    const dueDate = new Date(2026, 5, 29); // 30 dias de atraso

    const settingsFixedMonthly: SchoolBillingSettings = {
      ...defaultSettings,
      lateFeeType: "fixed",
      lateFeeValue: 10.0, // R$ 10,00 fixo
      interestType: "monthly",
      interestRate: 1.0, // 1% ao mês
      graceDays: 0,
    };

    const invoice = {
      id: 4,
      amount: "500.00",
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "pendente",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, settingsFixedMonthly, today);

    // Multa: R$ 10,00
    // Juros: 500 * 1% * (30/30) = R$ 5,00
    // Total: 500 + 10 + 5 = 515.00
    expect(res.daysOverdue).toBe(30);
    expect(res.lateFeeAmount).toBe(10.0);
    expect(res.interestAmount).toBe(5.0);
    expect(res.updatedAmount).toBe(515.0);
  });

  it("deve manter valor pago inalterado para cobrança com status pago", () => {
    const today = new Date(2026, 6, 29);
    const dueDate = new Date(2026, 5, 1);

    const invoice = {
      id: 5,
      amount: "200.00",
      dueDate: dueDate.toISOString().slice(0, 10),
      status: "pago",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, today);

    expect(res.daysOverdue).toBe(0);
    expect(res.lateFeeAmount).toBe(0);
    expect(res.interestAmount).toBe(0);
    expect(res.updatedAmount).toBe(200.0);
  });

  // AUDIT-06 FIX: cobre o caminho de desconto por antecipação (earlyDiscount),
  // que não tinha nenhum caso de teste e nunca fora exercitado com dados reais.
  it("AUDIT-06: deve aplicar desconto antecipado dentro da janela configurada", () => {
    const settingsWithDiscount: SchoolBillingSettings = {
      ...defaultSettings,
      earlyDiscountEnabled: true,
      earlyDiscountType: "percentage",
      earlyDiscountValue: 5.0, // 5%
      earlyDiscountDays: 7, // janela mínima de 7 dias antes do vencimento
    };

    const invoice = {
      id: 6,
      amount: "200.00",
      dueDate: "2026-07-30",
      status: "pendente",
    };

    // Pagando 10 dias antes (10 >= 7) → desconto de 5% = R$ 10,00
    const resEarly = BillingEngine.computeInvoiceAmounts(invoice, settingsWithDiscount, new Date(2026, 6, 20));
    expect(resEarly.daysOverdue).toBe(0);
    expect(resEarly.lateFeeAmount).toBe(0);
    expect(resEarly.interestAmount).toBe(0);
    expect(resEarly.earlyDiscountAmount).toBe(10.0);
    expect(resEarly.updatedAmount).toBe(190.0);

    // Fora da janela (2 dias antes < 7) → SEM desconto
    const resInsideWindow = BillingEngine.computeInvoiceAmounts(invoice, settingsWithDiscount, new Date(2026, 6, 28));
    expect(resInsideWindow.earlyDiscountAmount).toBe(0);
    expect(resInsideWindow.updatedAmount).toBe(200.0);

    // No próprio dia do vencimento com janela 7 → sem desconto (0 < 7)
    const resOnDueDate = BillingEngine.computeInvoiceAmounts(invoice, settingsWithDiscount, new Date(2026, 6, 30));
    expect(resOnDueDate.earlyDiscountAmount).toBe(0);
    expect(resOnDueDate.updatedAmount).toBe(200.0);

    // Janela 0 → desconto vale inclusive no dia do vencimento
    const resZeroWindow = BillingEngine.computeInvoiceAmounts(
      invoice,
      { ...settingsWithDiscount, earlyDiscountDays: 0 },
      new Date(2026, 6, 30)
    );
    expect(resZeroWindow.earlyDiscountAmount).toBe(10.0);
    expect(resZeroWindow.updatedAmount).toBe(190.0);
  });

  // BUG-FIX (Financeiro): cobrança PAGA com desconto antecipado deve expor
  // o valor original da mensalidade E o valor pago com desconto aplicado.
  it("deve expor o desconto aplicado quando a cobrança está paga com desconto", () => {
    const today = new Date(2026, 6, 20);
    const invoice = {
      id: 7,
      amount: "190.00",         // valor efetivamente pago (5% de desconto)
      originalAmount: "200.00", // valor cheio da mensalidade
      dueDate: "2026-07-30",
      status: "pago",
    };

    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, today);
    expect(res.originalAmount).toBe(200.0);
    expect(res.updatedAmount).toBe(190.0);
    expect(res.earlyDiscountAmount).toBe(10.0);
    expect(res.totalDiscount).toBe(10.0);
  });

  it("cobrança paga sem valor original não inventa desconto", () => {
    const invoice = {
      id: 8,
      amount: "200.00",
      dueDate: "2026-07-30",
      status: "pago",
    };
    const res = BillingEngine.computeInvoiceAmounts(invoice, defaultSettings, new Date(2026, 6, 20));
    expect(res.originalAmount).toBe(200.0);
    expect(res.updatedAmount).toBe(200.0);
    expect(res.earlyDiscountAmount).toBe(0);
  });
});
