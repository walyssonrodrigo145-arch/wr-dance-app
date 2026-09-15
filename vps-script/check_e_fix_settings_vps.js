/**
 * check_e_fix_settings_vps.js
 * Verifica e corrige a URL da Evolution API nas configurações do banco
 * para o usuário prof_163
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] Verificando settings do usuário 163 no banco ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT 
  id, 
  \"userId\", 
  \"schoolName\", 
  \"whatsappBotUrl\", 
  \"whatsappBotToken\",
  \"chatbotEnabled\",
  phone
FROM settings 
WHERE \"userId\" = 163
LIMIT 1;
"

echo ""
echo "===== [2] Verificando TODOS os usuários com whatsappBotUrl configurado ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT 
  \"userId\",
  \"schoolName\",
  \"whatsappBotUrl\",
  \"chatbotEnabled\"
FROM settings 
WHERE \"whatsappBotUrl\" IS NOT NULL AND \"whatsappBotUrl\" != ''
LIMIT 10;
"

echo ""
echo "===== [3] IP atual da VPS ====="
curl -s ifconfig.me || hostname -I | awk '{print $1}'

echo ""
echo "===== [4] Corrigindo whatsappBotUrl para apontar para VPS atual ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
UPDATE settings 
SET 
  \"whatsappBotUrl\" = 'http://179.197.76.174:8080',
  \"whatsappBotToken\" = 'minha_chave_secreta_123'
WHERE \"userId\" = 163;
"

echo ""
echo "===== [5] Verificando após correção ====="
docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "
SELECT 
  \"userId\",
  \"schoolName\", 
  \"whatsappBotUrl\", 
  \"whatsappBotToken\",
  \"chatbotEnabled\"
FROM settings 
WHERE \"userId\" = 163;
"
`;

conn.on('ready', () => {
  console.log('🔍 Verificando e corrigindo URL da Evolution API no banco...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
