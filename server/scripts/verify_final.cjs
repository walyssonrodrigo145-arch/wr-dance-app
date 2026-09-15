const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.shell((err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.on('close', () => conn.end());
    
    // Regras atuais do Jefferson
    stream.write('docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c "SELECT id, trigger, \\"offsetDays\\", \\"isActive\\", \\"sendToStudent\\", \\"sendToGuardian\\" FROM message_automation_rules WHERE \\"userId\\" = 1581;"\n');
    stream.write("exit\n");
  });
}).connect({ host: '179.197.76.174', port: 22, username: 'root', password: 'Walysson2003@' });
