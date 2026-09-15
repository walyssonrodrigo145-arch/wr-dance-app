// Diagnóstico 9: student 530 completo + todas as dues dele + dues 1784/1785 + users 1598.
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
      const cmd = `docker exec wr-music-app-db-1 psql -U postgres -x -d wrmusic -c "${sql.replace(/"/g, '\\"')}"`;
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
    await run('STUDENT 530', `SELECT * FROM students WHERE id = 530;`);
    await run('USER 1598', `SELECT id, name, email, role, "organizationId", "studentId" FROM users WHERE id = 1598;`);
    await run('TODAS as dues do student 530', `
      SELECT id, "userId", month, year, amount, "originalAmount", status, "dueDate", "paidAt",
             "asaasId", "mpPaymentId", "mpPaymentLink", "infinitepayPaymentId", "infinitepaySlug",
             "infinitepayPaymentLink", "receiptUrl", notes, "createdAt"
      FROM payment_dues WHERE "studentId" = 530 ORDER BY year DESC, month DESC LIMIT 10;
    `);
    conn.end();
  })();
}).connect(config);
