const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  const cmd = [
    'cd /root/wr-music-app',
    'echo ===RANKINGS-POR-STATUS===',
    'docker compose exec -T db psql -U postgres wrmusic -c "SELECT status, count(*) FROM rankings GROUP BY status;"',
    'echo ===ATIVOS-E-AGENDADOS===',
    'docker compose exec -T db psql -U postgres wrmusic -c "SELECT id, name, status, \\"startDate\\" AS inicio, \\"endDate\\" AS fim FROM rankings WHERE status IN (\'agendado\',\'ativo\') ORDER BY id;"',
    'echo ===PARTICIPANTES-POR-RANKING===',
    'docker compose exec -T db psql -U postgres wrmusic -c "SELECT r.id, r.name, count(rp.id) AS participantes FROM rankings r LEFT JOIN ranking_participants rp ON rp.\\"rankingId\\" = r.id GROUP BY r.id, r.name ORDER BY r.id;"',
    'echo ===MEDALHAS===',
    'docker compose exec -T db psql -U postgres wrmusic -c "SELECT badge, count(*) FROM student_achievements GROUP BY badge;"',
    'echo ===ERROS-RANKINGS-24H===',
    'docker compose logs app --since 24h 2>&1 | grep -i ranking | grep -iE "erro|error|fail" | head -10',
    'echo ===FIM===',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err.message); process.exit(1); }
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).on('error', e => { console.error('SSH Error:', e.message); process.exit(1); })
  .connect({ host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 30000 });
