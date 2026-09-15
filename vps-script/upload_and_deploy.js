const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

const localFile1 = path.resolve(__dirname, '../server/routers.ts');
const localFile2 = path.resolve(__dirname, '../client/src/pages/ProfessorExtract.tsx');

const content1 = fs.readFileSync(localFile1, 'utf8');
const content2 = fs.readFileSync(localFile2, 'utf8');

conn.on('ready', () => {
  console.log('SSH connection established. Uploading files...');
  
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
      
      const remoteFile1 = `${repoPath}/server/routers.ts`;
      const remoteFile2 = `${repoPath}/client/src/pages/ProfessorExtract.tsx`;
      
      conn.sftp((err, sftp) => {
        if (err) throw err;
        
        let uploads = 0;
        const finalize = () => {
          uploads++;
          if (uploads === 2) {
            console.log('Uploads complete. Rebuilding container...');
            const rebuildCmd = `
              cd ${repoPath}
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
          }
        };

        const ws1 = sftp.createWriteStream(remoteFile1);
        ws1.write(content1);
        ws1.end();
        ws1.on('close', finalize);

        const ws2 = sftp.createWriteStream(remoteFile2);
        ws2.write(content2);
        ws2.end();
        ws2.on('close', finalize);
      });
    });
  });
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);
