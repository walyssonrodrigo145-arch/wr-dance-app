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
    docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '
      SELECT l.id, l.title, l."scheduledAt", l.status, l."userId", s.name as student_name
      FROM lessons l
      LEFT JOIN students s ON l."studentId" = s.id
      WHERE l."studioRoomId" = 13
      ORDER BY l."scheduledAt" ASC;
    '
  `;

  conn.exec(commands, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect(config);
