/**
 * debug_sessoes_e_resposta.js
 * Verifica por que o bot recebeu mas não respondeu
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Logs COMPLETOS do webhook da última mensagem ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 400 app 2>/dev/null | grep -A 30 "Boa tarde"

echo ""
echo "===== [2] Todos os erros do app nos últimos logs ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 300 app 2>/dev/null | grep -iE "(error|Error|ERRO|warn|Warn)" | tail -30

echo ""
echo "===== [3] Verificando tabelas chatbot no banco ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT table_name FROM information_schema.tables 
WHERE lower(table_name) LIKE '%chatbot%' OR lower(table_name) LIKE '%session%';
"

echo ""
echo "===== [4] Verificar schema da tabela chatbot_sessions ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'chatbot_sessions' OR table_name = 'chatbotSessions'
ORDER BY ordinal_position;
" 2>/dev/null

echo ""
echo "===== [5] Sessões existentes ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT * FROM chatbot_sessions ORDER BY "updatedAt" DESC LIMIT 5;' 2>/dev/null || \
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT * FROM "chatbotSessions" ORDER BY "updatedAt" DESC LIMIT 5;' 2>/dev/null || \
echo "Nenhuma sessão encontrada"

echo ""
echo "===== [6] Resposta do app após mensagem (logs completos últimas 5 min) ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --since 5m app 2>/dev/null | tail -80
`;

conn.on('ready', () => {
  console.log('🔬 Investigando por que o bot não respondeu...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
