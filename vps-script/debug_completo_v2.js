/**
 * debug_completo_v2.js
 * Diagnóstico profundo: logs do app, estado da instância, teste de envio direto
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] ESTADO ATUAL DA INSTÂNCIA prof_163 ====="
curl -s http://localhost:8080/instance/connectionState/prof_163 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [2] LOGS DO APP - ÚLTIMAS 100 LINHAS ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 100 app 2>/dev/null

echo ""
echo "===== [3] LOGS EVOLUTION API - ÚLTIMAS 40 LINHAS ====="
docker logs evolution-api --tail 40 2>&1 | grep -v "█" | grep -v "^$"

echo ""
echo "===== [4] TESTE: Enviar mensagem direto pela Evolution API ====="
echo "Tentando enviar mensagem teste para 5531994105466..."
curl -s -X POST "http://localhost:8080/message/sendText/prof_163" \
  -H "Content-Type: application/json" \
  -H "apikey: minha_chave_secreta_123" \
  -d '{"number":"5531994105466","text":"🤖 Teste direto da Evolution API - bot funcionando!"}'

echo ""
echo "===== [5] chatbotEnabled no banco para userId=163 ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT "userId", "chatbotEnabled", "chatbotenabled", "whatsappBotUrl", "whatsappBotToken" FROM settings WHERE "userId" = 163;'

echo ""
echo "===== [6] Sessões ativas do chatbot ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT phone, state, "updatedAt" FROM "chatbotSessions" ORDER BY "updatedAt" DESC LIMIT 5;' 2>/dev/null || echo "Tabela chatbotSessions nao encontrada ou vazia"
`;

conn.on('ready', () => {
  console.log('🔬 Debug profundo do bot...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
