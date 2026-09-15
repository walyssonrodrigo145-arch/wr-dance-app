const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  // Força recriar o container para que pegue o novo .env
  const cmd = `
    cd /root/wr-music-app &&
    docker compose down app &&
    docker compose up -d app &&
    sleep 5 &&
    docker exec wr-music-app-app-1 env | grep APP_URL &&
    echo "=== OK ==="
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stdout.write('[ERR] ' + d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
