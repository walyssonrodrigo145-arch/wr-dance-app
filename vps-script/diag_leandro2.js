// Diagnóstico 2: busca ampla por Leandro em students/users/responsavel + dues.
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
  const run = (label, sql) => {
    return new Promise((resolve) => {
      const cmd = `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "${sql.replace(/"/g, '\\"')}"`;
      conn.exec(cmd, (err, stream) => {
        if (err) { console.error(label, 'ERR', err.message); return resolve(); }
        let out = `\n===== ${label} =====\n`;
        stream.on('data', (d) => { out += d.toString(); });
        stream.stderr.on('data', (d) => { out += d.toString(); });
        stream.on('close', () => { console.log(out); resolve(); });
      });
    });
  };
  (async () => {
    await run('STUDENTS com leandro', `SELECT id, name, "organizationId", status, "responsavelNome", "responsavelEmail" FROM students WHERE name ILIKE '%leandro%' OR "responsavelNome" ILIKE '%leandro%' LIMIT 10;`);
    await run('USERS com leandro', `SELECT id, name, email, role, "organizationId" FROM users WHERE name ILIKE '%leandro%' OR email ILIKE '%leandro%' LIMIT 10;`);
    conn.end();
  })();
}).connect(config);
