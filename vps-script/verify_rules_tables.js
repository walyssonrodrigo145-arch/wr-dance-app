// Verifica se as tabelas de regras de cobrança foram criadas em produção.
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
        const count = await exec(conn, repoPath, `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('teacher_payment_rules','teacher_payment_rule_conditions','teacher_payment_rule_courses')`);
        const cols = await exec(conn, repoPath, `SELECT count(*) FROM information_schema.columns WHERE table_name='professor_payments' AND column_name IN ('ruleSnapshot','calculationMemory')`);
        console.log(`tabelas de regras: ${count}/3 | colunas de folha: ${cols}/2`);
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
