// Diagnóstico 7: mensalidades 2026 m9/m10 user 1598 + todas pendentes com asaasId + schema students.
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
    await run('MENSALIDADES user 1598 — meses 8,9,10 de 2026', `
      SELECT pd.id, pd."studentId", s.name AS student, pd.month, pd.year, pd.amount, pd.status,
             pd."dueDate", pd."paidAt", pd."asaasId", pd."receiptUrl", pd.notes
      FROM payment_dues pd
      JOIN students s ON s.id = pd."studentId"
      WHERE pd."userId" = 1598 AND pd.year = 2026 AND pd.month IN (8, 9, 10)
      ORDER BY pd.month DESC, pd."studentId";
    `);
    await run('PENDENTES com asaasId (todas orgs)', `
      SELECT pd.id, pd."organizationId", pd."studentId", s.name AS student, pd.month, pd.year,
             pd.amount, pd.status, pd."dueDate", pd."asaasId"
      FROM payment_dues pd
      LEFT JOIN students s ON s.id = pd."studentId"
      WHERE pd."asaasId" IS NOT NULL AND pd.status = 'pendente'
      ORDER BY pd."dueDate" DESC
      LIMIT 30;
    `);
    conn.end();
  })();
}).connect(config);
