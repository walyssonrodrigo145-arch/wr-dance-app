// Diagnóstico 6: histórico completo + config Asaas org 29.
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
    await run('TODAS as mensalidades user 1598 (resumo por mes/ano/status)', `
      SELECT pd.year, pd.month, string_agg(DISTINCT pd."studentId"::text, ',' ORDER BY pd."studentId") AS students,
             count(*) AS qtde, string_agg(DISTINCT pd.status, ',') AS statuses,
             bool_or(pd."asaasId" IS NOT NULL) AS tem_asaas
      FROM payment_dues pd
      WHERE pd."userId" = 1598
      GROUP BY pd.year, pd.month
      ORDER BY pd.year DESC, pd.month DESC
      LIMIT 40;
    `);
    await run('SETTINGS org 29 (gateway/asaas)', `SELECT "organizationId", "paymentGateway", ("asaasApiKey" IS NOT NULL) AS tem_key, "asaasEnabled" FROM settings WHERE "organizationId" = 29;`);
    await run('ASAAS CUSTOMERS org 29', `SELECT * FROM asaas_customers WHERE "organizationId" = 29 LIMIT 10;`);
    conn.end();
  })();
}).connect(config);
