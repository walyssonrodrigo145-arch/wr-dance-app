// CAÇA-BUG (runtime em produção): probe reutilizável de endereço completo + variáveis de contrato.
// Uso fresca: node vps-script/cacabug_contract_flow.mjs  |  Reuso: SCHOOL_EMAIL=... SCHOOL_PASS=... node ...

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import zlib from "node:zlib";

const BASE = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const stamp = String(Date.now()).slice(-6);
let schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.contract.${stamp}@gmail.com`;
let schoolPass = process.env.SCHOOL_PASS || `cacabug${stamp}`;
const results = [];

function makeSession() {
  const jar = { cookie: "" };
  const doFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (jar.cookie) headers.set("cookie", jar.cookie);
    const res = await fetch(input, { ...init, headers });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const fallback = res.headers.get("set-cookie");
    const list = setCookies.length ? setCookies : fallback ? [fallback] : [];
    if (list.length) jar.cookie = list.map((c) => c.split(";")[0]).join("; ");
    return res;
  };
  return createTRPCProxyClient({ links: [httpBatchLink({ url: BASE, fetch: doFetch, transformer: superjson })] });
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    results.push({ name, status: "PASS", detail, ms });
    console.log(`✅ ${name} (${ms}ms) — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    return detail;
  } catch (err) {
    const ms = Date.now() - started;
    const message = err?.message || String(err);
    results.push({ name, status: "FAIL", detail: message, ms });
    console.log(`❌ ${name} (${ms}ms) — ${message}`);
    return null;
  }
}

const expect = (cond, message) => { if (!cond) throw new Error(message); return true; };

/** Extrai o texto do PDF: streams podem estar comprimidos (FlateDecode). */
function extractPdfText(base64) {
  const buf = Buffer.from(base64, "base64");
  const raw = buf.toString("latin1");
  let text = "";
  const re = /stream\r?\n/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = buf.subarray(start, end);
    let chunk = slice.toString("latin1");
    try {
      chunk = zlib.inflateSync(slice).toString("latin1");
    } catch {
      // stream não comprimido — usa o texto cru
    }
    // pdf-lib grava Tj como string hexadecimal: <48656C6C6F> = "Hello"
    chunk = chunk.replace(/<([0-9A-Fa-f]+)>/g, (_all, hex) => {
      try { return Buffer.from(hex, "hex").toString("latin1"); } catch { return ""; }
    });
    text += chunk + "\n";
  }
  return text || raw;
}

function validCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const calc = (base) => {
    let sum = 0;
    base.forEach((d, i) => { sum += d * (base.length + 1 - i); });
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(n);
  const d2 = calc([...n, d1]);
  const s = [...n, d1, d2].join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

const publicClient = makeSession();
const admin = makeSession();
const ctxStore = {};

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug contrato)", async () => {
  const res = await publicClient.auth.registerWithPlan.mutate({
    name: `Caça-Bug Contratos ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-0000",
    password: schoolPass,
    planType: "MONTHLY",
    planId: "dancepro_start",
  });
  expect(res?.success !== false, "cadastro sem sucesso");
  return "ok";
});

await step("Login admin + configurar escola", async () => {
  await admin.auth.login.mutate({ email: schoolEmail, password: schoolPass, loginType: "professor" });
  const me = await admin.auth.me.query();
  expect(me?.role === "admin", `role=${me?.role}`);
  ctxStore.orgId = me.organizationId;
  ctxStore.respCpf = validCpf();
  await admin.settings.updateSchool.mutate({
    schoolName: `Caça-Bug Contratos ${stamp}`,
    schoolAddress: "Rua das Piruetas, 100",
    schoolCity: "São Paulo",
    schoolPhone: "(11) 3333-4444",
    schoolEmail,
    schoolResponsibleName: "Ana Lima Cacabug",
    schoolResponsibleRg: "1.234.567-8",
    schoolResponsibleCpf: ctxStore.respCpf,
  });
  const s = await admin.settings.get.query();
  expect(s?.schoolResponsibleName === "Ana Lima Cacabug", `resp=${s?.schoolResponsibleName}`);
  expect(s?.schoolResponsibleCpf === ctxStore.respCpf, `respCpf=${s?.schoolResponsibleCpf}`);
  return `org=${me.organizationId} · responsável salvo`;
});

await step("Criar plano (2x/semana · cheio R$ 380)", async () => {
  const p = await admin.schoolPlans.create.mutate({
    nome: "Formação 2x/semana", aulasPorSemana: 2, duracaoMeses: 6, isBolsa: false,
    valorMensal: 320, valorCheio: 380, taxaInscricao: 0, diasLimite: "10", descricao: "Teste cacabug", ativo: true,
  });
  expect(p?.id, "plano não criado");
  ctxStore.planId = p.id;
  return `plano=${p.id}`;
});

await step("Criar aluna COM endereço completo (fiscal*)", async () => {
  const cpf = validCpf();
  const created = await admin.students.create.mutate({
    name: "Alice Cacabug",
    email: `alice.cacabug.${stamp}@gmail.com`,
    phone: "(11) 91111-2222",
    birthDate: "2014-05-10",
    cpf,
    rg: "12.345.678-9",
    address: "Endereço antigo livre",
    fiscalCep: "29900-000",
    fiscalStreet: "Rua Amarilis",
    fiscalNumber: "11",
    fiscalComplement: "casa 05",
    fiscalNeighborhood: "São José",
    fiscalCity: "Linhares",
    fiscalState: "ES",
    level: "iniciante",
    monthlyFee: 320,
    dueDay: 10,
    lessonType: "turma",
    status: "ativo",
    schoolPlanId: ctxStore.planId,
  });
  expect(created?.studentId, "aluna não criada");
  ctxStore.aliceId = created.studentId;
  return `alice=${created.studentId}`;
});

await step("getForEdit devolve o endereço completo (round-trip)", async () => {
  const s = await admin.students.getForEdit.query({ id: ctxStore.aliceId });
  expect(s?.fiscalCep === "29900-000", `cep=${s?.fiscalCep}`);
  expect(s?.fiscalStreet === "Rua Amarilis", `street=${s?.fiscalStreet}`);
  expect(s?.fiscalNumber === "11", `number=${s?.fiscalNumber}`);
  expect(s?.fiscalComplement === "casa 05", `complement=${s?.fiscalComplement}`);
  expect(s?.fiscalNeighborhood === "São José", `bairro=${s?.fiscalNeighborhood}`);
  expect(s?.fiscalCity === "Linhares", `cidade=${s?.fiscalCity}`);
  expect(s?.fiscalState === "ES", `uf=${s?.fiscalState}`);
  return `${s.fiscalStreet}, ${s.fiscalNumber} — ${s.fiscalCity}/${s.fiscalState}`;
});

await step("Criar modelo SOMENTE com variáveis novas (amigáveis + técnicas)", async () => {
  const content = [
    "CONTRATO TESTE CACABUG",
    "Contratante: {{Nome do Contratante}}",
    "CPF: {{CPF do Contratante}} | RG: {{RG do Contratante}}",
    "Numero: {{Número do Endereço do Contratante}}",
    "Endereco: {{Logradouro do Contratante}}, {{Número do Endereço do Contratante}}, {{Bairro do Contratante}}, CEP {{CEP do Contratante}} - {{Cidade do Contratante}}/{{Estado do Contratante}}",
    "Escola: {{Razão Social da Escola}} - {{Cidade da Escola}}",
    "Responsavel: {{Nome do Responsável pela Escola}} | RG {{RG do Responsável pela Escola}} | CPF {{CPF do Responsável pela Escola}}",
    "Prazo: {{Data Inicial}} a {{Data Final}} ({{Meses de aula}} meses, {{Quantidade de Aulas no Total}} aulas)",
    "Por extenso: {{Data Inicial Por Extenso}} a {{Data Final Por Extenso}}",
    "Valores: {{Valor da Mensalidade}} / sem desconto {{Valor da Parcela sem Desconto}}",
    "Contrato: {{Número do Contrato de Adesão}} | Ano: {{Ano Atual}}",
    "Local: {{Cidade da Escola - Estado da Escola}}, {{Data de hoje Por Extenso}}",
  ].join("\n");
  const created = await admin.contractTemplates.create.mutate({
    name: `Modelo Caça-Bug ${stamp}`,
    description: "Teste de variáveis novas",
    content,
    blocks: JSON.stringify([{ type: "titulo", title: "CONTRATO TESTE CACABUG", text: content }]),
  });
  expect(created?.id, "modelo não criado");
  ctxStore.templateId = created.id;
  return `modelo=${created.id}`;
});

await step("Gerar contrato (previewPdf) e conferir substituição no PDF", async () => {
  const preview = await admin.contracts.previewPdf.query({
    studentId: ctxStore.aliceId,
    templateId: ctxStore.templateId,
    startDate: "2026-01-10",
    endDate: "2026-07-10",
  });
  expect(preview?.base64 && preview.base64.length > 800, `pdf pequeno: ${preview?.base64?.length}`);
  const raw = extractPdfText(preview.base64);

  const checks = [
    ["Contratante: Alice Cacabug", "nome do contratante"],
    ["Numero: 11", "número do endereço (alias com acento)"],
    ["Rua Amarilis, 11", "logradouro + número"],
    ["29900-000", "CEP do contratante"],
    ["Linhares", "cidade do contratante"],
    ["Caça-Bug Contratos", "razão social da escola"],
    ["Responsavel: Ana Lima Cacabug", "nome do responsável pela escola"],
    ["1.234.567-8", "rg do responsável"],
    [ctxStore.respCpf, "cpf do responsável"],
    ["10/01/2026", "data inicial"],
    ["10/07/2026", "data final"],
    ["julho de 2026", "data final por extenso"],
    ["janeiro de 2026", "data inicial por extenso"],
    ["6 meses", "meses de aula"],
    ["48 aulas", "quantidade de aulas no total"],
    ["320.00", "valor da mensalidade"],
    ["380.00", "valor sem desconto"],
    [String(ctxStore.aliceId).padStart(6, "0"), "número do contrato de adesão"],
  ];
  const missing = checks.filter(([needle]) => !raw.includes(needle)).map(([needle, label]) => label);
  expect(missing.length === 0, `variáveis NÃO substituídas: ${missing.join(", ")}`);
  return `${checks.length} substituições OK (pdf ${preview.base64.length} b64)`;
});

await step("CPF inválido do responsável é rejeitado (validação server-side)", async () => {
  let rejected = false;
  try {
    await admin.settings.updateSchool.mutate({ schoolResponsibleCpf: "111.111.111-11" });
  } catch (e) {
    rejected = /CPF do responsável inválido/.test(e?.message || "");
  }
  expect(rejected, "CPF inválido foi aceito pela API");
  return "rejeitado corretamente";
});

await step("Contrato com variável desconhecida não quebra (vira vazio)", async () => {
  const t = await admin.contractTemplates.create.mutate({
    name: `Modelo Incompleto ${stamp}`,
    description: "variável inexistente",
    content: "Teste: {{variavel_que_nao_existe}} fim.",
    blocks: JSON.stringify([{ type: "texto", title: "", text: "Teste: {{variavel_que_nao_existe}} fim." }]),
  });
  const preview = await admin.contracts.previewPdf.query({ studentId: ctxStore.aliceId, templateId: t.id });
  expect(preview?.base64?.length > 1000, "preview falhou");
  const raw = extractPdfText(preview.base64);
  expect(!raw.includes("{{"), "chave não substituída vazou no PDF");
  return "ok";
});

console.log("\n================ RESUMO CACABUG ================");
const fails = results.filter((r) => r.status === "FAIL");
console.log(`Passos: ${results.length} · PASS: ${results.length - fails.length} · FAIL: ${fails.length}`);
if (fails.length) {
  console.log("\nFALHAS:");
  for (const f of fails) console.log(`❌ ${f.name} — ${f.detail}`);
}
console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
