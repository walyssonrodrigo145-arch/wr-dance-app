/**
 * verificar_e_reconectar.js
 * Verifica estado atual da instância prof_163 e força reconexão
 */
const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const APIKEY = 'minha_chave_secreta_123';
const EVO_URL = 'http://localhost:8080';

const script = `
echo "===== [1] ESTADO ATUAL da instância prof_163 ====="
curl -s "${EVO_URL}/instance/connectionState/prof_163" -H "apikey: ${APIKEY}"

echo ""
echo "===== [2] Forçando reconexão (restart da instância) ====="
curl -s -X GET "${EVO_URL}/instance/restart/prof_163" -H "apikey: ${APIKEY}"

sleep 5

echo ""
echo "===== [3] Estado após restart ====="
curl -s "${EVO_URL}/instance/connectionState/prof_163" -H "apikey: ${APIKEY}"

echo ""
echo "===== [4] Obtendo novo QR Code ====="
CONNECT=$(curl -s "${EVO_URL}/instance/connect/prof_163" -H "apikey: ${APIKEY}")
echo "$CONNECT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('base64'):
    print('QR_BASE64_DISPONIVEL: SIM - comprimento:', len(data['base64']))
elif data.get('code'):
    print('QR_CODE_DISPONIVEL: SIM')
else:
    print('RESPOSTA:', json.dumps(data, indent=2))
" 2>/dev/null || echo "$CONNECT"

echo ""
echo "===== [5] Logs recentes da Evolution API ====="
docker logs evolution-api --tail 20 2>&1 | grep -v "█" | tail -15
`;

conn.on('ready', () => {
  console.log('🔍 Verificando conexão e forçando reconexão da instância prof_163...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
