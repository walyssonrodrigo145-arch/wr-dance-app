/**
 * debug_erro_resposta.js
 * Captura o erro exato após o bot receber a mensagem
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== Logs completos do app - capturando erro após mensagem ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 500 app 2>/dev/null | grep -A 50 "Boa tarde"

echo ""
echo "===== Verificar nome exato da tabela chatbotSessions no banco ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT table_name FROM information_schema.tables 
WHERE lower(table_name) LIKE '%chatbot%' OR lower(table_name) LIKE '%session%'
ORDER BY table_name;
"

echo ""
echo "===== Schema da tabela de sessões do chatbot ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = '"'"'chatbot_sessions'"'"'
ORDER BY ordinal_position;
'

echo ""
echo "===== Últimas sessões no banco ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
SELECT id, phone, state, "updatedAt" FROM chatbot_sessions ORDER BY "updatedAt" DESC LIMIT 10;
'

echo ""
echo "===== Erros do app hoje ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --since 2h app 2>/dev/null | grep -iE "(error|Error|ERRO|throw|catch|reject|exception|WhatsApp Webhook)" | tail -30
`;

conn.on('ready', () => {
  console.log('🔬 Capturando erro exato após receber mensagem...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
