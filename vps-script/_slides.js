const ssh2 = require('ssh2');

const sql = `
INSERT INTO landing_hero_slides (title, highlight, subtitle, points, "imageUrl", "bgTheme", "order", "isActive")
SELECT * FROM (VALUES
  ('Gestão de Alunos', 'Automática', 'O MusicPro automatiza a maioria das tarefas chatas e manuais que você e sua equipe fazem hoje.',
   '["Registro de presença rápido e fácil.","Acompanhamento de evolução do aluno.","Controle de turmas e matrículas."]',
   '/images/alunos-preview.png', 'slate-50', 1, true),
  ('Cobranças e Lembretes', 'pelo WhatsApp', 'O sistema gera e envia as cobranças para os alunos todo mês, seja por Pix ou Cartão.',
   '["Lembra os alunos de pagar no dia do vencimento.","Cobra automaticamente quem está inadimplente.","Diga adeus àquela conversa chata de cobrar aluno."]',
   '/images/lembretes-preview.png', 'blue-600', 2, true),
  ('Tudo o que você precisa em um', 'Painel Inteligente', 'Tenha controle total do seu negócio com dados precisos e fáceis de visualizar.',
   '["Gráficos de receitas e despesas.","Taxa de retenção de alunos.","Previsão de faturamento mensal."]',
   '/images/dashboard-preview.png', 'slate-900', 3, true),
  ('Agenda de Aulas', '100% Organizada', 'Evite conflitos de horário e mantenha a rotina da escola fluindo perfeitamente.',
   '["Calendário interativo para professores.","Notificações de cancelamento e reposição.","Visão diária, semanal ou mensal."]',
   '/images/aulas-preview.png', 'indigo-50', 4, true)
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM landing_hero_slides);
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `echo '${b64}' | base64 -d > /tmp/slides_seed.sql && docker exec -i wr-music-app-db-1 psql -U postgres -d wrmusic < /tmp/slides_seed.sql && rm /tmp/slides_seed.sql && docker exec wr-music-app-db-1 psql -U postgres -d wrmusic -c 'SELECT id, title, highlight, "order", "isActive" FROM landing_hero_slides ORDER BY "order";'`;

const conn = new ssh2.Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stdout.write(d));
    stream.on('close', () => conn.end());
  });
}).on('error', e => console.error('conn error', e.message))
  .connect({ host: '179.197.76.174', username: 'root', password: process.env.VPS_PASSWORD, readyTimeout: 10000 });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 25000);
