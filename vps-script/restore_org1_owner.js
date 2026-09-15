// Restaura o ownerId da org 1 (corrompido para 1 pelo script bugado — user 1 não existe).
// Define como dono o admin MAIS ANTIGO da org 1 (dono original provável).
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

function exec(conn, repoPath, cmd) {
  return new Promise((resolve, reject) => {
    const full = `cd ${repoPath} && docker compose exec -T db psql -q -tA -U postgres wrmusic -c "${cmd.replace(/"/g, '\\"')}"`;
    conn.exec(full, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

const conn = new Client();
conn.on('ready', () => {
  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (d) => { repoPath += d.toString(); });
    stream.on('close', async () => {
      repoPath = repoPath.trim();
      try {
        const admins = await exec(conn, repoPath, `SELECT id || ' | ' || name || ' | ' || "createdAt" FROM users WHERE "organizationId"=1 AND role='admin' ORDER BY "createdAt" ASC`);
        console.log('Admins da org 1 (mais antigo primeiro):');
        console.log(admins);
        const firstAdmin = admins.split('\n').map(s => s.trim()).filter(Boolean)[0]?.split('|')[0]?.trim();
        if (!firstAdmin) throw new Error('Nenhum admin encontrado na org 1');
        await exec(conn, repoPath, `UPDATE organizations SET "ownerId"=${firstAdmin} WHERE id=1`);
        const v = await exec(conn, repoPath, `SELECT o."ownerId", (SELECT count(*) FROM users u WHERE u.id=o."ownerId") AS owner_existe, (SELECT count(*) FROM settings s WHERE s."userId"=1 AND s."organizationId"=1) AS settings_phantom FROM organizations o WHERE o.id=1`);
        console.log(`ORG1 => ${v} (ownerId restaurado para ${firstAdmin})`);
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
