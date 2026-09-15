const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Verificando se a nova VAPID KEY esta gravada no arquivo client/src/lib/firebaseConfig.ts DENTRO do container da VPS...');
  const cmd = `docker exec -i wr-music-app-app-1 cat /app/client/src/lib/firebaseConfig.ts`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.stderr.on('data', d => console.error(d.toString()));
    stream.on('close', () => {
      console.log('LINHAS INICIAIS DO ARQUIVO NA VPS:');
      console.log(out.substring(0, 500));
      conn.end();
    });
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
});
