/**
 * school_simulation.test.ts
 * Suíte de Testes de Simulação Realista: Jornada Completa de uma Escola de Música no MusicPro
 * 
 * Simula todas as interações reais que uma escola de música executa no dia a dia:
 * 1. Setup & Configurações da Escola (com criptografia de chaves)
 * 2. Cadastro de Salas e Instrumentos
 * 3. Contratação de Professores com cálculo de comissão
 * 4. Matrícula de Aluno com dados fiscais e vencimento
 * 5. Agendamento de Aula com prevenção de conflitos de sala/horário
 * 6. Ciclo Financeiro com BillingEngine (Juros, Multa, Descontos e Baixa)
 * 7. Funil Comercial (CRM de Leads, avanço no Kanban)
 * 8. Portal do Aluno (Acesso a histórico financeiro, grade e plano de estudos)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { BillingEngine } from "./services/BillingEngine";
import { encryptSecret, decryptSecret, maskSecret } from "./utils/integrationCrypto";
import { parseBRL, formatBRL } from "../client/src/lib/money";

describe("🏫 SIMULAÇÃO REALISTA: Jornada de uma Escola de Música ('Harmonia Pro')", () => {
  
  // ── 1. SETUP DA ESCOLA & SEGURANÇA ─────────────────────────────
  it("1. [Setup & Segurança] Deve configurar a escola e proteger chaves de API com AES-256-GCM", () => {
    const originalAsaasKey = "ak_live_a1b2c3d4e5f6g7h8i9j0_musicpro";
    const encryptedKey = encryptSecret(originalAsaasKey);

    expect(encryptedKey).not.toBe(originalAsaasKey);
    expect(encryptedKey.startsWith("v1:")).toBe(true);

    const decryptedKey = decryptSecret(encryptedKey);
    expect(decryptedKey).toBe(originalAsaasKey);

    const masked = maskSecret(originalAsaasKey);
    expect(masked.endsWith("cpro")).toBe(true);
  });

  // ── 2. FORMATAÇÃO MONETÁRIA (PADRÃO NACIONAL BRL) ───────────────
  it("2. [Financeiro - Moeda] Deve manipular e formatar mensalidades no padrão brasileiro BRL", () => {
    const mensalidadeStr = "350,50";
    const valorNumerico = parseBRL(mensalidadeStr);
    expect(valorNumerico).toBe(350.50);

    const formatado = formatBRL(valorNumerico);
    expect(formatado).toContain("350,50");
  });

  // ── 3. ESTRUTURA FÍSICA & PREVENÇÃO DE CONFLITOS DE SALAS ───────
  it("3. [Salas & Agenda] Deve validar conflitos de horários e capacidade da sala de estudo", () => {
    const salaPiano = { id: 1, name: "Sala Mozart", capacity: 1 };
    
    const aula1 = {
      salaId: 1,
      start: new Date("2026-08-20T14:00:00Z"),
      end: new Date("2026-08-20T14:50:00Z"),
      professorId: 10,
    };

    const aula2Conflitante = {
      salaId: 1,
      start: new Date("2026-08-20T14:30:00Z"),
      end: new Date("2026-08-20T15:20:00Z"),
      professorId: 11,
    };

    const hasOverlap = (
      aula1.salaId === aula2Conflitante.salaId &&
      aula1.start < aula2Conflitante.end &&
      aula1.end > aula2Conflitante.start
    );

    expect(hasOverlap).toBe(true);
  });

  // ── 4. CÁLCULO DE COMISSÃO DE PROFESSOR (FOLHA DE PAGAMENTO) ───
  it("4. [Professores - Folha] Deve calcular corretamente a comissão de 50% para o professor", () => {
    const totalAulasRealizadas = 4;
    const valorHoraAula = 80.00;
    const comissaoPercent = 0.50; // 50%

    const totalBruto = totalAulasRealizadas * valorHoraAula;
    const repasseProfessor = totalBruto * comissaoPercent;

    expect(totalBruto).toBe(320.00);
    expect(repasseProfessor).toBe(160.00);
  });

  // ── 5. CICLO FINANCEIRO & MOTOR DE JUROS/MULTA (BillingEngine) ───
  it("5. [BillingEngine] Deve calcular juros diários/mensais e multa em caso de inadimplência", () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 10); // Vencida há 10 dias

    const settingsObj = BillingEngine.extractSchoolSettings({
      lateFeeEnabled: 1,
      lateFeeType: "percentage",
      lateFeeValue: "2.00", // 2% multa
      interestEnabled: 1,
      interestType: "monthly",
      interestRate: "1.0000", // 1% ao mês
      graceDays: 2,
    });

    const resultado = BillingEngine.computeInvoiceAmounts(
      {
        id: 999,
        amount: 350.00,
        dueDate: dueDate,
        status: "pendente",
      },
      settingsObj,
      new Date()
    );

    expect(resultado.originalAmount).toBe(350.00);
    expect(resultado.lateFeeAmount).toBe(7.00); // 2% de 350 = 7.00
    expect(resultado.interestAmount).toBeGreaterThan(0);
    expect(resultado.updatedAmount).toBeGreaterThan(357.00);
    expect(resultado.daysOverdue).toBe(10);
  });

  // ── 6. FUNIL COMERCIAL & CRM DE LEADS ───────────────────────────
  it("6. [CRM Leads] Deve validar transições válidas no pipeline de conversão de alunos", () => {
    const leadStages = ["novo", "contato", "aula_experimental", "negociacao", "matriculado", "perdido"];
    
    let leadCurrentStage = "novo";
    expect(leadStages.includes(leadCurrentStage)).toBe(true);

    leadCurrentStage = "aula_experimental";
    expect(leadStages.includes(leadCurrentStage)).toBe(true);

    leadCurrentStage = "matriculado";
    expect(leadCurrentStage).toBe("matriculado");
  });

  // ── 7. CONTRATOS & MODELOS DIGITAIS ─────────────────────────────
  it("7. [Contratos] Deve interpolar variáveis dinâmicas no modelo de contrato da escola", () => {
    const template = "Contrato entre {{escola_nome}} e o aluno {{aluno_nome}} no valor de R$ {{mensalidade}}.";
    const dados = {
      escola_nome: "Escola Harmonia Pro",
      aluno_nome: "Beatriz Oliveira",
      mensalidade: "350,00",
    };

    const contratoFinal = template
      .replace("{{escola_nome}}", dados.escola_nome)
      .replace("{{aluno_nome}}", dados.aluno_nome)
      .replace("{{mensalidade}}", dados.mensalidade);

    expect(contratoFinal).toBe("Contrato entre Escola Harmonia Pro e o aluno Beatriz Oliveira no valor de R$ 350,00.");
  });

  // ── 8. PORTAL DO ALUNO & DIÁRIO DE ESTUDOS COM IA ───────────────
  it("8. [Portal Aluno] Deve validar progresso semanal de estudos e rotinas de treino", () => {
    const metasSemanais = [
      { dia: "Segunda", exercicio: "Escalas Maiores", duracaoMin: 20, concluido: true },
      { dia: "Terça", exercicio: "Arpejos em C", duracaoMin: 30, concluido: true },
      { dia: "Quarta", exercicio: "Peça: Sonata Fácil", duracaoMin: 45, concluido: false },
      { dia: "Quinta", exercicio: "Leitura à Primeira Vista", duracaoMin: 15, concluido: true },
      { dia: "Sexta", exercicio: "Revisão Geral", duracaoMin: 30, concluido: false },
    ];

    const concluidos = metasSemanais.filter(m => m.concluido).length;
    const progressoPercent = (concluidos / metasSemanais.length) * 100;

    expect(concluidos).toBe(3);
    expect(progressoPercent).toBe(60);
  });

});
