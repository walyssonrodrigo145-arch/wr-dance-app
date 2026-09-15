// Checagem rápida: quem tem infinitepayHandle, estado dos tokens e erros settings.get.
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
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'handle_user=\' || s.\\"userId\\" || \' org=\' || s.\\"organizationId\\" || \' tag=\' || s.\\"infinitepayHandle\\" || \' gw=\' || s.\\"paymentGateway\\" FROM settings s WHERE s.\\"infinitepayHandle\\" IS NOT NULL AND s.\\"infinitepayHandle\\"<>\'\'" 2>/dev/null',
    'echo ----',
    'docker compose logs app --since 24h 2>/dev/null | grep -ia "settings.get" | tail -5',
    'echo ----',
    'docker compose logs app --since 6h 2>/dev/null | grep -ia "generateMPCharge\\|generateAsaasCharge\\|Erro ao criar prefer" | tail -8',
    'echo FIM_CHECAGEM',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
