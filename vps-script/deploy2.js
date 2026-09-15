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
    source ~/.bashrc
    source ~/.nvm/nvm.sh || true
    export PATH=$PATH:/usr/local/bin:/usr/bin
    cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1) || exit 1
    echo "Diretório encontrado: $(pwd)"
    echo "NPM version: $(npm -v)"
    npm install
    npm run build
    pm2 restart all
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
