const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };
conn.on('ready', () => {
  const commands = `curl -s -X POST http://localhost:8080/chat/whatsappNumbers/prof_1 -H "apikey: minha_chave_secreta_123" -H "Content-Type: application/json" -d '{"numbers": ["5533984055949", "553384055949"]}'`;
  conn.exec(commands, (err, stream) => {
    stream.on('close', () => conn.end()).on('data', d => process.stdout.write(d.toString())).stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).connect(config);
