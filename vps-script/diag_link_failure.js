// Diagnóstico: erros de geração de link nos últimos logs (automação/lembretes).
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
    'docker compose logs app --since 6h 2>/dev/null | grep -iaE "on-the-fly|Auto-Generate|Erro ao criar prefer|PolicyAgent|MP Auto|AutomationJob" | tail -20',
    'echo ----',
    'docker compose logs app --since 6h 2>/dev/null | grep -iaE "generatePaymentReminders|generateInfinitePayCharge|generateMPCharge" | tail -8',
    'echo FIM_LOGS',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
