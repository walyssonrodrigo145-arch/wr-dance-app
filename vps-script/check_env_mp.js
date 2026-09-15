const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  const queries = [
    // Verifica as ENV vars na VPS
    `docker exec wr-music-app-app-1 env | grep -E "APP_URL|NODE_ENV|RENDER_EXTERNAL" 2>/dev/null`,
    // Verifica o .env da aplicação
    `cat /root/wr-music-app/.env | grep -E "APP_URL|NODE_ENV" 2>/dev/null`,
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
