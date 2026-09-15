# PRD — Teste de Chave API e Listagem de Modelos OpenCode Zen Grátis + Correção Gemini 404 (MusicPro)

## 1. Visão Geral

### Problema
1. **Gemini 404 em produção:** `server/utils/gemini.ts:164` usa `gemini-2.0-flash` como default e mapeia apenas `2.0/1.5/3.1/3.5`. A API Google retornou `404 This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.` — todo `generateDailyStudyPlan` (`progressRouters.ts:442`), `generateAIInsight` etc. falha mesmo com chave válida, bloqueando IAs especialistas que já respeitam `settings.aiProvider` (`aiProvider.ts:1`).
2. **OpenCode sem validação:** usuário configurou `opencodeApiKey` (`schema.ts:266` + `Configuracoes.tsx:169` + `plataformaRouters.ts:163`) e recebeu o mesmo erro 404 porque o fluxo ainda cai no branch Gemini (model `gemini-2.0-flash` hardcoded) quando `resolveAiCredentials` falha ou quando `callGemini` não detecta `isOpencode`. Não há feedback: usuário salva chave e só descobre o erro ao gerar plano.
3. **Sem descoberta de modelos:** após salvar chave OpenCode, o usuário precisa adivinhar `opencodeModel` (placeholder `opencode/muse-spark-1.2-contributor-free`). Não há lista de modelos `zen` gratuitos disponíveis para escolher, gerando tentativas e erros de modelo inexistente.

### Objetivo
- **Corrigir Gemini 404** mapeando modelos descontinuados para `gemini-3.6-flash` (ou fallback compatível) e preparando migração para Interactions API quando disponível, sem quebrar `gemini-1.5-pro/flash` legados.
- **Criar botão "Testar chave API"** em `Configuracoes.tsx` (aba IA) que valida a chave do provedor selecionado (`gemini|groq|opencode`) no backend e, **se `opencode` e válido**, retorna e exibe **todos os modelos OpenCode Zen gratuitos** disponíveis para o usuário escolher e salvar em `settings.opencodeModel`.

### Contexto
- **Backend atual:** `server/utils/gemini.ts:29` `callGemini(apiKey, model, isJson)` decide `isGroq` por `gsk_`/`llama` e `isOpencode` por `opencode/`/`sk-opencode` (`gemini.ts:45`); `server/utils/aiProvider.ts:17` `resolveAiCredentials(settings)` já centraliza `gemini|groq|opencode` e é usado em `progressRouters.ts:258,305,432,773` e `advancedAiRouter.ts:162,299`.
- **Frontend atual:** `Configuracoes.tsx:169,1938` select `aiProvider`, inputs `geminiApiKey/groqApiKey/opencodeApiKey/Model/Url` (`Configuracoes.tsx:2031`), `handleSaveIA:423` → `trpc.settings.updateIA:357` → `upsertSettings` (`db.ts:1532` com decrypt/encrypt). Não há teste de chave nem listagem de modelos.
- **PRDs relacionados:** `PRD_IAS_ESPECIALISTAS_INSTRUMENTOS.md` (especialistas), `PRD_OPENCODE_IAS.md` (skills OpenCode).

---

## 2. Usuários Envolvidos
- **Admin/Professor dono da escola (ator principal):** configura `aiProvider` e chaves em `Configuracoes.tsx` → clica Testar → escolhe modelo Zen grátis → salva. Espera feedback imediato.
- **Aluno:** não acessa; apenas consome planos gerados pela IA já corrigida.
- **Sistema (IA):** `callGemini`/`resolveAiCredentials` roteia para Gemini/Groq/OpenCode; `plataformaRouters.testOpencodeConnection` valida e lista modelos.
- **QA:** verifica correção Gemini 404 e listagem Zen sem vazamento de chave.

---

## 3. Escopo

### Incluído
- **Correção Gemini 404:** atualizar `gemini.ts:164` mapping para `gemini-3.6-flash`/`gemini-2.5-flash` como recomendado, manter fallback `gemini-1.5-flash` e normalização de `gemini-2.0-flash` → `gemini-3.6-flash`; tratar 404 com mensagem orientativa e tentativa fallback automática.
- **Botão Testar chave API** na aba IA (`Configuracoes.tsx:2031`): 1 botão por provedor, desabilitado se campo chave vazio, com estados `idle/loading/success/error`.
- **Endpoint backend** `settings.testAiConnection` (`plataformaRouters.ts:163`): recebe `aiProvider` + chave/modelo/url (sem persistir), valida via chamada real à API do provedor (ping leve) e, se `opencode`, faz `GET /v1/models` (ou `GET /api/models` fallback) com `Authorization: Bearer <key>` e filtra modelos Zen gratuitos.
- **Listagem Zen grátis:** após teste `opencode` com sucesso, exibir dropdown/listagem paginada com `model.id`, `displayName`, `contextLength`, `pricing` (free), permitindo selecionar e preencher `opencodeModel` antes de Salvar.
- **Persistência:** seleção de modelo Zen grava em `settings.opencodeModel` via `updateIA` existente.

### Fora do escopo
- Fine-tuning, RAG, ou troca de provider além de `gemini|groq|opencode`.
- Alteração de `appRouter` keys (`AGENTS.md#3`) ou remoção de `ssh2` (`AGENTS.md#5`).
- Tabela nova; usa `settings.opencode*` já existente (`schema.ts:266`).
- UI de teste para `gemini`/`groq` listar todos modelos (só `opencode` lista Zen grátis nesta entrega; `gemini`/`groq` apenas testa ping).

---

## 4. Requisitos Funcionais

### RF-001 — Correção do Mapeamento Gemini (404)
**Descrição:** Atualizar `server/utils/gemini.ts:164` para que `gemini-2.0-flash` → `gemini-3.6-flash` (ou `gemini-1.5-flash` como fallback estável) e aceitar `gemini-3.6-flash`, `gemini-2.5-flash`, `gemini-1.5-flash`. Se API retornar 404 com mensagem `is no longer available`, tentar fallback automático `gemini-1.5-flash` antes de falhar.
**Atores:** Backend
**Pré-condições:** `settings.aiProvider=gemini`
**Fluxo:** `callGemini` sanitiza `safeModel`; se `404 + "is no longer available"` → retry 1× com `gemini-1.5-flash` → se ainda 404 → `TRPCError` com mensagem: "Modelo Gemini descontinuado. Atualize para gemini-3.6-flash em Configurações > IA. Tentamos fallback para gemini-1.5-flash sem sucesso."
**Dados:** `settings.geminiModel`

### RF-002 — Botão Testar Chave API (Frontend)
**Descrição:** Em `Configuracoes.tsx:1938` abaixo de cada bloco de provedor, botão `Testar conexão` (ícone `Plug`/`FlaskConical`). Desabilitado se `apiKey.trim()===""`. Ao clicar, chama `trpc.settings.testAiConnection`.
**Atores:** Admin/Professor
**Fluxo principal:**
1. Usuário seleciona `aiProvider=opencode`, preenche `opencodeApiKey`
2. Clica `Testar chave OpenCode`
3. Frontend mostra `loading` (spinner + "Testando...")
4. Backend valida; frontend mostra `success` (toast + badge verde "Chave válida — X modelos Zen grátis encontrados") ou `error` (badge vermelho com mensagem)
5. Se `opencode` sucesso → renderiza lista `RF-003`
**Exceções:** chave vazia → botão desabilitado + hint "Informe a chave antes de testar"
**Dados:** `aiProvider`, `apiKey`, `model`, `apiUrl` (não persiste no teste)

### RF-003 — Listagem de Modelos OpenCode Zen Grátis
**Descrição:** Após `testAiConnection` com `provider=opencode` e `valid=true`, frontend exibe seção "Modelos Zen gratuitos disponíveis" com lista obtida de `response.models[]`.
**Atores:** Backend (`plataformaRouters.testOpencodeConnection`), Frontend
**Pré-condições:** teste `opencode` sucesso
**Fluxo:**
1. Backend faz `GET {opencodeApiUrl || OPENCODE_API_URL || https://api.opencode.ai/v1/models}` com `Authorization: Bearer <key>`; fallback para `https://opencode.ai/api/models` se 404
2. Filtra `models` onde `pricing.free===true` ou `pricing.input===0 && pricing.output===0` ou `id` contém `zen`/`free` ou `capabilities.zen===true` (ver **Assunção**)
3. Retorna `models: Array<{id, name, displayName, contextLength, pricing, maxTokens}>` ordenado por `name`
4. Frontend renderiza `Select`/`Command` com busca, mostrando `displayName` + `id` + `contextLength`; ao selecionar, preenche `opencodeModel` state
5. Usuário clica `Salvar Chave da IA` → persiste `opencodeModel` selecionado
**Exceções:** 0 modelos grátis → mostra "Nenhum modelo Zen grátis encontrado para esta chave" + mantém input manual
**Dados:** `settings.opencodeModel`, `opencodeApiUrl`

### RF-004 — Endpoint testAiConnection (Backend)
**Descrição:** Nova procedure `settings.testAiConnection` em `plataformaRouters.ts:163` input `z.object({ aiProvider, apiKey, model, apiUrl })` output `{ valid, provider, modelUsed, models?: [], error?: string }`. Não persiste; usa chave enviada ou, se vazia, usa `settings` do DB (decrypt). Testa com chamada mínima: `gemini` → `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` ou `callGemini` ping; `groq` → `GET https://api.groq.com/openai/v1/models`; `opencode` → `GET /v1/models` como acima. Timeout 10s, nunca loga chave completa.
**Atores:** Backend, Frontend
**Fluxo:** valida `aiProvider` enum; se `apiKey` ausente → `PRECONDITION_FAILED`; tenta fetch; se 401/403 → `valid:false, error:"Chave inválida"`; se 404 Gemini → `error` com sugestão `gemini-3.6-flash`; se sucesso → `valid:true` + `models` se `opencode`
**Dados:** `settings.*`, `trpc` input

### RF-005 — Persistência e Reuso Pós-Teste
**Descrição:** Seleção na lista Zen grátis apenas altera estado local `opencodeModel`; persistência só em `handleSaveIA:423` → `updateIA`. Após Salvar, `generateDailyStudyPlan` (`progressRouters.ts:773` via `resolveAiCredentials`) usará novo `model`.
**Exceções:** usuário fecha modal sem salvar → perde seleção (intencional)

---

## 5. Regras de Negócio

### RN-001 — Teste Não Persiste Chave
**Regra:** `testAiConnection` nunca chama `upsertSettings`; apenas valida chave em memória. Persistência só via `Salvar Chave da IA`.
**Exemplo válido:** usuário testa `opencodeApiKey=sk-...` → vê "válida" → ainda não salvo no DB → ao gerar plano ainda falha até Salvar
**Consequência:** frontend distingue `Testar` (valida) vs `Salvar` (persiste)

### RN-002 — Filtro Zen Grátis Estrito
**Regra:** Só exibir modelos onde `isFreeZen` = (`pricing.free` OU (`input==0 && output==0`) OU `id` contém `zen`/`free` case-insensitive). Não inventar modelos; listar exatamente o retornado pela API.
**Exemplo válido:** `id: "opencode/muse-spark-1.2-zen-free"` com `pricing: {input:0,output:0}` → exibe
**Exemplo inválido:** exibir `gpt-4o` pago como Zen → bloqueado
**Consequência:** se filtro resulta 0, exibir mensagem e manter input manual

### RN-003 — Gemini Fallback 404
**Regra:** Se `callGemini` com `gemini-2.0-flash` retorna 404 `is no longer available`, backend tenta 1× com `gemini-3.6-flash` (ou `gemini-1.5-flash` se 3.6 também 404) antes de retornar erro ao usuário. Loga `warn` com `modelRequested`/`modelFallback`.
**Exemplo válido:** `model=gemini-2.0-flash` → API 404 → retry `gemini-3.6-flash` → sucesso
**Consequência:** usuário vê sucesso transparente; se ambos 404 → erro orientativo

### RN-004 — Isolamento Multi-tenant e Segredos
**Regra:** `testAiConnection` usa `organizationId` + `userId` para buscar `settings` fallback, nunca vaza `apiKey` para outro `org`. Logs mascaram chave (`sk-...****` últimos 4). Erros nunca expõem `apiKey`/`stack`.
**Consequência:** `eq(settings.organizationId, orgId)` + `decryptSecret` só no backend

### RN-005 — Modelos OpenCode São Read-Only
**Regra:** Lista de modelos é leitura da API OpenCode; não persiste catálogo local. `opencodeApiUrl` custom é respeitado se preenchido, senão `OPENCODE_API_URL` env, senão default `https://api.opencode.ai/v1/models`
**Consequência:** cada Testar refaz `GET /v1/models`; não cachear além de sessão

---

## 6. Fluxos

### Fluxo Principal — Testar OpenCode e Escolher Zen Grátis
```text
Admin
↓
Configurações → Aba IA → seleciona Provedor = OpenCode
↓
Preenche opencodeApiKey (opencode-...), opcional opencodeApiUrl
↓
Clica "Testar chave OpenCode" (habilitado)
↓
Frontend: loading spinner
↓
Backend testAiConnection: GET /v1/models com Bearer <key> (timeout 10s)
↓
Filtra isFreeZen → retorna {valid:true, models:[{id,displayName}]}
↓
Frontend: badge verde "Chave válida — 12 modelos Zen grátis encontrados" + lista dropdown com busca
↓
Usuário seleciona "opencode/muse-spark-1.2-zen-free"
↓
Input opencodeModel preenchido automaticamente
↓
Clica "Salvar Chave da IA" → upsertSettings → toast sucesso
↓
Gera Plano Diário (teclado, com especialista) → resolveAiCredentials → opencodeModel Zen → sucesso
```

### Fluxo Alternativo — Testar Gemini/Groq (sem lista)
```text
Usuário seleciona gemini, preenche geminiApiKey
↓
Clica "Testar chave Gemini"
↓
Backend GET /v1beta/models?key=... (ou ping callGemini)
↓
Retorna {valid:true} sem models
↓
Frontend badge verde "Chave Gemini válida" (sem lista)
```

### Fluxo de Erro — Chave OpenCode Inválida
```text
Clica Testar → Backend GET /v1/models → 401
↓
Retorna {valid:false, error:"Chave inválida ou expirada"}
↓
Frontend badge vermelho + hint "Verifique a chave em opencode.ai"
↓
Lista não renderiza; Salvar ainda permitido mas gerar plano falhará
```

### Fluxo de Erro — Gemini 404 Descontinuado
```text
Gera plano com model gemini-2.0-flash → callGemini 404 "is no longer available"
↓
Backend retry 1× com gemini-3.6-flash → se sucesso, retorna plano (transparente)
↓
Se ainda 404 → retorna 404 orientativo → frontend toast "Modelo gemini-2.0-flash descontinuado. Atualize para gemini-3.6-flash em Configurações > IA"
↓
Testar chave Gemini com model descontinuado também sugere fallback
```

### Fluxo de Erro — Nenhum Zen Grátis Encontrado
```text
Testar opencode válido → GET /v1/models → 5 modelos, mas 0 com isFreeZen
↓
Retorna {valid:true, models:[]}
↓
Frontend: "Chave válida, mas nenhum modelo Zen grátis encontrado para esta conta. Você ainda pode usar modelos pagos ou deixar o modelo manual."
```

### Fluxo sem Dados — Primeiro Acesso sem Chave
```text
Aba IA → Provedor opencode → apiKey vazio
↓
Botão Testar desabilitado + hint "Informe a chave antes de testar"
```

---

## 7. Casos Extremos e Edge Cases
- **Chave vazia + clicar Testar:** botão desabilitado; se bypass via API direta → `PRECONDITION_FAILED` "Chave não informada"
- **Chave com espaços/quebra de linha:** `trim()` antes de validar e antes de `encryptSecret` (`db.ts:1617`)
- **Duplo clique Testar:** debounce + desabilita botão durante `isPending`; segunda chamada ignora
- **Timeout API (10s):** retorna `valid:false, error:"Timeout em 10s — tente novamente"`; log `warn` server sem chave
- **API OpenCode retorna 500/429:** retorna `valid:false` com mensagem da API truncada em 300 chars; sugere "Tente novamente em instantes"
- **model `gemini-2.0-flash` salvo no DB de escolas antigas:** `callGemini` sanitiza + fallback automático; `testAiConnection` também sugere `gemini-3.6-flash` em 404
- **Interações API nova:** se Google exigir `Interactions API` com header diferente, `callGemini` detecta mensagem `We recommend you to use the Interactions API` e retorna erro orientativo + log para migração futura (fora escopo implementar nova API agora)
- **opencodeApiUrl custom inválida (ex: sem https):** `new URL(apiUrl)` valida; se falhar → `error:"URL inválida"`
- **Modelos com `id` malformado ou `pricing` ausente:** filtro tolerante: se `pricing` ausente mas `id` contém `zen-free` → considera grátis
- **Lista grande (>50 modelos):** frontend `Command` com virtualização/busca, não renderiza todos de uma vez sem filtro
- **Dois admins testando simultaneamente:** cada request isolado por `organizationId`/`userId`; sem race
- **Sessão expirada durante Teste:** `protectedProcedure` retorna 401 → frontend redireciona login
- **Chave válida mas sem permissão para `GET /v1/models` (scope limitado):** alguns provedores exigem scope `models:read`; se 403 → retorna `valid:true` mas `models:[]` + aviso "Chave válida porém sem permissão para listar modelos — informe o modelo manualmente"
- **Virada de mês/ano:** sem impacto; teste sempre usa data atual
- **BOM em `glossary.json` de skill OpenCode:** não afeta este PRD
- **Lista vazia:** primeiro acesso sem teste → não mostra lista Zen (evita confusão)

---

## 8. Dados Envolvidos

| Entidade | Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|---|
| `settings` | `aiProvider` | `varchar(50)` default `gemini` | Sim | enum `gemini`\|`groq`\|`opencode` |
| `settings` | `geminiApiKey` | `varchar(255)` encrypt `v1:` | Não | `decryptSecret` (`db.ts:1543`) |
| `settings` | `geminiModel` | `varchar(255)` | Não | ex: `gemini-3.6-flash` (novo), legado `gemini-2.0-flash` mapeado |
| `settings` | `groqApiKey` | `varchar(255)` encrypt | Não | `gsk_...` |
| `settings` | `groqModel` | `varchar(255)` | Não | ex: `openai/gpt-oss-20b` |
| `settings` | `opencodeApiKey` | `text` encrypt `v1:` | Não | `opencode-...`/`sk-opencode...` |
| `settings` | `opencodeModel` | `varchar(255)` | Não | ex: `opencode/muse-spark-1.2-zen-free` (Zen grátis) |
| `settings` | `opencodeApiUrl` | `text` | Não | ex: `https://api.opencode.ai/v1/chat/completions` fallback env |
| `tRPC input` `testAiConnection` | `aiProvider` | `z.enum(["gemini","groq","opencode"])` | Sim | valida |
| `tRPC input` `testAiConnection` | `apiKey` | `z.string().max(500)` | Não | se vazio usa DB fallback |
| `tRPC input` `testAiConnection` | `model` | `z.string().max(255)` | Não | opcional |
| `tRPC input` `testAiConnection` | `apiUrl` | `z.string().url().max(500)` | Não | só `opencode` |
| `tRPC output` `testAiConnection` | `valid` | `boolean` | Sim | `true` se 2xx |
| `tRPC output` `testAiConnection` | `models` | `Array<{id,name,displayName,contextLength,pricing}>` | Não | só `opencode` quando `valid` |
| `tRPC output` `testAiConnection` | `error` | `string` | Não | mensagem amigável sem `apiKey` |

---

## 9. Permissões e Segurança

| Ação | Admin | Professor (dono escola) | Aluno | SuperAdmin |
|---|:---:|:---:|:---:|:---:|
| Selecionar `aiProvider` + editar chaves | Sim | Sim (dono `organizationId`) | Não | Sim |
| `testAiConnection` | Sim | Sim (via `protectedProcedure` + `organizationId`) | Não | Sim |
| Listar modelos Zen | Sim | Sim | Não | Sim |
| Salvar `opencodeModel` | Sim | Sim | Não | Sim |

- **Isolamento:** toda leitura `settings` com `eq(settings.organizationId, orgId)` + `eq(settings.userId, ctx.user.id)` (`plataformaRouters.ts:172`); teste usa `decryptSecret` apenas no backend; nunca retorna `apiKey` no output.
- **Logs:** `genimi.ts`/`aiProvider.ts` logam `provider`/`model` + `hasKey` (`aiCredentialsLogMeta`), nunca `apiKey` completo; erro 401 loga `401 para provider opencode, key ****abcd`
- **Mensagens:** nunca expor `apiKey`, `stack`, `process.env`; erros genéricos: "Chave inválida", "Timeout", "Modelo descontinuado, use gemini-3.6-flash"
- **Rate limit:** `testAiConnection` sem cache; debounce frontend + backend timeout 10s evita abuso

---

## 10. Tratamento de Erros

### Erros Esperados (mensagem controlada)
- **Chave vazia:** `PRECONDITION_FAILED` → "Informe a chave da API antes de testar"
- **Chave inválida (401/403):** → "Chave inválida ou expirada. Verifique em opencode.ai / console.groq / Google AI Studio"
- **Modelo Gemini descontinuado (404 + is no longer available):** → `callGemini` fallback para `gemini-3.6-flash`; se ainda 404 → "Modelo gemini-2.0-flash descontinuado. Atualize para gemini-3.6-flash em Configurações > IA"
- **Timeout (10s):** → "Tempo esgotado ao validar a chave. Tente novamente"
- **Nenhum Zen grátis:** → "Nenhum modelo Zen grátis encontrado para esta chave" (não é erro, é aviso)

### Erros Internos (log server, mensagem genérica)
- **500/429 OpenCode:** log `status` + `body.slice(0,300)`; retorna "Erro ao consultar OpenCode (status 500). Tente novamente"
- **URL inválida:** log `invalid opencodeApiUrl`; retorna "URL da API inválida"
- **DB indisponível:** `INTERNAL_SERVER_ERROR` sem expor query

---

## 11. Requisitos Não Funcionais

### RNF-001 — Performance
Botão Testar responde em < 3s p50 (GET /v1/models ~500ms) e < 10s p95 (timeout). `generateDailyStudyPlan` com fallback Gemini não excede +1 retry (total < 15s como `RNF-001` de especialistas).

### RNF-002 — Segurança
Nunca persistir chave no `testAiConnection`; criptografia `encryptSecret` (`db.ts:1617`) com prefixo `v1:`; não logar chave; `TRPCError` sem `apiKey`/`stack`.

### RNF-003 — Disponibilidade
Teste não bloqueia Salvar; geração de plano continua funcionando mesmo se `GET /v1/models` falhar (usa `opencodeModel` manual).

### RNF-004 — Usabilidade
Botão Testar com estados visuais (idle=outline, loading=spinner+`Testando...`, success=verde com check, error=vermelho com `AlertTriangle`); lista Zen com busca e contador `12 modelos Zen grátis`; seleção preenche `opencodeModel` instantaneamente.

### RNF-005 — Compatibilidade
`pnpm check` 0 novos erros vs `tsc_baseline.txt`; `appRouter` imutável (`AGENTS.md#3`); `ssh2` não removido (`AGENTS.md#5`); `gemini-3.6-flash` compatível com `genAI` existente sem migrar para Interactions API ainda.

### RNF-006 — Observabilidade
Cada `testAiConnection` loga `{provider, modelRequested, hasKey, durationMs, valid}` sem chave; `callGemini` loga `fallback gemini-2.0-flash → gemini-3.6-flash`.

---

## 12. Critérios de Aceite

### CA-001 — Correção Gemini 404
**Dado que** `settings.geminiModel=gemini-2.0-flash`, **Quando** `generateDailyStudyPlan` chama `callGemini`, **Então** `gemini.ts` sanitiza para `gemini-3.6-flash` (ou fallback `gemini-1.5-flash`) e não retorna 404 `is no longer available`.

### CA-002 — Botão Testar Desabilitado sem Chave
**Dado que** `aiProvider=opencode` e `opencodeApiKey=""`, **Quando** usuário vê aba IA, **Então** botão `Testar chave OpenCode` está `disabled` e mostra hint "Informe a chave antes de testar".

### CA-003 — Testar OpenCode Válida Lista Zen Grátis
**Dado que** usuário informa `opencodeApiKey` válida e clica `Testar`, **Quando** `GET /v1/models` retorna 12 modelos com 5 `zen-free` (`pricing free`), **Então** frontend mostra badge verde `Chave válida — 5 modelos Zen grátis encontrados` e lista dropdown com `opencode/muse-spark-1.2-zen-free` etc. ordenados.

### CA-004 — Selecionar Zen Preenche opencodeModel
**Dado que** lista Zen exibida, **Quando** usuário clica em `opencode/muse-spark-1.2-zen-free`, **Então** `opencodeModel` input é preenchido com `opencode/muse-spark-1.2-zen-free` e ao clicar `Salvar` o DB `settings.opencodeModel` persiste esse `id`.

### CA-005 — Testar Chave Inválida Mostra Erro sem Lista
**Dado que** `opencodeApiKey` inválida, **Quando** clica `Testar`, **Então** `testAiConnection` retorna `{valid:false, error:"Chave inválida"}` e frontend mostra badge vermelho sem renderizar lista.

### CA-006 — Testar Gemini/Groq Sem Lista
**Dado que** `aiProvider=gemini` com chave válida, **Quando** clica `Testar chave Gemini`, **Então** retorna `{valid:true}` sem `models` e frontend mostra `Chave Gemini válida` sem lista Zen.

### CA-007 — Teste Não Persiste
**Dado que** usuário testa `opencodeApiKey=sk-teste` válida, **Quando** fecha aba sem Salvar, **Então** `DB settings.opencodeApiKey` permanece com valor antigo (teste não chama `upsertSettings`).

### CA-008 — Fallback Gemini_3.6 em generateDailyStudyPlan
**Dado que** `callGemini` com `gemini-2.0-flash` falha 404 `is no longer available`, **Quando** especialista gera plano, **Então** tenta 1× com `gemini-3.6-flash` e, se sucesso, plano é gerado sem erro ao usuário.

---

## 13. Riscos e Dependências

### Riscos
- **Risco técnico — API OpenCode sem endpoint `/v1/models`:** mitigação fallback para `https://opencode.ai/api/models` e para `https://opencode.ai/api/zen/models`; se ambos 404, retorna `valid:true` sem lista + aviso manual
- **Risco técnico — Filtro `isFreeZen` varia por conta (free vs pro):** mitigação filtrar por `pricing` e `id` contendo `zen`/`free`; documentar assunção e permitir override manual
- **Risco técnico — Interactions API obrigatória futura:** mitigação atual mapeia `gemini-3.6-flash` via `genAI` legado; se Google exigir nova API, erro orientará migração (fora escopo implementar agora)
- **Risco de segurança — Vazamento de chave no log:** mitigação mascarar `****` + nunca retornar `apiKey` no output
- **Risco de dados — `opencodeApiUrl` custom com BOM:** mitigação strip BOM `EF BB BF` (`AGENTS.md#7`) e validar `new URL`

### Dependências
- `server/utils/gemini.ts:164` (`safeModel` mapping), `server/utils/aiProvider.ts:17` (`resolveAiCredentials`), `drizzle/schema.ts:266` (`opencodeApiKey/Model/Url`), `server/db.ts:1532` (decrypt), `plataformaRouters.ts:163` (`updateIA`), `Configuracoes.tsx:169` (UI), `progressRouters.ts:442` (especialistas já respeitam provider), `vitest` (`InstrumentSpecialistService.test.ts`)

---

## 14. Métricas de Sucesso
- Taxa de erro 404 Gemini após correção: 0 em 50 gerações com `gemini-2.0-flash` legado
- Taxa de sucesso `Testar chave OpenCode` válida: >95% em <3s (p50)
- Taxa de seleção Zen grátis: >60% dos usuários que testam `opencode` escolhem modelo da lista vs digitação manual
- Suporte: redução de tickets "chave OpenCode não funciona" em 80%
- `pnpm check` 0 novos erros, `pnpm test` verde, `pnpm build` ok

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Estrutura e dados (0,25 dia)
- Atualizar `drizzle/schema.ts` e `server/db.ts` já feito para `opencodeApiKey/Model/Url` (manter); adicionar comentário `isFreeZen` filtro em `aiProvider.ts`

### Fase 2 — Backend/API (0,75 dia)
- `server/utils/gemini.ts:164`: mapear `gemini-2.0-flash` → `gemini-3.6-flash` (e `gemini-2.5-flash` → `gemini-3.6-flash` se 404), adicionar retry 1× em 404 `is no longer available` para `gemini-3.6-flash` → `gemini-1.5-flash`; log `warn` com fallback
- `server/routers/plataformaRouters.ts:163`: criar `testAiConnection: protectedProcedure.input(z.object({aiProvider, apiKey, model, apiUrl}))` com timeout 10s; `gemini` → `GET v1beta/models?key=` ou ping `callGemini` com `model="gemini-3.6-flash"` + `isJson=false`; `groq` → `GET api.groq.com/openai/v1/models`; `opencode` → `GET {apiUrl||OPENCODE_API_URL||https://api.opencode.ai/v1/models}` com `Bearer`, fallback `https://opencode.ai/api/models`, filtrar `isFreeZen` e retornar `models` ordenados; nunca logar chave; usar `resolveAiCredentials` para fallback DB se `apiKey` vazio

### Fase 3 — Frontend (0,75 dia)
- `Configuracoes.tsx:1938`: abaixo de cada provedor, botão `Testar chave {Provider}` com estados `idle/loading/success/error` (usa `trpc.settings.testAiConnection.useMutation`), desabilitado se `apiKey.trim()===""`
- Se `aiProvider===opencode` e `test.valid` com `models.length>0`: renderizar `Field` lista Zen com `Select`/`Command` searchable, contador `X modelos Zen grátis`, ao selecionar `setOpencodeModel(id)`; se 0 modelos → warning + mantém input manual
- Manter `handleSaveIA:423` que persiste `opencodeModel` selecionado

### Fase 4 — Integrações (0,1 dia)
- Garantir `progressRouters.ts:773` já usa `resolveAiCredentials` (feito); garantir `advancedAiRouter.ts` também; sem mudar `appRouter` keys

### Fase 5 — Testes (0,5 dia)
- `server/routers/plataformaRouters.test.ts` (ou `aiProvider.test.ts`): mock `fetch` para `testAiConnection` (gemini 401, groq 200, opencode 200 com 3 zen-free), testar filtro `isFreeZen`, timeout, `PRECONDITION_FAILED` chave vazia
- `server/utils/gemini.test.ts`: testar mapping `gemini-2.0-flash` → `gemini-3.6-flash` e retry 404 → `gemini-1.5-flash`
- `pnpm vitest run server/routers/plataformaRouters.test.ts server/utils/gemini.test.ts` + `pnpm check` (`tsc --noEmit`) + `pnpm test` focado + `pnpm build` (`AGENTS.md`)

### Checklist de Saída
- [ ] `gemini-2.0-flash` não gera mais 404 (mapeado para `gemini-3.6-flash` com fallback)
- [ ] Botão Testar mostra `loading`→`success/error` sem persistir chave
- [ ] `opencode` válida lista Zen grátis e seleção preenche `opencodeModel` e persiste ao Salvar
- [ ] `pnpm check` 0 novos erros vs baseline `tsc_baseline.txt` (path|code|msg)
- [ ] `pnpm test` verde e `pnpm build` ok
