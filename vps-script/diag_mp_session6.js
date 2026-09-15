// Diagnóstico v6 — LOCAL: busca token cifrado + JWT_SECRET via SSH (nunca imprime),
// decifra em memória e testa o token REAL contra a API do MP.
// Uso: node -r dotenv/config vps-script/diag_mp_session6.js
const { Client } = require('ssh2');
const { scryptSync, createDecipheriv } = require('crypto');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.stdout.on('data', (d) => { out += d.toString(); });
        stream.stderr.on('data', (d) => { out += d.toString(); });
        stream.on('close', () => { conn.end(); resolve(out.trim()); });
      });
    }).on('error', reject).connect(config);
  });
}

(async () => {
  const b64Tok = (await sshExec('cd /root/wr-music-app && docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=163" 2>/dev/null | tr -d "\\r" | base64 -w0')).trim();
  const b64Secret = (await sshExec('cd /root/wr-music-app && docker compose exec -T app printenv JWT_SECRET | base64 -w0')).trim();
  if (!b64Tok || !b64Secret) { console.log('Falha ao obter dados (b64Tok len:', b64Tok.length, ', secret len:', b64Secret.length, ')'); process.exit(1); }

  const raw = Buffer.from(b64Tok, 'base64').toString('utf8').trim();
  console.log('token cru: len', raw.length, '| cifrado v1:', raw.startsWith('v1:'));

  let plain = raw;
  if (raw.startsWith('v1:')) {
    const p = raw.split(':');
    const secret = Buffer.from(b64Secret, 'base64').toString('utf8').trim();
    const key = scryptSync(secret, 'wr-music-integrations', 32);
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(p[1], 'hex'));
    d.setAuthTag(Buffer.from(p[3], 'hex'));
    plain = Buffer.concat([d.update(Buffer.from(p[2], 'hex')), d.final()]).toString('utf8');
    console.log('decifrado OK | len', plain.length, '| prefixo', plain.slice(0, 8));
  }

  const test = async (label, t) => {
    const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: 'Bearer ' + t } });
    console.log('TESTE', label, '-> HTTP', r.status, r.status === 200 ? 'VALIDO' : 'INVALIDO');
    if (r.status !== 200) console.log('   corpo:', (await r.text()).slice(0, 220));
    else { const j = await r.json(); console.log('   conta MP:', j.nickname || j.email || '(ok)'); }
  };
  await test('COMO_O_CODIGO_MANDA (cru/v1:)', raw);
  if (plain !== raw) await test('DECIFRADO (correto)', plain);
  console.log('===FIM===');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
