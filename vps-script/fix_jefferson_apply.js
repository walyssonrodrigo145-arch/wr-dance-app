// AÇÃO — Correção da conta jc666029@gmail.com (org 23):
// 1) Deleta assinatura antiga órfã sub_yp68ddxh60zvwcu1 (+ sua cobrança pendente duplicada)
// 2) Deleta cobrança OVERDUE de setembro pay_kczb9t3ijfdyvl1b
// 3) Ativa a conta: subscriptionStatus='active' (periodEnd 2026-11-03 já correto)
// 4) Verifica estado final
// Uso: node -r dotenv/config vps-script/fix_jefferson_apply.js
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
echo "==P1=DELETAR assinatura antiga orfa (sub_yp68ddxh60zvwcu1)=="
docker compose exec -T app node -e "const K=(process.env.ASAAS_API_KEY||'').replace(/[\\"']/g,'');const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\\"']/g,'');fetch(B+'/subscriptions/sub_yp68ddxh60zvwcu1',{method:'DELETE',headers:{access_token:K}}).then(async r=>{console.log('HTTP',r.status);console.log(await r.text())})"
echo "==P2=DELETAR cobranca setembro OVERDUE (pay_kczb9t3ijfdyvl1b)=="
docker compose exec -T app node -e "const K=(process.env.ASAAS_API_KEY||'').replace(/[\\"']/g,'');const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\\"']/g,'');fetch(B+'/payments/pay_kczb9t3ijfdyvl1b',{method:'DELETE',headers:{access_token:K}}).then(async r=>{console.log('HTTP',r.status);console.log(await r.text())})"
echo "==P3=ATIVAR conta no banco (org 23)=="
docker compose exec -T db psql -U postgres wrmusic -t -A -c "UPDATE organizations SET \\"subscriptionStatus\\"='active', \\"trialEndsAt\\"=NULL WHERE id=23 RETURNING id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\""
echo "==P4=VERIFICACAO FINAL: pendencias do customer =="
docker compose exec -T app node -e "const K=(process.env.ASAAS_API_KEY||'').replace(/[\\"']/g,'');const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\\"']/g,'');const C='cus_000191001696';const H={headers:{access_token:K}};const get=async(u)=>{const r=await fetch(B+u,H);return await r.text();};(async()=>{console.log('PENDING:',await get('/payments?customer='+C+'&status=PENDING'));console.log('OVERDUE:',await get('/payments?customer='+C+'&status=OVERDUE'));const s=JSON.parse(await get('/subscriptions/sub_vystkud5e1pyd9vc'));console.log('SUB ATUAL:',s.status,s.nextDueDate);const antiga=JSON.parse(await get('/subscriptions/sub_yp68ddxh60zvwcu1'));console.log('SUB ANTIGA:',antiga.deleted===true?'DELETED':'STILL:'+antiga.status);const p=JSON.parse(await get('/payments/pay_p8e8zzre3mdtnvt5'));console.log('PAGAMENTO OUTUBRO:',p.status,p.dueDate);})()"
echo "==P5=ORG FINAL=="
docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\" FROM organizations WHERE id=23"
echo "==FIM=="
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(bash, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete|orphan containers/.test(d.toString())) out += '\n[ERR] ' + d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM-AÇÃO==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
