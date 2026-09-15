const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  console.log('SSH conectado. Verificando status da instância prof_163...');

  // 1. Status da instância
  const cmd1 = `curl -s -X GET "http://localhost:8080/instance/connectionState/prof_163" -H "apikey: minha_chave_secreta_123"`;
  
  conn.exec(cmd1, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d.toString())
          .stderr.on('data', d => process.stderr.write(d.toString()))
          .on('close', () => {
            console.log('\n=== STATUS INSTANCIA prof_163 ===');
            console.log(out);
            
            // 2. Listar todas as instâncias
            const cmd2 = `curl -s -X GET "http://localhost:8080/instance/fetchInstances" -H "apikey: minha_chave_secreta_123"`;
            conn.exec(cmd2, (err2, stream2) => {
              let out2 = '';
              stream2.on('data', d => out2 += d.toString())
                     .stderr.on('data', d => process.stderr.write(d.toString()))
                     .on('close', () => {
                        console.log('\n=== TODAS AS INSTÂNCIAS ===');
                        try {
                          const parsed = JSON.parse(out2);
                          parsed.forEach(i => {
                            const inst = i.instance || i;
                            console.log(`Nome: ${inst.instanceName || inst.name}, Estado: ${inst.state || inst.connectionStatus}, Owner: ${inst.owner || '-'}`);
                          });
                        } catch(e) { console.log(out2); }
                        conn.end();
                     });
            });
          });
  });
}).connect(config);
