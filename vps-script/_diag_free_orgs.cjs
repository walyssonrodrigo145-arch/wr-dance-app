// Escopo do furo: orgs "active" sem assinatura/período (criadas grátis pelo login OAuth)
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};
const sql = `
\\echo === ORGS 'ACTIVE' SEM ASSINATURA (furo) ===
SELECT o.id, o.name, o.slug, o."createdAt"::date AS criada_em, u.email AS admin_email
FROM organizations o
LEFT JOIN users u ON u."organizationId" = o.id AND u.role = 'admin'
WHERE o."subscriptionStatus" = 'active'
  AND o."currentPeriodEnd" IS NULL
  AND o."asaasSubscriptionId" IS NULL
ORDER BY o.id DESC LIMIT 20;

\\echo === CONTAGEM ===
SELECT COUNT(*) AS total_furo FROM organizations o
WHERE o."subscriptionStatus" = 'active' AND o."currentPeriodEnd" IS NULL AND o."asaasSubscriptionId" IS NULL;

\\echo === DISTRIBUICAO DE STATUS (todas as orgs) ===
SELECT "subscriptionStatus", COUNT(*) FROM organizations GROUP BY 1 ORDER BY 2 DESC;
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
