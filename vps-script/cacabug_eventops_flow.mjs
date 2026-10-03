// CAÇA-BUG (runtime em produção): probe FASE 3 — Equipe, Checklist, Ocorrências,
// Financeiro do evento e Ordem inteligente.
// Uso: node vps-script/cacabug_eventops_flow.mjs
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE = process.env.E2E_BASE || "https://dancepro.wrvsystems.com.br/api/trpc";
const stamp = String(Date.now()).slice(-6);
const schoolEmail = process.env.SCHOOL_EMAIL || `cacabug.ops.${stamp}@gmail.com`;
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

if (!process.env.SCHOOL_EMAIL) await step("Cadastro da escola (caçabug operação)", async () => {
  const res = await pub.auth.registerWithPlan.mutate({
    name: `Caça-Bug Operação ${stamp}`,
    email: schoolEmail,
    phone: "(11) 97777-6000",
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
    name: `Gala Operação ${stamp}`, type: "recital",
    startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    status: "confirmado", requiresAuthorization: false,
  });
  ev.id = evRes.id;
  const a = await admin.students.create.mutate({ name: `Aluna Ops A ${stamp}` });
  const b = await admin.students.create.mutate({ name: `Aluna Ops B ${stamp}` });
  ev.a = a.id ?? a.studentId;
  ev.b = b.id ?? b.studentId;
  await admin.eventos.addParticipant.mutate({ eventId: ev.id, studentIds: [ev.a, ev.b] });
  return `evento=${ev.id}`;
});

await step("Equipe: criar, listar, atualizar e excluir", async () => {
  const created = await admin.eventos.staffCreate.mutate({
    eventId: ev.id, name: "Fernanda Backstage", role: "Backstage infantil", timeLabel: "17:00–22:00", location: "Camarim 2", phone: "(11) 98888-0000",
  });
  const list = await admin.eventos.staffList.query({ eventId: ev.id });
  expect(list.length === 1, "equipe não listada");
  await admin.eventos.staffUpdate.mutate({ id: created.id, name: "Fernanda Souza", role: "Backstage infantil", timeLabel: "17:00–22:00" });
  const after = await admin.eventos.staffList.query({ eventId: ev.id });
  expect(after[0].name === "Fernanda Souza", "nome não atualizou");
  await admin.eventos.staffDelete.mutate({ id: created.id });
  const empty = await admin.eventos.staffList.query({ eventId: ev.id });
  expect(empty.length === 0, "equipe não excluída");
  return "CRUD ok";
});

await step("Checklist: criar, concluir, listar e excluir", async () => {
  const t1 = await admin.eventos.taskCreate.mutate({ eventId: ev.id, title: "Confirmar iluminação", responsible: "Carlos", priority: "alta" });
  await admin.eventos.taskCreate.mutate({ eventId: ev.id, title: "Imprimir programa", priority: "media" });
  await admin.eventos.taskUpdate.mutate({ id: t1.id, status: "concluida" });
  const list = await admin.eventos.tasksList.query({ eventId: ev.id });
  expect(list.length === 2, "tarefas não listadas");
  const done = list.filter((t) => t.status === "concluida").length;
  expect(done === 1, "status não atualizou");
  await admin.eventos.taskDelete.mutate({ id: t1.id });
  const after = await admin.eventos.tasksList.query({ eventId: ev.id });
  expect(after.length === 1, "tarefa não excluída");
  return "2 criadas · 1 concluída · 1 excluída";
});

await step("Ocorrências: registrar, resolver e excluir", async () => {
  const inc = await admin.eventos.incidentCreate.mutate({ eventId: ev.id, title: "Figurino rasgou nos bastidores", severity: "alta" });
  const list = await admin.eventos.incidentsList.query({ eventId: ev.id });
  expect(list.length === 1 && list[0].status === "aberto", "ocorrência não registrada");
  await admin.eventos.incidentResolve.mutate({ id: inc.id, resolved: true });
  const after = await admin.eventos.incidentsList.query({ eventId: ev.id });
  expect(after[0].status === "resolvido" && after[0].resolvedAt != null, "não resolveu");
  await admin.eventos.incidentDelete.mutate({ id: inc.id });
  const empty = await admin.eventos.incidentsList.query({ eventId: ev.id });
  expect(empty.length === 0, "não excluiu");
  return "aberta → resolvida → excluída";
});

await step("Financeiro: despesa 500 + receita manual 200 → resultado -300", async () => {
  await admin.eventos.financeCreate.mutate({ eventId: ev.id, kind: "despesa", category: "Local", description: "Aluguel do teatro", amount: 500 });
  await admin.eventos.financeCreate.mutate({ eventId: ev.id, kind: "receita", category: "Patrocínios", description: "Padaria do bairro", amount: 200 });
  const s = await admin.eventos.financeSummary.query({ eventId: ev.id });
  expect(s.despesas === 500, `despesas ${s.despesas}`);
  expect(s.receitasManuais === 200, `receitas manuais ${s.receitasManuais}`);
  expect(s.resultado === -300, `resultado ${s.resultado}`);
  return "resumo manual ok";
});

await step("Financeiro integra Loja (paga) e Ingressos (vendidos)", async () => {
  const prod = await admin.figurinos.create.mutate({ name: `Camiseta Gala ${stamp}`, type: "uniforme", quantity: 5, cost: 10, salePrice: 50, sellable: true });
  const sale = await admin.figurinos.sell.mutate({ eventId: ev.id, costumeId: prod.id, studentId: ev.a, quantity: 1, paymentMode: "avulso" });
  const rows = await admin.figurinos.sales.query({ eventId: ev.id, status: "todos" });
  const found = rows.find((r) => r.orderCode === sale.orderCode);
  await admin.figurinos.updateSaleStatus.mutate({ id: found.id, status: "pago" });

  const type = await admin.tickets.typeCreate.mutate({ eventId: ev.id, name: `Plateia ${stamp}`, admissionType: "adulto", price: 50, quantity: 50 });
  await admin.tickets.issue.mutate({ eventId: ev.id, ticketTypeId: type.id, quantity: 2, buyerName: "Comprador Gala" });

  const s = await admin.eventos.financeSummary.query({ eventId: ev.id });
  expect(s.lojaArrecadado === 50, `loja ${s.lojaArrecadado}`);
  expect(s.ingressos === 100, `ingressos ${s.ingressos}`);
  expect(s.receitaTotal === 350, `receita total ${s.receitaTotal}`);
  expect(s.resultado === -150, `resultado ${s.resultado}`);
  expect(s.occupancyPct === 4, `ocupação ${s.occupancyPct}`); // 2 emitidos / 50 capacidade
  ev.costume = prod.id;
  return `loja 50 + ingressos 100 + manuais 200 − despesas 500 = ${s.resultado}`;
});

await step("Ordem inteligente: agrupa por elenco compartilhado", async () => {
  const cA = await admin.coreografias.create.mutate({ title: `Abertura ${stamp}`, formacao: "grupo" });
  const cB = await admin.coreografias.create.mutate({ title: `Dueto ${stamp}`, formacao: "grupo" });
  const cC = await admin.coreografias.create.mutate({ title: `Finale ${stamp}`, formacao: "grupo" });
  await admin.coreografias.addAluno.mutate({ coreografiaId: cA.id, studentId: ev.a });
  await admin.coreografias.addAluno.mutate({ coreografiaId: cB.id, studentId: ev.a });
  await admin.coreografias.addAluno.mutate({ coreografiaId: cB.id, studentId: ev.b });
  await admin.coreografias.addAluno.mutate({ coreografiaId: cC.id, studentId: ev.b });
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: cA.id, importCast: false });
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: cC.id, importCast: false });
  await admin.eventos.linkCoreografia.mutate({ eventId: ev.id, coreografiaId: cB.id, importCast: false });

  const detail = await admin.eventos.getById.query({ id: ev.id });
  const ids = detail.coreografias.map((c) => c.id);
  const suggestion = await admin.eventos.suggestOrder.mutate({ eventId: ev.id });
  expect(suggestion.orderedIds.length === 3, "ordem sugerida incompleta");
  expect(new Set(suggestion.orderedIds).size === 3, "ids duplicados na sugestão");
  expect(ids.every((id) => suggestion.orderedIds.includes(id)), "sugestão perdeu apresentação");
  expect(Array.isArray(suggestion.notes), "notas ausentes");
  await admin.eventos.reorderPresentations.mutate({ eventId: ev.id, orderedIds: suggestion.orderedIds });
  const after = await admin.eventos.getById.query({ id: ev.id });
  const firstSuggested = detail.coreografias.find((c) => c.id === suggestion.orderedIds[0]);
  expect(after.coreografias[0].id === firstSuggested.id, "aplicação da ordem falhou");
  ev.coreos = [cA.id, cB.id, cC.id];
  return `notas=${(suggestion.notes ?? []).length} · conflitos=${suggestion.remainingConflicts}`;
});

await step("Relatório do evento reflete lançamentos", async () => {
  const list = await admin.eventos.financesList.query({ eventId: ev.id });
  expect(list.length === 2, "lançamentos não listados");
  const del = list.find((l) => l.kind === "receita");
  await admin.eventos.financeDelete.mutate({ id: del.id });
  const s = await admin.eventos.financeSummary.query({ eventId: ev.id });
  expect(s.receitasManuais === 0, "exclusão não refletiu");
  return "exclusão ok";
});

await step("Limpeza geral", async () => {
  const detail = await admin.eventos.getById.query({ id: ev.id });
  for (const c of detail.coreografias) {
    try { await admin.eventos.unlinkCoreografia.mutate({ id: c.id }); } catch { /* ok */ }
  }
  for (const id of ev.coreos ?? []) {
    try { await admin.coreografias.delete.mutate({ id }); } catch { /* ok */ }
  }
  await admin.tickets.purgeEventTickets.mutate({ eventId: ev.id, confirm: true });
  try { await admin.figurinos.delete.mutate({ id: ev.costume }); } catch { /* ok */ }
  await admin.eventos.delete.mutate({ id: ev.id });
  return "ok";
});

const pass = results.filter((r) => r.status === "PASS").length;
console.log(`\n=============== RESUMO CACABUG OPERAÇÃO ===============`);
console.log(`Passos: ${results.length} · PASS: ${pass} · FAIL: ${results.length - pass}`);
if (!process.env.SCHOOL_EMAIL) console.log(`\nEscola de teste: ${schoolEmail} / ${schoolPass}`);
process.exit(results.length - pass === 0 ? 0 : 1);
