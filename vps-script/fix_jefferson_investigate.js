// Investigação v2 (read-only) — stdout direto com acumulação JS.
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
echo "==M1=CONFIG=="
KEY=$(grep "^ASAAS_API_KEY=" .env | head -1 | cut -d= -f2- | sed "s/['\\"']//g")
BASE=$(grep "^ASAAS_BASE_URL=" .env | head -1 | cut -d= -f2- | sed "s/['\\"']//g")
echo "KEY_LEN=$(echo -n "$KEY" | wc -c) BASE=$BASE"
echo "==M2=ORG=="
docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT id, \\"subscriptionStatus\\", \\"currentPeriodEnd\\", \\"asaasCustomerId\\", \\"asaasSubscriptionId\\", \\"planId\\" FROM organizations WHERE id=23"
CUST=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT COALESCE(\\"asaasCustomerId\\",'') FROM organizations WHERE id=23")
SUB=$(docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT COALESCE(\\"asaasSubscriptionId\\",'') FROM organizations WHERE id=23")
echo "CUST=$CUST SUB=$SUB"
echo "==M3=ASaaS_DATA (via container app)=="
docker compose exec -T -e CUST="$CUST" -e SUB="$SUB" app node -e "const K=(process.env.ASAAS_API_KEY||'').replace(/[\\"']/g,'');const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\\"']/g,'');const C=process.env.CUST;const S=process.env.SUB;const H={headers:{access_token:K}};const get=async(u)=>{const r=await fetch(B+u,H);return await r.text();};(async()=>{console.log('==SUB==');console.log(await get('/subscriptions/'+S));console.log('==PENDING==');console.log(await get('/payments?customer='+C+'&status=PENDING'));console.log('==OVERDUE==');console.log(await get('/payments?customer='+C+'&status=OVERDUE'));console.log('==LAST==');console.log(await get('/payments?customer='+C+'&limit=10'));})()"
echo "==M7=FINITO=="
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(bash, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += '\n[ERR] ' + d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
