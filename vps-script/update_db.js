const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const query = `
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "aiProvider" varchar(50) DEFAULT 'gemini';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "geminiApiKey" varchar(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "geminiModel" varchar(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "groqApiKey" varchar(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "groqModel" varchar(255);
`;

conn.on('ready', () => {
  conn.exec(`docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "${query}"`, (err, stream) => {
    stream.on('close', () => conn.end()).on('data', (data) => process.stdout.write(data.toString())).stderr.on('data', (data) => process.stderr.write(data.toString()));
  });
}).connect(config);
