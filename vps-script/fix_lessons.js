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
  console.log('SSH connection established. Executing DB update...');
  
  const cmd = `docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic -c "UPDATE lessons SET status = 'agendada' WHERE status = 'falta';"`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.error('STDERR: ' + data);
    }).on('close', (code, signal) => {
      console.log('Command closed with code ' + code);
      conn.end();
    });
  });
}).connect(config);
