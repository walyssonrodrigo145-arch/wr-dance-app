// RETRO-MARCAÇÃO v2 — heredoc quoted (sem escaping de aspas/dólar).
// Infere recorrência das séries existentes (gaps por recurringGroupId + dia + horário).
// Uso: node -r dotenv/config vps-script/retromark_recurrence.js
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
    'docker compose exec -T db psql -U postgres wrmusic <<\'EOSQL\'',
    'DO $$',
    'DECLARE r RECORD;',
    'BEGIN',
    '  FOR r IN',
    '    WITH s AS (',
    '      SELECT "recurringGroupId" g,',
    '             EXTRACT(ISODOW FROM "scheduledAt") dow,',
    '             "scheduledAt"::time tm,',
    '             "scheduledAt",',
    '             LAG("scheduledAt") OVER (PARTITION BY "recurringGroupId", EXTRACT(ISODOW FROM "scheduledAt"), "scheduledAt"::time ORDER BY "scheduledAt") prev',
    '      FROM lessons WHERE "recurringGroupId" IS NOT NULL',
    '    ), gaps AS (',
    '      SELECT g, dow, tm, EXTRACT(day FROM ("scheduledAt" - prev))::int AS d FROM s WHERE prev IS NOT NULL',
    '    ), agg AS (',
    '      SELECT g, dow, tm, MIN(d) AS mingap FROM gaps WHERE d BETWEEN 6 AND 40 GROUP BY g, dow, tm',
    '    )',
    '    SELECT g, dow, tm, mingap FROM agg',
    '  LOOP',
    '    UPDATE lessons SET recurrence = CASE',
    '      WHEN r.mingap BETWEEN 6 AND 8 THEN \'semanal\'',
    '      WHEN r.mingap BETWEEN 13 AND 16 THEN \'quinzenal\'',
    '      ELSE \'mensal\'',
    '    END',
    '    WHERE "recurringGroupId" = r.g',
    '      AND EXTRACT(ISODOW FROM "scheduledAt") = r.dow',
    '      AND "scheduledAt"::time = r.tm',
    '      AND recurrence IS NULL;',
    '  END LOOP;',
    '  RAISE NOTICE \'Retro-marcacao concluida\';',
    'END $$;',
    'EOSQL',
    'echo "==CONTAGEM POR RECURRENCE=="',
    'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT COALESCE(recurrence,\'(null/avulsa)\'), COUNT(*) FROM lessons GROUP BY recurrence ORDER BY 2 DESC"',
    'echo FIM',
  ].join('\n');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete/.test(d.toString())) out += d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
