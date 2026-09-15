const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

conn.on('ready', () => {
  console.log('SSH connection established. Restarting docker compose...');
  const rebuildCmd = `
    cd $(find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1)
    docker compose up -d --build
    echo "Running DB migrations manually via psql..."
    sleep 5
    docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS \\"dueDaysForecast\\" text DEFAULT '5,10,15,20';"
    docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS \\"chatbotEnabled\\" integer NOT NULL DEFAULT 0;"
  `;
  conn.exec(rebuildCmd, (err, rebuildStream) => {
    if (err) throw err;
    rebuildStream.on('data', data => process.stdout.write(data.toString()));
    rebuildStream.stderr.on('data', data => process.stderr.write(data.toString()));
    rebuildStream.on('close', () => {
      console.log('Deploy finished successfully!');
      conn.end();
    });
  });
}).connect(config);
