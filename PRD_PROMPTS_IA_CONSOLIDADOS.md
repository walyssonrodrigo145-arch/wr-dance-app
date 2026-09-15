# PRD — Consolidação e Melhoria dos Prompts de IA (Governança de Prompt Engineering)

## 1. Visão Geral

### Problema
O sistema possui **12 superfícies de prompt de IA** espalhadas em 8+ arquivos, sem registro central versionado. A auditoria do código identificou problemas sistêmicos:

1. **Fragmentação:** o mesmo papel de IA ("atendente virtual da escola") existe em **3 prompts divergentes** (`getAttendancePrompt` em `aiPrompts.ts:112`, `schoolAiRouter.ts:256-271` e `answerWithSchoolKnowledge` em `webhooks/whatsapp.ts:226-234`) com regras diferentes (tom configurável existe só em uma; CTA hardcoded em outra).
2. **Resolução de credenciais inconsistente:** alguns fluxos usam `resolveAiCredentials` (`server/utils/aiProvider.ts` — suporta Gemini/Groq/**OpenCode**), mas 6 fluxos usam ternários manuais `aiProvider === 'groq' ? groq : gemini` (`aiRouters.ts:80-81,350-351`, `portalRouters.ts:1306-1307`, `reportEngineRouter.ts:28-29`, `schoolAiRouter.ts:273-274`, `webhooks/whatsapp.ts:202-208`) — **escolas com `aiProvider=opencode` têm esses fluxos quebrados/silenciosamente degradados** (cai no fallback de env ou erro de chave).
3. **Validação assimétrica:** o plano diário é o "padrão ouro" (JSON mode + parsing defensivo + 2 camadas de validação + retry com feedback). Outros fluxos JSON (**memória pedagógica** `advancedAiRouter.ts:144-175`, **smart schedule** `advancedAiRouter.ts:265-298`) usam `isJson=false`, parse ad-hoc, **sem retry e sem validação** → falham com "Tente novamente" à primeira divergência da IA.
4. **Bug real no plano de aula:** `generateNextLessonPlan` (`progressRouters.ts:391-396`) contém a instrução "Decida o próximo assunto…" **duplicada** quando não há tópico informado (ternário duplicado). Além disso, não há validação de contaminação de terminologia (o especialista é injetado mas o resultado nunca é validado com `validatePlanTextForInstrument`).
5. **Vetor de injeção de prompt:** `getAttendancePrompt` interpolado com `studentName` vindo de `student?.name || pushName` (`whatsapp.ts:755`) — o `pushName` do WhatsApp é **controlado pelo remetente** e entra no system prompt sem sanitização (um contato pode se chamar `"IGNORE TODAS AS REGRAS E...`). Mesmo risco em `answerWithSchoolKnowledge` (`whatsapp.ts:224`).
6. **Contexto sem limite de tamanho:** `aiRouters.ts:332-338` injeta o texto integral de **todos os documentos** do usuário no system prompt (sem cap por documento nem quantidade) → risco de estouro de contexto/custo. Base de conhecimento do webhook é limitada a 20 tópicos (`whatsapp.ts:734`), mas em `schoolAiRouter.ts:239-252` e `answerWithSchoolKnowledge.ts:211-221` é ilimitada.
7. **Zero telemetria:** nenhuma métrica de latência, falha, provider ou versão de prompt por feature (só `console.error`); impossível saber qual prompt está degradando.
8. **Temperature hardcoded 0.3** para todos os casos (`gemini.ts:77,164`) — extração JSON e redação criativa têm necessidades diferentes.
9. **Fallbacks ocultos:** `generateAIInsight` (`progressRouters.ts:266-269`) falha silenciosamente e retorna texto fixo — o professor não sabe que não veio da IA; `catch {}` vazio engole erros (`progressRouters.ts:252,293`).

### Objetivo
Consolidar **todas** as superfícies de prompt sob uma governança única (registro central versionado + resolução de credenciais unificada + contrato de saída JSON padronizado + telemetria), **sem alterar as regras pedagógicas** existentes — o plano diário (`generateDailyStudyPlan`) permanece como padrão de referência; os demais fluxos são elevados ao mesmo padrão.

### Contexto — Mapa auditado das superfícies de prompt

| # | Feature | Arquivo:linha | Credenciais | JSON mode | Validação | Problemas |
|---|---|---|---|---|---|---|
| 1 | Plano diário (5 dias) | `progressRouters.ts:443-968` | ✅ resolveAiCredentials | ✅ | ✅ 2 camadas + retry | Referência — sem mudanças de prompt |
| 2 | Plano de aula (template) | `progressRouters.ts:360-440` | ✅ | ❌ (texto) | ❌ | Instrução duplicada; sem validação de terminologia |
| 3 | Insight de progresso | `progressRouters.ts:234-270` | ✅ | ❌ | ❌ | Fallback silencioso; `catch {}` |
| 4 | Sugestão de próximo tópico | `progressRouters.ts:271-316` | ✅ | ❌ | ❌ | `catch {}`; bloco de especialista fraco |
| 5 | Assistente de gestão (chat) | `aiRouters.ts:290-352` + `aiPrompts.ts:1-95` | ❌ ternário | ❌ | ACTIONs parseadas | Docs sem cap; sem OpenCode |
| 6 | Enhance text (avisos) | `aiRouters.ts:73-103` | ❌ ternário | ❌ | ❌ | Sem OpenCode |
| 7 | Recepcionista virtual | `aiPrompts.ts:112-179` + `whatsapp.ts:751-802` | parcial (sem opencode) | ❌ | tool loop 2 rodadas | Injeção via pushName; KB cap 20 |
| 8 | Atendente RAG (chatbot) | `whatsapp.ts:192-242` | ❌ fallback manual | ❌ | ❌ | Prompt divergente do #7; sem histórico |
| 9 | Teste da atendente | `schoolAiRouter.ts:256-299` | ❌ ternário | ❌ | ❌ | Duplicação do #8 |
| 10 | Insights de relatório Excel | `reportEngineRouter.ts:32-57` | ❌ ternário | ❌ | ❌ | Sem OpenCode; cap 500 linhas ok |
| 11 | Memória pedagógica (JSON) | `advancedAiRouter.ts:126-175` | ✅ | ❌ (parse ad-hoc) | ❌ sem retry | Sem zod/retry/budget |
| 12 | Smart schedule (JSON) | `advancedAiRouter.ts:265-330` | ✅ | ❌ (parse ad-hoc) | ❌ sem retry | Idem; sem validação de salas duplicadas |
| 13 | Explicação de exercício (aluno) | `portalRouters.ts:1230-1309` | ❌ ternário | ❌ | ❌ | Prompt bom; sem OpenCode |

---

## 2. Usuários Envolvidos

* **Professor/Admin:** consome os fluxos 1–6, 10–12; afetado por qualidade/consistência das respostas e suporte ao provider da escola.
* **Aluno:** consome fluxo 13 (explicação de exercício) e é atendido pelos fluxos 7–9 no WhatsApp.
* **Contato externo (WhatsApp):** alvo dos fluxos 7–9 — **fonte não confiável de input** (pushName, mensagens livres).
* **Desenvolvedor/operador:** beneficiário do registro central, telemetria e versionamento.

---

## 3. Escopo

### Incluído
- Registro central versionado de prompts em `server/utils/aiPrompts.ts` (builders nomeados, `PROMPT_VERSION` por prompt).
- Substituição dos 6 pontos de resolução manual de credenciais por `resolveAiCredentials` (habilita OpenCode em todos os fluxos).
- Helper `callAiJson` (JSON mode + extração + validação zod + retry com orçamento de tempo) e migração dos fluxos 11 e 12 (e adoção opcional no fluxo 1).
- Correções pontuais e já especificadas: instrução duplicada no plano de aula (RF-005), validação de contaminação no plano de aula (RF-006), sanitização anti-injeção de campos externos (RF-007), caps de contexto (RF-008), deduplicação dos prompts da atendente (RF-004).
- Telemetria `ai_call_logs` (RF-009) e `temperature` por categoria (RF-010).
- Testes vitest cobrindo sanitização, callAiJson e builders.

### Fora do Escopo
- **Alteração semântica de prompts pedagógicos** (regras do plano diário, especialistas, validadores de contaminação/teoria) — fora de propósitos desta PRD.
- Troca do formato de saída do plano de aula (permanece template de texto).
- Novos features de IA; mudanças no executor de ACTIONs; alteração do UI.
- Reescrita do `gemini.ts` além do parâmetro opcional de temperature.

---

## 4. Requisitos Funcionais

### RF-001 — Registro central versionado de prompts
**Descrição:** `server/utils/aiPrompts.ts` passa a exportar um registro com **um builder por feature**, cada um com constante `PROMPT_VERSION` (semântica: bump em qualquer mudança de texto que altere comportamento esperado). Fluxos 2, 3, 4, 10, 11, 12, 13 movem seus prompts inline para builders nomeados (`buildLessonPlanPrompt`, `buildProgressInsightPrompt`, `buildNextTopicPrompt`, `buildReportInsightsPrompt`, `buildPedagogicalMemoryPrompt`, `buildSmartSchedulePrompt`, `buildExerciseExplanationPrompt`). **Copy fiel:** o texto movido deve ser idêntico ao atual, exceto as correções explicitadas em RF-005/006/008/010.
**Atores:** Sistema.
**Dados envolvidos:** versão do prompt gravada em `ai_call_logs` (RF-009).

### RF-002 — Resolução unificada de credenciais (OpenCode everywhere)
**Descrição:** Os 6 pontos com ternários manuais passam a usar `resolveAiCredentials(settingsData)` + `aiCredentialsLogMeta` (logs sem chave). Fluxos afetados: `aiRouters.ts` (enhanceText, sendMessage), `portalRouters.ts` (explicação), `reportEngineRouter.ts`, `schoolAiRouter.ts`, `webhooks/whatsapp.ts` (atendimento + RAG). O webhook mantém o fallback entre chaves do professor/org atual, mas passa pelo resolver para suportar OpenCode.
**Atores:** Sistema.
**Resultado esperado:** escola com `aiProvider=opencode` tem TODOS os fluxos funcionando (hoje: chat interno, enhance, explicação do aluno, relatórios, atendente e RAG ignoram o provider).

### RF-003 — Contrato padronizado para respostas JSON (`callAiJson`)
**Descrição:** Novo helper em `server/utils/aiJson.ts`:
```ts
callAiJson<T>({ prompt, schema: ZodSchema<T>, credentials, feature, budgetMs = 45_000, maxAttempts = 2 })
```
Comportamento: `callGemini(..., isJson=true)` → `extractJsonFromText` → `schema.safeParse` → retry (com aviso de formato no prompt da 2ª tentativa) → erro orientativo. Migração: memória pedagógica e smart schedule (fluxos 11–12) passam a usá-lo com schemas zod equivalentes aos JSON atuais. O plano diário (fluxo 1) mantém seu pipeline próprio (referência), mas pode adotar o helper em refactor futuro.
**Atores:** Sistema.
**Exceções:** schema inválido após tentativas → erro orientativo "A IA retornou um formato inesperado para {feature}. Tente novamente." + log em `ai_call_logs`.

### RF-004 — Fonte única para a atendente virtual
**Descrição:** Os prompts dos fluxos 8 e 9 deixam de existir inline e passam a ser **variações geradas por `getAttendancePrompt`** (ou builder compartilhado `buildSchoolKnowledgePrompt`) que aceita os mesmos inputs (tom configurável, persona, link de matrícula, nowInfo). A base de conhecimento passa a ser montada por um único helper `buildKnowledgeContext(db, orgId, maxTopics=20)`.
**Atores:** Sistema.
**Resultado esperado:** mesma personalidade e regras no teste da atendente, no RAG do chatbot e no atendimento completo; tom configurável respeitado nos 3.

### RF-005 — Correção do prompt do plano de aula
**Descrição:** Em `progressRouters.ts:384-427`:
1. Remover a duplicação das linhas 391 e 396 (instrução "Decida o próximo assunto…" deve aparecer **uma única vez** quando `!input.topic`).
2. Injetar data atual pt-BR (`America/Sao_Paulo`) no cabeçalho ("Data de hoje: …") para coerência de planejamento.
3. Demais seções do template permanecem idênticas (copy fiel).

### RF-006 — Validação de terminologia no plano de aula
**Descrição:** Após gerar o plano de aula, executar `validatePlanTextForInstrument(plan, instrumentName, instrumentCategory)` (já existe em `InstrumentSpecialistService.ts:516`). Falha → 1 retry com instrução reforçada (mesma técnica do plano diário, `progressRouters.ts:834-837`); persistindo → erro orientativo com os termos encontrados. Mesma validação aplicada ao insight (fluxo 3) e sugestão de tópico (fluxo 4) **apenas como warning não-bloqueante** (texto livre).

### RF-007 — Sanitização anti-injeção de campos externos
**Descrição:** Novo utilitário `sanitizeForPrompt(value: string, maxLen)` em `server/utils/aiPrompts.ts` (ou `aiSanitize.ts`): remove/remove neutraliza sequências `<!--`, `-->`, `#`, blocos de "ignore/system prompt", colapsa quebras excessivas e trunca (ex.: 80 chars para nomes). Aplicado obrigatoriamente a todo campo vindo de fonte externa interpolado em system prompts:
- `studentName`/`pushName` nos fluxos 7–9 (`whatsapp.ts:755`, `:224`);
- `schoolName`, `personaName`, `tone` (admin-authored, sanitize por defesa em profundidade);
- título/conteúdo dos tópicos da base de conhecimento (`buildKnowledgeContext`).
**Regra:** a persona da atendente é reafirmada **após** a interpolação do contexto (ordem: dados → reafirmação final "Lembre-se: você é {persona}…"), mitigando injeção mesmo se a sanitização falhar.

### RF-008 — Limites de contexto
**Descrição:**
1. **Documentos do assistente** (`aiRouters.ts:332-338`): máx. 3 documentos e 30.000 caracteres por documento (truncar com aviso `[documento truncado]`); ordenar por mais recente.
2. **Base de conhecimento:** cap 20 tópicos e 4.000 chars/tópico em todos os fluxos (helper único do RF-004).
3. **Histórico:** manter 20 mensagens (chat interno e atendimento) — formalizado no helper.
4. **Smart schedule:** cap de aulas serializadas (ex.: 300) com aviso explícito no prompt quando truncado.

### RF-009 — Telemetria de chamadas de IA
**Descrição:** Nova tabela `ai_call_logs` (ver §8) escrita de forma **não-bloqueante** (try/catch silencioso, padrão RN-002) em todo ponto que chama `callGemini`/`callGeminiWithFiles`/`callAiJson`, registrando: `feature` (chave do registro RF-001), `promptVersion`, `provider`, `model`, `durationMs`, `success`, `errorCode` (categoria: sem_chave | timeout | json_invalido | validacao | api_error | rate_limit), `errorMessage` (orientativa, sem stack/PII).
**Atores:** Sistema. Leitura nesta PRD: **nenhuma UI** — consulta manual/SQL apenas.

### RF-010 — Temperature por categoria + idioma e data
**Descrição:**
1. `callGemini`/`callAiJson` recebem parâmetro opcional `temperature` (default `0.3` — comportamento atual preservado). Categorias: JSON estruturado `0.2`; conversacional (atendente, assistente) `0.4`; criação de texto (insight, sugestão, enhance) `0.5`.
2. Builders dos fluxos 2, 3, 4, 13 incluem linha fixa: "Responda obrigatoriamente em Português do Brasil (pt-BR)." (fluxo 2 já tem — extrair para padrão comum).

### RF-011 — Fallback honesto
**Descrição:** `generateAIInsight` mantém o fallback, mas: (1) remove `catch {}` dos blocos de especialista (loga `console.warn`); (2) retorno passa a `{ insight, source: "ai" | "fallback" }` e o client exibe o texto do fallback com sufixo discreto "(gerado sem IA — verifique a chave em Configurações)" quando `source === "fallback"`.

---

## 5. Regras de Negócio

### RN-001 — Copy fiel na migração
**Regra:** Prompts movidos para o registro central devem ser idênticos aos atuais, exceto correções listadas (RF-005/006/008/010). Mudança semântica de regra pedagógica exige PRD própria.
**Consequência:** Diffs de prompt são auditáveis; comportamento não muda silenciosamente.

### RN-002 — Telemetria nunca bloqueia
**Regra:** Falha ao gravar `ai_call_logs` não afeta a operação do usuário (try/catch + console.warn).

### RN-003 — Uma fonte por prompt
**Regra:** Proibido manter o mesmo prompt (ou variação funcional) duplicado em arquivos diferentes; toda variação deve ser parametrização do builder central.
**Exemplo inválido:** alterar regra da atendente em `webhooks/whatsapp.ts` sem tocar no builder central.

### RN-004 — Nada de segredo ou PII em logs
**Regra:** `ai_call_logs` não armazena chave de API, telefone, conteúdo de mensagens nem corpo do prompt — apenas metadados (feature, versão, provider, model, tempo, categoria de erro).

### RN-005 — Sanitização obrigatória de input externo
**Regra:** Nenhum texto originado fora do servidor (pushName, mensagem livre, nome de contato) entra em system prompt sem `sanitizeForPrompt`. Dados authored pelo admin (KB, persona) também passam pela sanitização de estrutura (defesa em profundidade), sem alterar seu conteúdo semântico.

### RN-006 — Versionamento obrigatório
**Regra:** Toda alteração de texto de prompt exige bump da `PROMPT_VERSION` correspondente; a versão é gravada em `ai_call_logs` para correlacionar qualidade ↔ versão.

### RN-007 — Resolução de credenciais única
**Regra:** Nenhum router pode montar apiKey/model com ternário próprio; sempre `resolveAiCredentials`. Revisão via grep: `aiProvider === 'groq' ?` deve retornar 0 matches em `server/` (exceto dentro de `aiProvider.ts`).

---

## 6. Fluxos

### Fluxo principal — Chamada de IA consolidada (após PRD)
```text
Feature solicita builder (aiPrompts) com inputs sanitizados
↓
resolveAiCredentials(settings) → { provider, apiKey, model }
↓
callAiJson (se JSON) ou callGemini (texto) com temperature da categoria
↓
Validação (zod | validatePlanText | parse defensivo)
↓
Retry dentro do budget (RF-003) se falha de formato
↓
Grava ai_call_logs (não-bloqueante)
↓
Retorno ao router / erro orientativo
```

### Fluxo de erro — Sem chave configurada
```text
resolveAiCredentials → apiKey null
↓
Erro PRECONDITION_FAILED orientativo (padrão atual do plano diário)
↓
Fluxo 3: fallback com source="fallback" (RF-011); Fluxo 8: retorna null (fluxo tradicional do chatbot)
```

### Fluxo de erro — Injeção via pushName
```text
Contato define pushName hostil
↓
sanitizeForPrompt neutraliza sequências perigosas + trunca
↓
Builder interpola dado sanitizado ANTES da reafirmação final de persona
↓
Atendente mantém comportamento (testes CA-004)
```

---

## 7. Casos Extremos

1. **Escola com `aiProvider=opencode` e chave inválida no chat interno:** hoje o ternário devolve `undefined/undefined` e cai no env Gemini silenciosamente; após RF-002, erro explícito "Chave OpenCode inválida…" (mensagens já existem em `gemini.ts:114-117`).
2. **Documento gigante (ex.: 500k chars):** truncado em 30k com aviso (RF-008); resposta continua funcional.
3. **KB com 100 tópicos ativos:** primeiros 20 (ordem de prioridade: mais recentes) — helper único.
4. **IA retorna JSON com texto ao redor:** `extractJsonFromText` + parse defensivo (comportamento já existente, agora obrigatório via `callAiJson`).
5. **IA retorna JSON válido mas fora do schema (ex.: faltando `nextLessonPlan`):** retry com aviso de schema; persistindo → erro orientativo (hoje: crash direto no `parsed.nextLessonPlan.title`).
6. **pushName vazio ou com emojis:** sanitização mantém conteúdo seguro; nome de exibição nunca fica vazio (fallback "amigo(a)").
7. **Dois admins editam KB simultaneamente:** fora do escopo (KB continua como está); sanitização é stateless.
8. **Relatório com 5000 linhas:** cap 500 mantido (`reportEngineRouter.ts:43`) + aviso no prompt.
9. **Smart schedule com 0 aulas no período:** prompt atual serializa `[]` — manter, com resposta `{totalOptimized: 0}` validada por zod (hoje pode confundir a IA).
10. **Timeout do provider:** categoria `timeout` em `ai_call_logs`; mensagens orientativas existentes preservadas.
11. **Testes existentes:** `chatbotTools.test.ts:143-160` valida `getAttendancePrompt` — mudanças no builder devem manter assinatura e asserts (executar suíte antes de concluir).
12. **Virada de fuso (23:59 America/Sao_Paulo):** builders usam `toLocaleString` com timezone fixa (padrão já usado em `aiContext.ts:152`) — padronizar no helper de data.

---

## 8. Dados Envolvidos

### Nova tabela — `ai_call_logs`
| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| id | serial | Sim | PK |
| organizationId | integer | Sim | Isolamento multitenant |
| userId | integer | Não | Executor (null em webhooks anônimos) |
| feature | varchar(60) | Sim | Chave do registro RF-001 (ex.: `plano_diario`, `plano_aula`, `atendente_rag`) |
| promptVersion | varchar(12) | Sim | Versão do prompt usada |
| provider | varchar(20) | Sim | `gemini` \| `groq` \| `opencode` |
| model | varchar(80) | Sim | Modelo (nunca chave) |
| durationMs | integer | Sim | Latência total |
| success | boolean | Sim | Resultado |
| errorCode | varchar(30) | Não | Categoria (§ RF-009) |
| errorMessage | text | Não | Mensagem orientativa (sem stack/PII) |
| createdAt | timestamp | Sim | Default now |

Índices: `(organizationId, createdAt)`, `(feature, createdAt)`.
Migration: `drizzle/0006_ai_call_logs.sql` (ou próximo número livre), idempotente (`CREATE TABLE IF NOT EXISTS`), snapshot drizzle atualizado.

### Sem alteração de schema existente
`daily_study_plans`, `student_pedagogical_memory` etc. permanecem inalterados (a memória pedagógica apenas melhora o **modo** de obter o JSON, não a estrutura armazenada).

---

## 9. Permissões e Segurança

- Nenhuma nova procedure pública nesta PRD (mudanças internas nos routers existentes — contrato tRPC preservado, respeitando AGENTS.md regra 3).
- **Superfícies de injeção tratadas:** pushName/mensagens de contato (fluxos 7–9), documentos do usuário (fluxo 5), KB (7–9). Ver §10.
- Logs sem segredos/PII (RN-004); `ai_call_logs` sem exposição via tRPC nesta PRD.
- Mensagens de erro continuam sem stack trace/credenciais (padrão existente em `gemini.ts`).

---

## 10. Tratamento de Erros

| Situação | Resposta |
|---|---|
| Sem chave no provider configurado | "Chave de API da IA não configurada. Acesse Configurações > Inteligência Artificial." (unificada) |
| Chave inválida por provider | Mensagens existentes por provider (Gemini/Groq/OpenCode) — preservadas |
| JSON fora do schema (após retries) | "A IA retornou um formato inesperado para {feature}. Tente novamente." |
| Contaminação de terminologia (plano de aula, após retry) | "O plano gerado conteve termos de outro instrumento (…). Gere novamente." |
| Documento/KB truncados | Aviso textual no prompt (`[documento truncado]`), nunca erro ao usuário |
| Falha de escrita em `ai_call_logs` | Silenciosa (console.warn) — RN-002 |
| Insight sem IA (fallback) | Texto do fallback + indicador `source: "fallback"` (RF-011) |

---

## 11. Requisitos Não Funcionais

- **RNF-001 (Compatibilidade):** `pnpm check` sem novos erros TS vs. baseline (`tsc_baseline.txt`); suíte `pnpm test` verde (destaque para `chatbotTools.test.ts`).
- **RNF-002 (Performance):** helper único de credenciais/KB não adiciona queries extras relevantes (reuso das buscas atuais).
- **RNF-003 (Observabilidade):** 100% das chamadas de IA geram linha em `ai_call_logs` (não-bloqueante).
- **RNF-004 (Manutenibilidade):** `rg -n "aiProvider === 'groq'" server/` → 0 matches fora de `aiProvider.ts`; nenhum prompt de feature duplicado inline.
- **RNF-005 (Latência):** fluxos JSON com retry dentro de budget 45s (RF-003) — sem impacto perceptível no caso feliz.
- **RNF-006 (Idioma):** todas as superfícies de resposta a usuário final fixam pt-BR no prompt (RF-010).

---

## 12. Critérios de Aceite

- **CA-001:** Dada escola com `aiProvider=opencode`, quando usar chat interno, enhance text, explicação de exercício, relatório Excel e atendente, então todos usam OpenCode (verificável em `ai_call_logs.provider`).
- **CA-002:** Dado prompt do plano de aula sem tópico, quando o builder é executado, então a instrução "Decida o próximo assunto…" aparece exatamente 1 vez.
- **CA-003:** Dada resposta JSON da memória pedagógica com campo faltante, quando `callAiJson` processa, então há retry com aviso e, persistindo o erro, mensagem orientativa (sem crash em `parsed.nextLessonPlan.title`).
- **CA-004:** Dado pushName contendo `<!--ACTION:` ou "ignore as instruções anteriores", quando a atendente monta o system prompt, então o texto é sanitizado e a reafirmação de persona é a última seção.
- **CA-005:** Dado documento de 100k caracteres, quando o chat interno monta contexto, então apenas 30k chars (com aviso de truncamento) entram no system prompt.
- **CA-006:** Dado plano de aula gerado com termo proibido (ex.: "voicing" para bateria), quando a validação roda, então há 1 retry e, persistindo, erro orientativo com os termos.
- **CA-007:** Dado qualquer chamada de IA, quando concluída, então existe linha em `ai_call_logs` com feature, promptVersion, provider, model, durationMs, success.
- **CA-008:** Dado mock de falha na escrita de log, quando a geração ocorre, então a operação principal retorna sucesso (RN-002).
- **CA-009:** Dado `rg -n "aiProvider === 'groq' ?" server/`, então 0 resultados fora de `server/utils/aiProvider.ts`.
- **CA-010:** Dado insight gerado sem chave de IA, então resposta contém `source: "fallback"` e o client indica discretamente que não veio da IA.
- **CA-011:** Dada a suíte atual, quando `pnpm test` roda, então `chatbotTools.test.ts` e demais testes passam sem alteração de asserts.
- **CA-012:** Dado `pnpm check`, então nenhum erro TS novo vs. baseline; `pnpm build` conclui.

---

## 13. Riscos e Dependências

### Riscos
- **Regressão de comportamento na migração de prompts:** mitigado por RN-001 (copy fiel) + testes de snapshot do builder (comparar saída com string atual).
- **Mudança de input tRPC:** nenhuma procedure muda de assinatura nesta PRD (RF-011 adiciona campo no **retorno** de generateAIInsight — client e server no mesmo commit).
- **Falsos positivos da validação no plano de aula:** 1 retry + mensagem orientativa; texto do template é livre — usar `validatePlanTextForInstrument` apenas nos títulos/primeiras linhas se falsos positivos aparecerem em testes.
- **Tempo/duplicação de rollback:** fases pequenas e commits separados por fase.

### Dependências
- `resolveAiCredentials` / `aiCredentialsLogMeta` (`server/utils/aiProvider.ts`) — já existem.
- `extractJsonFromText` (`server/utils/gemini.ts:15`), `validatePlanTextForInstrument` (`InstrumentSpecialistService.ts:516`) — já existem.
- Zod (presente em todo o projeto) para schemas do `callAiJson`.
- Padrão de migration idempotente (`server/_core/migrate.ts`).
- Teste existente `server/chatbotTools.test.ts` (contrato de `getAttendancePrompt`).

---

## 14. Métricas de Sucesso

- 0 fluxos com provider não suportado (CA-001) — cobre escolas OpenCode.
- 100% das chamadas de IA com telemetria (CA-007) → base para reduzir taxa de `json_invalido` e `timeout` por feature.
- 0 prompts duplicados inline (CA-009 / RNF-004).
- Redução de crashes "formato inesperado" nos fluxos 11–12 a zero (CA-003).
- Vetor de injeção via pushName neutralizado (CA-004).

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Fundação (baixo risco)
- `sanitizeForPrompt` + helper de data pt-BR com timezone fixa.
- Registro central em `aiPrompts.ts` com builders dos fluxos 2, 3, 4, 10–13 (**copy fiel**) + `PROMPT_VERSION`.
- Substituição dos 6 pontos de credenciais por `resolveAiCredentials` (RF-002).

### Fase 2 — Bugs e segurança
- Correção da duplicação do plano de aula + data atual (RF-005).
- Sanitização e reafirmação de persona nos fluxos 7–9 (RF-007) + caps de contexto (RF-008).
- Deduplicação da atendente via builder compartilhado (RF-004).

### Fase 3 — Contrato JSON
- Helper `callAiJson` com zod + budget (RF-003); migração da memória pedagógica e smart schedule.
- Validação de terminologia no plano de aula (RF-006) e warnings nos fluxos 3–4.

### Fase 4 — Observabilidade e tuning
- Tabela `ai_call_logs` + migration idempotente + instrumentação de todas as chamadas (RF-009).
- Temperature por categoria (RF-010); fallback honesto no insight (RF-011).

### Fase 5 — Verificação
- Novos testes: `server/aiPrompts.test.ts` (builders + snapshot + sanitização + CA-002), `server/aiJson.test.ts` (retry/schema/CA-003).
- Rodar `pnpm check` (baseline), `pnpm test` (flaky: isolar se necessário), `pnpm build`.
