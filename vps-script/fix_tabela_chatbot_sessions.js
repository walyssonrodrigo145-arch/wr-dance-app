/**
 * fix_tabela_chatbot_sessions.js
 * Cria VIEW "chatbotSessions" apontando para chatbot_sessions
 * E testa envio de mensagem direto pela Evolution API
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Verificando se existe tabela chatbotSessions (camelCase) ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT table_name, table_type FROM information_schema.tables 
WHERE table_name IN ('chatbotSessions', 'chatbot_sessions')
ORDER BY table_name;
"

echo ""
echo "===== [2] Criando alias/view chatbotSessions -> chatbot_sessions ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
DO $$ 
BEGIN
  -- Remove view existente se houver
  DROP VIEW IF EXISTS "chatbotSessions" CASCADE;
  -- Cria view com nome camelCase apontando para a tabela real
  CREATE VIEW "chatbotSessions" AS SELECT * FROM chatbot_sessions;
  RAISE NOTICE '"'"'View chatbotSessions criada com sucesso'"'"';
END $$;
'

echo ""
echo "===== [3] Testando a view ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT id, phone, state FROM "chatbotSessions" LIMIT 3;'

echo ""
echo "===== [4] Verificando o drizzle schema para nome correto da tabela ====="
docker exec wr-music-app-app-1 cat /app/drizzle/schema.ts 2>/dev/null | grep -A 5 -i "chatbot" | head -20

echo ""
echo "===== [5] Teste direto: enviar mensagem via Evolution API para 553399958830 ====="
curl -s -X POST "http://localhost:8080/message/sendText/prof_163" \
  -H "Content-Type: application/json" \
  -H "apikey: minha_chave_secreta_123" \
  -d '{"number":"553399958830","options":{"delay":1000},"text":"🤖 Teste direto: Evolution API funcionando! O bot está online."}'

echo ""
echo "===== [6] Estado atual da instância prof_163 ====="
curl -s http://localhost:8080/instance/connectionState/prof_163 -H "apikey: minha_chave_secreta_123"
`;

conn.on('ready', () => {
  console.log('🔧 Corrigindo tabela chatbotSessions e testando envio...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
