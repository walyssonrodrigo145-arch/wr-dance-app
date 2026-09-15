const { Client } = require('ssh2');

const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
};

const conn = new Client();
conn.on('ready', () => {
  // Lista todas as tabelas do banco
  const cmd = `docker exec wr-music-app-db-1 psql -U postgres -d postgres -c "\\dt"`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()); });
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
