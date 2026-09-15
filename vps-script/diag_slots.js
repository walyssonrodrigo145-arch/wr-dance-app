const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  // 1. Testa getAvailableSlots para amanhã (segunda ou terça) com instrumentId=2 (Teclado/Violão do prof id=1)
  // Data: 2026-08-04 (terça) - deve ter slots pois schoolHours tuesday: active:true, 18:10-21:00
  const tomorrow = '2026-08-05'; // quarta - inactive
  const tuesday = '2026-08-04';  // terça - active

  const queries = [
    // Testa slots para terça (deve ter horários)
    `curl -s "http://localhost:3000/api/trpc/enrollment.getAvailableSlots?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22code%22%3A%2225486ee5f31765ad6e44c9288ebb1df0%22%2C%22instrumentId%22%3A2%2C%22dateStr%22%3A%22${tuesday}%22%7D%7D%7D" 2>&1`,
    // Verifica professores da org 1
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT p.id, p.especialidade, u.name FROM professores p LEFT JOIN users u ON p.\\"userId\\" = u.id WHERE p.\\"organizationId\\" = 1;"`,
    // Verifica os instrumentos disponíveis na org 1
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, name FROM instruments WHERE \\"organizationId\\" = 1 LIMIT 10;"`,
    // Verifica schoolHours do settings correto (id=2)
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT \\"schoolHours\\", \\"lessonDuration\\" FROM settings WHERE id = 2;"`,
  ];

  let idx = 0;
  const runNext = () => {
    if (idx >= queries.length) { conn.end(); return; }
    const q = queries[idx++];
    console.log('\n=== Query', idx, '===');
    conn.exec(q, (err, stream) => {
      if (err) { console.error(err); runNext(); return; }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stdout.write('[ERR] ' + d.toString()));
      stream.on('close', runNext);
    });
  };
  runNext();
}).connect(config);
