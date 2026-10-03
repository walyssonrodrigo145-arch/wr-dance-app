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
  const salesOfEvent = await admin.figurinos.sales.query({ eventId: ev.id, status: "todos" });
  expect(salesOfEvent.length === 1, `sales do evento deveria ter 1, veio ${salesOfEvent.length} (eventId perdido no insert?)`);
  const rows = await admin.eventos.list.query();
  const found = rows.find((r) => r.id === ev.id);
  expect(Number(found.receitaPrevista) === 80, `receita prevista deveria ser 80, veio ${found.receitaPrevista}`);
  expect(found.vendasQty === 1, "vendasQty deveria ser 1");
  return "ok";
});

// ═══════════ FASE 1: programa (elenco, metadados, conflitos, reorder) ═══════════
await step("FASE 1 — criar 2 coreografias + elenco com a aluna", async () => {
  const a = await admin.coreografias.create.mutate({ title: `Coreo A ${stamp}`, formacao: "grupo" });
  const b = await admin.coreografias.create.mutate({ title: `Coreo B ${stamp}`, formacao: "grupo" });
  ev.coreoA = a.id;
  ev.coreoB = b.id;
  await admin.coreografias.addAluno.mutate({ coreografiaId: a.id, studentId: ev.studentId, papel: "Corpo de baile" });
  await admin.coreografias.addAluno.mutate({ coreografiaId: b.id, studentId: ev.studentId, papel: "Corpo de baile" });
  return `coreos=${a.id},${b.id}`;
});

await step("FASE 1 — vincular as 2 ao evento (elenco importado)", async () => {
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: ev.coreoA, importCast: true });
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: ev.coreoB, importCast: true });
  const detail = await admin.eventos.getById.query({ id: ev.id });
  expect(detail.coreografias.length >= 2, `esperava >=2 apresentações, veio ${detail.coreografias.length}`);
  const first = detail.coreografias[0];
  expect((first.alunos ?? []).length >= 1, "elenco da coreografia não veio no getById");
  const part = detail.participantes.find((p) => p.studentId === ev.studentId);
  expect(part, "aluna não está nas participações");
  expect((part.apresentacoes ?? []).length >= 2, `apresentações da aluna deveriam ser >=2, veio ${(part.apresentacoes ?? []).length}`);
  expect(Array.isArray(part.turmas) && Array.isArray(part.professores), "turmas/professores não enriquecidos");
  expect(typeof part.hasOverdue === "boolean", "hasOverdue não enriquecido");
  return `apresentações=${detail.coreografias.length} · elenco ok`;
});

await step("FASE 1 — metadados da apresentação (duração/camarim/horários)", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  const presA = detail.coreografias.find((c) => c.coreografiaId === ev.coreoA);
  await admin.eventos.updateChoreography.mutate({
    id: presA.id,
    durationMinutes: 4,
    dressingRoom: "Camarim 1",
    stageEntry: "19:05",
    stageExit: "19:09",
  });
  const after = await admin.eventos.getById.query({ id: ev.id });
  const updated = after.coreografias.find((c) => c.id === presA.id);
  expect(updated.durationMinutes === 4, "duração não persistiu");
  expect(updated.dressingRoom === "Camarim 1", "camarim não persistiu");
  expect(updated.stageEntry === "19:05" && updated.stageExit === "19:09", "horários não persistiram");
  return "4 min · Camarim 1";
});

await step("FASE 1 — horário inválido é rejeitado", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  let rejected = false;
  try {
    await admin.eventos.updateChoreography.mutate({ id: detail.coreografias[0].id, stageEntry: "25:99" });
  } catch {
    rejected = true;
  }
  expect(rejected, "25:99 deveria ser rejeitado");
  return "rejeitado";
});

await step("FASE 1 — reorderPresentations (drag & drop) e intervalo mínimo", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  const ids = detail.coreografias.map((c) => c.id);
  const reversed = [...ids].reverse();
  await admin.eventos.reorderPresentations.mutate({ eventId: ev.id, orderedIds: reversed });
  const after = await admin.eventos.getById.query({ id: ev.id });
  expect(after.coreografias[0].id === reversed[0], "ordem não foi aplicada");
  expect(after.coreografias[after.coreografias.length - 1].id === reversed[reversed.length - 1], "última posição errada");

  await admin.eventos.setMinInterval.mutate({ id: ev.id, minutes: 8 });
  const withInterval = await admin.eventos.getById.query({ id: ev.id });
  expect(withInterval.minIntervalMinutes === 8, "minIntervalMinutes não persistiu");
  return `ordem invertida + intervalo=8min`;
});

await step("FASE 1 — reorder inválido é bloqueado", async () => {
  let rejected = false;
  try {
    await admin.eventos.reorderPresentations.mutate({ eventId: ev.id, orderedIds: [999999] });
  } catch {
    rejected = true;
  }
  expect(rejected, "ids fora do programa deveriam ser rejeitados");
  return "rejeitado";
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

await step("FASE 1 — limpeza: remover elenco/programa de teste", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  for (const c of detail.coreografias) {
    try { await admin.eventos.unlinkCoreografia.mutate({ id: c.id }); } catch { /* ok */ }
  }
  for (const coreoId of [ev.coreoA, ev.coreoB].filter(Boolean)) {
    try { await admin.coreografias.delete.mutate({ id: coreoId }); } catch { /* ok */ }
  }
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
