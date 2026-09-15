/**
 * diagnostico_completo.js
 * Verifica: estado da instância, webhook, logs do chatbot e logs do app
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const script = `
echo "===== [1] ESTADO DA INSTÂNCIA prof_1 ====="
curl -s http://localhost:8080/instance/connectionState/prof_1 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [2] WEBHOOK CONFIGURADO ====="
curl -s http://localhost:8080/webhook/find/prof_1 -H "apikey: minha_chave_secreta_123"

echo ""
echo "===== [3] LOGS DO CHATBOT (últimas mensagens) ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 200 app 2>/dev/null | grep -iE "(Webhook|Chatbot|whatsapp|MESSAGES|bot)" | tail -50

echo ""
echo "===== [4] LOGS DO APP (últimas 50 linhas geral) ====="
docker compose -f /root/wr-music-app/docker-compose.yml logs --tail 50 app 2>/dev/null | tail -50

echo ""
echo "===== [5] LOGS DA EVOLUTION API (últimas 30 linhas) ====="
docker logs evolution-api --tail 30 2>&1

echo ""
echo "===== [6] CONTAINERS RODANDO ====="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
`;

conn.on('ready', () => {
  console.log('🔍 Diagnóstico completo após conexão do WhatsApp...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
