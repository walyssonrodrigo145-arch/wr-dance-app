// Diagnóstico "sessão expirada" do Mercado Pago (read-only, sem expor segredos):
// 1) Estado das credenciais por escola (cifrada v1: / texto puro / nula)
// 2) Erros recentes de MercadoPago nos logs
// 3) Teste real do token contra a API do MP (decifra v1: com o JWT_SECRET do container)
// Uso: node -r dotenv/config vps-script/diag_mp_session.js
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
echo "==M1=ESTADO_DAS_CREDENCIAIS (por escola; sem expor segredos)=="
docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT s.userId, s.\\"organizationId\\", s.\\"paymentGateway\\", COALESCE(CASE WHEN s.\\"mpAccessToken\\" LIKE 'v1:%' THEN 'MP_CIFRADO' WHEN s.\\"mpAccessToken\\" IS NULL OR s.\\"mpAccessToken\\"='' THEN 'MP_VAZIO' ELSE 'MP_TEXTO_PURO' END,'?') || '/' || COALESCE(CASE WHEN s.\\"asaasApiKey\\" LIKE 'v1:%' THEN 'ASAAS_CIFRADO' WHEN s.\\"asaasApiKey\\" IS NULL OR s.\\"asaasApiKey\\"='' THEN 'ASAAS_VAZIO' ELSE 'ASAAS_TEXTO_PURO' END,'?') || '/ip=' || COALESCE(s.\\"infinitepayHandle\\",'-') FROM settings s ORDER BY s.userId"
echo "==M2=LOGS MercadoPago (ultimas 24h)=="
docker compose logs app --since 24h 2>/dev/null | grep -ia "mercadopago" | tail -12
echo "==M3=TESTE_TOKEN_MP (decifra e consulta /users/me; mostra so o veredito)=="
docker compose exec -T app node -e "
const {scryptSync,createDecipheriv}=require('crypto');
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
(async()=>{
  const r=await pool.query('SELECT \\"userId\\", \\"mpAccessToken\\" FROM settings WHERE \\"mpAccessToken\\" IS NOT NULL AND \\"mpAccessToken\\"<>\\'\\'');
  for(const row of r.rows){
    let tok=row.mpAccessToken;
    if(tok.startsWith('v1:')){
      try{
        const [,iv,ct,tag]=tok.split(':');
        const key=scryptSync(process.env.JWT_SECRET,'wr-music-integrations',32);
        const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
        d.setAuthTag(Buffer.from(tag,'hex'));
        tok=Buffer.concat([d.update(Buffer.from(ct,'hex')),d.final()]).toString('utf8');
      }catch(e){console.log('user',row.userId,'-> FALHA_DESCRIPTOGRAFIA');continue;}
    }
    try{
      const res=await fetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+tok}});
      console.log('user',row.userId,'-> HTTP',res.status,res.status===200?'TOKEN_VALIDO':'TOKEN_INVALIDO/EXPIRADO');
    }catch(e){console.log('user',row.userId,'-> ERRO_REDE',e.message);}
  }
  await pool.end();
})()"
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
