const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

// Envia mensagem de teste direto pela Evolution API para verificar se funciona
conn.on('ready', () => {
  console.log('Enviando mensagem de teste direto pela Evolution API...');

  const body = JSON.stringify({
    number: "553399958830",
    options: { delay: 1000, presence: "composing" },
    text: "🔧 Teste direto da Evolution API - se você recebeu isso, a API está funcionando!"
  });

  const cmd = `curl -s -X POST "http://localhost:8080/message/sendText/prof_163" \
    -H "apikey: minha_chave_secreta_123" \
    -H "Content-Type: application/json" \
    -d '${body}'`;

  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d.toString())
          .stderr.on('data', d => process.stderr.write(d.toString()))
          .on('close', () => {
            console.log('\n=== RESPOSTA DA EVOLUTION API ===');
            console.log(out);
            conn.end();
          });
  });
}).connect(config);
