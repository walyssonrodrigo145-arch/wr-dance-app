// AÇÃO v2 — Ajuste do ciclo de Jefferson (org 23) conforme o dono:
// 1) DB: currentPeriodEnd = 2026-10-03 (acesso vale ATÉ 03/10)
// 2) Asaas: subscription nextDueDate = 2026-10-03 (nova cobrança gerada em 03/10)
// 3) Verificação: org, assinatura e cobranças pendentes
// Uso: node -r dotenv/config vps-script/fix_jefferson_cycle.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const bash = [
  'cd /root/wr-music-app',
  'echo "==1=DB: periodEnd ate 03/10 =="',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "UPDATE organizations SET \\"currentPeriodEnd\\"=\'2026-10-03\' WHERE id=23 RETURNING id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\"" 2>/dev/null',
  'echo "==2=ASaaS: nextDueDate da assinatura -> 2026-10-03 =="',
  'docker compose exec -T app node -e "const K=(process.env.ASAAS_API_KEY||\'\').replace(/[\\\"\']/g,\'\');const B=(process.env.ASAAS_BASE_URL||\'https://api.asaas.com/v3\').replace(/[\\\"\']/g,\'\');fetch(B+\'/subscriptions/sub_vystkud5e1pyd9vc\',{method:\'POST\',headers:{\'access_token\':K,\'Content-Type\':\'application/json\'},body:JSON.stringify({nextDueDate:\'2026-10-03\'})}).then(async r=>{console.log(\'HTTP\',r.status);console.log(await r.text())})" 2>/dev/null',
  'echo "==3=VERIFICACAO== "',
  'docker compose exec -T app node -e "const K=(process.env.ASAAS_API_KEY||\'\').replace(/[\\\"\']/g,\'\');const B=(process.env.ASAAS_BASE_URL||\'https://api.asaas.com/v3\').replace(/[\\\"\']/g,\'\');const H={headers:{access_token:K}};const get=async(u)=>{const r=await fetch(B+u,H);return await r.text();};(async()=>{const s=JSON.parse(await get(\'/subscriptions/sub_vystkud5e1pyd9vc\'));console.log(\'SUB: status=\',s.status,\'nextDueDate=\',s.nextDueDate,\'endDate=\',s.endDate);const p=JSON.parse(await get(\'/payments?customer=cus_000191001696&status=PENDING\'));console.log(\'PENDENTES:\',p.totalCount,JSON.stringify((p.data||[]).map(x=>({id:x.id,due:x.dueDate,status:x.status}))));})()" 2>/dev/null',
  'echo "==4=ORG FINAL=="',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\" FROM organizations WHERE id=23" 2>/dev/null',
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
    stream.on('close', () => { console.log(out); console.log('===FIM-AÇÃO2==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
