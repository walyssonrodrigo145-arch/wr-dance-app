const { Client } = require('ssh2');
const conn = new Client();
const remote = [
  'docker exec dance-db psql -U postgres -d wrdance -c "SELECT name, status, \\"monthlyFee\\" FROM students WHERE \\"organizationId\\"=6 ORDER BY id"',
  'docker exec dance-db psql -U postgres -d wrdance -c "SELECT la.status, s.name FROM lesson_attendance la JOIN students s ON s.id=la.\\"studentId\\" WHERE la.\\"organizationId\\"=6 ORDER BY s.name"',
  'docker exec dance-db psql -U postgres -d wrdance -c "SELECT t.name AS turma, ta.status, s.name AS aluna FROM turma_alunos ta JOIN turmas t ON t.id=ta.\\"turmaId\\" JOIN students s ON s.id=ta.\\"studentId\\" WHERE ta.\\"organizationId\\"=6 ORDER BY ta.status, s.name"',
].join(' ; ');
conn.on('ready', () => {
  conn.exec(remote, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('--- fim'); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
