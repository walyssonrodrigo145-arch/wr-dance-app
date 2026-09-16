# PRD — Turma no cadastro do aluno (por modalidade, com lista de espera)

**Status:** Implementado (15/09/2026) · **Módulos:** Alunos (NovoAluno) + Turmas & Vagas + Backend tRPC

---

## 1. Visão Geral

### Problema
Ao cadastrar um aluno, o operador precisava escolher a modalidade, o plano e depois ir até **Turmas & Vagas** para matricular o aluno na turma. Isso gerava cadastro incompleto (aluno sem turma), retrabalho e risco de matricular em turma de outra modalidade.

### Objetivo
Permitir escolher a turma **dentro do cadastro do aluno**, seguindo a mesma lógica de Planos & Bolsas:
1. só aparecem turmas **da modalidade escolhida**;
2. mostra **vagas em tempo real**;
3. se **não houver vaga**, o aluno entra automaticamente na **lista de espera** (com promoção automática futura).

### Contexto
O módulo Turmas & Vagas (tabelas `turmas` e `turma_alunos`) já existia com capacidade e lista de espera. Faltava o atalho no cadastro e uma operação idempotente de "definir turma do aluno".

---

## 2. Usuários Envolvidos
- **Administrador/Professor (staff):** cadastra/edita o aluno e escolhe a turma.
- **Aluno:** nenhuma ação (apenas é matriculado).

## 3. Escopo

### Incluído
- Seletor de turma no cadastro e na edição do aluno, filtrado pela modalidade principal.
- Exibição de vagas (`X vaga(s)` / `Lista de espera`) e ocupação (`matriculados/capacidade`).
- Matrícula automática com fallback para lista de espera.
- Troca de turma na edição (libera a antiga + promove a fila) e remoção ("Sem turma").
- Aviso quando o aluno já está na lista de espera (posição).

### Fora do escopo
- Matrícula em múltiplas turmas no mesmo cadastro (hoje: 1 turma atual por aluno; a modelagem suporta várias, mas a UI mantém uma).
- Geração automática de aulas a partir da turma (o agendamento continua na aba Agendar).
- Cobrança/ajuste de mensalidade por vagas de turma.

## 4. Requisitos Funcionais

### RF-001 — Filtrar turmas pela modalidade
**Descrição:** o seletor carrega `turmas.list { status: "ativa" }` e exibe apenas as turmas cujo `modalidadeId` é igual à modalidade principal do formulário.
**Exceções:** sem modalidade selecionada → aviso "Selecione a modalidade principal..."; sem turmas → aviso para criar em "Turmas & Vagas".
**Dados:** `turmas.modalidadeId`, `turmas.status`, `form.instrumentId`.

### RF-002 — Matricular com fallback para lista de espera
**Descrição:** ao salvar o aluno com turma selecionada, o backend executa `turmas.setStudentTurma`; com vaga = `status: ativa`, sem vaga = `status: espera` (posição no fim da fila).
**Exceções:** turma encerrada → erro controlado; turma de outra escola → 404.

### RF-003 — Trocar/remover turma na edição
**Descrição:** ao editar, o formulário pré-seleciona a turma atual; ao salvar com outra turma, o sistema cancela a antiga (promovendo o próximo da fila) e matricula na nova; com "Sem turma", remove a matrícula.

### RF-004 — Feedback ao operador
**Descrição:** toasts: "Aluno matriculado na turma X!", "Turma X lotada — aluno entrou na lista de espera", "Aluno removido da turma".

## 5. Regras de Negócio

### RN-001 — Vagas sempre do servidor
**Regra:** a disponibilidade exibida vem de `turmas.list` (servidor) e a decisão vaga/espera é recalculada no backend no momento do save (anti-corrida).
**Válido:** dois operadores cadastram simultaneamente — o segundo cai na espera.
**Inválido:** confiar no número exibido no client.

### RN-002 — Uma matrícula ativa por aluno
**Regra:** o aluno mantém apenas uma matrícula não-cancelada. `setStudentTurma` é idempotente para a mesma turma.

### RN-003 — Promoção automática
**Regra:** ao liberar vaga (troca/remoção/cancelamento), o primeiro da lista de espera da turma sobe para `ativa` (`promoteNextFromWaitlist`).

### RN-004 — Modalidade manda
**Regra:** trocar a modalidade no formulário limpa a turma selecionada que não pertence à nova modalidade (evita matrícula cruzada).

## 6. Fluxos

### Fluxo principal
```text
Staff abre Novo Aluno
↓
Escolhe a modalidade principal
↓
Sistema lista turmas ativas dessa modalidade (com vagas)
↓
Seleciona a turma (opcional)
↓
Salva o aluno
↓
Backend cria o aluno e matricula (vaga) ou coloca na espera
↓
Toast de confirmação + aluno visível em Turmas & Vagas
```

### Fluxos alternativos
- **Sem turma:** aluno criado sem matrícula; matrícula depois em Turmas & Vagas.
- **Edição:** turma atual pré-selecionada; troca libera a antiga e promove a fila.

### Fluxos de erro
- Turma encerrada: bloqueio com mensagem.
- Falha ao definir turma após salvar aluno: toast "Aluno salvo, mas houve erro ao definir a turma: ..." (aluno permanece criado).

### Fluxo de permissão negada
- Login de aluno não acessa o cadastro (proteção de rota + `assertStaff` no backend).

## 7. Casos Extremos
- Turma lotada entre a seleção e o save → espera (recalculado no backend).
- Aluno já matriculado na mesma turma → no-op idempotente (sem duplicar).
- Linha `turma_alunos` cancelada anteriormente para a mesma turma → reaproveitada (unique `turmaId+studentId`).
- Troca de modalidade com turma selecionada → seleção limpa.
- Edição sem alterar turma → nenhuma chamada de escrita.
- Turma removida/excluída → lista atualiza e aviso de "nenhuma turma ativa".
- Double click em salvar → mutação idempotente.

## 8. Dados Envolvidos
| Entidade | Campo | Regra |
|---|---|---|
| `turmas` | `capacity`, `modalidadeId`, `status` | capacidade limita `ativa`; encerrada bloqueia |
| `turma_alunos` | `status` (`ativa`/`espera`/`cancelada`), `position` | fila ordenada por `position`; unique por `(turmaId, studentId)` |
| `students` | `instrumentId` | define o filtro das turmas exibidas |
| — | — | Nenhuma migration nova (tabelas já existiam) |

## 9. Permissões e Segurança
- Todas as procedures (`turmas.studentEnrollment`, `turmas.setStudentTurma`, `turmas.list`) exigem staff (`assertStaff`) e isolamento por `organizationId`.
- Aluno da organização A nunca matricula em turma da organização B (validação dupla: aluno e turma na mesma org).
- Sem exposição de dados de outras escolas nas mensagens de erro (mensagens genéricas controladas).

## 10. Tratamento de Erros
- **Esperado:** "Aluno não encontrado nesta escola.", "Turma não encontrada nesta escola.", "Esta turma está encerrada e não aceita novas matrículas."
- **Interno:** erros inesperados caem no tratamento global do tRPC (mensagem genérica, sem stack trace).

## 11. Requisitos Não Funcionais
- Sem novas tabelas/migrations; queries indexadas (`turma_alunos_student_idx`, `turmas_org_modalidade_idx`).
- Feedback visual imediato (toasts) e estados vazios orientando o próximo passo.
- Responsivo: carrossel horizontal de turmas como no catálogo de planos.

## 12. Critérios de Aceite
- **CA-001:** Dado um aluno em criação com modalidade X, quando abrir o seletor, então só aparecem turmas ativas de X.
- **CA-002:** Dada turma com vagas, quando salvar, então o aluno fica `ativa` na turma e aparece em Turmas & Vagas.
- **CA-003:** Dada turma lotada, quando salvar, então o aluno entra em `espera` na última posição e recebe toast informativo.
- **CA-004:** Dado aluno em edição com turma atual, quando salvar sem alterar, então nenhuma escrita de turma ocorre (idempotente).
- **CA-005:** Dada troca de turma, então a antiga é cancelada e o primeiro da fila dela é promovido.
- **CA-006:** `pnpm check` 0 erros, suíte de testes verde e build ok.

## 13. Riscos e Dependências
- **Risco:** corrida por última vaga → mitigado pela checagem no backend no momento do save.
- **Risco:** operador interpretar "Sem turma" como erro → copy orienta "Definir depois".
- **Dependência:** módulo Turmas & Vagas (`turmasRouters`) e modalidades (`instruments`).

## 14. Métricas de Sucesso
- Redução de alunos sem turma após cadastro (hoje: matrícula só em Turmas & Vagas).
- Tempo de cadastro completo menor (turma + plano no mesmo fluxo).

## 15. Plano de Implementação
- **Fase 1 — Backend:** `turmas.studentEnrollment` + `turmas.setStudentTurma` + helper de promoção (concluído).
- **Fase 2 — Frontend:** seletor de turma no NovoAluno com filtro por modalidade, vagas e espera (concluído).
- **Fase 3 — Testes/validação:** typecheck, suíte e build (concluído).
- **Fase 4 — Deploy:** pipeline devopsmaster com verificação pós-deploy.
