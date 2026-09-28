const { Client } = require('ssh2');
const conn = new Client();
const remote = [
  'echo "--- health:"; curl -s -m 10 http://localhost:3002/api/health',
  'echo ""; echo "--- sitemap:"; curl -s -o /dev/null -w "HTTP %{http_code} (%{size_download}b)" https://dancepro.wrmusicpro.com.br/sitemap.xml',
  'echo ""; echo "--- robots:"; curl -s -o /dev/null -w "HTTP %{http_code}" https://dancepro.wrmusicpro.com.br/robots.txt',
  'echo ""; echo "--- paginas SEO:"; for p in /funcionalidades /funcionalidades/turmas-e-chamada /para/escola-de-ballet /comparar/planilha /blog /blog/como-aumentar-rematriculas /glossario /indique; do code=$(curl -s -o /dev/null -w "%{http_code}" "https://dancepro.wrmusicpro.com.br$p"); echo "$p -> $code"; done',
  'echo "--- SW novo:"; curl -s https://dancepro.wrmusicpro.com.br/sw.js | head -1; curl -s https://dancepro.wrmusicpro.com.br/sw.js | grep -c "fetch_bypassed_api" || true',
  'echo "--- robots conteudo:"; curl -s https://dancepro.wrmusicpro.com.br/robots.txt',
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
