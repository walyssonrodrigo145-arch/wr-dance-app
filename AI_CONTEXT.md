# AI_CONTEXT.md — Mapa para IAs (MusicPro)

> Guia de navegação para agentes: "onde está X". Reduza o contexto necessário antes de alterar um arquivo.
> Leia o arquivo certo ANTES de começar. Não reimplemente o que já existe.

## Mapa por feature

| Você precisa alterar… | Vá para… | NÃO vá para… |
|---|---|---|
| Cadastro de alunos (form) | `pages/NovoAluno.tsx` + `components/alunos/` (PortalAccessCard) | `server/routers.ts` (barrel) |
| Lista de alunos (tabela/badges) | `pages/Alunos.tsx` + `components/alunos/` (StatusBadge, StudentModal, DeleteConfirm) | — |
| Procedures de alunos no backend | `server/routers/studentsRouters.ts` | `server/routers.ts` |
| Aulas/calendário | `pages/Aulas.tsx` + `components/aulas/` (LessonCardDesktop, AULA_STATUS_CONFIG) | — |
| Procedures de aulas/ocupação | `server/routers/lessonsRouters.ts` + `server/slotAdvanceRouter.ts` | — |
| Mensalidades (vencimentos, baixa, atraso) | `server/routers/financeiroRouters.ts` (paymentDues) + `pages/financeiro/MensalidadesTab.tsx` + `services/BillingEngine.ts` | reimplementar cálculo no client |
| Despesas / pagamento professores | `server/routers/financeiroRouters.ts` (expenses / professorPayments) + `pages/ProfessorExtract.tsx` | — |
| Juros / multa / carência | `server/services/BillingEngine.ts` (ÚNICA fonte) | NUNCA recalcular inline |
| Assinatura/excedentes de plano | `server/routers/helpers.ts` (getOrgPlanLimits, syncOrgAsaasSubscription, reconcileOrgAsaasCharges) + `services/signature` | duplicar cálculo |
| Lembretes (mensalidade) | `server/routers/comunicacaoRouters.ts` (reminders) + `components/lembretes/` | — |
| WhatsApp (sessões/mensagens) | `server/utils/whatsapp.ts` + `server/routers/comunicacaoRouters.ts` (whatsapp) + `webhooks/whatsapp.ts` | — |
| Contratos / assinatura digital | `server/routers/contratosRouters.ts` + `services/contractService.ts` + `services/signature/` + `components/modals/StudentContractsSection.tsx` | — |
| Portal do aluno | `server/routers/portalRouters.ts` + `client/src/pages/student/` | — |
| Configurações (14 abas) | `pages/Configuracoes.tsx` + `components/settings/` | — |
| Relatórios exportáveis | `server/routers/reportsRouters.ts` + `server/report_engine/` + `pages/Relatorios.tsx` | — |
| IA (chat, documentos, automações IA) | `server/routers/aiRouters.ts` + `utils/gemini.ts` + `utils/aiContext.ts` | — |
| Schema de banco / novos campos | `drizzle/schema.ts` (+ `pnpm db:push`) | duplicar tabela |
| Novos endpoints tRPC | criar procedura no router de domínio correto (`server/routers/*.ts`) | adicionar ao barrel/`routers.ts` |
| CSS global / tema | `client/src/index.css` + `contexts/ThemeContext.tsx` | — |
| Formatação de moeda | `client/src/lib/money.ts` (formatBRL/parseBRL) | reimplementar `formatCurrency` |
| Máscaras de telefone/CPF | `client/src/lib/masks.ts` | duplicar inline |
| Datas | `client/src/lib/dates.ts` | duplicar formatDate/formatTime |
| Status de aula | `client/src/lib/status.ts` + `components/aulas/LessonCardDesktop.tsx` (LESSON_STATUS_CONFIG) | duplicar config |
| Erros de API | `shared/_core/errors.ts` (HttpError) | — |
| Webhooks de pagamento | `server/_core/index.ts` (registro: asaas×2, mercadopago/student, infinitepay/student) | — |
| InfinitePay (mensalidades) | `server/utils/infinitepay.ts` + `financeiroRouters.ts` (generateInfinitePayCharge) + webhook `_core/index.ts` (token + revalidação `payment_check` — corpo do webhook NÃO é prova de pagamento). Chave BYOK `settings.infinitepayApiKey` criptografada (AES-256-GCM) e enviada como Bearer | confiar no corpo do webhook; recriar baixa fora da idempotência; ler a chave sem `resolveInfinitePayApiKey` (select cru vem cifrado) |
| Encurtador de links (`/p/{code}`) | `server/utils/shortlinks.ts` (createPaymentShortLink — fallback para URL original) + rota pública `GET /p/:code` em `_core/index.ts` (302 + contador). Tabela `short_links`. Criado server-side APENAS nos fluxos de cobrança (sem endpoint público de criação) | endpoint público de criação (open redirect); bloquear cobrança se o encurtar falhar |
| Reposição de aulas (créditos) | `server/routers/repositionsRouters.ts` + `server/services/RepositionService.ts` (regras puras) + `pages/Reposicoes.tsx` + `components/aulas/RepositionModal.tsx` + `components/settings/RepositionsSettings.tsx` + status `a_repor` em `client/src/lib/status.ts` | recalcular validade/liberação no client; criar crédito fora do `createFromLesson` (unique em `lessonId` = 1 crédito/aula) |
| IA especialistas/prompts | `server/routers/aiPromptsRouters.ts` (aiSpecialists + aiPrompts) + `server/services/PromptVariables.ts` (variáveis `{{...}}`) + `server/services/CustomSpecialistService.ts` + `components/settings/AiPromptsSettings.tsx`; integração no plano diário: `progressRouters.generateDailyStudyPlan` (input `specialistRef`) | enviar prompts de especialistas não selecionados; versionar fora de `ai_prompt_versions` (append-only) |
| Metrônomo | `client/src/lib/metronomeEngine.ts` (singleton com scheduler Web Audio) + `client/src/components/metronome/Metronome.tsx` (usado no Plano Diário do aluno; `bpm` por exercício vem do JSON do plano) | criar nova instância de AudioContext/loop fora do singleton `metronome` |
| Repertório (YouTube) | `server/routers/repertoireRouters.ts` + `server/utils/youtubeUrl.ts` (parser puro — iframe usa SÓ videoId validado) + `components/progresso/RepertoireTab.tsx` (professor) + `components/student/RepertoireSection.tsx` (portal) + `components/ui/VideoFacade.tsx` (capa antes do iframe — Erro 153; player alternativo = nocookie via `youtubeEmbedSrc` altHost) | montar iframe com URL crua do usuário; montar iframe sem clique (facade exige gesto); o aluno nunca edita título/URL (só viewed/learned próprios) |
| Cifras (Repertório) | `server/services/ChordTransposer.ts` (transposição pura) + `server/services/CifraClubImporter.ts` (import: só acordes/tom/diagramas — **NUNCA letra** — RN-007) + `getChord`/`transposeChord`/`importCifraClub` no repertoireRouters; visualizador no RepertoireSection (tabs Música\|Cifra) | armazenar letra (direito autoral); transpor no client (RN-003: server-only); iframe do cifraclub (fora de escopo) |
| Coreografias (núcleo de dança) | `server/routers/coreografiasRouters.ts` (router `coreografias`) + `components/…`/`pages/Coreografias.tsx` (admin) + `pages/student/Coreografias.tsx` (portal) + abas do Progresso (`components/progresso/RepertoireTab.tsx` para material do aluno) | duplicar elenco fora de `coreografia_alunos` (unique por coreografia+aluno); criar coluna separada para progresso (é `progresso` 0–100) |
| Eventos / Espetáculos | `server/routers/eventosRouters.ts` (router `eventos`) + `pages/Eventos.tsx` (programa + participantes + autorizações) + `pages/student/Eventos.tsx` (confirmação de presença) | ignorar `requiresAuthorization` ao exibir pendências; deixar menor sem `guardianName` quando exigido |
| Figurinos / Estoque | `server/routers/figurinosRouters.ts` (router `figurinos`: acervo + `costume_loans`) + `pages/Figurinos.tsx` + `pages/student/Figurinos.tsx` | calcular disponibilidade fora do padrão (total − soma de empréstimos sem `returnedAt`); excluir peça com histórico (arquiva) |
| Turmas & Vagas | `server/routers/turmasRouters.ts` (router `turmas`: capacidade + lista de espera com promoção automática em `cancelEnrollment`) + `pages/Turmas.tsx` + `pages/student/Turmas.tsx` | promover aluno acima da capacidade; duplicar semana (0=Dom…6=Sáb, mesmo padrão de `student_enrollments`) |
| Saúde do bailarino | `server/routers/saudeRouters.ts` (router `saude`, tabela `student_health_records`) + aba "Saúde" em `pages/Progresso.tsx` (`components/progresso/SaudeTab.tsx`) | expor dados de saúde/lesão no portal do aluno (uso interno da escola) |
| NPS | `server/routers/saudeRouters.ts` (router `nps`, tabela `nps_responses`) + `pages/Nps.tsx` (painel) + `components/student/NpsCard.tsx` (portal, reaparece a cada 90 dias) | recalcular NPS no client (regra: promotores 9–10, neutros 7–8, detratores 0–6) |

## Regras anti-duplicação (violar = bug financeiro)

1. **Moeda**: sempre `formatBRL`/`parseBRL` de `client/src/lib/money.ts`.
2. **Juros/multa/carência**: somente `BillingEngine`.
3. **"Está atrasado?"**: use as mesmas regras do server — `markOverdueRows`/`getTodayBR`/`toISODate` em `server/routers/helpers.ts` — não recalcule no client.
4. **Geração de vencimentos**: use `buildDueDateSeries` (server/routers/helpers.ts) — ajuste fim de mês + periodicidade em uma fonte.
5. **Folha de professor**: use `server/services/ProfessorPaymentService.ts` (`calculateAndSaveProfessorPayment`) para `calculate` e `calculateAll`.
6. **Baixa de pagamento (`markPaid`)**: os 4 `markPaid` são fluxos LEGÍTIMOS diferentes (tabelas/efeitos distintos: Asaas+NFS-e+reminders, expenses, professorPayments, portal com IA) — não crie uma 5ª versão, reutilize a específica da tabela.

## Comandos de verificação

```bash
pnpm check     # tsc --noEmit (typecheck completo client+server)
pnpm test      # vitest (testes funcionais de server + 1 client)
pnpm build     # vite build + bundle esbuild do server
```

Testes focados de server (rápidos): `pnpm vitest run server/critical.regression.test.ts server/settings.test.ts server/BillingEngine.test.ts server/music.test.ts server/reminders.test.ts`

## ⚠️ Avisos ITS: precedência MÁXIMA

- **NUNCA use `rg -r` (ou `-rln`/`-rn` com intenção de "recursivo")**: em ripgrep, `-r` = **replace** no output (e `-rln` = replace in-place = **destrói arquivos**). Use `rg -l`/`rg -n` sem `-r`. (Já quase apagou código uma vez.)
- **Não rode `git checkout`/`git restore`/`commit`/`push`** sem ordem explícita do usuário.
- **Não reordene chaves do `appRouter`** em `server/routers/index.ts` — o client tipa contra elas.
- **Testes flaky**: 2 testes (timeout paralelo) falham na suíte completa e passam isolados — rode isolados antes de culpar o código.
- **BOM/encoding**: após reescrever arquivos com PowerShell `Set-Content -Encoding utf8`, consertar BOM (ver script em temp). Prefira gravar sem BOM (UTF-8).
- **Não apagar `Audit`/`ARCHITECTURE_AUDIT.md`**: são o histórico do projeto.
- **ssh2** é dependência de deploy (`vps-script/`) — não remover.

## Estado (15/09/2026)

Fases 0-4 + F6 concluídas: código morto removido, libs centralizadas, páginas fatiadas, monólito de routers dividido por domínio, useAuth movido para `hooks/`. Baseline TS atual: **0 erros** (`pnpm check`) — qualquer mudança não deve ADICIONAR erros novos. Módulos de dança adicionados em 15/09/2026: coreografias, eventos, figurinos, turmas/vagas, saúde física e NPS (ver `shared/releases.ts` v2026.09.15.3).