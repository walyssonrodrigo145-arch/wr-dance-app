// Valida o par VAPID dentro do container de produção (que possui web-push instalado).
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const remoteScript = `
const w = require('web-push');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const p = env.match(/^VAPID_PUBLIC_KEY=(.*)$/m)[1].trim();
const r = env.match(/^VAPID_PRIVATE_KEY=(.*)$/m)[1].trim();
try {
  w.setVapidDetails('mailto:t@t.com', p, r);
  console.log('PAR VAPID VALIDO NO CONTAINER (pub 87, priv', r.length + ')');
} catch (e) {
  console.log('PAR INVALIDO:', e.message);
  process.exit(1);
}
`;

const conn = new Client();
conn.on('ready', () => {
  const b64 = Buffer.from(remoteScript, 'utf8').toString('base64');
  const cmd = `cd /root/wr-music-app && docker compose exec -T app node -e "$(echo ${b64} | base64 -d)"`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => { console.log('exit=' + code); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
