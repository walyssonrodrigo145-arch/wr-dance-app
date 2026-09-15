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
  console.log('Fetching app logs...');
  const findCmd = 'cd /root/wr-music-app && docker compose logs --tail=100 app';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let logs = '';
    stream.on('data', (data) => { logs += data.toString(); });
    stream.stderr.on('data', (data) => { logs += data.toString(); });
    stream.on('close', () => {
      console.log(logs);
      conn.end();
    });
  });
}).connect(config);
