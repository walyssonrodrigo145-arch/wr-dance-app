const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Consultando tokens salvos no Postgres na VPS...');
  const cmd = `docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"userId\\", SUBSTRING(token, 1, 35) as token_prefix, \\"updatedAt\\" FROM fcm_tokens ORDER BY \\"updatedAt\\" DESC LIMIT 5;"`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => console.log(d.toString()));
    stream.stderr.on('data', d => console.error(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
});
