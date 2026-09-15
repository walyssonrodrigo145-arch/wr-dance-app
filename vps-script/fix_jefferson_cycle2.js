// AÇÃO v3 — ciclo de Jefferson: nextDueDate da assinatura -> 2026-10-03.
// Scripts node passados via base64+eval (sem conflito de aspas).
// Uso: node -r dotenv/config vps-script/fix_jefferson_cycle2.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const updateScript = [
  "const K=(process.env.ASAAS_API_KEY||'').replace(/[\"']/g,'');",
  "const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\"']/g,'');",
  "fetch(B+'/subscriptions/sub_vystkud5e1pyd9vc',{method:'POST',headers:{access_token:K,'Content-Type':'application/json'},body:JSON.stringify({nextDueDate:'2026-10-03'})})",
  ".then(async r=>{console.log('UPDATE HTTP',r.status);console.log(await r.text());})",
  ".catch(e=>console.log('ERRO',e.message));",
].join('\n');

const verifyScript = [
  "const K=(process.env.ASAAS_API_KEY||'').replace(/[\"']/g,'');",
  "const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\"']/g,'');",
  "const H={headers:{access_token:K}};",
  "const get=async(u)=>{const r=await fetch(B+u,H);return await r.text();};",
  "(async()=>{",
  "  const s=JSON.parse(await get('/subscriptions/sub_vystkud5e1pyd9vc'));",
  "  console.log('SUB: status='+s.status+' nextDueDate='+s.nextDueDate+' endDate='+s.endDate);",
  "  const p=JSON.parse(await get('/payments?customer=cus_000191001696&status=PENDING'));",
  "  console.log('PENDENTES:',p.totalCount);",
  "  (p.data||[]).forEach(x=>console.log('  -',x.id,'venc',x.dueDate,x.status));",
  "})();",
].join('\n');

const b64Update = Buffer.from(updateScript, 'utf8').toString('base64');
const b64Verify = Buffer.from(verifyScript, 'utf8').toString('base64');
const b64Trivial = Buffer.from("console.log('container-ok');", 'utf8').toString('base64');

const bash = [
  'cd /root/wr-music-app',
  'echo "==0=TESTE_CONTAINER=="',
  'docker compose exec -T app node -e "eval(Buffer.from(\'' + b64Trivial + '\',\'base64\').toString(\'utf8\'))" < /dev/null 2>&1',
  'echo "==1=UPDATE nextDueDate->2026-10-03=="',
  'docker compose exec -T app node -e "eval(Buffer.from(\'' + b64Update + '\',\'base64\').toString(\'utf8\'))" < /dev/null 2>&1',
  'echo "==2=VERIFICACAO=="',
  'docker compose exec -T app node -e "eval(Buffer.from(\'' + b64Verify + '\',\'base64\').toString(\'utf8\'))" < /dev/null 2>&1',
  'echo "==3=ORG=="',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\" FROM organizations WHERE id=23" < /dev/null 2>/dev/null',
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
    stream.on('close', () => { console.log(out); console.log('===FIM-AÇÃO3==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
