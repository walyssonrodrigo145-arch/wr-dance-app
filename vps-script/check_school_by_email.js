// Consulta os dados da escola pelo e-mail do responsável (prioridade: telefone).
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const EMAIL = 'cursomusicansa@gmail.com';

function exec(conn, repoPath, cmd) {
  return new Promise((resolve, reject) => {
    const full = `cd ${repoPath} && docker compose exec -T db psql -U postgres wrmusic -c "${cmd.replace(/"/g, '\\"')}"`;
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
        const q = `SELECT u.id AS user_id, u.name AS user_name, u.email, u.role, u."organizationId" AS org_id,
  o.name AS org_name, o."subscriptionStatus" AS sub_status, o.active AS org_active, o."ownerId" AS owner_id,
  s."schoolName", s."schoolPhone", s."schoolAddress", s."schoolEmail", s."pixKey"
FROM users u
LEFT JOIN organizations o ON o.id = u."organizationId"
LEFT JOIN settings s ON s."organizationId" = u."organizationId"
WHERE lower(u.email) = lower('${EMAIL}')
ORDER BY u.id, s.id LIMIT 10;`;
        const out = await exec(conn, repoPath, q);
        console.log(out);
        if (!out.includes('(0 rows)')) {
          const phone = out.split(/\n/).map(l => l.trim()).find(l => /^\s*\d+\s*\|/.test(l));
          console.log('---');
        }
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
