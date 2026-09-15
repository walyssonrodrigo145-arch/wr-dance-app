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
  console.log('SSH connection established. Executing git pull and rebuild...');
  
  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (data) => { repoPath += data.toString(); });
    stream.on('close', () => {
      repoPath = repoPath.trim();
      if (!repoPath) {
        console.error('Repo not found!');
        conn.end();
        return;
      }
      
      const rebuildCmd = `
        cd ${repoPath}
        git pull origin main
        docker compose down
        docker compose up -d --build
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
    });
  });
}).connect(config);
