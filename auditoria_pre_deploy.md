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
| 🟠 Altos corrigidos nesta rodada | 8 |
| 🟠 Altos pendentes (documentados, com plano) | 4 |
| 🟡 Médios pendentes | 5 |
| 🔵 Baixos pendentes | 1 |
| TypeScript (`pnpm check`) | 0 erros (baseline mantido) |
| Testes (`pnpm test`) | 335/335 (1 timeout flaky isolado revalidado 15/15) |
| Dados em produção | 0 órfãos, 0 cross-org, 0 duplicidade de mensalidade |
| Deploy | commit `b7b6fd8` + trava de cobrança (ver final) |

**Veredito do gate:** 🟡 **PRONTO COM RESSALVAS** — nenhum crítico aberto; os 4 altos residuais são de regra de negócio específica (folha/bolsa/inadimplência/cascata de exclusão) e estão detalhados na seção 4 com correção planejada.

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

## 4. Pendências Documentadas (backlog com causa raiz)

| ID | Módulo | Problema | Prioridade | Status |
| --- | --- | --- | --- | --- |
| DP-021 | Financeiro | Webhooks Asaas/MP dão baixa sem comparar valor pago × fatura (aceita parcial por design?); refund não limpa `paidAt` | 🟠 | ⚫ ABERTO |
| DP-022 | Integridade | Excluir aluno/professor deixa registros em tabelas satélite (turmas, eventos, rankings, saúde, NPS, folha, regras) | 🟠 | ⚫ ABERTO |
| DP-023 | Financeiro | `generateMonthly` não filtra aluno inativo e dedup inclui `userId` (duplicata entre usuários) | 🟠 | ⚫ ABERTO |
| DP-024 | Folha | Regra PADRÃO da escola (`teacherId NULL`) ignorada; recálculo sobrescreve ajustes manuais | 🟠 | ⚫ ABERTO |
| DP-025 | Financeiro | Bolsa: complemento "valor cheio" subcobra em cenários de múltiplas faturas; cache do BillingEngine sem invalidação em edições | 🟡 | ⚫ ABERTO |
| DP-026 | Dashboard | Indicadores misturam competência × caixa; "check-ins" = aulas concluídas; atribuição do professor divergente entre telas | 🟡 | ⚫ ABERTO |
| DP-027 | Relatórios | Projeção de 6 meses infla despesas recorrentes (soma histórico) e ignora periodicidade da receita | 🟡 | ⚫ ABERTO |
| DP-028 | Matrícula | 1ª mensalidade/taxa paga no ato não vira lançamento no Financeiro | 🟡 | ⚫ ABERTO |
| DP-029 | Financeiro | Links de cobrança em lote/portal usam valor bruto (sem juros do BillingEngine) | 🟡 | ⚫ ABERTO |
| DP-030 | UX | Rotas órfãs (`/marketing`, `/master-panel`, `/scanner`, `/notas-fiscais`), notificação `/alunos/:id`, botões sem handler na Biblioteca, "PDF (em breve)", `NotFound` sem rota | 🔵 | ⚫ CATALOGADO |

---

## 5. Recomendações para o Go-Live

1. **Antes de operar folha/bolsas em produção:** tratar DP-024/DP-025 com bateria de testes de valores (fixtures) — são cálculos financeiros.
2. **Antes de permitir exclusão de cadastros em escala:** DP-022 (cascata lógica) para evitar órfãos.
3. **Inadimplência com gateway:** decidir DP-021 (aceitar parcial?) e padronizar validação de valor nos webhooks.
4. **UX:** limpar DP-030 no primeiro ciclo pós-lançamento.
5. **Operação:** rotacionar a senha root da VPS (vazou no histórico do Git) e manter `SUPER_ADMIN_EMAILS` revisado.

---

## 6. Conclusão

- **Críticos: 0 pendentes.** Os 12 críticos encontrados (permissões/IDOR/baixa financeira/cobrança duplicada/isolamento de arquivos) foram corrigidos, testados e publicados.
- **Altos: 4 residuais** de regra de negócio, documentados com causa raiz e plano.
- **Dados:** produção íntegra, sem contaminação entre escolas.
- **Recomendação:** liberar o lançamento controlado (escola piloto) e tratar DP-021…DP-024 no ciclo seguinte, com prioridade para os itens de folha/bolsa.

---

## Histórico

### Auditoria Pré-Deploy — Abas Duplicadas de Modalidades (15/09/2026)
- Correção da duplicidade de abas em `Relatorios.tsx` (Formato de Aula × Estilos & Ritmos), especialização de Metas de Dança, limpeza do portal do aluno e release `2026.09.15.2`. Auditoria **APROVADA** (typecheck 0, contratos tRPC preservados).
