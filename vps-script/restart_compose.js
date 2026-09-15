const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established. Stopping containers and restarting...');
  
  conn.exec('cd /root/wr-music-app && docker rm -f wr-music-app-app-1 wr-music-app-db-1 wr-music-app-caddy-1 2>/dev/null || true && docker compose down --remove-orphans && docker compose up -d', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Done with code ' + code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
});
