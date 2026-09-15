# PRD — Plano Diário Robusto (Hardening do Ciclo de Geração, Publicação e Distribuição)

## 1. Visão Geral

### Problema
Auditoria técnica da mutation `progress.generateDailyStudyPlan` e do ciclo de vida do plano diário (`server/routers/progressRouters.ts:443-1294`) identificou 10 lacunas de robustez:

1. **Latência sem controle:** PRD anterior exige ≤8s; o pipeline Groq permite até 4 tentativas × 25s + regeneração — planos podem levar minutos, sem feedback granular no client e sem limite global de tempo.
2. **Envio via WhatsApp usa texto do client:** `sendPlanViaWhatsApp` recebe `planText` do estado local (`Progresso.tsx:377`), podendo divergir do plano persistido no banco.
3. **Despublicar deixa o aluno sem plano:** `publishStudyPlan` marca planos anteriores como `status='inativo'` e não há caminho de volta — despublicar o atual = aluno sem plano, sem forma de republicar do histórico.
4. **`deleteStudyPlan` sem ownership:** valida apenas `organizationId`; qualquer professor da mesma org pode excluir plano de aluno de outro professor (inconsistente com `publishStudyPlan`, que valida dono — fix MÉDIO-13).
5. **Exclusão física:** histórico pedagógico é destruído sem rastro.
6. **Retry sem orçamento de tempo:** 2 tentativas de geração, mas cada `callGemini` pode custar até ~100s (Groq 4×25s) — a soma não é controlada.
7. **Validação de teoria não bloqueante sem rastro:** avisos só vão para `console.warn`.
8. **Zero telemetria:** não há métrica de taxa de retry, contaminação, tempo médio de geração ou adesão.
9. **Invariante de 5 dias implícita:** `toggleStudyPlanDay` hardcoda `dayIndex 0..4`; validação server aceita `>=5` dias; client renderiza dinamicamente — coerente hoje, mas frágil se o formato mudar.
10. **`updateStudyPlan` sem ownership:** mesmo gap do item 4 (apenas org).

### Objetivo
Tornar o ciclo completo do plano diário (geração → revisão → publicação → consumo → distribuição) **resiliente, auditável, seguro por ownership e observável**, sem alterar as regras pedagógicas do prompt nem o contrato visual atual.

### Contexto
- **Módulo:** Progresso / Plano Diário (professor + portal do aluno).
- **Base atual já validada:** PRD_PLANO_DIARIO_METAS.md está implementada (anonimização + foco em metas). Esta PRD NÃO altera prompts pedagógicos.
- **Arquivos envolvidos:**
  - `server/routers/progressRouters.ts` (generateDailyStudyPlan, publish/unpublish/delete/update/sendPlanViaWhatsApp, gets)
  - `server/utils/gemini.ts` (timeouts/retries)
  - `client/src/pages/Progresso.tsx` (botões, modal, envios)
  - `client/src/pages/student/Progresso.tsx` (consumo)
  - `drizzle/schema.ts` + nova migration

---

## 2. Usuários Envolvidos

* **Professor (dono do aluno):** gera, edita, publica, envia e exclui planos. Único com poder de escrita sobre planos dos seus alunos (exceto admin).
* **Administrador da escola:** bypass de ownership (padrão já usado em `publishStudyPlan:1081`), acessa histórico/telemetria da org.
* **Aluno:** consome plano publicado no portal; check-in diário. Sem acesso a rascunhos ou a planos de outros alunos.
* **Sistema (IA):** provedor Gemini/Groq/OpenCode configurado por escola (`server/utils/aiProvider.ts`).

---

## 3. Escopo

### Incluído
- Orçamento global de tempo na geração + retry adaptativo com deadline.
- Feedback de progresso no client durante a geração (estapas + timer decorrido) e guard de duplo clique.
- `sendPlanViaWhatsApp` passa a operar por `planId` (texto vem do banco) + rate limit anti-ban.
- Republicação de planos do histórico (`publishStudyPlan` reativa plano inativo/rascunho).
- Ownership (professor dono ou admin) validado em update/unpublish/delete.
- Soft delete (`deletedAt`) em `daily_study_plans` + filtragem em todas as queries.
- Tabela de auditoria/telemetria `daily_plan_audit_logs` + escrita de eventos em todos os pontos do ciclo.
- Validação estrutural mínima antes de publicar (JSON parseável + `days.length >= 5`).
- Testes vitest focados no novo comportamento.

### Fora do Escopo
- Alteração de prompts pedagógicos, especialistas, validadores de contaminação/teoria ou schema de saída da IA.
- Notificação in-app no momento da publicação.
- Geração automática agendada (cron) de planos.
- Envio automático de WhatsApp na publicação (fica para PRD futura — usa `whatsappAutoSend` já existente como gancho).
- Exportação PDF, planos multissemana, mudanças no portal do aluno além do necessário.

---

## 4. Requisitos Funcionais

### RF-001 — Orçamento global de tempo na geração
**Descrição:** A mutation `generateDailyStudyPlan` deve operar sob um orçamento total de **60s** (`MAX_PLAN_GENERATION_MS`), medido do início da 1ª chamada à IA.
**Atores:** Sistema.
**Pré-condições:** Chave de IA configurada.
**Fluxo principal:**
1. Registra `generationStartedAt = Date.now()`.
2. Antes de cada nova tentativa (retry por JSON inválido, dias < 5 ou contaminação), verifica `elapsed < MAX_PLAN_GENERATION_MS - estimativaRetryMinima (25s)`.
3. Se não houver orçamento, encerra o loop e retorna o erro orientativo correspondente à última falha.
**Exceções:** Se a 1ª tentativa exceder sozinha o budget (timeout interno do provider já cobre), o erro de timeout do provider é propagado com mensagem existente.
**Dados envolvidos:** `durationMs` registrado em auditoria (RF-008).

### RF-002 — Feedback de progresso e guard de duplo clique no client
**Descrição:** Enquanto `generateDailyStudyPlanMutation.isPending`, o botão "Gerar Plano Diário" fica desabilitado e a UI exibe estado de progresso com timer decorrido ("Gerando plano… 12s") e texto de etapa aproximada ("Consultando IA e validando terminologia…").
**Atores:** Professor.
**Fluxo principal:** Clique → `isPending` → UI bloqueada + timer `setInterval` 1s → resposta → toast/estado normal.
**Exceções:** Erro → timer para, botão reabilita, toast com a mensagem do server (ex.: "A IA retornou um plano em formato inválido. Tente gerar novamente.").
**Dados envolvidos:** nenhum (estado local).

### RF-003 — Envio de plano via WhatsApp ancorado no banco (por planId)
**Descrição:** `sendPlanViaWhatsApp` recebe `{ studentId, planId, type }` e carrega o `planText` **do banco** (isolamento `organizationId` + `studentId` correspondente ao plano). O input `planText` deixa de ser aceito.
**Atores:** Professor/Admin.
**Pré-condições:** Plano existente, pertencente ao aluno informado e à org do usuário.
**Fluxo principal:**
1. Busca plano por `id + organizationId` e valida `plan.studentId === input.studentId`.
2. Aplica `checkAndIncrementWhatsAppRateLimit(db, orgId, ctx.user.id)` (padrão `helpers.ts:370`). Se bloqueado, erro claro: "Limite de envios por hora atingido (anti-ban). Tente mais tarde."
3. Resolve telefone (aluno → responsável, nunca ambos) — comportamento atual preservado.
4. Formata JSON → texto (mesma formatação atual) e envia com `sessionId: prof_${ctx.user.id}`.
5. Registra evento `whatsapp_enviado` (RF-008) com `sentTo`.
**Exceções:** plano inexistente/outra org → `NOT_FOUND`; sem telefone → erro atual preservado; rate limit → erro orientativo; falha do robô → erro atual preservado.
**Dados envolvidos:** `daily_study_plans.planText`, `whatsapp_rate_limits`, auditoria.

### RF-004 — Republicação de planos do histórico
**Descrição:** `publishStudyPlan` passa a aceitar **qualquer plano do histórico** (rascunho, publicado ou inativo) do aluno. Ao publicar: plano alvo recebe `status='ativo'` **e** `publishedStatus='publicado'`; demais planos do aluno com `status='ativo'` e `publishedStatus='publicado'` recebem `status='inativo'` (ordem: invalida depois ativa, em transação quando possível).
**Atores:** Professor dono / Admin.
**Pré-condições:** Plano pertence à org; aluno pertence ao professor (ou admin); plano não excluído (RF-006).
**Fluxo principal:** Igual ao atual + reativação. Client expõe botão "Publicar" por item do histórico (modal de histórico já existe em `Progresso.tsx:178-181`).
**Exceções:** plano excluído → `NOT_FOUND`.
**Resultado:** Despublicar + republicar do histórico nunca deixa o aluno sem plano de forma permanente.

### RF-005 — Validação estrutural mínima para publicar
**Descrição:** `publishStudyPlan` valida que `planText` é JSON parseável com `days.length >= 5` antes de publicar. Plano corrompido não pode ser publicado (erro orientativo: "Este plano está corrompido. Edite-o ou gere um novo.").
**Atores:** Sistema.
**Dados envolvidos:** leitura de `planText`.

### RF-006 — Soft delete com rastro
**Descrição:** `deleteStudyPlan` passa a fazer soft delete: set `deletedAt = now()`, `status = 'inativo'`, `publishedStatus = 'rascunho'`. Todas as queries de planos (`getStudentPlanHistory`, `getStudentPlanForTeacher`, `getActiveStudyPlan`, `toggleStudyPlanDay`, `publishStudyPlan`, `updateStudyPlan`, `sendPlanViaWhatsApp`, `deleteStudyPlan`) filtram `isNull(dailyStudyPlans.deletedAt)`.
**Atores:** Professor dono / Admin (ver RF-007).
**Dados envolvidos:** nova coluna `deletedAt timestamp` em `daily_study_plans` (migration).

### RF-007 — Ownership em todas as escritas
**Descrição:** `updateStudyPlan`, `unpublishStudyPlan` e `deleteStudyPlan` validam ownership com o mesmo padrão do `publishStudyPlan:1085-1099`: aluno pertence à org **e** (`professorId === ctx.user.id` OU `admin`). Falha → `FORBIDDEN` ("Você não tem permissão para alterar planos deste aluno.").
**Atores:** Sistema.

### RF-008 — Auditoria e telemetria do ciclo
**Descrição:** Nova tabela `daily_plan_audit_logs` (ver §8) recebe eventos:
- `gerado` (com provider, model, attempts, durationMs, success, contagem de retries, aviso de teoria se houver)
- `validacao_retry` (motivo: json_invalido | dias_insuficientes | contaminação)
- `publicado`, `despublicado`, `republicado`, `editado`, `excluido`, `whatsapp_enviado`, `whatsapp_bloqueado_rate_limit`
**Atores:** Sistema (escrita server-side apenas; nunca exposta ao aluno).
**Pré-condições:** Falha de escrita de log NUNCA impede a operação principal (try/catch com `console.warn`, padrão do projeto).
**Dados envolvidos:** §8.

### RF-009 — Aviso de teoria registrado
**Descrição:** Quando `validateMusicTheoryConcepts` falha na 2ª tentativa (comportamento não bloqueante mantido), o aviso é persistido como evento `gerado` com campo `theoryWarnings` — sai do `console.warn` e vira dado consultável.
**Atores:** Sistema.

### RF-010 — Renderização tolerante no client
**Descrição:** Client professor/aluno já renderiza `days` dinamicamente; formalizar: barra de progresso do aluno (`daysCompleted.filter(Boolean).length / planData.days.length`) e tracker de 5 dias continuam corretos se a IA retornar >5 dias. `toggleStudyPlanDay` server normaliza arrays para o tamanho do plano (mín. 5).
**Atores:** Sistema.

---

## 5. Regras de Negócio

### RN-001 — Texto distribuído = texto persistido
**Regra:** O conteúdo enviado por WhatsApp deve ser idêntico ao `planText` persistido no banco no momento do envio.
**Exemplo válido:** Professor edita e salva (`updateStudyPlan`), envia — o server lê o plano salvo.
**Exemplo inválido:** Professor edita localmente sem salvar e envia — versão local divergente chega ao aluno.
**Consequência:** Input `planText` removido de `sendPlanViaWhatsApp`; client passa `planId`.

### RN-002 — Um único plano publicado por aluno
**Regra:** A cada publicação, apenas 1 plano por aluno fica `status='ativo' + publishedStatus='publicado'` dentro da org.
**Consequência:** Publicar do histórico desativa o anterior (comportamento atual preservado e estendido à reativação).

### RN-003 — Só dono ou admin escreve
**Regra:** Escritas (update/unpublish/delete/publish) exigem `professorId` do aluno = usuário logado, ou role `admin`.
**Exemplo inválido:** Professor B exclui plano do aluno do Professor A (mesma org) → `FORBIDDEN`.
**Consequência:** Blocos de validação copiados fielmente do padrão MÉDIO-13.

### RN-004 — Exclusão é reversível no banco, invisível na UI
**Regra:** Soft delete nunca apaga linha; plano excluído some de todas as queries e não pode ser republicado.
**Consequência:** `deletedAt` não nulo = inacessível em todas as procedures listadas.

### RN-005 — Auditoria nunca bloqueia
**Regra:** Falha ao inserir em `daily_plan_audit_logs` é logada e ignorada; a operação do usuário segue.
**Consequência:** try/catch em todo ponto de escrita de evento.

### RN-006 — Rate limit anti-ban obrigatório no envio
**Regra:** Todo envio por robô WhatsApp de plano passa pelo contador horário da org (30/h padrão).
**Consequência:** Mensagem clara quando bloqueado; fallback permissivo em erro de infra persistido (comportamento do helper mantido).

---

## 6. Fluxos

### Fluxo principal — Geração
```text
Professor clica "Gerar Plano Diário"
↓
Botão bloqueia + timer "Gerando… Ns" (RF-002)
↓
Server: contexto paralelo → prompt → IA (budget 60s, RF-001)
↓
Validações (estrutura → contaminação → teoria) com retry dentro do budget
↓
Persistência rascunho + evento `gerado` (RF-008)
↓
Client: revisão → Liberar / Editar / Enviar WhatsApp
```

### Fluxo alternativo — Republicação
```text
Professor abre histórico → escolhe plano antigo → "Publicar"
↓
Server valida ownership + estrutura (RF-004/005)
↓
Invalida atual publicado → reativa e publica o escolhido
↓
Aluno passa a ver o plano republicado no portal
```

### Fluxo alternativo — Envio WhatsApp
```text
Professor clica "Enviar via WhatsApp"
↓
Client envia {studentId, planId, type}
↓
Server carrega plano do banco → rate limit → telefone (aluno→responsável)
↓
Envio → evento `whatsapp_enviado` → toast com destino (aluno/responsável)
```

### Fluxos de erro
- **Timeout/latência:** budget esgotado → erro orientativo da última falha; timer para; botão reabilita. Nenhum plano parcial é salvo (persistência só ocorre após validação completa — comportamento atual mantido).
- **Rate limit WhatsApp:** toast "Limite de envios por hora atingido…".
- **Plano corrompido ao publicar:** erro orientativo; plano permanece acessível para edição/exclusão.
- **Sem telefone:** comportamento atual preservado (mensagem orienta cadastro).
- **Permissão negada:** `FORBIDDEN` com mensagem uniforme.

---

## 7. Casos Extremos

1. **Duplo clique em Gerar:** botão desabilitado em `isPending` (RF-002); server não possui idempotência — aceito, pois cada geração cria rascunho independente (comportamento atual).
2. **Geração bem-sucedida + falha de escrita de log:** plano é salvo; log perdido é aceitável (RN-005).
3. **Plano do histórico publicado enquanto aluno o estava marcando:** `toggleStudyPlanDay` opera por `planId + studentId`; plano inativo antigo continua toggleável — aceito (dados do histórico), sem quebra.
4. **Todos os planos excluídos:** portal do aluno mostra estado vazio atual ("sem plano ativo"); histórico vazio no client professor.
5. **`days` com 6+ itens da IA:** aceito (`>=5`), client renderiza dinamicamente (RF-010).
6. **Org sem chave de IA:** erro `PRECONDITION_FAILED` atual preservado + evento `gerado (success=false, motivo=sem_chave)`.
7. **Contaminação nas 2 tentativas:** erro orientativo atual + eventos `validacao_retry` ×2.
8. **Envio para responsável:** `sentTo: "guardian"` preservado no retorno e no log.
9. **Plano publicado editado depois:** edição é em cima de plano publicado — permitido hoje; permanece (rascunho/publicado não muda com edição).
10. **Dois professores da mesma org abrem o mesmo aluno:** apenas o dono (ou admin) escreve; leitura mantida para a org (comportamento atual de leitura preservado).
11. **Virada de hora no rate limit:** janela horária truncada já tratada no helper (`helpers.ts:379`).
12. **Migration em produção:** coluna `deletedAt` nullable default NULL — sem backfill necessário; tabela de logs criada vazia.

---

## 8. Dados Envolvidos

### Alteração — `daily_study_plans`
| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| deletedAt | timestamp | Não | NULL = ativo no sistema; set no soft delete (RF-006) |

Demais campos inalterados (`organizationId`, `studentId`, `teacherId`, `planText`, `status`, `publishedStatus`, `daysCompleted`, `daysTimeSpent`, `createdAt`, `updatedAt`, `completedAt`).

### Nova tabela — `daily_plan_audit_logs`
| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| id | serial | Sim | PK |
| organizationId | integer | Sim | Isolamento multitenant |
| planId | integer | Não | Null em eventos de geração que falharam antes de persistir |
| studentId | integer | Sim | Aluno alvo |
| userId | integer | Sim | Quem executou (geração/publicação/envio) |
| event | varchar(40) | Sim | Enum textual: `gerado`, `validacao_retry`, `publicado`, `republicado`, `despublicado`, `editado`, `excluido`, `whatsapp_enviado`, `whatsapp_bloqueado_rate_limit` |
| success | boolean | Sim | Resultado da operação |
| provider | varchar(20) | Não | `gemini` \| `groq` \| `opencode` (só em eventos de IA) |
| model | varchar(80) | Não | Modelo usado (nunca chave) |
| attempts | integer | Não | Tentativas de geração |
| durationMs | integer | Não | Tempo total da mutation |
| theoryWarnings | text | Não | JSON array de avisos (RF-009) |
| errorMessage | text | Não | Mensagem orientativa (sem stack trace) |
| metadata | text | Não | JSON livre (ex.: `sentTo`, motivo de retry) |
| createdAt | timestamp | Sim | Default now |

Índices: `(organizationId, createdAt)`, `(planId)`, `(studentId)`.
Padrão de escrita: reuso do estilo `billing_audit_logs` (`drizzle/schema.ts:380`).

### Nova migration
- `drizzle/0005_daily_plan_hardening.sql` (ou próximo número livre): `ALTER TABLE daily_study_plans ADD COLUMN IF NOT EXISTS "deletedAt" timestamp` + `CREATE TABLE IF NOT EXISTS daily_plan_audit_logs` + índices + snapshot drizzle.

---

## 9. Permissões e Segurança

| Ação | Professor dono | Admin da org | Aluno |
|---|---|---|---|
| Gerar plano | ✅ | ✅ | ❌ |
| Editar plano | ✅ (RF-007) | ✅ | ❌ |
| Publicar/Republicar | ✅ (padrão atual) | ✅ | ❌ |
| Despublicar/Excluir | ✅ (RF-007) | ✅ | ❌ |
| Enviar WhatsApp | ✅ | ✅ | ❌ |
| Ver plano publicado (ativo) | ✅ | ✅ | ✅ (somente o seu) |
| Ver rascunhos/histórico | ✅ | ✅ | ❌ |
| Ler `daily_plan_audit_logs` | ❌ (fase futura p/ admin) | ❌ (fase futura) | ❌ |

Regras de segurança:
- Nenhuma nova superfície pública de leitura de logs nesta PRD (eventos são escritos, não expostos; consulta é etapa futura).
- Isolamento `organizationId` obrigatório em todas as novas queries.
- Mensagens de erro sem stack trace, chaves ou detalhes de infra (mensagens orientativas já existentes são preservadas e reutilizadas).
- `metadata`/`errorMessage` jamais contêm dados sensíveis (telefone não é logado — só `sentTo: student|guardian`).

---

## 10. Tratamento de Erros

### Erros esperados (mensagens controladas)
| Situação | Mensagem |
|---|---|
| Budget de geração esgotado | "A geração demorou mais que o permitido e foi interrompida. Tente novamente ou reduza o tamanho do plano." |
| JSON inválido (2 tentativas) | "A IA retornou um plano em formato inválido. Tente gerar novamente." (atual) |
| Dias < 5 (2 tentativas) | "A IA gerou apenas N dia(s) de treino (esperado: 5). Tente gerar novamente." (atual) |
| Contaminação (2 tentativas) | "O plano gerado conteve termos de outro instrumento (…). Tente reformular a meta ou gere novamente." (atual) |
| Sem chave de IA | "Chave de API da IA não configurada. Acesse Configurações > Inteligência Artificial." (atual) |
| Rate limit WhatsApp | "Limite de envios por hora atingido (anti-ban). Tente novamente mais tarde." |
| Publicar plano corrompido | "Este plano está corrompido. Edite-o ou gere um novo." |
| Sem permissão | "Você não tem permissão para alterar planos deste aluno." |

### Erros internos
- Detalhes técnicos (stack, HTTP status do provider, corpo de resposta) permanecem apenas em `console.error/warn` server-side.
- `errorMessage` em auditoria carrega no máximo a mensagem orientativa (sem PII, sem credenciais).

---

## 11. Requisitos Não Funcionais

- **RNF-001 (Latência controlada):** 95% das gerações concluem em ≤60s (budget hard); erros de timeout chegam ao usuário em no máximo ~90s.
- **RNF-002 (Integridade):** Nenhuma escrita de plano/publicação ocorre sem validação estrutural prévia.
- **RNF-003 (Observabilidade):** 100% das operações do ciclo geram evento de auditoria (com degradação silenciosa em falha de log).
- **RNF-004 (Compatibilidade):** Nenhuma mudança quebrando contrato do `AppRouter` além do input de `sendPlanViaWhatsApp` (client e server atualizados no mesmo commit — ver AGENTS.md regra 3: sem reordenação/renomeação de procedures).
- **RNF-005 (Segurança):** Nenhum log contém chave de API, telefone ou stack trace.
- **RNF-006 (Performance de leitura):** Índices novos garantem queries de histórico/aluno sem full scan adicional relevante.

---

## 12. Critérios de Aceite

- **CA-001:** Dado que a IA leva >60s somando tentativas, quando o budget expira, então o professor recebe erro orientativo em tempo finito e nenhum plano parcial é salvo.
- **CA-002:** Dado que o professor clica em "Gerar", enquanto a mutation está pendente, então o botão fica desabilitado e um timer decorrido é exibido.
- **CA-003:** Dado um plano persistido, quando o professor envia via WhatsApp, então o texto recebido é gerado a partir do `planText` do banco (teste: editar sem salvar → enviar → versão recebida = versão salva).
- **CA-004:** Dado envio de plano via robô, quando a org já atingiu 30 envios na hora, então o envio é bloqueado com mensagem de rate limit.
- **CA-005:** Dado um plano `status='inativo'` no histórico, quando o professor clica em "Publicar" nele, então ele volta a ser o plano ativo/publicado do aluno e o anterior é invalidado.
- **CA-006:** Dado um plano com `planText` corrompido, quando tentado publicar, então ocorre erro orientativo e `publishedStatus` permanece rascunho.
- **CA-007:** Dado professor B (mesma org, não dono, não admin), quando tenta update/unpublish/delete em plano do aluno do professor A, então recebe `FORBIDDEN`.
- **CA-008:** Dado um plano excluído, quando qualquer procedure de leitura/escrita o consulta, então ele não é encontrado (soft delete efetivo).
- **CA-009:** Dado qualquer operação do ciclo, quando executada, então existe linha correspondente em `daily_plan_audit_logs` com org, usuário, evento e resultado.
- **CA-010:** Dado aviso de teoria na 2ª tentativa, quando a geração é concluída, então o evento `gerado` contém `theoryWarnings` e o plano é entregue normalmente.
- **CA-011:** Dado que a escrita de auditoria falha (mock de erro), quando a operação principal é executada, então ela conclui com sucesso.
- **CA-012:** Dado a suíte atual (`pnpm check`, `pnpm test`, `pnpm build`), quando rodada após implementação, então nenhum erro TS novo é introduzido vs. baseline (tsc_baseline.txt) e testes existentes seguem passando.

---

## 13. Riscos e Dependências

### Riscos
- **Contrato tRPC:** mudança de input de `sendPlanViaWhatsApp` precisa ser sincronizada client+server (mitigação: commit único + `pnpm check`).
- **Migration em produção:** usar `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` (padrão `_core/migrate.ts`), idempotente.
- **Falsos bloqueios de rate limit:** orgs com envios legítimos altos — mitigação: limite 30/h igual aos demais fluxos e fallback permissivo se a tabela falhar.
- **Republicação sobrescrevendo progresso:** plano republicado do histórico mantém `daysCompleted` antigos — documentado como comportamento (dados históricos); alternância futura pode resetar (fora do escopo).

### Dependências
- `checkAndIncrementWhatsAppRateLimit` (`server/routers/helpers.ts:370`).
- Padrão de auditoria `billing_audit_logs` (`drizzle/schema.ts:380`).
- `resolveAiCredentials`/`aiCredentialsLogMeta` (`server/utils/aiProvider.ts`) para provider/model em logs (sem chave).
- Tabela `whatsapp_rate_limits` existente.

---

## 14. Métricas de Sucesso

- 0 divergências entre texto enviado por WhatsApp e plano persistido (CA-003 passa).
- 100% dos eventos do ciclo registrados em `daily_plan_audit_logs`.
- P95 de geração ≤60s e 0 gerações "penduradas" sem resposta ao usuário.
- 0 exclusões físicas de planos a partir da release.
- Redução a 0 de chamadas de escrita sem ownership (CA-007).

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Estrutura e dados
- Migration: coluna `deletedAt` + tabela `daily_plan_audit_logs` + índices (idempotente).
- Tipos drizzle re-exportados via `@shared/types` (padrão AGENTS.md).

### Fase 2 — Backend/API (`server/routers/progressRouters.ts`)
- Helper interno `logPlanEvent(...)` com try/catch silencioso.
- `generateDailyStudyPlan`: budget global (RF-001) + eventos `gerado`/`validacao_retry` + `theoryWarnings`.
- `publishStudyPlan`: reativação + validação estrutural (RF-004/005) + eventos.
- `updateStudyPlan` / `unpublishStudyPlan` / `deleteStudyPlan`: ownership (RF-007) + soft delete (RF-006) + eventos.
- `sendPlanViaWhatsApp`: input por `planId` + rate limit (RF-003) + eventos.
- Filtros `isNull(deletedAt)` em todas as queries de plano.

### Fase 3 — Frontend
- `client/src/pages/Progresso.tsx`: guard `isPending` + timer (RF-002); envio passa `planId` (RN-001); botão "Publicar" por item do histórico (RF-004).
- Remover uso de `planText` no mutate do bot (manter formatação client `formatPlanAsText` apenas para o envio manual por link `api.whatsapp.com`, que não passa pelo server).

### Fase 4 — Integrações
- Verificar chamadores de `sendPlanViaWhatsApp` (somente `Progresso.tsx` hoje) e `vps-script/append_progresso.js` se necessário.

### Fase 5 — Testes e verificação
- Novo `server/dailyPlan.audit.test.ts`: ownership (CA-007), soft delete (CA-008), budget (CA-001), rate limit (CA-004), log não bloqueante (CA-011), validação estrutural (CA-006).
- Rodar `pnpm check` → comparar com baseline de erros TS; `pnpm test` (flaky: rodar isolado se necessário); `pnpm build`.
