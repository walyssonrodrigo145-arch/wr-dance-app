const { Client } = require('ssh2');
const conn = new Client();
const q = (sql) => `docker exec dance-db psql -U postgres -d wrdance -t -A -F"|" -c "${sql.replace(/"/g, '\\"')}"`;
const remote = [
  'echo "=== ORG 6 (escola do teste E2E) ==="',
  q(`SELECT 'modalidades', COUNT(*) FROM instruments WHERE "organizationId"=6`),
  q(`SELECT 'salas', COUNT(*) FROM studio_rooms WHERE "organizationId"=6`),
  q(`SELECT 'planos', COUNT(*) FROM school_plans WHERE "organizationId"=6`),
  q(`SELECT 'professores', COUNT(*) FROM professores WHERE "organizationId"=6`),
  q(`SELECT 'turmas', COUNT(*) FROM turmas WHERE "organizationId"=6`),
  q(`SELECT 'turma_alunos_ativa', COUNT(*) FROM turma_alunos ta JOIN turmas t ON t.id=ta."turmaId" WHERE ta."organizationId"=6 AND ta.status='ativa'`),
  q(`SELECT 'turma_alunos_espera', COUNT(*) FROM turma_alunos ta WHERE ta."organizationId"=6 AND ta.status='espera'`),
  q(`SELECT 'turma_alunos_cancelada', COUNT(*) FROM turma_alunos ta WHERE ta."organizationId"=6 AND ta.status='cancelada'`),
  q(`SELECT 'lessons_sessoes_turma', COUNT(*) FROM lessons WHERE "organizationId"=6 AND "turmaId" IS NOT NULL`),
  q(`SELECT 'lessons_sessoes_sem_aluno', COUNT(*) FROM lessons WHERE "organizationId"=6 AND "turmaId" IS NOT NULL AND "studentId" IS NULL`),
  q(`SELECT 'lesson_attendance', COUNT(*) FROM lesson_attendance WHERE "organizationId"=6`),
  q(`SELECT 'lesson_overrides', COUNT(*) FROM lesson_overrides WHERE "organizationId"=6`),
  q(`SELECT 'dues_pago', COUNT(*) FROM payment_dues WHERE "organizationId"=6 AND status='pago'`),
  q(`SELECT 'dues_pendente', COUNT(*) FROM payment_dues WHERE "organizationId"=6 AND status='pendente'`),
  q(`SELECT 'dues_atrasado', COUNT(*) FROM payment_dues WHERE "organizationId"=6 AND status='atrasado'`),
  q(`SELECT 'dues_total_valor', COALESCE(SUM(amount),0) FROM payment_dues WHERE "organizationId"=6`),
  q(`SELECT 'referrals', COUNT(*) FROM referrals r JOIN organizations o ON o.id=r."referrerOrganizationId" WHERE o.id=6`),
  q(`SELECT 'contract_templates', COUNT(*) FROM contract_templates WHERE "organizationId"=6`),
  q(`SELECT 'costume_sales', COUNT(*) FROM costume_sales WHERE "organizationId"=6`),
  q(`SELECT 'saude_registros', COUNT(*) FROM student_health_records WHERE "organizationId"=6`),
  q(`SELECT 'alunos', COUNT(*) FROM students WHERE "organizationId"=6`),
  q(`SELECT aluno, status FROM students WHERE "organizationId"=6 ORDER BY id`),
  'echo "=== INTEGRIDADE GLOBAL (todas as escolas) ==="',
  q(`SELECT 'sessoes_org_diferente_da_turma', COUNT(*) FROM lessons l JOIN turmas t ON t.id=l."turmaId" WHERE l."organizationId" IS DISTINCT FROM t."organizationId"`),
  q(`SELECT 'attendance_aluno_fora_da_turma', COUNT(*) FROM lesson_attendance la JOIN lessons l ON l.id=la."lessonId" LEFT JOIN turma_alunos ta ON ta."turmaId"=l."turmaId" AND ta."studentId"=la."studentId" WHERE l."turmaId" IS NOT NULL AND ta.id IS NULL`),
  q(`SELECT 'turma_alunos_aluno_inexistente', COUNT(*) FROM turma_alunos ta LEFT JOIN students s ON s.id=ta."studentId" WHERE s.id IS NULL`),
  q(`SELECT 'turma_alunos_turma_inexistente', COUNT(*) FROM turma_alunos ta LEFT JOIN turmas t ON t.id=ta."turmaId" WHERE t.id IS NULL`),
  q(`SELECT 'dues_aluno_inexistente', COUNT(*) FROM payment_dues d LEFT JOIN students s ON s.id=d."studentId" WHERE s.id IS NULL`),
  q(`SELECT 'students_professor_de_outra_org', COUNT(*) FROM students s JOIN users u ON u.id=s."professorId" WHERE s."organizationId" IS DISTINCT FROM u."organizationId"`),
  q(`SELECT 'orgs_total', COUNT(*) FROM organizations`),
  q(`SELECT id, name, "subscriptionStatus" FROM organizations ORDER BY id`),
].join(' ; ');
conn.on('ready', () => {
  conn.exec(remote, (err, stream) => {
    if (err) throw err;
    stream.on('data', (d) => process.stdout.write(d.toString()));
    stream.stderr.on('data', (d) => process.stderr.write(d.toString()));
    stream.on('close', () => { console.log('\n--- fim'); conn.end(); });
  });
}).on('error', (e) => { console.error('SSH error:', e.message); process.exit(1); }).connect({
  host: '179.197.76.174', port: 22, username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 60000,
});
