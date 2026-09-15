const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established. Restarting docker and clearing build cache...');
  
  conn.exec('docker builder prune -f && systemctl restart docker', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Done with code ' + code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
});
