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
    docker ps | grep 8080
    docker rm -f $(docker ps -q --filter "ancestor=meu-bot-whatsapp-bot") || true
    docker stop $(docker ps -q --filter expose=8080) || true
    docker rm $(docker ps -q --filter expose=8080) || true
    cd /root/evolution-api
    docker compose up -d
  `;

  conn.exec(commands, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', () => {}).connect(config);
