/**
 * fix_bot_postgres.js
 * Sobe a Evolution API v2 com PostgreSQL dedicado (SQLite não é mais suportado)
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

echo "===== [1/7] Parando container com erro ====="
cd /root/evolution-api
docker compose down 2>/dev/null || true

echo "===== [2/7] Escrevendo docker-compose.yml com PostgreSQL ====="
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
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evouser:evopass123@evolution-db:5432/evolutiondb
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_exchange
      - DATABASE_SAVE_DATA_INSTANCE=true
      - DATABASE_SAVE_DATA_NEW_MESSAGE=true
      - DATABASE_SAVE_MESSAGE_UPDATE=true
      - DATABASE_SAVE_DATA_CONTACTS=true
      - DATABASE_SAVE_DATA_CHATS=true
      - RABBITMQ_ENABLED=false
      - WEBSOCKET_ENABLED=false
      - CACHE_REDIS_ENABLED=false
      - QRCODE_LIMIT=10
      - QRCODE_EXPIRATION_LIMIT=30
      - LANGUAGE=pt-BR
    depends_on:
      - evolution-db
    networks:
      - evolution_net
    volumes:
      - evolution_instances:/evolution/instances

  evolution-db:
    image: postgres:15-alpine
    container_name: evolution-db
    restart: always
    environment:
      - POSTGRES_USER=evouser
      - POSTGRES_PASSWORD=evopass123
      - POSTGRES_DB=evolutiondb
    volumes:
      - evolution_db_data:/var/lib/postgresql/data
    networks:
      - evolution_net

volumes:
  evolution_instances:
  evolution_db_data:

networks:
  evolution_net:
    driver: bridge
COMPOSE_EOF

echo "===== [3/7] Subindo banco de dados PostgreSQL primeiro ====="
docker compose up -d evolution-db

echo "Aguardando PostgreSQL inicializar (20s)..."
sleep 20

echo "===== [4/7] Subindo Evolution API ====="
docker compose up -d evolution-api

echo "Aguardando Evolution API inicializar (40s)..."
sleep 40

echo "===== [5/7] Status dos containers ====="
docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"

echo ""
echo "===== [6/7] Logs do evolution-api (últimas 30 linhas) ====="
docker logs evolution-api --tail 30 2>&1

echo ""
echo "===== [7/7] Testando API ====="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null || echo "000")
echo "HTTP Status: $STATUS"

if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ] || [ "$STATUS" = "401" ]; then
  echo "✅ Evolution API está online!"
  echo "Listando instâncias:"
  curl -s http://localhost:8080/instance/fetchInstances -H "apikey: minha_chave_secreta_123"
else
  echo "⚠️ Evolution API ainda não respondeu (HTTP $STATUS)"
  echo "Logs adicionais:"
  docker logs evolution-api --tail 20 2>&1
fi
`;

conn.on('ready', () => {
  console.log('🚀 Subindo Evolution API com PostgreSQL...\n');
  console.log('⏳ Aguarde ~70 segundos...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
