// Debug: captura stdout + stderr de um comando simples na VPS.
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
  conn.exec('echo START; ls -la /root/inv_jefferson.txt 2>&1; base64 -w0 /root/inv_jefferson.txt 2>&1 | head -c 200; echo; echo END', (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { out += '[STDERR] ' + d.toString(); });
    stream.on('close', (code) => {
      console.log('===SAIDA===');
      console.log(out);
      console.log('===FIM code=' + code + '===');
      conn.end();
    });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
