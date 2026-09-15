/**
 * pos_deploy_fix.js
 * Após o deploy: corrige URL no banco e re-registra webhook na instância prof_163
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Aguardando app inicializar (15s) ====="
sleep 15

echo ""
echo "===== [2] Corrigindo whatsappBotUrl no banco (pode ter resetado após deploy) ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
UPDATE settings 
SET "whatsappBotUrl" = '"'"'http://179.197.76.174:8080'"'"', 
    "whatsappBotToken" = '"'"'minha_chave_secreta_123'"'"';
'

echo ""
echo "===== [3] Sincronizando chatbotenabled = chatbotEnabled ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
UPDATE settings SET chatbotenabled = "chatbotEnabled";
'

echo ""
echo "===== [4] Verificando settings do userId 163 ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
SELECT "userId", "schoolName", "chatbotEnabled", chatbotenabled, "whatsappBotUrl" FROM settings WHERE "userId" = 163;
'

echo ""
echo "===== [5] Re-registrando webhook na instância prof_163 ====="
curl -s -X POST "http://localhost:8080/webhook/set/prof_163" \
  -H "Content-Type: application/json" \
  -H "apikey: minha_chave_secreta_123" \
  -d '{"webhook":{"enabled":true,"url":"https://wrmusicpro.com.br/api/webhooks/whatsapp","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT","CONNECTION_UPDATE","MESSAGES_UPDATE"]}}'

echo ""
echo "===== [6] Estado da instância prof_163 ====="
curl -s http://localhost:8080/instance/connectionState/prof_163 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [7] App está respondendo? ====="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://wrmusicpro.com.br 2>/dev/null)
echo "HTTP Status wrmusicpro.com.br: $STATUS"

echo ""
echo "===== TUDO PRONTO ====="
`;

conn.on('ready', () => {
  console.log('🔧 Pós-deploy: corrigindo banco e webhook...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
