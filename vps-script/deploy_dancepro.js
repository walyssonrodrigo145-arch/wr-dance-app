const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  // SEGURANÇA: senha hardcoded removida (estava vazando no repo).
  // Defina VPS_PASSWORD no ambiente antes de rodar:  $env:VPS_PASSWORD='...'; node vps-script/deploy_dancepro.js
  password: process.env.VPS_PASSWORD,
  readyTimeout: 30000
};

conn.on('ready', () => {
  console.log('[SSH] Conectado com sucesso à VPS!');
  
  const commands = `
    set -e
    echo "=== 1. PREPARANDO DIRETÓRIO DO WR-DANCE-APP ==="
    if [ ! -d "/root/wr-dance-app" ]; then
      echo "Clonando repositório wr-dance-app..."
      git clone https://github.com/walyssonrodrigo145-arch/wr-dance-app.git /root/wr-dance-app
    else
      echo "Repositório já existe, atualizando código..."
      cd /root/wr-dance-app
      git reset --hard HEAD
      git fetch origin
      git checkout main
      git pull origin main
    fi

    echo "=== 2. CONFIGURANDO .env DEDICADO DO WR-DANCE-APP ==="
    cd /root/wr-dance-app
    # Se não existir .env no servidor, copia do modelo e ajusta variáveis do dancepro
    if [ ! -f "/root/wr-dance-app/.env" ]; then
      cp /root/wr-music-app/.env /root/wr-dance-app/.env
    fi

    # Ajusta o DATABASE_URL para apontar para dance-db (ou banco wrdance)
    sed -i 's|/wrmusic|/wrdance|g' /root/wr-dance-app/.env
    sed -i 's|APP_URL=.*|APP_URL=https://dancepro.wrmusicpro.com.br|g' /root/wr-dance-app/.env

    echo "=== 3. CONFIGURANDO CADDY NA VPS PARA O SUBDOMÍNIO DANCEPRO ==="
    # Verifica se dancepro.wrmusicpro.com.br já está no Caddyfile principal da VPS
    if ! grep -q "dancepro.wrmusicpro.com.br" /root/wr-music-app/Caddyfile; then
      echo "Adicionando dancepro.wrmusicpro.com.br ao Caddyfile da VPS..."
      cat << 'EOF' >> /root/wr-music-app/Caddyfile

dancepro.wrmusicpro.com.br {
    reverse_proxy dance-app:5000
}
EOF
      echo "Recarregando Caddy da VPS..."
      cd /root/wr-music-app && (docker compose exec -w /etc/caddy caddy caddy reload || docker restart wr-music-app-caddy-1 || echo 'AVISO: Caddy nao recarregado automaticamente (dominio ja configurado). Seguindo o deploy.')
    else
      echo "Entrada dancepro.wrmusicpro.com.br já presente no Caddyfile da VPS."
      # Garante que aponta para dance-app:5000
      sed -i 's|reverse_proxy app:3000|reverse_proxy dance-app:5000|g' /root/wr-music-app/Caddyfile
      cd /root/wr-music-app && (docker compose exec -w /etc/caddy caddy caddy reload || docker restart wr-music-app-caddy-1 || echo 'AVISO: Caddy nao recarregado automaticamente (dominio ja configurado). Seguindo o deploy.')
    fi

    echo "=== 4. SUBINDO OS CONTAINERS DO DANCEPRO (DOCKER COMPOSE) ==="
    cd /root/wr-dance-app
    docker compose down --remove-orphans || true
    docker compose build --no-cache
    docker compose up -d

    echo "=== 5. STATUS DOS CONTAINERS DO DANCEPRO ==="
    docker ps --filter "name=dance"
  `;

  conn.exec(commands, (err, stream) => {
    if (err) {
      console.error('[SSH] Erro ao executar:', err);
      return conn.end();
    }
    stream.on('close', (code) => {
      console.log(`[SSH] Processo finalizado com código: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('[SSH] Falha de conexão:', err);
}).connect(config);
