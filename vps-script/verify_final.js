const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  const queries = [
    // 1. Verifica o novo código no container (busca por schoolName)
    `docker exec wr-music-app-app-1 grep -n "schoolName" /app/server/enrollmentRouter.ts | head -10`,
    // 2. Verifica se o código novo está rodando (dist/index.js gerado em que hora?)
    `docker exec wr-music-app-app-1 ls -la /app/dist/index.js`,
    // 3. Chama o endpoint real via HTTP externo
    `curl -s "https://wrmusicpro.com.br/api/trpc/enrollment.getPublicDetails?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22code%22%3A%2225486ee5f31765ad6e44c9288ebb1df0%22%7D%7D%7D" 2>&1 | head -c 500`,
    // 4. Verifica qual settings o novo código seleciona (simulação da lógica JS)
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"schoolName\\", \\"paymentGateway\\", CASE WHEN \\"asaasApiKey\\" IS NOT NULL AND \\"asaasApiKey\\" != '' THEN 'SIM' ELSE 'NAO' END as tem_asaas, CASE WHEN \\"mpAccessToken\\" IS NOT NULL AND \\"mpAccessToken\\" != '' THEN 'SIM' ELSE 'NAO' END as tem_mp FROM settings WHERE \\"organizationId\\" = 1 AND \\"schoolName\\" IS NOT NULL AND \\"schoolName\\" != '' ORDER BY id LIMIT 1;"`,
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
