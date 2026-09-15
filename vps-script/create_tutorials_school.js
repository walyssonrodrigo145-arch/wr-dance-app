// Cria a escola LIMPA de tutoriais direto no banco de PRODUÇÃO (VPS).
// Usa o MESMO formato de hash do app (salt:hex(scrypt(password,salt,64))).
// Idempotente por e-mail: se o usuário já existir, atualiza senha/nome/dono.
const { Client } = require('ssh2');
const crypto = require('crypto');

const password = 'musicpro2026';
const salt = crypto.randomBytes(16).toString('hex');
const derived = crypto.scryptSync(password, salt, 64).toString('hex');
const hash = `${salt}:${derived}`;

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

function psql(conn, repoPath, sql, label) {
  return new Promise((resolve, reject) => {
    const cmd = `cd ${repoPath} && docker compose exec -T db psql -U postgres wrmusic -c "${sql.replace(/"/g, '\\"')}"`;
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { out += d.toString(); process.stdout.write(d.toString()); });
      stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
      stream.on('close', () => { console.log(`[${label}] ok`); resolve(out); });
    });
  });
}

const conn = new Client();
conn.on('ready', () => {
  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (d) => { repoPath += d.toString(); });
    stream.on('close', async () => {
      repoPath = repoPath.trim();
      if (!repoPath) { console.error('Repo not found!'); conn.end(); return; }

      try {
        // 1. Existe usuário com o e-mail?
        const chk = await psql(conn, repoPath,
          `SELECT id, "organizationId" FROM users WHERE email='tutoriais@musicpro.com.br'`,
          'check-user');
        const rowMatch = chk.match(/^\s*(\d+)\s*\|\s*(\d+)/m);
        if (rowMatch) {
          const [uid, orgId] = [rowMatch[1], rowMatch[2]];
          console.log(`⚠️  Usuário já existe (id=${uid}, org=${orgId}) — atualizando...`);
          await psql(conn, repoPath,
            `UPDATE users SET name='Tutoriais MusicPro', "passwordHash"='${hash}', role='admin', "isEmailVerified"=true, "mustChangePassword"=false, "updatedAt"=now() WHERE id=${uid}`,
            'update-user');
          await psql(conn, repoPath,
            `UPDATE organizations SET "ownerId"=${uid} WHERE id=${orgId}`,
            'update-owner');
          console.log(`✅ Escola reutilizada: org=${orgId}`);
        } else {
          // 2. Cria org
          const orgSql = await psql(conn, repoPath,
            `INSERT INTO organizations (name, slug, active, "subscriptionStatus", "planId", "createdAt", "updatedAt") VALUES ('Tutoriais MusicPro', 'tutoriais-musicpro-' || floor(extract(epoch from now()))::bigint, true, 'active', 'premium', now(), now()) RETURNING id`,
            'insert-org');
          const orgId = (orgSql.match(/\b(\d+)\s*$/) || orgSql.match(/\|?\s*(\d+)\s*$/))?.[1];
          if (!orgId) throw new Error('Não foi possível obter o ID da organização: ' + orgSql);
          console.log(`✅ Organização criada: ${orgId}`);

          // 3. Cria usuário admin
          const userSql = await psql(conn, repoPath,
            `INSERT INTO users ("organizationId","openId",name,email,"passwordHash",role,"isEmailVerified","mustChangePassword","createdAt","updatedAt") VALUES (${orgId}, 'tutoriais_admin_' || floor(extract(epoch from now()))::bigint, 'Tutoriais MusicPro', 'tutoriais@musicpro.com.br', '${hash}', 'admin', true, false, now(), now()) RETURNING id`,
            'insert-user');
          const uid = (userSql.match(/\b(\d+)\s*$/) || userSql.match(/\|?\s*(\d+)\s*$/))?.[1];
          if (!uid) throw new Error('Não foi possível obter o ID do usuário: ' + userSql);
          console.log(`✅ Usuário admin criado: ${uid}`);

          // 4. Dono
          await psql(conn, repoPath,
            `UPDATE organizations SET "ownerId"=${uid} WHERE id=${orgId}`,
            'set-owner');

          // 5. Settings mínimos
          await psql(conn, repoPath,
            `INSERT INTO settings ("userId","organizationId","schoolName","notifyLessonReminder","notifyPaymentDue","asaasEnabled","automationEnabled") VALUES (${uid},${orgId},'Tutoriais MusicPro',1,1,0,1) ON CONFLICT DO NOTHING`,
            'insert-settings');
        }

        // 6. Verificação: contagem de dados na escola (deve ser só org/user/settings)
        const verify = await psql(conn, repoPath,
          `SELECT (SELECT count(*) FROM users WHERE email='tutoriais@musicpro.com.br') AS users, (SELECT count(*) FROM professores p JOIN users u ON u."organizationId"=p."organizationId" WHERE u.email='tutoriais@musicpro.com.br') AS professores, (SELECT count(*) FROM students s WHERE s."organizationId" IN (SELECT "organizationId" FROM users WHERE email='tutoriais@musicpro.com.br')) AS alunos, (SELECT count(*) FROM lessons l WHERE l."organizationId" IN (SELECT "organizationId" FROM users WHERE email='tutoriais@musicpro.com.br')) AS aulas`,
          'verify');
        console.log('✅ ESCOLA LIMPA PRONTA — e-mail: tutoriais@musicpro.com.br / senha: musicpro2026');
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
