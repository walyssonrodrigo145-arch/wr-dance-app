// Verificação pós-deploy do encurtador: container, rota /p/:code, tabela e home.
// Uso: node -r dotenv/config vps-script/verify_shortlinks_deploy.js
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    `cd /root/wr-music-app && docker compose ps --format "table {{.Name}}\\t{{.Status}}"`,
    `curl -s -o /dev/null -w "rota_/p_inexistente=%{http_code} redirect=%{redirect_url}" "https://wrmusicpro.com.br/p/teste-inexistente-xyz"`,
    `cd /root/wr-music-app && docker compose exec -T db psql -U postgres wrmusic -c "\\d short_links" | head -18`,
    `curl -s -o /dev/null -w "home=%{http_code}" https://wrmusicpro.com.br`,
  ].join(' && echo "-----" && ');
  conn.exec(cmds, (err, stream) => {
    if (err) throw err;
    stream.stdout.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n✅ Verificação do encurtador concluída'); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
