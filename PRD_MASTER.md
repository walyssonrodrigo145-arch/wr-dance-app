# 📚 PRD MASTER & DOCUMENTAÇÃO DE FUNCIONALIDADES — MUSICPRO

> **Status:** Documento Vivo Oficial  
> **Versão:** 1.1.0  
> **Última Atualização:** 21/08/2026  
> **Responsável:** Especialista de Requisitos & Analista de Sistemas (`/prdspec`)  
> **Regra de Governança:** Toda nova funcionalidade, alteração de escopo ou correção estrutural DEVE ser adicionada ou atualizada neste documento para evitar perda de contexto e regressões.

---

## 🧭 1. VISÃO GERAL DO SISTEMA

O **MusicPro** é uma plataforma SaaS all-in-one para gestão de escolas de música e professores particulares. O ecossistema integra:
- **Painel Administrativo / Professor:** Gestão pedagógica, financeira, marketing, automações e contratos.
- **Portal do Aluno:** Experiência mobile-first para acompanhamento de aulas, materiais de estudo, pagamentos, contratos e avisos.
- **Motor de Automações & WhatsApp:** Disparo de lembretes inteligentes, cobranças via PIX/cartão com gateway Asaas/Mercado Pago e chatbot com IA.
- **Motor Financeiro (BillingEngine):** Cálculo de juros, multas, carências e emissão fiscal (NFS-e via FocusNFe).

---

## 📊 2. MATRIZ DE STATUS GERAL DAS FUNCIONALIDADES

| Módulo / Funcionalidade | Rota / Local | Status Atual | Backend / Router |
| :--- | :--- | :--- | :--- |
| **Autenticação & Sessões** | `/login`, `/cadastro` | 🟢 100% Funcional | `authRouters.ts` |
| **Alunos (CRUD & Matrículas)** | `/alunos`, `/alunos/novo`, `/matricula/:code` | 🟢 100% Funcional | `studentsRouters.ts`, `enrollmentRouter.ts` |
| **Aulas & Calendário Semanal** | `/aulas` | 🟢 100% Funcional | `lessonsRouters.ts`, `slotAdvanceRouter.ts` |
| **Salas de Estúdio & Conflitos** | `/salas`, `/salas-estudio` | 🟢 100% Funcional | `studioRoomsRouter.ts` |
| **Financeiro & Mensalidades** | `/financeiro` (Mensalidades, Despesas) | 🟢 100% Funcional | `financeiroRouters.ts`, `BillingEngine.ts` |
| **Extrato & Folha de Professores**| `/folha` | 🟢 100% Funcional | `ProfessorPaymentService.ts`, `reportsRouters.ts` |
| **Contratos & Assinatura Digital**| `/contratos`, `/aluno/contratos` | 🟢 100% Funcional | `contratosRouters.ts`, `contractService.ts` |
| **Portal do Aluno (Completo)** | `/aluno/*` (Aulas, Agenda, Pagamentos, etc.) | 🟢 100% Funcional | `portalRouters.ts` |
| **Progresso Pedagógico & Metas** | `/progresso`, `/aluno/progresso` | 🟢 100% Funcional | `progressRouters.ts` |
| **Motor de Automação & Mensagens** | Background Job (`automationJob.ts`) | 🟢 100% Funcional (UTF-8 corrigido) | `automationJob.ts`, `comunicacaoRouters.ts` |
| **Lembretes & Disparos WhatsApp** | `/lembretes`, `/automacoes` | 🟢 100% Funcional | `comunicacaoRouters.ts`, `utils/whatsapp.ts` |
| **Chatbot & Fluxo Conversacional** | `/chatbot-fluxo`, `/fluxo-chatbot` | 🟢 100% Funcional | `chatbotFlowRouter.ts` |
| **IA & Base de Conhecimento** | `/ia`, `/base-conhecimento-ia` | 🟢 100% Funcional | `aiRouters.ts`, `schoolAiRouter.ts`, `gemini.ts` |
| **Recepção & Scanner QR Code** | `/recepcao-qr`, `/scanner`, `/aluno/scanner`| 🟢 100% Funcional | `lessonsRouters.ts` |
| **CRM Comercial & Leads** | `/leads`, `/comercial` (ou subdomínio `leads.`) | 🟢 100% Funcional | `crmRouter.ts` |
| **Marketing & Campanhas** | `/marketing`, `/marketing/nova` | 🟢 100% Funcional | `marketingRouter.ts` |
| **Módulo Fiscal (NFS-e)** | `/configuracoes` (Aba Fiscal / FocusNFe) | 🟢 100% Funcional | `fiscalRouter.ts`, `FiscalService.ts` |
| **Super Admin & Planos SaaS** | `/master-panel` | 🟢 100% Funcional | `superAdminRouter.ts` |
| **Relatórios Executivos (Excel/PDF)**| `/relatorios` | 🟢 100% Funcional | `reportsRouters.ts`, `reportEngineRouter.ts` |
| **Analytics Avançado** | `/analytics` (ou subdomínio `analytics.`)| 🟢 100% Funcional | `analyticsRouter.ts` |
| **Notificações Push (Web / PWA)**| Service Worker + FCM | 🟢 100% Funcional | `fcmRouter.ts` |

---

## 🛠️ 3. DETALHAMENTO DAS FUNCIONALIDADES POR MÓDULO

---

### 3.1 MÓDULO: ALUNOS & MATRÍCULAS
- **Rotas:** `/alunos`, `/alunos/novo`, `/alunos/:id/editar`, `/matricula/:code`
- **Componentes:** `components/alunos/StudentModal.tsx`, `components/alunos/StatusBadge.tsx`, `components/alunos/PortalAccessCard.tsx`.
- **Backend:** `server/routers/studentsRouters.ts`, `server/enrollmentRouter.ts`.

#### ✅ O que está funcionando:
1. **Cadastro & Edição de Alunos:** Criação com nome, CPF, telefone, data de nascimento, responsável financeiro, instrumento, professor vinculado e valor da mensalidade.
2. **Matrícula Pública Online:** Link compartilhável `/matricula/:code` gerado para auto-cadastro do aluno com preenchimento automático e criação de contrato.
3. **Controle de Notificações por Aluno:** Toggle `allowAutoReminders` para ativar/desativar lembretes automáticos individualmente por aluno.
4. **Geração de Acesso ao Portal do Aluno:** Envio de credenciais com senha inicial e link de acesso direto via WhatsApp.
5. **Soft Delete / Inativação:** Alunos podem ser arquivados ou reativados sem perda do histórico financeiro.

---

### 3.2 MÓDULO: AULAS, AGENDAMENTOS & SALAS
- **Rotas:** `/aulas`, `/salas`, `/salas-estudio`, `/recepcao-qr`
- **Componentes:** `components/aulas/LessonCardDesktop.tsx`, `components/aulas/StatusBadge.tsx`, `components/modals/PrintableQrBannerModal.tsx`.
- **Backend:** `server/routers/lessonsRouters.ts`, `server/studioRoomsRouter.ts`, `server/slotAdvanceRouter.ts`.

#### ✅ O que está funcionando:
1. **Calendário Semanal & Grade Horária:** Visualização em grade e lista, filtragem por professor, sala e instrumento.
2. **Controle de Status da Aula:** `agendada`, `concluida`, `falta`, `cancelada`, `reposta`.
3. **Gestão de Salas de Estúdio:** Prevenção automática de conflitos de horário entre professores na mesma sala física.
4. **Antecipação Inteligente de Horários (Slot Advance):** Quando um aluno cancela ou falta, o sistema identifica vagas e pode sugerir antecipação para outros alunos via WhatsApp.
5. **Check-in por QR Code & Totem de Recepção:**
   - Tela de recepção `/recepcao-qr` com geração de QR Code dinâmico e auto-refresh.
   - **Impressão de Totem / Placa de Mesa A4:** Modal para impressão e download de PNG em Ultra-HD com dados da escola e instruções passo a passo.
   - **Momento Obrigatório Configurável:** Suporte a validação no início da aula (chegada), término da aula (saída) ou horário flexível (livre) com tolerância de minutos configurável em `/configuracoes` (Aba Escola).

---

### 3.2.1 MÓDULO: PROGRESSO PEDAGÓGICO & PLANOS DE ESTUDO POR IA
- **Rotas:** `/progresso`, `/aluno/progresso`
- **Componentes:** `components/progresso/MetasMusicais.tsx`, `components/progresso/BibliotecaMusical.tsx`, `components/progresso/Observacoes.tsx`.
- **Backend:** `server/routers/progressRouters.ts`.

#### ✅ O que está funcionando:
1. **Jornada & Metas Musicais:** Cadastro de metas semanais com status pendente/concluída.
2. **Plano de Estudo Diário Gerado por IA:**
   - Geração contextual em 5 dias com base nas metas cadastradas e histórico do aluno.
   - **Parametrização de Duração de Estudo Diário:** Seletor rápido de tempo (**10, 20, 30, 40, 50 ou 60 min/dia**) antes da geração, balanceando proporcionalmente os blocos de Aquecimento, Prática Principal e Desafio.
   - **Fluxo de Rascunho / Publicação:** O professor pode revisar, editar e liberar para o aluno quando estiver pronto.
   - **Disparo via WhatsApp:** Envio formatado com emojis diretamente para o WhatsApp do aluno ou responsável.

---

### 3.3 MÓDULO: FINANCEIRO, MENSALIDADES & COBRANÇA
- **Rotas:** `/financeiro`, `/assinatura`
- **Componentes:** `pages/financeiro/MensalidadesTab.tsx`, `pages/financeiro/DespesasTab.tsx`, `pages/financeiro/ConfiguracoesFinanceirasTab.tsx`.
- **Backend:** `server/routers/financeiroRouters.ts`, `server/services/BillingEngine.ts`.

#### ✅ O que está funcionando:
1. **BillingEngine (Cálculo Financeiro Centralizado):** Juros, multas por atraso e dias de carência calculados dinamicamente e com precisão monetária (`formatBRL`).
2. **Geração de Carnês & Vencimentos:** Criação recorrente de parcelas com ajuste automático de fim de mês (`buildDueDateSeries`).
3. **Gateways de Pagamento Integrados:**
   - **Asaas:** Cobranças automáticas, boletos bancários, QR Code PIX dinâmico e webhook de conciliação.
   - **Mercado Pago:** Links de pagamento on-the-fly.
   - **PIX Manual:** Chave PIX da escola injetada com formatação limpa no WhatsApp.
4. **Baixa de Mensalidade Idempotente (`markPaid`):** Prevenção rigorosa de duplicidade de baixa, disparo de recibo e emissão fiscal.
5. **Gestão de Despesas & Contas a Pagar:** Registro de saídas da escola categorizadas.

---

### 3.4 MÓDULO: FOLHA DE PAGAMENTO DE PROFESSORES
- **Rotas:** `/folha`
- **Backend:** `server/services/ProfessorPaymentService.ts`, `server/routers/reportsRouters.ts`.

#### ✅ O que está funcionando:
1. **Cálculo Automático de Comissão:** Percentual configurável por professor sobre mensalidades pagas ou horas-aula realizadas.
2. **Extrato Detalhado do Professor:** Relatório mensal de aulas ministradas, comissões geradas e status de pagamento.
3. **Fechamento e Baixa da Folha:** Marcação de folha como paga com registro no fluxo de caixa.

---

### 3.5 MÓDULO: AUTOMAÇÕES, LEMBRETES & WHATSAPP
- **Rotas:** `/lembretes`, `/automacoes`, `/chatbot-fluxo`
- **Backend:** `server/automationJob.ts`, `server/routers/comunicacaoRouters.ts`, `server/utils/whatsapp.ts`, `server/webhooks/whatsapp.ts`.

#### ✅ O que está funcionando:
1. **Job Scheduler em Segundo Plano:** Executa a cada 1 minuto com trava de concorrência (`isAutomationRunning`).
2. **Gatilhos Automáticos Ativos:**
   - Lembrete de aula (24h e 1h antes).
   - Cobrança preventiva (X dias antes do vencimento).
   - Cobrança no dia do vencimento (HOJE) com link/chave PIX.
   - Cobrança de inadimplência (X dias após vencimento com cálculo de juros/multa).
   - Mensagem de aniversário do aluno.
   - Boas-vindas para novos alunos cadastrados.
   - Confirmação de recebimento de pagamento.
   - Lembrete de estudo diário.
   - Relatório diário de treinos para o professor.
3. **Roteamento Inteligente (Smart Routing):** Envio para aluno ou responsável financeiro com base na idade/configuração.
4. **Deduplicação Rigorosa (`refId`):** Garante que nenhuma mensagem seja reenviada duplicada no mesmo ciclo ou dia.
5. **Encoding 100% UTF-8:** Ícones e emojis (`💳`, `🎹`, `📅`, `✅`) sem corrupção mojibake.

---

### 3.6 MÓDULO: CONTRATOS & ASSINATURA DIGITAL
- **Rotas:** `/contratos`, `/aluno/contratos`
- **Backend:** `server/routers/contratosRouters.ts`, `server/services/contractService.ts`, `server/services/signature/`.

#### ✅ O que está funcionando:
1. **Templates de Contrato Personalizáveis:** Cláusulas dinâmicas com variáveis `{nome_aluno}`, `{valor}`, `{data}`, `{escola}`, etc.
2. **Contratos para Maiores e Menores de Idade:** Vinculação automática dos dados do responsável legal.
3. **Integração com Assinafy / Provedores de Assinatura:** Disparo de link para assinatura eletrônica com validade jurídica.
4. **Assinatura pelo Portal do Aluno:** Visualização do PDF e assinatura direta na interface do aluno.

---

### 3.7 MÓDULO: PORTAL DO ALUNO (MOBILE-FIRST)
- **Rotas:** `/aluno`, `/aluno/aulas`, `/aluno/agenda`, `/aluno/materiais`, `/aluno/exercicios`, `/aluno/progresso`, `/aluno/pagamentos`, `/aluno/perfil`, `/aluno/avisos`, `/aluno/contratos`, `/aluno/scanner`
- **Layout:** `components/StudentPortalLayout.tsx`.
- **Backend:** `server/routers/portalRouters.ts`.

#### ✅ O que está funcionando:
1. **Aulas & Presenças:** Histórico de frequência e próximas aulas agendadas.
2. **Financeiro do Aluno:** Visualização de faturas abertas, código PIX copia-e-cola e recibos de pagamento.
3. **Materiais & Exercícios:** Acesso a partituras, tablaturas, áudios e vídeos anexados pelo professor.
4. **Progresso & Metas:** Nível de evolução no instrumento, metas concluídas e tempo de estudo registrado.
5. **Avisos da Escola:** Mural de comunicados e novidades da instituição.

---

### 3.8 MÓDULO: INTELIGÊNCIA ARTIFICIAL & CHATBOT
- **Rotas:** `/ia`, `/base-conhecimento-ia`, `/chatbot-fluxo`
- **Backend:** `server/routers/aiRouters.ts`, `server/chatbotFlowRouter.ts`, `server/schoolAiRouter.ts`, `server/utils/gemini.ts`.

#### ✅ O que está funcionando:
1. **Assistente IA Executivo:** Geração de relatórios, análise de inadimplência e sugestão de planos de estudo.
2. **Base de Conhecimento RAG:** Upload de documentos da escola para respostas contextualizadas do chatbot.
3. **Chatbot Flow Builder:** Construtor visual de fluxos de atendimento automático via WhatsApp.

---

### 3.9 MÓDULO: NOTAS FISCAIS (NFS-e)
- **Rotas:** `/configuracoes` (Aba Fiscal)
- **Backend:** `server/fiscalRouter.ts`, `server/services/fiscal/FiscalService.ts`.

#### ✅ O que está funcionando:
1. **Integração FocusNFe:** Configuração de certificado digital, dados da empresa e código de serviço municipal.
2. **Emissão Automática Pós-Pagamento:** Geração e envio de NFS-e após confirmação da mensalidade.

---

### 3.10 MÓDULO: SUPER ADMIN & GESTÃO SAAS
- **Rotas:** `/master-panel`
- **Backend:** `server/superAdminRouter.ts`.

#### ✅ O que está funcionando:
1. **Gestão de Escolas e Planos:** Criação de organizações, limites de alunos, professores e armazenamento.
2. **Monitoramento de Assinaturas SaaS:** Integração com Asaas para cobrança das mensalidades do software.
3. **Controle de Acesso Exclusivo por ENV:** Isolamento de superusuários via variável de ambiente.

---

## ⚠️ 4. LIMITAÇÕES CONHECIDAS, ITENS MONITORADOS E O QUE NÃO ESTÁ ATIVO

1. **Testes Flaky em Execução Paralela Completa:**
   - 2 testes pontuais sofrem timeout quando a suíte inteira roda em paralelo com contenção de CPU na máquina de dev. Quando rodados isoladamente (`pnpm vitest run ...`), passam com 100% de sucesso.
2. **Gateway Mercado Pago PIX Direto:**
   - Links Mercado Pago geram checkout externo com sucesso. O Webhook de conciliação principal é focado no Asaas.
3. **Áudio Evolution Mobile Studio:**
   - Suporte e cheatsheet preparados na skill `@audioevolutionespecialista`, aguardando integração direta de exportação de tracks.

---

## 📋 5. PROTOCOLO OBRIGATÓRIO PARA ADICIONAR NOVAS FUNCIONALIDADES

Sempre que uma nova funcionalidade for planejada e implementada, o desenvolvedor ou IA **DEVE** seguir este checklist:

1. [ ] **Engenharia de Requisitos (`/prdspec`):** Definir o PRD detalhado antes do código.
2. [ ] **Implementação no Router de Domínio:** Nunca colocar endpoints no barrel `routers.ts`; usar `server/routers/{dominio}Routers.ts`.
3. [ ] **Padronização Financeira:** Moedas via `formatBRL`, juros via `BillingEngine`.
4. [ ] **Testes de Regressão:** Rodar `pnpm check` e `pnpm vitest run ...`.
5. [ ] **Auditoria Pré-Deploy (`/wrauditor`):** Validar integridade e ausência de breaking changes.
6. [ ] **Atualização deste PRD Master (`PRD_MASTER.md`):** Atualizar o status da funcionalidade de "Em Desenvolvimento" para "🟢 100% Funcional".
7. [ ] **Deploy via DevOpsMaster:** Executar commit, push e deploy com backup na VPS.
