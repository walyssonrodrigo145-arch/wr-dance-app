# PRD — IAs Especialistas por Instrumento (MusicPro AI)

## 1. Visão Geral

### Problema
O gerador de Plano Diário de Estudos (`server/routers/progressRouters.ts:generateDailyStudyPlan`) usa um único prompt genérico parametrizado por `instrumentContexts.ts` (7 categorias: `cordas_dedilhadas`, `teclado`, `percussao`, `voz`, `sopro`, `cordas_arco`, `geral`). O mapa atual (`server/utils/instrumentContexts.ts:44`) é estático, sem validação pós-geração e sem *few-shots* por instrumento.

Relato real de cliente: **violão funciona bem, teclado falha**. Exemplo crítico: ao cadastrar meta com termo **"voz"** para teclado (ex: "trabalhar condução de vozes / voicing / 4 vozes"), a IA interpretou **voz = canto** e gerou exercícios de respiração diafragmática, vocalise e projeção vocal — conteúdo completamente fora do instrumento. Isso quebra confiança do professor/aluno e invalida o plano.

Outros sinais do problema:
- Prompt atual lista `terminology` e `forbiddenTerms`, mas não impede alucinação de termos cruzados quando `instrumentCategory` está ausente/errado (fallback `geral` — `server/utils/instrumentContexts.ts:412`).
- `teclado` permite `dedilhado` como terminology (também usado em cordas), aumentando ambiguidade.
- `generateAIInsight` e `generateNextLessonPlan` e `suggestNextLessonTopic` (**progressRouters.ts:231,256,334**) **NÃO usam** `getInstrumentContext` — são 100% genéricos.
- Não há suite de regressão semântica por instrumento.

### Objetivo
Criar **IAs Especialistas por Instrumento**: cada categoria passa a ter um **agente especialista** com *system prompt* próprio, glossário, *few-shots* validados, lista de bloqueio e validador pós-geração. O roteador seleciona o especialista correto antes de chamar `callGemini` e garante que o plano respeite terminologia, exercícios e progressão do instrumento.

Meta: taxa de acerto terminológico >98% nos testes de regressão e zero casos de contaminação cruzada (ex: voz de teclado nunca mais virar canto).

### Contexto
- **Backend atual:**
  - `server/utils/instrumentContexts.ts` — mapa estático (terminology, forbiddenTerms, warmup, technicalFocus, challenge, levelHints, extraInstruction)
  - `server/routers/progressRouters.ts:406` — `generateDailyStudyPlan` já consome `getInstrumentContext`
  - `server/utils/gemini.ts` — `callGemini`
  - `drizzle/schema.ts:113` — `instruments(category)` + `students(instrumentId, level)`
  - `server/advancedAiRouter.ts` — `generateSmartLessonPlan` (genérico, sem contexto de instrumento)
- **Frontend:** `client/src/pages/Progresso.tsx` — seletor `planMode` (direto/didático/desafio) + `targetMinutes` + `teacherNotes`
- **PRDs relacionados:** `PRD_TRES_MODOS_PLANO_DIARIO.md`

---

## 2. Usuários Envolvidos

- **Professor/Admin (ator principal):** cadastra instrumentos, nível do aluno, metas (`studentGoals`) e gera plano. Espera precisão pedagógica.
- **Aluno:** consome plano diário (5 dias) no portal. Recebe linguagem adequada ao instrumento/nível.
- **Aluno de teclado/piano (persona crítica):** mais afetado pela ambiguidade "voz/vozes/voicing".
- **Gestor pedagógico / QA:** valida qualidade por instrumento.
- **Sistema (IA):** LLM via `callGemini` (Gemini/Groq via `settings.aiProvider`).

---

## 3. Escopo

### Incluído
- Roteador de especialista: seleção determinística de agente por `instruments.category` + `instruments.name`
- Reestruturação de `instrumentContexts.ts` → `server/services/InstrumentSpecialistService.ts` (ou `server/utils/instrumentSpecialists.ts`) com `systemPrompt`, `glossary`, `fewShotExamples`, `forbiddenTerms` estritos e `postValidation`
- Glossário de desambiguação (ex: "voz" polissêmico — definição por categoria)
- Validação pós-geração: detector de contaminação cruzada + fallback de regeneração / sanitização
- Cobertura de `generateDailyStudyPlan` + `generateNextLessonPlan` + `suggestNextLessonTopic` + `generateAIInsight` + `generateSmartLessonPlan` (advanced)
- Suite de testes de regressão semântica por instrumento (vitest)
- Telemetria de qualidade (logs de contaminação detectada)
- Documentação em `ARCHITECTURE.md` / `AI_CONTEXT.md`

### Fora do escopo
- Fine-tuning / treino de modelo proprietário (usará prompt engineering + few-shots)
- Novos instrumentos físicos ou cadastro de categorias no banco (usa `instruments.category` existente)
- Tradução multilíngue do plano (pt-BR mantido)
- Edição manual de prompts por cliente via UI (previsto como Fase 5 opcional, não MVP)
- TTS / áudio / vídeo gerado por IA

---

## 4. Requisitos Funcionais

### RF-001 — Roteador de Especialista por Instrumento
**Descrição:** Sistema deve resolver `resolvedCategory` e instanciar o `InstrumentSpecialist` correto antes de qualquer chamada LLM relacionada a plano/ insight.
**Atores:** Backend (tRPC).
**Pré-condições:** `student.instrumentId` informado ou fallback `geral`; `instruments.category` normalizado.
**Fluxo principal:**
1. `generateDailyStudyPlan` recebe `studentId`
2. Busca `instruments.name/category`
3. Chama `InstrumentSpecialistService.resolve(instrumentName, category)` → retorna `specialistId` (ex: `teclado`)
4. Carrega `specialist.systemPrompt`, `glossary`, `fewShots`
5. Compõe prompt final com bloco do especialista
**Exceções:** Categoria desconhecida → `geral` + log warn + `importantMessage` orienta cadastrar instrumento.
**Dados:** `students.instrumentId`, `instruments.category/name`, `InstrumentSpecialist.registry`

### RF-002 — Prompt de Sistema Especializado (System Prompt por Instrumento)
**Descrição:** Cada especialista possui system prompt próprio com identidade, limites e instruções de estilo por `planMode`.
**Atores:** Backend.
**Fluxo:**
- `teclado`: "Você é um professor especialista em piano/teclado com 20 anos de experiência em técnica de mãos, leitura em duas claves, pedal e condução de vozes (voicing)..."
- `voz`: "Você é preparador vocal... aparelho fonador, respiração..."
- `cordas_dedilhadas`, `percussao`, `sopro`, `cordas_arco` idem
**Validação:** Prompt final deve conter `## IDENTIDADE DO ESPECIALISTA` + `## GLOSSÁRIO` + `## REGRAS ABSOLUTAS DO ESPECIALISTA`.

### RF-003 — Glossário de Desambiguação Polissêmica
**Descrição:** Mapa `termo → definição por categoria` para termos ambíguos. Prioridade máxima para `voz/vozes/voicing`.
**Exemplo:**
- `voz` em `teclado` = "linha ou camada polifônica (ex: 4 vozes = SATB no teclado, condução de vozes, voicing de acorde Dm7 = D-F-A-C fechado/aberto)"
- `voz` em `voz` = "instrumento vocal humano; aparelho fonador"
- `pedal` em `teclado` = "pedal de sustain/damper" vs `pedal` em `percussao` = "pedal de bumbo/chimbal" vs `pedal` em `cordas_dedilhadas` = "pedal de efeito"
- `palheta` em `sopro` (sax/clarinete) ≠ `palheta` em `cordas_dedilhadas`
**Fluxo:** Glossário injetado no prompt como `## GLOSSÁRIO DE DESAMBIGUAÇÃO — USE A DEFINIÇÃO DE {categoria}`.

### RF-004 — Few-Shots Validados por Instrumento e por Modo
**Descrição:** Cada especialista mantém 2-3 exemplos curtos de plano correto no seu instrumento para cada `planMode` (direto/didático/desafio). Exemplos servem de âncora para a LLM não fugir do domínio.
**Atores:** Backend.
**Pré-condição:** Exemplos auditados por professor do instrumento.
**Dados:** `specialist.fewShots[planMode][] = { goal, output }`

### RF-005 — Validador Pós-Geração (Contaminação Cruzada)
**Descrição:** Após `callGemini` e parse JSON, executar validador determinístico antes de persistir em `daily_study_plans`.
**Fluxo:**
1. Percorrer todo `planText` (stringify) em lowerCase
2. Verificar presença de `forbiddenTerms` do especialista ativo
3. Verificar confusões críticas (ex: se `resolvedCategory===teclado` e contém `respiração diafragmática|vocalise|projeção vocal|afinação vocal` → falha)
4. Se falha → **(a)** tenta sanitizar (remove frase contaminada e substitui por fallback) OU **(b)** regenera com prompt reforçado `RETRY` (max 1 retry). Se persistir, bloqueia salvamento e retorna erro amigável pedindo revisão da meta.
5. Loga `instrument_specialist_validation_failed` com termos encontrados
**Dados envolvidos:** `daily_study_plans.planText`, `Instruments.forbiddenTerms`

### RF-006 — Cobertura Ampliada: Outros Endpoints de IA Respeitam Especialista
**Descrição:** `generateNextLessonPlan`, `suggestNextLessonTopic`, `generateAIInsight` (progressRouters) e `generateSmartLessonPlan` (advancedAiRouter) devem também resolver especialista e injetar `terminology/forbidden/glossary` no prompt. Hoje são genéricos.
**Fluxo:** Mesmo `resolve` + injeção; testes cobrem cada procedure.

### RF-007 — Telemetria e Log de Qualidade
**Descrição:** Registrar `specialistId`, `planMode`, `instrumentName`, `validationPassed`, `retryCount`, `forbiddenTermsFound` em `console.warn` estruturado e (opcional) tabela `ai_generation_logs` futura. Permite auditoria do bug "voz→canto".
**Atores:** Backend.

### RF-008 — Suite de Regressão Semântica por Instrumento
**Descrição:** Testes vitest que garantem que, para metas com termos ambíguos, o plano gerado (mockado) passa pelo validador. Incluir dataset mínimo:
- Teclado: "trabalhar condução de vozes em 4 vozes", "voicing de Dm7", "inversões com vozes internas"
- Violão: "pestana em F", "dedilhado p-i-m-a"
- Bateria: "paradiddle e groove 4/4"
- Voz: "apoio diafragmático e passagem de registro"
- Sopro: "embocadura e coluna de ar"
- Cordas arco: "golpe de arco détaché"
**Fluxo:** Teste unitário puro do validador (sem chamar LLM) + teste de integração do `InstrumentSpecialistService.resolve` e prompt builder.

### RF-009 — Documentação de Especialistas
**Descrição:** Atualizar `ARCHITECTURE.md` e `AI_CONTEXT.md` com seção "Instrument Specialists" — lista de categorias, como adicionar novo especialista, glossário e fluxo de validação.

### RF-010 — Editor Visual de Plano (Sem JSON) — *Novo Requisito do Usuário*
**Descrição:** Substituir edição crua de JSON (`Progresso.tsx:1653` — `Textarea` monoespacado) por editor visual estruturado onde professor edita campos humanos sem ver JSON. JSON continua sendo o formato de persistência (`daily_study_plans.planText`), mas a UI faz parse → formulário → serialize.
**Atores:** Professor/Admin (frontend `Progresso.tsx`, novo `components/progresso/PlanEditor.tsx`).
**Pré-condições:** `studyPlanContent` é JSON válido com `days[]`; usuário tem permissão de edição (mesma do `updateStudyPlan`); plano em `rascunho` ou `publicado` (edição permite ambos, com aviso se publicado).
**Fluxo principal:**
1. Professor clica "Editar" no card do plano (substitui textarea)
2. Sistema faz `parsePlanData(planText)` → estado local `editedPlan: StudyPlan`
3. Renderiza seções editáveis: `weeklyGoal` (Input), `importantMessage` (Textarea), para cada `day` (5): `dayName`, `focus.title`, `focus.description`, e para cada `exercise` dentro do dia: `title`, `subtitle`, `duration` (ex: "10 min"), `points[]` (lista dinâmica)
4. Professor edita inline (inputs), adiciona/remove pontos (`+ Adicionar ponto`, `× Remover`), adiciona/remove exercícios (opcional, máx 4 por dia)
5. Clica "Salvar" → valida campos obrigatórios localmente → `JSON.stringify(editedPlan)` → `updateStudyPlan.mutate({ planId, planText })`
6. Backend revalida JSON (`progressRouters.ts:986` — já existe `try JSON.parse`) + revalida com `validatePlanText` do especialista (se aplicável) → persiste
7. Toast sucesso + `setStudyPlanContent(JSON.stringify(editedPlan))` + fecha modo edição
**Exceções:** JSON inválido ao abrir → mostra fallback "Plano em formato antigo, edição visual indisponível — use edição de texto" + botão "Restaurar JSON cru". Validação local falha → destaca campo vermelho, não envia.
**Dados envolvidos:** `daily_study_plans.planText` (JSON), `StudyPlan` (TS interface já em `Progresso.tsx:267`), `dailyStudyPlans.id`.

### RF-011 — Validação Local do Editor Visual
**Descrição:** Editor deve impedir salvamento com dados inválidos antes de chamar API.
**Regras de validação:**
- `weeklyGoal` opcional, max 300 chars
- `focus.title` obrigatório por dia (1-80 chars); `focus.description` opcional max 200
- `exercise.title` obrigatório (1-60 chars); `duration` opcional mas se preenchido deve ser `^\d+\s*min$` (ex: "5 min", "12 min")
- `points` — ao menos 1 por exercício se exercício existir; cada ponto 1-150 chars; vazio não salva
- `days.length` deve permanecer 5 (não permite remover dia, apenas editar) — evita quebra de `daysCompleted`/`daysTimeSpent` [5]
**Fluxo de erro:** Mostra `toast.error` + borda vermelha no campo + não dispara mutation.

### RF-012 — Compatibilidade / Fallback para JSON Cru
**Descrição:** Manter modo JSON cru como fallback técnico, acessível via toggle "Modo Avançado (JSON)" dentro do editor, para debug/suporte. Usuário comum nunca precisa dele.
**Fluxo:** Botão pequeno "Ver JSON" → expande textarea monoespaçado somente leitura + botão "Copiar JSON". Edição crua continua disponível mas escondida por padrão.

### RF-013 — Persistência e Revalidação Pós-Edição
**Descrição:** Ao salvar edição visual, backend deve reaplicar validador de especialista (RF-005) para evitar que edição manual introduza contaminação (ex: professor de teclado colar "vocalise" manualmente).
**Fluxo:** `updateStudyPlan` → `validatePlanText(JSON.stringify(editedPlan), specialistId)` → se falhar, retorna `PRECONDITION_FAILED` com lista de termos proibidos encontrados; frontend mostra erro "Seu plano contém termos de outro instrumento: {termos}. Corrija antes de salvar."
**Dados:** `instruments.category` resolvido no backend via `students.instrumentId`.

### RF-014 — UX de Edição Visual
**Descrição:** Estado de edição visual deve ser claro, com preview ao vivo e confirmação.
**Elementos:**
- Header "Editando Plano — Dia 1 de 5" com paginação/tabs por dia (reuso do `selectedDay` já existente)
- Botões "Cancelar" (descarta `editedPlan`, volta ao `studyPlanContent` original) e "Salvar" (com loading)
- Indicador "Alterações não salvas" (dot amarelo)
- Toasts: sucesso/erro já existentes (`progressRouters.ts:242`)

---

## 5. Regras de Negócio

### RN-001 — Especialista Determinístico por Categoria
**Regra:** A escolha do especialista é determinística por `category` (fonte primária) e `name` (fallback). Nunca por inferência da LLM sobre o texto da meta.
**Exemplo válido:** `instruments.category=teclado` + meta "vozes" → especialista `teclado` → "condução de vozes" = polifonia.
**Exemplo inválido:** IA decide sozinha que meta com "voz" é canto mesmo com `category=teclado`.
**Consequência:** Sistema ignora palpite da LLM e impõe especialista da categoria.

### RN-002 — Proibição Absoluta de Contaminação
**Regra:** Plano de `teclado` nunca pode conter termos da lista `forbiddenTerms` de `teclado` (ex: `vocalise`, `respiração diafragmática`, `traste`, `pestana`, `bumbum/caixa/chimbal`). Validador deve falhar se encontrar.
**Consequência:** Bloqueio de salvamento + retry ou erro `PRECONDITION_FAILED` com mensagem: "Plano gerado com termos de outro instrumento. Tente reformular a meta ou gere novamente."

### RN-003 — Polissemia "Voz" Desambiguada por Categoria
**Regra:** 
- Se `resolvedCategory=teclado` → "voz/vozes/voicing" = camada polifônica/nota dentro do acorde. Exemplos corretos: "condução de 4 vozes", "voicing fechado de Cmaj7", "vozes internas".
- Se `resolvedCategory=voz` → "voz" = aparelho vocal humano.
- Se meta disser "voz" sem contexto e categoria for `teclado`, assumir polifonia e nunca gerar exercício de canto.
**Exemplo válido (teclado):** "Exercício: toque Dm7 em voicing fechado (D-F-A-C) na mão direita, baixo D na esquerda."
**Exemplo inválido (teclado):** "Vocalise com vogal 'mah' e respiração diafragmática para aquecer a voz."
**Consequência:** Validador detecta `vocalise/respiração diafragmática` em plano de teclado → falha.

### RN-004 — Fallback Genérico Não Gera Termo Específico Incorreto
**Regra:** Quando `resolvedCategory=geral` (instrumento não cadastrado), plano deve usar termos genéricos (`instrumento, nota, ritmo, postura`) e evitar termos específicos de qualquer especialista. Deve incluir `importantMessage` orientando cadastro do instrumento.
**Consequência:** Se fallback, `validation` permite apenas termos genéricos.

### RN-005 — Isolamento Multi-Tenant e Permissão
**Regra:** Especialistas são globais (código), mas geração de plano respeita `organizationId` e `professorId` (verificações já existentes em `progressRouters.ts:56-60`). Validador não pode vazar dados entre orgs.
**Consequência:** Query sempre com `eq(students.organizationId, orgId)`.

### RN-006 — Idempotência de Geração
**Regra:** Validador não pode duplicar salvamento. Apenas 1 `daily_study_plans` por chamada. Retry gera novo `callGemini`, não duplica registro.
**Consequência:** Persistência só após `validationPassed===true`.

### RN-007 — Mensagem de Erro Sem Exposição Técnica
**Regra:** Falha de validação retorna mensagem amigável pt-BR, sem stack/keys. Log técnico fica no servidor.
**Exemplo:** "Não conseguimos gerar um plano preciso para este instrumento com os termos informados. Tente reformular a meta (ex: 'condução de vozes no teclado' em vez de 'voz') ou gere novamente."

### RN-008 — Edição Visual Nunca Expõe JSON ao Usuário Comum
**Regra:** Usuário sem conhecimento de programação nunca vê JSON. Editor visual é o padrão; JSON cru é fallback escondido atrás de "Modo Avançado".
**Exemplo válido:** Professor clica Editar → vê inputs "Objetivo da Semana", "Dia 1 — Foco", "Exercício 1 — Título", lista de pontos com +/×.
**Exemplo inválido:** Mostrar textarea com `{"days":[{"dayName":...` como única opção.
**Consequência:** Sistema parseia JSON e renderiza formulário; se parse falhar, mostra erro + opção JSON.

### RN-009 — Estrutura de 5 Dias é Imutável no Editor
**Regra:** Editor não permite adicionar/remover dias (mantém `days.length===5` para compatibilidade com `daysCompleted: [false×5]` e `daysTimeSpent: [0×5]`). Permite apenas editar conteúdo dos 5 dias e adicionar/remover `points`/`exercises` dentro de cada dia (max 4 exercícios/dia para não estourar tempo).
**Consequência:** Botões de remover dia desabilitados; validação bloqueia `editedPlan.days.length !==5`.

### RN-010 — Edição Revalida Contaminação
**Regra:** Todo salvamento via editor visual passa pelo mesmo `validatePlanText` da geração. Edição manual que introduza termo proibido (ex: "vocalise" em plano de teclado) é rejeitada com lista de termos.
**Consequência:** `updateStudyPlan` retorna `PRECONDITION_FAILED` com `found: string[]`; frontend destaca pontos/exercícios que contêm termo.

### RN-011 — Cancelar Descarta sem Persistir
**Regra:** "Cancelar" descarta `editedPlan` local e não chama API. Sem dirty-write.
**Consequência:** `setIsEditingStudyPlan(false)` + restore `studyPlanContent` original.

---

## 6. Fluxos

### Fluxo Principal — Geração de Plano Diário com Especialista
```text
Professor
↓
Acessa Progresso → aluno com instrumentId=teclado
↓
Cadastra meta: "Trabalhar condução de vozes em 4 vozes com inversões"
↓
Seleciona planMode=didatico, targetMinutes=30, teacherNotes opcional
↓
Clica "Gerar Plano Diário"
↓
Backend: resolve especialista (teclado) via InstrumentSpecialistService
↓
Monta prompt: systemPrompt(teclado) + glossário(voz→polifonia) + terminology/forbidden + fewShots + metas
↓
callGemini (Gemini/Groq)
↓
Parse JSON defensivo
↓
Validador pós-geração (forbiddenTerms scan)
↓
[se passou] → persiste daily_study_plans (rascunho) → retorna plano
↓
Frontend exibe 5 dias, publish opcional
```

### Fluxo Alternativo — Instrumento Não Cadastrado (Fallback)
```text
Aluno sem instrumentId
↓
Especialista = geral
↓
Prompt genérico + importantMessage: "Cadastre o instrumento..."
↓
Validador permite apenas termos genéricos
↓
Persiste com aviso
```

### Fluxo de Erro — Contaminação Detectada (Voz→Canto)
```text
Meta teclado com "voz"
↓
LLM alucina e gera "vocalise + respiração diafragmática"
↓
Validador detecta forbiddenTerms ["vocalise","respiração diafragmática"] em categoria teclado
↓
Log warn + retry com prompt reforçado ("RETRY: você é especialista em TECLADO, voz=polifonia, proibido termos de canto")
↓
Se retry passar → persiste retry
Se retry falhar → retorna TRPCError PRECONDITION_FAILED com mensagem amigável, não persiste
```

### Fluxo de Erro — Categoria Ambígua (ex: instruments.category="teclado/piano")
```text
categoryMap resolve "teclado/piano" → teclado ( InstrumentContexts.ts:480 )
↓
Se não resolver → tenta name → tenta match parcial → fallback geral
```

### Fluxo de Permissão Negada
```text
Professor B tenta gerar plano para aluno de Professor A (mesma org, mas professorId diferente)
↓
Verificação existente já bloqueia (ownedStudent check)
→ retorna FORBIDDEN
```

### Fluxo sem Dados (Sem Metas)
```text
Aluno sem studentGoals pendentes
↓
weeklyGoalsText = "NENHUMA META CADASTRADA"
↓
Prompt orienta basear em fundamentos do instrumento + importantMessage pede cadastro de metas
↓
Validador ainda exige terminologia correta do especialista
```

### Fluxo Principal — Edição Visual do Plano (Sem JSON)
```text
Professor
↓
Visualiza plano (rascunho/publicado) no modal Progresso.tsx
↓
Clica "Editar" (ícone lápis)
↓
Sistema parseia planText → editedPlan (estado local)
↓
Renderiza PlanEditor: weeklyGoal, importantMessage, tabs Dia 1-5, focus, exercises, points
↓
Professor altera e.g. Dia 1 → Foco Título, Exercício 2 → ponto 3, adiciona ponto "+"
↓
Clica "Salvar"
↓
Validação local (campos obrigatórios, duration regex)
↓
[se falhar] → destaca campo, toast erro, não chama API
↓
[se passar] → JSON.stringify(editedPlan) → updateStudyPlan.mutate
↓
Backend: JSON.parse + validatePlanText(specialistId)
↓
[se contaminação] → PRECONDITION_FAILED → frontend mostra termos proibidos
↓
[se ok] → persiste daily_study_plans.planText → toast sucesso → fecha edição → exibe plano atualizado
```

### Fluxo Alternativo — Cancelar Edição
```text
Professor em modo edição visual
↓
Clica "Cancelar"
↓
Descarta editedPlan, restaura studyPlanContent original, fecha edição
↓
Nenhuma chamada API
```

### Fluxo de Erro — Edição com JSON Corrompido
```text
planText inválido (JSON.parse falha)
↓
PlanEditor detecta parsed === null
↓
Exibe "Formato antigo — edição visual indisponível"
↓
Botão "Ver JSON" → mostra textarea crua somente leitura + Copiar
```

---

## 7. Casos Extremos e Edge Cases

- **Termo "voz" em teclado com variações:** `voz`, `vozes`, `voicing`, `voicings`, `4 vozes`, `condução de vozes`, `abrir vozes`, `vozes internas` — todos devem mapear para polifonia em teclado, nunca para canto.
- **Outros termos polissêmicos:** `pedal` (sustain vs bumbo vs pedal de efeito), `palheta` (sopro vs cordas), `arco` (cordas_arco vs "arco harmônico" genérico), `corda` (cordas_dedilhadas vs cordas_arco).
- **Meta com múltiplos instrumentos mencionados:** Ex: "tocar violão e teclado". Especialista é definido pela categoria do aluno, não pela meta. Sistema deve ignorar instrumento citado na meta fora do especialista e priorizar `instruments.category`.
- **Categoria com typo:** `Telcado`, `TECLADO`, `teclado ` → normalização `toLowerCase().trim()` já existente, manter.
- **Instrumento personalizado:** Ex: `instruments.name="Teclado Arranjador"`, `category="teclado"` → deve resolver para teclado via `categoryMap`.
- **Instrumento novo não mapeado:** Ex: `category="harpa"` → cai em `geral` + log + mensagem orientando cadastro; não deve gerar termos de harpa alucinados.
- **Duplo clique em Gerar:** Debounce no frontend + idempotência no backend (retry não duplica).
- **Timeout da LLM:** Retornar `INTERNAL_SERVER_ERROR` com mensagem "IA demorou para responder, tente novamente" (log interno preserva stack).
- **JSON malformado da LLM:** Parser defensivo já existente (regex `\{[\s\S]*\}`) — manter + aplicar validador só após parse OK.
- **ForbiddenTerms com substring:** Ex: `arco` dentro de `arco-íris` — evitar falso positivo: validador usa word boundary ou lista normalizada com regex `\barco\b`.
- **Meta muito longa (>500 chars):** Já truncada em `teacherNotes.substring(0,500)` — manter; metas são `varchar(255)` + `description text`.
- **Aluno com `level` nulo:** Fallback `iniciante`.
- **Troca de instrumento do aluno após plano gerado:** Plano antigo permanece com `instrument` snapshot; novo plano usa novo especialista — não retroage.
- **Concorrência:** Dois professores gerando plano simultâneo para mesmo aluno → ambos geram rascunhos independentes (comportamento atual), sem lock; publish invalida antigos.
- **Lista vazia de forbiddenTerms em `geral`:** Validador em `geral` deve apenas checar contaminação inexistente; permitir todos genéricos.
- **Fuso horário em `scheduledAt`:** Não afeta geração, mas `lessonsText` usa `toISOString().slice(0,10)` — manter.
- **Virada de mês em `targetDate` de schedule logs:** Não aplicável.
- **Editor com plano 5 dias: tentar remover Dia:** Bloqueado — validação `days.length !==5` impede salvamento; botão remover dia não existe.
- **Editor com `points` vazios ou só espaços:** Validação local rejeita `p.trim().length===0` → borda vermelha + toast.
- **Editor com duração inválida:** Ex: "10 minutos", "dez min" → regex falha → erro "Use formato '10 min'".
- **Editor com edição simultânea por 2 professores:** Último `updateStudyPlan` vence (sem lock otimista no MVP); `updatedAt` sobrescreve. Risco baixo; Fase 5 pode adicionar `updatedAt` check.
- **Plano publicado sendo editado:** Permitido, mas mostra aviso amarelo "Este plano já está publicado — alterações serão visíveis ao aluno após salvar".
- **JSON corrompido no banco (edição manual antiga):** `parsePlanData` retorna null → editor mostra fallback JSON cru + botão "Resetar para template vazio".
- **Copiar/colar termos proibidos no editor:** Revalidação backend (RF-013) bloqueia e lista termos encontrados; frontend destaca campo.

---

## 8. Dados Envolvidos

### Entidades Existentes (Reuso)
| Entidade | Campo Relevante | Tipo | Obrigatório | Regra |
|---|---|---|---|---|
| `students` | `instrumentId` | integer FK | Não | Define especialista. Se null → `geral` |
| `instruments` | `category` | varchar(100) | Sim | Normalizado lowerCase; valores: cordas_dedilhadas, teclado, percussao, voz, sopro, cordas_arco, geral |
| `instruments` | `name` | varchar(100) | Sim | Fallback para resolve via `categoryMap` |
| `studentGoals` | `title`, `description` | text | Sim/Não | Fio condutor exclusivo do plano |
| `daily_study_plans` | `planText` | text (JSON) | Sim | Deve incluir `instrument`, `level`, `planMode` (persistência já faz) |
| `settings` | `aiProvider`, `geminiApiKey`, `groqApiKey` | varchar/text | Sim | Provider por org/user |

### Nova Estrutura — `InstrumentSpecialist` (Código, não tabela no MVP)
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | `InstrumentCategory` | Sim | Chave do especialista (ex: `teclado`) |
| `displayName` | string | Sim | "Piano / Teclado" |
| `systemPrompt` | string | Sim | Identidade + missão + limites do especialista |
| `glossary` | `Record<string,string>` | Sim | Termo → definição específica da categoria (ex: voz→polifonia) |
| `terminology` | string[] | Sim | Termos corretos (existente, refinado) |
| `forbiddenTerms` | string[] | Sim | Lista de bloqueio estrita (normalizada lowerCase, com word boundary) |
| `warmupDescription` | string | Sim | (existente) |
| `warmupExamples` | string[] | Sim | (existente) |
| `technicalFocusExamples` | string[] | Sim | (existente) |
| `challengeExamples` | string[] | Sim | (existente) |
| `levelHints` | object | Sim | (existente) |
| `extraInstruction` | string | Sim | (existente, reforçada) |
| `fewShots` | `Record<PlanMode, Example[]>` | Sim | 2-3 exemplos por modo |
| `retryInstruction` | string | Sim | Prompt de correção quando validador falha |

**Decisão de persistência (assunção explícita):** MVP mantém especialistas como **código versionado** (arquivo `server/services/InstrumentSpecialistService.ts`). Tabela `instrument_specialists` no banco fica como **Fase 5 opcional** para edição via SuperAdmin sem deploy. Isso evita migração crítica no MVP e mantém `appRouter` estável (Regra AGENTS.md #3).

### Índices e Integridade
- Reusar índices existentes: `instruments(organizationId)`, `students(instrumentId)` (já via FK lógica).
- Nova validação é em memória (sem índice novo). Futuro `ai_generation_logs` teria índice `(organizationId, specialistId, createdAt)`.

### Exemplo de Registro em `daily_study_plans.planText` (pós-mudança)
```json
{
  "instrument": "Teclado",
  "level": "iniciante",
  "planMode": "didatico",
  "specialistId": "teclado",
  "validationPassed": true,
  "weeklyGoal": "Condução de vozes em 4 vozes com inversões de tríades",
  "days": [...]
}
```

---

## 9. Permissões e Segurança

| Ação | Admin | Professor (dono do aluno) | Professor (outro aluno) | Aluno | SuperAdmin |
|---|:---:|:---:|:---:|:---:|:---:|
| Gerar plano (`generateDailyStudyPlan`) | Sim | Sim | **Não** (FORBIDDEN via `professorId` check) | Não | Sim (se org) |
| Visualizar especialista (código/docs) | Sim | Sim | Sim | Não | Sim |
| Editar especialista (Fase 5 tabela) | Não | Não | Não | Não | Sim |
| Ver logs de validação | Sim | Não | Não | Não | Sim |

- **Isolamento:** Toda query com `eq(students.organizationId, orgId)` + `eq(instruments.organizationId, orgId)`. Especialistas são stateless, sem vazamento entre orgs.
- **Backend enforcement:** Validador roda no servidor; esconder botão no frontend **não** é segurança.
- **Dados sensíveis:** Nunca logar `apiKey`, `planText` completo em log público; logs de validação registram apenas `specialistId`, `forbiddenTermsFound` (sem dados do aluno).
- **Mensagens de erro:** Nunca expor `stack`, `prompt` interno ou `responseText` bruto da LLM ao cliente. Detalhes em `console.warn` servidor.
- **Rate limit:** Reuso do `whatsapp_rate_limits` não se aplica; considerar `ai_rate_limit` futuro se abuso de geração for detectado (fora do MVP).

---

## 10. Tratamento de Erros

### Erros Esperados (mensagem clara ao usuário, sem stack)
- **Categoria sem instrumento cadastrado:** `importantMessage` no plano + `validationPassed` com aviso. Não bloqueia.
- **Contaminação detectada (1ª tentativa):** Retry silencioso com `retryInstruction`. Usuário vê apenas delay (+3-5s).
- **Contaminação persistente após retry:** `TRPCError PRECONDITION_FAILED`: "Não conseguimos gerar um plano preciso para Teclado com os termos informados. Tente reformular a meta (ex: use 'condução de vozes' em vez de apenas 'voz') ou gere novamente."
- **Sem metas cadastradas:** Plano gerado com fundamentos + `importantMessage` pedindo cadastro de metas (comportamento já existente).
- **API key não configurada:** `PRECONDITION_FAILED`: "Chave de API da IA não configurada. Acesse Configurações > Inteligência Artificial." (já existente em `progressRouters.ts:741`).
- **Validação de plano com `days.length <5`:** `INTERNAL_SERVER_ERROR`: "A IA gerou apenas X dias (esperado:5). Tente novamente." (já existente).

### Erros Internos (log servidor, mensagem genérica ao usuário)
- **Timeout / falha `callGemini`:** Log com `specialistId` + `planMode`; retorna "Ocorreu um erro ao gerar o plano. Tente novamente em instantes."
- **JSON malformado persistente:** Log `ai_invalid_json`; retorna "A IA retornou formato inválido. Tente novamente."
- **DB indisponível:** `INTERNAL_SERVER_ERROR` padrão; não expõe query.

### Estratégia
- Sempre separar `Error esperado` (validação de negócio) vs `Error interno` (infra/LLM).
- Detalhes técnicos apenas em `console.warn` / `server/utils/logger`.

---

## 11. Requisitos Não Funcionais

### RNF-001 — Performance
Geração deve completar em <15s (incluindo 1 retry). Validador pós-geração é O(n) sobre `planText` (<5ms). Não adicionar round-trip extra ao banco por especialista (registry em memória).

### RNF-002 — Confiabilidade / Precisão Terminológica
Taxa de falso cruzamento (ex: teclado→canto) <2% nos testes de regressão. Glossário e forbiddenTerms devem cobrir 100% dos termos críticos mapeados (voz, pedal, palheta, arco, corda, pestana, traste, vocalise).

### RNF-003 — Segurança
Validação server-side obrigatória; nunca confiar apenas no prompt. Logs sem PII/keys.

### RNF-004 — Observabilidade
Cada geração loga `{ specialistId, planMode, instrumentName, validationPassed, retryCount, forbiddenTermsFound: string[] }` via `debugLog`/`console.warn` para auditoria.

### RNF-005 — Manutenibilidade
Adicionar novo especialista = criar entrada em `INSTRUMENT_SPECIALISTS` + 2-3 few-shots + testes. Sem migração de banco no MVP. Documentação em `AI_CONTEXT.md`.

### RNF-006 — Compatibilidade
Node 20+, Drizzle ORM, tRPC. Não alterar chaves do `appRouter` (`server/routers/index.ts`) — manter contrato (Regra AGENTS.md #3). Mudanças apenas dentro de `progressRouters` e `advancedAiRouter` helpers.

### RNF-007 — Usabilidade
Professor não precisa escolher especialista manualmente: seleção é automática por `instruments.category`. Mensagens de erro sugerem reformulação concreta ("use 'condução de vozes' em vez de 'voz'").

### RNF-008 — Testabilidade
Validador é função pura (`validatePlanText(planText: string, specialistId) → {passed, found}`) 100% testável sem LLM. Suite vitest dedicada `server/utils/instrumentSpecialists.test.ts`.

---

## 12. Critérios de Aceite

### CA-001 — Roteamento Automático
**Dado que** aluno tem `instruments.category=teclado` e `level=iniciante`,  
**Quando** professor gera plano com meta "condução de vozes em 4 vozes",  
**Então** o prompt enviado à LLM deve conter `## IDENTIDADE DO ESPECIALISTA: TECLADO` e glossário com `voz=polifonia` e `validationPassed` deve ser true sem termos de canto.

### CA-002 — Desambiguação "Voz" em Teclado
**Dado que** especialista é `teclado`,  
**Quando** plano é gerado para meta contendo "voz/vozes/voicing",  
**Então** o JSON resultante deve conter "voicing", "condução de vozes" ou "4 vozes" e **não** pode conter `vocalise|respiração diafragmática|projeção vocal|dicção vocal|aquecimento vocal`.

### CA-003 — Voz (Canto) Permanece Correta
**Dado que** especialista é `voz` e meta contém "voz",  
**Quando** plano é gerado,  
**Então** o plano deve conter `respiração diafragmática|vocalise|apoio vocal` e **não** pode conter `traste|pestana|corda solta|tecla|pedal de sustain|rudimento`.

### CA-004 — Violão Não Regride
**Dado que** especialista é `cordas_dedilhadas` e meta é sobre violão,  
**Quando** plano é gerado,  
**Então** o plano mantém terminologia de violão (`traste, pestana, palhetada, dedilhado p-i-m-a`) e passa no validador sem contaminação de teclado/canto/bateria.

### CA-005 — Validador Bloqueia Contaminação
**Dado que** mock de resposta da LLM contém "Respiração diafragmática: inspirar em 4 tempos" com `specialistId=teclado`,  
**Quando** `validatePlanText` é chamado,  
**Então** deve retornar `{passed:false, found:["respiração diafragmática"]}` e o fluxo deve fazer 1 retry ou retornar `PRECONDITION_FAILED`.

### CA-006 — Outros Endpoints Respeitam Especialista
**Dado que** professor chama `generateNextLessonPlan` ou `generateAIInsight` para aluno de teclado,  
**Quando** request é processado,  
**Então** o prompt deve incluir `terminology/forbidden` do especialista `teclado` (verificável por teste de snapshot do prompt builder).

### CA-007 — Fallback Genérico
**Dado que** aluno sem `instrumentId`,  
**Quando** plano é gerado,  
**Então** `specialistId=geral`, `importantMessage` contém "cadastre o instrumento", e validador permite termos genéricos sem acusar falso positivo.

### CA-008 — Telemetria
**Dado que** geração ocorre,  
**Quando** validador falha,  
**Então** log contém `{specialistId, forbiddenTermsFound}` e não contém `apiKey` ou `planText` completo.

### CA-009 — Regressão Semântica (Dataset)
**Dado que** suite `instrumentSpecialists.test.ts` executa,  
**Quando** dataset de 6 instrumentos × 2 metas ambíguas é validado,  
**Então** 100% dos casos de teclado com "voz" passam como polifonia e 0% geram termos de canto.

### CA-010 — Sem Quebra de Contrato tRPC
**Dado que** `appRouter` é inspecionado,  
**Quando** PR é avaliado,  
**Então** nenhuma chave de `appRouter` foi renomeada/reordenada; apenas helpers internos e `progressRouters`/`advancedAiRouter` foram tocados.

### CA-011 — Editor Visual Substitui JSON
**Dado que** professor clica "Editar" em plano rascunho/publicado,  
**Quando** modo edição abre,  
**Então** vê formulário com `weeklyGoal` + 5 tabs de dias + exercícios + pontos (sem JSON), e consegue alterar "Foco do Dia 1 — Título" de "Memória Muscular" para "Ataque do Acorde D" e salvar com sucesso sem ver `{`.

### CA-012 — Validação Local Impede Salvamento Inválido
**Dado que** professor deixa `focus.title` do Dia 2 vazio ou `points[0]` vazio,  
**Quando** clica "Salvar",  
**Então** botão não chama API, campo fica com borda vermelha e toast "Preencha o título do foco do Dia 2".

### CA-013 — Revalidação de Contaminação na Edição
**Dado que** plano de teclado é editado manualmente para conter "vocalise com vogal 'mah'",  
**Quando** clica "Salvar",  
**Então** backend rejeita com `PRECONDITION_FAILED` e frontend exibe "Seu plano contém termos de outro instrumento: vocalise. Corrija antes de salvar." e não persiste.

### CA-014 — Cancelar e Fallback JSON
**Dado que** professor edita mas clica "Cancelar",  
**Quando** volta à visualização,  
**Então** plano exibe conteúdo original sem alterações.  
**E dado que** plano é JSON inválido/corrompido,  
**Quando** tenta editar,  
**Então** vê mensagem "Formato antigo — edição visual indisponível" + botão "Ver JSON".

---

## 13. Riscos e Dependências

### Riscos
- **Risco técnico — Alucinação LLM ignora system prompt:** Mitigação: few-shots + validador pós-geração + retry. Risco residual baixo.
- **Risco técnico — Falso positivo do validador (ex: "arco" em "arco-íris"):** Mitigação: usar regex com word boundary + lista curada em lowerCase sem acentos duplicados.
- **Risco de dados — `instruments.category` inconsistente (ex: "Violão" livre):** Mitigação: `categoryMap` já cobre variações + normalização; criar teste de categorias órfãs.
- **Risco de performance — Retry dobra latência:** Mitigação: max 1 retry; se falhar, retorna erro rápido em vez de loop.
- **Risco de segurança — Prompt injection via `teacherNotes`/`goal description`:** Mitigação: sanitizar `teacherNotes` (limite 500, já existe) e escapar conteúdo de metas como dado, nunca como instrução (delimitar com `"""`).
- **Risco de regressão — Violão que hoje funciona pode quebrar:** Mitigação: suite de regressão compara `terminology` violão antes/depois; testes de snapshot do prompt.

### Dependências
- `callGemini` (Gemini/Groq) — disponibilidade externa.
- `settings.aiProvider/geminiApiKey/groqApiKey` — configuração por org.
- `drizzle/schema.ts` — `instruments`, `students`.
- `server/db.ts` — `getSettingsByUserId` (decrypt).
- `vitest` — para suite de regressão.
- `progressRouters.ts` e `advancedAiRouter.ts` — pontos de integração.
- Documentação `ARCHITECTURE.md`/`AI_CONTEXT.md` — atualização pós-implementação.

---

## 14. Métricas de Sucesso

- **Taxa de contaminação cruzada (teclado→canto):** 0 ocorrências em 50 gerações de teste com meta contendo "voz/vozes/voicing" (hoje >0).
- **Acurácia terminológica por instrumento:** >98% dos termos do plano pertencem à `terminology` do especialista (avaliado por validador, não humano).
- **NPS do professor para plano de teclado:** aumento ≥30% em avaliação "plano útil sem ajustes manuais" (coleta via feedback simples pós-geração).
- **Tempo médio de geração:** p50 <8s, p95 <15s (incluindo validação).
- **Taxa de retry por validação:** <5% das gerações.
- **Cobertura de testes:** `instrumentSpecialists.test.ts` com ≥20 casos (6 instrumentos × 3 modos + edge cases polissêmicos).

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Estrutura e Dados (1 dia)
- Criar `server/services/InstrumentSpecialistService.ts` (ou `server/utils/instrumentSpecialists.ts`) com registry tipado:
  - Migrar `INSTRUMENT_CONTEXTS` → `INSTRUMENT_SPECIALISTS` com `systemPrompt`, `glossary`, `fewShots`, `retryInstruction`
  - Implementar `resolve()`, `buildSpecialistPromptBlock()`, `validatePlanText()`
  - Curar glossário polissêmico (voz, pedal, palheta, arco, corda) com definições por categoria
  - Refinar `forbiddenTerms` de `teclado` para incluir variações (`voz cantada`, `canto coral`, `vocalise`, `projeção vocal`) e garantir `teclado.terminology` inclua `voicing`, `condução de vozes`, `vozes internas`
- **Entrega:** código + tipagem, sem alterar geração ainda; `pnpm check` verde.

### Fase 2 — Backend/API (2 dias)
- Refatorar `progressRouters.ts:generateDailyStudyPlan` para usar `InstrumentSpecialistService` (prompt builder + validador + retry 1×)
- Aplicar mesmo padrão em `generateNextLessonPlan`, `suggestNextLessonTopic`, `generateAIInsight` (progressRouters) e `generateSmartLessonPlan` (advancedAiRouter)
- Implementar telemetria (`debugLog` estruturado) e `importantMessage` já existente
- **Entrega:** tRPC continua compatível; testes manuais com aluno teclado vs violão.

### Fase 3 — Validação e Testes (1 dia)
- Criar `server/services/InstrumentSpecialistService.test.ts` (vitest):
  - Testes puros do `validatePlanText` (mock JSON com contaminação)
  - Testes de `resolve` (categoryMap, name fallback, match parcial, geral)
  - Testes de snapshot do `buildSpecialistPromptBlock` por instrumento
  - Dataset regressão: metas ambíguas por instrumento
- Rodar `pnpm vitest run server/services/InstrumentSpecialistService.test.ts` + `pnpm check`
- **Entrega:** CI verde, baseline `tsc_baseline.txt` sem novos erros.

### Fase 4 — Frontend (0,5 dia — opcional no MVP)
- Nenhuma mudança obrigatória no MVP (seleção automática). Opcional: badge no card "Especialista: Teclado 🎹" em `Progresso.tsx` para transparência.
- Se incluir fallback `geral`, exibir aviso já existente (`importantMessage`) com destaque.

### Fase 5 — Hardening e Evolução (pós-MVP)
- Tabela `instrument_specialists` + CRUD SuperAdmin para editar prompts sem deploy
- `ai_generation_logs` para auditoria contínua e dashboard de qualidade por instrumento
- Avaliação humana amostral (professores de cada instrumento validam 5 planos)
- Expansão do glossário com base em logs de `forbiddenTermsFound`

### Checklist de Saída por Fase
- [ ] `pnpm check` sem novos erros vs baseline
- [ ] `pnpm vitest run server/services/InstrumentSpecialistService.test.ts` 100% verde
- [ ] `pnpm test` completo sem flaky (rodar isolado se timeout)
- [ ] `pnpm build` ok
- [ ] Validação manual: gerar plano para aluno teclado com meta "vozes" → nenhum termo de canto; gerar plano para aluno canto com meta "voz" → termos vocais corretos.

---

## Checklist Final do Analista

- [x] Problema claramente definido (caso real teclado→canto com "voz")
- [x] Objetivo mensurável (zero contaminação, >98% acurácia)
- [x] Usuários identificados (professor, aluno teclado crítico, QA)
- [x] Escopo dentro/fora definido
- [x] RFs com identificadores e fluxos
- [x] RNs explícitas com exemplos válidos/inválidos (RN-003 polissemia)
- [x] Fluxos principal/alternativo/erro mapeados
- [x] Edge cases polissêmicos e técnicos cobertos
- [x] Dados/entidades/tipos e decisão de persistência (código vs tabela)
- [x] Permissões e segurança (multi-tenant, server-side enforcement)
- [x] Tratamento de erros esperado vs interno
- [x] RNFs verificáveis (performance <15s, precisão, observabilidade)
- [x] Critérios de aceite testáveis (10 CAs com Dado/Quando/Então)
- [x] Riscos e dependências mapeados
- [x] Métricas de sucesso quantitativas
- [x] Plano em 5 fases com entregas e comandos de verificação

> **Suposições explícitas:** (1) Edição de prompts por cliente via UI fica fora do MVP e vira Fase 5; (2) Especialistas vivem como código versionado no MVP, não como tabela; (3) Retry único com sanitização é suficiente — sem fila/background job.

