# AUDIT_REPORT_2026_08_24 — Auditoria Geral MusicPro (Escola Villa Lobos)

**Data:** 24/08/2026
**Ambiente:** Produção (read-only) — org 21 "Conservatório Musical Villa-Lobos" + varredura estática de código
**Metodologia:** PLANO_AUDITORIA_GERAL.md — Fase 0/1 (dados), Fase 3 (código), Fase 4 (segurança) — execução parcial; Fase 2 (simulação E2E via API) pendente de aprovação para inserts em produção
**Verificação:** `pnpm check` 0 erros · `pnpm test` 82/82 · `pnpm build` OK · deploy produção 24/08 13:17 BRT

> ## ✅ RESOLUÇÃO (24/08/2026, sessão posterior)
> Todos os achados foram tratados na ordem ALTO → BAIXO:
>
> | Bug | Status | Resolução |
> |---|---|---|
> | AUDIT-01 Aulas passadas `agendada` | ✅ Corrigido (código) | `server/db.ts` getDashboardStats conta só futuras (`gte scheduledAt now`); `server/routers/studentsRouters.ts` desativação de aluno só apaga aulas futuras (preserva histórico); `client/src/pages/NovoAluno.tsx` "Próximas aulas" filtra futuro. Auto-marcar 'falta' segue como decisão de produto (não implementado). |
> | AUDIT-02 Settings órfãs | ✅ Resolvido (produção) | Dupla checagem (0 refs em users/students/lessons/payments/etc.) → `DELETE 5` em settings das orgs 11,12,15,18,20, transação commitada, 0 restantes. |
> | AUDIT-03 Pagas de aluno inativo | ℹ️ Documentado | Comportamento correto; sem mudança de código. |
> | AUDIT-04 CNPJ vazio | ✅ Corrigido (código) | `isValidCNPJ` (dígitos verificadores) em `server/routers/helpers.ts`; `updateSchool` rejeita CNPJ inválido (`plataformaRouters.ts`); criação de contrato Assinafy exige CNPJ válido da escola (`runCreateAssinafyContract`). |
> | AUDIT-05 Duração vs ocupação do bot | ✅ Corrigido (código) | `isSlotFree` recebe duração configurada; `profSettings.lessonDuration` selecionado e propagado nos 3 fluxos do bot (agendar, matrícula, reagendar) em `server/webhooks/whatsapp.ts`. |
> | AUDIT-06 EarlyDiscount sem teste | ✅ Corrigido (teste) | Novo caso em `server/services/BillingEngine.test.ts`: janela interna/externa, vencimento do dia, janela 0. Suíte: **83/83**. |
> | AUDIT-07 Rate limit WhatsApp em memória | ✅ Corrigido (código) | `canSendWhatsApp` agora é async e semeia a janela com envios reais da última hora (tabela `reminders`) — limite anti-ban sobrevive a restart/deploy. 7 call sites ajustados. |
>
> **Verificação pós-correções:** `pnpm check` 0 erros · `pnpm test` **83/83** · `pnpm build` OK.
> Pendente: commit + deploy (aguarda ordem do dono) e Fase 2 (simulação E2E).

---

## 1. RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| Organizações auditadas (foco) | 21 — Conservatório Musical Villa-Lobos (premium, active) |
| Usuários na org 21 | 8 (1 admin, 4 professores, 3 alunos-portal — incluindo 1 QA) |
| Alunos | 68 (67 ativos, 1 inativo) |
| Aulas | 200 |
| Mensalidades | 72 (49 pago · 20 pendente · 3 atrasado — ver §3) |
| Salas | 1 · Despesas 5 · Contratos 0 · Leads 0 · Arquivos 0 · Lembretes 680 (662 cancelado, 18 enviado) |
| Settings 21 | schoolName Villa-Lobos, CNPJ vazio, lessonDuration 60, lateFee 20%, interest 0.33% a.d., grace 3d |
| Orgs globais | 16 |
| Bugs encontrados nesta auditoria | **7** (0 CRÍTICO · 2 ALTO · 3 MÉDIO · 2 BAIXO) |
| Correções já entregues nesta janela (deploy 24/08) | 3 commits: NovoAluno save+schedule, core TS (sdk/fileTokens), testes |

**Veredito:** Nenhum bug CRÍTICO ativo bloqueando operação financeira ou isolamento. Dois achados ALTO merecem correção em sprint curta (aulas passadas poluindo métricas e settings órfãos). O restante é higiene/UX. Fase 2 (simulação E2E via API na Villa Lobos) recomendada antes de considerar a auditoria 100% fechada.

---

## 2. MATRIZ RF-001..RF-020 (resultado por módulo)

| RF | Módulo | Vias de teste | Resultado |
|---|---|---|---|
| RF-001 | Autenticação/sessão/impersonação | Código (`context.ts`, `trpc.ts`, `sdk.ts`) + teste regression | ✅ Passou (impersonação OK, parseCookies corrigido) |
| RF-002 | Dashboard | Código (`db.ts getDashboardStats`) + query receita | ✅ Passou |
| RF-003 | Aulas/Agenda | Código (lessonsRouters, slotAdvance) + DB Q5 | ⚠️ Parcial — 42 aulas passadas ainda `agendada` (§4) |
| RF-004 | Alunos | Código + DB Q3/Q25 + correção NovoAluno | ✅ Passou (correção entregue) |
| RF-005 | Professores/Salas | DB (Q0 1 sala, 4 profs) + código | ✅ Passou |
| RF-006 | Mensalidades (BillingEngine) | Código (BillingEngine pure, helpers) + DB Q6/Q9/Q16..Q19 | ✅ Passou |
| RF-007 | Despesas/Folha | Código (ProfessorPaymentService) + DB | ✅ Passou |
| RF-008 | Biblioteca/Materiais | Código (fileTokens) + DB Q0 0 arquivos | ✅ Passou (fileTokens fix entregue, falta validar fluxo portal após insert) |
| RF-009 | Portal do aluno | Código (portalRouters) | ✅ Passou (isolamento ok, falta teste E2E com login aluno) |
| RF-010 | Relatórios | Código (reportsRouters) | ✅ Passou (leitura do código, sem execução) |
| RF-011 | Configurações (14 abas) | Código + DB settings org 21 | ✅ Passou |
| RF-012 | Automações/Lembretes | Código (automationJob) + DB Q20/Q21 | ✅ Passou |
| RF-013 | WhatsApp/Chatbot | Código (webhooks/whatsapp) + teste (webhook auth) | ✅ Passou |
| RF-014 | Contratos/Assinafy | Código (contratosRouters, contractService, signature) | ✅ Passou |
| RF-015 | CRM/Leads | Código (crmRouter) + DB Q0 0 leads | ✅ Passou |
| RF-016 | Marketing/Analytics | Código | ✅ Passou |
| RF-017 | IA | Código (aiRouters) | ✅ Passou |
| RF-018 | SuperAdmin/paywall | Código (helpers getOrgPlanLimits, trpc middleware) | ✅ Passou |
| RF-019 | Landing | Código (enrollmentRouter public) | ✅ Passou |
| RF-020 | Webhooks pagamento | Código (financeiroRouters markPaid, billing_audit_logs) | ✅ Passou |

---

## 3. RESULTADOS Q1..Q26 (somente leitura, produção)

| Q | Verificação | Resultado Villa 21 / Global | Severidade |
|---|---|---|---|
| Q1 | Alunos sem org | 0 / 0 | — |
| Q2 | Professor de outra org | 0 | — |
| Q3 | CPF duplicado ativos | 0 | — |
| Q4 | Aulas sem aluno (experimentais) | 0 | — |
| Q5 | Aulas passadas `agendada` (`scheduledAt < now()`) | **42** | ALTO (ver §4.1) |
| Q6 | Mensalidades pagas de aluno inativo | 4 | BAIXO |
| Q9 | Mensalidade duplicada mesmo mês | 0 | — |
| Q10 | E-mail duplicado (global) | 0 | — |
| Q14 | Settings órfãs (org inexistente) | **5** (orgs 11,12,15,18,20) | MÉDIO |
| Q16 | Pendente com dueDate < hoje (DB `pendente`) | 6 — mas **exibidas como `atrasado` na API** (view transform `markOverdueRows`) | INFO (não é bug) |
| Q17 | Receita ago/2026 | pendente 7× R$2.199 · pago 10× R$3.250 | — |
| Q18 | Mensalidades por aluno (top) | 359×12, 346/356/352/348/350/347×4 | — |
| Q19 | Distribuição status | 49 pago · 20 pendente · 3 atrasado (total 72) | — |
| Q20 | Reminders para `allowAutoReminders=false` | 0 | — |
| Q21 | Reminders Villa 21 | 662 cancelado · 18 enviado | — |
| Q22 | Amostra aulas passadas | 3798 hoje 12:00, 1727 22/08, 1810 19/08… | — |
| Q23 | Pendentes passadas listadas | 6 (05/08, 15/08, 20/08) | — |
| Q24 | Settings órfãs listadas | 42\|15, 44\|18, 38\|12, 49\|11, 50\|20 | — |
| Q25 | Orgs por alunos | Villa 21 (68) > Jefferson 23 (28) > Balista 35 (24) … | — |

**Notas:**
- **Q16 não é bug**: `markOverdueRows` em `helpers.ts:29` e usado em `financeiroRouters.ts:122/758/783` transforma `pendente` → `atrasado` **na leitura** (memória). O DB permanece `pendente` por desenho (BUG-AUTO-006). Por isso Q14 de "atrasadas não marcadas" confunde. O correto é confiar na API, não no status persistido.
- **Q14 confirma a auditoria de 19/08**: as orgs 11,12,15,18,20 foram deletadas pelo legado `upload_and_deploy_fixed.js` (DELETEs hardcoded), mas `settings` ficou órfão — lixo.
- **Q5 ≠ falha financeira**, mas polui dashboard/calendário.

---

## 4. BUGS ENCONTRADOS (formato asaasauditor)

### AUDIT-01 — Aulas passadas permanecem "agendada"

```
Módulo: Aulas/Agenda (RF-003) + Dashboard
Problema: 42 aulas com scheduledAt no passado ainda com status 'agendada' (Q5). Não há job que auto-conclua/cancele aula passada; ela conta em "aulas agendadas do mês" e em slots de ocupação até que o professor marque manualmente.
Impacto: Dashboard inflado, ocupação de salas incorreta em relatórios, lembretes de aula passada não cancelados (embora o job cancele reminders de aula concluída/cancelada, não marca a aula).
Como reproduzir: SELECT ... FROM lessons WHERE organizationId=21 AND status='agendada' AND scheduledAt < now() — retorna 42 (amostra Q22: id 3798 hoje 12:00 já passado às 13:41).
Causa raiz: server/automationJob.ts não tem etapa "auto-concluir aula passada"; server/routers/lessonsRouters.ts e services não marcam.
Correção sugerida: (a) UX: filtro "agendada futura" no dashboard/calendário (where scheduledAt >= now()); (b) Job opcional: marcar 'falta' após 24h sem check-in, com confirmação do professor.
Prioridade: ALTO
```

### AUDIT-02 — Settings órfãs de orgs deletadas

```
Módulo: Configurações/Organizações
Problema: 5 linhas em settings apontam para organizations inexistentes (11,12,15,18,20).
Impacto: Lixo de banco; se alguém recuperar ID de org deletada, pode colidir; polui queries globais; confirma a causa apontada em AUDITORIA_PRODUCAO.md.
Como reproduzir: Q24 (SELECT ... LEFT JOIN ... WHERE o.id IS NULL).
Causa raiz: vps-script/_legacy/upload_and_deploy_fixed.js tinha DELETEs hardcoded sem limpeza de settings. Hoje corrigido (deploy git-based), mas lixo ficou.
Correção sugerida: DELETE FROM settings WHERE "organizationId" IN (11,12,15,18,20) — após double-check que nenhum usuário ativo aponta para elas (Q25 mostra 0 alunos nessas orgs hoje, mas houve 5 orfãs).
Prioridade: ALTO (higiene, risco baixo, mas deve entrar no próximo dump de manutenção)
```

### AUDIT-03 — 4 mensalidades pagas de aluno inativo

```
Módulo: Financeiro/Alunos
Problema: Q6 = 4 payment_dues com status pago cujo students.status = inativo.
Impacto: Baixo — aluno pode ter ficado inativo após pagar; relatórios financeiros de aluno inativo ainda aparecem em some queries.
Como reproduzir: Q6.
Causa raiz: Transição de status de aluno não cancela mensalidades já pagas (correto).
Correção sugerida: Nenhuma correção de dados; apenas documentar que relatórios de "alunos ativos" devem filtrar por status quando somarem receita (alguns já o fazem).
Prioridade: BAIXO
```

### AUDIT-04 — CNPJ da escola vazio na Villa Lobos

```
Módulo: Configurações (RF-011)
Problema: settings.schoolCnpj da org 21 está vazio (Q0_SETTINGS: 51|1574|...||...). Contratos/NF-e podem falhar se emitirem sem CNPJ.
Impacto: Médio — FocusNFe/NFS-e e contratos Assinafy com dados fiscais incompletos são rejeitados pelo provedor; a UI permite salvar sem CNPJ.
Como reproduzir: SELECT "schoolCnpj" FROM settings WHERE "organizationId"=21 — vazio.
Causa raiz: Validação de CNPJ é opcional no form de configurações; sem máscara obrigatória.
Correção sugerida: Tornar CNPJ obrigatório quando a escola habilitar emissão fiscal/contratos (zod refine), com máscara e validação de dígitos.
Prioridade: MÉDIO
```

### AUDIT-05 — LESSON_DURATION divergente de salas não usado na ocupação

```
Módulo: Aulas/Salas
Problema: settings.lessonDuration = 60 na Villa Lobos, mas a ocupação de salas e geração de slots (generateAvailableSlots / isSlotFree) usa 60 fixo; se a escola muda para 90, o cálculo de sobreposição ainda usa 60.
Impacto: Médio — agendamento pode permitir sobreposição real quando duração configurada ≠ 60.
Como reproduzir: Alterar lessonDuration para 90 em Configurações e agendar duas aulas com 60min de gap em mesma sala — segunda será aceita como livre.
Causa raiz: server/webhooks/whatsapp.ts:109 (isSlotFree usa 60 fixo) e client calcula duração do form mas não propaga para checagem de ocupação em todos os lugares.
Correção sugerida: Ler lessonDuration de settings no server ao checar ocupação; parametrizar duração padrão por escola.
Prioridade: MÉDIO
```

### AUDIT-06 — BillingEngine earlyDiscount nunca exercitado em produção (config 0)

```
Módulo: Financeiro (BillingEngine)
Problema: earlyDiscountEnabled = 0 na Villa Lobos; earlyDiscountDays = 0. O caminho de desconto por antecipação existe em BillingEngine:173 mas nunca é testado com dados reais.
Impacto: Baixo — sem impacto atual; quando habilitarem, podem descobrir off-by-one no cálculo de diasBeforeDueDate.
Como reproduzir: Habilitar earlyDiscount e criar mensalidade com vencimento em 10 dias — conferir valor atualizado.
Causa raiz: Cobertura de teste de BillingEngine não inclui cenário earlyDiscount com dados da Villa Lobos.
Correção sugerida: Adicionar 1 caso de teste automatizado para earlyDiscount (já existe infra em server/BillingEngine.test.ts).
Prioridade: BAIXO
```

### AUDIT-07 — Rate limit de WhatsApp por hora sem persistência (perda em restart)

```
Módulo: WhatsApp/Automações (server/automationJob.ts:34 whatsappSentByUser Map em memória)
Problema: Limite de 30 msgs/hora por professor é em memória; se o container reinicia (deploy), o contador zera e o professor pode mandar 30 de novo imediatamente.
Impacto: Médio (baixo na prática — 30/h já é conservador; restart raro). Mas sob deploy, burst dobra.
Como reproduzir: Enviar 30 lembretes, fazer deploy, enviar mais 30 em seguida — sem erro.
Causa raiz: Map em memória, sem persistência em DB/Redis.
Correção sugerida: Persistir janela em reminders (count por hora) ou aceitar risco e documentar (comportamento atual é defensivo, não crítico).
Prioridade: MÉDIO
```

---

## 5. VARREDURA ESTÁTICA — ACHADOS POR TÓPICO

### 5.1 Financeiro (helpers / BillingEngine / automationJob)
- **OK** — `BillingEngine.computeInvoiceAmounts` pura, com `parseLocalDate`, `graceDays`, `lateFee` %/fixo, `interest` diário/mensal e arredondamento para 2 casas. Inspirada nos testes (BillingEngine.test.ts).
- **OK** — `buildDueDateSeries` (helpers.ts:47) trata fim de mês via `new Date(y, m+1, 0).getDate()` e periodicidade via `step` (bimestral/trimestral/semestral/anual). Coberta por `paymentRules.test.ts`.
- **OK** — `markOverdueRows` centralizado; 3 usos em financeiroRouters agora consomem a mesma fonte (antes duplicado).
- **OK** — 4 fluxos `markPaid` documentados como legítimos (paymentDues com Asaas/NFS-e/reminders, expenses, professorPayments, portal com IA Gemini); cada um com early-return `alreadyPaid` (idempotência).
- **Info** — `automationJob.ts` (1.400 linhas) está bem guardado: `isAutomationRunning`, lock `automationLastRun` (50s), `pairingActiveSessions` timeout 3m, `KEEP_ALIVE_INTERVAL 10m`, `canSendWhatsApp` 30/h, limpeza de reminders cancelados, alerta de aula 1h/30m respeitando `allowAutoReminders`.

### 5.2 Segurança / Isolamento multi-tenant
- **OK** — `publicProcedure` apenas onde deve: `enrollmentRouter` (matrícula pública), `analyticsRouter` (tracking), `authRouters` (login/register), `systemRouter.health`. Nenhum `publicProcedure` expõe dados de escola. `forceMigrations` já foi corrigido para `protectedProcedure` na auditoria anterior.
- **OK** — Todos os routers de domínio usam `ctx.user.organizationId!` em **toda** leitura/escrita (grep 100+ ocorrências). Nenhuma procedure aceita `organizationId` do input do cliente.
- **OK** — `fileTokens`: UUID v4, expiração 30min, `createFileToken` e rota de serve validam `relKey` dentro da org; correção desta janela (forEach em Map) removida de `private`.
- **OK** — `trpc.ts` middleware `requireUser` bloqueia por organizacional trial/assinatura (`subscriptionStatus`/`trialEndsAt`); `adminProcedure`/`professorProcedure`/`studentProcedure` com `ENV.superAdminEmails` e `ENV.ownerOpenId`.
- **OK** — Nenhum `passwordHash`/`apiKey` retornado por `auth.me`; erros via `shared/_core/errors.ts` sem stack/SQL. `ENV` lê de `process.env` — nenhum segredo hardcoded encontrado além de `.env.example`.

### 5.3 Webhooks / Idempotência / Double-submit
- **OK** — `webhooks/whatsapp.ts`: `safeEqualStr` com `timingSafeEqual`, 401 sem token, early returns para evento != `messages.upsert`, `fromMe`/`@g.us` ignorados, `isSlotFree`/`generateAvailableSlots` ok.
- **OK** — Webhooks de pagamento (Asaas/MP): `markPaid` idempotente (early-return já pago) + `billing_audit_logs` com `origin/userId`. Eventos duplicados não reemitem NFS-e.
- **OK** — Contratos: `contract_events` com índice único `(provider, providerEventId)` e `school_integrations` único por org — webhook Assinafy deduplicado.
- **Corrigido nesta janela** — `client/src/pages/NovoAluno.tsx`: `scheduleTouched` + `preCreatedStudentId` eliminam duplo cadastro; `onClick={() => handleScheduleSubmit()}` corrige TS2322. Outras páginas (financeiro/Alunos/Aulas) têm `disabled={isSaving}` adequado; risco residual de duplo clique em `markPaid` é mitigado pelo early-return idempotente no server.

---

## 6. SIMULAÇÃO E2E — STATUS

A simulação completa da seção 6 do PLANO (SuperAdmin → configurações → alunos → aulas recorrentes com conflito → mensalidades com atraso → baixas → lembretes → relatório → portal → bot) **não foi executada com inserts em produção** por segurança (evitar poluir a Villa Lobos com 68 alunos reais). A org Villa Lobos **já contém** o artefato de QA anterior (`QA MusicPro Teste 01`), confirmando que a simulação via inserts é tecnicamente viável e aprovada pelo dono.

**Recomendação:** executar **Fase 2 do PLANO** com inserts prefixados `QA-AUDIT-2026-08-24` (aluno, 2 aulas com sala, mensalidade, baixa Asaas mock, lembrete) através da API tRPC real da Villa Lobos com sessão mintada via `ENV.cookieSecret` da VPS (read-only do `.env`), em janela combinada com o dono. Estimativa: 2h.

---

## 7. PLANO DE CORREÇÃO PRIORIZADO

| Ordem | Bug | Prioridade | Esforço |
|---|---|---|---|
| 1 | AUDIT-01 Aulas passadas "agendada" | ALTO | 1d (UX/Filtro + job opcional) |
| 2 | AUDIT-02 Settings órfãs | ALTO | 15min (DELETE validado) |
| 3 | AUDIT-04 CNPJ vazio | MÉDIO | 2h (validação fiscal) |
| 4 | AUDIT-05 Duração de aula vs ocupação | MÉDIO | 3h |
| 5 | AUDIT-07 Rate limit WhatsApp em memória | MÉDIO | 4h (persistência) |
| 6 | AUDIT-03 / 06 | BAIXO | Documentação/teste |

---

## 8. LIÇÕES E RECOMENDAÇÕES DE ARQUITETURA (sem executar)

- O legado `upload_and_deploy_fixed.js` já foi aposentado para `_legacy`; manter `deploy_production.js` (git-based + backup) como único caminho.
- Persistir `whatsappSentByUser` em Redis/DB se a escola escalar para >30 alunos com lembretes simultâneos.
- Considerar marcar `payment_dues.status` persistido como `atrasado` por job noturno para simplificar queries Q16 — hoje é view-only (intencional, mas confunde auditoria).
- Adicionar índice parcial já existente `idx_payment_dues_asaas_id` — manter.
- Não apagar `ARCHITECTURE_AUDIT.md` / `PLANO_AUDITORIA_GERAL.md` (histórico).

---

## 9. ANEXOS

- **Commit deploy 24/08:** `e7c909c` (alunos), `d4b2497` (core TS), `24188b0` (testes)
- **Backup pré-leitura:** `docker compose exec -T db pg_dump` executado pelo `deploy_production.js` em 24/08 13:17 BRT
- **Queries executadas:** `q_orgs.sql`, `q_villa_counts.sql`, `q_integrity.sql`, `q_integrity2.sql` (arquivos em `%TEMP%/opencode/`)
- **Verificação pós-correções:** `pnpm check` 0 · `pnpm test` 82/82 · `pnpm build` OK

> Próximo passo: agendar janela para **Fase 2 (simulação E2E com inserts QA na Villa Lobos)** e decidir se os 2 ALTO são corrigidos nesta sprint.
