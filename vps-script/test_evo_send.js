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
  const payload = JSON.stringify({
    number: "553399958830",
    options: { delay: 1000, presence: "composing" },
    text: "Mensagem de teste curl"
  });

  const commands = `
    curl -X POST http://179.197.76.174:8080/message/sendText/prof_163 \\
         -H "Content-Type: application/json" \\
         -H "apikey: minha_chave_secreta_123" \\
         -d '${payload}'
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
