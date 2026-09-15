/**
 * fix_settings_db_v2.js
 * Corrige URL da Evolution API no banco - versão com quotes corretas
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Listando colunas da tabela settings ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'settings' 
ORDER BY ordinal_position;
"

echo ""
echo "===== [2] Buscando settings do usuário com whatsappBotUrl ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT id, "userId", "schoolName", "whatsappBotUrl", "whatsappBotToken", "chatbotEnabled", phone FROM settings LIMIT 5;'

echo ""
echo "===== [3] Atualizando whatsappBotUrl para VPS atual (todos os usuários) ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'UPDATE settings SET "whatsappBotUrl" = '"'"'http://179.197.76.174:8080'"'"', "whatsappBotToken" = '"'"'minha_chave_secreta_123'"'"';'

echo ""
echo "===== [4] Verificando resultado ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT "userId", "schoolName", "whatsappBotUrl", "whatsappBotToken", "chatbotEnabled" FROM settings;'
`;

conn.on('ready', () => {
  console.log('🔧 Corrigindo URL da Evolution API no banco de dados...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
