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
  console.log('SSH connection established. Executing Git Force Pull & Deploy...');
  
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
      
      const deployCmd = `
        cd ${repoPath}
        git fetch origin main
        git reset --hard origin/main
        git clean -fd
        docker compose down
        docker compose up -d --build
      `;
      console.log('Running deploy command on', repoPath);
      
      conn.exec(deployCmd, (err, deployStream) => {
        if (err) throw err;
        deployStream.on('data', data => process.stdout.write(data.toString()));
        deployStream.stderr.on('data', data => process.stderr.write(data.toString()));
        deployStream.on('close', () => {
          console.log('Deploy finished successfully!');
          conn.end();
        });
      });
    });
  });
}).connect(config);
