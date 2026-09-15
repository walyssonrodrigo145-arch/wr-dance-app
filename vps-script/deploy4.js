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
    echo "Procurando npm..."
    NPM_PATH=$(find / -name "npm" -type f -executable 2>/dev/null | grep -v "/var/lib/docker" | head -n 1)
    echo "NPM_PATH=$NPM_PATH"
    
    if [ ! -z "$NPM_PATH" ]; then
        NPM_DIR=$(dirname "$NPM_PATH")
        export PATH=$PATH:$NPM_DIR
        echo "Adicionado ao PATH. Novo PATH=$PATH"
        
        cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1) || exit 1
        echo "Executando npm run build..."
        npm run build
        
        PM2_PATH=$(find / -name "pm2" -type f -executable 2>/dev/null | grep -v "/var/lib/docker" | head -n 1)
        if [ ! -z "$PM2_PATH" ]; then
            $PM2_PATH restart all
        fi
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
