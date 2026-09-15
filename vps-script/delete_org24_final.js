// Passo final: deleta a organization 24 por id + verificação completa.
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
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "DELETE FROM organizations WHERE id=24" < /dev/null 2>&1',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'org24_existe=\'||COUNT(*) FROM organizations WHERE id=24" < /dev/null 2>/dev/null',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'user_donsescola=\'||COUNT(*) FROM users WHERE email=\'donsescola@gmail.com\'" < /dev/null 2>/dev/null',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'settings_org24=\'||COUNT(*) FROM settings WHERE \\"organizationId\\"=24" < /dev/null 2>/dev/null',
    'echo FIM',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete/.test(d.toString())) out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
