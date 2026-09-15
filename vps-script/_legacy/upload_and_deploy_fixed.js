const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: process.env.VPS_HOST || '179.197.76.174',
  port: parseInt(process.env.VPS_PORT || '22', 10),
  username: process.env.VPS_USER || 'root',
  // AUDIT-P0 FIX: senha hardcoded removida — defina VPS_PASSWORD no ambiente do deploy.
  // (A senha redigida aqui estava no código-fonte = acesso root na VPS para quem lê o repo)
  password: process.env.VPS_PASSWORD,
};

const filesToUpload = [
  'docker-compose.yml',
  'package.json',
  'pnpm-lock.yaml',
  'server/routers.ts',
  'server/advancedAiRouter.ts',
  'server/studioRoomsRouter.ts',
  'client/src/pages/SalasEstudio.tsx',
  'client/src/pages/leads/LeadsApp.tsx',
  'client/src/pages/SalasEstudioTab.tsx',
  'server/_core/trpc.ts',
  'client/src/pages/Cadastro.tsx',
  'server/analyticsRouter.ts',
  'server/utils/geoIp.ts',
  'server/services/AnalyticsQueue.ts',
  'server/_core/rateLimiter.ts',
  'server/_core/index.ts',
  'server/_core/env.ts',
  'server/_core/googleAuth.ts',
  'server/seedDemo.ts',
  'server/utils/aiContext.ts',
  'server/superAdminRouter.ts',
  'client/public/logo.svg',
  'client/public/manifest.json',
  'client/public/sw.js',
  'client/public/firebase-messaging-sw.js',
  'client/index.html',
  'client/src/components/AppSidebar.tsx',
  'client/src/components/HeroSlider.tsx',
  'client/src/pages/LandingPage.tsx',
  'client/src/pages/SuperAdmin.tsx',
  'client/src/pages/ProfessorExtract.tsx',
  'client/src/pages/Progresso.tsx',
  'client/src/pages/Dashboard.tsx',
  'client/src/pages/student/Dashboard.tsx',
  'client/src/pages/student/Aulas.tsx',
  'client/src/pages/student/Agenda.tsx',
  'client/src/pages/Assinatura.tsx',
  'client/src/components/StudentSidebar.tsx',
  'client/src/App.tsx',
  'client/src/pages/NovoAluno.tsx',
  'client/src/pages/Alunos.tsx',
  'client/src/pages/IAAssistente.tsx',
  'client/src/pages/student/Exercicios.tsx',
  'client/src/pages/student/Avisos.tsx',
  'client/src/pages/student/Pagamentos.tsx',
  'client/src/pages/student/Progresso.tsx',
  'client/src/pages/student/Materiais.tsx',
  'client/src/pages/student/Perfil.tsx',
  'client/src/pages/student/Contratos.tsx',
  'client/src/components/RescheduleModal.tsx',
  'server/utils/gemini.ts',
  'client/src/lib/firebaseConfig.ts',
  'client/src/hooks/usePushNotifications.ts',
  'client/src/pages/Configuracoes.tsx',
  'client/src/pages/ChatbotFlowBuilder.tsx',
  'client/src/pages/Contratos.tsx',
  'client/src/components/modals/StudentContractsSection.tsx',
  'client/src/components/modals/AgendarModal.tsx',
  'client/src/components/modals/StudentDetailsModal.tsx',
  'drizzle/schema.ts',
  'server/_core/migrate.ts',
  'server/db.ts',
  'server/services/contractService.ts',
  'server/services/BillingEngine.ts',
  'server/automationJob.ts',
  'client/src/pages/Aulas.tsx',
  'client/src/pages/Assinatura.tsx',
  'client/src/pages/Automacoes.tsx',
  'server/utils/whatsappRouting.ts',
  'server/utils/whatsapp.ts',
  'server/automationJob.ts',
  'client/src/pages/Comunicados.tsx',
  'client/src/components/modals/LessonDetailModal.tsx',
  'client/src/index.css',
  'client/src/contexts/ThemeContext.tsx',
  'client/src/components/AppHeader.tsx',
  'client/src/components/MusicLayout.tsx',
  'client/src/components/StudentPortalLayout.tsx',
  'client/src/hooks/useBreakpoint.tsx',
  'client/src/pages/Aulas.tsx',
  'client/src/pages/Financeiro.tsx',
  'client/src/lib/exportUtils.ts',
  'client/src/pages/financeiro/MensalidadesTab.tsx',
  'client/src/pages/Progresso.tsx',
  'client/src/pages/marketing/MarketingDashboard.tsx',
  'client/src/pages/marketing/CrmKanban.tsx',
  'client/src/pages/marketing/CreateCampaign.tsx',
  'client/src/pages/marketing/CampaignDetails.tsx',
  'server/services/MarketingQueueWorker.ts',
  'server/marketingRouter.ts',
  'server/crmRouter.ts',
  'server/automationJob.ts',
  'client/src/pages/Relatorios.tsx',
  'client/src/pages/ProfessoresTab.tsx',
  'server/_core/email.ts',
  'server/webhooks/whatsapp.ts',
  'client/src/pages/SuperAdmin.tsx',
  'client/src/pages/ProfessorExtract.tsx',
  'client/src/pages/Progresso.tsx',
  'client/src/pages/Dashboard.tsx',
  'client/src/pages/student/Dashboard.tsx',
  'client/src/pages/student/Aulas.tsx',
  'client/src/pages/student/Agenda.tsx',
  'client/src/components/StudentSidebar.tsx',
  'client/src/App.tsx',
  'client/src/pages/NovoAluno.tsx',
  'client/src/pages/Alunos.tsx',
  'client/src/pages/IAAssistente.tsx',
  'client/src/pages/student/Exercicios.tsx',
  'client/src/pages/student/Avisos.tsx',
  'client/src/pages/student/Pagamentos.tsx',
  'client/src/pages/student/Progresso.tsx',
  'client/src/pages/student/Materiais.tsx',
  'client/src/pages/student/Perfil.tsx',
  'client/src/components/RescheduleModal.tsx',
  'server/utils/gemini.ts',
  'client/src/pages/Configuracoes.tsx',
  'drizzle/schema.ts',
  'server/_core/migrate.ts',
  'server/db.ts',
  'server/automationJob.ts',
  'client/src/pages/Aulas.tsx',
  'client/src/pages/Automacoes.tsx',
  'server/utils/whatsappRouting.ts',
  'server/utils/whatsapp.ts',
  'server/automationJob.ts',
  'client/src/pages/Comunicados.tsx',
  'client/src/pages/Financeiro.tsx',
  'client/src/pages/financeiro/MensalidadesTab.tsx',
  'client/src/pages/financeiro/DespesasTab.tsx',
  'client/src/pages/Dashboard.tsx',
  'server/utils/mercadopago.ts',
  'client/src/pages/Automacoes.tsx',
  'server/services/MarketingQueueWorker.ts',
  'server/marketingRouter.ts',
  'client/src/pages/marketing/MarketingDashboard.tsx',
  'client/src/pages/marketing/CreateCampaign.tsx',
  'client/src/pages/marketing/CampaignDetails.tsx',
  'server/automationJob.ts',
  'client/src/pages/Relatorios.tsx',
  'client/src/pages/ProfessoresTab.tsx',
  'server/_core/email.ts',
  'client/src/index.css',
  'client/src/pages/Assinatura.tsx',
  'client/src/pages/Alunos.tsx',
  'client/src/pages/Progresso.tsx',
  'client/src/pages/RecepcaoQRCode.tsx',
  'client/src/pages/QRScanner.tsx',
  'client/src/pages/ProfessoresTab.tsx',
  'client/src/components/modals/AgendarModal.tsx',
  'server/reportEngineRouter.ts',
  'server/report_engine/excelExporter.ts',
  'client/src/components/modals/EditStudyPlanModal.tsx',
  'client/src/components/MusicLayout.tsx',
  'client/src/components/AppHeader.tsx',
  'client/src/components/MobileTabBar.tsx',
  'client/src/components/lembretes/RemindersFilter.tsx',
  'client/src/components/StudentPortalLayout.tsx',
  'client/src/components/tour/TourProvider.tsx',
  'client/src/components/BenefitsCarousel.tsx',
  'client/src/pages/TermosDeUso.tsx',
  'client/src/pages/PoliticaPrivacidade.tsx',
  '.env',
  'Dockerfile',
  'Caddyfile',
  'drizzle.config.ts',
  'tsconfig.json',
  'evo_run.sh',
  'evolution-v2-compose.yml',
  // ── MusicPro Analytics (NOVO) ─────────────────────────────────────────────
  'drizzle/schema.ts',
  'server/analyticsRouter.ts',
  'server/services/AnalyticsQueue.ts',
  'server/services/AnalyticsAIService.ts',
  'server/routers.ts',
  'server/_core/index.ts',
  'client/src/lib/trpc.ts',
  'client/src/lib/utils.ts',
  'client/src/lib/analytics.ts',
  'client/src/App.tsx',
  'client/src/pages/analytics/AnalyticsDashboard.tsx',
  // ── Fixes: gateway redirect + horários timezone + settings ORDER BY ──────
  'client/src/pages/PublicEnrollment.tsx',
  'server/enrollmentRouter.ts',
  // ── Arquivos faltantes nos commits de hoje ───────────────────────────────
  'server/_core/notification.ts',
  'server/fcmRouter.ts',
  'server/firebaseAdmin.ts',
  'server/studioRoomsRouter.ts',
  'client/src/pages/SalasEstudioTab.tsx',
  'client/src/pages/Configuracoes.tsx',
  'client/src/components/AIChatBox.tsx',
  // ── AUDIT 18/08/2026: arquivos das correções (não estavam na lista) ──────
  'server/_core/systemRouter.ts',
  'server/slotAdvanceRouter.ts',
  'server/webhooks/botStatus.ts',
  'client/src/lib/money.ts',
  'client/src/components/modals/EditMensalidadeModal.tsx',
  'client/src/pages/Solicitacoes.tsx',
];

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established. Uploading files...');
  
  const findCmd = 'find / -maxdepth 3 -type d -name "wr-music-app" | head -n 1';
  conn.exec(findCmd, (err, stream) => {
    if (err) throw err;
    let repoPath = '';
    stream.on('data', (data) => { repoPath += data.toString(); });
    stream.on('close', () => {
      repoPath = repoPath.trim();
      if (!repoPath) {
        console.error('Repo not found!');
        conn.end();
        return;
      }
      
      conn.sftp((err, sftp) => {
        if (err) throw err;
        
        // Criar subpastas necessárias antes dos uploads
        const mkdirCmd = `mkdir -p ${repoPath}/client/src/pages/analytics ${repoPath}/server/services ${repoPath}/client/src/lib`;
        conn.exec(mkdirCmd, () => {
          let uploads = 0;
          const finalize = () => {
            uploads++;
            if (uploads === filesToUpload.length) {
              console.log('Uploads complete. Rebuilding container...');
              const rebuildCmd = `
                cd ${repoPath}
                docker compose down
                docker compose build --no-cache
                docker compose up -d
                echo "Running DB migrations..."
                sleep 5
                docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS \\"dueDaysForecast\\" text DEFAULT '5,10,15,20';"
                docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE settings ADD COLUMN IF NOT EXISTS \\"chatbotEnabled\\" integer NOT NULL DEFAULT 0;"
                docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE students ADD COLUMN IF NOT EXISTS \\"studioRoomId\\" integer;"
                docker compose exec -T db psql -U postgres -d wrmusic -c "ALTER TABLE lessons ADD COLUMN IF NOT EXISTS \\"studioRoomId\\" integer;"
                docker compose exec -T db psql -U postgres -d wrmusic -c "CREATE TABLE IF NOT EXISTS landing_clients (
                  id SERIAL PRIMARY KEY,
                  name VARCHAR(255) NOT NULL,
                  \\"logoUrl\\" TEXT NOT NULL,
                  \\"websiteUrl\\" TEXT,
                  testimonial TEXT,
                  \\"order\\" INTEGER NOT NULL DEFAULT 0,
                  \\"isActive\\" BOOLEAN NOT NULL DEFAULT true,
                  \\"createdAt\\" TIMESTAMP NOT NULL DEFAULT NOW(),
                  \\"updatedAt\\" TIMESTAMP NOT NULL DEFAULT NOW()
                );"
                docker compose exec -T db psql -U postgres -d wrmusic -c "CREATE TABLE IF NOT EXISTS landing_hero_slides (
                  id SERIAL PRIMARY KEY,
                  title VARCHAR(255) NOT NULL,
                  highlight VARCHAR(255) NOT NULL,
                  subtitle TEXT NOT NULL,
                  points TEXT NOT NULL DEFAULT '[]',
                  \\"imageUrl\\" TEXT NOT NULL,
                  \\"bgTheme\\" VARCHAR(50) NOT NULL DEFAULT 'slate-900',
                  \\"order\\" INTEGER NOT NULL DEFAULT 0,
                  \\"isActive\\" BOOLEAN NOT NULL DEFAULT true,
                  \\"createdAt\\" TIMESTAMP NOT NULL DEFAULT NOW(),
                  \\"updatedAt\\" TIMESTAMP NOT NULL DEFAULT NOW()
                );"
                echo "Limpando dados incorretos de mensalidades escolares da tabela analytics_revenue..."
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM analytics_revenue WHERE plan_name = 'Mensalidade Escolar';"
                echo "Removendo conscientemente escolas inativas (IDs 18, 20, 11 e 15 - Neemias)..."
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM payment_dues WHERE \\"organizationId\\" IN (18, 20, 11, 15);"
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM lessons WHERE \\"organizationId\\" IN (18, 20, 11, 15);"
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM students WHERE \\"organizationId\\" IN (18, 20, 11, 15);"
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM professores WHERE \\"organizationId\\" IN (18, 20, 11, 15);"
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM users WHERE \\"organizationId\\" IN (18, 20, 11, 15);"
                docker compose exec -T db psql -U postgres -d wrmusic -c "DELETE FROM organizations WHERE id IN (18, 20, 11, 15);"
                echo "Exclusão segura de organizações inativas concluída!"
              `;
              conn.exec(rebuildCmd, (err, rebuildStream) => {
                if (rebuildStream) {
                  rebuildStream.stdout.on('data', data => process.stdout.write(data.toString()));
                  rebuildStream.stderr.on('data', data => process.stderr.write(data.toString()));
                  rebuildStream.on('close', () => {
                    console.log('Deploy finished successfully!');
                    conn.end();
                  });
                } else {
                  conn.end();
                }
              });
            }
          };
          
          filesToUpload.forEach(file => {
            const localPath = path.resolve(__dirname, '../', file);
            const remotePath = `${repoPath}/${file}`;
            console.log(`Uploading ${localPath} to ${remotePath}`);
            
            if (fs.existsSync(localPath)) {
              sftp.fastPut(localPath, remotePath, (err) => {
                if (err) console.error(`Error uploading ${file}:`, err);
                else console.log(`${file} uploaded successfully.`);
                finalize();
              });
            } else {
              console.warn(`File not found locally: ${localPath}`);
              finalize();
            }
          });
        });
      });
    });
  });
}).connect(config);
