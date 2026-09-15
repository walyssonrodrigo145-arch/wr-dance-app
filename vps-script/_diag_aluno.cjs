// Diagnóstico: aluno/usuário por e-mail → escola (org), aluno, cobranças e config Asaas.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const EMAIL = 'arquesbotechiaf@gmail.com';

const sql = `
\\echo === USUARIO ===
SELECT id, name, email, role, "organizationId" AS org_id, "createdAt"::date AS criado_em
FROM users WHERE email = '${EMAIL}';

\\echo === ALUNO ===
SELECT s.id, s.name, s.email, s.status, s."monthlyFee" AS mensalidade, s."dueDay" AS dia_venc,
       s."professorId", s."organizationId" AS org_id, s."asaasCustomerId", s."asaasSubscriptionId"
FROM students s
WHERE s."studentUserId" IN (SELECT id FROM users WHERE email = '${EMAIL}')
   OR s.email = '${EMAIL}';

\\echo === ESCOLA (ORGANIZACAO) ===
SELECT id, name, email, phone, status FROM organizations
WHERE id = (SELECT "organizationId" FROM users WHERE email = '${EMAIL}');

\\echo === COBRANCAS (payment_dues) ===
SELECT pd.id, pd."studentId", pd.status, pd.amount, pd."dueDate", pd.month, pd.year,
       pd."billingPeriodicity" AS periodicidade,
       CASE WHEN pd."asaasId" IS NOT NULL THEN 'SIM' ELSE 'NAO' END AS no_asaas
FROM payment_dues pd
WHERE pd."studentId" IN (
  SELECT id FROM students
  WHERE "studentUserId" IN (SELECT id FROM users WHERE email = '${EMAIL}')
     OR email = '${EMAIL}')
ORDER BY pd."dueDate" DESC LIMIT 15;

\\echo === CONFIG ASAAS DA ESCOLA (settings por usuario da org) ===
SELECT u.id AS user_id, u.email, u.role,
       s."asaasEnabled" AS asaas_on,
       s."paymentGateway" AS gateway,
       CASE WHEN COALESCE(LENGTH(s."asaasApiKey"),0) > 0 THEN 'SIM' ELSE 'NAO' END AS tem_api_key
FROM settings s JOIN users u ON u.id = s."userId"
WHERE u."organizationId" = (SELECT "organizationId" FROM users WHERE email = '${EMAIL}')
LIMIT 10;

\\echo === ASAAS CUSTOMER DO ALUNO ===
SELECT * FROM asaas_customers
WHERE "studentId" IN (
  SELECT id FROM students
  WHERE "studentUserId" IN (SELECT id FROM users WHERE email = '${EMAIL}')
     OR email = '${EMAIL}');
`;

const b64 = Buffer.from(sql, 'utf8').toString('base64');
const cmd = `cd /root/wr-music-app && echo ${b64} | base64 -d | docker compose exec -T db psql -U postgres wrmusic -P pager=off 2>&1`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => { console.log('exit=' + code); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
