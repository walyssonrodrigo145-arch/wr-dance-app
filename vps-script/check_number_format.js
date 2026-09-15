const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  console.log('Testando envio para ambos os formatos do número...');

  // Testa sem o 9 também: 5533 9958830 → 5533 99958830 (com 9) ou 5533 9958830 (sem)
  // O número que chegou foi 553399958830 (13 dígitos: 55 + 33 + 9 + 9958830)
  // Vamos checar se o número existe no WA
  
  const checkCmd = `curl -s -X POST "http://localhost:8080/chat/whatsappNumbers/prof_163" \
    -H "apikey: minha_chave_secreta_123" \
    -H "Content-Type: application/json" \
    -d '{"numbers":["553399958830","5533999958830","5533958830"]}'`;

  conn.exec(checkCmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d.toString())
          .stderr.on('data', d => process.stderr.write(d.toString()))
          .on('close', () => {
            console.log('\n=== CHECK NUMBER RESULT ===');
            console.log(out);
            conn.end();
          });
  });
}).connect(config);
