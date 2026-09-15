/**
 * fix_instancia_prof163.js
 * Cria a instância correta prof_163 com webhook registrado
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const APIKEY = 'minha_chave_secreta_123';
const EVO_URL = 'http://localhost:8080';
const WEBHOOK_URL = 'https://wrmusicpro.com.br/api/webhooks/whatsapp';

const script = `
echo "===== [1] Deletando instância prof_1 incorreta ====="
curl -s -X DELETE "${EVO_URL}/instance/delete/prof_1" -H "apikey: ${APIKEY}"

sleep 2

echo ""
echo "===== [2] Criando instância prof_163 com webhook ====="
curl -s -X POST "${EVO_URL}/instance/create" \\
  -H "Content-Type: application/json" \\
  -H "apikey: ${APIKEY}" \\
  -d '{
    "instanceName": "prof_163",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'

sleep 3

echo ""
echo "===== [3] Registrando webhook na instância prof_163 ====="
curl -s -X POST "${EVO_URL}/webhook/set/prof_163" \\
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
echo "===== [4] Verificando webhook ====="
curl -s "${EVO_URL}/webhook/find/prof_163" -H "apikey: ${APIKEY}"

echo ""
echo "===== [5] Estado da instância prof_163 ====="
curl -s "${EVO_URL}/instance/connectionState/prof_163" -H "apikey: ${APIKEY}"

echo ""
echo "===== [6] Listando todas as instâncias ====="
curl -s "${EVO_URL}/instance/fetchInstances" -H "apikey: ${APIKEY}"

echo ""
echo "===== DONE ====="
echo "Agora vá ao site e conecte o WhatsApp novamente escaneando o QR Code!"
`;

conn.on('ready', () => {
  console.log('🔧 Criando instância prof_163 (ID correto do usuário)...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
