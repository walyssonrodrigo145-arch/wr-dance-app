const ssh2 = require('ssh2');
const conn = new ssh2.Client();
conn.on('ready', () => {
  const cmd = `curl -s -m 10 -X POST "https://wrmusicpro.com.br/api/webhooks/whatsapp?token=XzUQESrfhmt7qLYZ72j4V11tT4lJ8KGHyhB2PU3nosQ" -H "Content-Type: application/json" -d '{"event":"messages.upsert","instance":"prof_163","data":{"key":{"remoteJid":"5511999990001@s.whatsapp.net","fromMe":false,"id":"TESTEALUNO1"},"pushName":"Aluno Teste","message":{"conversation":"oi! queria saber que dias voce tem aula de violao"}}}' | head -c 100; echo; sleep 12; docker logs wr-music-app-app-1 --since 2m 2>&1 | grep -iE "AI Atendimento|Chatbot|Erro|Groq|Gemini" | tail -8; docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT phone, state, "updatedAt", LEFT(data, 300) FROM chatbot_sessions WHERE phone LIKE '"'"'%9990001%'"'"';'`;
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).on('error', e => console.error('conn error', e.message))
  .connect({ host: '179.197.76.174', username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 10000 });
setTimeout(() => { process.exit(0); }, 40000);
