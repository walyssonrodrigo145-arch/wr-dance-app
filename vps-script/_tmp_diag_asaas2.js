const { Client } = require('ssh2');
const conn = new Client();
const remote = [
  'docker exec dance-db psql -U postgres -d wrdance -c "SELECT id, name, price_monthly, price_yearly, max_students, allow_extra_students FROM system_plans ORDER BY id"',
  'echo "--- planId por org:"; docker exec dance-db psql -U postgres -d wrdance -c "SELECT id, name, \\"planId\\" FROM organizations ORDER BY id"',
  'echo "--- bundle (fallback/planos):"; docker exec dance-app sh -c "grep -o priceYearly /app/dist/index.js | head -1; grep -o 59.9 /app/dist/index.js | head -1"',
  'echo "--- schema drizzle (systemPlans price):"; grep -o "price_monthly[^,]*" drizzle/schema.ts | head -2',
].join(' ; ');
conn.on('ready', () => {
  conn.exec(remote, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n--- fim'); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
