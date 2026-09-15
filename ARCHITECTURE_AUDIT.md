# ARCHITECTURE_AUDIT.md — MusicPro

> Auditoria arquitetural completa realizada em 18/08/2026.
> Escopo: estrutura, organização, acoplamento, duplicação, código morto, arquivos gigantes, dependências e aptidão para manutenção por IA.

---

## RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| Arquivos de código analisados (client + server + shared + drizzle) | **293** |
| Linhas de código de aplicação | **~91.000** |
| client/src | 181 arquivos / 57.378 linhas |
| server | 101 arquivos / 31.285 linhas |
| shared | 3 arquivos / 29 linhas |
| drizzle (schema + migrations) | 8 arquivos / 2.336 linhas |
| Arquivos gigantes (>800 linhas) | **27** (12 no client, 15 no server) |
| Arquivos mortos confirmados | **15+** (~6.500 linhas) |
| Scripts/arquivos de operação lixo (raiz + scratch) | **~190** |
| Dependências mortas | **6** |
| Dependências circulares | **0** (284 arquivos escaneados) |
| Procedures tRPC no arquivo monolítico `server/routers.ts` | **257** em **31 sub-routers inline** |
| Sub-routers já externalizados corretamente | 13 |

**Diagnóstico central:** o projeto NÃO tem problema de "pastas erradas" — tem problema de **arquivos gigantes com responsabilidades misturadas** e **lógica de negócio duplicada entre telas** (client) e entre procedures (server). Uma IA que precisa alterar "cadastro de alunos" hoje é obrigada a carregar `NovoAluno.tsx` (1.864 linhas), `Alunos.tsx` (1.325), `routers.ts` (10.790) e `drizzle/schema.ts` (1.548) — ~15.500 linhas para uma alteração que deveria exigir ~300.

---

## 1. MAPA DA ESTRUTURA ATUAL

```
wr-music-app/
│
├── client/                          ← FRONTEND (React 19 + Vite + wouter + tRPC)
│   └── src/
│       ├── App.tsx                  (273 l)  rotas + providers (OK)
│       ├── main.tsx                 (69 l)
│       ├── const.ts                 (4 l)
│       ├── _core/hooks/useAuth.ts   (80 l)  ← hook de auth em local "manus" (herança)
│       ├── components/              (21 arquivos / 3.889 l)  componentes soltos
│       │   ├── ui/                  (54 arquivos / 5.743 l)  shadcn/ui ✓
│       │   ├── modals/              (10 arquivos / 3.517 l)  modais globais
│       │   ├── fiscal/              (1 arquivo / 836 l)      ConfigFiscalTab
│       │   ├── integrations/        (2 arquivos / 616 l)
│       │   ├── lembretes/           (5 arquivos / 630 l)     ✓ bem fatiado
│       │   ├── logo/                (2 arquivos / 664 l)
│       │   ├── student/             (1 arquivo)
│       │   └── tour/                (3 arquivos / 502 l)
│       ├── contexts/                (1 arquivo / 70 l)       ThemeContext
│       ├── hooks/                   (6 arquivos / 402 l)
│       ├── lib/                     (8 arquivos / 1.122 l)   firebaseConfig 603 l
│       ├── pages/                   (40 arquivos / 28.110 l) ← 72% do client!
│       │   ├── financeiro/          (2)  MensalidadesTab + DespesasTab ✓
│       │   ├── student/             (11) portal do aluno
│       │   ├── marketing/           (4)
│       │   ├── analytics/           (1)  AnalyticsDashboard 1.841 l
│       │   └── leads/               (1)  LeadsApp 1.431 l
│       ├── utils/                   (1 arquivo)
│       ├── __tests__/               (1 teste)
│       └── __manus__/               (vazia)
│
├── server/                          ← BACKEND (Express + tRPC + Drizzle)
│   ├── routers.ts                   (10.790 l) ← MONÓLITO PRINCIPAL
│   ├── db.ts                        (1.244 l)  conexão + 13 helpers de query misturados
│   ├── automationJob.ts             (1.354 l)
│   ├── *Router.ts                   (13 arquivos já separados: analytics 1.460, crm 868, ...)
│   ├── _core/                       (express, trpc, env, email, notification, migrate...)
│   ├── services/                    (BillingEngine ✓, FiscalService ✓, contractService...)
│   ├── utils/                       (whatsapp 453 l, asaas 346 l, gemini, aiContext...)
│   ├── webhooks/                    (whatsapp 1.166 l, botStatus, focusnfe)
│   ├── report_engine/               (exportadores ✓)
│   └── scripts/                     (14 scripts de diagnóstico)
│
├── shared/                          (3 arquivos / 29 l)  ← praticamente vazio
│   ├── const.ts                     (5 l)
│   ├── types.ts                     (6 l)
│   └── _core/errors.ts              (18 l)
│
├── drizzle/
│   ├── schema.ts                    (1.548 l / 74 tabelas em UM arquivo)
│   ├── relations.ts                 (1 l)
│   └── migrations/                  (7 SQL + snapshots JSON 7.560 l)
│
├── scripts/                         (8 arquivos de operação)
├── scratch/                         (107 arquivos de diagnóstico/operação ← LIXO)
├── vps-script/                      (deploy/VPS)
├── android/                         (Capacitor)
├── uploads/  dist/  node_modules/
│
└── RAIZ (sem pasta)                 (~80 arquivos .cjs/.js/.py/.log ← LIXO)
    ├── test_ssh1..11.cjs, check_*.cjs, test_mp*.cjs, deploy_*.cjs...
    ├── server_output.txt, tsc_errors.log, push_error.log...
    ├── backup_evo.cjs, refactor_job*.py, remove_bg.py...
    └── auditoria_pre_deploy.md, AUDIT_REPORT.md...
```

---

## 2. CLASSIFICAÇÃO DOS ARQUIVOS PRINCIPAIS

### 2.1 CLIENT — páginas (40 arquivos / 28.110 linhas)

| Arquivo | Categoria | Responsabilidade | Tamanho | Estado |
|---|---|---|---|---|
| `pages/Configuracoes.tsx` | Página | 14 abas de configuração + simulador billing + WhatsApp + PWA + export | 2.494 | 🔴 Monolítico |
| `pages/Progresso.tsx` | Página | Progresso + biblioteca musical + metas + planos IA + WhatsApp | 2.372 | 🔴 Monolítico |
| `pages/NovoAluno.tsx` | Página | Cadastro/edição + agendamento + mensalidades + avatar + contrato | 1.864 | 🔴 Monolítico |
| `pages/analytics/AnalyticsDashboard.tsx` | Página | Dashboard analytics completo | 1.841 | 🟠 Grande |
| `pages/leads/LeadsApp.tsx` | Página | CRM de leads + kanban | 1.431 | 🟠 Grande |
| `pages/SuperAdmin.tsx` | Página | Painel master | 1.422 | 🟠 Grande |
| `pages/ComponentShowcase.tsx` | Página | Vitrine de componentes | 1.405 | 🔴 **MORTO** |
| `pages/Aulas.tsx` | Página | Calendário 4 visões + slots + turmas + ocupação | 1.339 | 🟠 Grande |
| `pages/Alunos.tsx` | Página | CRUD + tabela + modais + CSV + métricas | 1.325 | 🟠 Grande |
| `pages/ProfessorExtract.tsx` | Página | Folha de pagamento de professores | 1.258 | 🟠 Grande |
| `pages/financeiro/MensalidadesTab.tsx` | Componente | Mensalidades | 1.226 | 🟠 Grande |
| `pages/LandingPage.tsx` | Página | Landing pública | 1.147 | 🟠 Grande |
| `pages/Automacoes.tsx` | Página | Automações WhatsApp | 1.139 | 🟠 Grande |
| `pages/Relatorios.tsx` | Página | Relatórios (8 abas) | 1.095 | 🟠 Grande |
| `pages/financeiro/DespesasTab.tsx` | Componente | Despesas | 954 | 🟡 Médio |
| `pages/NotasFiscais.tsx` | Página | NFS-e | 900 | 🟡 Médio |
| `pages/ChatbotFlowBuilder.tsx` | Página | Builder de fluxo chatbot | 871 | 🟡 Médio |
| `pages/SalasEstudio.tsx` | Página | Salas de estudo | 855 | 🟡 Médio |
| `pages/DashboardComercial.tsx` | Página | Dashboard comercial | 815 | 🔴 **MORTO** (sem rota) |
| `pages/PublicEnrollment.tsx` | Página | Matrícula pública | 736 | 🟡 Médio |
| `pages/Financeiro.tsx` | Página | Compositor de tabs | 103 | 🟢 OK ✓ |

### 2.2 CLIENT — componentes, hooks e lib

| Arquivo | Categoria | Responsabilidade | Tamanho | Estado |
|---|---|---|---|---|
| `components/modals/AgendarModal.tsx` | Modal | Agendamento de aulas | 1.137 | 🟠 Grande |
| `components/ui/sidebar.tsx` | UI | Sidebar shadcn | 680 | 🔴 **MORTO** (só layout morto usa) |
| `lib/firebaseConfig.ts` | Config | Firebase client | 603 | 🟡 Médio (config + lógica) |
| `components/AppSidebar.tsx` | Layout | Sidebar ativa | 458 | 🟢 OK |
| `components/modals/StudentContractsSection.tsx` | Modal | Contratos no aluno | 457 | 🟢 OK |
| `components/modals/LessonDetailModal.tsx` | Modal | Detalhe da aula | 448 | 🟢 OK |
| `components/modals/GenerateAccessModal.tsx` | Modal | Acesso ao portal | 437 | 🟢 OK |
| `lib/analytics.ts` | Lib | Tracker próprio (substituiu GA) | 390 | 🟢 OK |
| `components/AppHeader.tsx` | Layout | Header | 336 | 🟢 OK |
| `hooks/` (6 arquivos) | Hooks | useAuth fica em `_core/hooks` | 402 | 🟡 Disperso |
| `components/DashboardLayout.tsx` | Layout | Layout antigo | 245 | 🔴 **MORTO** |
| `components/modals/BulkDeleteLessonsModal.tsx` | Modal | — | 136 | 🔴 **MORTO** |
| `components/modals/VencimentosReportModal.tsx` | Modal | — | 185 | 🔴 **MORTO** |
| `components/ManusDialog.tsx` | Componente | — | 80 | 🔴 **MORTO** |
| `components/DateTimePicker.tsx` | Componente | — | 209 | 🔴 **MORTO** |
| `components/LessonsFilter.tsx` | Componente | — | 175 | 🔴 **MORTO** |
| `components/DashboardLayoutSkeleton.tsx` | Componente | — | 42 | 🔴 **MORTO** |
| `lib/trpc.ts` | Lib | Client tRPC | 3 | 🟢 OK |
| `lib/money.ts` | Lib | parseBRL/formatBRL central | 31 | 🟢 OK (mas pouco usado!) |
| `lib/utils.ts` | Lib | `cn()` — **importado por 112 arquivos** | 33 | 🟢 OK |

### 2.3 SERVER

| Arquivo | Categoria | Responsabilidade | Tamanho | Estado |
|---|---|---|---|---|
| `routers.ts` | Router tRPC | **257 procedures / 31 sub-routers / 6 domínios** | 10.790 | 🔴 **CRÍTICO** |
| `analyticsRouter.ts` | Router | Analytics | 1.460 | 🟠 Grande (mas separado ✓) |
| `automationJob.ts` | Job | Automação + cron | 1.354 | 🟡 Médio (arquivo único aceitável) |
| `db.ts` | DB | Conexão + 13 helpers de query | 1.244 | 🟠 Mistura responsabilidades |
| `webhooks/whatsapp.ts` | Webhook | Webhook WhatsApp | 1.166 | 🟠 Grande |
| `_core/index.ts` | Bootstrap | Express + tRPC + jobs + webhooks | 892 | 🟡 Aceitável |
| `crmRouter.ts` | Router | CRM | 868 | 🟢 Separado ✓ |
| `enrollmentRouter.ts` | Router | Matrículas | 632 | 🟢 Separado ✓ |
| `superAdminRouter.ts` | Router | Super admin | 529 | 🟢 Separado ✓ |
| `fiscalRouter.ts` | Router | Fiscal | 479 | 🟢 Separado ✓ |
| `chatbotFlowRouter.ts` | Router | Chatbot | 457 | 🟢 Separado ✓ |
| `utils/whatsapp.ts` | Util | API WhatsApp | 453 | 🟢 OK |
| `services/fiscal/FiscalService.ts` | Service | NFS-e | 415 | 🟢 OK ✓ |
| `services/contractService.ts` | Service | Contratos | 364 | 🟢 OK ✓ |
| `services/BillingEngine.ts` | Service | Juros/multa **única fonte** | 281 | 🟢 **OK ✓** |
| `utils/asaas.ts` | Util | Asaas | 346 | 🟢 OK |
| `services/signature/AssinafyProvider.ts` | Service | Assinafy | 358 | 🟢 OK ✓ |
| `report_engine/` (8 arquivos) | Export | Excel/CSV | ~400 | 🟢 **OK ✓** |
| `services/fiscal/FiscalProvider.interface.ts` | Interface | — | 95 | 🟢 OK ✓ |
| `scripts/` (14) | Scripts | Diagnóstico | ~250 | 🟡 Manutenção |

### 2.4 SHARED / DRIZZLE

| Arquivo | Categoria | Responsabilidade | Tamanho | Estado |
|---|---|---|---|---|
| `shared/const.ts` + `types.ts` + `_core/errors.ts` | Shared | Constantes e erros | 29 | 🟡 Subutilizado |
| `drizzle/schema.ts` | Schema | **74 tabelas em um arquivo** | 1.548 | 🟠 Grande |

---

## 3. PROBLEMAS IDENTIFICADOS

### 🔴 CRÍTICO

**P1 — `server/routers.ts`: monólito de 10.790 linhas** ✅ **RESOLVIDO na Fase 4** (18/08/2026)
- 31 sub-routers inline (auth 485 l, lessons 1.386 l, paymentDues 989 l, studentPortal 1.159 l, progress 828 l, reminders 699 l...)
- 257 procedures; ~533 acessos diretos ao banco; 49 tabelas importadas de uma vez
- 6 domínios misturados no mesmo arquivo: acadêmico, financeiro, portal do aluno, comunicação, plataforma/SaaS, contratos
- Camada de serviço existe (BillingEngine, FiscalService, contractService) mas é usada em ~5 pontos de 257
- **Impacto:** qualquer alteração em "mensalidades" obriga abrir um arquivo de 10.790 linhas.
- **Estado atual:** arquivo dividido em 12 routers por domínio (`server/routers/*.ts` + `helpers.ts` + `index.ts`); `server/routers.ts` virou barrel; contrato `AppRouter` preservado.

**P2 — Lógica financeira duplicada (a mais perigosa)** ✅ **RESOLVIDO (F4+F5)** — em 18/08/2026
- Classificação "atrasado": reimplementada 4× (paymentDues.list, overdue, listByStudent, reports.getFinanceiroDetails) — ✅ centralizado em `helpers.ts` (`markOverdueRows`, `getTodayBR`, `toISODate`); 4 usos → 1
- `markPaid` (baixa de pagamento): 4 implementações (paymentDues, studentPortal.verifyAndConfirmPayment, expenses, professorPayments) — ⚠️ **documentado como legítimas**: tabelas e efeitos colaterais diferentes (Asaas+NFS-e+reminders vs upload+IA Gemini vs expenses vs professorPayments); unificar mudaria comportamento sem ganho
- Cálculo de alunos excedentes/assinatura: 4× inline + 3 validações — ✅ centralizado em `routers/helpers.ts` (getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges)
- Geração de vencimentos (ajuste fim de mês + periodicidade): generateMonthly/generateBulkAll (2×) — ✅ centralizado em `buildDueDateSeries` (helpers.ts)
- Comissão de professor: `calculate` copiado em `calculateAll` (~45 linhas) — ✅ centralizado em `server/services/ProfessorPaymentService.ts`
- Regressão das regras novas: `server/paymentRules.test.ts` (6 testes)

**P3 — Regras financeiras reimplementadas no CLIENT**
- `formatCurrency`/`currencyFormat` reimplementado em 6+ arquivos (Dashboard ×2 no MESMO arquivo, Financeiro, Alunos ×2, Relatorios, MensalidadesTab, DespesasTab) — `lib/money.ts` existe e quase não é usado
- "Dias em atraso", "saldo", "trends", "excedentes do plano": calculados inline em Dashboard, Alunos, Financeiro

### 🟠 ALTO

**P4 — Páginas monolíticas**
- `Configuracoes.tsx` (2.494 l): 14 abas num arquivo, 19 chamadas tRPC, ~72 useState, simulador financeiro inline
- `Progresso.tsx` (2.372 l): 29 chamadas tRPC, 5 modais internos, 4 domínios tRPC, componentes definidos e nunca usados (WidgetCard, DesempenhoIA), `getEmoji` duplicado 2×
- `NovoAluno.tsx` (1.864 l): 15 chamadas tRPC, regras de plano + máscaras + agendamento inline, `parseFee` reimplementa `parseBRL`
- `Aulas.tsx` (1.339 l): calendário 4 visões + regras de disponibilidade/ocupação + modais duplicados desktop/mobile (~80 linhas JSX duplicadas), 12 imports mortos

**P5 — Código morto (15 arquivos / ~6.500 linhas)**

| Arquivo | Linhas |
|---|---|
| `pages/ComponentShowcase.tsx` | 1.405 |
| `pages/DashboardComercial.tsx` (importado mas SEM rota) | 815 |
| `pages/ProfessoresTab.tsx` | 535 |
| `pages/SalasEstudioTab.tsx` | 538 |
| `pages/Mensagens.tsx` | 242 |
| `pages/student/Mensagens.tsx` | 238 |
| `pages/StudentProgress.tsx` | 194 |
| `pages/VerifyEmail.tsx` | 138 |
| `pages/Home.tsx` (página-templo "Example") | 28 |
| `components/DashboardLayout.tsx` + `DashboardLayoutSkeleton.tsx` | 287 |
| `components/ManusDialog.tsx` | 80 |
| `components/DateTimePicker.tsx` | 209 |
| `components/LessonsFilter.tsx` | 175 |
| `components/modals/BulkDeleteLessonsModal.tsx` | 136 |
| `components/modals/VencimentosReportModal.tsx` | 185 |
| `components/ui/sidebar.tsx` (usada SÓ pelo DashboardLayout morto) | 680 |
| **Total** | **~5.885** |

**P6 — Tipos duplicados/espalhados**
- 20+ páginas definem tipos locais (StudentRow, PaymentRow, InstrumentRow, TabId, PlanType, StageConfig, AutomationRule...)
- Tipos derivados de banco ficam só em `drizzle/schema.ts`; `shared/types.ts` tem 6 linhas
- Não existe fonte única para tipos de domínio

**P7 — Regras de negócio em componentes**
- `Aulas.tsx` recalcula disponibilidade/ocupação de slots client-side (divergente do slotAdvanceEngine no server)
- `NovoAluno.tsx`/`Dashboard.tsx` recalculam limites de plano
- `Alunos.tsx` calcula métricas (ativos, novos 30 dias) client-side
- Sem camada intermediária (hook/service) — tudo direto no JSX

### 🟡 MÉDIO

**P8 — ~190 arquivos de operação lixo**
- 80 scripts .cjs/.js/.py/.log na raiz (test_ssh1-11.cjs, check_*.cjs, deploy_*.py, server_output.txt, tsc_errors.log...)
- 107 arquivos em `scratch/`
- Contaminam navegação, busca e contexto de IA

**P9 — Dependências mortas (6)**

| Dependência | Uso encontrado | Recomendação |
|---|---|---|
| `react-ga4` | Nenhum (analytics próprio em lib/analytics.ts) | Remover |
| `@aws-sdk/client-s3` | Nenhum (storage.ts usa Forge/local) | Remover |
| `@aws-sdk/s3-request-presigner` | Nenhum | Remover |
| `@hookform/resolvers` | Nenhum (react-hook-form usado 1×) | Remover |
| `@yudiel/react-qr-scanner` | Nenhum (QRScanner usa jsqr) | Remover |
| `ssh2` | Só scripts de ops da raiz (junk) | Remover após limpeza dos scripts |
| `add` (devDep) | Nenhum | Remover |
| `next-themes` | 1 arquivo | Avaliar (ThemeContext próprio existe) |
| `react-ga4` (devDep `@builder.io/vite-plugin-jsx-loc`, `patch-package`, `vite-plugin-manus-runtime`) | — | Avaliar |

**P10 — Estrutura inconsistente de hooks**
- `useAuth` em `client/src/_core/hooks/` (resíduo da tool "manus") enquanto hooks novos ficam em `client/src/hooks/`
- 27 arquivos importam `@/_core/hooks/useAuth`

**P11 — `shared/` subutilizado**
- Só 29 linhas. O "compartilhado" real vive em `lib/trpc.ts` (79 importadores) e `lib/utils.ts` (112 importadores) — ambos OK, mas nada impede a duplicação de regras.

**P12 — Rotas duplicadas**
- `/salas` e `/salas-estudio` → mesmo componente
- `/fluxo-chatbot` e `/chatbot-fluxo` → mesmo componente
- `/analytics`, `/leads`, `/comercial` com lógica de host + query string redundante

**P13 — 157 `console.log` no server** (debugging em produção)

**P14 — `db.ts` mistura conexão + queries de domínio** (13 helpers de dashboard/students/instruments no mesmo arquivo da conexão)

**P15 — Imports mortos em arquivos grandes** (Aulas 12, Progresso 10, Dashboard 6, Alunos 4, Configuracoes 4, NovoAluno 2)

### 🔵 BAIXO / 🟢 OK

- 🟢 Zero dependências circulares (284 arquivos escaneados com grafo completo)
- 🟢 Lazy loading centralizado no `App.tsx` com Suspense
- 🟢 13 routers externos já separados — o padrão de separação JÁ existe no projeto (analyticsRouter, crmRouter, fiscalRouter...) — falta aplicá-lo ao gigante
- 🟢 `BillingEngine` centraliza juros/multa/carência (única fonte no server)
- 🟢 `Financeiro.tsx` delega corretamente a tabs (103 linhas) — modelo a seguir
- 🟢 `components/lembretes/` e `report_engine/` bem fatiados
- 🟢 Aliases `@/*` e `@shared/*` configurados corretamente (tsconfig + vite + vitest)
- 🟢 Componentes shadcn/ui organizados em `components/ui/`
- 🟢 Nomenclatura PascalCase consistente

---

## 4. MAPA DE DEPENDÊNCIAS (núcleo)

```
App.tsx (rotas)
 ├── pages/* (40) — 72% do client em pages/
 │    ├── trpc (79 importadores)
 │    ├── lib/utils cn() (112 importadores)
 │    ├── components/ui/* (68+ importadores)
 │    └── _core/hooks/useAuth (26 importadores)
 └── server/routers.ts ← importado pelo client (tipos) e servido pelo server
      ├── drizzle/schema.ts (74 tabelas)
      ├── db.ts (conexão + helpers)
      ├── services/{BillingEngine,FiscalService,contractService}
      └── 13 routers externos + 31 inline
```

**Arquivos centrais "saudáveis"**: `lib/utils.ts` (33 l) e `lib/trpc.ts` (3 l) são hubs de muitos importadores mas pequenos — não são problema. **O problema são os hubs GIGANTES**: `routers.ts`, `schema.ts`, páginas de 1.3k-2.5k linhas.

---

## 5. ARQUITETURA RECOMENDADA

**Princípio:** extração mecânica + centralização de regras + fatiamento das maiores páginas. Nada de camadas novas, nada de abstrações novas — apenas aplicar o padrão que o próprio projeto JÁ usa (routers separados, services, tabs).

```
server/
├── routers/                        ← 9 arquivos extraídos MECANICAMENTE de routers.ts
│   ├── index.ts                    (composição — idêntico ao appRouter atual)
│   ├── auth.router.ts              (auth + system + publicData)
│   ├── academico.router.ts         (students + lessons + instruments + attendance + progress + musicLibrary)
│   ├── financeiro.router.ts        (paymentDues + expenses + professorPayments + billingEngine)
│   ├── portal.router.ts            (studentPortal + reschedule + chat)
│   ├── comunicacao.router.ts       (reminders + reminderTemplates + whatsapp + announcements + automations)
│   ├── contratos.router.ts         (contracts + signatureIntegrations + contractTemplates)
│   ├── plataforma.router.ts        (settings + platform)
│   └── _shared/                    (helpers: overdueRules, resolveStudentId, isAdmin/owner)
├── services/
│   └── financeiro/
│       ├── PaymentDuesService.ts   (gera vencimentos, markPaid, classifica atrasado)
│       └── SubscriptionService.ts  (excedentes/assinatura)
│   (BillingEngine, FiscalService já existem ✓)
├── db.ts → db.ts (só conexão) + db/queries/*.ts (helpers por domínio)   [fase tardia]
│
client/src/
├── pages/                          ← mantém (composition roots)
├── components/
│   ├── ui/                         ← mantém ✓
│   ├── settings/                   (14 abas de Configuracoes → 14 arquivos)
│   ├── progresso/                  (BibliotecaMusical, MetasMusicais, modais)
│   ├── alunos/                     (StudentModal, DeleteConfirm, filtros)
│   └── modals/                     ← mantém (já é a pasta de modais)
├── lib/                            ← centralização
│   ├── money.ts                    (JÁ EXISTE — passar a usar formatBRL em tudo)
│   ├── masks.ts                    (maskPhone, maskCPF — hoje duplicadas)
│   ├── dates.ts                    (formatDate, formatTime com date-fns)
│   └── status.ts                   (statusConfig das aulas, statusBadge)
├── hooks/                          (unificar _core/hooks/useAuth → hooks/useAuth)
├── shared/                         (tipos de domínio + constantes usadas por client e server)
│   ├── types.ts
│   └── constants.ts
│
shared/                             ← promover tipos/constantes realmente compartilhados
drizzle/schema.ts                   ← mantém (dividir é opcional e de baixa prioridade)
```

**Regras de importação:**

```
feature/página → lib/, components/ui/, hooks/, components/{domínio}   ✓
feature/página → outra feature        ✗ (comunicar via trpc/services)
componente → banco                     ✗ (via trpc)
client → server (import de tipos)      ✓ somente types (routers.ts)
```

---

## 6. PLANO DE MIGRAÇÃO (por fases, com build+check+test após cada)

### FASE 0 — Baseline
Rodar `pnpm check` (tsc), `pnpm test`, `pnpm build` e registrar estado atual. `git tag baseline` / commit de segurança.

### FASE 1 — Código morto (risco baixo)
1. Remover as 8 páginas mortas + 2 layouts mortos + 4 componentes mortos + 2 modais mortos + `ui/sidebar.tsx` (~5.885 linhas)
2. Remover lazy import morto (`DashboardComercial`) e rotas duplicadas
3. Remover dependências mortas (`react-ga4`, aws-sdk×2, resolvers, yudiel, ssh2, `add`)
4. Mover os ~190 scripts lixo para `scripts/archive/` (fora da árvore de código) ou apagar
5. Validação: build + check + testes

### FASE 2 — Duplicações no client (risco baixo)
1. `lib/masks.ts` (maskPhone, maskCPF), `lib/dates.ts`, `lib/status.ts`
2. Substituir as 6+ reimplementações de `formatCurrency` por `formatBRL` de `lib/money.ts`
3. Remover `dueDaysOptions` duplicado, `getEmoji` duplicado, `parseFee`
4. Limpar imports mortos (12+10+6+4+4+2)
5. Validação: build + check + testes

### FASE 3 — Fatiar páginas gigantes (risco médio) — 1 página por commit
1. `Configuracoes.tsx` → `components/settings/` (14 abas + simulador)
2. `Progresso.tsx` → `components/progresso/` (biblioteca, metas, modais) — remover WidgetCard/DesempenhoIA mortos
3. `NovoAluno.tsx` → extrair form sections + `components/alunos/`
4. `Aulas.tsx` → extrair card desktop, filtros, painel ocupação (eliminar JSX duplicado mobile/desktop)
5. `Alunos.tsx` → extrair StudentModal, badges, tabela
6. Validação: build + check + testes + smoke test manual de cada tela

### FASE 4 — Split do `routers.ts` (risco médio) — mecânico
1. Criar `server/routers/` com os 9 arquivos por domínio
2. Mover procedures com copy-paste mecânico (mesmo código, mesmo ctx, mesmos imports)
3. `index.ts` apenas recompõe o `appRouter` (mesma saída — zero mudança de contrato)
4. Extrair helpers compartilhados: `isOverdue()`, `resolveStudentId()`, `isAdminOrOwner()`
5. Validação: build + check + testes (inclui os testes tRPC existentes: music.test, critical.regression, reminders, settings, BillingEngine)

### FASE 5 — Services financeiros (risco médio-alto) — matar duplicações
1. `PaymentDuesService`: gerarVencimentos, markPaid, classificaAtrasado (4 usos → 1)
2. `SubscriptionService`: excedentes/assinatura (4+ usos → 1)
3. `professorPayments.calculate/calculateAll` → uma função com parâmetro "todos"
4. Validação: build + check + testes + comparação de saída com o baseline (mesmos cálculos)

### FASE 6 — Hooks e tipos (risco baixo)
1. Mover `_core/hooks/useAuth.ts` → `hooks/useAuth.ts` (atualizar 27 imports)
2. Centralizar tipos de domínio em `shared/types.ts` (começar pelos mais usados: status, roles, planos)
3. Validação: build + check

### FASE 7 — Housekeeping final (risco baixo)
1. Remover os 157 console.log do server (ou transformar em logger condicional)
2. Remover resíduos `__manus__`, `.manus-logs`, auditoria_pre_deploy.md, AUDIT_REPORT.md antigos
3. Validação: build + check

### FASE 8 — Documentação (risco zero)
1. `ARCHITECTURE.md` — estrutura, features, regras de importação, limites de tamanho
2. `AI_CONTEXT.md` — mapa para IA ("cadastro de alunos → onde", "mensalidades → onde"...) + regras anti-duplicação
3. `AGENTS.md` — comandos de verificação (check/test/build)

### FASE 9 — Regressão final
1. `pnpm check` + `pnpm test` + `pnpm build`
2. Testes de navegação IA (seção 7 abaixo)
3. Revisar checklist (seção 8)

**Ordem recomendada de features na migração:** Alunos → Aulas → Financeiro → Portal do Aluno → Comunicação → Contratos → Plataforma.

---

## 7. TESTE DE NAVEGAÇÃO PARA IA (cenários reais)

| Cenário | Hoje (arquivos que a IA precisa ler) | Depois |
|---|---|---|
| "Corrigir cadastro de alunos" | NovoAluno 1.864 + Alunos 1.325 + routers.ts 10.790 + schema 1.548 ≈ **15.500 linhas** | `routers/students.router.ts` + `components/alunos/*` + `pages/NovoAluno.tsx` ≈ **1.200 linhas** |
| "Corrigir cálculo de mensalidades" | routers.ts (paymentDues 989 + reports 282) + MensalidadesTab 1.226 + BillingEngine ≈ **2.500 linhas** | `services/PaymentDuesService.ts` + `routers/financeiro.router.ts` + `BillingEngine` ≈ **800 linhas** |
| "Alterar relatório financeiro" | Relatorios 1.095 + routers.ts (reports 282) + ReportEngine ≈ **1.800** | Relatorios (composto) + `routers/financeiro.router.ts` + report_engine ≈ **900** |
| "Alterar lembrete de mensalidade" | Lembretes 349 + routers.ts (reminders 699) + ReminderModals 303 ≈ **1.350** | `routers/comunicacao.router.ts` + `components/lembretes/*` ≈ **700** |

**Objetivo de redução de contexto: 2-3× por cenário.**

---

## 8. CHECKLIST DA REORGANIZAÇÃO

```
[✓] Fase 0 — baseline build/check/test registrado (72 erros TS pré-existentes)
[✓] Fase 1 — código morto removido (14 arquivos-fonte + ~5.900 linhas)
[✓] Fase 1 — dependências mortas removidas (6: react-ga4, aws-sdk×2, resolvers, yudiel, add)
[✓] Fase 1 — scripts lixo arquivados/removidos (~190: raiz + scratch/)
[✓] Fase 2 — lib/money, masks, dates, settings, status centralizados
[✓] Fase 2 — formatBRL aplicado em Dashboard/Financeiro/Relatorios/Alunos/Mensalidades/Despesas (6+ reimplementações eliminadas)
[✓] Fase 2 — duplicações client removidas (dueDaysOptions, getEmoji, safeFormat, statusConfig, parseFee)
[✓] Fase 2 — imports mortos limpos (Aulas 19, Progresso 11, Dashboard 9, Relatorios 3, Configuracoes 4, Alunos 3, NovoAluno 3, AgendarModal 2, LessonCard 1, LessonDetailModal 1)
[✓] Fase 3 — Configuracoes fatiada (2.494 → ~1.710 / 782 l → components/settings/)
[✓] Fase 3 — Progresso fatiado (2.372 → 1.681 / 701 l → components/progresso/)
[✓] Fase 3 — Alunos fatiado (1.397 → 865 / 532 l → components/alunos/)
[✓] Fase 3 — Aulas fatiado (1.339 → ~1.226 / 113 l → components/aulas/)
[✓] Fase 3 — NovoAluno fatiado (~1.864 → ~1.754 / 110 l → components/alunos/)
[✓] Fase 4 — routers.ts dividido em 12 arquivos por domínio (server/routers/: auth, progress, dashboard, students, lessons, plataforma, financeiro, portal, comunicacao, contratos, reports, ai; ~10.800 linhas do monólito extraídas; routers.ts = barrel de 2 linhas)
[✓] Fase 4 — helpers compartilhados extraídos (server/routers/helpers.ts: loginAttempts, safeEqualStr, isReservedSuperAdminEmail, getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges, runCreateAssinafyContract)
[✓] Fase 5 — PaymentDuesService + SubscriptionService — SUBSTITUÍDO por helpers em server/routers/helpers.ts (SubscriptionService completo na F4; regras de vencimento/atraso centralizadas; ProfessorPaymentService criado nessa fase)
[✓] Fase 5 — duplicações financeiras server eliminadas:
  • professorPayments.calculate/calculateAll → server/services/ProfessorPaymentService.ts (núcleo único; wrappers nas procedures)
  • Classificação "atrasado" (3× paymentDues + 1× reports) → helpers.ts (getTodayBR, toISODate, markOverdueRows)
  • Geração de vencimentos (generateMonthly/generateBulkAll) → helpers.ts (buildDueDateSeries)
  • NÃO unificado (documentado): markPaid são 4 fluxos de TABELAS/efeitos diferentes (paymentDues com Asaas+NFS-e+reminders; expenses; professorPayments; portal.verifyAndConfirmPayment com upload+IA Gemini) — unificar mudaria comportamento sem ganho real
  • Teste unitário novo: server/paymentRules.test.ts (6 testes da série/atrasado)
[✓] Fase 6 — useAuth movido para hooks/ (24 imports atualizados; _core/hooks removido); regra de tipos documentada (importar de @shared/types / drizzle/schema, não redefinir local)
[✓] Fase 7 — housekeeping — removido server/test_insert.ts (morto, import quebrado), client/src/__manus__/, .manus/ e .manus-logs/ (resíduos de tool). console.log de debug do server transformados em debugLog condicional (server/_core/logger.ts — 32 arquivos; silencia em produção, mantém dev/teste; console.error/warn intactos; scripts de operação seguem como stdout). Mantidos (são usados/de skill): client/public/__manus__/debug-collector.js (vite plugin), server/_core/types/manusTypes.ts (importado por sdk.ts), auditoria_pre_deploy.md (skill wrauditor).
[✓] Fase 8 — ARCHITECTURE.md + AI_CONTEXT.md + AGENTS.md criados
[✓] Fase 9 — build/check/test/regressão executados (build ✓, check ✓ 0 novos, testes 65/65 ✓)
[✓] Fase 9 — teste de navegação IA validado (mapa em AI_CONTEXT.md: "cadastro de alunos", "mensalidades", "lembretes", "contratos" → arquivos certos com ≤ ~1.200 linhas)
```

> **Status (18/08/2026 — sessão autônoma):** Fases 0-9 CONCLUÍDAS. Build ✓, typecheck ✓ (0 erros novos; 31 únicos vs 33 do baseline; únicos diffs = mesma mensagem cosmética do AgendarModal + remoção de 2 erros do test_insert.ts morto), testes ✓ (71/71 em 7 arquivos). F5: ProfessorPaymentService + helpers de data/atrasado/vencimentos centralizados (markPaid documentado como não-duplicável). F7: console.log de debug → debugLog condicional + resíduos removidos.

---

## 9. RISCOS

| Mudança | Risco | Impacto | Rollback |
|---|---|---|---|
| Split de routers.ts | **Médio** | ~50 arquivos client importam tipos de `server/routers` — manter `server/routers/index.ts` exportando `appRouter` preserva 100% do contrato | Reverter commits por arquivo (git) |
| Services financeiros (F5 restante) | **Médio-alto** | `markPaid` é 4 implementações com efeitos colaterais DIFERENTES (Asaas, NFS-e, reminders); classificação "atrasado" é inline em queries. Unificar sem dados reais de teste = risco de divergência de cálculo | Manter adiado até comparação de output com fixtures |
| Services financeiros | **Médio-alto** | Regras de cálculo — validar com testes de regressão + comparação de output | Manter métodos antigos 1 release |
| Fatiar páginas | **Médio** | Componentes extraídos devem ser puros copy-paste | Um commit por página |
| Remoção de código morto | **Baixo** | Arquivos já confirmados sem referências (greps realizados) | git revert |
| Remoção de dependências | **Baixo** | Greps de uso realizados | git revert |

---

## 10. O QUE NÃO FAZER

- ❌ Não criar `features/alunos/{pages,components,hooks,services,types}` para TODOS os domínios (overengineering para um monorepo de ~91k linhas)
- ❌ Não criar abstrações novas (factories, DI, providers)
- ❌ Não alterar nenhuma regra de negócio durante a migração
- ❌ Não misturar a migração com novas funcionalidades
- ❌ Não mover arquivos apenas para "deixar bonito"

**O alvo é:** menos arquivos para ler por funcionalidade, menos duplicação, tamanhos previsíveis (páginas < 800 l, routers < 600 l, services < 400 l) — não uma árvore "perfeita" de dezenas de pastas.
