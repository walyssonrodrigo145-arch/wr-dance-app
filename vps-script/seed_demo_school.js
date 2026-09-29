// seed_demo_school.js — Semeia a escola MODELO (org 1 / dancepro@gmail.com) com conteúdo de demonstração.
//
// Cria: 6 professoras/professor, 7 modalidades, 4 estúdios, 6 planos (até R$ 890),
// 12 turmas novas (+Ballet Baby), 106 alunas com nomes brasileiros, matrículas e
// mensalidades de 5 meses (pagas/atrasadas/pendentes) + avulsas de alto valor
// (figurino R$ 1.850, workshop R$ 980...). Guarda de segurança: aborta se a escola
// já tiver alunas @demo.dancepro.app (rode o step2 antes de reexecutar? NÃO —
// para repetir, purgue antes: DELETE FROM students WHERE "organizationId"=1 AND email LIKE '%@demo.dancepro.app';).
//
// Uso: $env:VPS_PASSWORD='...'; node vps-script/seed_demo_school.js
// Depois rode: node vps-script/seed_demo_school_step2.js (baby + preenchimento de turmas + fila)
const { Client } = require("ssh2");

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260929);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w = 2) => String(n).padStart(w, "0");
const esc = (s) => s.replace(/'/g, "''");

const FIRST_F = ["Alice","Sophia","Helena","Valentina","Laura","Isadora","Manuela","Júlia","Lívia","Cecília","Eloá","Yasmin","Antônia","Rafaela","Larissa","Beatriz","Mariana","Camila","Fernanda","Juliana","Amanda","Letícia","Vitória","Gabriela","Lorena","Carolina","Patrícia","Renata","Bruna","Nicole","Emanuelly","Heloísa","Ana Clara","Maria Eduarda","Bianca","Cléo","Nina","Olívia","Rebeca","Sarah","Thaís","Pietra","Melissa","Clara","Maria Luísa","Isabela","Ester","Lavínia","Maitê","Sarahy"];
const FIRST_M = ["Miguel","Arthur","Bernardo","Heitor","Davi","Théo","Gael","Ravi","Noah","Samuel","Pedro","Lorenzo","Matheus","Felipe","Enzo","Caio","Vicente"];
const LAST = ["Silva","Santos","Oliveira","Souza","Lima","Pereira","Costa","Ferreira","Rodrigues","Almeida","Nascimento","Carvalho","Araújo","Ribeiro","Gomes","Martins","Barbosa","Rocha","Dias","Cardoso","Teixeira","Moreira","Correia","Mendes","Freitas","Ramos","Farias","Machado","Nunes","Cunha","Lopes","Pires","Monteiro","Campos","Cavalcanti","Duarte","Vieira","Peixoto","Sales","Bittencourt","Sampaio","Fonseca"];
const NEIGHBORHOODS = ["Jardim Europa","Vila Mariana","Pinheiros","Moema","Perdizes","Tatuapé","Santana","Ipiranga","Butantã","Lapa"];

const PROFESSORS = [
  { n: 1, name: "Camila Rocha", esp: "Ballet Clássico — Método Vaganova", tel: "(11) 98811-1001", pct: 45 },
  { n: 2, name: "Juliana Prado", esp: "Ballet Clássico Avançado e Pontas", tel: "(11) 98811-1002", pct: 50 },
  { n: 3, name: "Marcos Vinícius", esp: "Jazz, Funk e Preparação Física", tel: "(11) 98811-1003", pct: 45 },
  { n: 4, name: "Renata Alves", esp: "Dança Contemporânea e Composição", tel: "(11) 98811-1004", pct: 40 },
  { n: 5, name: "Taís Nogueira", esp: "Dança do Ventre e Alongamento", tel: "(11) 98811-1005", pct: 40 },
  { n: 6, name: "Diego Sampaio", esp: "Hip Hop e K-Pop Cover", tel: "(11) 98811-1006", pct: 45 },
];
const profEmail = (n) => `prof.${n}@demo.dancepro.app`;

const MODALIDADES = [
  { name: "Ballet Clássico", category: "Dança Clássica", color: "#ec4899" },
  { name: "Jazz", category: "Dança Urbana", color: "#f59e0b" },
  { name: "Contemporâneo", category: "Dança Contemporânea", color: "#8b5cf6" },
  { name: "Hip Hop", category: "Dança Urbana", color: "#22c55e" },
  { name: "Dança do Ventre", category: "Dança Árabe", color: "#e11d48" },
  { name: "K-Pop Cover", category: "Dança Urbana", color: "#06b6d4" },
  { name: "Alongamento", category: "Condicionamento", color: "#64748b" },
];

const ROOMS = [
  { name: "Estúdio 1", cap: 20, color: "#ec4899", desc: "Sala com espelho e barra — Ballet clássico" },
  { name: "Estúdio 2", cap: 24, color: "#8b5cf6", desc: "Salão amplo com palco — Modalidades livres" },
  { name: "Estúdio 3", cap: 18, color: "#06b6d4", desc: "Sala de ensaio com linóleo profissional" },
  { name: "Estúdio 4", cap: 22, color: "#f59e0b", desc: "Sala multiuso — Urbanas e kids" },
];

const PLANS = [
  { nome: "Ballet Kids (2x/semana)", sem: 2, valor: 320, cheio: 380, desc: "Turmas infantis de ballet clássico com apresentação anual." },
  { nome: "Ballet Clássico (2x/semana)", sem: 2, valor: 380, cheio: 420, desc: "Formação em ballet clássico com metodologia e exame anual." },
  { nome: "Jazz & Contemporâneo (3x/semana)", sem: 3, valor: 450, cheio: 520, desc: "Combo de jazz e contemporâneo com coreografias de palco." },
  { nome: "Combo Show (4x/semana)", sem: 4, valor: 690, cheio: 790, desc: "Preparação para espetáculos e festivais competitivos." },
  { nome: "Formação Profissional (5x/semana)", sem: 5, valor: 890, cheio: 990, desc: "Programa intensivo de formação profissional em dança." },
  { nome: "Pilates Dance (1x/semana)", sem: 1, valor: 280, cheio: 320, desc: "Condicionamento físico e alongamento para bailarinas." },
];

const TURMAS = [
  { name: "Ballet Infantil I", modal: "Ballet Clássico", prof: 1, room: "Estúdio 1", wd: [2, 4], time: "08:30", dur: 60, cap: 12, level: "iniciante", shift: "manha", amin: 6, amax: 9 },
  { name: "Ballet Infantil II", modal: "Ballet Clássico", prof: 1, room: "Estúdio 1", wd: [2, 4], time: "10:00", dur: 60, cap: 20, level: "iniciante", shift: "manha", amin: 8, amax: 11 },
  { name: "Ballet Juvenil", modal: "Ballet Clássico", prof: 2, room: "Estúdio 2", wd: [1, 3], time: "18:00", dur: 75, cap: 24, level: "intermediario", shift: "tarde", amin: 12, amax: 17 },
  { name: "Ballet Adulto Iniciante", modal: "Ballet Clássico", prof: 2, room: "Estúdio 2", wd: [1, 3], time: "19:30", dur: 60, cap: 22, level: "iniciante", shift: "noite", amin: 18, amax: 60 },
  { name: "Balé de Pontas (Avançado)", modal: "Ballet Clássico", prof: 2, room: "Estúdio 3", wd: [5], time: "17:00", dur: 90, cap: 15, level: "avancado", shift: "tarde", amin: 14, amax: 25 },
  { name: "Jazz Teen", modal: "Jazz", prof: 3, room: "Estúdio 4", wd: [2, 4], time: "18:30", dur: 60, cap: 22, level: "intermediario", shift: "tarde", amin: 12, amax: 17 },
  { name: "Jazz Adulto", modal: "Jazz", prof: 3, room: "Estúdio 4", wd: [5], time: "19:30", dur: 60, cap: 20, level: "iniciante", shift: "noite", amin: 18, amax: 50 },
  { name: "Contemporâneo Intermediário", modal: "Contemporâneo", prof: 4, room: "Estúdio 2", wd: [3, 5], time: "17:00", dur: 75, cap: 20, level: "intermediario", shift: "tarde", amin: 12, amax: 18 },
  { name: "Dança do Ventre", modal: "Dança do Ventre", prof: 5, room: "Estúdio 3", wd: [2, 4], time: "20:00", dur: 60, cap: 18, level: "iniciante", shift: "noite", amin: 18, amax: 60 },
  { name: "Hip Hop Kids", modal: "Hip Hop", prof: 6, room: "Estúdio 4", wd: [1, 5], time: "09:30", dur: 60, cap: 20, level: "iniciante", shift: "manha", amin: 7, amax: 12 },
  { name: "K-Pop Cover", modal: "K-Pop Cover", prof: 6, room: "Estúdio 3", wd: [5], time: "18:30", dur: 75, cap: 16, level: "intermediario", shift: "tarde", amin: 12, amax: 20 },
  { name: "Alongamento & Flexibilidade", modal: "Alongamento", prof: 5, room: "Estúdio 1", wd: [1, 4], time: "07:00", dur: 50, cap: 25, level: "iniciante", shift: "manha", amin: 12, amax: 60 },
];

// plano → turmas preferidas (pesos)
const PLAN_TURMAS = {
  "Ballet Kids (2x/semana)": ["Ballet Infantil I", "Ballet Infantil II", "Hip Hop Kids"],
  "Ballet Clássico (2x/semana)": ["Ballet Juvenil", "Ballet Adulto Iniciante", "Balé de Pontas (Avançado)", "Ballet Infantil II"],
  "Jazz & Contemporâneo (3x/semana)": ["Jazz Teen", "Jazz Adulto", "Contemporâneo Intermediário"],
  "Combo Show (4x/semana)": ["Contemporâneo Intermediário", "Jazz Teen", "K-Pop Cover", "Balé de Pontas (Avançado)"],
  "Formação Profissional (5x/semana)": ["Balé de Pontas (Avançado)", "Contemporâneo Intermediário", "Jazz Teen", "K-Pop Cover"],
  "Pilates Dance (1x/semana)": ["Alongamento & Flexibilidade", "Dança do Ventre"],
};

// ── alunos ────────────────────────────────────────────────────────────────
const N_STUDENTS = 105;
const ACTIVE = 100;
const students = [];
const usedNames = new Set();
for (let i = 0; i < N_STUDENTS; i++) {
  let name;
  do {
    const first = i % 6 === 5 ? pick(FIRST_M) : pick(FIRST_F);
    name = `${first} ${pick(LAST)}${rnd() < 0.22 ? " " + pick(LAST) : ""}`;
  } while (usedNames.has(name));
  usedNames.add(name);
  const ativo = i < ACTIVE;
  const plan = pick(PLANS);
  const gender = FIRST_M.includes(name.split(" ")[0]) ? "masculino" : "feminino";
  const age = 6 + Math.floor(rnd() * 34);
  const birth = `2004-06-15`;
  const birthYear = new Date().getFullYear() - age;
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, ".");
  students.push({
    name, email: `${slug}.${i + 1}@demo.dancepro.app`, gender,
    plan: plan.nome, planValor: plan.valor,
    birthDate: `${birthYear}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`,
    phone: `(11) 9${pad(4000 + Math.floor(rnd() * 5999), 4)}-${pad(1000 + Math.floor(rnd() * 8999), 4)}`,
    dueDay: pick([5, 10, 15, 20]),
    level: pick(["iniciante", "iniciante", "intermediario", "avancado"]),
    status: ativo ? "ativo" : pick(["inativo", "pausado"]),
    prof: 1 + ((i * 5) % 6),
    startDate: `20${24 + Math.floor(rnd() * 2)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`,
    address: `Rua das Acácias, ${100 + Math.floor(rnd() * 900)} — ${pick(NEIGHBORHOODS)}`,
    ativo,
  });
}

// ── matrículas (respeitando capacidade; Ballet Infantil I lota + fila) ────
const turmaCap = {};
TURMAS.forEach((t) => (turmaCap[t.name] = t.cap));
const enroll = []; // {turma, email, status}
let waitCount = 0;
for (const s of students) {
  if (!s.ativo) continue;
  const prefs = PLAN_TURMAS[s.plan];
  let chosen = null;
  for (const cand of prefs) {
    if ((turmaCap[cand] ?? 0) > 0) { chosen = cand; break; }
  }
  if (!chosen) {
    // turma lotada: entra na fila do Ballet Infantil I (se for kids) ou em qualquer com vaga
    if (prefs.includes("Ballet Infantil I") && waitCount < 5) {
      enroll.push({ turma: "Ballet Infantil I", email: s.email, status: "espera", pos: ++waitCount });
      continue;
    }
    chosen = TURMAS.map((t) => t.name).find((n) => (turmaCap[n] ?? 0) > 0) || null;
  }
  if (!chosen) continue;
  turmaCap[chosen]--;
  enroll.push({ turma: chosen, email: s.email, status: "ativa", pos: 0 });
  if (rnd() < 0.35) {
    const second = TURMAS.map((t) => t.name).find((n) => n !== chosen && (turmaCap[n] ?? 0) > 0);
    if (second) { turmaCap[second]--; enroll.push({ turma: second, email: s.email, status: "ativa", pos: 0 }); }
  }
}

// ── SQL ───────────────────────────────────────────────────────────────────
const L = [];
L.push("BEGIN;");
L.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM students WHERE "organizationId"=1 AND email LIKE '%@demo.dancepro.app') THEN RAISE EXCEPTION 'Seed ja aplicado nesta escola (abortando para nao duplicar).'; END IF; END $$;`);

// professores
L.push(`INSERT INTO public.users ("openId", name, email, role, "organizationId", "loginMethod") VALUES`);
L.push(PROFESSORS.map((p) => `('dance_seed_prof_${p.n}', '${esc(p.name)}', '${profEmail(p.n)}', 'professor', 1, 'local')`).join(",\n") + ";");
L.push(`INSERT INTO professores ("organizationId","userId",especialidade,telefone,"paymentType","paymentPercentage")
SELECT 1, u.id, v.esp, v.tel, 'porcentagem', v.pct
FROM (VALUES ${PROFESSORS.map((p) => `('${profEmail(p.n)}','${esc(p.esp)}','${p.tel}',${p.pct})`).join(",")}) v(email,esp,tel,pct)
JOIN public.users u ON u.email = v.email AND u."organizationId" = 1;`);

// modalidades (corrige o "Bellet" existente e cria as demais)
L.push(`UPDATE instruments SET name='Ballet Clássico', category='Dança Clássica', color='#ec4899' WHERE id=1 AND "organizationId"=1 AND name='Bellet';`);
L.push(`INSERT INTO instruments ("organizationId","userId",name,category,color) SELECT 1, 1, v.name, v.cat, v.color
FROM (VALUES ${MODALIDADES.map((m) => `('${esc(m.name)}','${esc(m.category)}','${m.color}')`).join(",")}) v(name,cat,color)
WHERE NOT EXISTS (SELECT 1 FROM instruments i WHERE i."organizationId"=1 AND i.name=v.name);`);

// salas
L.push(`INSERT INTO studio_rooms ("organizationId",name,description,color,active,category,capacity,equipments,status,utilization_rate,is_principal)
SELECT 1, v.name, v.descr, v.color, true, 'Sala de Dança', v.cap, 'Espelho, Barra, Som, Ar-condicionado', 'ativa', 78, v.principal
FROM (VALUES ${ROOMS.map((r, i) => `('${r.name}','${esc(r.desc)}','${r.color}',${r.cap},${i === 0})`).join(",")}) v(name,descr,color,cap,principal)
WHERE NOT EXISTS (SELECT 1 FROM studio_rooms r WHERE r."organizationId"=1 AND r.name=v.name);`);

// planos
L.push(`INSERT INTO school_plans ("organizationId",nome,"aulasPorSemana","duracaoMeses","isBolsa","valorMensal","valorCheio","taxaInscricao","diasLimite",descricao,ativo)
SELECT 1, v.nome, v.sem, 12, false, v.valor, v.cheio, 120, '5,20', v.descr, true
FROM (VALUES ${PLANS.map((p) => `('${esc(p.nome)}',${p.sem},${p.valor},${p.cheio},'${esc(p.desc)}')`).join(",")}) v(nome,sem,valor,cheio,descr);`);

// turma existente vira Ballet Baby
L.push(`UPDATE turmas SET name='Ballet Baby (2 a 4 anos)', "modalidadeId"=(SELECT id FROM instruments WHERE "organizationId"=1 AND name='Ballet Clássico' LIMIT 1),
  "professorId"=(SELECT id FROM public.users WHERE email='${profEmail(1)}' LIMIT 1), "studioRoomId"=(SELECT id FROM studio_rooms WHERE "organizationId"=1 AND name='Estúdio 1' LIMIT 1),
  weekdays='[3]'::jsonb, "timeStr"='09:00', "durationMinutes"=45, capacity=12, level='iniciante', shift='manha', "ageMin"=2, "ageMax"=4,
  "generatedUntil"=(CURRENT_DATE + 45), "updatedAt"=now() WHERE id=1 AND "organizationId"=1;`);

// turmas novas
L.push(`INSERT INTO turmas ("organizationId","createdByUserId",name,"modalidadeId","professorId","studioRoomId",weekdays,"timeStr","durationMinutes",capacity,level,status,shift,"ageMin","ageMax","generatedUntil")
SELECT 1, 1, v.name, i.id, p.id, r.id, v.wd::jsonb, v.time, v.dur, v.cap, v.level, 'ativa', v.shift, v.amin, v.amax, (CURRENT_DATE + 45)
FROM (VALUES ${TURMAS.map((t) => `('${esc(t.name)}','${esc(t.modal)}','${profEmail(t.prof)}','${t.room}','${JSON.stringify(t.wd)}','${t.time}',${t.dur},${t.cap},'${t.level}','${t.shift}',${t.amin},${t.amax})`).join(",")}) v(name,modal,pemail,room,wd,time,dur,cap,level,shift,amin,amax)
JOIN instruments i ON i."organizationId"=1 AND i.name=v.modal
JOIN public.users p ON p.email=v.pemail
JOIN studio_rooms r ON r."organizationId"=1 AND r.name=v.room
WHERE NOT EXISTS (SELECT 1 FROM turmas tt WHERE tt."organizationId"=1 AND tt.name=v.name);`);

// alunos
L.push(`INSERT INTO students ("organizationId","userId","professorId",name,email,phone,"birthDate",gender,address,status,level,"monthlyFee","dueDay","lessonType","startDate","schoolPlanId","instrumentId",notes)
SELECT 1, 1, p.id, v.name, v.email, v.phone, v.birth::date, v.gender, v.address, v.status::status, v.level::level, v.valor, v.due, 'turma', v.start::date, sp.id,
  (SELECT CASE WHEN v.plan ILIKE '%Ballet%' THEN (SELECT id FROM instruments WHERE "organizationId"=1 AND name='Ballet Clássico' LIMIT 1)
        WHEN v.plan ILIKE '%Jazz%' OR v.plan ILIKE '%Combo%' THEN (SELECT id FROM instruments WHERE "organizationId"=1 AND name='Jazz' LIMIT 1)
        WHEN v.plan ILIKE '%Formação%' THEN (SELECT id FROM instruments WHERE "organizationId"=1 AND name='Contemporâneo' LIMIT 1)
        ELSE (SELECT id FROM instruments WHERE "organizationId"=1 AND name='Alongamento' LIMIT 1) END),
  'Aluna(o) de demonstração — dados fictícios'
FROM (VALUES ${students.map((s) => `('${esc(s.name)}','${s.email}','${s.phone}','${s.birthDate}','${s.gender}','${esc(s.address)}','${s.status}','${s.level}',${s.planValor},${s.dueDay},'${s.startDate}','${esc(s.plan)}','${profEmail(s.prof)}')`).join(",")}) v(name,email,phone,birth,gender,address,status,level,valor,due,start,plan,pemail)
JOIN school_plans sp ON sp."organizationId"=1 AND sp.nome=v.plan
JOIN public.users p ON p.email=v.pemail;`);

// matrículas
L.push(`INSERT INTO turma_alunos ("organizationId","turmaId","studentId",status,position)
SELECT 1, t.id, s.id, v.status, v.pos
FROM (VALUES ${enroll.map((e) => `('${esc(e.turma)}','${e.email}','${e.status}',${e.pos})`).join(",")}) v(turma,email,status,pos)
JOIN turmas t ON t."organizationId"=1 AND t.name=v.turma
JOIN students s ON s."organizationId"=1 AND s.email=v.email;`);

// aulas (3 semanas atrás → 6 semanas à frente), respeitando os dias da turma
L.push(`INSERT INTO lessons ("organizationId","userId",title,"scheduledAt",duration,status,"lessonType","turmaId","studioRoomId","instrumentId")
SELECT 1, t."professorId", t.name, (d + ((t."timeStr" || ':00')::time)), t."durationMinutes",
  CASE WHEN d::date < CURRENT_DATE THEN 'concluida'::lesson_status ELSE 'agendada'::lesson_status END,
  'turma'::lesson_type, t.id, t."studioRoomId", t."modalidadeId"
FROM turmas t
CROSS JOIN LATERAL generate_series((CURRENT_DATE - 21)::timestamp, (CURRENT_DATE + 42)::timestamp, interval '1 day') d
WHERE t."organizationId"=1 AND t.status='ativa' AND t."timeStr" IS NOT NULL AND t."durationMinutes" IS NOT NULL
  AND t.weekdays @> to_jsonb(ARRAY[EXTRACT(DOW FROM d)::int]);`);

// mensalidades: 3 meses atrás → 1 mês à frente (pago/atrasado/pendente)
L.push(`WITH base AS (
  SELECT s.id AS student_id, s."monthlyFee" AS valor, s."dueDay", s.email, m.moff,
    (date_trunc('month', CURRENT_DATE) + (m.moff || ' month')::interval)::date AS mstart
  FROM students s CROSS JOIN generate_series(-3, 1) AS m(moff)
  WHERE s."organizationId"=1 AND s.status='ativo' AND s.email LIKE '%@demo.dancepro.app'
),
calc AS (
  SELECT b.*, (b.mstart + (LEAST(b."dueDay",28) - 1)) AS due,
    CASE
      WHEN b.moff <= -2 THEN (abs(hashtext(b.email || b.moff::text)) % 10) < 9
      WHEN b.moff = -1 THEN (abs(hashtext(b.email || b.moff::text)) % 20) < 17
      WHEN b.moff = 0  THEN (abs(hashtext(b.email || b.moff::text)) % 20) < 13
      ELSE false
    END AS paid
  FROM base b
)
INSERT INTO payment_dues ("organizationId","userId","studentId",amount,"dueDate","paidAt",status,month,year,"originalAmount",notes)
SELECT 1, 1, c.student_id, c.valor, c.due,
  CASE WHEN c.paid THEN (c.due::timestamp + interval '2 days' + time '10:00') ELSE NULL END,
  CASE WHEN c.paid THEN 'pago' ELSE (CASE WHEN c.due < CURRENT_DATE THEN 'atrasado' ELSE 'pendente' END) END::payment_due_status,
  EXTRACT(MONTH FROM c.mstart)::int, EXTRACT(YEAR FROM c.mstart)::int, c.valor,
  'Mensalidade ' || to_char(c.mstart, 'MM/YYYY')
FROM calc c;`);

// avulsas de alto valor (figurino, matrícula, workshop...)
const AVULSAS = [
  { i: 0, desc: "Figurino Espetáculo Quebra-Nozes", valor: 1850, mes: -4, st: "pago" },
  { i: 5, desc: "Figurino Espetáculo Quebra-Nozes", valor: 1850, mes: -4, st: "atrasado" },
  { i: 12, desc: "Taxa de Matrícula Temporada 2027", valor: 890, mes: -5, st: "pago" },
  { i: 20, desc: "Workshop Masterclass Internacional", valor: 980, mes: -4, st: "pago" },
  { i: 33, desc: "Curso Intensivo de Férias", valor: 1200, mes: -4, st: "atrasado" },
  { i: 48, desc: "Uniforme Oficial (kit completo)", valor: 620, mes: -4, st: "atrasado" },
  { i: 61, desc: "Temporada de Espetáculos — 4 ingressos plateia", valor: 480, mes: 2, st: "pendente" },
  { i: 77, desc: "Figurino Especial Festival de Dança", valor: 1450, mes: 2, st: "pendente" },
];
L.push(`INSERT INTO payment_dues ("organizationId","userId","studentId",amount,"dueDate","paidAt",status,month,year,"originalAmount",notes)
SELECT 1, 1, s.id, v.valor,
  (date_trunc('month', CURRENT_DATE) + (v.mes || ' month')::interval + interval '14 days')::date,
  CASE WHEN v.st='pago' THEN (date_trunc('month', CURRENT_DATE) + (v.mes || ' month')::interval + interval '17 days') ELSE NULL END,
  v.st::payment_due_status,
  EXTRACT(MONTH FROM (date_trunc('month', CURRENT_DATE) + (v.mes || ' month')::interval))::int,
  EXTRACT(YEAR FROM (date_trunc('month', CURRENT_DATE) + (v.mes || ' month')::interval))::int,
  v.valor, v.descr
FROM (VALUES ${AVULSAS.map((a) => `(${a.i},'${esc(a.desc)}',${a.valor},${a.mes},'${a.st}')`).join(",")}) v(idx,descr,valor,mes,st)
JOIN (SELECT id, row_number() OVER (ORDER BY id) - 1 AS idx FROM students WHERE "organizationId"=1 AND email LIKE '%@demo.dancepro.app') s ON s.idx = v.idx;`);

L.push(`COMMIT;`);

// verificação
L.push(`\\echo '=== VERIFICACAO ==='`);
L.push(`SELECT 'alunas_ativas' k, COUNT(*)::text v FROM students WHERE "organizationId"=1 AND status='ativo'
UNION ALL SELECT 'alunas_total', COUNT(*)::text FROM students WHERE "organizationId"=1
UNION ALL SELECT 'turmas', COUNT(*)::text FROM turmas WHERE "organizationId"=1
UNION ALL SELECT 'matriculas_ativas', COUNT(*)::text FROM turma_alunos WHERE "organizationId"=1 AND status='ativa'
UNION ALL SELECT 'fila_espera', COUNT(*)::text FROM turma_alunos WHERE "organizationId"=1 AND status='espera'
UNION ALL SELECT 'aulas_total', COUNT(*)::text FROM lessons WHERE "organizationId"=1
UNION ALL SELECT 'aulas_hoje', COUNT(*)::text FROM lessons WHERE "organizationId"=1 AND "scheduledAt"::date = CURRENT_DATE
UNION ALL SELECT 'aulas_futuras', COUNT(*)::text FROM lessons WHERE "organizationId"=1 AND "scheduledAt" > now()
UNION ALL SELECT 'dues_pago', COUNT(*)::text FROM payment_dues WHERE "organizationId"=1 AND status='pago'
UNION ALL SELECT 'dues_atrasado', COUNT(*)::text FROM payment_dues WHERE "organizationId"=1 AND status='atrasado'
UNION ALL SELECT 'dues_pendente', COUNT(*)::text FROM payment_dues WHERE "organizationId"=1 AND status='pendente'
UNION ALL SELECT 'receita_paga_R$', COALESCE(SUM(amount),0)::int::text FROM payment_dues WHERE "organizationId"=1 AND status='pago'
UNION ALL SELECT 'vencido_R$', COALESCE(SUM(amount),0)::int::text FROM payment_dues WHERE "organizationId"=1 AND status='atrasado'
UNION ALL SELECT 'a_receber_R$', COALESCE(SUM(amount),0)::int::text FROM payment_dues WHERE "organizationId"=1 AND status='pendente'
ORDER BY 1;`);
L.push(`SELECT t.name, COUNT(ta.id) FILTER (WHERE ta.status='ativa') AS ativas, t.capacity FROM turmas t LEFT JOIN turma_alunos ta ON ta."turmaId"=t.id WHERE t."organizationId"=1 GROUP BY t.id, t.name, t.capacity ORDER BY t.name;`);

const sql = L.join("\n");

const conn = new Client();
conn.on('ready', () => {
  conn.exec('docker exec -i dance-db psql -U postgres -d wrdance -v ON_ERROR_STOP=1 -q -f -', (err, stream) => {
    if (err) throw err;
    let out = "", errOut = "";
    stream.on('data', (d) => (out += d.toString()));
    stream.stderr.on('data', (d) => (errOut += d.toString()));
    stream.on('close', (code) => {
      console.log(out);
      if (errOut) console.log("STDERR:\n" + errOut);
      console.log("exit code:", code, "| sql bytes:", Buffer.byteLength(sql, "utf8"));
      conn.end();
    });
    const buf = Buffer.from(sql, "utf8");
    for (let off = 0; off < buf.length; off += 16384) stream.write(buf.subarray(off, off + 16384));
    stream.end();
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
