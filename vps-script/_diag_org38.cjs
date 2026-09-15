// Org 38: dados da escola, usuários, alunos e status da assinatura da plataforma.
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};
const sql = `
\\echo === ESCOLA ORG 38 ===
SELECT id, name, slug, active, "subscriptionStatus" AS plano_status, "trialEndsAt"::date AS trial_ate,
       "currentPeriodEnd"::date AS periodo_ate, "planId" AS plano, "ownerId", "createdAt"::date AS criada_em
FROM organizations WHERE id = 38;

\\echo === USUARIOS DA ORG 38 ===
SELECT id, name, email, role, "createdAt"::date AS criado_em FROM users WHERE "organizationId" = 38 ORDER BY id;

\\echo === ALUNOS DA ORG 38 ===
SELECT id, name, email, status, "monthlyFee" AS mensalidade, "dueDay" AS dia_venc,
       "professorId", "createdAt"::date AS criado_em
FROM students WHERE "organizationId" = 38 ORDER BY id;

\\echo === COBRANCAS DA ORG 38 ===
SELECT id, "studentId", status, amount, "dueDate", month, year,
       CASE WHEN "asaasId" IS NOT NULL THEN 'SIM' ELSE 'NAO' END AS no_asaas
FROM payment_dues WHERE "organizationId" = 38 ORDER BY "dueDate" DESC LIMIT 15;
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
