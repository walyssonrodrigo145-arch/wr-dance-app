// E2E REAL (v2, corrigido) — escola de dança do zero contra a API de produção.
// Uso: node vps-script/_tmp_e2e_flow2.mjs
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const BASE = "https://dancepro.wrmusicpro.com.br/api/trpc";
const results = [];
const ctxStore = {};

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

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const todayISO = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const [ty, tm] = todayISO.split("-").map(Number);
const todayDow = new Date(ty, tm - 1, Number(todayISO.slice(8, 10))).getDay();
const curMonth = tm;
const curYear = ty;
const monthOffset = (off) => {
  let m = curMonth + off;
  let y = curYear;
  while (m <= 0) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { month: m, year: y };
};
function validCnpj() {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 9));
  const digits = [...n, 0, 0, 0, 1];
  const calc = (base, weights) => {
    const sum = base.reduce((acc, d, i) => acc + d * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  digits[12] = calc(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  digits[13] = calc(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = digits.join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

const stamp = Date.now().toString().slice(-6);
const schoolEmail = process.env.SCHOOL_EMAIL || `flowtest.dancepro.${stamp}@gmail.com`;
const schoolPass = process.env.SCHOOL_PASS || "flowdance2026";
const studentEmail = `aluna.flow.${stamp}@gmail.com`;
const professorEmail = `prof.flow.${stamp}@gmail.com`;

const admin = makeSession();
const student = makeSession();
const professor = makeSession();
const publicClient = makeSession();

console.log(`\n=== E2E DancePro v2 — ${todayISO} (seg=${todayDow === 1 ? "ok" : "hoje é dia " + todayDow}) — ${schoolEmail}\n`);

// ── 1. CADASTRO DA ESCOLA ──────────────────────────────────────────────────
if (!process.env.SCHOOL_EMAIL) await step("Cadastro público da escola (Dance Start · 7 dias grátis)", async () => {
  const res = await publicClient.auth.registerWithPlan.mutate({
    name: `Flow Dance Studio ${stamp}`,
    email: schoolEmail,
    phone: "(11) 98888-0000",
    password: schoolPass,
    planType: "MONTHLY",
    planId: "dancepro_start",
  });
  expect(res?.success !== false, "cadastro sem sucesso");
  return `criada (${res?.success === undefined ? "ok" : res.success})`;
});

// ── 2. LOGIN ADMIN ─────────────────────────────────────────────────────────
await step("Login do administrador + auth.me (plano/status)", async () => {
  await admin.auth.login.mutate({ email: schoolEmail, password: schoolPass, loginType: "professor" });
  const me = await admin.auth.me.query();
  expect(me?.role === "admin", `role=${me?.role}`);
  ctxStore.adminId = me.id;
  ctxStore.orgId = me.organizationId;
  return `admin id=${me.id} org=${me.organizationId} status=${me.subscriptionStatus}`;
});

// ── 3. CONFIGURAÇÕES DA ESCOLA (CNPJ válido desta vez) ────────────────────
await step("Configurar escola (settings.updateSchool · CNPJ válido)", async () => {
  const cnpj = validCnpj();
  await admin.settings.updateSchool.mutate({
    schoolName: `Flow Dance Studio ${stamp}`,
    schoolCnpj: cnpj,
    schoolAddress: "Rua das Piruetas, 100",
    schoolCity: "São Paulo",
    schoolPhone: "(11) 3333-4444",
    schoolEmail,
    lessonDuration: 60,
    dueDaysForecast: "5,10,15",
    attendanceCheckinMoment: "inicio",
    attendanceToleranceMinutes: 30,
  });
  const s = await admin.settings.get.query();
  expect(String(s?.schoolName || "").includes("Flow Dance"), "schoolName não persistiu");
  return `ok (cnpj ${cnpj.slice(0, 6)}...)`;
});

// ── 4. MODALIDADES E SALAS ─────────────────────────────────────────────────
await step("Criar modalidades Ballet e Jazz (create + list)", async () => {
  await admin.instruments.create.mutate({ name: "Ballet", category: "classico", color: "#ec4899" });
  await admin.instruments.create.mutate({ name: "Jazz", category: "moderno", color: "#8b5cf6" });
  const list = await admin.instruments.list.query();
  const ballet = list.find((i) => i.name === "Ballet");
  const jazz = list.find((i) => i.name === "Jazz");
  expect(ballet?.id && jazz?.id, `lista: ${JSON.stringify(list.map((i) => i.name))}`);
  ctxStore.balletId = ballet.id;
  ctxStore.jazzId = jazz.id;
  return `ballet=${ballet.id} jazz=${jazz.id}`;
});
await step("Criar sala Estúdio 1 e listar", async () => {
  await admin.studioRooms.create.mutate({ name: "Estúdio 1 — Espelhos", capacity: 20, isPrincipal: true, status: "ativa" });
  const rooms = await admin.studioRooms.list.query();
  expect(rooms.length >= 1, "sala não listada");
  ctxStore.roomId = rooms[0].id;
  return `salas=${rooms.length} (id=${rooms[0].id})`;
});

// ── 5. PLANOS & BOLSAS ─────────────────────────────────────────────────────
await step("Criar plano cheio (Ballet R$ 320) e plano bolsa (Jazz R$ 149,90)", async () => {
  const p1 = await admin.schoolPlans.create.mutate({
    nome: "Ballet 1x/semana", aulasPorSemana: 1, duracaoMeses: 12, isBolsa: false,
    valorMensal: 320, valorCheio: 400, taxaInscricao: 120, diasLimite: "5,10", descricao: "Plano padrão", ativo: true,
  });
  const p2 = await admin.schoolPlans.create.mutate({
    nome: "Jazz 2x/semana (bolsa)", aulasPorSemana: 2, duracaoMeses: 6, isBolsa: true,
    valorMensal: 149.9, valorCheio: 249.9, taxaInscricao: 0, diasLimite: "10,20", descricao: "Bolsa de incentivo", ativo: true,
  });
  expect(p1?.id && p2?.id, "planos não criados");
  ctxStore.planCheioId = p1.id;
  ctxStore.planBolsaId = p2.id;
  return `cheio=${p1.id} bolsa=${p2.id}`;
});

// ── 6. PROFESSOR ───────────────────────────────────────────────────────────
await step("Criar professora Maria Silva (login + comissão 30%)", async () => {
  await admin.professores.create.mutate({
    name: "Maria Silva", email: professorEmail, password: "maria2026",
    telefone: "(11) 97777-0000", especialidade: "Ballet clássico",
    permissions: ["/aulas", "/progresso", "/relatorios"],
    paymentType: "porcentagem", paymentPercentage: "30",
  });
  const list = await admin.professores.list.query();
  const found = list.find((p) => p.email === professorEmail);
  expect(found, "professora não listada");
  ctxStore.profUserId = found.userId;
  ctxStore.profId = found.id;
  return `userId=${found.userId} professores=${list.length}`;
});

// ── 7. TURMA + AULAS ───────────────────────────────────────────────────────
await step("Criar turma Ballet Infantil (hoje, 18h, capacidade 2)", async () => {
  const res = await admin.turmas.create.mutate({
    name: "Ballet Infantil I", modalidadeId: ctxStore.balletId, professorId: ctxStore.profUserId,
    studioRoomId: ctxStore.roomId, weekdays: [todayDow], timeStr: "18:00", durationMinutes: 60,
    capacity: 2, ageMin: 6, ageMax: 10, shift: "Tarde", level: "iniciante", status: "ativa",
  });
  expect(res?.id, "turma não criada");
  ctxStore.turmaId = res.id;
  return `turmaId=${res.id}`;
});
await step("Gerar aulas do mês (grade → agenda)", async () => {
  const res = await admin.turmas.generateLessons.mutate({ id: ctxStore.turmaId, months: 1 });
  expect(res?.created > 0, JSON.stringify(res));
  return `criadas=${res.created} existentes=${res.existing} conflitos=${res.conflicts}`;
});
await step("Buscar aula de HOJE da turma", async () => {
  const res = await admin.turmas.todayLesson.query({ id: ctxStore.turmaId });
  expect(res?.lesson?.id, "sem aula hoje");
  ctxStore.lessonId = res.lesson.id;
  return `lessonId=${res.lesson.id} (${res.lesson.status})`;
});

// ── 8. ALUNAS ──────────────────────────────────────────────────────────────
await step("Cadastrar Alice (com portal) e Carla (bolsa)", async () => {
  const a = await admin.students.create.mutate({
    name: "Alice Florença", email: studentEmail, phone: "(11) 91111-1111", birthDate: "2016-05-10",
    instrumentId: ctxStore.balletId, schoolPlanId: ctxStore.planCheioId, professorId: ctxStore.profUserId,
    level: "iniciante", monthlyFee: 320, dueDay: 10, lessonType: "turma", status: "ativo",
  });
  const c = await admin.students.create.mutate({
    name: "Carla Bolsista", phone: "(11) 92222-2222", birthDate: "2015-08-20",
    instrumentId: ctxStore.jazzId, schoolPlanId: ctxStore.planBolsaId, professorId: ctxStore.profUserId,
    level: "intermediario", monthlyFee: 149.9, dueDay: 10, lessonType: "turma", status: "ativo",
  });
  expect(a?.studentId && c?.studentId, "alunas não criadas");
  ctxStore.aliceId = a.studentId;
  ctxStore.carlaId = c.studentId;
  return `alice=${a.studentId} carla=${c.studentId}`;
});
await step("Importar Beatriz por CSV já matriculada na turma", async () => {
  const res = await admin.students.importBatch.mutate({
    professorId: ctxStore.profUserId, instrumentId: ctxStore.balletId, level: "iniciante",
    rows: [{ name: "Beatriz Limite", email: `beatriz.flow.${stamp}@gmail.com`, phone: "(11) 93333-3333", birthDate: "2014-03-15", turmaId: ctxStore.turmaId }],
  });
  expect(res?.imported === 1, JSON.stringify(res));
  const list = await admin.students.list.query();
  ctxStore.beatrizId = list.find((s) => s.name === "Beatriz Limite")?.id;
  return `importados=${res.imported} matriculados=${res.enrolled} fila=${res.waitlisted}`;
});

// ── 9. MATRÍCULA EM TURMA (vaga × fila) ────────────────────────────────────
await step("Matricular Alice (vaga) e Carla (fila — turma lotou)", async () => {
  const r1 = await admin.turmas.setStudentTurmas.mutate({ studentId: ctxStore.aliceId, turmaIds: [ctxStore.turmaId] });
  const r2 = await admin.turmas.setStudentTurmas.mutate({ studentId: ctxStore.carlaId, turmaIds: [ctxStore.turmaId] });
  const turmas = await admin.turmas.list.query({ status: "ativa" });
  const t = turmas.find((x) => x.id === ctxStore.turmaId);
  const vagas = (t?.capacity ?? 0) - (t?.matriculados ?? 0);
  expect(r1.waitlisted.length === 0 && r2.waitlisted.length === 1, `alice=${JSON.stringify(r1.waitlisted)} carla=${JSON.stringify(r2.waitlisted)}`);
  expect(t?.espera === 1, `espera=${t?.espera}`);
  return `Alice ativa · Carla na fila (vagas=${vagas} espera=${t.espera})`;
});

// ── 10. CHAMADA (presença + extra + remoção) ───────────────────────────────
await step("Abrir chamada de hoje (lista = Beatriz + Alice)", async () => {
  const data = await admin.turmaAttendance.get.query({ lessonId: ctxStore.lessonId });
  expect(data?.roster?.length === 2, `lista=${data?.roster?.length}`);
  return `chamada: ${data.roster.map((r) => r.name).join(", ")}`;
});
await step("Incluir Carla (fila) como EXTRA nesta aula", async () => {
  await admin.turmaAttendance.addStudent.mutate({ lessonId: ctxStore.lessonId, studentId: ctxStore.carlaId, scope: "single" });
  const data = await admin.turmaAttendance.get.query({ lessonId: ctxStore.lessonId });
  expect(data.roster.some((r) => r.isExtra && r.id === ctxStore.carlaId), "extra não apareceu");
  return `total na aula=${data.roster.length} (extra: Carla)`;
});
await step("Salvar chamada (Beatriz e Alice presentes · Carla justificada)", async () => {
  const res = await admin.turmaAttendance.save.mutate({
    lessonId: ctxStore.lessonId,
    entries: [
      { studentId: ctxStore.beatrizId, status: "presente" },
      { studentId: ctxStore.aliceId, status: "presente" },
      { studentId: ctxStore.carlaId, status: "justificado" },
    ],
  });
  expect(res?.saved === 3, `salvos=${res?.saved}`);
  return `presenças salvas=${res.saved}`;
});
await step("Remover Carla desta aula (exceção só desta aula)", async () => {
  await admin.turmaAttendance.removeStudent.mutate({ lessonId: ctxStore.lessonId, studentId: ctxStore.carlaId, scope: "single" });
  const data = await admin.turmaAttendance.get.query({ lessonId: ctxStore.lessonId });
  expect(!data.roster.some((r) => r.id === ctxStore.carlaId), "Carla continua na lista");
  const staleAttendance = (data.attendance || []).some((a) => a.studentId === ctxStore.carlaId);
  expect(!staleAttendance, "presença da Carla ficou órfã após a remoção");
  return `lista final: ${data.roster.map((r) => r.name).join(", ")} · presença removida junto`;
});

// ── 11. PORTAL DO ALUNO ────────────────────────────────────────────────────
await step("Habilitar acesso da Alice ao portal + login da aluna", async () => {
  await admin.students.enablePortalAccess.mutate({ studentId: ctxStore.aliceId, email: studentEmail, password: "aluno123" });
  await student.auth.login.mutate({ email: studentEmail, password: "aluno123", loginType: "aluno" });
  const me = await student.auth.me.query();
  expect(me?.role === "aluno", `role=${me?.role}`);
  return `aluna logada (${me.name})`;
});
await step("Portal: aulas, pagamentos e agenda da aluna", async () => {
  const lessons = await student.studentPortal.getLessons.query();
  const payments = await student.studentPortal.getPayments.query();
  const schedule = await student.studentPortal.getSchedule.query();
  expect(Array.isArray(lessons) && lessons.length >= 1, `aulas no portal=${lessons?.length}`);
  return `aulas=${lessons.length} pagamentos=${payments.length} agenda=${schedule.length}`;
});

// ── 12. FINANCEIRO ─────────────────────────────────────────────────────────
await step("Importar mensalidades em aberto (Alice com 4 meses)", async () => {
  const pt = monthOffset(-4);
  const res = await admin.paymentDues.importBatch.mutate({
    rows: [{ studentId: ctxStore.aliceId, amount: 320, dueDay: 10, paidThroughMonth: pt.month, paidThroughYear: pt.year }],
  });
  expect(res?.created >= 4, `criadas=${res?.created}`);
  return `criadas=${res.created} (ignorados=${res.skipped})`;
});
await step("Dar baixa na mensalidade mais antiga (markPaid)", async () => {
  const overdueBefore = await admin.paymentDues.overdue.query();
  const aliceOverdue = overdueBefore.filter((d) => d.studentId === ctxStore.aliceId);
  expect(aliceOverdue.length === 4, `atrasadas da Alice=${aliceOverdue.length}`);
  const oldest = aliceOverdue.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  await admin.paymentDues.markPaid.mutate({ id: oldest.id });
  const after = await admin.paymentDues.overdue.query();
  const stillThere = after.some((d) => d.id === oldest.id);
  expect(!stillThere, "fatura paga continua na inadimplência");
  return `fatura #${oldest.id} baixada (atrasadas ${aliceOverdue.length} -> ${aliceOverdue.length - 1})`;
});
await step("Inadimplência reflete só o que falta + dashboard", async () => {
  const overdue = await admin.paymentDues.overdue.query();
  const stats = await admin.dashboard.stats.query();
  const today = await admin.dashboard.todaySummary.query();
  const aliceOverdue = overdue.filter((d) => d.studentId === ctxStore.aliceId);
  expect(aliceOverdue.length === 3, `atrasadas da Alice=${aliceOverdue.length} (esperado 3)`);
  return `atrasadas(Alice)=${aliceOverdue.length} alunos=${stats.totalStudents} aulasHoje=${today?.aulasHoje}`;
});

// ── 13. REMATRÍCULA (com desativação e promoção da fila) ──────────────────
await step("Rematrícula: renovar Alice 3 meses e desativar quem não renovou", async () => {
  const list = await admin.renewals.list.query({});
  expect(list.length >= 2, `linhas de rematrícula=${list.length}`);
  const res = await admin.renewals.run.mutate({
    startMonth: monthOffset(1).month, startYear: monthOffset(1).year, monthsCount: 3,
    studentIds: [ctxStore.aliceId], turmaIds: [ctxStore.turmaId], deactivateUnselected: true,
  });
  expect(res?.renewed === 1 && res?.deactivated === 1, JSON.stringify(res));
  ctxStore.renewal = res;
  return `renovada=Alice · desativada=Beatriz · mensalidades=${res.duesCreated} aulas=${res.lessonsCreated}`;
});
await step("Fila promovida: Carla assume a vaga da Beatriz", async () => {
  const turmas = await admin.turmas.list.query({ status: "ativa" });
  const t = turmas.find((x) => x.id === ctxStore.turmaId);
  const carlaEnroll = await admin.turmas.studentTurmas.query({ studentId: ctxStore.carlaId });
  const nowAtiva = carlaEnroll.some((e) => e.status === "ativa" && e.turmaId === ctxStore.turmaId);
  expect(nowAtiva, `Carla status=${JSON.stringify(carlaEnroll.map((e) => e.status))}`);
  expect((t?.espera ?? 1) === 0, `espera=${t?.espera}`);
  const beatriz = (await admin.students.list.query()).find((s) => s.id === ctxStore.beatrizId);
  return `Carla ativa (promovida) · Beatriz status=${beatriz?.status} · espera=${t?.espera}`;
});

// ── 14. PROFESSORA (aulas de hoje no painel dela) ─────────────────────────
await step("Login da professora + aulas de hoje", async () => {
  await professor.auth.login.mutate({ email: professorEmail, password: "maria2026", loginType: "professor" });
  const me = await professor.auth.me.query();
  const todayLessons = await professor.lessons.list.query({ date: todayISO });
  expect(me?.role === "professor", `role=${me?.role}`);
  expect(todayLessons.length >= 1, `aulas hoje para a professora=${todayLessons.length}`);
  return `prof logada · aulas hoje=${todayLessons.length}`;
});

// ── 15. SAÚDE E AVALIAÇÕES ────────────────────────────────────────────────
await step("Saúde: avaliação física da Alice", async () => {
  const res = await admin.saude.create.mutate({
    studentId: ctxStore.aliceId, recordDate: todayISO,
    weightKg: 28.5, heightCm: 132, flexibilityCm: 18, conditioning: "bom",
  });
  expect(res?.success, JSON.stringify(res));
  const list = await admin.saude.list.query({ studentId: ctxStore.aliceId });
  expect(list.length >= 1, "registro não listado");
  return `registro id=${res.id} (lista=${list.length})`;
});
await step("Avaliações: abrir período e ver relatório/ranking", async () => {
  const config = await admin.avaliacoes.getConfig.query();
  await admin.avaliacoes.openPeriod.mutate();
  const report = await admin.avaliacoes.report.query({});
  const ranking = await admin.avaliacoes.ranking.query({});
  return `config=${config ? "ok" : "vazio"} relatorio=${Array.isArray(report) ? report.length : "ok"} ranking=${Array.isArray(ranking) ? ranking.length : "ok"}`;
});

// ── 16. LOJA ──────────────────────────────────────────────────────────────
await step("Loja: figurino + venda para Alice (avulso)", async () => {
  const costume = await admin.figurinos.create.mutate({
    name: `Sapatilha de ponta nº 36 (${stamp})`, type: "sapatilha", size: "36",
    quantity: 5, cost: 90, salePrice: 160, sellable: true,
  });
  expect(costume?.id, "figurino não criado");
  const sale = await admin.figurinos.sell.mutate({ costumeId: costume.id, studentId: ctxStore.aliceId, quantity: 1, paymentMode: "avulso" });
  const list = await admin.figurinos.list.query({ search: "Sapatilha de ponta" });
  const item = list.find((c) => c.id === costume.id);
  return `venda=${sale?.saleId ?? sale?.id ?? "ok"} estoque=${item?.quantity}`;
});

// ── 17. CONTRATOS + INDICAÇÃO ─────────────────────────────────────────────
await step("Contratos: modelos padrão + criar modelo em blocos", async () => {
  const templates = await admin.contractTemplates.list.query();
  const created = await admin.contractTemplates.create.mutate({
    name: `Contrato Ballet Infantil ${stamp}`, description: "Com autorização de imagem",
    content: "CONTRATO DE DANÇA\n\nCLÁUSULA 1ª — DAS AULAS\nAulas de {{modalidade}} para {{student_name}}.",
    blocks: JSON.stringify([
      { type: "titulo", title: "CONTRATO DE DANÇA", text: "" },
      { type: "clausula", title: "CLÁUSULA 1ª — DAS AULAS", text: "Aulas de {{modalidade}} para {{student_name}}." },
    ]),
  });
  expect(created?.id, "modelo não criado");
  return `padrões=${templates.length} novo=${created.id}`;
});
await step("Indique e Ganhe: código + indicação + lista", async () => {
  const code = await admin.referral.getMyCode.query();
  expect(code?.code, "sem código");
  await publicClient.referral.publicRegister.mutate({
    code: code.code, schoolName: `Escola Indicada ${stamp}`, email: `indicada.flow.${stamp}@gmail.com`,
  });
  const list = await admin.referral.list.query();
  expect(list.length >= 1 && list[0].status === "pendente", JSON.stringify(list.map((r) => r.status)));
  return `code=${code.code} indicações=${list.length}`;
});

// ── 18. LEITURAS FINAIS (relatórios/dashboard) ────────────────────────────
await step("Leituras essenciais: alunos, planos, faturas, salas, turmas, dashboard", async () => {
  const [students, plans, dues, rooms, turmas, stats] = await Promise.all([
    admin.students.list.query(),
    admin.schoolPlans.list.query(),
    admin.paymentDues.list.query({}),
    admin.studioRooms.list.query(),
    admin.turmas.list.query({ status: "ativa" }),
    admin.dashboard.stats.query(),
  ]);
  expect(stats.totalStudents >= 3, `alunos no dashboard=${stats.totalStudents}`);
  return `alunos=${students.length} planos=${plans.length} faturas=${dues.length} salas=${rooms.length} turmas=${turmas.length} estudantes(dash)=${stats.totalStudents}`;
});

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
console.log("\n================ RESUMO ================");
console.log(`Passos: ${results.length} · PASS: ${passed} · FAIL: ${failed.length}`);
for (const f of failed) console.log(`❌ ${f.name} — ${f.detail}`);
console.log("\n=== CONTEXTO ===");
console.log(JSON.stringify({
  schoolEmail, orgId: ctxStore.orgId, turmaId: ctxStore.turmaId, lessonId: ctxStore.lessonId,
  aliceId: ctxStore.aliceId, carlaId: ctxStore.carlaId, beatrizId: ctxStore.beatrizId,
  studentEmail, professorEmail, renewal: ctxStore.renewal,
}, null, 2));
