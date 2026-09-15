const { Client } = require('ssh2');

const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
};

// 1. descobre o nome real da tabela
const query = `
  docker exec wr-music-app-db-1 psql -U postgres -d postgres -c "\\dt" 2>&1 | grep -i "setting\\|school\\|config\\|org"
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(query, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
