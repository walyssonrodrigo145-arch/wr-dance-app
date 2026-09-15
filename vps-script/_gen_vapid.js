// Regenera o par VAPID e grava no .env local SEM aspas (valores base64url crus).
// Rotaciona o par anterior (nunca usado em produção — zero subscrições).
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');

const keys = webpush.generateVAPIDKeys();
const pub = keys.publicKey.trim();
const priv = keys.privateKey.trim();

// Valida ANTES de gravar
webpush.setVapidDetails('mailto:suporte@wrmusicpro.com.br', pub, priv);

const setVar = (name, value) => {
  const re = new RegExp('^' + name + '=.*$', 'm');
  if (re.test(env)) env = env.replace(re, name + '=' + value);
  else env = env.replace(/\s*$/, '') + '\n' + name + '=' + value + '\n';
};

setVar('VAPID_PUBLIC_KEY', pub);
setVar('VAPID_PRIVATE_KEY', priv);
setVar('VITE_VAPID_PUBLIC_KEY', pub);

fs.writeFileSync(envPath, env, 'utf8');

// Revalida lendo do arquivo gravado
const check = fs.readFileSync(envPath, 'utf8');
const p1 = check.match(/^VAPID_PUBLIC_KEY=(.*)$/m)[1].trim();
const p2 = check.match(/^VAPID_PRIVATE_KEY=(.*)$/m)[1].trim();
webpush.setVapidDetails('mailto:suporte@wrmusicpro.com.br', p1, p2);
console.log('NOVO PAR VÁLIDO E GRAVADO (sem aspas).');
console.log('PUBLIC_KEY:', pub);
console.log('priv len:', p2.length, '| pub len:', p1.length);
