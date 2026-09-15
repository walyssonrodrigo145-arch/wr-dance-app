const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const query = `
SELECT id, "studentId", amount, "dueDate", month, year, status 
FROM payment_dues 
WHERE status = 'pago' AND (year > 2026 OR (year = 2026 AND month > 6));

UPDATE payment_dues 
SET status = 'pendente', "paidAt" = NULL
WHERE status = 'pago' AND (year > 2026 OR (year = 2026 AND month > 6));
`;

conn.on('ready', () => {
  console.log('--- EXECUTING FIX ---');
  conn.exec(`cat << 'EOF' | docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic\n${query}\nEOF`, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('data', (data) => output += data.toString());
    stream.stderr.on('data', (data) => console.error(data.toString()));
    stream.on('close', () => {
      console.log(output);
      conn.end();
    });
  });
}).connect(config);
