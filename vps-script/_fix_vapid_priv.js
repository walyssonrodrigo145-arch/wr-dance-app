// Força o VAPID_PRIVATE_KEY da VPS para o valor do par gerado localmente (casamento com VAPID_PUBLIC_KEY).
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

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    cd /root/wr-music-app
    sed -i 's|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${priv}|' .env
    P=$(grep '^VAPID_PUBLIC_KEY=' .env | head -n1 | cut -d= -f2-)
    R=$(grep '^VAPID_PRIVATE_KEY=' .env | head -n1 | cut -d= -f2-)
    echo "pub \${#P} chars, priv \${#R} chars"
    node -e "const w=require('web-push');try{w.setVapidDetails('mailto:test@test.com',process.argv[1],process.argv[2]);console.log('PAR VALIDO: publica e privada casam')}catch(e){console.log('PAR INVALIDO:',e.message)}" "$P" "$R" 2>/dev/null || echo "web-push indisponivel no host (validacao sera feita no container)"
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error('SSH exec falhou:', err.message); process.exit(1); }
    stream.stdout.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => { console.log('exit=' + code); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH erro:', e.message); process.exit(1); }).connect(config);
