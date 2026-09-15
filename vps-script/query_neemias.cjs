const { Client } = require('ssh2');

const conn = new Client();
const config = {
  host: '179.197.76.174',
  port: 22,
  username: 'root',
  password: 'REDACTED_AUDIT',
  readyTimeout: 30000
};

conn.on('ready', () => {
  const commands = `
    cd /root/wr-music-app || exit 1
    docker compose exec -T app node -e "
      const pg = require('postgres');
      const sql = pg(process.env.DATABASE_URL);
      async function run() {
        try {
          const orgs = await sql\\\`SELECT * FROM organizations WHERE name ILIKE '%neemias%'\\\`;
          console.log('--- ORGANIZACOES ENCONTRADAS ---');
          
          for (const org of orgs) {
            console.log('\\n--- DADOS DA ORG: ' + org.name + ' (ID: ' + org.id + ') ---');
            
            const users = await sql\\\`SELECT id, name, email, role FROM users WHERE \\\\\\\"organizationId\\\\\\\" = \\\${org.id}\\\`;
            console.log('Professores/Usuarios:', JSON.stringify(users, null, 2));

            const students = await sql\\\`SELECT id, name, email, status FROM students WHERE \\\\\\\"organizationId\\\\\\\" = \\\${org.id}\\\`;
            console.log('Alunos:', JSON.stringify(students, null, 2));
          }

          process.exit(0);
        } catch(e) {
          console.error(e);
          process.exit(1);
        }
      }
      run();
    "
  `;

  conn.exec(commands, (err, stream) => {
    if (err) return conn.end();
    stream.on('close', () => conn.end()).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', () => {}).connect(config);
