// Diagnóstico: localizar o código da thumbnail (ytimg) e do RepertoireTab no bundle SERVIDO em produção.
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
      const cmd = `cd ${repoPath} && echo "=== arquivos com ytimg ===" && docker compose exec -T app sh -c "grep -rl ytimg /app/dist/public/assets 2>/dev/null | head -5" ; echo "=== git commit no repo VPS ===" && git -C ${repoPath} log --oneline -1 ; docker compose exec -T app sh -c "grep -c 'Repertorio\\|Repertório' /app/dist/public/assets/Progresso-*.js 2>/dev/null | head -5"`;
      conn.exec(cmd, (e2, s2) => {
        if (e2) throw e2;
        s2.on('data', (d) => process.stdout.write(d.toString()));
        s2.stderr.on('data', (d) => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
  });
}).connect(config);
