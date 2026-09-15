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
    # Find npm path
    export PATH=$PATH:/usr/local/bin:/usr/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ | head -n 1)/bin
    
    cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1) || exit 1
    echo "Diretório encontrado: $(pwd)"
    
    echo "Current PATH is: $PATH"
    
    if command -v npm &> /dev/null; then
        echo "NPM found: $(npm -v)"
        echo "Instalando dependências..."
        npm install
        
        echo "Iniciando build..."
        npm run build
        
        if command -v pm2 &> /dev/null; then
            echo "Reiniciando PM2..."
            pm2 restart all
        else
            echo "PM2 não encontrado no path. Tentando reiniciar npm..."
            npm run start &
        fi
    else
        echo "NPM AINDA NAO ENCONTRADO."
        # Lets try snap or other location
        ls -la /usr/local/bin/npm || true
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
