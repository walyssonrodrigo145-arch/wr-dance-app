/**
 * check_evo_container_logs.js
 * Verifica os logs do container evolution-api para diagnóstico
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

const script = `
echo "===== STATUS DOS CONTAINERS ====="
docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"

echo ""
echo "===== LOGS DO EVOLUTION-API (últimas 80 linhas) ====="
docker logs evolution-api --tail 80 2>&1

echo ""
echo "===== VERIFICAR PORTA 8080 ====="
ss -tlnp | grep 8080 || echo "Porta 8080 NAO escutando"

echo ""
echo "===== INSPECT DO CONTAINER ====="
docker inspect evolution-api --format "Status: {{.State.Status}} | ExitCode: {{.State.ExitCode}} | Error: {{.State.Error}}"
`;

conn.on('ready', () => {
  console.log('🔍 Verificando logs do container evolution-api...\n');
  conn.exec(script, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream
      .on('close', () => conn.end())
      .on('data', d => process.stdout.write(d.toString()))
      .stderr.on('data', d => process.stderr.write(d.toString()));
  });
}).on('error', err => console.error('SSH Error:', err.message)).connect(config);
