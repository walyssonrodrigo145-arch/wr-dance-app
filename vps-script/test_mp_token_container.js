// Teste definitivo do token MP: decifra COM O AMBIENTE DO APP (container) e valida na API.
// Uso: node -r dotenv/config vps-script/test_mp_token_container.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const containerScript = [
  "const {scryptSync,createDecipheriv}=require('crypto');",
  "const raw=(process.env.MPTOK||'').trim();",
  "(async()=>{",
  "  console.log('raw len',raw.length,'cifrado:',raw.startsWith('v1:'));",
  "  let plain=raw;",
  "  if(raw.startsWith('v1:')){",
  "    try{const p=raw.split(':');const key=scryptSync(process.env.JWT_SECRET,'wr-music-integrations',32);const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p[1],'hex'));d.setAuthTag(Buffer.from(p[3],'hex'));plain=Buffer.concat([d.update(Buffer.from(p[2],'hex')),d.final()]).toString('utf8');console.log('DECIFRADO OK — prefixo',plain.slice(0,8),'len',plain.length);}",
  "    catch(e){console.log('DECIFRA FALHOU:',e.message);return;}",
  "  }",
  "  const r=await fetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+plain}});",
  "  console.log('VALIDACAO MP -> HTTP',r.status,r.status===200?'TOKEN_VALIDO':'INVALIDO');",
  "  if(r.status!==200){console.log('corpo:',(await r.text()).slice(0,200));}else{const j=await r.json();console.log('conta:',j.nickname||j.email||'ok');}",
  "})();",
].join('\n');

const b64Script = Buffer.from(containerScript, 'utf8').toString('base64');

const bash = [
  'cd /root/wr-music-app',
  'TOK=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=163" < /dev/null 2>/dev/null | head -1 | tr -d "\\r")',
  'echo "TOK_LEN=${#TOK}"',
  'docker compose exec -T -e MPTOK="$TOK" app node -e "eval(Buffer.from(\'' + b64Script + '\',\'base64\').toString(\'utf8\'))" < /dev/null 2>&1 | grep -v obsolete',
  'echo "==FIM=="',
].join('\n');

const conn = new Client();
conn.on('ready', () => {
  const b64 = Buffer.from(bash, 'utf8').toString('base64');
  conn.exec(`echo ${b64} | base64 -d | bash`, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete|orphan containers/.test(d.toString())) out += '\n[ERR] ' + d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
