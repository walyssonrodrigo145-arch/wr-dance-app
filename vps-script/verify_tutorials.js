// Verificação pós-deploy dos Tutoriais: tabela system_tutorials criada,
// escola limpa com credenciais corretas e contagem de dados.
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
        const table = await exec(conn, repoPath, `SELECT count(*) FROM information_schema.tables WHERE table_name='system_tutorials'`);
        console.log(`tabela system_tutorials existe: ${table === '1'}`);
        const idx = await exec(conn, repoPath, `SELECT count(*) FROM pg_indexes WHERE indexname='system_tutorials_active_pos_idx'`);
        console.log(`índice ativo/pos: ${idx === '1'}`);
        const rows = await exec(conn, repoPath, `SELECT count(*) FROM system_tutorials`);
        console.log(`linhas em system_tutorials: ${rows}`);
        const school = await exec(conn, repoPath, `SELECT u.id, u.email, u.role, u."organizationId", o.name, (SELECT count(*) FROM students s WHERE s."organizationId"=u."organizationId") AS alunos, (SELECT count(*) FROM lessons l WHERE l."organizationId"=u."organizationId") AS aulas, o."ownerId" FROM users u JOIN organizations o ON o.id=u."organizationId" WHERE u.email='tutoriais@musicpro.com.br'`);
        console.log(`escola: ${school}`);
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
