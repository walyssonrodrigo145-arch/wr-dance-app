const { Client } = require('ssh2');
const conn = new Client();

const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT'
};

conn.on('ready', () => {
  const query = `SELECT id, name, email, role, "createdAt" FROM users ORDER BY id DESC LIMIT 5;`;
  const cmd = `cd /root/wr-music-app && docker compose exec -T db psql -U postgres -d wrmusic -c '${query}'`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', data => console.log(data.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
