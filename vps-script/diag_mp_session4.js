// Diagnóstico v4 — teste explícito dos 3 tokens MP (sem loop).
// Uso: node -r dotenv/config vps-script/diag_mp_session4.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const testNode = `
const {scryptSync,createDecipheriv}=require('crypto');
const raw=(process.env.MPTOK||'').trim();
const uid=process.env.UID_TAG;
(async()=>{
  console.log('USER',uid,'| raw len',raw.length,'| cifrado v1:',raw.startsWith('v1:'));
  let plain=raw;
  if(raw.startsWith('v1:')){
    try{
      const p=raw.split(':');
      const key=scryptSync(process.env.JWT_SECRET,'wr-music-integrations',32);
      const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p[1],'hex'));
      d.setAuthTag(Buffer.from(p[2],'hex'));
      plain=Buffer.concat([d.update(Buffer.from(p[2],'hex')),d.final()]).toString('utf8');
      console.log('  decifrado OK, len',plain.length,'prefixo',plain.slice(0,8));
    }catch(e){console.log('  ERRO_DECIFRA:',e.message);return;}
  }
  const test=async(label,t)=>{
    try{
      const r=await fetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+t}});
      console.log('  TESTE',label,'-> HTTP',r.status,r.status===200?'VALIDO':'INVALIDO');
      if(r.status!==200){const tx=await r.text();console.log('    corpo:',tx.slice(0,220));}
    }catch(e){console.log('  TESTE',label,'-> ERRO_REDE',e.message);}
  };
  await test('COMO_O_CODIGO_MANDA(raw)',raw);
  if(plain!==raw){await test('DECIFRADO(correto)',plain);}
})();
`;

const bash = [
  'cd /root/wr-music-app',
  'NT=$(printf %s ' + JSON.stringify(testNode) + ' | base64 -w0)',
  'for PAIR in "163" "1584" "1612"; do',
  '  UID_=$PAIR',
  '  TOK=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=$UID_" 2>/dev/null | head -1 | tr -d "\\r")',
  '  echo "B64Tok=$(printf %s "$TOK" | base64 -w0)"',
  '  docker compose exec -T -e MPTOK="$(printf %s "$TOK" | base64 -d)" -e UID_TAG="$UID_" app node -e "$(echo $NT | base64 -d)"',
  'done',
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
