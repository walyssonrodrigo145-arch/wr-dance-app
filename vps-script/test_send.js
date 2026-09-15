const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };
conn.on('ready', () => {
  const commands = `curl -s -X POST http://localhost:8080/message/sendText/prof_1 -H "apikey: minha_chave_secreta_123" -H "Content-Type: application/json" -d '{"number": "5511999999999", "options": {"delay": 1200, "presence": "composing"}, "textMessage": {"text": "test"}}'`;
  conn.exec(commands, (err, stream) => {
    stream.on('close', () => conn.end()).on('data', d => process.stdout.write(d.toString())).stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect(config);
