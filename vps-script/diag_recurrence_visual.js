// Diagnóstico: aulas da Laísa (recurrence marcado?) + grupos + contagem geral.
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
    'echo "==M1=AULAS_LAISA=="',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT l.id, s.name, l.\\"scheduledAt\\"::date, l.\\"scheduledAt\\"::time, l.\\"recurringGroupId\\", COALESCE(l.recurrence,\'(null)\') FROM lessons l JOIN students s ON s.id=l.\\"studentId\\" WHERE s.name ILIKE \'%la%sa%\' OR s.name ILIKE \'%laissa%\' OR s.name ILIKE \'%laysa%\' ORDER BY l.\\"scheduledAt\\"" < /dev/null 2>/dev/null',
    'echo "==M2=RECORRENCIA_POR_GRUPO (amostra dos nao nulos)=="',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT recurrence, COUNT(*) FROM lessons GROUP BY recurrence ORDER BY 2 DESC" < /dev/null 2>/dev/null',
    'echo "==M3=GRUPOS_DA_LAISA=="',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT DISTINCT l.\\"recurringGroupId\\" FROM lessons l JOIN students s ON s.id=l.\\"studentId\\" WHERE s.name ILIKE \'%barbossa%\'" < /dev/null 2>/dev/null',
    'echo "==M4=QUAIS_PROCEDURES_SEL_RECURRENCE (deploy ok?)=="',
    'docker compose exec -T app grep -c "recurrence: lessons.recurrence" /app/dist/index.js 2>/dev/null || echo "0 no bundle"',
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
