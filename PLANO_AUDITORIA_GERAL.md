# PRD — PLANO DE AUDITORIA GERAL DO MUSICPRO (QA End-to-End + Dados + Simulação + Varredura de Código)

> Status: Plano aprovado para execução
> Versão: 1.0.0
> Data: 24/08/2026
> Responsável: Analista de Sistemas & QA Sênior (prdspec + asaasauditor)
> Complementa: `ARCHITECTURE_AUDIT.md` (estrutural), `AUDIT_REPORT.md` (18/08), `AUDITORIA_PRODUCAO.md` (19/08)

---

## 1. Visão Geral

### Problema

O MusicPro cresceu para ~91.000 linhas de código, 74 tabelas e 40+ páginas. Apesar de 3 auditorias anteriores mais antigas e das correções recentes (82/82 testes verdes, typecheck 0 erros), **nunca foi feita uma auditoria que combine**:

1. Teste funcional **end-to-end de TODAS as funcionalidades** (click-a-click, por módulo);
2. Verificação de **correção de dados** no banco de produção (consistência, órfãos, duplicados, valores financeiros);
3. **Simulação completa de uma escola de música** operando o sistema do zero (lead → matrícula → aulas → cobrança → lembretes → relatórios → portal);
4. **Varredura minuciosa do código** para encontrar bugs latentes (causa raiz) que os testes não cobrem.

### Objetivo

- Testar 100% das telas, botões, modais, formulários, rotas e fluxos tRPC/API.
- Verificar se os dados gravados estão corretos (valores, status, datas, isolamento entre escolas).
- Simular uma escola de música completa em um ambiente real, do primeiro lead ao relatório financeiro.
- Gerar um **relatório final completo**: o que foi testado, o que passou, o que falhou, causa raiz e correção sugerida para cada bug encontrado.
- Reduzir a probabilidade de bugs futuros encontrando padrões de código perigosos antes que virem incidentes.

### Contexto

- Sistema: MusicPro (React 19 + Vite + wouter + tRPC 11 + Express + Drizzle/Postgres) em produção em `https://wrmusicpro.com.br` (VPS Docker Compose + Caddy).
- Estado atual: `pnpm check` 0 erros, `pnpm test` 82/82, `pnpm build` OK, deploy git-based (`vps-script/deploy_production.js`).
- Histórico: 19 bugs corrigidos na auditoria de 18/08 (4 P0), 8 erros TS removidos na de 19/08.
- Documentos vivos: `PRD_MASTER.md` (governança de funcionalidades) e `ARCHITECTURE_AUDIT.md` (não apagar).

---

## 2. Usuários Envolvidos

| Papel | Sistema | O que faz |
|---|---|---|
| **Dono/Professor (Admin)** | Painel web | Gerencia alunos, aulas, financeiro, automações, relatórios, configurações |
| **Aluno** | Portal do aluno (`/aluno`) | Vê aulas, materiais, mensalidades, treinos, contrato, avisos |
| **Lead** | Landing + WhatsApp | Matricula-se, agenda aula experimental |
| **SuperAdmin** | Painel SuperAdmin | Planos, cupons, impersonação, conteúdo da landing |
| **Professor secundário** | Painel web | Acessa somente alunos/aulas/agenda que lhe pertencem |

---

## 3. Escopo

### Incluído

1. **Leitura total do código** (client + server + shared) com busca de causas raiz;
2. **Teste funcional E2E** de todos os módulos (matriz na seção 4);
3. **Simulação de escola de música** completa (seção 6);
4. **Auditoria de dados** no banco de produção (somente leitura, com backup prévio) (seção 8);
5. **Auditoria de segurança e isolamento multi-tenant** (seção 9);
6. **Relatório final** com classificação CRÍTICO/ALTO/MÉDIO/BAIXO (seção 16).

### Fora do escopo

- Refatorações de arquitetura (serão **sugeridas**, não executadas);
- Migrações de schema/banco (apenas relatório; execução vira PRD à parte);
- Testes de carga/performance de alto volume (apenas testes de tempo de resposta básicos);
- Mudanças de design/UX (apenas diagnóstico);
- Corrigir bugs encontrados (será feito em fase própria, somente com aprovação);
- Testes no app Android/Capacitor (somente verificação visual manual opcional).

---

## 4. Requisitos Funcionais (matriz de teste por módulo)

> Cada RF vira um checklist de QA. Legenda de resultado: ✅ passou / ❌ falhou / ⚠️ falha parcial / ➖ não aplicável.

### RF-001 — Autenticação e sessão (`authRouters.ts`, `server/_core/context.ts`)
- Login com senha correta/incorreta; cadastro de novo usuário; logout.
- `auth.me` não expõe segredos (passwordHash/tokens).
- Sessão expirada/JSON inválido → redireciona para login sem crash.
- Impersonação (SuperAdmin) → banner visível, desfazer impersonação restaura usuário original, senha do usuário NÃO é alterada.

### RF-002 — Dashboard
- Cards e gráficos refletem dados reais (alunos ativos, aulas do mês, receita, taxa de conclusão).
- Filtro "meus alunos" para professor secundário.
- Nenhum card mostra dado 0/NaN indevido.

### RF-003 — Agenda e Aulas (`lessonsRouters.ts`, `Aulas.tsx`)
- CRUD de aula avulsa e recorrente (semanal, 2x..4x/semana, semanas 1..52).
- `checkConflicts` bloqueia salas/horários sobrepostos; fluxo de conflito com "agendar mesmo assim".
- 4 visões (dia/semana/mês/lista), troca de status (agendada → concluída/cancelada/remarcada).
- Aula sem aluno (experimental), aula com sala, aula online (link).

### RF-004 — Alunos (`studentsRouters.ts`, `Alunos.tsx`, `NovoAluno.tsx`)
- CRUD completo, busca/filtros (status, instrumento, professor), badges.
- Cadastro com CPF/RG válidos e inválidos; menor de idade exige responsável.
- **Regressão testada desta rodada:** "Salvar Aluno" com seção "Agendar Aula" preenchida DEVE criar aluno + aulas; sem seção preenchida DEVE criar só o aluno.
- Importação/exportação CSV; duplicados bloqueados (e-mail/CPF).
- Geração de mensalidades automáticas na matrícula (`generateMonthly`).

### RF-005 — Professores e Salas (`professoresRouters.ts`, `studioRoomsRouters.ts`)
- CRUD de professores (vínculo ao aluno), permissão de acesso.
- CRUD de salas de estúdio, ocupação, categoria/capacidade/equipamentos.

### RF-006 — Financeiro: Mensalidades (`financeiroRouters.ts`, `MensalidadesTab.tsx`, `services/BillingEngine.ts`)
- Geração de vencimentos (mensal/trimestral/anual) com `buildDueDateSeries` (ajuste fim de mês).
- Juros/multa/carência SEMPRE via BillingEngine; verificar cenários:
  - atraso <= carência → sem multa;
  - atraso com multa % + juros diários; teto/juros sobre multa (regras documentadas);
  - pagamento parcial → recalculo correto.
- Baixa manual, baixa via link Asaas/MP, estorno.
- Marcação automática de atraso (`markOverdueRows`/`getTodayBR`).

### RF-007 — Financeiro: Despesas e Folha (`DespesasTab.tsx`, `ProfessorExtract.tsx`, `ProfessorPaymentService.ts`)
- CRUD de despesas (categorias, recorrência, conta, fornecedor).
- Folha de professores: cálculo de aulas concluídas do período, percentual, `calculateAndSaveProfessorPayment` ÚNICA fonte.

### RF-008 — Biblioteca/Materiais (`components/progresso/BibliotecaMusical.tsx`, `pages/student/Materiais.tsx`)
- Upload de arquivos, pastas, permissão por aluno.
- **Regressão:** visualização de arquivos pelo aluno via token temporário (`fileTokens.ts`) — expiração em 30 min, arquivo inexistente → 404 amigável, acesso sem token → negado.
- Fallback visual quando upload não carrega (pedestal ausente → placeholder).

### RF-009 — Portal do Aluno (`portalRouters.ts`, `pages/student/*`)
- Login do aluno, dashboard, agenda de aulas, materiais, mensalidades + link de pagamento, treinos/planos de estudo, contrato e assinatura, avisos.
- Professor só enxerga dados do próprio aluno (isolamento).

### RF-010 — Relatórios (`reportsRouters.ts`, `report_engine/`, `Relatorios.tsx`)
- 8 abas/relatórios exportáveis (PDF/CSV/XLSX): financeiro, alunos, aulas, ocupação, folha, etc.
- Totais batem com o Financeiro (cross-check com RF-006).

### RF-011 — Configurações (`Configuracoes.tsx`, 14 abas)
- Dados da escola (nome, CNPJ, endereço, horas, duração de aula) — **regressão:** salvar espelha em `organizations`.
- Asaas (BYOK, chave criptografada AES-256-GCM), Mercado Pago, PIX, juros/multa configuráveis.
- WhatsApp (QR/código de pareamento 8 dígitos, sessão ativa/inativa, retry + fallback QR se código inválido).
- PWA, tema, notificações, acesso do aluno, IA (Groq/Gemini), exportação de dados.

### RF-012 — Automações e Lembretes (`comunicacaoRouters.ts`, `automationJob.ts`, `Automacoes.tsx`)
- Regras de lembrete (aula 1h/30min, mensalidade, ausência) com disparo real/simulado.
- Regras com `sendToStudent`/`sendToGuardian`, canal WhatsApp, templates com placeholders.
- `allowAutoReminders=false` no aluno → NÃO dispara (verificação de respeito à regra).
- Respawning de lembretes (não duplica no mesmo ciclo).

### RF-013 — WhatsApp e Chatbot (`utils/whatsapp.ts`, `webhooks/whatsapp.ts`)
- Pareamento (QR/código), envio de mensagem, status da sessão.
- Webhook autenticado (`X-Webhook-Token`) → sem token 401, token errado 401, correto processa.
- Fluxos do chatbot (aulas, financeiro, agendar, reagendar, indicar amigo, matrícula, humano, MENU/SAIR) — simular sessão com dados reais.
- Comprovante de pagamento → aviso à escola (NUNCA baixa automática, regra P0).

### RF-014 — Contratos e Assinatura Digital (`contratosRouters.ts`, `contractService.ts`, `signature/`)
- Criar contrato, enviar para assinatura (provedor BYOK), status (rascunho → aguardando → assinado/expirado/erro), webhook com idempotência (`contract_events`).
- Cancelamento/expiração.

### RF-015 — CRM e Leads (`crmRouters.ts`, `LeadsApp.tsx`)
- Pipeline/kanban com stages, temperatura, responsável, perda com motivo.
- Conversão lead → aluno preserva dados; agenda aula experimental a partir do lead.

### RF-016 — Marketing e Analytics (`marketing/*`, `AnalyticsDashboard.tsx`)
- Campanhas (contatos, status, filas), agendamento de disparo, logs de envio.
- Dashboard de analytics e insights de IA; métricas de segurança logadas.

### RF-017 — IA (`aiRouters.ts`, `utils/gemini.ts`, `utils/aiContext.ts`)
- Chat com a escola (IA), documentos com extração de texto, automações IA.
- Fallback quando chave/API indisponível → mensagem amigável, sem crash.

### RF-018 — SuperAdmin e paywall (`superAdminRouter.ts`, `SuperAdmin.tsx`, `helpers.ts`)
- Planos (limites de alunos, excedentes), cupons, assinatura Asaas (`syncOrgAsaasSubscription`, `reconcileOrgAsaasCharges`).
- Impersonação com segurança (só e-mails/origem de env).
- Bloqueio por limite de plano (ex.: escola acima do `maxStudents` não cadastra mais aluno).

### RF-019 — Landing Page
- Seções, planos com preços corretos, formulário de matrícula → lead, links de pagamento por plano.

### RF-020 — Integrações de pagamento (webhooks Asaas/MP/NF-e)
- Webhook de confirmação → baixa em `payment_dues` idempotente (não duplica baixa).
- Emissão NFS-e via FocusNFe (sandbox).

---

## 5. Regras de Negócio (verificação explícita durante a auditoria)

### RN-001 — Fonte única de juros/multa
- **Regra:** Todo cálculo de atraso usa `server/services/BillingEngine.ts`; client NUNCA recalcula.
- **Verificação:** buscar `formatCurrency|monthlyFee * 0.0|multa|juros` fora da lib/engine; qualquer ocorrência vira achado ALTO.

### RN-002 — Fonte única de data de vencimento
- **Regra:** `buildDueDateSeries` lida com fim de mês e periodicidade (mensal 30d/trimestral/anual).
- **Verificação:** gerar série começando 31/01 e conferir ausência de pulos/datas inválidas.

### RN-003 — "Está atrasado?" só no server
- **Regra:** `markOverdueRows`/`getTodayBR`/`toISODate` em `helpers.ts`; client consome status pronto.
- **Verificação:** filtrar uso de `new Date()` para decidir atraso no client.

### RN-004 — 4 fluxos legítimos de `markPaid` (não criar 5º)
- Asaas+NFS-e+reminders · expenses · professorPayments · portal c/ IA.
- **Verificação:** cada baixa da simulação deve cair exatamente no fluxo correto.

### RN-005 — Folha de professor
- **Regra:** `ProfessorPaymentService.calculateAndSaveProfessorPayment` é a única fonte; aulas "concluídas" no período entram; canceladas não.
- **Verificação:** simular mês com aula cancelada → valor não deve contar.

### RN-006 — Lembrete respeita `allowAutoReminders`
- **Regra:** aluno com flag desligado não recebe lembretes automáticos (cobrança/aula/treino).
- **Exemplo inválido:** flag `false` + lembrete disparado = bug ALTO.

### RN-007 — Webhook de pagamento é idempotente
- **Regra:** mesmo evento recebido 2x não duplica baixa/auditoria (`billing_audit_logs`).
- **Verificação:** disparar 2x o mesmo payload no ambiente de teste.

### RN-008 — Comprovante WhatsApp nunca baixa automaticamente
- **Verificação:** payload com "paguei/comprovante" → apenas notifica professor; `payment_dues.status` permanece `pendente`.

### RN-009 — Isolamento multi-tenant por `organizationId`
- **Verificação:** usuário da Escola A não lista/edita dados da Escola B em NENHUMA procedure (tabela de isolamento na seção 9).

### RN-010 — Excedente de plano
- **Regra:** `getOrgPlanLimits` + `syncOrgAsaasSubscription` controlam alunos extra (preço por excedente).
- **Verificação:** escola no limite → cadastro bloqueado com mensagem; liberado após upgrade.

---

## 6. Fluxos (Simulação de Escola de Música)

### 6.1 Fluxo Principal (Simulação "Escola Harmonia" — perfil completo)

```text
SuperAdmin
↓ 1. Cria usuário admin "Prof. Walysson" + organização "Escola Harmonia" (plano Pro, limite 20 alunos)
Admin
↓ 2. Configurações: dados da escola, CNPJ, horário 08h-18h, duração 60min, Asaas sandbox, PIX, juros 2%+0,33%a.d., carência 3d, WhatsApp pareado
↓ 3. Cadastra 2 salas (Estúdio A, B) e 1 professor secundário "Prof. Ana"
↓ 4. Cadastra 3 alunos (1 via formulário, 1 via importação, 1 via conversão de lead) com vencimentos automáticos
↓ 5. Agenda aulas: avulsa + recorrente 2x/semana (8 semanas) com sala/ocupação e conflito forçado
↓ 6. Marcas 1 aula concluída, 1 cancelada (comporta folha do professor)
↓ 7. Gera mensalidades; deixa 1 atrasar (verifica juros/multa no vencimento+15 dias)
↓ 8. Baixa 1 recebimento via link Asaas (mock) + 1 manual + confere auditoria
↓ 9. Cria lembrete de aula e de mensalidade; confirma disparo no log
↓ 10. Emite relatório financeiro mensal e exporta (PDF/CSV/XLSX)
↓ 11. Portal do aluno: "João" loga, vê aulas, paga link, baixa material, assina contrato
↓ 12. Aluno novo via bot: "Maria" envia MENU no WhatsApp simulado → matricula → fluxo agendar
↓ 13. Dashboard reflete os totais esperados (cross-check com banco)
```

### 6.2 Fluxos Alternativos
- Cadastro com CPF duplicado / e-mail duplicado → bloqueio com mensagem específica.
- Aula em sala ocupada → fluxo de conflito → "agendar mesmo assim" com `force`.
- Menu do bot com escola sem chatbot habilitado → "robô desativado", responde 200 sem ação.
- Impersonação: SuperAdmin vira o usuário e volta (restaura).

### 6.3 Fluxos de Erro
- API Groq/Gemini indisponível → resposta amigável do bolha, sem 500 no webhook.
- Upload maior que o limite → erro controlado (sem crash).
- Token de arquivo expirado → 404/401 amigável no portal.
- Servidor derruba no meio da simulação (semáforo: nenhum estado consistente quebrado — validar com queries de integridade).

### 6.4 Fluxo de Cancelamento
- Cancelar matrícula (aluno inativo) → mensalidades futuras do aluno não são cobradas/lembretes param.

---

## 7. Casos Extremos (checklist obrigatório por módulo)

- [ ] Campo vazio em todo formulário (nome, CPF, telefone, email, valor);
- [ ] Dados inválidos (CPF 000.000.000-00, RG só zeros, telefone 0+, email sem @);
- [ ] Duplicados (CPF/email repetido; aula no mesmo horário/sala);
- [ ] Duplo clique em salvar (criação duplicada de aluno/aula/mensalidade);
- [ ] Data no passado no agendamento → bloqueado (`BUG #9` regressão);
- [ ] Data 31 do mês / fim de ano / ano bissexto (28/02 → vencimento);
- [ ] Fuso horário (BRT) nas datas de aula/lembrete (não usar UTC cru);
- [ ] Virada de mês entre geração e visualização de mensalidades;
- [ ] Registro inexistente (editar/excluir aluno já removido);
- [ ] Lista vazia (dashboard sem alunos, relatório sem aulas, portal sem materiais);
- [ ] Sessão expirada no meio do fluxo (tRPC retorna 401 → UX de logout);
- [ ] Aluno sem `organizationId`/órfão de org (auto-atribuição `getUserByOpenId`);
- [ ] Pagamento parcial, pagamento a maior, pagamento em valor para 2 mensalidades;
- [ ] Pagamento após expiração do link Asaas;
- [ ] Exclusão de professor com alunos vinculados;
- [ ] Exclusão de sala com aulas futuras agendadas;
- [ ] Mesmo webhook enviado 2x (idempotência);
- [ ] Token de arquivo para arquivo inexistente/renomeado;
- [ ] Mensagem do bot com texto de 1 caractere; MENU maiúsculo/minúsculo; opção inexistente;
- [ ] Aluno com `allowAutoReminders=false` e lembrete programado;
- [ ] Escola no limite do plano tentando cadastrar aluno extra;
- [ ] Emoji/longa string em observações (limite 500 no client, bcrypt/DB ok);
- [ ] 2 usuários editando a mesma mensalidade/agenda ao mesmo tempo (última escrita vence sem corrupção de SQL).

---

## 8. Dados Envolvidos (verificação de integridade no banco de produção)

> Execução: **somente leitura** (SELECT), com dump de backup criado antes (`pg_dump`) — vias `docker compose exec -T db`.

### 8.1 Queries de consistência (checklist)

| Q | Verificação | Query de exemplo (conceito) |
|---|---|---|
| Q1 | Alunos sem `organizationId` (órfãos) | `SELECT count(*) FROM students WHERE organizationId IS NULL` |
| Q2 | Alunos com professor de outra org | `students.professorId` → `users.organizationId` divergente |
| Q3 | Duplicados de CPF/email ativos | `GROUP BY cpf HAVING count>1` (desconsiderar soft-deleted) |
| Q4 | Aulas agendadas sem aluno (`studentId` null) por org | `lessons WHERE studentId IS NULL AND org X` (validar se experimental) |
| Q5 | Aulas no passado ainda `agendada` (não canceladas/auto-marcadas) | `scheduledAt < now() AND status='agendada'` |
| Q6 | Mensalidades pagas sem vínculo com aluno ativo | `payment_dues JOIN students status` |
| Q7 | Valor `monthlyFee` do aluno ≠ valor da mensalidade gerada | cross-check na simulação |
| Q8 | Soma de receita do dashboard == `SUM(amount) STATUS pago` do mês | RF-002 + RF-006 |
| Q9 | Multiplicidade de mensalidades no mesmo mês para o mesmo aluno (duplicação) | `GROUP BY studentId, month, year HAVING count>1` |
| Q10 | Usuários duplicados (mesmo email/openId) | `GROUP BY email HAVING count>1` |
| Q11 | `logs` de automação com payload sem remetente (falha silenciosa) | tabelas de automação/logs |
| Q12 | Token store (`fileTokenStore`) vazando: tokens válidos após 30 min | teste de expiração no ambiente |
| Q13 | Contratos sem `userId`/`studentId` válido | `contracts` joins |
| Q14 | `settings` de org sem `organizations` correspondente | `settings.organizationId` órfão |
| Q15 | Vencimentos duplicados após geração dupla (duplo clique) | série gerada 2x na simulação |

### 8.2 Entidades principais envolvidas

`organizations`, `users`, `students`, `lessons`, `payment_dues`, `expenses`, `professor_payments`, `settings`, `studio_rooms`, `professores`, `reminders`, `message_automation_rules`, `chatbot_sessions`, `contracts`, `crm_leads`, `marketing_*`, `billing_audit_logs`, `student_files`, `daily_study_plans`, `system_plans`, `system_coupons`.

### 8.3 Valores padrão e integridade
- `status` de aula/mensalidade obrigatórios e dentro do enum (checar enums `reminder_type`, `contract_status` etc. no Postgres);
- Chaves estrangeiras com índices existentes (`idx_students_org_status`, etc.);
- Soft delete respeitado (status `cancelado`/`inativo` vs DELETE físico — nenhuma exclusão física indevida em produção).

---

## 9. Permissões e Segurança

### 9.1 Matriz de acesso (a ser testada)

| Recurso | Admin/Dono | Professor | Aluno (portal) | SuperAdmin | Público |
|---|---|---|---|---|---|
| Alunos (list/create/edit) | ✅ | parcial (só os seus) | ❌ | ✅ | ❌ |
| Aulas/agenda | ✅ | parcial (só as suas) | só as suas | ✅ | ❌ |
| Financeiro | ✅ | ❌ (depende de config) | só as suas mensalidades | ✅ | ❌ |
| Relatórios | ✅ | parcial | ❌ | ✅ | ❌ |
| Portal do aluno | — | — | ✅ | — | ❌ |
| Landing | — | — | — | — | ✅ |
| SuperAdmin | ❌ | ❌ | ❌ | ✅ (env-only) | ❌ |
| Materiais/arquivos | ✅ | pelos alunos | com token 30min | ✅ | ❌ |

### 9.2 Testes de segurança (checklist)

- [ ] **Isolamento entre escolas:** para cada módulo principal, usuário da Escola A consulta proceduralmente um id da Escola B e espera `NOT_FOUND`/negado (nunca dado vazio com 200 traindo o erro);
- [ ] Rotas tRPC sem `protectedProcedure`/`ctx.user` (routes públicas indevidas) — varredura no código (`rg "publicProcedure"` e análise de cada uma);
- [ ] `fileTokens`: URL com token expirado/inválido → negado; token de arquivo de outra org → negado;
- [ ] Webhook WhatsApp: sem `X-Webhook-Token` → 401 (regressão P0);
- [ ] Webhooks Asaas/MP: verificação de assinatura/valor antes de baixar;
- [ ] SuperAdmin: acesso apenas via env (`ownerOpenId`/e-mails auditados) e rotas protegidas no backend;
- [ ] Impersonação: não vaza dados do impersonador; volta ao estado original;
- [ ] Erros tRPC não expõem SQL/pilha (mensagens amigáveis via `shared/_core/errors.ts`);
- [ ] Senhas/tokens/chaves: nada hardcoded em código (varredura `rg` por `apiKey|secret|password` fora de `.env.example`);
- [ ] API de configuração não retorna campos criptografados em claro (Asaas/MP/Groq/Gemini).

---

## 10. Tratamento de Erros

### Erros esperados (mensagem controlada)
- "Preencha os campos obrigatórios." / "CPF inválido." / "Telefone inválido." / "Este registro já existe."
- "A data de início não pode ser no passado."
- "Horário já ocupado nesta sala — deseja agendar mesmo assim?"

### Erros internos (nunca expor detalhes)
- "Erro ao cadastrar aluno." / "Ocorreu um erro ao processar sua solicitação. Tente novamente."
- Verificação: nenhuma mensagem de erro do client contém SQL/stack trace (varredura de código + teste manual com API derrubada).

---

## 11. Requisitos Não Funcionais (verificação)

- **RNF-001 Performance:** páginas principais (Dashboard, Alunos, Aulas, Mensalidades) respondem < 2s em produção; loading/spinner sempre presente; `staleTime` adequado.
- **RNF-002 Segurança:** isolamento (seção 9), criptografia em repouso, tokens curtos, webhooks autenticados.
- **RNF-003 Responsividade:** telas principais em mobile (375px) e desktop — nenhum overflow horizontal crítico.
- **RNF-004 Disponibilidade:** app não derruba após erros de API (key de IA inválida, webhook malformado, upload falho).
- **RNF-005 Consistência temporal:** datas em BRT; lembretes não atrasam mais de 60s no ciclo do job.
- **RNF-006 Logs:** erros do servidor gravados com contexto (org, userId, rota) sem dados sensíveis.

---

## 12. Critérios de Aceite (da auditoria como entrega)

- **CA-001** — 100% dos RF-001..RF-020 executados no ambiente de teste com resultado registrado.
- **CA-002** — Simulação "Escola Harmonia" completa de ponta a ponta, com evidências (screenshots, JSONs de respostas, dump das tabelas criadas) e totais conferidos (dashboard == banco == relatório).
- **CA-003** — Queries Q1..Q15 executadas em produção (leitura) com resultado documentado; qualquer anomalia vira achado.
- **CA-004** — Varredura estática completa produz lista de achados por arquivo:linha com causa raiz e correção sugerida.
- **CA-005** — Relatório final (`AUDIT_REPORT_2026_08.md`) gerado com: resumo executivo, matriz por módulo (✅/❌/⚠️), bugs classificados (CRÍTICO/ALTO/MÉDIO/BAIXO com módulo, problema, impacto, como reproduzir, correção sugerida), veredito e plano de correção priorizado.
- **CA-006** — Nenhuma alteração em produção além de leituras; nenhum dado real alterado/removido durante a auditoria.

---

## 13. Riscos e Dependências

### Riscos
| Risco | Mitigação |
|---|---|
| Auditoria em produção alterar dados reais | Ambiente de teste próprio para simulação; produção somente leitura + backup |
| Simulação poluir o banco (orgs/alunos de teste em prod) | Usar org dedicada "Escola Harmonia (QA)" bem identificada; removida/arquivada ao final com aprovação |
| WhatsApp real disparar mensagens durante simulação | Usar instância/pareamento em sandbox ou suprimir envio real (flag/stub) |
| Serviços externos (Asaas/MP/Groq) indisponíveis | Usar sandbox/mocks; registrar falha como achado |
| Chaves de API criptografadas impedirem teste | Decifrar apenas em memória no ambiente de teste |
| Falsos positivos na varredura estática | Revisão manual de cada achado antes de classificar |

### Dependências
- Acesso SSH à VPS (leitura + backup) — usuário fornece `VPS_PASSWORD` (já disponível nesta sessão);
- Credenciais de teste de sandbox Asaas/MP (ou uso de mocks com replay);
- Instância WhatsApp em modo de teste;
- Aprovação do dono para criar org de QA em produção OU ambiente staging funcional (decisão pendente).

---

## 14. Métricas de Sucesso

- % de módulos com teste funcional concluído (meta: 100%);
- Nº de bugs encontrados por severidade (meta: 0 CRÍTICO em produção);
- Precisão da varredura estática (achados confirmados ÷ total reportado ≥ 90%);
- Tempo médio de resposta das telas principais (meta < 2s);
- Nº de testes automatizados novos gravados a partir da auditoria (meta ≥ 5 testes de regressão adicionados para os bugs encontrados).

---

## 15. Plano de Implementação Sugerido

### Fase 0 — Preparação (≈2h)
1. Definir ambiente: **decisão pendente** — (a) org de QA na produção com banco isolado, ou (b) ambiente staging `staging.wrmusicpro.com.br` com dados reais replicados (anônimos). Recomendação: **(a)**.
2. Backup completo do banco (`pg_dump`) antes de qualquer leitura.
3. Criar conta/org "Escola Harmonia (QA)"; parear WhatsApp de teste; preparar mocks (Asaas sandbox, chave Groq/Gemini de teste).

### Fase 1 — Integridade de dados (produção, leitura) (≈3h)
1. Executar Q1..Q15, documentar resultados por org relevante.
2. Conferir enums/constraints/FKs; conferir índices existentes vs plano.
3. Mapear Hotspots: orgs com muitos alunos, órgãos órfãos, mensalidades duplicadas.

### Fase 2 — Simulação E2E "Escola Harmonia" (≈6h)
1. Executar fluxos da seção 6 (RF-001..RF-020 na ordem de negócio).
2. Registro de evidências (screenshots + payloads + totais).
3. Cross-check dashboard ↔ banco ↔ relatório (Q8).

### Fase 3 — Varredura estática de código (≈5h)
1. Anti-duplicação financeira (RN-001..RN-005) via `rg` e leitura dirigida.
2. Análise de `publicProcedure`, middleware de auth, `getDb()` em rotas, `markPaid` (4 fluxos), `buildDueDateSeries`, `BillingEngine`, `automationJob` (ciclo de lembretes), webhooks (idempotência), `fileTokens`, `portalRouters` (isolamento).
3. Revisão das telas monolíticas (NovoAluno, Configuracoes, Progresso, Aulas) para bugs de estado lógico (deps de useEffect, stale data, double-submit).

### Fase 4 — Segurança e isolamento (≈3h)
1. Matriz do RF-009/seção 9 em execução automática (scripts tRPC com ids de outra org).
2. Varredura de segredos no código.
3. Revisão de webhooks e tokens.

### Fase 5 — Relatório final + pendências (≈2h)
1. Consolidar achados em `AUDIT_REPORT_2026_08.md` (formato da seção 16).
2. Priorizar correções por severidade; gerar PRDs/checklists de correção para os bugs aprovados.
3. Registrar regressões novas no `pnpm vitest` (quando aplicável) e atualizar `PRD_MASTER.md`.

---

## 16. Formato do Relatório Final

### `AUDIT_REPORT_2026_08.md`
1. Resumo executivo (tabela: módulos, RFs, resultados, bugs por severidade).
2. Matriz completa RF-001..RF-020 com ✅/❌/⚠️ e evidências.
3. Simulação: resumo das etapas, totas conferidos (alunos, aulas, receita, folha, lembretes).
4. Resultados das queries de dados (Q1..Q15) — tabela com achados.
5. **Bugs encontrados** — por achado:

```
Módulo:
Problema:
Impacto:
Como reproduzir:
Causa raiz (arquivo:linha):
Correção sugerida:
Prioridade (CRÍTICO/ALTO/MÉDIO/BAIXO):
```

6. Veredito geral e plano de correção priorizado (P0 → P3).
7. Lições e recomendações de arquitetura (sem executar refactors).

---

## Checklist Final do Analista (validação do plano)

- [x] Problema e objetivo claramente definidos;
- [x] Usuários envolvidos identificados;
- [x] Escopo incluído/fora do escopo definido;
- [x] Requisitos funcionais com identificadores (RF-001..RF-020);
- [x] Regras de negócio explícitas (RN-001..RN-010);
- [x] Fluxos principal/alternativos/erro documentados;
- [x] Casos extremos mapeados;
- [x] Dados e queries de integridade definidos;
- [x] Permissões e segurança (matriz + checklist);
- [x] Tratamento de erros definido;
- [x] RNFs verificáveis;
- [x] Critérios de aceite objetivos;
- [x] Riscos/dependências mapeados (decisão pendente: ambiente);
- [x] Métricas de sucesso;
- [x] Plano em fases com entregáveis;
- [x] Formato do relatório final definido.