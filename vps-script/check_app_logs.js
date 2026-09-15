// Logs recentes do app em produção (erros de runtime).
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
      const cmd = `cd ${repoPath} && docker compose logs --tail 250 app 2>&1 | grep -iE "error|exception|typeerror|cannot read|is not a function|professores" | tail -40`;
      conn.exec(cmd, (e2, s2) => {
        if (e2) throw e2;
        s2.on('data', (d) => process.stdout.write(d.toString()));
        s2.stderr.on('data', (d) => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
  });
}).connect(config);
