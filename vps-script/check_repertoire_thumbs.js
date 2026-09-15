// Diagnóstico: por que a capa (thumbnail) não aparece nos cards do Repertório?
// Lista as últimas linhas de student_repertoire para verificar videoId/playlistId/youtubeUrl.
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
      if (!repoPath) { console.error('Repo not found!'); conn.end(); return; }
      const q = `SELECT id, title, "videoId", "playlistId", left("youtubeUrl", 90) AS url, "createdAt" FROM student_repertoire ORDER BY id DESC LIMIT 10;`;
      const cmd = `cd ${repoPath} && docker compose exec -T db psql -U postgres wrmusic -c "${q.replace(/"/g, '\\"')}"`;
      conn.exec(cmd, (e2, s2) => {
        if (e2) throw e2;
        s2.on('data', (d) => process.stdout.write(d.toString()));
        s2.stderr.on('data', (d) => process.stderr.write(d.toString()));
        s2.on('close', () => conn.end());
      });
    });
  });
}).connect(config);
