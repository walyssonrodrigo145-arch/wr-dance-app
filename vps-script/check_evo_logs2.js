const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  conn.exec(`docker logs evolution-api --tail 50`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d.toString())
          .stderr.on('data', d => out += d.toString())
          .on('close', () => {
            console.log('Evolution API Logs:\n', out);
            conn.end();
          });
  });
}).connect(config);
