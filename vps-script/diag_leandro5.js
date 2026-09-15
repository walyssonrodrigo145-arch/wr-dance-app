// Diagnóstico 5: TODAS as mensalidades 2025/2026 do userId 1598 + students 557/559/418.
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
    await run('STUDENTS 557/559/418', `SELECT id, name, "organizationId", status, "studentUserId" FROM students WHERE id IN (557, 559, 418);`);
    await run('MENSALIDADES user 1598 — 2025/2026', `
      SELECT pd.id, pd."studentId", pd.month, pd.year, pd.amount, pd.status,
             pd."dueDate", pd."paidAt", pd."asaasId", pd."receiptUrl", pd.notes
      FROM payment_dues pd
      WHERE pd."userId" = 1598 AND pd.year IN (2025, 2026)
      ORDER BY pd.year DESC, pd.month DESC, pd."studentId"
      LIMIT 30;
    `);
    conn.end();
  })();
}).connect(config);
