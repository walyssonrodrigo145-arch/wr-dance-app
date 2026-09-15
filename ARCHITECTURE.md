# ARCHITECTURE.md — MusicPro

> Visão geral da arquitetura do projeto. Complementa `ARCHITECTURE_AUDIT.md` (diagnóstico histórico) e `AI_CONTEXT.md` (mapa para IA).
> Regra de ouro: **nada que está aqui pode estar errado** — se a estrutura mudar, atualize este arquivo.

## Stack

- **Frontend**: React 19 + Vite + wouter (rotas) + Tailwind + shadcn/ui + tRPC client
- **Backend**: Node + Express + tRPC (`@trpc/server` v11) + Drizzle ORM (Postgres)
- **Compartilhado**: `shared/` (constantes e tipos exportados pelo schema)
- **Pagamentos**: Asaas (assinaturas/boletos/PIX) + Mercado Pago + InfinitePay (checkout hospedado, Pix taxa zero/Cartão 12x — `utils/infinitepay.ts`, webhook revalida via `payment_check` pois a API não assina o webhook); **NFS-e** via FocusNFe/fiscal
- **WhatsApp**: API WhatsApp multi-sessão (Baileys) em `server/utils/whatsapp.ts`
- **Infra**: VPS (deploy em `vps-script/`), Firebase (push), Capacitor Android

## Estrutura

```
client/src/
├── pages/                  # Páginas = composição raiz (tabs/módulos se tornam componentes por domínio)
│   ├── financeiro/  student/  marketing/  analytics/  leads/
├── components/
│   ├── ui/                 # shadcn/ui (primitivos) — NÃO colocar lógica de negócio
│   ├── modals/             # Modais globais reutilizáveis
│   ├── settings/           # Abas de Configuracoes (extraídas da página)
│   ├── progresso/          # Biblioteca musical, metas, observações (extraídas da página)
│   ├── aulas/              # LessonCard, dias, configs de status
│   ├── alunos/             # StudentModal, PortalAccessCard, badges, delete-confirm
│   ├── fiscal/  integrations/  lembretes/  logo/  student/  tour/
├── hooks/                  # Hooks de dados (ex.: useAuth — fonte única)
├── lib/                    # Utilidades puras DOMINANTES: money, masks, dates, settings, status, utils(cn), trpc
├── contexts/               # ThemeContext
└── App.tsx                 # Rotas + providers + lazy loading (única central de rotas)

server/
├── routers.ts              # BARREL: re-exporta appRouter (mantém contrato com o client)
├── routers/                # Routers por domínio (split do monólito — Fase 4)
│   ├── index.ts            # composição do appRouter (mesmas chaves do antigo monólito)
│   ├── helpers.ts          # regras financeiras compartilhadas: assinatura/excedentes (getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges), contratos (runCreateAssinafyContract), vencimentos (buildDueDateSeries), atrasado (markOverdueRows/getTodayBR/toISODate), gateway ativo (resolveActivePaymentGateway), idempotência de webhooks (registerWebhookEventOnce), segurança (safeEqualStr, isReservedSuperAdminEmail) + loginAttempts
│   ├── authRouters.ts      # publicData + system + auth
│   ├── progressRouters.ts  # progress + musicLibrary
│   ├── dashboardRouters.ts # dashboard
│   ├── studentsRouters.ts  # students + instruments
│   ├── lessonsRouters.ts   # lessons + attendance + reschedule
│   ├── plataformaRouters.ts# settings + platform
│   ├── financeiroRouters.ts# billingEngine + paymentDues + expenses + professorPayments
│   ├── portalRouters.ts    # chat + studentPortal + fileComments
│   ├── comunicacaoRouters.ts # reminders + whatsapp + reminderTemplates + announcements + automations
│   ├── contratosRouters.ts # contracts + signatureIntegrations + contractTemplates
│   ├── reportsRouters.ts   # reports + professores
│   └── aiRouters.ts        # ai
├── *Router.ts              # Routers externos independentes (analytics, crm, fiscal, superAdmin, ...)
├── _core/                  # bootstrap Express+tRPC, env, trpc (procedures), cookies, email, notification, sdk
├── db.ts                   # conexão + helpers de query usados pelos routers
├── services/               # Camada de serviço (lógica reutilizável NÃO-trpc)
│   ├── BillingEngine.ts    # juros/multa/carência — ÚNICA FONTE
│   ├── ProfessorPaymentService.ts # folha de pagamento de professores (cálculo + upsert — fonte única de professorPayments.calculate/calculateAll)
│   ├── contractService.ts  # contratos
│   ├── signature/          # Assinafy etc.
│   └── fiscal/             # FiscalService (NFS-e)
├── utils/                  # asaas, mercadopago, infinitepay, whatsapp, gemini, aiContext, aiPrompts, error_handler, fileSecurity
├── webhooks/               # whatsapp, botStatus, focusnfe
├── report_engine/          # exportadores Excel/CSV
└── automationJob.ts        # automações + agendamento

drizzle/
├── schema.ts               # 74 tabelas (fonte única de tipos de banco)
└── migrations/

shared/                     # const.ts (cookie/chaves) + types.ts (re-export schema + erros)
```

## Dependência entre camadas (regras)

```
página/componente → hooks, lib/, components/ui, components/{domínio}   ✓
página/componente → outra página                  ✗  (comunicar via tRPC)
componente → banco                                ✗  (via tRPC — só server)
client → server (tipos)                           ✓  somente types (AppRouter de server/routers)
server/router → services/, utils/, db, drizzle    ✓  (use serviços para lógica duplicada)
```

## Convenções de tamanho (alvos)

- Página < 800 linhas; Router < 600; Service < 400; Componente < 500.
- Acima disso: extrair em `components/{domínio}/` (client) ou `routers/*.ts`/`services/` (server).
- Uma procedure tRPC não deve conter regra financeira repetida em outra procedure — mover para `services/` ou `routers/helpers.ts`.

## Fluxos críticos a preservar

- **Contrato AppRouter**: o client tipa contra `AppRouter` (server/routers). NUNCA renomear chaves de sub-router sem migrar o client.
- **Segurança**: `getSessionCookieOptions`/`COOKIE_NAME`, `loginAttempts` (rate-limit), `isReservedSuperAdminEmail`, `safeEqualStr` (timing-safe). Super admin vem SOMENTE de `ENV.superAdminEmails`.
- **Billing**: juros/multa/carência SEMPRE via `BillingEngine`. Excedentes/assinatura via helpers de `server/routers/helpers.ts`. Regras de vencimento/atrasado/folha de professor: `buildDueDateSeries`/`markOverdueRows` (helpers) e `ProfessorPaymentService`.
- **Logging**: debug via `debugLog` de `server/_core/logger.ts` (silencioso em produção); `console.error`/`warn` para erros operacionais.
- **Documentação de estrutura**: `ARCHITECTURE.md`. Mapa para IA: `AI_CONTEXT.md`. PRD Master & Requisitos: `PRD_MASTER.md`. Diagnóstico histórico: `ARCHITECTURE_AUDIT.md`.
- **Idempotência de baixa**: `markPaid` é idempotente (AUDIT-P1) — nunca remover o early-return `alreadyPaid`.