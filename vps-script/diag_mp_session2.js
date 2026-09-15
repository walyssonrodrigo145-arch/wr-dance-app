// Diagnóstico v2 — "sessão expirada" MP:
// Testa o token do MP (a) como está no banco (como o código manda hoje) e
// (b) decifrado (como deveria ser). Veredito: /users/me HTTP 200 = válido.
// Uso: node -r dotenv/config vps-script/diag_mp_session2.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const bash = `
cd /root/wr-music-app
echo "==M1=ESTADO_CREDENCIAIS=="
docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT 'user=' || s.\\"userId\\" || ' org=' || COALESCE(CAST(s.\\"organizationId\\" AS TEXT),'?') || ' gw=' || s.\\"paymentGateway\\" || ' ' || COALESCE(CASE WHEN s.\\"mpAccessToken\\" LIKE 'v1:%' THEN 'MP_CIFRADO' WHEN s.\\"mpAccessToken\\" IS NULL OR s.\\"mpAccessToken\\"='' THEN 'MP_VAZIO' ELSE 'MP_TEXTO_PURO' END,'?') FROM settings s ORDER BY s.\\"userId\"" 2>/dev/null
echo "==M2=TESTE_TOKENS=="
for UID_ in $(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"userId\\" FROM settings WHERE \\"mpAccessToken\\" IS NOT NULL AND \\"mpAccessToken\\"<>''" 2>/dev/null); do
  TOK=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \\"mpAccessToken\\" FROM settings WHERE \\"userId\\"=$UID_" 2>/dev/null | head -1 | tr -d '\\r')
  docker compose exec -T -e MPTOK="$TOK" app node -e "
const {scryptSync,createDecipheriv}=require('crypto');
const raw=process.env.MPTOK.trim();
(async()=>{
  console.log('token raw len',raw.length,'| cifrado v1:',raw.startsWith('v1:'));
  let plain=raw;
  if(raw.startsWith('v1:')){
    try{const p=raw.split(':');const key=scryptSync(process.env.JWT_SECRET,'wr-music-integrations',32);const d=createDecipheriv('aes-256-gcm',key,Buffer.from(p[1],'hex'));d.setAuthTag(Buffer.from(p[2],'hex'));plain=Buffer.concat([d.update(Buffer.from(p[2],'hex')),d.final()]).toString('utf8');console.log('  decifrado OK, len',plain.length,'prefixo',plain.slice(0,8));}
    catch(e){console.log('  ERRO_DECIFRA:',e.message);return;}
  }
  const test=async(label,t)=>{try{const r=await fetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+t}});console.log('  TESTE',label,'-> HTTP',r.status,r.status===200?'VALIDO':'INVALIDO');if(r.status!==200){const tx=await r.text();console.log('    corpo:',tx.slice(0,200));}}catch(e){console.log('  TESTE',label,'-> ERRO_REDE',e.message);}};
  await test('COMO_O_CODIGO_MANDA(raw)',raw);
  if(plain!==raw){await test('DECIFRADO(correto)',plain);}
})();
" 2>/dev/null
done
echo "==FIM=="
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(bash, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete|orphan containers/.test(d.toString())) out += '\n[ERR] ' + d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
