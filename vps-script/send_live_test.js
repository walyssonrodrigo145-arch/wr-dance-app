const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Disparando teste direto na VPS com o novo token c3QPglQ3K1w...');
  const cmd = `docker exec -i wr-music-app-app-1 node -e "
    const admin = require('firebase-admin');
    const dotenv = require('dotenv');
    dotenv.config();
    const pk = process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk
      })
    });
    const token = 'c3QPglQ3K1w:APA91bFdtld6P5-7uE4MDAJRLHr9iJErk6cdeYex36lOes3xTS_f4O7Gr-lfTy2VtFS8F0tBo3IqxqdD6C1_NOdmTLEB3UQDwRCBUazllqiFvmG9Q3qPQoBV09oqQ2yGEFyopU8vg6YY';
    admin.messaging().send({
      token: token,
      notification: { title: 'Teste de Sucesso 🎉', body: 'Notificacao push entregue com sucesso!' }
    }).then(r => console.log('✅ SUCESSO TOTAL:', r)).catch(e => console.error('❌ ERRO DETALHADO:', e));
  "`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => console.log(d.toString()));
    stream.stderr.on('data', d => console.error(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
});
