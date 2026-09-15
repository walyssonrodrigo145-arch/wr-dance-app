const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {

  const queries = [
    // 1. Settings completo
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"organizationId\\", \\"schoolName\\", \\"paymentGateway\\", \\"asaasEnabled\\", CASE WHEN \\"asaasApiKey\\" IS NOT NULL AND \\"asaasApiKey\\" != '' THEN 'SIM' ELSE 'NAO' END as tem_asaas, CASE WHEN \\"mpAccessToken\\" IS NOT NULL AND \\"mpAccessToken\\" != '' THEN 'SIM' ELSE 'NAO' END as tem_mp, \\"schoolHours\\", \\"lessonDuration\\" FROM settings LIMIT 5;"`,
    // 2. Enrollment links recentes
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT code, status, \\"organizationId\\", \\"monthlyFee\\" FROM enrollment_links ORDER BY id DESC LIMIT 5;"`,
    // 3. Professores
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"userId\\", \\"organizationId\\", especialidade FROM professores LIMIT 5;"`
  ];

  let idx = 0;
  const runNext = () => {
    if (idx >= queries.length) { conn.end(); return; }
    const q = queries[idx++];
    console.log('\n=== Query', idx, '===');
    conn.exec(q, (err, stream) => {
      if (err) { console.error(err); runNext(); return; }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', runNext);
    });
  };
  runNext();
}).connect(config);
