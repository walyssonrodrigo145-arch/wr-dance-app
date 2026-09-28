// E2E REAL — simula uma escola de dança do zero usando a API de produção.
// Uso: node vps-script/_tmp_e2e_flow.mjs
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
  const client = createTRPCProxyClient({
    links: [httpBatchLink({ url: BASE, fetch: doFetch, transformer: superjson })],
  });
  return { client, jar };
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

function expect(cond, message) {
  if (!cond) throw new Error(message);
  return true;
}

const brtNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const todayISO = brtNow.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const [ty, tm, td] = todayISO.split("-").map(Number);
const todayDow = new Date(ty, tm - 1, td).getDay();
const curMonth = tm;
const curYear = ty;
const stamp = Date.now().toString().slice(-6);
const schoolEmail = `flowtest.dancepro.${stamp}@gmail.com`;
const schoolPass = "flowdance2026";
const studentEmail = `aluna.flow.${stamp}@gmail.com`;
const professorEmail = `prof.flow.${stamp}@gmail.com`;

const admin = makeSession();
const student = makeSession();
const professor = makeSession();
const publicClient = makeSession().client;

console.log(`\n=== E2E DancePro — ${todayISO} (dia da semana: ${todayDow}) — escola ${schoolEmail}\n`);

// ── 1. CADASTRO DA ESCOLA (fluxo público real) ─────────────────────────────
const org = await step("Cadastro público da escola (registerWithPlan · Dance Start)", async () => {
  const res = await publicClient.auth.registerWithPlan.mutate({
    name: `Flow Dance Studio ${stamp}`,
    email: schoolEmail,
    phone: "(11) 98888-0000",
    password: schoolPass,
    planType: "MONTHLY",
    planId: "dancepro_start",
  });
  ctxStore.orgId = res?.organizationId || res?.org?.id || res?.id;
  expect(res?.success !== false, "cadastro retornou sem sucesso");
  return `orgId=${ctxStore.orgId}`;
});

// ── 2. LOGIN ADMIN + IDENTIDADE ────────────────────────────────────────────
await step("Login do administrador + auth.me", async () => {
  await admin.client.auth.login.mutate({ email: schoolEmail, password: schoolPass, loginType: "professor" });
  const me = await admin.client.auth.me.query();
  expect(me?.role === "admin", `esperado admin, veio ${me?.role}`);
  ctxStore.adminId = me.id;
  ctxStore.orgId = me.organizationId;
  return `role=${me.role} org=${me.organizationId} plano=${me.subscriptionStatus}`;
});

// ── 3. CONFIGURAÇÕES DA ESCOLA ─────────────────────────────────────────────
await step("Configurar dados da escola (settings.updateSchool)", async () => {
  await admin.client.settings.updateSchool.mutate({
    schoolName: `Flow Dance Studio ${stamp}`,
    schoolCnpj: "12.345.678/0001-90",
    schoolAddress: "Rua das Piruetas, 100",
    schoolCity: "São Paulo",
    schoolPhone: "(11) 3333-4444",
    schoolEmail: schoolEmail,
    lessonDuration: 60,
    dueDaysForecast: "5,10,15",
    attendanceCheckinMoment: "inicio",
    attendanceToleranceMinutes: 30,
  });
  const s = await admin.client.settings.get.query();
  expect(String(s?.schoolName || "").includes("Flow Dance Studio"), "schoolName não persistiu");
  return `schoolName ok, lessonDuration=${s?.lessonDuration ?? "?"}`;
});

// ── 4. MODALIDADES E SALAS ─────────────────────────────────────────────────
const ballet = await step("Criar modalidade Ballet", async () => {
  const res = await admin.client.instruments.create.mutate({ name: "Ballet", category: "classico", color: "#ec4899" });
  return `id=${res?.id}`;
});
const jazz = await step("Criar modalidade Jazz", async () => {
  const res = await admin.client.instruments.create.mutate({ name: "Jazz", category: "moderno", color: "#8b5cf6" });
  return `id=${res?.id}`;
});
await step("Criar sala (Estúdio 1) e listar salas", async () => {
  await admin.client.studioRooms.create.mutate({ name: "Estúdio 1 — Espelhos", capacity: 20, isPrincipal: true, status: "ativa" });
  const rooms = await admin.client.studioRooms.list.query();
  expect(rooms.length >= 1, "sala não apareceu na listagem");
  return `salas=${rooms.length}`;
});

// ── 5. PLANOS & BOLSAS ─────────────────────────────────────────────────────
const planCheio = await step("Criar plano de valor cheio (Ballet 1x/semana R$ 320)", async () => {
  const res = await admin.client.schoolPlans.create.mutate({
    nome: "Ballet 1x/semana",
    aulasPorSemana: 1,
    duracaoMeses: 12,
    isBolsa: false,
    valorMensal: 320,
    valorCheio: 400,
    taxaInscricao: 120,
    diasLimite: "5,10",
    descricao: "Plano padrão de ballet",
    ativo: true,
  });
  return `id=${res?.id}`;
});
const planBolsa = await step("Criar plano com bolsa (Jazz R$ 149,90 de R$ 249,90)", async () => {
  const res = await admin.client.schoolPlans.create.mutate({
    nome: "Jazz 2x/semana (bolsa)",
    aulasPorSemana: 2,
    duracaoMeses: 6,
    isBolsa: true,
    valorMensal: 149.9,
    valorCheio: 249.9,
    taxaInscricao: 0,
    diasLimite: "10,20",
    descricao: "Bolsa de incentivo",
    ativo: true,
  });
  return `id=${res?.id}`;
});

// ── 6. PROFESSOR ───────────────────────────────────────────────────────────
const profUserId = await step("Criar professora Maria Silva (com login)", async () => {
  const res = await admin.client.professores.create.mutate({
    name: "Maria Silva",
    email: professorEmail,
    password: "maria2026",
    telefone: "(11) 97777-0000",
    especialidade: "Ballet clássico",
    permissions: ["/aulas", "/progresso", "/relatorios"],
    paymentType: "porcentagem",
    paymentPercentage: "30",
  });
  const list = await admin.client.professores.list.query();
  const found = list.find((p) => p.email === professorEmail || p.name === "Maria Silva");
  expect(found, "professora não apareceu na listagem");
  ctxStore.profUserId = found.userId;
  return `professores=${list.length} userId=${found.userId}`;
});

// ── 7. TURMA + GERAÇÃO DE AULAS ────────────────────────────────────────────
const turmaId = await step("Criar turma Ballet Infantil (hoje, 18h, capacidade 2)", async () => {
  const res = await admin.client.turmas.create.mutate({
    name: "Ballet Infantil I",
    modalidadeId: ballet?.id ?? null,
    professorId: ctxStore.profUserId,
    studioRoomId: null,
    weekdays: [todayDow],
    timeStr: "18:00",
    durationMinutes: 60,
    capacity: 2,
    ageMin: 6,
    ageMax: 10,
    shift: "Tarde",
    level: "iniciante",
    status: "ativa",
  });
  expect(res?.id, "turma não criada");
  return `turmaId=${res.id}`;
});
await step("Gerar aulas do mês (1 mês)", async () => {
  const res = await admin.client.turmas.generateLessons.mutate({ id: turmaId, months: 1 });
  expect(res?.created > 0, `nenhuma aula gerada (${JSON.stringify(res)})`);
  ctxStore.generated = res.created;
  return `aulas geradas=${res.created} existentes=${res.existing} conflitos=${res.conflicts}`;
});
const todayLessonId = await step("Buscar aula de HOJE da turma", async () => {
  const res = await admin.client.turmas.todayLesson.query({ id: turmaId });
  expect(res?.lesson?.id, "sem aula hoje (grade não gerou para hoje?)");
  return `lessonId=${res.lesson.id}`;
});

// ── 8. ALUNAS (cadastro individual + importação em lote) ──────────────────
const aliceId = await step("Cadastrar aluna Alice (com acesso ao portal)", async () => {
  const res = await admin.client.students.create.mutate({
    name: "Alice Florença",
    email: studentEmail,
    phone: "(11) 91111-1111",
    birthDate: "2016-05-10",
    instrumentId: ballet?.id ?? undefined,
    schoolPlanId: planCheio?.id ?? undefined,
    professorId: ctxStore.profUserId,
    level: "iniciante",
    monthlyFee: 320,
    dueDay: 10,
    lessonType: "turma",
    temporaryPassword: "aluno123",
    status: "ativo",
  });
  expect(res?.studentId, `aluno não criado: ${JSON.stringify(res)}`);
  return `studentId=${res.studentId}`;
});
const carlaId = await step("Cadastrar aluna Carla (plano com bolsa)", async () => {
  const res = await admin.client.students.create.mutate({
    name: "Carla Bolsista",
    phone: "(11) 92222-2222",
    birthDate: "2015-08-20",
    instrumentId: jazz?.id ?? undefined,
    schoolPlanId: planBolsa?.id ?? undefined,
    professorId: ctxStore.profUserId,
    level: "intermediario",
    monthlyFee: 149.9,
    dueDay: 10,
    lessonType: "turma",
    status: "ativo",
  });
  expect(res?.studentId, "Carla não criada");
  return `studentId=${res.studentId}`;
});
await step("Importar Beatriz por CSV já matriculada na turma", async () => {
  const res = await admin.client.students.importBatch.mutate({
    professorId: ctxStore.profUserId,
    instrumentId: ballet?.id ?? null,
    level: "iniciante",
    rows: [{
      name: "Beatriz Limite",
      email: `beatriz.flow.${stamp}@gmail.com`,
      phone: "(11) 93333-3333",
      birthDate: "2014-03-15",
      turmaId,
    }],
  });
  expect(res?.imported === 1, `import falhou: ${JSON.stringify(res)}`);
  return `importados=${res.imported} matriculados=${res.enrolled} espera=${res.waitlisted}`;
});

// ── 9. MATRÍCULA EM TURMA (vaga × lista de espera) ────────────────────────
await step("Matricular Alice e Carla na turma (2 vagas)", async () => {
  const r1 = await admin.client.turmas.setStudentTurmas.mutate({ studentId: aliceId, turmaIds: [turmaId] });
  const r2 = await admin.client.turmas.setStudentTurmas.mutate({ studentId: carlaId, turmaIds: [turmaId] });
  expect(r1.added.length === 1 && r2.added.length === 1, "matrícula não confirmada");
  return `Alice=${r1.added.length} vaga, Carla=${r2.added.length} vaga`;
});
await step("Turma LOTADA → Beatriz (importada) fica na lista de espera", async () => {
  const turmas = await admin.client.turmas.list.query({ status: "ativa" });
  const t = turmas.find((x) => x.id === turmaId);
  expect(Number(t?.espera) >= 1 || Number(t?.vagas) === 0, `espera=${t?.espera} vagas=${t?.vagas}`);
  const stats = await admin.client.turmas.stats.query();
  expect(stats.espera >= 1, `stats.espera=${stats.espera}`);
  return `vagas=${t?.vagas} espera=${t?.espera} matriculados=${t?.matriculados}`;
});

// ── 10. CHAMADA DA TURMA (presença + extra + remoção) ─────────────────────
await step("Abrir chamada de hoje e conferir a lista", async () => {
  const data = await admin.client.turmaAttendance.get.query({ lessonId: todayLessonId });
  expect(data?.roster?.length === 2, `lista veio com ${data?.roster?.length}`);
  return `alunas na chamada=${data.roster.map((r) => r.name).join(", ")}`;
});
await step("Salvar chamada (Alice presente · Carla justificada)", async () => {
  const res = await admin.client.turmaAttendance.save.mutate({
    lessonId: todayLessonId,
    entries: [
      { studentId: aliceId, status: "presente" },
      { studentId: carlaId, status: "justificado" },
    ],
  });
  expect(res?.saved === 2, `salvou ${res?.saved}`);
  return `presenças salvas=${res.saved}`;
});
await step("Incluir aluna EXTRA na aula (Beatriz, só esta aula)", async () => {
  const res = await admin.client.turmaAttendance.addStudent.mutate({ lessonId: todayLessonId, studentId: (await admin.client.students.list.query()).find((s) => s.name === "Beatriz Limite")?.id, scope: "single" });
  const data = await admin.client.turmaAttendance.get.query({ lessonId: todayLessonId });
  const extra = data.roster.find((r) => r.isExtra);
  expect(extra, "extra não apareceu na chamada");
  return `extra=${extra.name} total=${data.roster.length}`;
});
await step("Remover aluna da aula (só esta aula) e conferir", async () => {
  await admin.client.turmaAttendance.removeStudent.mutate({ lessonId: todayLessonId, studentId: carlaId, scope: "single" });
  const data = await admin.client.turmaAttendance.get.query({ lessonId: todayLessonId });
  expect(!data.roster.some((r) => r.id === carlaId), "Carla ainda na lista");
  return `lista agora=${data.roster.map((r) => r.name).join(", ")}`;
});

// ── 11. FINANCEIRO (mensalidades em aberto + baixa) ───────────────────────
await step("Importar mensalidades em aberto (Alice e Carla com saldo)", async () => {
  const res = await admin.client.paymentDues.importBatch.mutate({
    rows: [
      { studentId: aliceId, amount: 320, dueDay: 10, paidThroughMonth: curMonth === 1 ? 12 : curMonth - 1, paidThroughYear: curMonth === 1 ? curYear - 1 : curYear },
      { studentId: carlaId, amount: 149.9, dueDay: 10, paidThroughMonth: curMonth - 2 <= 0 ? 12 : curMonth - 2, paidThroughYear: curMonth - 2 <= 0 ? curYear - 1 : curYear },
    ],
  });
  expect(res?.created >= 2, `criadas ${res?.created}`);
  return `mensalidades criadas=${res.created} (ignorados=${res.skipped})`;
});
await step("Dar baixa em uma mensalidade (markPaid)", async () => {
  const dues = await admin.client.paymentDues.list.query({});
  const pending = dues.find((d) => d.status !== "pago");
  expect(pending, "sem mensalidade pendente");
  await admin.client.paymentDues.markPaid.mutate({ id: pending.id });
  const after = await admin.client.paymentDues.list.query({});
  const paid = after.find((d) => d.id === pending.id);
  expect(paid?.status === "pago", `status após baixa: ${paid?.status}`);
  return `fatura ${pending.id} paga (${paid.status})`;
});
await step("Inadimplência e resumo do dashboard", async () => {
  const overdue = await admin.client.paymentDues.overdue.query();
  const stats = await admin.client.dashboard.stats.query();
  const today = await admin.client.dashboard.todaySummary.query();
  expect(stats && typeof stats.totalStudents === "number", "dashboard.stats inválido");
  return `atrasadas=${overdue.length} alunos=${stats.totalStudents} aulasHoje=${today?.aulasHoje}`;
});

// ── 12. REMATRÍCULA DO PERÍODO ─────────────────────────────────────────────
await step("Rematrícula: renovar Alice e Carla por 3 meses", async () => {
  const list = await admin.client.renewals.list.query({});
  expect(list.length >= 2, `lista de rematrícula com ${list.length} linhas`);
  const res = await admin.client.renewals.run.mutate({
    startMonth: curMonth === 12 ? 1 : curMonth + 1,
    startYear: curMonth === 12 ? curYear + 1 : curYear,
    monthsCount: 3,
    studentIds: [aliceId, carlaId],
    turmaIds: [turmaId],
    deactivateUnselected: true,
  });
  expect(res?.duesCreated >= 0 && res?.renewed === 2, JSON.stringify(res));
  return `renovados=${res.renewed} mensalidades=${res.duesCreated} aulas=${res.lessonsCreated} desativados=${res.deactivated}`;
});

// ── 13. INDICAÇÃO (Indique e Ganhe) ────────────────────────────────────────
await step("Indique e Ganhe: código + indicação pública + lista", async () => {
  const code = await admin.client.referral.getMyCode.query();
  expect(code?.code, "sem código de indicação");
  await publicClient.referral.publicRegister.mutate({
    code: code.code,
    schoolName: "Escola Indicada Teste",
    email: `indicada.flow.${stamp}@gmail.com`,
    phone: "(21) 98888-7777",
  });
  const list = await admin.client.referral.list.query();
  expect(list.length === 1 && list[0].status === "pendente", JSON.stringify(list));
  return `code=${code.code} indicacoes=${list.length} (${list[0].status})`;
});

// ── 14. CONTRATOS (modelos em blocos) ──────────────────────────────────────
await step("Modelos de contrato: listar padrões e criar modelo em blocos", async () => {
  const templates = await admin.client.contractTemplates.list.query();
  expect(templates.length >= 2, `modelos padrão: ${templates.length}`);
  const created = await admin.client.contractTemplates.create.mutate({
    name: "Contrato Ballet Infantil",
    description: "Modelo com autorização de imagem",
    content: "CONTRATO DE DANÇA\n\nCLÁUSULA 1ª — DAS AULAS\nAulas de {{modalidade}} para {{student_name}}.",
    blocks: JSON.stringify([
      { type: "titulo", title: "CONTRATO DE DANÇA", text: "" },
      { type: "clausula", title: "CLÁUSULA 1ª — DAS AULAS", text: "Aulas de {{modalidade}} para {{student_name}}." },
    ]),
  });
  expect(created?.id, "modelo não criado");
  return `padrões=${templates.length} novo=${created.id}`;
});

// ── 15. LOJA / FIGURINO (estoque + venda) ─────────────────────────────────
await step("Loja: cadastrar figurino e vender para a aluna", async () => {
  const costume = await admin.client.figurinos.create.mutate({
    name: "Sapatilha de ponta nº 36",
    type: "sapatilha",
    size: "36",
    quantity: 5,
    cost: 90,
    salePrice: 160,
    sellable: true,
  });
  expect(costume?.id, "figurino não criado");
  const sale = await admin.client.figurinos.sell.mutate({
    costumeId: costume.id,
    studentId: aliceId,
    quantity: 1,
    paymentMode: "avulso",
  });
  const list = await admin.client.figurinos.list.query({ search: "Sapatilha" });
  return `figurino=${costume.id} venda=${sale?.saleId ?? sale?.id ?? "ok"} estoque=${JSON.stringify(list[0]?.quantity ?? "?")}`;
});

// ── 16. PESSOAS (plano de aula / IA / ranking / saúde) ────────────────────
await step("Rankings e avaliações disponíveis", async () => {
  const rankings = await admin.client.rankings.list.query({}).catch(() => null);
  const avaliacoes = await admin.client.avaliacoes.listPeriods.query?.() ?? null;
  return `rankings=${Array.isArray(rankings) ? rankings.length : "n/d"} avaliacoes=${avaliacoes ? "ok" : "n/d"}`;
});
await step("Saúde da aluna: registrar avaliação física", async () => {
  const res = await admin.client.saude.records.create?.mutate({
    studentId: aliceId,
    recordDate: todayISO,
    weightKg: 28.5,
    heightCm: 132,
    flexibilityCm: 18,
    conditioning: "bom",
  }) ?? null;
  return res ? `registro=${res?.id ?? "ok"}` : "procedure indisponível com esse input";
});

// ── 17. PORTAL DO ALUNO (login real da aluna) ─────────────────────────────
await step("Login da ALUNA no portal + aulas/pagamentos/agenda", async () => {
  await student.client.auth.login.mutate({ email: studentEmail, password: "aluno123", loginType: "aluno" });
  const lessons = await student.client.studentPortal.getLessons.query();
  const payments = await student.client.studentPortal.getPayments.query();
  const schedule = await student.client.studentPortal.getSchedule.query();
  expect(Array.isArray(lessons), "getLessons inválido");
  return `aulas visíveis=${lessons.length} pagamentos=${payments.length} agenda=${schedule.length}`;
});

// ── 18. LOGIN DO PROFESSOR ────────────────────────────────────────────────
await step("Login da PROFESSORA + aulas de hoje no painel", async () => {
  await professor.client.auth.login.mutate({ email: professorEmail, password: "maria2026", loginType: "professor" });
  const me = await professor.client.auth.me.query();
  expect(me?.role === "professor", `role=${me?.role}`);
  const upcoming = await professor.client.lessons.upcoming.query();
  const schedule = await professor.client.turmas.list.query({ status: "ativa" });
  return `prof role=${me.role} proximasAulas=${upcoming.length} turmas=${schedule.length}`;
});

// ── 19. RELATÓRIOS ────────────────────────────────────────────────────────
await step("Relatórios/MVP leituras essenciais", async () => {
  const students = await admin.client.students.list.query();
  const plans = await admin.client.schoolPlans.list.query();
  const instruments = await admin.client.instruments.list.query();
  const dues = await admin.client.paymentDues.list.query({});
  const wallet = await admin.client.settings.getMyProfile.query();
  return `alunos=${students.length} planos=${plans.length} modalidades=${instruments.length} faturas=${dues.length} perfil=${wallet?.name}`;
});

// ── RESUMO ────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
console.log("\n================ RESUMO ================");
console.log(`Total de passos: ${results.length} · PASS: ${passed} · FAIL: ${failed.length}`);
if (failed.length) {
  console.log("\n--- Falhas:");
  for (const f of failed) console.log(`❌ ${f.name} — ${f.detail}`);
}
console.log("\n=== CONTEXTO PARA VERIFICAÇÃO ===");
console.log(JSON.stringify({
  schoolEmail,
  orgId: ctxStore.orgId,
  turmaId,
  todayLessonId,
  aliceId,
  carlaId,
  studentEmail,
  professorEmail,
  generatedLessons: ctxStore.generated,
}, null, 2));
