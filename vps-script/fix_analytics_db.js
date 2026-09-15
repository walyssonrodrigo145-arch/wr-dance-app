const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Adicionando coluna fingerprint no banco da VPS...');
  const cmd = `docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic -c "ALTER TABLE analytics_visitors ADD COLUMN IF NOT EXISTS fingerprint varchar(128);"`;
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
