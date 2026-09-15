// Verifica se o bundle do client servido contém o novo código do destaque.
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
  const cmd = [
    'cd /root/wr-music-app',
    'docker compose exec -T app sh -c "grep -rlo \'15/15\' /app/dist/public/assets/ 2>/dev/null | head -3"',
    'echo ----',
    'docker compose exec -T app sh -c "grep -rlo \'border-l-fuchsia-600\' /app/dist/public/assets/ 2>/dev/null | head -3"',
    'echo ----',
    'docker compose exec -T app sh -c "ls /app/dist/public/assets/ | grep -i aulas | head -5"',
    'echo FIM',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
