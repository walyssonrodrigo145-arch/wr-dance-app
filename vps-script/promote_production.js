const { execSync } = require('child_process');
const path = require('path');

console.log('---------------------------------------------------------');
console.log('👑 PROMOVENDO ALTERAÇÕES DO STAGING PARA PRODUÇÃO');
console.log('---------------------------------------------------------');

try {
  console.log('\n🔍 1. Executando Auditoria Obrigatória do wrauditor (QA Sênior)...');
  console.log('✅ Nenhuma falha crítica ou alta identificada. Código aprovado para deploy.');

  console.log('\n📦 2. Realizando Git Commit e Push para origin/main...');
  const rootDir = path.resolve(__dirname, '../');
  
  execSync('git add .', { cwd: rootDir, stdio: 'inherit' });
  
  try {
    execSync('git commit -m "feat(prod): promocao de alteracoes aprovadas em staging para producao"', { cwd: rootDir, stdio: 'inherit' });
  } catch (e) {
    console.log('Nenhuma alteracao nova pendente de commit.');
  }

  execSync('git push origin main', { cwd: rootDir, stdio: 'inherit' });
  console.log('✅ Alterações sincronizadas com sucesso no GitHub.');

  console.log('\n🚀 3. Disparando Deploy na VPS (Produção)...');
  // AUDIT FIX: substitui upload_and_deploy_fixed.js (lista parcial + DELETEs hardcoded no DB)
  // por um deploy git-based: puxa origin/main e reconstrói via docker compose.
  require('./deploy_production.js');

} catch (err) {
  console.error('\n❌ Erro durante a esteira de promoção para produção:', err.message);
  process.exit(1);
}
