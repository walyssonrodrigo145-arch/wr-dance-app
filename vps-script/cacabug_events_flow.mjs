// CAÇA-BUG (runtime em produção): probe da aba Eventos v3 — página de gestão,
// eventos de vários dias, venda com preço promocional e receita refletida.
// Uso: node vps-script/cacabug_events_flow.mjs  |  Reuso: SCHOOL_EMAIL=... SCHOOL_PASS=... node ...

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const stamp = String(Date.now()).slice(-6);
let schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.events.${stamp}@gmail.com`;
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

const publicClient = makeSession();
const admin = makeSession();

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug eventos)", async () => {
  const res = await publicClient.auth.registerWithPlan.mutate({
    name: `Caça-Bug Eventos ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-1000",
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

const ev = {};

await step("Criar aluna de teste", async () => {
  const res = await admin.students.create.mutate({ name: `Aluna Cacabug ${stamp}`, phone: "(11) 97777-2000" });
  expect(res?.id || res?.success, "aluna não criada");
  ev.studentId = res.id ?? res.studentId;
  return `aluna=${ev.studentId}`;
});

await step("Criar evento de VÁRIOS DIAS (rascunho)", async () => {
  const res = await admin.eventos.create.mutate({
    name: `Festival Multi-dias ${stamp}`,
    type: "festival",
    venueName: "Centro Cultural",
    startsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    status: "planejado",
    requiresAuthorization: true,
  });
  ev.id = res.id;
  return `evento=${ev.id}`;
});

await step("list mostra início E término (cartão e detalhe na mesma fonte)", async () => {
  const rows = await admin.eventos.list.query();
  const found = rows.find((r) => r.id === ev.id);
  expect(found, "evento não listado");
  expect(found.endsAt != null, "término ausente no cartão");
  const detail = await admin.eventos.getById.query({ id: ev.id });
  expect(detail.endsAt != null, "término ausente no detalhe");
  expect(String(detail.endsAt) === String(found.endsAt), "datas divergem entre cartão e detalhe");
  return `fim=${String(detail.endsAt).slice(0, 16)}`;
});

await step("Adicionar participações (fluxo do filtro)", async () => {
  const cands = await admin.eventos.candidatesForEvent.query({ eventId: ev.id });
  const ids = cands.slice(0, 2).map((c) => c.id);
  expect(ids.length >= 1, "nenhum candidato");
  const res = await admin.eventos.addParticipant.mutate({ eventId: ev.id, studentIds: ids });
  expect(res.added === ids.length, "participações não adicionadas");
  return `${res.added} adicionada(s)`;
});

await step("Autorizações da participação (checkboxes)", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  const part = detail.participantes[0];
  await admin.eventos.updateParticipant.mutate({ id: part.id, participationAuthorization: true, imageAuthorization: true });
  const after = await admin.eventos.getById.query({ id: ev.id });
  const updated = after.participantes.find((p) => p.id === part.id);
  expect(updated.imageAuthorization === true && updated.participationAuthorization === true, "autorizações não persistiram");
  return "ok";
});

await step("Criar produto COM promo (R$ 100 → promo R$ 80) e vender no evento", async () => {
  const costume = await admin.figurinos.create.mutate({
    name: `Camiseta Promo ${stamp}`, type: "uniforme", quantity: 10, cost: 30, salePrice: 100, promoPrice: 80, sellable: true,
  });
  ev.costumeId = costume.id;
  const res = await admin.figurinos.sell.mutate({
    eventId: ev.id, costumeId: ev.costumeId, studentId: ev.studentId, quantity: 1, paymentMode: "avulso",
  });
  expect(res.orderCode, "venda sem orderCode");
  expect(Number(res.totalPrice) === 80, `preço praticado deveria ser 80 (promocional), veio ${res.totalPrice}`);
  ev.saleId = res.saleId ?? null;
  ev.orderCode = res.orderCode;
  return `pedido=${res.orderCode} total=80`;
});

await step("Receita do evento reflete a venda (prevista 80)", async () => {
  const rows = await admin.eventos.list.query();
  const found = rows.find((r) => r.id === ev.id);
  expect(Number(found.receitaPrevista) === 80, `receita prevista deveria ser 80, veio ${found.receitaPrevista}`);
  expect(found.vendasQty === 1, "vendasQty deveria ser 1");
  return "ok";
});

await step("Publicar → Encerrar (realizado) com confirmação de regras", async () => {
  await admin.eventos.setStatus.mutate({ id: ev.id, status: "confirmado" });
  await admin.eventos.setStatus.mutate({ id: ev.id, status: "realizado" });
  let terminal = false;
  try {
    await admin.eventos.setStatus.mutate({ id: ev.id, status: "cancelado" });
  } catch {
    terminal = true;
  }
  expect(terminal, "realizado deveria ser terminal");
  return "ok";
});

await step("Limpeza: excluir evento/produto", async () => {
  const ids = [ev.id].filter(Boolean);
  for (const id of ids) {
    try { await admin.eventos.delete.mutate({ id }); } catch { /* já removido */ }
  }
  try { await admin.figurinos.delete.mutate({ id: ev.costumeId }); } catch { /* histórico → arquivado */ }
  return "ok";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n================ RESUMO CACABUG EVENTOS ================`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
