/**
 * fix_bot_v2.js
 * Sobe a Evolution API usando a imagem oficial evoapicloud/evolution-api:latest
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

const script = `
set -e

echo "===== [1/6] Preparando diretório ====="
mkdir -p /root/evolution-api
cd /root/evolution-api

echo "===== [2/6] Escrevendo docker-compose.yml (imagem oficial evoapicloud) ====="
cat > docker-compose.yml << 'COMPOSE_EOF'
version: "3.7"
services:
  evolution-api:
    image: evoapicloud/evolution-api:latest
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

echo "===== [3/6] Parando container antigo (se existir) ====="
docker compose down 2>/dev/null || true
docker stop evolution-api 2>/dev/null || true
docker rm evolution-api 2>/dev/null || true

echo "===== [4/6] Pull da imagem evoapicloud/evolution-api:latest ====="
docker pull evoapicloud/evolution-api:latest

echo "===== [5/6] Subindo Evolution API ====="
docker compose up -d

echo "Aguardando 35s para inicializar..."
sleep 35

echo "===== [6/6] Verificando status ====="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null || echo "000")
echo "HTTP Status da Evolution API na porta 8080: $STATUS"

echo ""
echo "Testando com apikey..."
curl -s http://localhost:8080/instance/fetchInstances -H "apikey: minha_chave_secreta_123"

echo ""
echo "Containers ativos:"
docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"
`;

conn.on('ready', () => {
  console.log('✅ SSH conectado. Usando imagem evoapicloud/evolution-api:latest...\n');
  console.log('⏳ Aguarde ~60s (pull + startup)...\n');

  conn.exec(script, (err, stream) => {
    if (err) {
      console.error('❌ Erro:', err);
      conn.end();
      return;
    }

    stream
      .on('close', (code) => {
        console.log('\n✅ Script finalizado. Código de saída:', code);
        conn.end();
      })
      .on('data', (data) => process.stdout.write(data.toString()))
      .stderr.on('data', (data) => process.stderr.write(data.toString()));
  });
}).on('error', (err) => {
  console.error('❌ Erro SSH:', err.message);
}).connect(config);
