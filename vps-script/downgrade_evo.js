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
    image: atendai/evolution-api:v1.6.1
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
      - WEBSOCKET_ENABLED=false
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store

volumes:
  evolution_instances:
  evolution_store:
EOF

docker compose down -v || true
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
