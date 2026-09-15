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
  const commands = `
    cd /root/wr-music-app && docker compose -f docker-compose.staging.yml ps && docker compose -f docker-compose.staging.yml logs --tail 50
  `;

  conn.exec(commands, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect(config);
