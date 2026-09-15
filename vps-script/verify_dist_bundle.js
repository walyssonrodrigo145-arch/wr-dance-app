const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Buscando VAPID KEY no bundle estatico minificado dist/public/assets...');
  const cmd = `docker exec -i wr-music-app-app-1 grep -r "BDlduzxrP1XvNEai25cc2lIgwuU6bFipBmkk28AMIAm" /app/dist/public/assets/`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.stderr.on('data', d => console.error(d.toString()));
    stream.on('close', () => {
      console.log('RESULTADO DA BUSCA NO BUNDLE DIST DA VPS:');
      console.log(out ? '✅ A CHAVE BDlduzxr... EXISTE NO JS COMPILADO DO FRONTEND!' : '❌ A CHAVE NÃO FOI ENCONTRADA NO BUNDLE COMPILADO!');
      conn.end();
    });
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
});
