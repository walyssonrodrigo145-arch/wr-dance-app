// Sobrescreve VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VITE_VAPID_PUBLIC_KEY na VPS
// com o novo par gerado localmente (base64url é sed-safe). Nunca imprime a privada.
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const localEnv = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const pub = localEnv.match(/^VAPID_PUBLIC_KEY=(.*)$/m)[1].trim();
const priv = localEnv.match(/^VAPID_PRIVATE_KEY=(.*)$/m)[1].trim();
const vitePub = localEnv.match(/^VITE_VAPID_PUBLIC_KEY=(.*)$/m)[1].trim();
const subject = localEnv.match(/^VAPID_SUBJECT=(.*)$/m)[1].trim();

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /root/wr-music-app
    sed -i 's|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${pub}|' .env
    sed -i 's|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${priv}|' .env
    sed -i 's|^VITE_VAPID_PUBLIC_KEY=.*|VITE_VAPID_PUBLIC_KEY=${vitePub}|' .env
    grep -q '^VAPID_SUBJECT=' .env || echo 'VAPID_SUBJECT=${subject}' >> .env
    grep -q '^PUSH_PROVIDER=' .env || echo 'PUSH_PROVIDER=vapid' >> .env
    P=$(grep '^VAPID_PUBLIC_KEY=' .env | head -n1 | cut -d= -f2-)
    R=$(grep '^VAPID_PRIVATE_KEY=' .env | head -n1 | cut -d= -f2-)
    V=$(grep '^VITE_VAPID_PUBLIC_KEY=' .env | head -n1 | cut -d= -f2-)
    echo "pub \${#P} chars | priv \${#R} chars | vite \${#V} chars"
    echo "pub termina igual à local: $(echo "$P" | tail -c 9)"
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => { console.log('exit=' + code); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
