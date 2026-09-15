const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Disparando teste direto na VPS para o token Android recém-gravado...');
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
    const token = 'eW1P3TsZMEk:APA91bF-frNi4BLK92me2xibQ21bCEFiuGKA8vU-VGRg7cgEVsfp-kvddKSGlBrPE5ZFLtdVPGi6UruifFEZ1rp-OMtd5nb-T6a9gLaRjoHGOdx2pKLzrpEXbNbxKj_bG9mjY_-gz63n';
    console.log('Testando projectId:', process.env.FIREBASE_PROJECT_ID);
    admin.messaging().send({
      token: token,
      notification: { title: 'Teste Investigativo 🕵️‍♂️', body: 'Notificacao de teste do agente!' }
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
