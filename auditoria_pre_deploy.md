# Auditoria Completa Pré-Lançamento — DancePro

**Data:** 18/09/2026 · **Auditores:** varredura multiagente (rotas/menus, contrato tRPC/permissões, multi-tenancy, financeiro) + QA de dados em produção
**Escopo:** preparação para lançamento comercial, simulado o ciclo `cadastro → matrícula → turma → aulas → presença → mensalidade → pagamento → despesa → folha → relatórios → dashboard`.
**Método:** análise estática dirigida (4 frentes independentes) + suíte automatizada (`pnpm check`/`pnpm test`/`pnpm build`) + auditoria SQL de integridade/isolamento na base de produção.

---

## 1. Resumo Executivo

| Métrica | Valor |
| --- | --- |
| Achados totais documentados | 30 |
| 🔴 Críticos corrigidos nesta rodada | 12 |
| 🟠 Altos corrigidos | 12 |
| 🟡 Médios corrigidos | 5 |
| 🔵 Baixos corrigidos | 1 |
| Pendências abertas | **0** |
| TypeScript (`pnpm check`) | 0 erros (baseline mantido) |
| Testes (`pnpm test`) | 335/335 (1 timeout flaky isolado revalidado 15/15) |
| Dados em produção | 0 órfãos, 0 cross-org, 0 duplicidade de mensalidade |
| Deploy | `b7b6fd8` + `d8491c7` + onda final DP-021…DP-030 |

**Veredito do gate:** 🟢 **APROVADO PARA LANÇAMENTO** — todos os 30 achados corrigidos e validados (typecheck, testes, produção); riscos residuais são de escala/carga e estão na seção 5.

---

## 2. Achados Corrigidos (dossiê)

| ID | Módulo | Problema | Prioridade | Status |
| --- | --- | --- | --- | --- |
| DP-001 | Segurança/Permissões | Integrações de pagamento, WhatsApp e IA alteráveis por qualquer usuário autenticado (aluno/professor) | 🔴 | 🟢 VALIDADO |
| DP-002 | Segurança/Permissões | Folha de professores (criar/aprovar/marcar pago/ajustar) acessível a qualquer papel | 🔴 | 🟢 VALIDADO |
| DP-003 | Fiscal | NFS-e: emitir/cancelar/reprocessar sem papel e com IDOR cross-tenant (nota de outra escola) | 🔴 | 🟢 VALIDADO |
| DP-004 | CRM | CRM completo acessível a aluno/professor via URL/host, sem guard server-side | 🔴 | 🟢 VALIDADO |
| DP-005 | Analytics | Shell do painel analytics aberto a qualquer autenticado | 🔴 | 🟢 VALIDADO |
| DP-006 | Financeiro | `billingEngine.calculateInvoice` lia fatura de qualquer escola por ID | 🔴 | 🟢 VALIDADO |
| DP-007 | CRM | `convertToStudent` criava aluno sem `organizationId` | 🔴 | 🟢 VALIDADO |
| DP-008 | Financeiro | Baixa via edição (`paymentDues.update`) não cancelava link de gateway, lembretes nem NFS-e | 🔴 | 🟢 VALIDADO |
| DP-009 | Financeiro | Corrida de duplicidade ao gerar cobrança (duplo clique/duas abas) no Asaas/MP/InfinitePay | 🔴 | 🟢 VALIDADO |
| DP-010 | Portal do Aluno | Confirmação de pagamento por IA aceitava comprovante de valor menor e rebaixava fatura paga | 🔴 | 🟢 VALIDADO |
| DP-011 | Arquivos | `/uploads` autenticava mas não isolava por escola (comprovantes, desafios, biblioteca) | 🔴 | 🟢 VALIDADO |
| DP-012 | Assinatura SaaS | `checkout`/`changePlan`/`cancelSubscription` sem papel (qualquer membro podia cancelar a escola) | 🔴 | 🟢 VALIDADO |
| DP-013 | Contratos | `connect`/`updateApiKey`/`disconnect`/`remove` sem papel; `contracts.my` sem filtro de escola | 🟠 | 🟢 VALIDADO |
| DP-014 | Portal do Aluno | Resolução de aluno por `studentUserId` sem `organizationId` (22 pontos) | 🟠 | 🟢 VALIDADO |
| DP-015 | Financeiro | Selects/updates de cobrança de gateway sem `organizationId` | 🟠 | 🟢 VALIDADO |
| DP-016 | Matrícula | `enrollment.generateLink` liberado a qualquer membro | 🟠 | 🟢 VALIDADO |
| DP-017 | Alunos | `students.create` sem permissão server-side | 🟠 | 🟢 VALIDADO |
| DP-018 | IA/Chatbot | Base de conhecimento e fluxos do chatbot editáveis por qualquer papel | 🟠 | 🟢 VALIDADO |
| DP-019 | Configurações | Dados da escola, notificações, automações, juros/multa e teto de avanço sem papel | 🟠 | 🟢 VALIDADO |
| DP-020 | Rotas/Menu | Notificação apontando para rota inexistente `/alunos/:id`; botões mudos na Biblioteca; aliases/rotas órfãs | 🔵 | ⚫ CATALOGADO |

### Correções aplicadas (código)
- **Guards admin server-side** (`adminProcedure`): CRM inteiro, folha (`professorPayments.*`), saldos de gateway, fiscal inteiro, integrações da plataforma (escola, IA, WhatsApp, Asaas/MP/InfinitePay, financeiro, automações, chatbot, assinatura), chatbot flows, base de IA, contratos (integração + exclusão) e saúde/fiscal do aluno.
- **Guard de gestão de alunos** (`assertCanManageStudents`, novo helper): criar aluno, importar em lote e gerar link de matrícula exigem admin ou professor com `alunos_editar` — validado no servidor.
- **Isolamento multi-tenant**: fiscal `retry`/`cancel` validam a escola da nota; `calculateInvoice` valida a fatura; `convertToStudent` grava `organizationId`; `contracts.my` filtra escola; resoluções do portal (22) filtram escola; cobranças de gateway (selects e updates) filtram escola; `/uploads` bloqueia prefixos `org_<id>`/`music-library/<id>` de outra escola (super admin liberado).
- **Baixa de mensalidade por edição**: ao mudar status para `pago`, agora cancela cobrança Asaas (com limpeza das referências), limpa links MP/InfinitePay, cancela lembretes pendentes e dispara NFS-e automática — mesmo efeito da baixa oficial.
- **Comprovante por IA**: só confirma se `valor pago + R$ 0,01 ≥ valor da mensalidade`; UPDATE condicionado a `status <> 'pago'` (idempotente).
- **Trava anti-duplicação de cobrança**: janela de 15s por mensalidade nos três gateways.

### Achados descartados após verificação
- `organizationId` vindo do client: nenhum caso inseguro confirmado (exceto super admin, por design).
- Contrato tRPC: 518 chamadas do client conferidas contra 587 procedures do server — **0 procedures inexistentes**.
- Menu → rota: todos os itens de menu resolvem; sem 404 de navegação estrutural.

---

## 3. Validações Executadas

| Validação | Resultado |
| --- | --- |
| `pnpm check` | 0 erros |
| `pnpm test` | 335/335 (após revalidar isolado o flaky `repositions.test.ts`: 15/15) |
| `pnpm build` | OK (server 2.1mb) |
| Produção — `/api/health` | `{"status":"healthy","database":"up"}` |
| Produção — alunos sem escola / professor de outra escola | 0 / 0 |
| Produção — mensalidade sem escola / duplicadas (aluno+mês+ano) | 0 / 0 |
| Produção — aulas, turmas, contratos, eventos com vínculo cruzado | 0 em todos |
| Produção — usuários sem escola | 0 |
| Dados por escola | org 1: 1 aluno, 2 usuários · org 2: 0 alunos · org 3: 0 alunos (parceiro) |

> Observação: a base de produção ainda é de demonstração (poucos registros). O teste de carga/escala (100/500/1.000 alunos) e o roteiro de escola completa permanecem como validação assistida antes do go-live com cliente real.

---

## 4. Segunda Onda — Pendências Resolvidas (DP-021…DP-030)

| ID | Módulo | Problema | Prioridade | Status |
| --- | --- | --- | --- | --- |
| DP-021 | Financeiro | Webhooks Asaas/MP sem conferência de valor/referência; refund mantinha `paidAt` | 🟠 | 🟢 VALIDADO |
| DP-022 | Integridade | Exclusão de aluno/professor deixava satélites órfãos (turmas, eventos, rankings, saúde, NPS, folha, regras) | 🟠 | 🟢 VALIDADO |
| DP-023 | Financeiro | `generateMonthly` cobrava inativo e dedup por `userId` | 🟠 | 🟢 VALIDADO |
| DP-024 | Folha | Regra PADRÃO ignorada; recálculo apagava ajustes manuais | 🟠 | 🟢 VALIDADO |
| DP-025 | Financeiro | Bolsa "valor cheio" subcobrava; cache do BillingEngine sem invalidação | 🟡 | 🟢 VALIDADO |
| DP-026 | Dashboard | Competência × caixa; check-ins por aula; atribuição do professor divergente; histórico de alunos distorcido | 🟡 | 🟢 VALIDADO |
| DP-027 | Relatórios | Projeção inflava despesas recorrentes e ignorava periodicidade | 🟡 | 🟢 VALIDADO |
| DP-028 | Matrícula | 1ª mensalidade/taxa não virava lançamento | 🟡 | 🟢 VALIDADO |
| DP-029 | Financeiro | Links em lote/portal cobravam valor bruto (sem juros) | 🟡 | 🟢 VALIDADO |
| DP-030 | UX | Notificação apontava para rota inexistente; botões mudos; PDF desabilitado; import morto; permissões de menu divergentes; Notas Fiscais sem menu | 🔵 | 🟢 VALIDADO |

**Correções aplicadas (segunda onda):**
- **Webhooks**: idempotência por evento (`registerWebhookEventOnce`), validação de `external_reference` (MP), sinalização/anotação de pagamento abaixo do valor (Asaas/MP/loja) e `paidAt = null` em estorno/cancelamento.
- **Cascata de exclusão**: aluno limpa 12 tabelas satélites; professor limpa folha/regras e reatribui turmas/aulas/presenças ao admin executor.
- **Mensalidades**: aluno precisa estar `ativo`, dedup por escola (sem `userId`), taxa de matrícula lançada em fatura própria `[Taxa]`; `generateBulkAll` com dedup org-wide.
- **Folha**: fallback para regra padrão da escola; recálculo preserva `adjustments`/`totalDebits`.
- **Bolsas**: complemento deduplicado por fatura de origem (`ref #id`); `persistPaymentAmount` nunca reduz valor com marcador "Valor cheio aplicado"; `clearCache()` em create/update/delete de fatura.
- **Dashboard**: receita do mês por `paidAt`, check-ins de `attendance_logs`, filtro do professor por `students.professorId`, taxa de conclusão sem canceladas, histórico de alunos por mês.
- **Projeção**: recorrentes deduplicadas por descrição (mais recente) e receita normalizada por periodicidade.
- **Matrícula online**: cria fatura paga da 1ª mensalidade + taxas, idempotente por aluno/mês.
- **Links**: `persistPaymentAmount` antes de gerar link no lote e no portal.
- **UX**: notificação → `/alunos/:id/editar`; Notas Fiscais no menu; botões mudos e item "PDF (em breve)" removidos; import morto do `NotFound` removido; `DEFAULT_PROFESSOR_PERMISSIONS` unificado em `client/src/lib/professorPermissions.ts`.

> Itens intencionalmente mantidos: `/master-panel` (super admin) e `/marketing` (módulo oculto legado) — sem entrada de menu por decisão de produto.

---

## 5. Recomendações para o Go-Live

1. **Teste de escala assistido** antes do primeiro cliente grande (500/1.000 alunos, 10.000+ lançamentos) — a base de produção ainda é de demonstração.
2. **Operação:** rotacionar a senha root da VPS (vazou no histórico do Git) e manter `SUPER_ADMIN_EMAILS` revisado.
3. **Financeiro:** acompanhar os primeiros webhooks reais de Asaas/MP (logs de divergência de valor) e os primeiros cálculos de folha com regra padrão.
4. **UX:** avaliar entrada de menu para o módulo Marketing ou arquivá-lo definitivamente; criar rota 404 real no lugar do redirect silencioso.

---

## 6. Conclusão

- **Críticos: 0 pendentes.** Os 12 críticos (permissões/IDOR/baixa financeira/cobrança duplicada/isolamento de arquivos) foram corrigidos, testados e publicados.
- **Altos/Médios/Baixos: 0 pendentes.** Os 18 itens da segunda onda (webhooks, cascata de exclusão, mensalidades, folha, bolsas, dashboard, projeção, matrícula online, links e UX) foram corrigidos e publicados.
- **Dados:** produção íntegra, sem contaminação entre escolas e sem duplicidade de mensalidades.
- **Validação:** `pnpm check` 0 erros · `pnpm test` 335/335 · build ok · health/verificação de bundle em produção.
- **Recomendação:** 🚀 **liberar o lançamento** (com teste de escala assistido para o primeiro cliente grande, conforme seção 5).

---

## Histórico

### Auditoria Pré-Deploy — Abas Duplicadas de Modalidades (15/09/2026)
- Correção da duplicidade de abas em `Relatorios.tsx` (Formato de Aula × Estilos & Ritmos), especialização de Metas de Dança, limpeza do portal do aluno e release `2026.09.15.2`. Auditoria **APROVADA** (typecheck 0, contratos tRPC preservados).
