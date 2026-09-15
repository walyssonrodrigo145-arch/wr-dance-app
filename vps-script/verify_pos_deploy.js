// Verificação pós-deploy InfinitePay: container, token do webhook e resposta HTTP.
// Uso: node -r dotenv/config vps-script/verify_pos_deploy.js
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
  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (d) => { repoPath += d.toString(); });
    stream.on('close', () => {
      repoPath = repoPath.trim();
      const cmds = [
        `cd ${repoPath} && docker compose ps --format "table {{.Name}}\\t{{.Status}}"`,
        `cd ${repoPath} && (grep -q "^INFINITEPAY_WEBHOOK_TOKEN=" .env && echo "TOKEN_OK (presente no .env)" || echo "TOKEN_AUSENTE")`,
        `cd ${repoPath} && docker compose logs app --tail 400 2>&1 | grep -iE "error|exception|infinitepay|server (started|running)|listening" | tail -20`,
        `curl -s -o /dev/null -w "HTTP %{http_code}" https://wrmusicpro.com.br`,
      ].join(' && echo "-----" && ');
      conn.exec(cmds, (e2, s2) => {
        if (e2) throw e2;
        s2.stdout.on('data', (d) => process.stdout.write(d.toString()));
        s2.stderr.on('data', (d) => process.stderr.write(d.toString()));
        s2.on('close', () => { console.log('\n✅ Verificação pós-deploy concluída'); conn.end(); });
      });
    });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
