const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const query = `
ALTER TABLE students ADD COLUMN IF NOT EXISTS "methodologyFilename" varchar(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS "methodologyText" text;
`;

conn.on('ready', () => {
  console.log('--- UPDATING SCHEMA ON VPS ---');
  conn.exec(`docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "${query}"`, (err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => process.stdout.write(data.toString()));
    stream.stderr.on('data', (data) => process.stderr.write(data.toString()));
    stream.on('close', () => {
      console.log('Schema updated successfully!');
      conn.end();
    });
  });
}).connect(config);
