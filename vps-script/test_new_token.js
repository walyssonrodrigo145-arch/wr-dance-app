const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Disparando teste com o token novíssimo fVKMOHuWR2Q...');
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
    const token = 'fVKMOHuWR2Q:APA91bE6TXPzrplLuOr7JCSbpfO9PydguFLiOZABcQMMCcKyhqt-Vkl8OsCAbQPzlMBYJ7tujzEU8zmAngNFPigZbInWQXQ57-9NDs9qS8tTSJXqPO-SWte9P6NIlQvumFp9cstIk3NE';
    admin.messaging().send({
      token: token,
      notification: { title: 'Teste de Sucesso 🎉', body: 'Notificacao enviada com a nova chave!' }
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
