const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  console.log('Verificando detalhes completos da instância prof_163...');

  // Verificar informações detalhadas da instância
  const cmd = `curl -s -X GET "http://localhost:8080/instance/fetchInstances?instanceName=prof_163" \
    -H "apikey: minha_chave_secreta_123"`;

  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d.toString())
          .stderr.on('data', d => process.stderr.write(d.toString()))
          .on('close', () => {
            console.log('\n=== DETALHES INSTÂNCIA prof_163 ===');
            try {
              const data = JSON.parse(out);
              console.log(JSON.stringify(data, null, 2));
            } catch(e) { console.log(out); }

            // Verificar logs recentes do container Evolution
            conn.exec('docker logs evolution_api --tail 30 2>&1 || docker logs $(docker ps --format "{{.Names}}" | grep -i evol) --tail 30 2>&1', (err2, s2) => {
              let out2 = '';
              s2.on('data', d => out2 += d.toString())
                .stderr.on('data', d => out2 += d.toString())
                .on('close', () => {
                  console.log('\n=== LOGS EVOLUTION API ===');
                  console.log(out2.slice(-2000));
                  conn.end();
                });
            });
          });
  });
}).connect(config);
