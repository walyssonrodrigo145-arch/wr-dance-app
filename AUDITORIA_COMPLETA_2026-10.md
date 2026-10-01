# AUDITORIA COMPLETA DO SISTEMA — DancePro
**Data:** 2026-10-01 · **Método:** 8 agentes de auditoria paralelos (Eventos, Financeiro, Aulas/Turmas, Alunos/Portal, Comunicação, SaaS/SuperAdmin, Configurações/Integrações, Transversal) · **Escopo:** ~570 procedures tRPC, schema completo, client e server · **Nenhum código foi alterado.**

---

## 0. Resumo executivo

- **Total de achados:** 23 itens P0 (segurança/dinheiro), 41 P1 (funcional/reflexo), 34 P2 (limpeza/UX).
- **3 padrões sistêmicos** causam a maioria dos problemas:
  1. **Procedures `protectedProcedure` sem checagem de papel** — qualquer autenticado (inclusive **aluno**) chama APIs de administração/financeiro/comunicação. O middleware `adminProcedure` existe mas não é aplicado em ~15 módulos.
  2. **Configuração salva que nunca reflete em nada** (campos/abas/toggles mortos) e **funcionalidade que reflete em um só lugar** (evento não vai à agenda/notificação; loja não entra na receita; chamada de turma não chega ao portal).
  3. **Dados fictícios visíveis** (mocks/hardcoded) em telas comerciais e do portal — risco direto para divulgação.
- **Pendências já conhecidas da conversa continuam abertas:** e-mail transacional (Resend) não configurado; senha root da VPS não rotacionada.

---

## 1. RESPOSTA DIRETA — "Pra onde vai esse Evento?"

### O que existe
- Telas: `/eventos` (staff, `client/src/pages/Eventos.tsx`) e `/aluno/eventos` (`client/src/pages/student/Eventos.tsx`).
- Procedures: 16 em `server/routers/eventosRouters.ts` (list, stats, getById, create, update, delete, link/unlinkCoreografia, add/update/removeParticipant, searchAlunos, candidatesForEvent, coreografiasDisponiveis, myEvents, confirmParticipation).
- Tabelas: `events`, `event_choreographies`, `event_participants` (`drizzle/schema.ts:2632-2699`).

### Matriz de reflexo (realidade atual)

| Operação | Reflete em | NÃO reflete em |
|---|---|---|
| Criar/editar evento | Lista/KPIs de `/eventos`; `AttentionCard` do dashboard **só** se `requiresAuthorization` e houver participante pendente (`dashboardRouters.ts:415-425`) | Agenda/calendário (admin e aluno), dashboard (sem widget), push, WhatsApp, e-mail, comunicados, relatórios/export, automações |
| Vincular coreografia | Detalhe e contador do evento | **Não importa o elenco** de `coreografia_alunos` (causa direta do "0 alunos"); sem reordenação do programa |
| Convidar aluno | Detalhe + contador + `myEvents` no portal do aluno | **Nenhuma notificação** (sem push/WhatsApp/e-mail); sem badge no menu |
| Aluno confirma presença | `confirmedAt` no detalhe staff | Staff não é notificado; `confirmadosCount` é calculado e nunca exibido (`eventosRouters.ts:60`, `Eventos.tsx:97`) |
| Autorizações (imagem/participação) | Checkboxes + resumo no card + AttentionCard | Sem fluxo de assinatura do responsável; `guardianName`/`costumeNotes`/`notes` sem UI |
| Cancelar evento | Badge/sumário; some do portal | Ninguém é avisado; venda de figurino **continua liberada** (`figurinosRouters.ts:546-549`) |
| Excluir evento | Remove joins e evento | Deixa `costume_sales.eventId` órfão; `coreografias.eventId` morto |
| Venda de figurino no evento | `costume_sales` + "Minhas compras" do aluno | Não gera `payment_dues` (cobrança manual à parte) |

### Por que "0 coreografias · 0 alunos"
1. **Coreografias**: precisa criá-las em `/coreografias` (existe!) — o evento só vincula as já existentes (`eventosRouters.ts:473-495`).
2. **Alunos**: inclusão é 100% manual (`candidatesForEvent`); vincular coreografia **não traz o elenco** (`coreografia_alunos` ignorado). `coreografias.eventId` (campo antigo) nunca é lido/gravado.

### Correções do módulo (detalhadas no plano)
Notificar convite/status/cancelamento; widget no dashboard + presença na agenda; importar elenco da coreografia; reordenar programa; validar evento futuro/só ativo; limpar órfãos na exclusão; exibir dados já retornados (confirmados, endsAt, venueAddress, description).

---

## 2. ACHADOS P0 — Segurança, Fraude e Dinheiro

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| **P0-01** | **`settings.get` devolve SEGREDOS DESCRIPTOGRAFADOS a qualquer usuário logado** (asaasApiKey, mpAccessToken, infinitepayApiKey, geminiApiKey, groqApiKey, opencodeApiKey, whatsappBotToken) e é chamado no boot da sidebar | `plataformaRouters.ts:58-60`, `db.ts:1901-1911`, `AppSidebar.tsx:90`, `db.ts:1904` (fallback `"minha_chave_secreta_123"` e IP fixo) | Aluno lê chaves de pagamento/IA da escola |
| **P0-02** | **Escalada a Super Admin por e-mail**: `updateProfile` aceita trocar e-mail sem verificação/unicidade/reserva; gate de super admin é por e-mail | `plataformaRouters.ts:63-78`, `db.ts:1985-1991`, `superAdminRouter.ts:63-68` | Admin comum vira super admin |
| **P0-03** | **`announcements.create` sem papel** com `sendViaWhatsApp` em massa | `comunicacaoRouters.ts:1046,1118-1131` | Aluno dispara WhatsApp para a escola toda |
| **P0-04** | **Lembretes sem papel**: list/cancel/delete/markSent/sendViaBot escopados só por org | `comunicacaoRouters.ts:68,606,619,696,709` | Aluno lê/apaga/dispara lembretes de qualquer um |
| **P0-05** | **Contratos IDOR**: `cancel/resend/refreshStatus/previewPdf` sem papel/ownership; `contractTemplates.create/update/delete` sem papel; `downloadSigned` pula checagem se `studentId` nulo | `contratosRouters.ts:310,365,425,471,892,919,947` | Aluno baixa PDF com CPF de colegas, cancela/reenvia contratos e altera modelos |
| **P0-06** | **`expenses.create/uploadReceipt/generateRecurring` sem staff** | `financeiroRouters.ts:1459,1659,1576` | Aluno polui despesas/relatórios |
| **P0-07** | **Folha exposta**: `professorPayments.getHistory/getDetails` sem papel | `financeiroRouters.ts:1723,1949` | Aluno/professor vê pagamentos de todos |
| **P0-08** | **Webhook InfinitePay perde pagamento**: idempotência registrada ANTES do `payment_check`; retry cai como duplicado | `_core/index.ts:491-503,538-542,415-424` | Cobrança paga nunca baixada |
| **P0-09** | **SSE `botStatus` sem autenticação** transmite `PAYMENT_CONFIRMED` com nome/valor | `webhooks/botStatus.ts:20-40`, `_core/index.ts:588-593,823-828` | Anônimo recebe dados financeiros |
| **P0-10** | **Superfície de escrita sem papel** (amostra): `studioRooms.create/update/delete`, `advancedAiRouter.applySmartSchedule`, `attendance.generateToken/getActiveToken`, `reschedule.respond/delete`, `extraRequests.delete`, `instruments.create`, `schoolPlans.*` (professor edita planos financeiros) | `studioRoomsRouter.ts:230/272/317`, `advancedAiRouter.ts:321`, `lessonsRouters.ts:1541/1577/1819/1826/1912`, `studentsRouters.ts:1195`, `schoolPlansRouters.ts:74/97/123` | Aluno/professor altera dados administrativos |
| **P0-11** | **Paywall furado**: guard de assinatura só em `protectedProcedure`; `adminProcedure/professorProcedure/studentProcedure` não têm guard | `_core/trpc.ts:14-120` | Escola inadimplente continua operando pela API |
| **P0-12** | **Webhook WhatsApp**: token opcional (aviso só em prod) e `payload.instance` sem validação de dono | `webhooks/whatsapp.ts:259-267,305-311`, `env.ts:11-16` | Payload forjado cria/le dados entre escolas |

> Todos os P0 acima foram **confirmados por inspeção direta** (grep no código de produção), exceto onde marcado como amostra de grupo.

---

## 3. ACHADOS P1 — Funcionalidade, Reflexo e Integridade

### 3.1 Eventos (ver seção 1) — correções listadas no plano Fase 1.

### 3.2 Financeiro
- Webhooks (Asaas/MP/InfinitePay) **não cancelam lembretes** nem emitem NFS-e automática (só a baixa manual faz: `financeiroRouters.ts:399-414`); portal idem (`portalRouters.ts:1507`).
- **Baixa parcial automática** inconsistente: Asaas/MP marcam pago valor menor só com log; InfinitePay bloqueia (`_core/index.ts:313-327,792-808`).
- **Settings divergentes**: lista usa settings do usuário; `BillingEngine` usa a 1ª row da org sem ORDER BY (`BillingEngine.ts:242-258`) → juros exibido ≠ cobrado.
- **Professor não vê cobranças** criadas pelo admin/import (filtro por `paymentDues.userId` vs dashboard por `students.professorId`): `financeiroRouters.ts:145,1040,1067`.
- **Admin não opera cobrança de terceiros** (exige `userId = ctx.user.id` em generate/cancel/upload): `:1098,1217,1275,1342,733`.
- `updateFutureDues` quebra para admin (`:536-549`).
- **Loja não entra em receita/dashboard/relatórios/comissão**; `paymentMode:"mensalidade"` não soma em nenhum `payment_due` (`figurinosRouters.ts:503/521`).
- Colunas mortas: `daysOverdueCache`, `updatedAmountCache`, `lastCalculation` (escritas e nunca lidas); `billing_audit_logs` nunca populada (ninguém passa `origin`).
- Toggles salvos e nunca aplicados: `autoUpdateInvoice`, `showFeeBreakdown` (`Configuracoes.tsx:1381-1389`).
- Procedures sem uso: `billingEngine.calculateInvoice`, `paymentDues.create/markPaid/listByStudent/getRevenueByDueDay`, `expenses.markPaid`, `cancelMPCharge`.
- UI Asaas-only para MP: copiar link/cancelar falham para cobrança MP; sem badge MP (`MensalidadesTab.tsx:1100-1137`); sem envio de link por WhatsApp no Financeiro (imports mortos `:8,602`).
- Sem unique `(organizationId, studentId, month, year)` em `payment_dues` → corrida de duplicação.
- `pixKey` gravável por qualquer perfil (`plataformaRouters.ts:63`) e consumida da 1ª row com PIX → professor pode desviar destino de cobrança (`figurinosRouters.ts:58`, `automationJob.ts:148`).

### 3.3 Aulas / Turmas / Agenda
- **Duas chamadas divergentes**: `TurmaAttendanceModal` grava por aluno (`lesson_attendance`); `LessonDetailModal` grava status da sessão inteira (`lessonsRouters.ts:1473-1537`) → frequência x status divergem.
- **`turmas.delete` não cancela aulas futuras** (`turmasRouters.ts:413-426`) → sessões fantasmas na agenda.
- **Sessões de turma fora do dashboard do professor** (`dashboardRouters.ts:87-98`) e do Ranking/dashboard do aluno (`portalRouters.ts:249`, `RankingEngine.ts:162`).
- **`lesson_attendance` não sai do modal**: nenhum portal/relatório/frequência lê (único leitor: `TurmaScheduleService.ts:233`).
- **Overrides** (`lesson_overrides` include/exclude) ignorados pelo portal/lembretes (`portalRouters.ts:392-430,923-952`).
- Cancelamento não notifica aluno (`lessonsRouters.ts:912-938`); `cancelFutureLessons` não cancela reminders (`TurmaScheduleService.ts:172-183`).
- **Reposições**: professor nunca notificado (`professorUserId: null`); UI não permite crédito de turma; `schedule` não valida sala/passado/conflito (`repositionsRouters.ts:641-679`).
- Fila promovida sem aviso (`turmasRouters.ts:38-64`); renewals não cancela aulas individuais futuras.
- Ações de série alcançam a grade inteira em sessão gerada (`lessonsRouters.ts:817,983`) — perigoso na agenda.
- `alertSent1h/30m` nunca resetados ao remarcar → lembrete suprimido (`lessonsRouters.ts:697`, `automationJob.ts:395/413`).
- Lembretes para sessões de turma geram mensagens órfãs ("Aluno / Não cadastrado") (`automacaoJob.ts:386-390,599-614`).
- Aba **Reagendamentos** sempre vazia: nenhum INSERT em `rescheduleRequests`; fluxo real é `autoReschedule` sem aprovação (`Solicitacoes.tsx:34`, `lessonsRouters.ts:1789`).
- Endpoints mortos: `lessons.deleteBulk/listByWeek/listRange`, `turmas.studentEnrollment/setStudentTurma`.

### 3.4 Alunos / Portal
- **IDOR**: `lessons.list({studentId})` sem posse (`lessonsRouters.ts:121-158`); `musicLibrary.getFileUrl`/`fileComments` só por org (`progressRouters.ts:1598`, `portalRouters.ts:1664-1706`); `progress.getStudentPlanForTeacher/History` vaza plano pedagógico (`progressRouters.ts:1269-1301`).
- **Upload de comprovante sem limite/MIME/magic bytes** + baixa automática por IA sem antifraude (`portalRouters.ts:1428-1433,1506`).
- Permissões de portal ignoradas no server: `getLessons/getMaterials/getExercises/getPayments` não checam `canSee*` (`portalRouters.ts:378,447,524,555`); `students.update/updateStatus/delete` não checam `alunos_editar` (`studentsRouters.ts:621,799,867`).
- **Login multi-tenant**: e-mail não único, escolhe o 1º (`authRouters.ts:495-503`); `enablePortalAccess` gera e-mail sintético global `${nome}@musicpro.com` (`studentsRouters.ts:335`) e **reseta senha** em re-habilitação (`:336-359`).
- `editStudyPlanText` permite aluno reescrever o próprio plano pedagógico (`progressRouters.ts:1148`).
- Asaas no portal exibe `invoiceUrl` como "PIX copia e cola" (QR real nunca usado: `getAsaasPixQrCode`) (`Pagamentos.tsx:255`, `financeiroRouters.ts:269`).
- **Mocks visíveis no portal**: "Em Dia ✅" fixo (`Pagamentos.tsx:137`); "Nível Bronze"/95%/82% (`Perfil.tsx:259-288`); "Nota 9.5"/"85%" (`Exercicios.tsx:105,140,247`); "PUBLICADO/20 MIN/AVANÇADO" (`Progresso.tsx:540,604-614`); `averageGrade: 9.2 // Mock` (`portalRouters.ts:534-554`); `generalProgress: 85` morto (`:331`).
- Botões mortos: "Iniciar BPM" (`Progresso.tsx:209-218`); busca global do aluno sempre vazia (`AppHeader.tsx:92-95`); "+" da Agenda só toast (`Agenda.tsx:103-109`).
- Comunicados filtrados por autor (`announcements.userId = students.professorId`) → aluno não vê aviso da escola (`portalRouters.ts:235,367`).
- Timeline (`recentActivities`) devolvida e não renderizada; `studentEvolution` sem writer real; plano/bolsa e metodologia não visíveis ao aluno.
- NPS: cliente esconde 90 dias, servidor bloqueia 30 (`NpsCard.tsx:9` vs `saudeRouters.ts:173`).
- Rankings: critério "desafios" sempre 0 no breakdown; notificações de ranking só push (sem `notifications`) (`RankingEngine.ts:247,470`).
- Órfãos: `getProgress` (mock), `getProfessorContact`, `chat.*`, `fiscal.student.*` sem UI (campos `personType/fiscal*` inalcançáveis).

### 3.5 Comunicação / Automação
- **Card `slot_advance` sem implementação** no job (`Automacoes.tsx:57`); `totalSent/lastExecutedAt` nunca atualizados → "Top Automação" sempre 0; `channel/actions` aceitos e ignorados (canal sempre WhatsApp).
- **Regras padrão só são criadas quando alguém abre `/automacoes`** (`Automacoes.tsx:768-774`) → aniversário/contrato/reativação não rodam em contas que nunca abriram a tela.
- `student_inactive` ignora `allowAutoReminders` (`automationJob.ts:1188-1257`).
- Fila legada de lembretes **não usa `canSendWhatsApp`** (só 10/min) e comunicados em massa sem rate limit (`automationJob.ts:592-636`, `comunicacaoRouters.ts:1090-1137`).
- **Duplicidade de pagamento confirmado**: mensagem fixa do webhook + rule + lembrete legado (chaves anti-spam diferentes) (`_core/index.ts:841-859`, `automationJob.ts:1333-1421`).
- `sendVerificationEmail` morto; sem rota `/verify-email`; reset de senha silencioso sem Resend.
- Marketing usa URL/chave globais e colunas inexistentes (`MarketingQueueWorker.ts:117-127`); fallback `prof_1` (`enrollmentRouter.ts:93-101`); chatbotSessions sem `organizationId` (`webhooks/whatsapp.ts:534-537`).
- Webhook com blocos duplicados/mortos (`webhooks/whatsapp.ts:625-659,915-926,1156-1206`).
- Matrícula pública enviada **sem nenhuma notificação** (`enrollmentRouter.ts:683+`).
- UI enganosa de push quando `VITE_VAPID_PUBLIC_KEY` ausente no build.

### 3.6 SaaS / SuperAdmin / Planos
- **Trial no SuperAdmin seta `trialing` sem `trialEndsAt` → BLOQUEIA a escola** (`SuperAdmin.tsx:498` vs `trpc.ts:38`).
- `deleteOrganization` **não cancela Asaas** e deixa ~25 tabelas órfãs (turmas, eventos, figurinos, fiscal, rankings...).
- Impersonation: retorno para rota inexistente `/super-admin` (real: `/master-panel`); `stopImpersonation` passa pelo paywall (super admin preso se escola bloqueada).
- **Cupons não aplicam desconto em nenhum checkout**; `currentUses` nunca incrementa; tab "Cupons" decorativa.
- `registerWithPlan` sempre retorna `invoiceUrl: null`, mas a UI abre o link e promete assinatura; CTA fixo `'profissional'` pode não existir no banco.
- Quota de plano aplicada só em `studentsRouters`; CRM/matrícula/IA/whatsapp criam aluno sem checar limite.
- Preços hardcoded no Checkout (R$ 49/499) vs planos do banco; textos divergentes (-17% / 15% / "2 meses grátis").
- `getPublicStats` conta alunos inativos e todas as escolas → números infláveis na landing.
- `organizations.planId` default `'premium'` sem seed → limites caem em "ilimitado" (`helpers.ts:230`).
- Referral: `markCredited` sem UI; indicações presas em "convertido"; sem tab no SuperAdmin.
- Sem auditoria persistida de ações do super admin; `resetUserPassword` não invalida sessões.
- Impersonation/delete usam `debugLog`; `getOrganizations` vaza `asaasCustomerId/SubscriptionId` ao cliente.

### 3.7 Configurações / Contratos / Fiscal
- **BillingEngine lê settings erradas** (1ª row da org sem ORDER BY) → juros salvos pelo admin podem não valer (`BillingEngine.ts:242-248`).
- `fiscal_companies.focusApiKey` em texto puro e devolvida ao client (`schema.ts:1923`, `fiscalRouter.ts:20-33`); sem chave própria cai na conta **global** Focus (`FiscalService.ts:111`) → risco de emitir no CNPJ errado.
- Webhooks FocusNFe/Assinafy só validam secret se a env existir; referência previsível (`FiscalService.ts:37-39`).
- Campos salvos e **nunca lidos**: `schoolWebsite`, `schoolDescription` (não espelhados), `bio`, `tipoEmissaoNfse`, `emitTiming`, `autoEmailInvoice`, `autoRetryErrors`, `certificateA1Status/ExpiresAt/focusCompanyId`; `zapsignApiKey` legado.
- Botão **"Atualizar Certificado" sem onClick** + selo "A1 Conectado" hardcoded (`ConfigFiscalTab.tsx:580-595`).
- Cota fiscal **"Consumo simulado 4000 notas"** (`fiscalRouter.ts:230-244`).
- Links `/matricula/{slug}` gerados por slug não batem com `enrollmentLinks.code` (hash) → link quebrado no bot/IA (`webhooks/whatsapp.ts:161`, `schoolAiRouter.ts:266`).
- PDF de contrato sem logo/cabeçalho da escola (`contractService.ts:103-185`).
- `contracts.remove` faz DELETE físico (perde auditoria de assinatura).
- `contractTemplates.list` é query que escreve (auto-cria modelos).
- `updateAutoAdvanceTemplate`, `listAssinafyTemplates`, `fiscal.student.*` sem uso no client.

### 3.8 Transversal
- **Rotas/páginas órfãs**: `NotFound.tsx`, `ProfessoresTab.tsx`; aliases mortos `/loja`, `/salas-estudio`, `/fluxo-chatbot`, `/ia-conhecimento`; `/analytics` interceptada por host.
- **Marketing sem entrada de menu**; `/comercial` e `/marketing` sem guard no client (backend protege).
- **Mocks visíveis comerciais**: `LeadsApp.tsx:33-41` (`SAMPLE_LEADS`), Metas/Performance/Origens hardcoded (`:773-833,1012-1082`), checklist fixo (`:69-76`); `DashboardComercial.tsx:110-122` (11 leads fictícios).
- **Botões que só mostram toast**: `DashboardComercial.tsx:159-858` ("Baixar Relatório PDF/CSV"), `LeadsApp.tsx:712,733,761,954,990,1097` (follow-up, proposta, contrato, boas-vindas, WhatsApp, salvar config).
- Scripts server órfãos: `checkRules.ts`, `truncate.ts`, `seedDemo.ts`.
- Órfãos de dados: tabela `analytics_reports`; 19 colunas analytics/CRM nunca lidas (`analytics_conversions.reached*`, `analytics_visitors.*`, `crm_leads.dueDateAlert`, `monthly_stats.lessonsCancelled`).
- Menu x API divergentes: professor com `/notas-fiscais` liberado no menu recebe FORBIDDEN da API (admin-only).

---

## 4. PLANO DE CORREÇÃO

### Fase 0 — Segurança e dinheiro (bloqueador de lançamento) · ~2-3 dias
**Objetivo: nenhum aluno/professor executa ação administrativa; nenhum segredo vaza; nenhum pagamento se perde.**
1. `settings.get` → retornar apenas máscaras/flags (`hasAsaasKey`, `hasMpToken`, ...); nunca token/campos descriptografados (`plataformaRouters.ts:58`, `db.ts:1901`).
2. `updateProfile`: bloquear e-mail reservado/duplicado; trocar gate super-admin de e-mail para lista de `userId/openId` (`plataformaRouters.ts:63`, `superAdminRouter.ts:63`).
3. Aplicar `adminProcedure`/`professorProcedure`: comunicação inteira (announcements, reminders, whatsapp, automations, chatbotFlow), contratos + templates, expenses, professorPayments history/details, studioRooms, attendance tokens, reschedule/extraRequests, instruments, schoolPlans (admin), advancedAi.applySmartSchedule.
4. Entre procedures não-admin: adicionar checagem de ownership (ex.: professor só nas próprias turmas/alunos) ou admin.
5. Webhook InfinitePay: só registrar idempotência **depois** de decidir `paid` (ou marcar `pending` e reprocessar no retry) (`_core/index.ts:491-542`).
6. Autenticar SSE (`webhooks/botStatus.ts:20`); remover nome/valor do broadcast.
7. Exigir `WHATSAPP_WEBHOOK_TOKEN` em produção + validar dono da instância.
8. Paywall nos middlewares `adminProcedure/professorProcedure/studentProcedure` (`_core/trpc.ts`).
**Aceite:** suíte de testes de permissão (novo arquivo) provando FORBIDDEN para aluno/professor nos 15 módulos; pagamento InfinitePay simulado com retry baixa corretamente.

### Fase 1 — Eventos & Espetáculos "sem nada solto" · ~3 dias
1. Notificações do evento: convite, mudança de status, cancelamento (notify interno + WhatsApp + push).
2. Reflexo: widget no dashboard (staff), presença na agenda do aluno e do staff, feed do aluno (`myEvents` na home).
3. Programa & Elenco: botão "Importar elenco da coreografia" (lê `coreografia_alunos`); reordenação (drag) do programa; contadores com `confirmadosCount`.
4. Exibir campos existentes: `endsAt`, `venueAddress`, `description`, `confirmedAt`, `guardianName`, `costumeNotes`.
5. Validações: confirmar só evento futuro/não cancelado; participante só ativo; bloquear venda de figurino em evento cancelado.
6. Integridade: excluir evento → tratar `costume_sales.eventId`; excluir coreografia → limpar `event_choreographies` em transação; remover/usar `coreografias.eventId`.
**Aceite:** criar evento → vincular coreografia com elenco → todos os alunos convidados recebem notificação → aluno vê na home/agenda → confirma → staff vê "X confirmados".

### Fase 2 — Financeiro e Portal confiáveis · ~3-4 dias
1. Unificar confirmação de pagamento (webhook OU portal OU manual): baixa + cancelar lembretes + NFS-e (se `autoEmitOnPayment`) + persistir `receiptUrl`; idempotência única.
2. BillingEngine lê settings do admin da org (mesma resolução de `contractService.ts:346`); `persistPaymentAmount` sempre antes de gerar link (inclusive automação).
3. Ownership financeiro: admin opera cobranças da escola (remover exigência `userId`); professor vê as dos seus alunos.
4. Loja integrada: venda entra em receita/relatórios; opção "cobrar junto com a mensalidade" gera item no `payment_dues`.
5. Portal: PIX Asaas real (`getAsaasPixQrCode`); remover mocks (Pagamentos/Perfil/Exercícios/Progresso); presenças de turma visíveis; aplicação de `canSee*` no server.
6. Upload de comprovante com limite/MIME/magic bytes; revisar antifraude da baixa por IA.
7. Unique `(organizationId, studentId, month, year)` + validações min/max de valores.
**Aceite:** ciclo real Asaas/MP/InfinitePay em sandbox com baixa, lembrete cancelado e recibo salvo; portal sem nenhum dado fixo.

### Fase 3 — Aulas/Turmas/Comunicação · ~3-4 dias
1. Chamada única (TurmaAttendance) também na agenda; bloquear `updateTurmaAttendance` para sessão de grade.
2. `turmas.delete` cancela aulas futuras e limpa attendance/overrides; avisar/travar ações de série em sessão gerada.
3. Dashboard do professor com sessões de turma; frequência de turma no relatório e no portal; overrides no portal/lembretes.
4. Notificações: cancelamento/remarcação/reposição (aluno) e reposição (professor); fila promovida avisa.
5. Lembretes: resetar `alertSent`, permitir regenerar cancelados, `canSendWhatsApp` na fila legada e comunicados; semear regras no servidor (não no `useEffect`).
6. Reposição: validar sala/futuro/conflito; permitir crédito de turma na UI; aba Reagendamentos real ou removida.
**Aceite:** gerar grade → professor vê na agenda/dashboard → chamada por aluno → aluno vê presença → cancelamento notifica aluno.

### Fase 4 — SaaS/SuperAdmin e Integrações · ~2-3 dias
1. SuperAdmin: trial com `trialEndsAt`; cancelar Asaas no delete; trocar plano da escola; auditoria persistida; rota de retorno `/master-panel`.
2. Cupons aplicados no checkout + `currentUses`; preços dinâmicos; tratamento de `invoiceUrl` nulo; CTA do plano real.
3. Quotas de plano em todos os pontos de criação de aluno; seed de `system_plans`.
4. Fiscal: cifrar `focusApiKey`, ambiente por escola, remover "consumo simulado", botão de certificado real ou removido; secrets obrigatórios nos webhooks.
5. Config: remover/implementar campos mortos; `pixKey` restrita a admin; links de matrícula por `code`.
6. E-mail transacional (Resend) configurado + reset de senha visível.

### Fase 5 — Limpeza, UX e testes · ~2 dias
1. Remover mocks comerciais (`LeadsApp`, `DashboardComercial`) ou rotulá-los "dados de exemplo"; implementar os botões de relatório/export.
2. Limpar páginas/rotas/scripts/tabelas/colunas órfãs; menu x API alinhados; entrada de menu para Marketing.
3. Testes: permissões (Fase 0), fluxo de evento completo, pagamento webhook, geração de grade/chamada, criação de aluno com quota.
**Aceite:** `pnpm check` 0 erros, suíte completa verde + novos testes; nenhum item desta auditoria sem decisão (corrigido, removido ou registrado como fora de escopo).

---

## 5. Riscos e dependências do plano
- **Fase 0 é pré-requisito de qualquer divulgação**: hoje um aluno pode ler as chaves da escola e disparar WhatsApp em massa.
- **Testes de permissão exigem sessões reais** de aluno/professor (usar a escola demo seedada como fixtures).
- **NFS-e/Fiscal**: depende de decisão de negócio (produção vs homologação) e certificado A1 real.
- **SuperAdmin delete**: decidir soft-delete/arquivamento de escola antes de implementar cascade completo.
- **Migration de duplicidade de payment_dues**: criar unique exige limpar duplicatas existentes antes.

## 6. Métricas de sucesso
- 0 procedures administrativas acessíveis por aluno/professor (teste automatizado).
- 100% dos pagamentos confirmados por webhook com baixa + recibo + lembrete cancelado.
- Evento: 100% dos convidados notificados; presença de turma visível no portal.
- 0 mocks visíveis em telas comerciais/portal.
- Tempo de correção das Fases 0-2 < 10 dias de trabalho.
