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
    cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1) || exit 1
    echo "Verificando se usa Docker..."
    if [ -f "docker-compose.yml" ]; then
        echo "Docker compose encontrado. Reconstruindo..."
        docker-compose down
        docker-compose build
        docker-compose up -d
        echo "Containers reiniciados!"
    else
        echo "Docker-compose não encontrado. Listando containers em execução:"
        docker ps
    fi
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
