const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const commands = `
    docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "ALTER TABLE system_plans ADD COLUMN is_popular BOOLEAN NOT NULL DEFAULT false;"
    docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "ALTER TABLE system_plans ADD COLUMN \\"order\\" INTEGER NOT NULL DEFAULT 0;"
  `;
  
  conn.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect(config);
