// Health check pós-deploy (DevOpsMaster): status do container, logs recentes e HTTP público.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const cmd = `
  cd /root/wr-music-app
  echo "== PS =="
  docker compose ps
  echo "== LOGS APP (ultimas 20 linhas) =="
  docker compose logs app --tail 20 2>&1 | tail -20
  echo "== HTTP wrmusicpro.com.br =="
  curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\\n" https://wrmusicpro.com.br
  curl -s -o /dev/null -w "HTTP %{http_code} (tRPC health)\\n" https://wrmusicpro.com.br/api/health || true
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
