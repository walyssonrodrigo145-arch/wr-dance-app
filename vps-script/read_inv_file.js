// Leitura do arquivo de investigação na VPS (output limpo via stdout).
// Uso: node -r dotenv/config vps-script/read_inv_file.js
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
  conn.exec('base64 -w0 /root/inv_jefferson.txt', (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.on('close', () => {
      try { console.log(Buffer.from(out.trim(), 'base64').toString('utf8')); }
      catch (e) { console.log('RAW:', out); }
      conn.end();
    });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
