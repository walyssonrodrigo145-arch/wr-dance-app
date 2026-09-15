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
  console.log('Cliente SSH conectado. Buscando o repositório...');
  
  // Find project and run git pull
  const commands = `
    cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1) || exit 1
    echo "Diretório encontrado: $(pwd)"
    git pull origin main
    echo "Pull concluído, instalando dependências (se necessário)..."
    npm install
    echo "Iniciando build..."
    npm run build
    echo "Reiniciando servidor..."
    pm2 restart all || npm run start
    echo "Deploy finalizado!"
  `;

  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('Erro ao executar comando:', err);
      return conn.end();
    }
    
    stream.on('close', (code, signal) => {
      console.log('Sessão encerrada com código:', code);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('Erro de conexão:', err);
}).connect(config);
