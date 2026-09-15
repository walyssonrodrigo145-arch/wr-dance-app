// FIX: corrige a criação da escola de tutoriais (parse incorreto vinculou o
// admin à org 1). Realoca o usuário para a org limpa, restaura o que foi
// tocado por engano e verifica integridade. Usa psql -tA (saída só valores).
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

function exec(conn, repoPath, cmd) {
  return new Promise((resolve, reject) => {
    const full = `cd ${repoPath} && docker compose exec -T db psql -q -tA -U postgres wrmusic -c "${cmd.replace(/"/g, '\\"')}"`;
    conn.exec(full, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
      stream.on('close', () => resolve(out.trim()));
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
      try {
        // 1. IDs REAIS
        const uid = await exec(conn, repoPath, `SELECT id FROM users WHERE email='tutoriais@musicpro.com.br' LIMIT 1`);
        const orgClean = await exec(conn, repoPath, `SELECT id FROM organizations WHERE name='Tutoriais MusicPro' ORDER BY id DESC LIMIT 1`);
        const org1Owner = await exec(conn, repoPath, `SELECT "ownerId" FROM organizations WHERE id=1`);
        console.log(`uid=${uid} orgClean=${orgClean} org1Owner=${org1Owner}`);

        // 2. Diagnóstico da org 1 (o que tocamos por engano)
        const user1 = await exec(conn, repoPath, `SELECT id, name, role FROM users WHERE id=1`);
        const org1Admins = await exec(conn, repoPath, `SELECT count(*) FROM users WHERE "organizationId"=1 AND role='admin'`);
        const settingsDup = await exec(conn, repoPath, `SELECT count(*) FROM settings WHERE "userId"=1 AND "organizationId"=1 AND "schoolName"='Tutoriais MusicPro'`);
        console.log(`user1=${user1} org1Admins=${org1Admins} settingsDup(org1)=${settingsDup}`);

        // 3. Corrige: realoca usuário para a escola limpa
        await exec(conn, repoPath, `UPDATE users SET "organizationId"=${orgClean}, name='Tutoriais MusicPro', "passwordHash"='${hash}', role='admin', "isEmailVerified"=true, "mustChangePassword"=false, "updatedAt"=now() WHERE id=${uid}`);
        await exec(conn, repoPath, `UPDATE organizations SET "ownerId"=${uid} WHERE id=${orgClean}`);
        // 4. Remove settings acidental (org1/user1 com nome da escola de tutoriais)
        await exec(conn, repoPath, `DELETE FROM settings WHERE "userId"=1 AND "organizationId"=1 AND "schoolName"='Tutoriais MusicPro'`);
        // 5. Settings corretos da escola limpa
        await exec(conn, repoPath, `DELETE FROM settings WHERE "userId"=${uid} AND "organizationId"=${orgClean}`);
        await exec(conn, repoPath, `INSERT INTO settings ("userId","organizationId","schoolName","notifyLessonReminder","notifyPaymentDue","asaasEnabled","automationEnabled") VALUES (${uid},${orgClean},'Tutoriais MusicPro',1,1,0,1)`);

        // 6. Verificação final
        const v = await exec(conn, repoPath, `SELECT (SELECT count(*) FROM users WHERE email='tutoriais@musicpro.com.br' AND "organizationId"=${orgClean}) AS u, (SELECT count(*) FROM students WHERE "organizationId"=${orgClean}) AS alunos, (SELECT count(*) FROM lessons WHERE "organizationId"=${orgClean}) AS aulas, (SELECT count(*) FROM professores WHERE "organizationId"=${orgClean}) AS profs, (SELECT "ownerId" FROM organizations WHERE id=${orgClean}) AS owner`);
        console.log(`VERIFICAÇÃO => ${v}`);
        console.log('✅ ESCOLA LIMPA CORRIGIDA — e-mail: tutoriais@musicpro.com.br / senha: musicpro2026');
      } catch (e) {
        console.error('❌ Falha:', e.message);
      } finally {
        conn.end();
      }
    });
  });
}).connect(config);
