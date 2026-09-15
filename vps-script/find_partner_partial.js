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
  const query = `cd /root/wr-music-app && docker compose exec -T db psql -U postgres -d wrmusic -c "SELECT u.id, u.name, u.email, u.role, u.\\"organizationId\\", o.name as org_name, o.\\"subscriptionStatus\\", o.\\"planId\\" FROM users u LEFT JOIN organizations o ON u.\\"organizationId\\" = o.id WHERE LOWER(u.email) LIKE '%oliveira%' OR LOWER(u.email) LIKE '%espaco%' OR LOWER(o.name) LIKE '%oliveira%' OR LOWER(o.name) LIKE '%espaco%';"`;
  
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
