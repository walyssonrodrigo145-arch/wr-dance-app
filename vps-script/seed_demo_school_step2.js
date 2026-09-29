// seed_demo_school_step2.js — Complemento do seed da escola MODELO (org 1).
//
// Adiciona: 6 alunas "baby" (2 a 4 anos, com responsáveis), preenche as turmas que
// ficaram vazias respeitando idade/capacidade (máx. 3 turmas por aluna) e cria a
// fila de espera nas turmas lotadas (Ballet Infantil I e II). Rode SEMPRE depois
// do seed_demo_school.js.
//
// Uso: $env:VPS_PASSWORD='...'; node vps-script/seed_demo_school_step2.js
const { Client } = require("ssh2");

const sql = `
BEGIN;

-- 1) alunas "baby" (2 a 4 anos) para a turma Ballet Baby
INSERT INTO students ("organizationId","userId","professorId",name,email,phone,"birthDate",gender,address,status,level,"monthlyFee","dueDay","lessonType","startDate","schoolPlanId","instrumentId","guardianName","guardianPhone","notes")
SELECT 1, 1, p.id, v.name, v.email, v.tel, v.birth::date, v.gender, 'Rua das Figueiras, 250 — Jardim Europa', 'ativo', 'iniciante', 320, v.due, 'turma', (CURRENT_DATE - 60), sp.id,
  (SELECT id FROM instruments WHERE "organizationId"=1 AND name='Ballet Clássico' LIMIT 1),
  v.guardian, v.gtel, 'Aluna de demonstração — dados fictícios'
FROM (VALUES
  ('Manuela Figueiredo','baby.manuela@demo.dancepro.app','(11) 97711-2201','2022-03-14','feminino',5,'Fernanda Figueiredo','(11) 97711-2200'),
  ('Lorenzo Martins','baby.lorenzo@demo.dancepro.app','(11) 97711-2203','2022-11-02','masculino',10,'Carla Martins','(11) 97711-2202'),
  ('Maitê Sampaio','baby.maite@demo.dancepro.app','(11) 97711-2205','2023-01-27','feminino',5,'Roberta Sampaio','(11) 97711-2204'),
  ('Théo Carvalho','baby.theo@demo.dancepro.app','(11) 97711-2207','2022-07-19','masculino',15,'Bruno Carvalho','(11) 97711-2206'),
  ('Cecília Nogueira','baby.cecilia@demo.dancepro.app','(11) 97711-2209','2023-05-08','feminino',20,'Aline Nogueira','(11) 97711-2208'),
  ('Gael Monteiro','baby.gael@demo.dancepro.app','(11) 97711-2211','2024-02-11','masculino',10,'Patrícia Monteiro','(11) 97711-2210')
) v(name,email,tel,birth,gender,due,guardian,gtel)
JOIN school_plans sp ON sp."organizationId"=1 AND sp.nome='Ballet Kids (2x/semana)'
JOIN public.users p ON p.email='prof.1@demo.dancepro.app'
WHERE NOT EXISTS (SELECT 1 FROM students s2 WHERE s2."organizationId"=1 AND s2.email=v.email);

-- matricula as baby na turma Ballet Baby
INSERT INTO turma_alunos ("organizationId","turmaId","studentId",status,position)
SELECT 1, t.id, s.id, 'ativa', 0
FROM students s JOIN turmas t ON t."organizationId"=1 AND t.name='Ballet Baby (2 a 4 anos)'
WHERE s."organizationId"=1 AND s.email LIKE 'baby.%@demo.dancepro.app'
  AND NOT EXISTS (SELECT 1 FROM turma_alunos x WHERE x."turmaId"=t.id AND x."studentId"=s.id);

-- 2) completa as turmas que ficaram com poucas alunas (respeitando idade e capacidade; máx. 3 turmas por aluna)
WITH want(turma, k) AS (VALUES
  ('Hip Hop Kids',14), ('Dança do Ventre',14), ('Jazz Adulto',14), ('K-Pop Cover',12),
  ('Ballet Adulto Iniciante',10), ('Alongamento & Flexibilidade',5), ('Jazz Teen',5), ('Contemporâneo Intermediário',3)
),
cand AS (
  SELECT w.turma, w.k, s.id AS student_id,
    ROW_NUMBER() OVER (PARTITION BY w.turma ORDER BY abs(hashtext(s.email || w.turma))) AS rn,
    (SELECT COUNT(*) FROM turma_alunos ta2 WHERE ta2."studentId" = s.id AND ta2.status = 'ativa') AS enr
  FROM want w
  JOIN turmas t ON t."organizationId"=1 AND t.name = w.turma
  JOIN students s ON s."organizationId"=1 AND s.status='ativo'
  WHERE NOT EXISTS (SELECT 1 FROM turma_alunos x WHERE x."turmaId"=t.id AND x."studentId"=s.id)
    AND EXTRACT(YEAR FROM age(s."birthDate")) BETWEEN COALESCE(t."ageMin",0) AND COALESCE(t."ageMax",99)
)
INSERT INTO turma_alunos ("organizationId","turmaId","studentId",status,position)
SELECT 1, t.id, c.student_id, 'ativa', 0
FROM cand c JOIN turmas t ON t."organizationId"=1 AND t.name = c.turma
WHERE c.rn <= c.k AND c.enr < 3
  AND (SELECT COUNT(*) FROM turma_alunos z WHERE z."turmaId"=t.id AND z.status='ativa') < t.capacity;

-- 3) fila de espera nas turmas lotadas (Infantil I e Infantil II)
WITH w(turma, k) AS (VALUES ('Ballet Infantil I',5), ('Ballet Infantil II',3)),
c AS (
  SELECT w.turma, w.k, s.id,
    ROW_NUMBER() OVER (PARTITION BY w.turma ORDER BY abs(hashtext(s.email || 'fila' || w.turma))) AS rn
  FROM w
  JOIN turmas t ON t."organizationId"=1 AND t.name = w.turma
  JOIN students s ON s."organizationId"=1 AND s.status='ativo'
  WHERE NOT EXISTS (SELECT 1 FROM turma_alunos x WHERE x."turmaId"=t.id AND x."studentId"=s.id)
    AND EXTRACT(YEAR FROM age(s."birthDate")) BETWEEN COALESCE(t."ageMin",0) AND COALESCE(t."ageMax",99)
)
INSERT INTO turma_alunos ("organizationId","turmaId","studentId",status,position)
SELECT 1, t.id, c.id, 'espera', c.rn FROM c JOIN turmas t ON t."organizationId"=1 AND t.name=c.turma WHERE c.rn <= c.k;

COMMIT;

\\echo '=== POS-SEED ==='
SELECT 'alunas_ativas' k, COUNT(*)::text v FROM students WHERE "organizationId"=1 AND status='ativo'
UNION ALL SELECT 'alunas_total', COUNT(*)::text FROM students WHERE "organizationId"=1
UNION ALL SELECT 'matriculas_ativas', COUNT(*)::text FROM turma_alunos WHERE "organizationId"=1 AND status='ativa'
UNION ALL SELECT 'fila_espera', COUNT(*)::text FROM turma_alunos WHERE "organizationId"=1 AND status='espera'
ORDER BY 1;
SELECT t.name, COUNT(ta.id) FILTER (WHERE ta.status='ativa') AS ativas, t.capacity,
  COUNT(ta.id) FILTER (WHERE ta.status='espera') AS fila
FROM turmas t LEFT JOIN turma_alunos ta ON ta."turmaId"=t.id WHERE t."organizationId"=1
GROUP BY t.id, t.name, t.capacity ORDER BY ativas DESC, t.name;
`;

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
      console.log("exit code:", code);
      conn.end();
    });
    const buf = Buffer.from(sql, "utf8");
    for (let off = 0; off < buf.length; off += 16384) stream.write(buf.subarray(off, off + 16384));
    stream.end();
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
