# PRD — Importação de Alunos por CSV (otimização do cadastro em lote)

**Status:** Proposta (aguardando aprovação de escopo) · **Módulos:** Alunos + Turmas & Vagas + Financeiro + Backend tRPC
**Base:** v1 implementada em 18/09/2026 (commit `89e1c7c`) + hotfix de datas/e-mails (commit `8c3a8a5`)

---

## 1. Visão Geral

### Problema
A importação v1 resolve o caso simples (nome/telefone/e-mail/nascimento em colunas fixas), mas ainda exige retrabalho em cenários reais de escola:

1. O CSV **exportado pelo próprio DancePro** (botão "Exportar CSV") **não pode ser reimportado** — o layout tem ID na 1ª coluna e outras 10 colunas em ordem diferente da esperada.
2. Linhas com problema são **descartadas em silêncio** (só um número no toast) — o operador não sabe quem ficou de fora nem por quê.
3. Campos essenciais do cadastro ficam de fora: **responsável** (obrigatório na prática para menores), CPF, mensalidade, vencimento, turma e modalidade por aluno.
4. Alunos importados entram **sem turma e sem cobrança** — o operador refaz manualmente aluno por aluno.
5. CSV de Excel/Sheets traz **BOM, aspas e ponto-e-vírgula** que o parser posicional atual não trata.
6. `students.importBatch` (como os demais mutations de alunos) **não verifica permissão no servidor** — qualquer usuário autenticado da escola poderia chamar a API mesmo sem permissão de editar alunos.

### Objetivo
Transformar a importação no caminho padrão de migração de carteira: uma escola nova cola/exporta a planilha, revisa, importa **com professor, modalidade, turma, mensalidade e vencimento**, e sai com cobranças e fila de espera já encaminhadas — sem editar aluno por aluno.

### Contexto
- `students` exige `userId` (dono do registro) e `professorId`; e-mail é **único por escola** (`students_email_org_idx`).
- Turmas já têm vagas, fila e detecção de conflito de horário (`promoteNextFromWaitlist`, `findStudentScheduleConflict`).
- Financeiro já tem geração mensal de cobranças (`financeiro.generateMonthly`) e o portal do aluno tem habilitação individual (`students.enablePortalAccess`).
- O link de matrícula (auto-cadastro) já cobre o caso "1 aluno por vez".

---

## 2. Usuários Envolvidos

- **Administrador/Dono:** importa, revisa a prévia, decide cobranças/convites. Público principal.
- **Professor com permissão `alunos_editar`:** pode importar para os próprios alunos.
- **Professor sem permissão:** botão oculto E API bloqueada (novo guard).
- **Aluno:** nenhuma ação (recebe convite de portal opcional).

---

## 3. Escopo

### Incluído
- Fase 1: round-trip do CSV do sistema, prévia editável, template, relatório de não importados, parser CSV real (aspas/BOM), dedupe de e-mail/telefone na prévia.
- Fase 2: colunas opcionais (responsável, CPF, mensalidade, vencimento, modalidade, turma, notas), matrícula automática em turma, cobranças opcionais, convites de portal em lote, importação parcial no limite do plano.
- Fase 3: XLSX/arrastar-e-soltar, histórico de lotes com desfazer, matching fuzzy de homônimos.
- Segurança: guard de permissão server-side no import (e demais mutations de alunos, com cuidado de rollout).

### Fora do escopo
- Sincronização automática com planilhas do Google (Sheets API).
- Importação de aulas/frequência/pagamentos históricos.
- Reconhecimento de colunas por IA (mapeamento manual basta).
- Alteração do link de auto-matrícula.

---

## 4. Requisitos Funcionais

### RF-001 — Mapeamento por cabeçalho (round-trip do próprio export)
**Descrição:** se a 1ª linha não-vazia contiver cabeçalhos reconhecíveis, o import mapeia colunas por nome (ignorando caixa, acentos e espaços): `Nome`, `E-mail`, `Telefone`, `Nascimento`, `CPF`, `Responsável`, `Telefone do responsável`, `Modalidade`/`Instrumento`, `Nível`, `Mensalidade`, `Vencimento`, `Turma`, `Observações`. Aceita o layout do "Exportar CSV" do sistema e ignora colunas desconhecidas (ID, Status, Tipo de Aula).
**Exceções:** sem cabeçalho reconhecido → mantém o modo posicional atual (`Nome; Telefone; E-mail; Nascimento`).
**Dados:** nenhum campo novo no banco.

### RF-002 — Prévia editável com status por linha
**Descrição:** antes de importar, exibir tabela com todas as linhas: nome, telefone, e-mail, nascimento, status (`ok`, `aviso`, `erro` + motivo). Permitir editar campos inline, remover linha e "remover todas com erro". O botão exibe "Importar N aluno(s) prontos".
**Exceções:** mais de 200 linhas → prévia paginada (50 por página) para não travar o navegador.
**Dados:** apenas client-side até o envio.

### RF-003 — Pacote de planilha: template e parser robusto
**Descrição:** botão "Baixar modelo" gera CSV com cabeçalho e 2 exemplos. O parser passa a tratar CSV real: aspas com separadores internos, BOM (Excel), `;`, `,` e TAB, linhas em branco e CRLF.
**Exceções:** aspas não fechadas → linha marcada como erro na prévia, sem quebrar as demais.

### RF-004 — Relatório de importação
**Descrição:** ao concluir, o modal mostra resumo (importados / ignorados / motivos) e, se houver ignorados, botão "Baixar não importados (.csv)" com as linhas originais + coluna de motivo.
**Exceções:** falha total → manter o texto do arquivo no textarea para correção.

### RF-005 — Deduplicação assistida
**Descrição:** na prévia, marcar automaticamente: e-mail já existente na escola, e-mail repetido no arquivo, telefone (somente dígitos) já existente na escola ou repetido no arquivo. Linhas duplicadas vêm **desmarcadas** (o operador decide importar mesmo assim — ex.: irmãos com telefone da mãe).
**Exceções:** telefone compartilhado entre irmãos é aviso, nunca bloqueio automático.

### RF-006 — Campos de cadastro completo (Fase 2)
**Descrição:** aceitar e persistir por linha: responsável (nome/telefone/e-mail), CPF, gênero, endereço, notas, mensalidade, dia de vencimento, modalidade (sobrepõe a padrão quando presente), nível (sobrepõe o padrão) e turma (por nome).
**Exceções:** valor de mensalidade inválido → linha com erro na prévia, sem descartar o resto.

### RF-007 — Matrícula em turma no lote
**Descrição:** quando a linha (ou o campo "turma padrão" do modal) indicar uma turma existente, matricular o aluno usando a mesma regra de vagas: com vaga → ativa; sem vaga → lista de espera com posição; conflito de horário com outra turma → erro de linha com motivo.
**Exceções:** turma inexistente → erro de linha ("turma não encontrada"); turma inativa → aviso e aluno importado sem turma.

### RF-008 — Cobranças e convites opcionais
**Descrição:** dois checkboxes no modal:
1. "Gerar cobranças do mês para alunos com mensalidade" → usa a geração mensal existente após o insert (idempotente por aluno/mês);
2. "Habilitar acesso ao portal e enviar convite" → chama o fluxo individual em lote.
Ambos rodam após a criação e **nunca** desfazem a importação em caso de falha (relatório separa "alunos criados" de "cobranças/convites").
**Exceções:** falha em um aluno não bloqueia os demais; erros aparecem no relatório.

### RF-009 — Limite de plano com opção parcial
**Descrição:** quando `importados + ativos > limite` do plano: por padrão bloquear com CTA de upgrade; checkbox "importar até o limite" importa o máximo permitido (ordem do arquivo) e reporta os excedentes para uma próxima importação.
**Exceções:** plano com `allowExtraStudents` → importa tudo (regra atual).

### RF-010 — Segurança server-side
**Descrição:** `students.importBatch` exige perfil admin **ou** professor com `alunos_editar` (checagem no servidor). O mesmo guard deve migrar para os demais mutations de alunos em etapa controlada, considerando professores que hoje editam sem a flag.
**Exceções:** requisição sem permissão → `FORBIDDEN` com mensagem padrão, sem detalhes internos.

---

## 5. Regras de Negócio

### RN-001 — E-mail é único por escola
Duplicado é **pulado** (comportamento atual do hotfix) ou importado sem e-mail se o operador desmarcar "importar mesmo assim" na prévia.

### RN-002 — Telefone é aviso, não bloqueio
Irmãos compartilham telefone; duplicidade de telefone nunca impede a importação, apenas sinaliza.

### RN-003 — Aluno importado nasce ativo e sem portal
`status = ativo`, `monthlyFee = 0` (ou coluna), `dueDay = 10` (ou coluna), `startDate = hoje` (ou coluna), `studentUserId = null`. Portal só com o checkbox.

### RN-004 — Professor responsável é obrigatório
`students.professorId` é NOT NULL; campo obrigatório no modal (individual ou por coluna "Professor", quando existir).

### RN-005 — Dados inválidos não derrubam o lote
Data, mensalidade, nível ou e-mail inválidos → linha marcada/descartada com motivo; o restante importa. Erro técnico no insert (falha de banco) → nenhum aluno do lote fica pela metade (insert único e transacional por lote).

### RN-006 — Limite do plano
Cálculo sobre alunos **ativos**; excedente nunca é importado silenciosamente.

### RN-007 — Escopo de dados
Tudo é criado com `organizationId` do usuário e validado contra professor/modalidade/turma da mesma escola. Nunca aceitar IDs de outra organização.

---

## 6. Fluxos

### Fluxo principal
```text
Operador abre Alunos → Importar CSV
↓
Escolhe arquivo OU cola conteúdo
↓
Sistema detecta cabeçalho e monta prévia com status por linha
↓
Operador corrige/remove linhas e ajusta padrões (professor, modalidade, nível)
↓
(Opcional) marca cobranças do mês e convite de portal
↓
Importar → servidor valida permissão, plano e duplicados
↓
Insert transacional + turmas + cobranças + convites
↓
Relatório com importados, ignorados (motivo) e download dos não importados
↓
Lista de alunos atualizada
```

### Fluxos alternativos
- **Sem cabeçalho:** parser posicional (v1).
- **Vazio/tudo inválido:** botão desabilitado + aviso.
- **Acima de 200 linhas:** prévia paginada.
- **Limite do plano:** bloquear ou importar parcial (RF-009).

### Fluxos de erro
- Arquivo ilegível → "Não foi possível ler o arquivo" (manter textarea).
- Sem permissão → toast padrão; botão não aparece para não autorizados.
- Falha de banco no insert → "Nenhum aluno foi importado. Tente novamente." (sem detalhes técnicos).

---

## 7. Casos Extremos

- CSV exportado do Excel BR (BOM + `;` + aspas) e do Google Sheets (`,`).
- Aspas internas, campo multilinha em aspas, linhas em branco no meio.
- Mesmo e-mail em 2 linhas; e-mail já usado por aluno inativo (continua único).
- Telefone do responsável repetido entre irmãos.
- Nascimento `31/02/2010` (data inexistente), `2010-13-01`, `10/05/10` (ano curto).
- Mensalidade `R$ 1.250,00` e `1250.00` e `1250,00`.
- Nome com 1 caractere, nome duplicado (homônimos) — permitido, sinalizado.
- Turma com vaga disputada por 2 linhas do mesmo arquivo → fila na ordem do arquivo.
- Arquivo com 300+ linhas (limite atual 300 no zod) → mensagem clara de limite por lote.
- Duplo clique em Importar → mutation desabilitada durante o envio.
- Sessão expirada durante o envio → erro tratado, nada parcial.
- Fuso/virada de dia: `startDate = hoje` no fuso America/Sao_Paulo.

---

## 8. Dados Envolvidos

### Entidades existentes (sem mudança de schema na Fase 1/2, exceto Fase 3)
| Entidade | Uso no import |
| --- | --- |
| `students` | Insert principal (todos os campos mapeados) |
| `turmas` / `turma_alunos` | Matrícula por nome de turma (RF-007) |
| `payment_dues` | Geração mensal opcional (RF-008) |
| `users` | Validação de professor da mesma escola |
| `instruments` | Validação da modalidade da mesma escola |

### Fase 3 (novo)
| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `student_import_batches.id` | serial | Sim | PK |
| `student_import_batches.organizationId` | int | Sim | Isolamento |
| `student_import_batches.userId` | int | Sim | Autor |
| `student_import_batches.fileName` | varchar(255) | Não | Nome do arquivo |
| `student_import_batches.total` | int | Sim | Linhas recebidas |
| `student_import_batches.imported` | int | Sim | Linhas criadas |
| `student_import_batches.report` | jsonb | Sim | Motivos e nomes pulados |
| `student_import_batches.createdAt` | timestamp | Sim | Auditoria |

---

## 9. Permissões e Segurança

| Ação | Admin | Professor `alunos_editar` | Professor sem permissão | Aluno |
| --- | --- | --- | --- | --- |
| Ver botão Importar CSV | Sim | Sim | Não | Não |
| Chamar `students.importBatch` | Sim | Sim | **Bloqueado no servidor** | Bloqueado |
| Gerar cobranças do lote | Sim | Não (só admin) | Não | Não |
| Convidar portal em lote | Sim | Não (só admin) | Não | Não |
| Ver relatório do lote | Sim | Sim (próprios) | Não | Não |

- Guard server-side (RF-010) com fallback: durante o rollout, logar acessos legados antes de bloquear (evita quebrar professor sem a flag).
- Erros nunca expõem SQL/constraint: mensagens amigáveis + log interno.
- Payload limitado a 300 linhas por lote (zod) e 50 KB de texto no client.

---

## 10. Tratamento de Erros

### Esperados
- "Nenhum aluno válido encontrado (informe ao menos o nome)."
- "Todos os alunos do arquivo já estão cadastrados com esses e-mails."
- "Limite de alunos do plano atingido (N). Faça upgrade ou importe até o limite."
- "Turma 'X' não encontrada — o aluno será importado sem turma."
- "Professor selecionado não pertence a esta escola."

### Internos
- "Não foi possível importar os alunos. Nenhum aluno foi criado. Tente novamente."
- Falha em cobranças/convites após o insert: "Alunos importados, mas N cobranças/convites falharam — veja o relatório."

---

## 11. Requisitos Não Funcionais

### RNF-001 — Performance
Prévia de 300 linhas deve renderizar em < 300 ms (paginação acima de 200). Import com turma+cobrança: resposta em < 10 s para 300 alunos; insert único (não N+1).

### RNF-002 — Responsividade
Modal usável em mobile (tabela com scroll horizontal e edição inline acessível).

### RNF-003 — Usabilidade
Feedback em todas as etapas: parsing, prévia, envio (loading), sucesso com relatório, erro com motivo por linha.

### RNF-004 — Compatibilidade
CSV UTF-8 (com/sem BOM), detectar Latin-1 quando houver caracteres corrompidos e sugerir re-salvar como UTF-8.

### RNF-005 — Logs
Falhas de import registradas em log interno (org, usuário, total, importados), sem dados sensíveis desnecessários.

---

## 12. Critérios de Aceite

### CA-001 — Round-trip
**Dado que** o operador exportou os alunos pelo botão "Exportar CSV" e removeu o ID/Status,
**quando** importar o mesmo arquivo,
**então** o sistema reconhece os cabeçalhos, monta a prévia correta e importa sem erro de coluna.

### CA-002 — Prévia com problemas visíveis
**Dado que** o arquivo tem 100 linhas, 3 com data inválida e 2 com e-mail repetido,
**quando** colar o conteúdo,
**então** a prévia mostra 95 prontas, 5 sinalizadas com motivo, e permite baixar/importar conforme a decisão do operador.

### CA-003 — Turma com fila
**Dado que** a turma "Ballet Infantil Sábado" está cheia e o arquivo a referencia,
**quando** importar,
**então** os alunos entram na lista de espera com posição, e o relatório informa "sem vaga → lista de espera".

### CA-004 — Cobranças e convites
**Dado que** "gerar cobranças do mês" está marcado e 10 alunos têm mensalidade > 0,
**quando** importar,
**então** as cobranças do mês são criadas para os 10 (idempotente) e o relatório separa cobranças de alunos criados.

### CA-005 — Permissão
**Dado que** um professor sem `alunos_editar` chama `students.importBatch` direto na API,
**então** recebe `FORBIDDEN` e nenhum aluno é criado.

### CA-006 — Limite do plano
**Dado que** o plano permite mais 5 alunos e o arquivo tem 20,
**quando** importar com "importar até o limite",
**então** 5 entram, 15 são reportados como excedentes, sem cobrança indevida.

### CA-007 — Excel
**Dado que** o arquivo veio do Excel BR (BOM + `;` + aspas),
**quando** importar,
**então** nomes, telefones e datas chegam corretos (sem caractere estranho no 1º nome).

---

## 13. Riscos e Dependências

### Riscos
- **Permissão retroativa (RF-010):** bloquear sem rollout pode impedir professores que hoje usam o fluxo legado. Mitigação: fase de log antes de bloquear.
- **Cobrança duplicada:** rodar `generateMonthly` sem a idempotência existente pode duplicar `payment_dues`. Mitigação: usar a mesma chave (studentId, month, year) já validada.
- **Matrícula em turma errada por nome duplicado de turma:** mitigação: erro na prévia quando houver 2 turmas com o mesmo nome (pedir código/ID na coluna).
- **Performance da prévia em arquivos grandes:** mitigação: paginação e limite de 300.

### Dependências
- `financeiro.generateMonthly` (cobranças).
- `students.enablePortalAccess` (convites).
- Helpers de turma (`findStudentScheduleConflict`, fila) — hoje internos de `turmasRouters`; extrair para `server/services` antes de reutilizar no import (evita import circular).
- Flag de permissão `alunos_editar` (users.permissions).

---

## 14. Métricas de Sucesso

- Tempo médio para cadastrar 100 alunos: de ~100 minutos (manual) para < 10 minutos (import completo).
- % de importações concluídas sem edição manual pós-import (meta: > 80%).
- % de linhas aproveitadas por arquivo (meta: > 90% na 2ª tentativa).
- Redução de alunos sem turma/mensalidade após migração.

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Robustez e round-trip (1 ciclo)
1. Parser CSV real (aspas/BOM/delimitadores) + detecção de cabeçalho.
2. Prévia com status por linha, edição/remoção e contagem real.
3. Template para download + relatório de ignorados com download.
4. Dedupe de telefone como aviso e e-mail como bloqueio configurável.
5. Guard de permissão server-side no `importBatch` (com log de rollout).

### Fase 2 — Cadastro completo (1–2 ciclos)
6. Colunas de responsável/CPF/mensalidade/vencimento/modalidade/turma/notas.
7. Extrair helpers de turma para `server/services/TurmaService` e matricular no lote.
8. Cobranças do mês opcionais + convites de portal opcionais com relatório separado.
9. Importação parcial no limite do plano.

### Fase 3 — Escala e conveniência (backlog)
10. XLSX + arrastar-e-soltar.
11. Histórico de lotes (`student_import_batches`) + desfazer.
12. Matching fuzzy de homônimos e sugestão de mesclagem.
13. Wrapper de importação para o link de matrícula (mesmo parser no auto-cadastro).

### Fase 5 — Testes (transversal)
- Vitest: parser (BOM/aspas/datas/moeda), guard de permissão, dedupe, limite de plano, matrícula com fila.
- QA manual: arquivo do Excel BR, arquivo do próprio export, 300 linhas, duplo clique, mobile.
