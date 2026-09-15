/**
 * setup_webhook_e_instancia.js
 * 1. Testa conectividade entre o app e a Evolution API
 * 2. Cria a instância prof_1 com webhook configurado
 * 3. Obtém o QR Code para reconectar o WhatsApp
 */
const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

const APIKEY = 'minha_chave_secreta_123';
const EVO_URL = 'http://localhost:8080';
const WEBHOOK_URL = 'https://wrmusicpro.com.br/api/webhooks/whatsapp';
const INSTANCE = 'prof_1';

const script = `
echo "===== [1/5] Verificando Evolution API ====="
curl -s -o /dev/null -w "HTTP Status Evolution API: %{http_code}\\n" ${EVO_URL} -H "apikey: ${APIKEY}"

echo ""
echo "===== [2/5] Verificando acesso ao webhook da app ====="
curl -s -o /dev/null -w "HTTP Status wrmusicpro.com.br: %{http_code}\\n" ${WEBHOOK_URL} -X POST -H "Content-Type: application/json" -d '{"test":true}' --max-time 10

echo ""
echo "===== [3/5] Deletando instância antiga (se existir) ====="
curl -s -X DELETE "${EVO_URL}/instance/delete/${INSTANCE}" -H "apikey: ${APIKEY}"

sleep 2

echo ""
echo "===== [4/5] Criando instância prof_1 com webhook ====="
curl -s -X POST "${EVO_URL}/instance/create" \\
  -H "Content-Type: application/json" \\
  -H "apikey: ${APIKEY}" \\
  -d '{
    "instanceName": "${INSTANCE}",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS",
    "webhook": {
      "enabled": true,
      "url": "${WEBHOOK_URL}",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE"]
    }
  }'

sleep 3

echo ""
echo "===== [5/5] Registrando webhook explicitamente ====="
curl -s -X POST "${EVO_URL}/webhook/set/${INSTANCE}" \\
  -H "Content-Type: application/json" \\
  -H "apikey: ${APIKEY}" \\
  -d '{
    "webhook": {
      "enabled": true,
      "url": "${WEBHOOK_URL}",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "MESSAGES_UPDATE"]
    }
  }'

echo ""
echo "===== Verificando webhook registrado ====="
curl -s "${EVO_URL}/webhook/find/${INSTANCE}" -H "apikey: ${APIKEY}"

echo ""
echo "===== Estado da instância ====="
curl -s "${EVO_URL}/instance/connectionState/${INSTANCE}" -H "apikey: ${APIKEY}"

echo ""
echo "===== DONE - Agora reconecte o WhatsApp no painel do site ====="
`;

conn.on('ready', () => {
  console.log('⚙️  Configurando webhook e instância prof_1...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Configuração finalizada. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
