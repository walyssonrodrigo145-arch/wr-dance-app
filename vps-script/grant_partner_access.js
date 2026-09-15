const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const sqlCommands = [
    `INSERT INTO system_plans (id, name, price_monthly, price_yearly, max_students, features, is_active, show_on_landing, is_popular, "order", allow_extra_students, extra_student_price, "createdAt", "updatedAt") VALUES ('parceiro_ilimitado', 'Parceiro MusicPro (Ilimitado)', 0.00, 0.00, 999999, '["Todas as funcionalidades liberadas","Alunos ilimitados","Sem custos","Acesso Total VIP"]', true, false, false, 99, true, 0.00, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET max_students = 999999, price_monthly = 0.00, price_yearly = 0.00, allow_extra_students = true, extra_student_price = 0.00, "updatedAt" = NOW();`,
    `INSERT INTO organizations (name, slug, "subscriptionStatus", "planId", "asaasCustomerId", "asaasSubscriptionId", "createdAt", "updatedAt") VALUES ('Espaço Musical Edu Oliveira', 'espaco-musical-edu-oliveira', 'active', 'parceiro_ilimitado', NULL, NULL, NOW(), NOW()) ON CONFLICT (slug) DO UPDATE SET "subscriptionStatus" = 'active', "planId" = 'parceiro_ilimitado', "asaasSubscriptionId" = NULL, "updatedAt" = NOW();`,
    `INSERT INTO users ("organizationId", "openId", name, email, "passwordHash", "mustChangePassword", "hasSeenTutorial", "loginMethod", role, "isEmailVerified", "createdAt", "updatedAt", "lastSignedIn") VALUES ((SELECT id FROM organizations WHERE slug = 'espaco-musical-edu-oliveira' LIMIT 1), 'partner_edu_oliveira', 'Espaço Musical Edu Oliveira', 'espacomusicaleduoliveira2012@gmail.com', NULL, false, true, 'google', 'admin', true, NOW(), NOW(), NOW()) ON CONFLICT ("openId") DO UPDATE SET role = 'admin', "organizationId" = (SELECT id FROM organizations WHERE slug = 'espaco-musical-edu-oliveira' LIMIT 1), "isEmailVerified" = true, "updatedAt" = NOW();`,
    `INSERT INTO settings ("organizationId", "userId", "schoolName", theme, "createdAt", "updatedAt") VALUES ((SELECT id FROM organizations WHERE slug = 'espaco-musical-edu-oliveira' LIMIT 1), (SELECT id FROM users WHERE email = 'espacomusicaleduoliveira2012@gmail.com' LIMIT 1), 'Espaço Musical Edu Oliveira', 'dark', NOW(), NOW()) ON CONFLICT ("userId") DO UPDATE SET "organizationId" = (SELECT id FROM organizations WHERE slug = 'espaco-musical-edu-oliveira' LIMIT 1), "schoolName" = 'Espaço Musical Edu Oliveira', "updatedAt" = NOW();`
  ];

  const fullSql = sqlCommands.join(' ');
  const escaped = fullSql.replace(/"/g, '\\"');
  const query = `cd /root/wr-music-app && docker compose exec -T db psql -U postgres -d wrmusic -c "${escaped}"`;

  conn.exec(query, (err, stream) => {
    if (err) throw err;
    let data = '';
    stream.on('data', d => data += d.toString());
    stream.stderr.on('data', d => data += d.toString());
    stream.on('close', () => {
      console.log(data);
      conn.end();
    });
  });
}).connect(config);
