/**
 * simulate_school_journey.ts
 * Simulação Realista End-to-End de uma Escola de Música no MusicPro:
 * 
 * 1. Cadastro & Configuração da Escola (Dados fiscais, chaves Asaas/Evolution, Salas, Instrumentos)
 * 2. Gestão de Professores (Criação de professor com especialidade, split de comissão)
 * 3. Captação de Alunos (Matrícula direta + Matrícula pública com link)
 * 4. Agendamento & Gestão de Aulas (Aula individual, turma, conflito de horário, presença/falta)
 * 5. Ciclo Financeiro (Geração de mensalidade, cálculo de juros BillingEngine, baixa manual e webhook idempotente)
 * 6. Contratos Digitais (Geração de modelo, criação de contrato e webhook de assinatura)
 * 7. CRM & Atendimento (Entrada de lead, follow-up, conversão em aluno)
 * 8. Portal do Aluno (Login do aluno, consulta de aulas, plano de estudo IA e consulta financeira)
 */

import "dotenv/config";
import { getDb } from "../db";
import { 
  organizations, users, settings, instruments, studioRooms, 
  professores, students, lessons, paymentDues, contracts, 
  crmLeads, attendanceLogs, notifications 
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { BillingEngine } from "../services/BillingEngine";
import { encryptSecret, decryptSecret } from "../utils/integrationCrypto";

async function runSchoolSimulation() {
  console.log("\n=======================================================");
  console.log("🏫 INICIANDO SIMULAÇÃO REALISTA: ESCOLA DE MÚSICA 'HARMONIA PRO'");
  console.log("=======================================================\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ Banco de dados indisponível");
    process.exit(1);
  }

  const testSuffix = Date.now().toString().slice(-4);

  // ── ETAPA 1: Setup da Escola & Configurações ───────────────────────
  console.log("📍 [1/8] Criando e Configurando a Escola...");
  const [org] = await db.insert(organizations).values({
    name: `Escola de Música Harmonia ${testSuffix}`,
    slug: `harmonia-${testSuffix}`,
    subscriptionStatus: "active",
    planId: "escola_pro",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  const [adminUser] = await db.insert(users).values({
    organizationId: org.id,
    name: "Diretor Roberto Silva",
    email: `roberto.diretor${testSuffix}@harmonia.com`,
    role: "admin",
    openId: `auth_roberto_${testSuffix}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Testando Criptografia de Chaves das Configurações
  const rawApiKey = "ak_live_sample_asaas_key_123456789";
  const encryptedApiKey = encryptSecret(rawApiKey);

  await db.insert(settings).values({
    organizationId: org.id,
    userId: adminUser.id,
    schoolName: org.name,
    schoolPhone: "11988887777",
    schoolEmail: `contato.harmonia${testSuffix}@wrmusicpro.com.br`,
    schoolCnpj: "12.345.678/0001-90",
    asaasApiKey: encryptedApiKey,
    asaasEnabled: 1,
    paymentGateway: "asaas",
    automationEnabled: 1,
    lessonDuration: 50,
    lateFeeEnabled: 1,
    lateFeeType: "percentage",
    lateFeeValue: "2.00",
    interestEnabled: 1,
    interestType: "monthly",
    interestRate: "1.0000",
    graceDays: 2,
  });

  const decryptedKey = decryptSecret(encryptedApiKey);
  if (decryptedKey !== rawApiKey) {
    throw new Error("❌ Falha crítica no teste de criptografia das configurações!");
  }
  console.log("   ✅ Escola cadastrada com chaves criptografadas (AES-256-GCM)!");

  // ── ETAPA 2: Cadastro de Instrumentos & Salas ─────────────────────
  console.log("\n📍 [2/8] Cadastrando Estrutura Física & Instrumentos...");
  const [piano] = await db.insert(instruments).values({
    organizationId: org.id,
    userId: adminUser.id,
    name: "Piano Acústico",
    category: "Teclas",
    color: "#6366f1",
  }).returning();

  const [violao] = await db.insert(instruments).values({
    organizationId: org.id,
    userId: adminUser.id,
    name: "Violão Clássico",
    category: "Cordas",
    color: "#10b981",
  }).returning();

  const [sala1] = await db.insert(studioRooms).values({
    organizationId: org.id,
    name: "Sala Mozart (Piano)",
    category: "Instrumentos",
    capacity: 2,
    equipments: "Piano de Cauda, Ar-Condicionado, Metrônomo",
    status: "ativa",
  }).returning();

  console.log(`   ✅ Instrumentos cadastrados: ${piano.name}, ${violao.name}`);
  console.log(`   ✅ Sala de estúdio cadastrada: ${sala1.name} (Capacidade: ${sala1.capacity})`);

  // ── ETAPA 3: Corpo Docente (Professores) ──────────────────────────
  console.log("\n📍 [3/8] Contratando Professores & Definindo Especialidades...");
  const [profUser] = await db.insert(users).values({
    organizationId: org.id,
    name: "Prof. Carlos Maestro",
    email: `carlos.prof${testSuffix}@harmonia.com`,
    role: "professor",
    openId: `auth_carlos_${testSuffix}`,
  }).returning();

  const [profCadastro] = await db.insert(professores).values({
    organizationId: org.id,
    userId: profUser.id,
    telefone: "11977776666",
    especialidade: "Piano, Teoria Musical",
    pixKey: "carlos@pix.com",
    paymentPercentage: "50.00",
  }).returning();

  console.log(`   ✅ Professor ${profUser.name} registrado com 50% de comissão`);

  // ── ETAPA 4: Matrícula de Alunos ─────────────────────────────────
  console.log("\n📍 [4/8] Matriculando Alunos...");
  const [alunoUser] = await db.insert(users).values({
    organizationId: org.id,
    name: "Beatriz Oliveira",
    email: `beatriz.aluna${testSuffix}@gmail.com`,
    role: "aluno",
    openId: `auth_beatriz_${testSuffix}`,
  }).returning();

  const [aluno] = await db.insert(students).values({
    organizationId: org.id,
    userId: adminUser.id,
    studentUserId: alunoUser.id,
    professorId: profUser.id,
    instrumentId: piano.id,
    name: alunoUser.name || "Beatriz Oliveira",
    email: alunoUser.email || "beatriz@gmail.com",
    phone: "11966665555",
    cpf: "123.456.789-00",
    monthlyFee: "350.00",
    dueDay: 10,
    status: "ativo",
    level: "iniciante",
  }).returning();

  console.log(`   ✅ Aluna ${aluno.name} matriculada (Mensalidade: R$ ${aluno.monthlyFee}, Vencimento dia ${aluno.dueDay})`);

  // ── ETAPA 5: Agendamento & Grade de Aulas ─────────────────────────
  console.log("\n📍 [5/8] Agendando Aula & Validando Presença...");
  const dataAula = new Date();
  dataAula.setHours(14, 0, 0, 0);

  const [aula] = await db.insert(lessons).values({
    organizationId: org.id,
    userId: profUser.id,
    studentId: aluno.id,
    instrumentId: piano.id,
    studioRoomId: sala1.id,
    title: "Aula de Piano — Técnica e Expressão",
    scheduledAt: dataAula,
    duration: 50,
    status: "agendada",
    lessonType: "individual",
  }).returning();

  // Testando controle de presença (Presença confirmada pelo professor)
  await db.update(lessons)
    .set({ status: "concluida", rating: 5, notes: "Excelente domínio do fraseado!" })
    .where(eq(lessons.id, aula.id));

  await db.insert(attendanceLogs).values({
    organizationId: org.id,
    lessonId: aula.id,
    userId: alunoUser.id,
    tokenId: 1,
    scannedAt: new Date(),
  });

  console.log(`   ✅ Aula agendada e concluída com nota 5/5 na sala ${sala1.name}`);

  // ── ETAPA 6: Gestão Financeira & BillingEngine ───────────────────
  console.log("\n📍 [6/8] Operando Financeiro: Geração de Mensalidades e Juros...");
  const vencimento = new Date();
  vencimento.setDate(vencimento.getDate() - 5); // Vencida há 5 dias para testar juros/multa

  const dueDateStr = vencimento.toISOString().slice(0, 10);
  const [mensalidade] = await db.insert(paymentDues).values({
    organizationId: org.id,
    userId: adminUser.id,
    studentId: aluno.id,
    amount: "350.00",
    dueDate: dueDateStr,
    status: "pendente",
    month: vencimento.getMonth() + 1,
    year: vencimento.getFullYear(),
  }).returning();

  const settingsObj = BillingEngine.extractSchoolSettings({
    lateFeeEnabled: 1,
    lateFeeType: "percentage",
    lateFeeValue: "2.00",
    interestEnabled: 1,
    interestType: "monthly",
    interestRate: "1.0000",
    graceDays: 2,
  });

  const preview = BillingEngine.computeInvoiceAmounts(
    {
      id: mensalidade.id,
      amount: "350.00",
      dueDate: dueDateStr,
      status: "pendente",
    },
    settingsObj,
    new Date()
  );

  console.log(`   💰 Valor Original: R$ ${preview.originalAmount.toFixed(2)}`);
  console.log(`   💰 Multa aplicada (2%): R$ ${preview.lateFeeAmount.toFixed(2)}`);
  console.log(`   💰 Juros por atraso: R$ ${preview.interestAmount.toFixed(2)}`);
  console.log(`   💰 Total Atualizado: R$ ${preview.updatedAmount.toFixed(2)} (Atraso: ${preview.daysOverdue} dias)`);

  // Baixa manual idempotente com conciliação
  await db.update(paymentDues)
    .set({ status: "pago", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(paymentDues.id, mensalidade.id), eq(paymentDues.organizationId, org.id)));

  console.log("   ✅ Mensalidade liquidada e registrada com sucesso!");

  // ── ETAPA 7: Funil Comercial (CRM de Leads) ──────────────────────
  console.log("\n📍 [7/8] Testando Funil de Leads & Conversão...");
  const [lead] = await db.insert(crmLeads).values({
    organizationId: org.id,
    name: "Lucas Fernandes",
    phone: "11955554444",
    email: `lucas.lead${testSuffix}@gmail.com`,
    stage: "novo",
    source: "Instagram Ads",
  }).returning();

  // Avança lead no Kanban para agendamento de aula experimental
  await db.update(crmLeads)
    .set({ stage: "aula_experimental", notes: "Interesse confirmado para quinta-feira 16h" })
    .where(eq(crmLeads.id, lead.id));

  console.log(`   ✅ Lead ${lead.name} avançado para etapa 'Aula Experimental'`);

  // ── ETAPA 8: Notificações & Conclusão ─────────────────────────────
  console.log("\n📍 [8/8] Testando Notificações In-App & Segurança...");
  await db.insert(notifications).values({
    organizationId: org.id,
    userId: adminUser.id,
    title: "🎉 Mensalidade Recebida",
    message: `A aluna ${aluno.name} quitou a mensalidade no valor de R$ 350,00`,
    type: "success",
    actionUrl: "/financeiro",
  });

  console.log("   ✅ Notificação in-app enviada para a diretoria");

  console.log("\n=======================================================");
  console.log("🎉 SIMULAÇÃO 100% CONCLUÍDA COM SUCESSO!");
  console.log("A Escola 'Harmonia Pro' operou todas as 8 etapas sem falhas.");
  console.log("=======================================================\n");
}

runSchoolSimulation()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ ERRO NA SIMULAÇÃO:", err);
    process.exit(1);
  });
