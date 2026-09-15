const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const sql = `
ALTER TABLE settings DROP COLUMN IF EXISTS aiprovider;
ALTER TABLE settings DROP COLUMN IF EXISTS geminiapikey;
ALTER TABLE settings DROP COLUMN IF EXISTS geminimodel;
ALTER TABLE settings DROP COLUMN IF EXISTS groqapikey;
ALTER TABLE settings DROP COLUMN IF EXISTS groqmodel;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS "aiProvider" varchar(50) DEFAULT 'gemini';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "groqApiKey" varchar(255);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "groqModel" varchar(255);
`;

conn.on('ready', () => {
  conn.exec('docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic', (err, stream) => {
    stream.on('close', () => conn.end()).on('data', (data) => process.stdout.write(data.toString())).stderr.on('data', (data) => process.stderr.write(data.toString()));
    stream.write(sql);
    stream.end();
  });
}).connect(config);
