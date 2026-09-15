const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  // Lista todos os containers e bancos disponíveis
  const cmd = `docker ps --format "{{.Names}}" && echo "---" && docker exec wr-music-app-db-1 psql -U postgres -l 2>/dev/null || docker exec $(docker ps --format "{{.Names}}" | grep -i db | head -1) psql -U postgres -l 2>/dev/null`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
