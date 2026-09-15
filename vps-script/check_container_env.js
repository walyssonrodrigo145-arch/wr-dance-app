const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Verificando variáveis dentro do container app...');
  const cmd = `docker exec -i wr-music-app-app-1 node -e "console.log('CONTAINER PROJECT_ID:', process.env.FIREBASE_PROJECT_ID); console.log('CONTAINER CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);"`;
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
