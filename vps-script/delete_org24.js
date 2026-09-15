// AÇÃO — Exclusão completa da org 24 (MAURICIO PEREIRA DA SILVA) + limpeza Asaas.
// 1) SQL: deleta todas as tabelas ligadas à org 24 (detecta coluna organizationId/organization_id)
// 2) Asaas (chave da PLATAFORMA): cancela assinatura SaaS, deleta cobranças pendentes/overdue, tenta deletar o customer
// Uso: node -r dotenv/config vps-script/delete_org24.js
const { Client } = require('ssh2');
const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASSWORD,
  readyTimeout: 60000,
};

// DO block: para cada tabela, usa a coluna de org que existir (camel ou snake)
const tables = [
  'marketing_logs', 'marketing_jobs', 'marketing_contacts', 'marketing_campaigns',
  'file_comments', // organiza por qualquer coluna de org que existir (snake em prod)
  'student_files', 'student_timeline', 'student_goals', 'student_evolution', 'daily_study_plans',
  'reschedule_requests', 'attendance_logs', 'attendance_tokens', 'professor_payments',
  'contracts', 'contract_events', 'contract_templates', 'school_integrations',
  'asaas_customers', 'billing_audit_logs', 'payment_dues', 'reminders', 'reminder_templates',
  'chat_messages', 'announcements', 'message_automation_rules', 'notifications', 'fcm_tokens',
  'ai_documents', 'chatbot_sessions', 'crm_leads', 'crm_goals', 'crm_activities',
  'studio_rooms', 'enrollment_links', 'analytics_sessions', 'analytics_revenue', 'analytics_security_logs',
  'webhook_events', 'short_links',
  'fiscal_companies', 'fiscal_invoices', 'fiscal_services', 'fiscal_jobs', 'fiscal_logs',
  'lessons', 'students', 'professores', 'instruments', 'expenses', 'monthly_stats',
  'settings',
  // IA: mensagens dependem das conversas
  '__ai_messages__', 'ai_conversations',
  // Usuários e a própria organização por último
  'users', 'organizations',
];

const doBlock = `DO $$
DECLARE t TEXT; col TEXT; cnt INT;
BEGIN
  FOREACH t IN ARRAY ARRAY[${tables.map((t) => `'${t}'`).join(',')}]
  LOOP
    IF t = '__ai_messages__' THEN
      DELETE FROM ai_messages WHERE \\"conversationId\\" IN (SELECT id FROM ai_conversations WHERE \\"organizationId\\"=24);
      GET DIAGNOSTICS cnt = ROW_COUNT;
      RAISE NOTICE 'ai_messages: % deletados', cnt;
      CONTINUE;
    END IF;
    SELECT column_name INTO col FROM information_schema.columns
      WHERE table_name = t AND column_name IN ('organizationId','organization_id') LIMIT 1;
    IF col IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I WHERE %I = 24', t, col);
      GET DIAGNOSTICS cnt = ROW_COUNT;
      RAISE NOTICE '% (%): % deletados', t, col, cnt;
    ELSE
      RAISE NOTICE '%: sem coluna de org (pulado)', t;
    END IF;
  END LOOP;
END $$;`;

// Nota: ai_messages usa conversation_id (snake) — query explícita acima.
// chat_messages usa receiverId/senderId sem org?? tem organizationId (schema) — ok.
// ai_conversations tem "organizationId" camel ✓ (queries usam camel).

const bash = [
  'cd /root/wr-music-app',
  'echo "==1=DELECAO_COMPLETA_ORG24=="',
  // $$ vira PID no bash dentro de aspas duplas — escapar como \$\$. Newlines reais ok dentro de "..."
  'docker compose exec -T db psql -U postgres wrmusic -c "' + doBlock.replace(/\$\$/g, '\\$\\$') + '" < /dev/null 2>&1 | tail -60',
  'echo "==2=RESTANTES (deve ser tudo zero)=="',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'users_org24=\'||COUNT(*) FROM users WHERE \\"organizationId\\"=24" < /dev/null 2>/dev/null',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'students_org24=\'||COUNT(*) FROM students WHERE \\"organizationId\\"=24" < /dev/null 2>/dev/null',
  'docker compose exec -T db psql -U postgres wrmusic -t -A -c "SELECT \'org24_existe=\'||COUNT(*) FROM organizations WHERE id=24" < /dev/null 2>/dev/null',
  'echo "==3=ASaaS: cancelar assinatura SaaS + limpar cobranças + customer =="',
  'docker compose exec -T app node -e "eval(Buffer.from(\'' + Buffer.from([
    "const K=(process.env.ASAAS_API_KEY||'').replace(/[\"']/g,'');",
    "const B=(process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3').replace(/[\"']/g,'');",
    "const H={headers:{access_token:K}};",
    "const call=async(m,u)=>{try{const r=await fetch(B+u,{method:m,...H});const t=await r.text();console.log(m,u.slice(0,60),'-> HTTP',r.status,t.slice(0,160));}catch(e){console.log('ERRO',m,u,e.message);}};",
    "(async()=>{",
    "  await call('DELETE','/subscriptions/sub_1pg28im48f4900wy');",
    "  for(const st of ['PENDING','OVERDUE']){",
    "    try{const r=await fetch(B+'/payments?customer=cus_000191714477&status='+st,H);const j=await r.json();",
    "      for(const p of (j.data||[])){await call('DELETE','/payments/'+p.id);}}",
    "    catch(e){console.log('ERRO lista',st,e.message);}",
    "  }",
    "  await call('DELETE','/customers/cus_000191714477');",
    "})();",
  ].join('\n'), 'utf8').toString('base64') + '\',\'base64\').toString(\'utf8\'))" < /dev/null 2>&1',
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
    stream.on('close', () => { console.log(out); console.log('===FIM-EXCLUSÃO==='); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect(config);
