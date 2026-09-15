// Diagnóstico 3: payment_dues do userId 1598 (Leandro Alves Ribeiro) + student vinculado.
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
    await run('STUDENT vinculado ao user 1598', `SELECT id, name, "organizationId", status, "studentUserId" FROM students WHERE "studentUserId" = 1598;`);
    await run('MENSALIDADES do user 1598', `
      SELECT pd.id, pd."userId", pd."studentId", pd.month, pd.year, pd.amount, pd."originalAmount",
             pd.status, pd."dueDate", pd."paidAt", pd.notes,
             pd."asaasId", pd."asaasBillingType", pd."receiptUrl",
             pd."mpPaymentId", pd."infinitepayPaymentId", pd."billingPeriodicity",
             pd."createdAt", pd."updatedAt"
      FROM payment_dues pd
      WHERE pd."userId" = 1598
      ORDER BY pd.year DESC, pd.month DESC
      LIMIT 15;
    `);
    conn.end();
  })();
}).connect(config);
