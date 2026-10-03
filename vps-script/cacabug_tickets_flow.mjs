// CAÇA-BUG (runtime em produção): probe FASE 2 — Ingressos + Backstage.
// Tipos/lotes, emissão com assento, cortesias por aluno, check-in (válido/duplicado/
// inválido/cancelado), capacidade, janela de vendas, mapa de assentos e palco.
// Uso: node vps-script/cacabug_tickets_flow.mjs
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const stamp = String(Date.now()).slice(-6);
const schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.tickets.${stamp}@gmail.com`;
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
const ev = {};

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug ingressos)", async () => {
  const res = await pub.auth.registerWithPlan.mutate({
    name: `Caça-Bug Ingressos ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-5000",
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

await step("Criar evento + 2 alunas participantes", async () => {
  const evRes = await admin.eventos.create.mutate({
    name: `Espetáculo Ingressos ${stamp}`,
    type: "recital",
    startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    status: "confirmado",
    requiresAuthorization: false,
  });
  ev.id = evRes.id;
  const a = await admin.students.create.mutate({ name: `Aluna Ingresso A ${stamp}` });
  const b = await admin.students.create.mutate({ name: `Aluna Ingresso B ${stamp}` });
  ev.students = [a.id ?? a.studentId, b.id ?? b.studentId];
  await admin.eventos.addParticipant.mutate({ eventId: ev.id, studentIds: ev.students });
  return `evento=${ev.id} alunas=${ev.students.join(",")}`;
});

await step("Tipos: criado com preço, lote e cortesias por aluno", async () => {
  const adulto = await admin.tickets.typeCreate.mutate({
    eventId: ev.id, name: "Adulto", admissionType: "adulto", price: 50, quantity: 100, perStudentFree: 2,
  });
  const cortesia = await admin.tickets.typeCreate.mutate({
    eventId: ev.id, name: "Cortesia Aluno", admissionType: "cortesia", price: 0, quantity: 0, perStudentFree: 1,
  });
  ev.typeAdulto = adulto.id;
  ev.typeCortesia = cortesia.id;
  const types = await admin.tickets.typesList.query({ eventId: ev.id });
  expect(types.length === 2, "tipos não listados");
  expect(Number(types[0].price) === 50, "preço não persistiu");
  return "ok";
});

await step("Mapa: gerar setor A (2 fileiras × 3) e listar", async () => {
  const gen = await admin.tickets.seatsGenerate.mutate({ eventId: ev.id, sector: "A", rows: 2, perRow: 3 });
  expect(gen.created === 6, `esperava 6 assentos, criou ${gen.created}`);
  const again = await admin.tickets.seatsGenerate.mutate({ eventId: ev.id, sector: "A", rows: 2, perRow: 3 });
  expect(again.created === 0, "não deveria duplicar assentos");
  const seats = await admin.tickets.seatsList.query({ eventId: ev.id });
  ev.seatIds = seats.map((s) => s.id);
  return `${seats.length} assento(s)`;
});

await step("Emitir 2 vendidos COM assento (A 1-1 e A 1-2)", async () => {
  const res = await admin.tickets.issue.mutate({
    eventId: ev.id, ticketTypeId: ev.typeAdulto, quantity: 2,
    buyerName: "Comprador Teste", seatIds: [ev.seatIds[0], ev.seatIds[1]],
  });
  expect(res.codes.length === 2, "códigos não gerados");
  ev.codes = res.codes;
  const seats = await admin.tickets.seatsList.query({ eventId: ev.id });
  const occupied = seats.filter((s) => s.occupant === "vendido");
  expect(occupied.length === 2, `esperava 2 assentos ocupados, veio ${occupied.length}`);
  const stats = await admin.tickets.stats.query({ eventId: ev.id });
  expect(stats.sold === 2 && Number(stats.revenue) === 100, `stats errados: ${JSON.stringify(stats)}`);
  return `códigos=${res.codes.join(",")}`;
});

await step("Assento já ocupado é bloqueado", async () => {
  let rejected = false;
  try {
    await admin.tickets.issue.mutate({
      eventId: ev.id, ticketTypeId: ev.typeAdulto, quantity: 1, seatIds: [ev.seatIds[0]],
    });
  } catch { rejected = true; }
  expect(rejected, "assento ocupado deveria ser rejeitado");
  return "rejeitado";
});

await step("Cortesias por aluno (2 para A, 1 para B — idempotente)", async () => {
  const first = await admin.tickets.issueCourtesyToParticipants.mutate({ eventId: ev.id, ticketTypeId: ev.typeCortesia });
  expect(first.created === 2, `esperava 2 cortesias (1 por aluna), veio ${first.created}`);
  const second = await admin.tickets.issueCourtesyToParticipants.mutate({ eventId: ev.id, ticketTypeId: ev.typeCortesia });
  expect(second.created === 0, `segunda chamada deveria criar 0, veio ${second.created}`);
  const list = await admin.tickets.list.query({ eventId: ev.id, status: "cortesia" });
  expect(list.length === 2, "cortesias não listadas");
  const withStudent = list.filter((t) => t.studentId);
  expect(withStudent.length === 2, "cortesias sem aluna vinculada");
  return "2 cortesias idempotentes";
});

await step("Check-in: válido → duplicado → inválido", async () => {
  const first = await admin.tickets.checkin.mutate({ code: ev.codes[0] });
  expect(first.result === "valido", `primeiro check-in deveria ser válido, veio ${first.result}`);
  const dup = await admin.tickets.checkin.mutate({ code: ev.codes[0] });
  expect(dup.result === "duplicado", `repetição deveria ser duplicado, veio ${dup.result}`);
  const bad = await admin.tickets.checkin.mutate({ code: "TE-XXXXXX" });
  expect(bad.result === "invalido", `código falso deveria ser inválido, veio ${bad.result}`);
  const stats = await admin.tickets.stats.query({ eventId: ev.id });
  expect(stats.checkedIn === 1 && stats.waiting === 3, `contadores errados: ${JSON.stringify(stats)}`);
  return "válido/duplicado/inválido ok";
});

await step("Cancelar ingresso libera assento e invalida QR", async () => {
  const list = await admin.tickets.list.query({ eventId: ev.id, status: "vendido" });
  const target = list.find((t) => t.code === ev.codes[0]);
  await admin.tickets.cancel.mutate({ id: target.id });
  const seats = await admin.tickets.seatsList.query({ eventId: ev.id });
  const freed = seats.filter((s) => !s.occupant);
  expect(freed.length === 5, `esperava 5 assentos livres (só 1 continua ocupado), veio ${freed.length}`);
  const checkin = await admin.tickets.checkin.mutate({ code: ev.codes[0] });
  expect(checkin.result === "cancelado", `QR cancelado deveria responder cancelado, veio ${checkin.result}`);
  return "assento liberado";
});

await step("Capacidade do lote é respeitada (qty=1)", async () => {
  const t = await admin.tickets.typeCreate.mutate({ eventId: ev.id, name: `VIP ${stamp}`, admissionType: "vip", price: 200, quantity: 1 });
  await admin.tickets.issue.mutate({ eventId: ev.id, ticketTypeId: t.id, quantity: 1, buyerName: "Vip 1" });
  let rejected = false;
  try {
    await admin.tickets.issue.mutate({ eventId: ev.id, ticketTypeId: t.id, quantity: 1, buyerName: "Vip 2" });
  } catch { rejected = true; }
  expect(rejected, "exceder o lote deveria ser bloqueado");
  return "esgotado corretamente";
});

await step("Janela de vendas encerrada bloqueia emissão", async () => {
  const t = await admin.tickets.typeCreate.mutate({
    eventId: ev.id, name: `Antecipado ${stamp}`, admissionType: "meia", price: 25, quantity: 10,
    salesStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    salesEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  });
  let rejected = false;
  try {
    await admin.tickets.issue.mutate({ eventId: ev.id, ticketTypeId: t.id, quantity: 1, buyerName: "Atrasado" });
  } catch { rejected = true; }
  expect(rejected, "venda fora da janela deveria ser bloqueada");
  const courtesyOk = await admin.tickets.issue.mutate({ eventId: ev.id, ticketTypeId: t.id, quantity: 1, asCourtesy: true, buyerName: "Cortesia Fora da Janela" });
  expect(courtesyOk.codes.length === 1, "cortesia deveria ignorar a janela");
  return "venda bloqueada · cortesia liberada";
});

await step("Tipo com emissões não pode ser excluído", async () => {
  let rejected = false;
  try {
    await admin.tickets.typeDelete.mutate({ id: ev.typeAdulto });
  } catch { rejected = true; }
  expect(rejected, "tipo com emissões deveria ser protegido");
  return "protegido";
});

await step("Backstage: palco com elenco e status de preparação", async () => {
  const coreo = await admin.coreografias.create.mutate({ title: `Coreo Palco ${stamp}`, formacao: "grupo" });
  ev.coreo = coreo.id;
  await admin.coreografias.addAluno.mutate({ coreografiaId: coreo.id, studentId: ev.students[0] });
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: coreo.id, importCast: true });
  const detail1 = await admin.eventos.getById.query({ id: ev.id });
  const pres = detail1.coreografias.find((c) => c.coreografiaId === coreo.id);
  expect(pres?.stageState === "aguardando", "apresentação deveria nascer aguardando");
  await admin.eventos.setStageState.mutate({ id: pres.id, state: "em_cena" });
  const detail2 = await admin.eventos.getById.query({ id: ev.id });
  expect(detail2.coreografias.find((c) => c.id === pres.id)?.stageState === "em_cena", "em_cena não persistiu");
  const part = detail2.participantes.find((p) => p.studentId === ev.students[0]);
  await admin.eventos.updateParticipant.mutate({ id: part.id, stageStatus: "figurino_pronto" });
  const detail3 = await admin.eventos.getById.query({ id: ev.id });
  expect(detail3.participantes.find((p) => p.id === part.id)?.stageStatus === "figurino_pronto", "stageStatus não persistiu");
  return "em_cena + figurino pronto";
});

await step("Purge administrativo + limpeza do evento", async () => {
  await admin.tickets.purgeEventTickets.mutate({ eventId: ev.id, confirm: true });
  const types = await admin.tickets.typesList.query({ eventId: ev.id });
  expect(types.length === 0, "purge deveria limpar tipos");
  try { await admin.coreografias.delete.mutate({ id: ev.coreo }); } catch { /* ok */ }
  await admin.eventos.delete.mutate({ id: ev.id });
  return "limpo";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n=============== RESUMO CACABUG INGRESSOS ===============`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
