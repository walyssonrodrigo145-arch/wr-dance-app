/**
 * forcar_conectar_prof163.js
 * Força a instância prof_163 a gerar novo QR Code via /instance/connect
 * e exibe o estado da instância
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const APIKEY = 'minha_chave_secreta_123';
const EVO_URL = 'http://localhost:8080';
const WEBHOOK_URL = 'https://wrmusicpro.com.br/api/webhooks/whatsapp';

const script = `
echo "===== Deletando e recriando instância prof_163 do zero ====="
curl -s -X DELETE "${EVO_URL}/instance/delete/prof_163" -H "apikey: ${APIKEY}"
sleep 3

echo "Criando instância fresh..."
curl -s -X POST "${EVO_URL}/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: ${APIKEY}" \
  -d '{"instanceName":"prof_163","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'

sleep 3

echo ""
echo "Registrando webhook..."
curl -s -X POST "${EVO_URL}/webhook/set/prof_163" \
  -H "Content-Type: application/json" \
  -H "apikey: ${APIKEY}" \
  -d '{"webhook":{"enabled":true,"url":"${WEBHOOK_URL}","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT","CONNECTION_UPDATE","MESSAGES_UPDATE"]}}'

sleep 2

echo ""
echo "===== Estado da instância ====="
curl -s "${EVO_URL}/instance/connectionState/prof_163" -H "apikey: ${APIKEY}"

echo ""
echo "===== QR Code gerado (base64 disponível para scan) ====="
curl -s "${EVO_URL}/instance/connect/prof_163" -H "apikey: ${APIKEY}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
b64 = data.get('base64','')
print('QR disponivel para scan:', 'SIM' if b64 else 'NAO')
print('Tamanho base64:', len(b64))
" 2>/dev/null

echo ""
echo "===== PRONTO ====="
echo "Agora va no site wrmusicpro.com.br > Configuracoes > WhatsApp"
echo "Clique DESCONECTAR (se aparecer) e depois CONECTAR para ver o QR Code FRESCO"
`;

conn.on('ready', () => {
  console.log('♻️  Recriando instância prof_163 do zero...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', code => { console.log('\n✅ Finalizado. Código:', code); conn.end(); })
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
