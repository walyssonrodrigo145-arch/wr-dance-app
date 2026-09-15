// Diagnóstico 11: settings do user 1598 (Asaas por usuário) + pagos em 10/2026 em QUALQUER status.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const conn = new Client();
conn.on('ready', () => {
  const run = (label, sql) => {
    return new Promise((resolve) => {
      const cmd = `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "${sql.replace(/"/g, '\\"')}"`;
      conn.exec(cmd, (err, stream) => {
        if (err) { console.error(label, 'ERR', err.message); return resolve(); }
        let out = `\n===== ${label} =====\n`;
        stream.on('data', (d) => { out += d.toString(); });
        stream.stderr.on('data', (d) => { out += d.toString(); });
        stream.on('close', () => { console.log(out); resolve(); });
      });
    });
  };
  (async () => {
    await run('SETTINGS do user 1598', `SELECT id, "userId", "organizationId", "paymentGateway", ("asaasApiKey" IS NOT NULL) AS tem_key, "asaasEnabled" FROM settings WHERE "userId" = 1598 OR "organizationId" = 29;`);
    await run('Dues m10/2026 todos os status (todas orgs)', `
      SELECT pd.id, pd."organizationId", pd."studentId", s.name AS student, pd.status, pd.amount, pd."paidAt", pd."asaasId", pd."infinitepayPaymentId", pd."mpPaymentId"
      FROM payment_dues pd LEFT JOIN students s ON s.id = pd."studentId"
      WHERE pd.month = 10 AND pd.year = 2026 AND pd.status <> 'pendente'
      ORDER BY pd."organizationId" LIMIT 30;
    `);
    conn.end();
  })();
}).connect(config);
