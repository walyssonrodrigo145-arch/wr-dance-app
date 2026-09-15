/**
 * fix_bot_completo.js
 * Sobe a Evolution API na VPS, aguarda inicializar e registra o webhook.
 */
const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

// Script completo executado na VPS
const script = `
set -e

echo "===== [1/5] Criando diretório da Evolution API ====="
mkdir -p /root/evolution-api
cd /root/evolution-api

echo "===== [2/5] Escrevendo docker-compose.yml ====="
cat > docker-compose.yml << 'COMPOSE_EOF'
version: "3.7"
services:
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://179.197.76.174:8080
      - DOCKER_ENV=true
      - LOG_LEVEL=ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,FATAL
      - LOG_BAILEYS=error
      - DEL_INSTANCE=false
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=minha_chave_secreta_123
      - AUTHENTICATION_EXPOSE_IN_SERVER=true
      - DATABASE_PROVIDER=sqlite
      - DATABASE_CONNECTION_URI=sqlite://database/evolution.db
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_exchange
      - RABBITMQ_ENABLED=false
      - WEBSOCKET_ENABLED=false
      - CACHE_REDIS_ENABLED=false
      - QRCODE_LIMIT=10
      - QRCODE_EXPIRATION_LIMIT=30
      - LANGUAGE=pt-BR
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
volumes:
  evolution_instances:
  evolution_store:
COMPOSE_EOF

echo "===== [3/5] Parando container antigo (se existir) ====="
docker compose down 2>/dev/null || true
docker stop evolution-api 2>/dev/null || true
docker rm evolution-api 2>/dev/null || true

echo "===== [4/5] Subindo Evolution API ====="
docker compose up -d

echo "Aguardando 30s para a Evolution API inicializar..."
sleep 30

echo "===== [5/5] Verificando se está online ====="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 || echo "000")
echo "HTTP Status da Evolution API: $STATUS"

echo ""
echo "===== Listando instâncias existentes ====="
curl -s http://localhost:8080/instance/fetchInstances -H "apikey: minha_chave_secreta_123" | head -c 2000

echo ""
echo "===== DONE ====="
`;

conn.on('ready', () => {
  console.log('✅ SSH conectado. Executando fix completo da Evolution API...\n');
  console.log('⏳ Isso pode levar ~40 segundos (download da imagem + startup)...\n');

  conn.exec(script, (err, stream) => {
    if (err) {
      console.error('❌ Erro ao executar script:', err);
      conn.end();
      return;
    }

    stream
      .on('close', (code) => {
        console.log('\n✅ Script finalizado. Código:', code);
        conn.end();
      })
      .on('data', (data) => {
        process.stdout.write(data.toString());
      })
      .stderr.on('data', (data) => {
        process.stderr.write(data.toString());
      });
  });
}).on('error', (err) => {
  console.error('❌ Erro SSH:', err.message);
}).connect(config);
