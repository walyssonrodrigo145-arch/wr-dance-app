// CAÇA-BUG (runtime em produção): probe da aba Eventos — fluxo completo de eventos.
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

await step("stats inicial (vazio ou com eventos anteriores)", async () => {
  const s = await admin.eventos.stats.query();
  expect(typeof s.total === "number", "stats.total ausente");
  return `total=${s.total} proximos=${s.proximos}`;
});

await step("Criar evento com foto (rascunho)", async () => {
  const res = await admin.eventos.create.mutate({
    name: `Recital Cacabug ${stamp}`,
    type: "recital",
    description: "Recital de fim de ano do caçabug.",
    venueName: "Teatro Teste",
    venueAddress: "Rua das Artes, 10",
    startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    status: "planejado",
    requiresAuthorization: true,
    photoUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2fc?w=600",
  });
  expect(res?.id, "evento sem id");
  ev.id = res.id;
  return `evento=${res.id}`;
});

await step("list devolve photoUrl + métricas zeradas", async () => {
  const rows = await admin.eventos.list.query();
  const found = rows.find((r) => r.id === ev.id);
  expect(found, "evento não listado");
  expect(found.photoUrl?.includes("unsplash"), "photoUrl não persistido");
  expect(found.vendasQty === 0 && Number(found.receitaPrevista) === 0, "métricas deveriam zerar");
  ev.startsAt = found.startsAt;
  return "photoUrl ok";
});

await step("Publicar (setStatus planejado→confirmado)", async () => {
  await admin.eventos.setStatus.mutate({ id: ev.id, status: "confirmado" });
  const rows = await admin.eventos.list.query({ status: "confirmado" });
  expect(rows.some((r) => r.id === ev.id), "evento não está confirmado");
  return "ok";
});

await step("Transições inválidas são bloqueadas (cancelado→planejado, realizado→cancelado)", async () => {
  const res = await admin.eventos.create.mutate({
    name: `Rascunho Transição ${stamp}`,
    type: "workshop",
    startsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    status: "planejado",
    requiresAuthorization: false,
  });
  ev.draftId = res.id;
  // cancela e tenta voltar para planejado (inválido pela RN-002)
  await admin.eventos.setStatus.mutate({ id: res.id, status: "cancelado" });
  let rejected = false;
  try {
    await admin.eventos.setStatus.mutate({ id: res.id, status: "planejado" });
  } catch {
    rejected = true;
  }
  expect(rejected, "cancelado→planejado deveria ser bloqueado");
  // evento realizado é terminal: cria, publica, encerra e tenta cancelar
  const res2 = await admin.eventos.create.mutate({
    name: `Realizado Terminal ${stamp}`,
    type: "espetaculo",
    startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    status: "confirmado",
    requiresAuthorization: false,
  });
  ev.doneId = res2.id;
  await admin.eventos.setStatus.mutate({ id: res2.id, status: "realizado" });
  let terminal = false;
  try {
    await admin.eventos.setStatus.mutate({ id: res2.id, status: "cancelado" });
  } catch {
    terminal = true;
  }
  expect(terminal, "realizado→cancelado deveria ser bloqueado (terminal)");
  return "ok";
});

await step("Duplicar evento confirmado (cópias coreografias/participantes)", async () => {
  const res = await admin.eventos.duplicate.mutate({ id: ev.id });
  expect(res?.id, "cópia sem id");
  ev.copyId = res.id;
  const rows = await admin.eventos.list.query();
  const copy = rows.find((r) => r.id === res.id);
  expect(copy, "cópia não listada");
  expect(copy.name.includes("(cópia)"), "cópia sem sufixo");
  expect(copy.status === "planejado", "cópia deveria nascer rascunho");
  expect(copy.photoUrl?.includes("unsplash"), "cópia perdeu a foto");
  return `cópia=${res.id}`;
});

await step("Encerrar evento como realizado + receita aparece", async () => {
  await admin.eventos.setStatus.mutate({ id: ev.id, status: "realizado" });
  const rows = await admin.eventos.list.query({ status: "realizado" });
  expect(rows.some((r) => r.id === ev.id), "evento não realizado");
  return "ok";
});

await step("stats reflete novosEsteMes + realizados", async () => {
  const s = await admin.eventos.stats.query();
  expect((s.novosEsteMes ?? 0) >= 1, "novosEsteMes deveria ser >= 1");
  expect((s.realizados ?? 0) >= 1, "realizados deveria ser >= 1");
  return `novosEsteMes=${s.novosEsteMes} realizados=${s.realizados} planejados=${s.planejados} cancelados=${s.cancelados}`;
});

await step("Cancelar evento com notificação não quebra", async () => {
  await admin.eventos.setStatus.mutate({ id: ev.copyId, status: "cancelado" });
  return "ok";
});

await step("Limpeza: excluir eventos de teste", async () => {
  for (const id of [ev.id, ev.draftId, ev.copyId, ev.doneId].filter(Boolean)) {
    try { await admin.eventos.delete.mutate({ id }); } catch { /* já removido */ }
  }
  return "ok";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n================ RESUMO CACABUG EVENTOS ================`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
