// Verificação final: file_comments renomeada? Outras tabelas com mismatch snake/camel?
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
    'echo "==FILE_COMMENTS (agora)==".',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'file_comments\' ORDER BY ordinal_position" < /dev/null 2>/dev/null',
    'echo "----".',
    'echo "==TABELAS_COM_SNAKE_SEM_CAMEL (mismatch futuro)==".'.replace(/\./g, ''),
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT DISTINCT table_name || \' (col: \' || column_name || \')\' FROM information_schema.columns WHERE column_name IN (\'organization_id\',\'file_id\',\'user_id\',\'created_at\') AND table_name IN (SELECT table_name FROM information_schema.columns WHERE column_name=\'organization_id\' OR column_name=\'file_id\') AND table_name NOT IN (SELECT table_name FROM information_schema.columns WHERE column_name=\'organizationId\' OR column_name=\'fileId\' OR column_name=\'userId\') ORDER BY 1" < /dev/null 2>/dev/null',
    'echo FIM_VERIFICACAO',
  ].join(' && ');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete/.test(d.toString())) out += d.toString(); });
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
