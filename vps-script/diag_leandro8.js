// Diagnóstico 8: students '%alves%', professores leandro, e criadas hoje.
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
    await run('STUDENTS %alves%', `SELECT id, name, "organizationId", status, "studentUserId" FROM students WHERE name ILIKE '%alves%' LIMIT 20;`);
    await run('PROFESSORES %leandro%', `SELECT p.id, p."userId", u.name, u.email, p."organizationId" FROM professores p JOIN users u ON u.id = p."userId" WHERE u.name ILIKE '%leandro%';`);
    await run('MENSALIDADES CRIADAS HOJE (13-14/09)', `
      SELECT pd.id, pd."organizationId", pd."studentId", s.name AS student, pd.month, pd.year,
             pd.amount, pd.status, pd."dueDate", pd."paidAt", pd."createdAt"
      FROM payment_dues pd
      LEFT JOIN students s ON s.id = pd."studentId"
      WHERE pd."createdAt" >= '2026-09-13'
      ORDER BY pd."createdAt" DESC
      LIMIT 25;
    `);
    conn.end();
  })();
}).connect(config);
