const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  const queries = [
    // 1. Testa o endpoint de detalhes públicos com código real
    `curl -s -X GET "http://localhost:3000/api/trpc/enrollment.getPublicDetails?input=%7B%220%22%3A%7B%22json%22%3A%7B%22code%22%3A%2225486ee5f31765ad6e44c9288ebb1df0%22%7D%7D%7D" -H "Content-Type: application/json" 2>&1 | head -c 1000`,
    // 2. Testa formato correto do tRPC batch
    `curl -s "http://localhost:3000/api/trpc/enrollment.getPublicDetails?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22code%22%3A%2225486ee5f31765ad6e44c9288ebb1df0%22%7D%7D%7D" 2>&1 | head -c 1000`,
    // 3. Verifica qual settings está sendo retornado agora pelo endpoint
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"schoolName\\", \\"paymentGateway\\", CASE WHEN \\"asaasApiKey\\" IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_asaas, CASE WHEN \\"mpAccessToken\\" IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_mp FROM settings WHERE \\"organizationId\\" = 1 ORDER BY id DESC LIMIT 1;"`,
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
