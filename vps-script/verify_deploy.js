const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  const queries = [
    // 1. Verifica se o orderBy está no arquivo dentro do container
    `docker exec wr-music-app-app-1 grep -n "orderBy" /app/server/enrollmentRouter.ts 2>/dev/null || echo "NAO ENCONTRADO NO CONTAINER"`,
    // 2. Verifica logs recentes da app
    `docker logs wr-music-app-app-1 --tail=30 2>&1`,
    // 3. Verifica se o arquivo foi realmente copiado (data de modificação)
    `docker exec wr-music-app-app-1 ls -la /app/server/enrollmentRouter.ts 2>/dev/null`,
    // 4. Testa o endpoint publico diretamente
    `curl -s "http://localhost:3000/api/trpc/enrollment.getPublicDetails?input=%7B%22json%22%3A%7B%22code%22%3A%2225486ee5f31765ad6e44c9288ebb1df0%22%7D%7D" 2>/dev/null | head -c 500`,
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
