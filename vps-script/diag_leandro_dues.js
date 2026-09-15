// Diagnóstico READ-ONLY: mensalidades de "Leandro Alves" + estado Asaas.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const SQL = `
  SELECT s.id AS student_id, s.name, s.organizationId
  FROM students s WHERE s.name ILIKE '%leandro%alves%' OR s.name ILIKE '%alves%leandro%' LIMIT 10;
`;

const SQL_DUES = `
  SELECT pd.id, pd."studentId", s.name, pd.month, pd.year, pd.amount, pd."originalAmount",
         pd.status, pd."dueDate", pd."paidAt", pd.notes,
         pd."asaasId", pd."asaasPaymentLink", pd."asaasBillingType",
         pd."mpPaymentId", pd."infinitepayPaymentId", pd."receiptUrl",
         pd."billingPeriodicity", pd."createdAt"
  FROM payment_dues pd
  JOIN students s ON s.id = pd."studentId"
  WHERE s.name ILIKE '%leandro%'
  ORDER BY pd.year DESC, pd.month DESC
  LIMIT 20;
`;

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
  conn.on('ready', () => {});
  (async () => {
    await run('ALUNO LEANDRO', SQL);
    await run('MENSALIDADES (payment_dues)', SQL_DUES);
    conn.end();
  })();
}).connect(config);
