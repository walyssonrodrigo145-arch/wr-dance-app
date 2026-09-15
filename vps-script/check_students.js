const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  const query = `
    SELECT id, name, phone, "professorId" FROM students;
  `;
  conn.exec(`docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic -c "${query}"`, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d.toString())
          .on('close', () => {
            console.log('Students in DB:\n', out);
            conn.end();
          });
  });
}).connect(config);
