const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: process.env.VPS_PASSWORD || 'Walysson2003@',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const commands = `
    echo "=== DOCKER PS DANCE ==="
    docker ps --filter "name=dance"
    echo ""
    echo "=== DANCE-APP LOGS ==="
    docker logs --tail 30 dance-app
    echo ""
    echo "=== CURL LOCAL 3002 ==="
    curl -Is http://127.0.0.1:3002 | head -n 10 || true
  `;

  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      return conn.end();
    }
    stream.on('close', () => conn.end()).on('data', (d) => {
      process.stdout.write(d.toString());
    }).stderr.on('data', (d) => {
      process.stderr.write(d.toString());
    });
  });
}).on('error', console.error).connect(config);
