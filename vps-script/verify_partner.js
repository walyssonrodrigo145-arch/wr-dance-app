const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const email = 'espacomusicaleduoliveira2012@gmail.com';
  const query = `cd /root/wr-music-app && docker compose exec -T db psql -U postgres -d wrmusic -c "SELECT u.id as user_id, u.name as user_name, u.email, u.role, o.id as org_id, o.name as org_name, o.slug, o.\\"subscriptionStatus\\", o.\\"planId\\", o.\\"asaasSubscriptionId\\", p.name as plan_name, p.max_students, p.price_monthly FROM users u JOIN organizations o ON u.\\"organizationId\\" = o.id JOIN system_plans p ON o.\\"planId\\" = p.id WHERE LOWER(u.email) = LOWER('${email}');"`;
  
  conn.exec(query, (err, stream) => {
    if (err) throw err;
    let data = '';
    stream.on('data', d => data += d.toString());
    stream.stderr.on('data', d => data += d.toString());
    stream.on('close', () => {
      console.log(data);
      conn.end();
    });
  });
}).connect(config);
