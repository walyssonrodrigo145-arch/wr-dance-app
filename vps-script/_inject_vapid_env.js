// Injeta as variáveis VAPID no .env da VPS (idempotente — só adiciona as que faltam).
// Valores vêm do .env LOCAL via variáveis de processo. Nunca imprime segredos.
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

// Lê valores do .env local
const localEnv = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const readVar = (name) => {
  const m = localEnv.match(new RegExp('^' + name + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};

const toInject = {
  VAPID_PUBLIC_KEY: readVar('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: readVar('VAPID_PRIVATE_KEY'),
  VAPID_SUBJECT: readVar('VAPID_SUBJECT'),
  VITE_VAPID_PUBLIC_KEY: readVar('VITE_VAPID_PUBLIC_KEY'),
  PUSH_PROVIDER: readVar('PUSH_PROVIDER') || 'vapid',
};

const missing = Object.entries(toInject).filter(([k, v]) => !v);
if (missing.length) {
  console.error('ABORT: variáveis ausentes no .env local:', missing.map(([k]) => k).join(', '));
  process.exit(1);
}

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /root/wr-music-app
    cp .env .env.bak_vapid_$(date +%Y%m%d_%H%M%S)
    ADDED=""
    ${Object.entries(toInject).map(([k, v]) => `
      if grep -q "^${k}=" .env 2>/dev/null; then
        echo "${k}: ja existe (mantido)"
      else
        echo '${k}=${v}' >> .env
        ADDED="$ADDED ${k}"
      fi`).join('\n')}
    echo "Adicionadas:$ADDED"
    echo "Confirmacao (somente nomes e tamanhos):"
    for K in ${Object.keys(toInject).join(' ')}; do
      V=$(grep "^$K=" .env | head -n1 | cut -d= -f2-)
      echo "$K: \${#V} chars"
    done
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => { console.log('Injecao concluida, exit=' + code); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
