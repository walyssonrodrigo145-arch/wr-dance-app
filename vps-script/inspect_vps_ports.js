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
    echo "=== DOCKER CONTAINERS ATIVOS ==="
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "=== PORTAS EM USO (80, 443, 3000, 3001, 3002, 5432, 5433) ==="
    netstat -tuln | grep -E ':(80|443|3000|3001|3002|5432|5433)\b' || ss -tuln | grep -E ':(80|443|3000|3001|3002|5432|5433)\b'
    echo ""
    echo "=== DIRETÓRIOS EM /root ==="
    ls -la /root
  `;

  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      return conn.end();
    }
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => console.error('SSH Error:', err)).connect(config);
