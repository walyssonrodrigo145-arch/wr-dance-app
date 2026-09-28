const { Client } = require('ssh2');
const conn = new Client();
const remote = [
  'echo "--- containers:"; docker ps -a --filter name=dance --format "table {{.Names}}\\t{{.Status}}"',
  'echo "--- health local:"; curl -s -m 10 http://localhost:3002/api/health || echo SEM_RESPOSTA',
  'echo "--- logs (tail 60):"; docker logs dance-app --tail 60 2>&1 | tail -40',
].join(' ; ');
conn.on('ready', () => {
  conn.exec(remote, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n--- fim'); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
