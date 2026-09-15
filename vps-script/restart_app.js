const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Reiniciando container do aplicativo...');
  const cmd = `docker restart wr-music-app-app-1`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => console.log(d.toString()));
    stream.stderr.on('data', d => console.error(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
});
