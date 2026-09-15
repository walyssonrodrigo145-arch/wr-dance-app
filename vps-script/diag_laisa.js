// Diagnóstico preciso: aulas "laísa" (por nome/valor/experimental) + estado delas.
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};
const conn = new Client();
conn.on('ready', () => {
  const cmd = [
    'cd /root/wr-music-app',
    'echo "==M1=AULAS_IATSA==",'.replace('==M1=AULAS_LAISA_(por aluno, titulo ou experimental)==','==M1=AULAS_IATSA=='),
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT l.id, l.\\"scheduledAt\\"::date AS dia, l.\\"scheduledAt\\"::time AS hora, l.status, COALESCE(s.name,\'(sem aluno)\') AS aluno, l.title, COALESCE(l.\\"experimentalName\\",\'-\') AS exp_name, l.\\"recurringGroupId\\", COALESCE(l.recurrence,\'(null)\') AS rec FROM lessons l LEFT JOIN students s ON s.id=l.\\"studentId\\" WHERE s.name ILIKE \'%iatsa%\' OR s.name ILIKE \'%barbossa%\' OR l.\\"experimentalName\\" ILIKE \'%iatsa%\' OR l.\\"experimentalName\\" ILIKE \'%barbossa%\' OR l.title ILIKE \'%iatsa%\' OR l.title ILIKE \'%barbossa%\' ORDER BY l.\\"scheduledAt\\"" < /dev/null 2>/dev/null',
    'echo "==M2=JANELA_04_e_18_09_as_16h_(qualquer aluno)=="',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT l.id, l.\\"scheduledAt\\"::date, l.\\"scheduledAt\\"::time, l.status, COALESCE(s.name,\'(sem aluno)\'), COALESCE(l.\\"experimentalName\\",\'-\'), l.\\"recurringGroupId\\", COALESCE(l.recurrence,\'(null)\') FROM lessons l LEFT JOIN students s ON s.id=l.\\"studentId\\" WHERE (l.\\"scheduledAt\\"::date = \'2026-09-04\' OR l.\\"scheduledAt\\"::date = \'2026-09-18\') AND l.\\"scheduledAt\\"::time = \'16:00:00\' ORDER BY l.\\"scheduledAt\\"" < /dev/null 2>/dev/null',
    'echo FIM',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete/.test(d.toString())) out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
