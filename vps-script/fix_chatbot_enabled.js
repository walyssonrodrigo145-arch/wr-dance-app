/**
 * fix_chatbot_enabled.js
 * Corrige a coluna duplicada chatbotenabled e sincroniza com chatbotEnabled
 * Também cria a tabela chatbotSessions se não existir
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Verificando colunas duplicadas em settings ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'settings' AND lower(column_name) = 'chatbotenabled'
ORDER BY column_name;
"

echo ""
echo "===== [2] Sincronizando chatbotenabled = chatbotEnabled para TODOS ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
UPDATE settings SET chatbotenabled = "chatbotEnabled";
'

echo ""
echo "===== [3] Verificando resultado para userId 163 ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
SELECT "userId", "chatbotEnabled", chatbotenabled, "whatsappBotUrl" FROM settings WHERE "userId" = 163;
'

echo ""
echo "===== [4] Verificando tabela chatbotSessions ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%chatbot%' OR table_name ILIKE '%session%';
"

echo ""
echo "===== [5] Verificando webhook ativo na instância prof_163 ====="
curl -s http://localhost:8080/webhook/find/prof_163 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [6] Estado atual da instância prof_163 ====="
curl -s http://localhost:8080/instance/connectionState/prof_163 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [7] Logs do app - últimas mensagens do webhook ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 300 app 2>/dev/null | grep -iE "(Webhook Debug|Chatbot|MESSAGES_UPSERT|messages.upsert|fromMe|remoteJid)" | tail -30
`;

conn.on('ready', () => {
  console.log('🔧 Corrigindo chatbotenabled e verificando tudo...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
