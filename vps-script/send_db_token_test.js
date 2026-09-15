const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Disparando teste de push direto para o token id 625 no servidor VPS...');
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
    
    // Testar envio para o token do usuário 1580 extraindo endpoint
    const rawToken = '{\\"endpoint\\":\\"https://fcm.googleapis.com/fcm/send/fVKMOHuWR2Q:APA91bE6TXPzrplLuOr7JCSbpfO9PydguFLiOZABcQMMCcKyhqt-Vkl8OsCAbQPzlMBYJ7tujzEU8zmAngNFPigZbInWQXQ57-9NDs9qS8tTSJXqPO-SWte9P6NIlQvumFp9cstIk3NE\\"}';
    let targetToken = rawToken;
    if (targetToken.includes('/fcm/send/')) {
      targetToken = targetToken.split('/fcm/send/')[1].replace('\"}', '').replace('\"', '');
    }
    console.log('Target Token Extraido:', targetToken);
    admin.messaging().send({
      token: targetToken,
      notification: { title: 'Teste Direto VPS 🎉', body: 'Notificacao push entregue via admin SDK!' }
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
