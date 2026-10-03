// CAÇA-BUG (runtime em produção): probe da separação PAGAMENTO × ENTREGA.
// Valida que as duas situações são independentes e que as transições respeitam
// as regras (entrega terminal, venda cancelada não altera entrega).
// Uso: node vps-script/cacabug_orders_flow.mjs
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const stamp = String(Date.now()).slice(-6);
const schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.orders.${stamp}@gmail.com`;
const schoolPass = process.env.SCHOOL_PASS || `cacabug${stamp}`;
const results = [];

function makeSession() {
  const jar = { cookie: "" };
  const doFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (jar.cookie) headers.set("cookie", jar.cookie);
    const res = await fetch(input, { ...init, headers });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    if (setCookies.length) jar.cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
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

const pub = makeSession();
const admin = makeSession();
let saleId = null;
let costumeId = null;

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug pedidos)", async () => {
  const res = await pub.auth.registerWithPlan.mutate({
    name: `Caça-Bug Pedidos ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-4000",
    password: schoolPass,
    planType: "MONTHLY",
    planId: "dancepro_start",
  });
  expect(res?.success !== false, "cadastro sem sucesso");
  return "ok";
});

await step("Login admin", async () => {
  await admin.auth.login.mutate({ email: schoolEmail, password: schoolPass, loginType: "professor" });
  return "ok";
});

await step("Criar aluna + produto + venda (avulsa)", async () => {
  const st = await admin.students.create.mutate({ name: `Aluna Pedidos ${stamp}`, phone: "(11) 97777-4001" });
  const prod = await admin.figurinos.create.mutate({
    name: `Produto Pedido ${stamp}`, type: "outro", quantity: 3, cost: 10, salePrice: 50, sellable: true,
  });
  costumeId = prod.id;
  const sale = await admin.figurinos.sell.mutate({
    costumeId, studentId: st.id ?? st.studentId, quantity: 1, paymentMode: "avulso",
  });
  expect(sale.saleId || sale.orderCode, "venda não criada");
  const rows = await admin.figurinos.sales.query({ status: "todos" });
  const found = rows.find((r) => r.orderCode === sale.orderCode);
  expect(found, "venda não listada");
  saleId = found.id;
  return `pedido=${sale.orderCode} id=${saleId}`;
});

await step("Entrega → em separação NÃO altera o pagamento (continua pendente)", async () => {
  await admin.figurinos.updateSaleDelivery.mutate({ id: saleId, deliveryStatus: "em_separacao" });
  const rows = await admin.figurinos.sales.query({ status: "todos" });
  const s = rows.find((r) => r.id === saleId);
  expect(s.status === "pendente", `pagamento deveria seguir pendente, veio ${s.status}`);
  expect(s.deliveryStatus === "em_separacao", `entrega deveria ser em_separacao, veio ${s.deliveryStatus}`);
  return "pagamento intacto";
});

await step("Marcar pago NÃO altera a entrega (continua em separação)", async () => {
  await admin.figurinos.updateSaleStatus.mutate({ id: saleId, status: "pago" });
  const rows = await admin.figurinos.sales.query({ status: "todos" });
  const s = rows.find((r) => r.id === saleId);
  expect(s.status === "pago", `pagamento deveria ser pago, veio ${s.status}`);
  expect(s.deliveryStatus === "em_separacao", `entrega deveria seguir em_separacao, veio ${s.deliveryStatus}`);
  return "entrega intacta";
});

await step("Entregar grava deliveredAt e é terminal (não volta)", async () => {
  await admin.figurinos.updateSaleDelivery.mutate({ id: saleId, deliveryStatus: "entregue" });
  const rows = await admin.figurinos.sales.query({ status: "todos" });
  const s = rows.find((r) => r.id === saleId);
  expect(s.deliveryStatus === "entregue", "entrega deveria ser entregue");
  expect(s.deliveredAt != null, "deliveredAt deveria estar preenchido");
  let blocked = false;
  try {
    await admin.figurinos.updateSaleDelivery.mutate({ id: saleId, deliveryStatus: "em_separacao" });
  } catch { blocked = true; }
  expect(blocked, "entrega terminal deveria bloquear reversão");
  return "entregue (terminal)";
});

await step("Status antigo inválido no financeiro é rejeitado (entregue/em_separacao)", async () => {
  let rejected = 0;
  for (const legacy of ["entregue", "em_separacao"]) {
    try {
      await admin.figurinos.updateSaleStatus.mutate({ id: saleId, status: legacy });
    } catch { rejected += 1; }
  }
  expect(rejected === 2, `esperava 2 rejeições, veio ${rejected}`);
  return "rejeitado";
});

await step("Cancelar venda bloqueia alteração de entrega", async () => {
  await admin.figurinos.updateSaleStatus.mutate({ id: saleId, status: "cancelado" });
  let blocked = false;
  try {
    await admin.figurinos.updateSaleDelivery.mutate({ id: saleId, deliveryStatus: "pendente" });
  } catch { blocked = true; }
  expect(blocked, "venda cancelada deveria bloquear entrega");
  const rows = await admin.figurinos.sales.query({ status: "todos" });
  const s = rows.find((r) => r.id === saleId);
  expect(s.status === "cancelado", "pagamento deveria ser cancelado");
  expect(s.deliveryStatus === "entregue", "entrega deveria permanecer como estava (histórico)");
  return "ok";
});

await step("Limpeza: arquivar/remover produto de teste", async () => {
  try { await admin.figurinos.delete.mutate({ id: costumeId }); } catch { /* histórico → arquivado */ }
  return "ok";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n=============== RESUMO CACABUG PEDIDOS ===============`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
