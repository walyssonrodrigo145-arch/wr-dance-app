const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  // 1. Corrige APP_URL no .env da VPS
  const fixEnv = `sed -i 's|APP_URL=http://localhost:5000|APP_URL=https://wrmusicpro.com.br|g' /root/wr-music-app/.env && echo "APP_URL corrigido:" && grep APP_URL /root/wr-music-app/.env`;
  conn.exec(fixEnv, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stdout.write('[ERR] ' + d.toString()));
    stream.on('close', () => {
      // 2. Reinicia o container para aplicar o novo .env
      const restart = `docker compose -f /root/wr-music-app/docker-compose.yml restart app && echo "Container reiniciado com sucesso"`;
      console.log('\n=== Reiniciando container ===');
      conn.exec(restart, (err2, stream2) => {
        if (err2) { conn.end(); return; }
        stream2.on('data', d => process.stdout.write(d.toString()));
        stream2.stderr.on('data', d => process.stdout.write('[ERR] ' + d.toString()));
        stream2.on('close', () => {
          // 3. Confirma
          const check = `docker exec wr-music-app-app-1 env | grep APP_URL`;
          console.log('\n=== Verificação final ===');
          conn.exec(check, (err3, stream3) => {
            if (err3) { conn.end(); return; }
            stream3.on('data', d => process.stdout.write(d.toString()));
            stream3.stderr.on('data', d => process.stdout.write('[ERR] ' + d.toString()));
            stream3.on('close', () => conn.end());
          });
        });
      });
    });
  });
}).connect(config);
