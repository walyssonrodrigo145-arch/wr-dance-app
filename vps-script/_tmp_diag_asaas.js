const { Client } = require('ssh2');
const conn = new Client();
const remote = [
  'echo "--- colunas system_plans:"; docker exec dance-db psql -U postgres -d wrdance -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'system_plans\' ORDER BY ordinal_position"',
  'echo "--- planos:"; docker exec dance-db psql -U postgres -d wrdance -c "SELECT id, name, \\"priceMonthly\\", \\"priceYearly\\", \\"maxStudents\\", \\"allow_extra_students\\" FROM system_plans"',
  'echo "--- orgs:"; docker exec dance-db psql -U postgres -d wrdance -c "SELECT id, name, \\"planId\\", \\"subscriptionStatus\\", \\"asaasSubscriptionId\\", \\"asaasCustomerId\\" FROM organizations ORDER BY id"',
  'echo "--- logs asaas:"; docker logs dance-app --tail 400 2>&1 | grep -iE "asaas|assinatura" | tail -12 || true',
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
