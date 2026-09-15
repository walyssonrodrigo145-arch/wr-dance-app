const { Client } = require('ssh2');
const conn = new Client();
const config = { host: '179.197.76.174', port: 22, username: 'root', password: 'REDACTED_AUDIT', readyTimeout: 30000 };

const runQuery = (sql) => new Promise((resolve, reject) => {
  // Usa heredoc para evitar problemas de escaping
  const cmd = `docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c '${sql}'`;
  conn.exec(cmd, (err, stream) => {
    if (err) return reject(err);
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => resolve(out.trim()));
  });
});

conn.on('ready', async () => {
  console.log('✅ SSH conectado\n');

  try {
    // PASSO 1: Encontrar usuário professor walyssonrodrigues
    console.log('🔍 PASSO 1 — Usuários walysson...');
    const p1 = await runQuery('SELECT id, name, email, role FROM users WHERE email ILIKE \'%walysson%\' ORDER BY id;');
    console.log(p1);

    // PASSO 2: Registro na tabela professores
    console.log('\n🔍 PASSO 2 — Tabela professores...');
    const p2 = await runQuery('SELECT p.id as prof_table_id, p."userId" as user_id, u.name, u.email FROM professores p INNER JOIN users u ON u.id = p."userId";');
    console.log(p2);

    // PASSO 3: Diagnóstico — quantos alunos têm professorId = professores.id em vez de userId
    console.log('\n🔍 PASSO 3 — Diagnóstico alunos com professorId incorreto...');
    const p3 = await runQuery('SELECT p.id as prof_table_id, p."userId" as correct_user_id, u.name as prof_name, COUNT(s.id) as alunos_afetados FROM professores p JOIN users u ON u.id = p."userId" JOIN students s ON s."professorId" = p.id AND p.id != p."userId" GROUP BY p.id, p."userId", u.name;');
    console.log(p3);

    // PASSO 4: Preview dos alunos afetados
    console.log('\n🔍 PASSO 4 — Alunos que serão corrigidos (primeiros 20)...');
    const p4 = await runQuery('SELECT s.id, s.name, s."professorId" as atual, p."userId" as correto FROM students s JOIN professores p ON s."professorId" = p.id WHERE p.id != p."userId" ORDER BY s.name LIMIT 20;');
    console.log(p4);

    // PASSO 5: EXECUTAR A CORREÇÃO
    console.log('\n🔧 PASSO 5 — Aplicando correção no banco...');
    const p5 = await runQuery('UPDATE students SET "professorId" = p."userId" FROM professores p WHERE students."professorId" = p.id AND p.id != p."userId";');
    console.log(p5);

    // PASSO 6: Contar quantos foram corrigidos
    console.log('\n✅ PASSO 6 — Resultado pós-correção...');
    const p6 = await runQuery('SELECT p."userId", u.name, COUNT(s.id) as total_alunos FROM professores p JOIN users u ON u.id = p."userId" LEFT JOIN students s ON s."professorId" = p."userId" GROUP BY p."userId", u.name ORDER BY total_alunos DESC;');
    console.log(p6);

    console.log('\n🎉 Banco de dados corrigido com sucesso!');
  } catch (e) {
    console.error('❌ Erro:', e.message);
  } finally {
    conn.end();
  }
});

conn.connect(config);
