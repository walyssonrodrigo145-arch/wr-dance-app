// Verificação pós-deploy: tabelas novas de avaliações criadas no banco de produção.
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const SQL = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('professor_evaluation_periods','professor_evaluations');`;

const conn = new Client();
conn.on('ready', () => {
  const cmd = `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('professor_evaluation_periods','professor_evaluations');"`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).connect(config);
