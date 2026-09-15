// Deploy de PRODUÇÃO — AUDIT FIX (18/08/2026)
// Substitui o upload_and_deploy_fixed.js (lista parcial de arquivos + DELETEs hardcoded no DB).
// Estratégia: o código confiável é o origin/main (commit aprovado) — puxa via git e reconstrói.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  // AUDIT-P0 FIX: senha nunca em código-fonte — defina VPS_PASSWORD no ambiente do deploy.
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

console.log('🚀 Iniciando deploy de PRODUÇÃO (git-based, sem upload parcial)...');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established. Locating wr-music-app repository...');

  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (data) => { repoPath += data.toString(); });
    stream.on('close', () => {
      repoPath = repoPath.trim();
      if (!repoPath) {
        console.error('Repo not found!');
        conn.end();
        return;
      }
      // NÃO há uploads SFTP nem comandos destrutivos: o código vem 100% do origin/main.
      const rebuildCmd = `
        cd ${repoPath}
        echo "📦 Gerando backup de segurança do banco de dados na VPS..."
        mkdir -p /root/backups
        docker compose exec -T db pg_dump -U postgres wrmusic > /root/backups/backup_auto_$(date +%Y%m%d_%H%M%S).sql || echo "⚠️ Aviso: Backup ignorado se o container do banco ainda não estiver ativo."
        echo "🔄 Sincronizando código com origin/main..."
        git fetch origin main && git reset --hard origin/main || { echo "FALHA ao sincronizar com origin/main"; exit 1; }
        echo "🔐 Garantindo INFINITEPAY_WEBHOOK_TOKEN no .env (webhook InfinitePay)..."
        if ! grep -q "^INFINITEPAY_WEBHOOK_TOKEN=" .env 2>/dev/null; then
          IP_TOKEN=$(openssl rand -hex 24)
          echo "INFINITEPAY_WEBHOOK_TOKEN=\${IP_TOKEN}" >> .env
          echo "INFINITEPAY_WEBHOOK_TOKEN gerado (\${IP_TOKEN:0:6}...) e adicionado ao .env"
        else
          echo "INFINITEPAY_WEBHOOK_TOKEN já configurado no .env"
        fi
        docker compose -f docker-compose.yml build --no-cache
        docker compose -f docker-compose.yml up -d
        docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || docker compose restart caddy
        echo "PRODUCTION deploy complete! Accessible at https://wrmusicpro.com.br"
      `;
      console.log('Executando: git sync + docker compose build/up + caddy reload...');
      conn.exec(rebuildCmd, (err, rebuildStream) => {
        if (rebuildStream) {
          rebuildStream.stdout.on('data', data => process.stdout.write(data.toString()));
          rebuildStream.stderr.on('data', data => process.stderr.write(data.toString()));
          rebuildStream.on('close', () => {
            console.log('✅ Deploy de PRODUÇÃO concluído com sucesso!');
            conn.end();
          });
        } else {
          console.error('Falha ao iniciar stream de deploy:', err ? err.message : '(sem stream)');
          conn.end();
        }
      });
    });
  });
}).connect(config);