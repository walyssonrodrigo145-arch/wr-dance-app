const { Client } = require('ssh2');
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT' };
const conn = new Client();
conn.on('ready', () => {
  // Verifica qual settings o backend está buscando para orgId=1 (sem ORDER BY = pega qualquer um)
  // Também verifica o settings da WR Escola (id=2) que TEM mercadopago+asaas
  const queries = [
    // Quantos settings existem por org?
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT \\"organizationId\\", COUNT(*) as total_settings FROM settings GROUP BY \\"organizationId\\" ORDER BY \\"organizationId\\";"`,
    // O settings id=2 (WR Escola - o correto) - gateway é mercadopago, tem ambas as keys
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"organizationId\\", \\"schoolName\\", \\"paymentGateway\\", \\"asaasEnabled\\", CASE WHEN \\"asaasApiKey\\" IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_asaas, CASE WHEN \\"mpAccessToken\\" IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_mp FROM settings WHERE \\"organizationId\\" = 1 ORDER BY id;"`,
    // O que o enrollmentRouter faz: .limit(1) sem ORDER BY - qual pega primeiro?
    `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, \\"organizationId\\", \\"schoolName\\", \\"paymentGateway\\" FROM settings WHERE \\"organizationId\\" = 1 LIMIT 1;"`,
  ];

  let idx = 0;
  const runNext = () => {
    if (idx >= queries.length) { conn.end(); return; }
    const q = queries[idx++];
    console.log('\n=== Query', idx, '===');
    conn.exec(q, (err, stream) => {
      if (err) { console.error(err); runNext(); return; }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', runNext);
    });
  };
  runNext();
}).connect(config);
