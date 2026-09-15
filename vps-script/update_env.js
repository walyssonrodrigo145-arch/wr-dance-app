const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  const cmd = `sed -i 's/GOOGLE_CLIENT_SECRET=.*/GOOGLE_CLIENT_SECRET="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"/' /root/wr-music-app/.env && cd /root/wr-music-app && docker compose restart`;
  conn.exec(cmd, (err, stream) => {
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect(config);
