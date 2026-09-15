const { Client } = require('ssh2');

const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
};

const query = `
  docker exec wr-music-app-db-1 psql -U postgres -d postgres -c "
    SELECT 
      id,
      organization_id,
      school_name,
      payment_gateway,
      asaas_enabled,
      CASE WHEN asaas_api_key IS NOT NULL AND asaas_api_key != '' THEN 'SIM' ELSE 'NÃO' END as has_asaas_key,
      CASE WHEN mp_access_token IS NOT NULL AND mp_access_token != '' THEN 'SIM' ELSE 'NÃO' END as has_mp_token,
      school_hours,
      lesson_duration
    FROM settings
    LIMIT 5;
  "
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(query, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect(config);
