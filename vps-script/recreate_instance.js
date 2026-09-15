const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const commands = `
    curl -X DELETE http://localhost:8080/instance/logout/prof_1 -H "apikey: minha_chave_secreta_123"
    curl -X DELETE http://localhost:8080/instance/delete/prof_1 -H "apikey: minha_chave_secreta_123"
    sleep 2
    curl -s -X POST http://localhost:8080/instance/create -H "apikey: minha_chave_secreta_123" -H "Content-Type: application/json" -d '{"instanceName": "prof_1", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
    sleep 2
    curl -s -X GET http://localhost:8080/instance/connect/prof_1 -H "apikey: minha_chave_secreta_123"
  `;

  conn.exec(commands, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', () => {}).connect(config);
