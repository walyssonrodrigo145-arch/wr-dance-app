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
cd /root/evolution-api

cat << 'EOF' > docker-compose.yml
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
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=minha_chave_secreta_123
      - AUTHENTICATION_EXPOSE_IN_SERVER=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://postgres:postgres@evolution-db:5432/evolution?schema=public
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_exchange
      - RABBITMQ_ENABLED=false
      - WEBSOCKET_ENABLED=false
      - CACHE_REDIS_ENABLED=false
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    depends_on:
      - evolution-db

  evolution-db:
    image: postgres:15-alpine
    container_name: evolution-db
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=evolution
    volumes:
      - evolution_pgdata:/var/lib/postgresql/data

volumes:
  evolution_instances:
  evolution_store:
  evolution_pgdata:
EOF

docker compose down || true
docker compose up -d
`;

conn.on('ready', () => {
  conn.exec(script, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', () => {}).connect(config);
