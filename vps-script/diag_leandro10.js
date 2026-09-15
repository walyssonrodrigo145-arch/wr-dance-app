// Diagnóstico 10: encontrar o par mês10-pago + mês9-pendente do mesmo aluno (2026).
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
    await run('PAGOS em 10/2026 + 9/2026 pendente (mesmo aluno)', `
      SELECT s.id AS student_id, s.name, s."organizationId", s."studentUserId",
             (SELECT pd.id FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 10 AND pd.year = 2026) AS due_m10,
             (SELECT pd.status || ' ' || COALESCE(pd."paidAt"::text,'') || ' | valor ' || pd.amount || ' | venc ' || pd."dueDate"
              FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 10 AND pd.year = 2026) AS m10,
             (SELECT pd.id FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 9 AND pd.year = 2026) AS due_m9,
             (SELECT pd.status || ' ' || COALESCE(pd."paidAt"::text,'') || ' | venc ' || pd."dueDate"
              FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 9 AND pd.year = 2026) AS m9
      FROM students s
      WHERE EXISTS (SELECT 1 FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 10 AND pd.year = 2026 AND pd.status = 'pago')
        AND EXISTS (SELECT 1 FROM payment_dues pd WHERE pd."studentId" = s.id AND pd.month = 9 AND pd.year = 2026 AND pd.status IN ('pendente','atrasado'));
    `);
    await run('PAGOS m10/2026 (todos)', `
      SELECT pd.id, pd."organizationId", pd."studentId", s.name AS student, pd.amount, pd."paidAt", pd."dueDate", pd."receiptUrl"
      FROM payment_dues pd LEFT JOIN students s ON s.id = pd."studentId"
      WHERE pd.month = 10 AND pd.year = 2026 AND pd.status = 'pago'
      ORDER BY pd."paidAt" DESC NULLS LAST LIMIT 20;
    `);
    conn.end();
  })();
}).connect(config);
