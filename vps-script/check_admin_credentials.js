const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Verificando inicializacao interna do Firebase Admin na VPS...');
  const cmd = `docker exec -i wr-music-app-app-1 node -e "
    const admin = require('firebase-admin');
    const dotenv = require('dotenv');
    dotenv.config();
    const pk = process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n');
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk
      })
    });
    console.log('PROJECT_ID CREDENTIAL:', app.options.credential.projectId);
    console.log('CLIENT_EMAIL CREDENTIAL:', app.options.credential.clientEmail);
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
