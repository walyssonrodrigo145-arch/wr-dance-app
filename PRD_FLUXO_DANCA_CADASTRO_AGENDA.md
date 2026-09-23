# PRD — Fluxo de Dança: Cadastro de Alunos e Agenda por Turma

**Status:** Decisões aprovadas em 18/09/2026 — implementação em fases · **Módulos:** Alunos + Turmas & Vagas + Aulas/Agenda + Reposições + Planos & Bolsas + Financeiro
**Base:** mapeamento do código em 18/09/2026 (pós-auditoria `6cfa052`)

---

## 0. Decisões Aprovadas (respostas do dono)

| # | Pergunta | Decisão |
| --- | --- | --- |
| 1 | Gerar aulas sem alunos? | **Sim** — a grade gera as aulas (sessões) mesmo sem aluno; a lista de presença vem da turma na chamada. |
| 2 | Crédito de reposição automático? | **Não** — continua **manual** (professor/admin cria o crédito a partir da aula). |
| 3 | Cobrança | **Adaptável a qualquer escola**: modo de cobrança configurável por escola/plano (mensal, bimestral, trimestral, semestral, anual, ou período à vista com desconto), sem travar num único modelo. |
| 4 | Calendário de feriados/recessos | Não respondido — **fora do escopo desta fase**; aulas podem ser canceladas individualmente (já existe). |
| 5 | Ensaio geral/aula conjunta | **Turma temporária** (turma com validade/avulsa na agenda). |
| 6 | Chamada | **Os dois modos**: professor no celular e recepção no desktop (mesma tela responsiva, com permissões). |

### Consequência arquitetural da decisão 1 (importante)
Como a grade gera aulas **sem alunos**, a aula passa a ser uma **sessão da turma** (não mais uma linha por aluno):
- `lessons.turmaId` preenchido e `studentId` nulo = sessão de turma (o título é o nome da turma).
- Presença deixa de ser "status da aula do aluno" e passa a ser **registro por aluno**: nova tabela `lesson_attendance` (`lessonId` + `studentId` + `presente|ausente|justificado`), alimentada pela chamada (e pelo QR, futuramente).
- Aulas avulsas (particular/experimental/reposição) continuam como hoje (`studentId` preenchido, sem `turmaId`).
- Portal do aluno e Folha são adaptados nesta fase para ler sessões de turma (portal) e não duplicar remuneração (folha).

---

## 1. Visão Geral

### Problema
O cadastro de alunos e o agendamento de aulas ainda operam com o eixo de **escola de música**:

1. O aluno é cadastrado em torno de uma "modalidade principal" (`students.instrumentId`) e de um `lessonType` cujo default é `individual` (`drizzle/schema.ts:166`, `studentsRouters.ts:478`).
2. As aulas nascem **por aluno**: `lessons.create`/`createBatch` (avulsa ou recorrente) e `createTurma` (N alunos × N semanas com título livre) — nenhum deles usa a tabela `turmas` (`lessonsRouters.ts:312-456, 1226-1415`).
3. A **turma não gera aulas**: `turmas.create/update` gravam só metadados (`turmasRouters.ts:284-351`) e `lessons` **não tem `turmaId`** (`drizzle/schema.ts:192-223`).
4. A "chamada de turma" agrupa aulas por `recurringGroupId`/título (`lessonsRouters.ts:1417-1464`), não por `turma_alunos` — aluno matriculado em turma **sem aula agendada não aparece em nenhuma chamada**.
5. O cadastro permite **apenas 1 turma** (`turmaId` escalar; `setStudentTurma` substitui — `turmasRouters.ts:600-704`); multi-turma só pela página Turmas.
6. Não existe **rematrícula por período** (aulas/mensalidades do novo ciclo) nem **agenda em modo grade** (dia × horário por sala/professor).
7. Termos musicais residuais em telas de operação: "Instrumento" (`LessonDetailModal.tsx:206`, `Alunos.tsx:394`, `RepositionModal.tsx:89`), placeholder "Turma de Violão" (`AgendarModal.tsx:520`), fallback `"Música"` (`enrollmentRouter.ts:989`), `@musicpro.com` (`studentsRouters.ts:334`), "faltou à aula de música" (`lessonsRouters.ts:915`).

### Objetivo
Inverter o eixo para o modelo real de dança: **a turma é a unidade; a grade da turma gera as aulas; a chamada é da turma; o aluno entra na(s) turma(s)**. O agendamento avulso deixa de ser o fluxo principal e passa a cobrir apenas exceções (experimental, particular e reposição).

### Contexto
Já existem no sistema, prontos para serem o alicerce do novo fluxo: turmas com grade (`weekdays`, `timeStr`, `durationMinutes`), capacidade e **lista de espera com promoção automática** (`turmasRouters.ts`); **conflito de horário do aluno** entre turmas/matrículas (`turmasRouters.ts:87-146`); **matrículas adicionais** multi-modalidade (`matriculasRouters.ts`); **chamada coletiva** (`updateTurmaAttendance`); **QR de presença** com `attendance_logs`; **reposição** com crédito e política por escola; **Planos & Bolsas** com `aulasPorSemana`, `duracaoMeses`, `taxaInscricao`. Falta o elo entre turma → aulas e a operação em grade.

---

## 2. Usuários Envolvidos

- **Administrador/Dono:** monta a grade, cria turmas, matricula, rematricula, acompanha frequência e ocupação.
- **Professor/Coreógrafo:** vê a grade das suas turmas, faz a chamada, registra aula (substituição, cancelamento), solicita reposição.
- **Recepção (se houver):** cadastra aluno, matricula em turma (vaga/fila), tira dúvidas de horário.
- **Aluno/Responsável:** portal — vê grade das turmas, presenças, créditos de reposição e financeiro.

---

## 3. Escopo

### Incluído
- Vínculo `lessons.turmaId` + geração de aulas a partir da grade da turma (período configurável).
- Propagação de mudanças de grade (horário/dias/sala/professor) para aulas futuras; cancelamento de aulas ao encerrar turma.
- Chamada derivada de `turma_alunos` (presente/ausente/justificado/em lote), com registro por aula.
- Cadastro do aluno centrado em turmas: multi-seleção de turmas (vaga → ativa; sem vaga → fila), modalidade/professor/valor derivados, conflito de horário bloqueado.
- Agenda em **modo Grade** (semana: dia × horário por sala/professor/modalidade) e **modo Dia** (aulas de hoje com atalho de chamada).
- Reposição de falta em turma (justificada → crédito; agendamento em turma compatível ou particular).
- Rematrícula por período (novo ciclo de aulas + mensalidades; inativação de quem não renovou).
- Renomeação final de termos musicais nas telas de operação.

### Fora do escopo
- Migração automática do histórico (aulas antigas sem `turmaId` continuam funcionando como avulsas).
- Bilhetagem por aula frequentada (o modelo continua por plano/mensalidade).
- App nativo do professor (a chamada é web responsiva).
- Substituição automática de professor por disponibilidade (apenas registro manual do substituto na aula).
- Reformulação do QR de presença (permanece como está; passa a exibir a turma).

---

## 4. Requisitos Funcionais

### RF-001 — Turma gera as aulas do período
**Descrição:** ao criar/editar uma turma ativa com grade (dias + horário + duração), o admin escolhe o **período de geração** (padrão: até o fim do ciclo do plano vigente; opções 1, 3, 6, 12 meses) e o sistema cria as aulas (`lessons`) de cada sessão da grade, para cada aluno ativo da turma, com `turmaId` preenchido e `recurringGroupId` por sessão.
**Atores:** Administrador (criar/editar), sistema (gerar).
**Pré-condições:** turma com modalidade, professor, sala, `weekdays`, `timeStr`, `durationMinutes` e ≥1 aluno ativo (ou geração vazia permitida para grade pronta).
**Fluxo principal:**
1. Admin salva a turma e marca "Gerar aulas do período" (padrão ligado).
2. Sistema calcula as sessões (dia da semana × horário) no período.
3. Para cada sessão × aluno ativo, cria 1 `lesson` (`status='agendada'`, `lessonType='turma'`, `turmaId`, `instrumentId` = modalidade da turma, `userId` = professor, `studioRoomId` = sala).
4. Sistema pula datas em conflito de sala/professor (avisa no resumo) e informa quantas aulas criou.
**Exceções:** sem professor/sala → bloqueia geração; turma pausada → não gera; conflito de sala → sessão não criada com aviso listando as datas.
**Dados:** `lessons` (novo campo `turmaId`), `turmas`, `turma_alunos`.

### RF-002 — Chamada da turma
**Descrição:** abrir uma aula de turma exibe a **lista de alunos ativos da turma** (não depende de a aula ter sido pré-criada para aquele aluno). O professor marca **Presente / Ausente / Justificado** por aluno e pode aplicar "Todos presentes". A baixa atualiza `lessons` (1 por aluno, quando existir) e registra presença.
**Atores:** Professor da turma, Admin.
**Pré-condições:** aula existente com `turmaId` **ou** turma com sessão hoje na grade (aula é criada on-the-fly se faltar).
**Fluxo principal:**
1. Professor abre a aula do dia (Agenda modo Dia ou Grade).
2. Sistema lista `turma_alunos` com status `ativa` + status de presença atual.
3. Professor marca os status e confirma.
4. Sistema grava por aluno e retorna o resumo (presentes/ausentes/justificados).
**Exceções:** aluno matriculado após a aula → não entra na chamada retroativa; aluno cancelado na turma → aparece como "fora da turma" (somente leitura).
**Dados:** `lessons.status` (`concluida` = presente, `falta` = ausente, `a_repor` = justificado com crédito), `attendance_logs` (quando QR), `turma_alunos`.

### RF-003 — Cadastro do aluno centrado em turmas
**Descrição:** no cadastro, o bloco principal passa a ser **"Turmas"** (multi-seleção), com vagas em tempo real por turma; ao selecionar, o sistema deriva modalidade(s), professor(es) e valor (via plano), valida **conflito de horário** e envia para **fila** quando não houver vaga. O seletor de modalidade deixa de ser o eixo (permanece apenas como filtro das turmas).
**Atores:** Admin, Recepção, Professor com `alunos_editar`.
**Pré-condições:** turmas ativas cadastradas; plano da escola (opcional).
**Fluxo principal:**
1. Operador preenche dados pessoais + responsável (se menor) + contato.
2. Seleciona 1..N turmas (filtradas por modalidade/faixa etária/nível/dia).
3. Sistema mostra vagas e bloqueia conflito de horário entre as selecionadas.
4. Ao salvar: matrícula com vaga → `ativa`; sem vaga → `espera` (posição na fila).
5. Valor sugerido = soma dos planos/valores das turmas selecionadas (editável).
**Exceções:** turma encerrada/pausada não aparece; aluno sem turma (particular) continua permitido; seleção duplicada bloqueada.
**Dados:** `turma_alunos`, `student_enrollments` (matrículas adicionais/particulares), `students`.

### RF-004 — Agenda em modo Grade e modo Dia
**Descrição:** a Agenda ganha **modo Grade** (semana): colunas = dias da semana, linhas = horários, blocos = turmas (cor por modalidade), filtros por sala/professor/modalidade. **Modo Dia** lista as aulas de hoje com status e atalho "Fazer chamada". Aulas avulsas (particular/experimental/reposição) aparecem nos dois modos.
**Atores:** Admin, Professor (vê as próprias turmas).
**Pré-condições:** turmas com grade; aulas geradas.
**Fluxo principal:** alternar Semana/Dia → filtrar → clicar no bloco → abrir aula/chamada.
**Exceções:** semana sem aulas → estado vazio com CTA "Criar turma"; conflito de sala exibido em vermelho no bloco.
**Dados:** leitura de `lessons` + `turmas` + `studioRooms`.

### RF-005 — Reposição de falta em turma
**Descrição:** falta **justificada** em aula de turma pode gerar crédito de reposição (conforme política da escola). O crédito pode ser agendado em **outra turma compatível** (mesma modalidade e nível/faixa) ou como aula particular, usando o motor de reposição existente.
**Atores:** Professor, Admin; aluno solicita (portal).
**Pré-condições:** política de reposição configurada; aula com status `falta`/`a_repor`.
**Fluxo principal:**
1. Na chamada, professor marca "Justificado" → sistema marca a aula como `a_repor` e cria crédito (`lesson_repositions`) com validade.
2. Aluno/professor agenda a reposição; sistema valida crédito e conflito.
3. Ao concluir, consome o crédito.
**Exceções:** crédito expirado não agenda; falta não justificada não gera crédito; aula experimental não gera.
**Dados:** `lesson_repositions`, `repositions` (política), `lessons`.

### RF-006 — Rematrícula por período
**Descrição:** ao fim do ciclo (duração do plano/contrato), o admin abre **Rematrícula**: lista alunos por turma com status do ciclo, permite "renovar todos" ou selecionar; gera novo período de aulas (RF-001) e as mensalidades do ciclo; quem não renovar fica `inativo` e sai das aulas futuras (com cancelamento das aulas geradas).
**Atores:** Administrador.
**Pré-condições:** turmas com alunos em fim de ciclo.
**Fluxo principal:**
1. Admin abre Rematrícula do período (mês/ano de início).
2. Sistema lista turmas × alunos (ativos, a vencer, vencidos).
3. Admin marca os que renovam e confirma.
4. Sistema gera aulas do novo período e mensalidades (mesmo motor do plano), registrando o ciclo.
5. Não marcados → `inativo` + aulas futuras canceladas + vaga liberada (promove fila).
**Exceções:** aluno na fila não entra na rematrícula; mudança de turma na rematrícula usa o fluxo de transferência existente.
**Dados:** `students.status`, `student_enrollments.endDate`, `paymentDues`, `lessons`, `turma_alunos`.

### RF-007 — Exceções permanecem no agendamento avulso
**Descrição:** o modal atual de agendamento continua existindo para: **aula experimental**, **aula particular** (coreografia/competição) e **reposição**. Nesses casos o aluno pode estar sem turma, e o título deixa de citar instrumento.
**Atores:** Admin, Professor.
**Exceções:** modo "Turma" do modal é removido (substituído pela grade/turma real).
**Dados:** `lessons` (sem `turmaId`).

### RF-008 — Terminologia 100% dança
**Descrição:** renomear os resíduos musicais nas telas de operação e strings de sistema: "Instrumento" → "Modalidade" (`LessonDetailModal`, `RepositionModal`, `StudentModal`, colunas/CSV de Alunos, contrato `{{instrument}}` → "Modalidade", IA/automações), placeholder "Turma de Violão" → exemplo de dança, fallback `"Música"` → "Dança", `@musicpro.com` → domínio do DancePro, "faltou à aula de música" → "faltou à aula", mensagens com 🎵.
**Exceções:** nomes técnicos internos (`instrumentId`, rota `/instrumentos`, tabela `instruments`) permanecem — sem migração de schema nesta fase.

---

## 5. Regras de Negócio

### RN-001 — A grade manda; aula avulsa é exceção
Toda aula recorrente de aluno matriculado em turma é gerada pela grade. Aulas avulsas não podem usar `turmaId`.

### RN-002 — Aulas passadas são imutáveis
Mudança de grade (dias/horário/sala/professor) propaga **somente para aulas futuras** `agendada`; aulas `concluida`/`falta`/`a_repor`/`cancelada` não mudam. A UI mostra o impacto ("serão atualizadas N aulas futuras") antes de confirmar.

### RN-003 — Capacidade e fila
Matrícula em turma lotada vai para `espera` com posição; vaga aberta promove o primeiro da fila **sem conflito de horário** (regra existente, preservada). Reposição e experimental não ocupam vaga de turma.

### RN-004 — Conflito de horário é bloqueio
Aluno não pode ter duas turmas/matrículas no mesmo dia+horário (regra existente, estendida ao cadastro multi-turma). Professor também não pode ter duas turmas no mesmo horário — conflito é avisado no momento da criação/edição da turma.

### RN-005 — Presença
`concluida` = presente; `falta` = ausente; `a_repor` = justificado com crédito. "Todos presentes" aplica apenas aos alunos ativos listados. Chamada pode ser refeita no mesmo dia (idempotente por aluno).

### RN-006 — Crédito de reposição
Só falta **justificada** (ou motivo configurado que gere crédito) cria crédito; 1 crédito por aula; validade conforme política; crédito consumido ao concluir a reposição.

### RN-007 — Período de geração
A geração cobre no máximo o fim do ciclo vigente (duração do plano/contrato) ou o período escolhido, o que for menor. Virada de mês/ano e feriados não criam sessões fora dos dias da grade.

### RN-008 — Rematrícula
Renovar gera novo ciclo (aulas + mensalidades) sem duplicar o ciclo anterior; não renovar inativa o aluno, cancela aulas futuras e libera a vaga (promovendo a fila).

---

## 6. Fluxos

### Fluxo principal (montar e operar a escola de dança)
```text
Admin cria Modalidades, Salas e Planos (aulas/semana, duração, valor)
↓
Cria Turma (modalidade, nível, faixa etária, professor, sala, dias, horário, duração, capacidade)
↓
Sistema gera as aulas do período (uma por sessão × aluno ativo)
↓
Cadastro do aluno: dados + responsável + turmas (vaga/fila) + plano
↓
Agenda modo Grade (semana) / modo Dia
↓
Professor faz a chamada da turma (presente/ausente/justificado)
↓
Falta justificada → crédito de reposição → agendamento em turma compatível
↓
Fim do ciclo → Rematrícula (novo período de aulas + mensalidades)
```

### Fluxos alternativos
- **Aluno só particular:** cadastro sem turma; aulas pelo modal avulso (RF-007).
- **Turma sem vaga:** aluno entra na fila; ao abrir vaga, promoção automática.
- **Mudança de turma:** transferência existente + propagação de aulas futuras.
- **Aula extra/ensaio:** cria turma temporária ou aula avulsa de turma? (ver pergunta 5).

### Fluxos de erro
- Geração com conflito de sala → resumo "N sessões não criadas" com datas; nada é gravado parcialmente para a sessão conflitante.
- Chamada sem alunos ativos → estado vazio "Turma sem alunos".
- Rematrícula com pagamento pendente → aviso e opção "renovar mesmo assim" (registra pendência).

---

## 7. Casos Extremos

- Turma criada antes de ter alunos → aulas não geradas até o primeiro aluno (ou geração vazia, ver pergunta 1).
- Aluno matriculado no meio do período → aulas geradas a partir da data de entrada (não retroativas).
- Aluno cancelado no meio do período → aulas futuras canceladas; aulas passadas preservadas.
- Mudança de grade com aula de hoje em andamento → só futuras mudam.
- Feriados e recessos (ex.: carnaval) → feriado cadastrado não gera sessão (depende de calendário — ver pergunta 4).
- Fuso/virada de dia: sessões no fuso `America/Sao_Paulo` (padrão do sistema).
- Turma com 2 dias na semana e capacidade 20 → 40 aulas/mês por turma (volume de linhas; performance).
- Professor substituído em uma aula → registro do substituto sem alterar a turma.
- Aula de turma no mesmo horário de reposição de um aluno da própria turma → conflito bloqueia.
- Exclusão de turma → aulas futuras canceladas (não apagadas, para histórico); `turma_alunos` cancelados.
- Rematrícula executada 2x no mesmo período → idempotente (não duplica ciclo).

---

## 8. Dados Envolvidos

### Alteração de schema (Fase 1)
| Campo | Tabela | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- | --- |
| `turmaId` | `lessons` | int (FK lógica) | Não | Preenchido só em aulas geradas de turma |
| `cycleId` / `periodLabel` | `turmas` (ou `enrollment_cycles` nova) | varchar | Não | Identifica o ciclo de rematrícula (ex.: `2026.2`) |
| `generatedUntil` | `turmas` | date | Não | Fim do período já gerado (evita regenerar) |

Índices: `lessons (turmaId, scheduledAt)`, `lessons (recurringGroupId)` (já existe), `turma_alunos (turmaId, status)`.

### Entidades existentes reutilizadas
`turmas`, `turma_alunos`, `lessons`, `student_enrollments`, `school_plans`, `payment_dues`, `lesson_repositions`, `attendance_logs`.

---

## 9. Permissões e Segurança

| Ação | Admin | Professor (turma dele) | Recepção | Aluno |
| --- | --- | --- | --- | --- |
| Criar/editar turma e grade | Sim | Não | Não | Não |
| Gerar aulas do período | Sim | Não | Não | Não |
| Fazer chamada | Sim | Sim (próprias turmas) | Não | Não |
| Cadastrar/matricular aluno | Sim | Com `alunos_editar` | Com permissão | Não |
| Rematrícula | Sim | Não | Não | Não |
| Ver grade | Sim | Próprias turmas | Sim | Suas turmas |

- Todas as procedures validam `organizationId` do contexto (nunca do input) — padrão já auditado.
- Chamada e geração de aulas usam as mesmas checagens de papel/ownership do módulo Aulas.
- Erros nunca expõem SQL/stack; mensagens de conflito citam apenas dia/horário.

---

## 10. Tratamento de Erros

### Esperados
- "Esta turma não tem professor definido — defina antes de gerar as aulas."
- "Sala ocupada em 2 datas — as demais foram geradas." (lista resumida)
- "Aluno já tem aula neste dia/horário (Turma de Jazz, quarta 18h)."
- "Sem vagas — aluno entrou na lista de espera (posição 3)."
- "Crédito de reposição expirado em 12/09."

### Internos
- "Não foi possível gerar as aulas agora. Tente novamente." (rollback da geração)
- "Não foi possível salvar a chamada. Tente novamente."

---

## 11. Requisitos Não Funcionais

### RNF-001 — Performance
Geração de 1 turma (2 dias/semana, 20 alunos, 6 meses) ≤ 3 s (insert em lote). Agenda modo Grade com 200 turmas carrega em ≤ 2 s (queries por semana, sem N+1).

### RNF-002 — Responsividade
Chamada usável no celular do professor (toque grande, "Todos presentes" em 1 toque).

### RNF-003 — Segurança
Isolamento por escola em todas as queries; nenhuma geração de aulas aceita `organizationId` do cliente.

### RNF-004 — Compatibilidade
Aulas antigas (sem `turmaId`) continuam funcionando em todos os fluxos; nenhum dado histórico é reescrito.

### RNF-005 — Logs
Geração, propagação de grade, chamada e rematrícula registram log com contagens (org, turma, período, criadas/canceladas).

---

## 12. Critérios de Aceite

### CA-001 — Grade vira agenda
**Dado que** uma turma ativa tem 2 dias na semana, 1 professor, 1 sala e 5 alunos,
**quando** o admin salvar a turma com "gerar aulas do período" de 3 meses,
**então** o sistema cria as aulas (sessões × alunos) com `turmaId`, sem conflitos de sala/professor, e informa o total.

### CA-002 — Chamada pela turma
**Dado que** a aula do dia existe (ou é criada ao abrir),
**quando** o professor abrir a chamada,
**então** a lista traz exatamente os alunos `ativa` da turma, com "Todos presentes" funcional e gravação por aluno.

### CA-003 — Multi-turma no cadastro
**Dado que** existem vagas em Ballet Infantil (sábado 10h) e Jazz Juvenil (terça 18h),
**quando** cadastrar um aluno selecionando as duas,
**então** ele fica `ativa` nas duas, com valor somado sugerido e sem conflito; ao escolher duas no mesmo horário, o sistema bloqueia com mensagem clara.

### CA-004 — Fila
**Dado que** a turma está lotada,
**quando** matricular um aluno,
**então** ele entra em `espera` com posição e é promovido automaticamente ao abrir vaga.

### CA-005 — Reposição justificada
**Dado que** o professor marca "Justificado" na chamada,
**então** a aula vira `a_repor` e o crédito é criado com validade da política; ao agendar em turma compatível e concluir, o crédito é consumido.

### CA-006 — Rematrícula
**Dado que** o ciclo termina e o admin renova 10 de 12 alunos,
**então** os 10 recebem aulas do novo período e mensalidades; os 2 não renovados ficam `inativo`, com aulas futuras canceladas e vaga liberada.

### CA-007 — Propagação de grade
**Dado que** a turma muda de quarta 18h para quinta 19h,
**quando** confirmar,
**então** apenas as aulas futuras `agendada` mudam, com contagem exibida antes.

### CA-008 — Terminologia
**Dado que** o operador abre detalhes de aula, reposição, lista de alunos e contrato,
**então** não há ocorrência de "Instrumento", "Violão", "Música" ou `@musicpro.com` nesses fluxos.

---

## 13. Riscos e Dependências

### Riscos
- **Volume de linhas** em `lessons` (sessões × alunos) — mitigar com insert em lote e índice `(turmaId, scheduledAt)`; avaliar particionamento futuro.
- **Divergência entre turma e aulas já geradas** — mitigar com `generatedUntil` + propagação explícita e resumo de impacto.
- **Rematrícula e financeiro** — reutilizar o motor existente (planos + `paymentDues`), com idempotência por ciclo.
- **Regressão em aulas antigas** — nenhum caminho novo pode exigir `turmaId` (campo opcional).

### Dependências
- Módulos já prontos: Turmas & Vagas, Reposição, Planos & Bolsas, QR de presença, Financeiro.
- `lessons.turmaId` + índices (migração aditiva, sem impacto no histórico).
- Permissões de professor (`dashboardWidgets`/`alunos_editar`) para a chamada.

---

## 14. Métricas de Sucesso

- Tempo para montar a grade de uma escola (10 turmas): ≤ 15 min, sem agendar aluno a aluno.
- % de aulas da escola criadas por grade (meta: > 90% em 30 dias).
- Chamadas realizadas por aula de turma (meta: > 80% das aulas).
- Redução de retrabalho: aulas avulsas caindo para < 10% do total.
- Rematrículas concluídas em 1 tela (meta: 100% dos ciclos).

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Estrutura e dados
1. Migração aditiva: `lessons.turmaId`, `turmas.generatedUntil` (+ `cycleLabel` opcional), índices.
2. Serviço `TurmaScheduleService`: calcular sessões, gerar/cancelar/propagar aulas com validação de conflito e resumo.

### Fase 2 — Backend/API
3. `turmas.generateLessons` / `turmas.previewGeneration` (impacto) / `turmas.cancelFutureLessons`.
4. Chamada por turma: `lessons.getTurmaAttendance(turmaId, date)` + `lessons.saveTurmaAttendance` (usa `turma_alunos`; cria aula se faltar).
5. Cadastro multi-turma: `students.create/update` aceitando `turmaIds[]` (vaga/fila/conflito) + derivar modalidade/valor.
6. Rematrícula: `renewals.list/apply` (novo ciclo + mensalidades, idempotente).
7. Reposição: origem "falta em turma" com crédito (reutiliza motor atual).

### Fase 3 — Frontend
8. Cadastro do aluno: bloco "Turmas" (multi-seleção com vagas/fila/conflito) no lugar do eixo modalidade.
9. Agenda: modo **Grade** (semana) + **modo Dia** com atalho de chamada; propagação com preview de impacto.
10. Tela de Rematrícula (turmas × alunos, renovar em lote).
11. Chamada mobile-first com "Todos presentes".

### Fase 4 — Integrações
12. QR de presença exibindo a turma; notificações de falta/reposição com texto de dança.
13. Renomeação de termos (RF-008) e templates (contrato `{{instrument}}` → "Modalidade").

### Fase 5 — Testes
14. Vitest: geração (conflitos/feriados/virada de período), chamada (idempotência/lote), cadastro multi-turma (fila/conflito), rematrícula (idempotência), propagação (passado intocado).
15. QA manual: escola com 10 turmas/100 alunos; chamada no celular; rematrícula completa.

---

## 16. Suposições e Perguntas Abertas

> **Status de implementação (18/09/2026):** ✅ **Fase 1 concluída e publicada** — `lessons.turmaId` + `lesson_attendance` + `turmas.generatedUntil` (migração idempotente); `TurmaScheduleService` (prévia/geração/cancelamento/propagação de cancelamento + chamada); endpoints `turmas.previewLessons|generateLessons|cancelFutureLessons|todayLesson` e `turmaAttendance.get|save`; UI no card da turma (Gerar aulas + Chamada); portal do aluno e próximas aulas do professor já enxergam sessões de turma; folha mantém sessões fora do cálculo até a fase de remuneração por turma.
> **Próximas fases:** 2 (cadastro multi-turma + rematrícula + reposição de turma), 3 (agenda modo Grade + propagação de mudança de grade com preview), 4 (QR exibindo turma + termos), 5 (testes dedicados).

### Decisões já validadas
Ver seção 0 — as respostas 1, 2, 3, 5 e 6 estão fechadas. A pergunta 4 (calendário de feriados) segue em aberto e fora do escopo desta fase.

### Suposições remanescentes
- ⚑ **1 linha de `lesson` por sessão de turma** (sem aluno); a presença por aluno vive em `lesson_attendance`.
- ⚑ **Período padrão de geração = escolhido no modal** (1/3/6/12 meses), iniciando hoje.

### Pendências de decisão (fases futuras)
1. Remuneração de professor por **aula de turma** (hoje a folha ignora sessões de turma de propósito).
2. **Cobrança adaptável** (seção 0, decisão 3): definir a matriz de modos por escola/plano na fase de financeiro (mensal, bimestral, trimestral, semestral, anual, à vista com desconto).
3. **Calendário de feriados/recessos** (pergunta 4) — bloquear geração por data.
