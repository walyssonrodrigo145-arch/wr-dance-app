// Diagnóstico v5 — definitivo. Um único node no container, script via base64+eval.
// Testa: (1) tokens como o código manda hoje (cru), (2) tokens decifrados,
// (3) request SEM auth (prova se o PolicyAgent bloqueia o IP da VPS em geral).
// Uso: node -r dotenv/config vps-script/diag_mp_session5.js
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
  "function dec(t){if(!t.startsWith('v1:'))return t;const p=t.split(':');const key=scryptSync(process.env.JWT_SECRET,'wr-music-integrations',32);const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p[1],'hex'));d.setAuthTag(Buffer.from(p[2],'hex'));return Buffer.concat([d.update(Buffer.from(p[2],'hex')),d.final()]).toString('utf8');}",
  "async function test(uid,label,t){try{const r=await fetch('https://api.mercadopago.com/users/me',{headers:t?{Authorization:'Bearer '+t}:{}});console.log('user',uid,'|',label,'-> HTTP',r.status,r.status===200?'VALIDO':'INVALIDO');if(r.status!==200){console.log('   corpo:',(await r.text()).slice(0,220));}}catch(e){console.log('user',uid,'|',label,'-> ERRO_REDE',e.message);}}",
  "(async()=>{",
  "  const r0=await fetch('https://api.mercadopago.com/users/me');",
  "  console.log('SEM_AUTH (IP da VPS) -> HTTP',r0.status,r0.status===403?'IP_BLOQUEADO_PELO_POLICYAGENT':'401 normal (IP ok)');",
  "  if(r0.status!==200&&r0.status!==401){console.log('   corpo:',(await r0.text()).slice(0,220));}",
  "  for(const ent of [['163',process.env.T1],['1584',process.env.T2],['1612',process.env.T3]]){",
  "    const uid=ent[0];const raw=(ent[1]||'').trim();",
  "    if(!raw){console.log('user',uid,'TOKEN_VAZIO');continue;}",
  "    console.log('user',uid,'| cifrado:',raw.startsWith('v1:'),'| len',raw.length);",
  "    await test(uid,'raw(como o codigo manda)',raw);",
  "    let p='';try{p=dec(raw);}catch(e){console.log('  decifra falhou:',e.message);}",
  "    if(p&&p!==raw){await test(uid,'DECIFRADO(correto)',p);}",
  "  }",
  "})();",
].join('\n');

const b64Script = Buffer.from(containerScript, 'utf8').toString('base64');

const bash = [
  'cd /root/wr-music-app',
  'T1=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=163" 2>/dev/null | head -1 | tr -d "\\r")',
  'T2=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=1584" 2>/dev/null | head -1 | tr -d "\\r")',
  'T3=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=1612" 2>/dev/null | head -1 | tr -d "\\r")',
  'echo "T1_len=${#T1} T2_len=${#T2} T3_len=${#T3}"',
  'docker compose exec -T -e T1="$T1" -e T2="$T2" -e T3="$T3" app node -e "eval(Buffer.from(\'' + b64Script + '\',\'base64\').toString(\'utf8\'))"',
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
