// Diagnóstico 12b: assinatura MusicPro da org 29 (aspas corretas).
const { Client } = require('ssh2');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const SQL = `SELECT id, name, slug, "subscriptionStatus", "trialEndsAt", "currentPeriodEnd", "asaasCustomerId", "asaasSubscriptionId", "planId", "ownerId", active FROM organizations WHERE id = 29;`;

const conn = new Client();
conn.on('ready', () => {
  const cmd = `docker exec wr-music-app-db-1 psql -U postgres -x -d wrmusic -c '${SQL}'`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).connect(config);
