// Investigação (read-only) da escola donsescola@gmail.com (org 24?) + estrutura file_comments.
// Uso: node -r dotenv/config vps-script/investigate_org24.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

const bash = [
  'cd /root/wr-music-app',
  'Q() { docker compose exec -T db psql -U postgres wrmusic -t -A -c "$1" < /dev/null 2>/dev/null; }',
  'echo "==M1=USUARIO=="',
  'Q "SELECT u.id, u.\\"organizationId\\", u.name, u.email, u.role FROM users u WHERE u.email=\'donsescola@gmail.com\'"',
  'echo "==M2=ORG=="',
  'Q "SELECT id, name, \\"subscriptionStatus\\", \\"currentPeriodEnd\\", \\"asaasCustomerId\\", \\"asaasSubscriptionId\\" FROM organizations WHERE id IN (SELECT \\"organizationId\\" FROM users WHERE email=\'donsescola@gmail.com\')"',
  'echo "==M3=COLUNAS file_comments=="',
  'Q "SELECT column_name FROM information_schema.columns WHERE table_name=\'file_comments\' ORDER BY ordinal_position"',
  'echo "==M4=DADOS_ORG24 contagens=="',
  'for T in students lessons payment_dues reminders expenses professores instruments studio_rooms enrollment_links asaas_customers contracts notifications chat_messages settings announcements crm_leads message_automation_rules student_files student_goals student_timeline student_evolution daily_study_plans attendance_logs attendance_tokens professor_payments billing_audit_logs reminder_templates chatbot_sessions ai_documents ai_conversations short_links fiscal_companies fiscal_invoices school_integrations reschedule_requests analytics_sessions analytics_revenue monthly_stats users; do C=$(Q "SELECT COUNT(*) FROM \\"$T\\" WHERE \\"organizationId\\"=24"); echo "$T=$C"; done',
  'echo "==M5=ASAAS_CUSTOMERS org24=="',
  'Q "SELECT id, studentId, \\"asaasCustomerId\\" FROM asaas_customers WHERE \\"organizationId\\"=24"',
  'echo "==M6=SETTINGS org24 (estados, sem segredos)=="',
  'Q "SELECT \\"userId\\", \\"paymentGateway\\", COALESCE(CASE WHEN \\"asaasApiKey\\" LIKE \'v1:%\' THEN \'ASAAS_CIFRADO\' WHEN \\"asaasApiKey\\" IS NULL OR \\"asaasApiKey\\"=\'\' THEN \'ASAAS_VAZIO\' ELSE \'ASAAS_TEXTO_PURO\' END,\'-\') FROM settings WHERE \\"organizationId\\"=24"',
  'echo "==M7=USERS da org24=="',
  'Q "SELECT id, name, email, role FROM users WHERE \\"organizationId\\"=24"',
  'echo "==FIM=="',
].join('\n');

const conn = new Client();
conn.on('ready', () => {
  const b64 = Buffer.from(bash, 'utf8').toString('base64');
  conn.exec(`echo ${b64} | base64 -d | bash`, (err, stream) => {
    if (err) { console.log('EXEC_ERR:', err.message); process.exit(1); }
    let out = '';
    stream.stdout.on('data', (d) => { out += d.toString(); });
    stream.stderr.on('data', (d) => { if (!/obsolete|orphan containers/.test(d.toString())) out += '\n[ERR] ' + d.toString(); });
    stream.on('close', () => { console.log(out); console.log('===FIM==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
