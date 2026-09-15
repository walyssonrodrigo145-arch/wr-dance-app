# PRD — OpenCode no Sistema de IAs Geral (MusicPro) — Especialistas + Assistente

## 1. Visão Geral

### Problema
**Especialistas:** `server/services/InstrumentSpecialistService.ts:1` + `server/utils/instrumentContexts.ts:44` → `progressRouters.ts:442,752,1029` (`generateDailyStudyPlan`, `updateStudyPlan`, `generateAIInsight`, etc.) é código fechado. Toda melhoria `teclado: voz=polifonia` exige PR em TS, sem trilha pedagógica.

**Assistente geral (gap do usuário):** além dos especialistas, o MusicPro tem **IA assistente geral** (recepção virtual WhatsApp `server/utils/whatsapp.ts:1` + `server/webhooks/whatsapp.ts:1` + `server/utils/chatbotTools.ts:1` + `server/advancedAiRouter.ts:1` (`generateSmartLessonPlan`/`generateSmartSchedule`/`getPedagogicalMemory`) + `server/utils/aiPrompts.ts:1` + `server/utils/gemini.ts:1`). Esses prompts também são hardcoded em TS, sem versionamento OpenCode, sem isolamento por `organizationId`/`conversationalMode`, e sem validação de contaminação (ex: assistente confunde financeiro com pedagógico). O usuário pediu **OpenCode geral, não só especialistas**.

Isso gera atrito: qualquer ajuste de prompt da assistente exige deploy de código, sem auditoria, sem teste isolado por skill e sem governança multi-tenant.

### Objetivo
Integrar **OpenCode como camada geral de governança de TODAS as IAs**: 
- **7 IAs especialistas** por instrumento (`instrument-teclado`, `instrument-voz`, etc.) + 
- **IAs assistentes gerais** (`assistant-receptionist` WhatsApp, `assistant-pedagogical` insights/planos, `assistant-scheduling` otimização de grade, `assistant-fiscal` futura) 
cada uma como **Skill OpenCode** versionada (`.opencode/skills/ai-*/SKILL.md` + `systemPrompt.md`/`glossary.json`/`fewshots.json`/`policy.json`), carregada em runtime por um **AiSkillService** unificado (`server/services/AiSkillService.ts` que estende `InstrumentSpecialistService.ts`) com fallback para registry TS. Permitir edição via PRD → Skill → `validate`/`sync` → deploy, sem quebrar `appRouter` (`AGENTS.md#3`).

### Contexto
- **Especialistas (já implementado):** `instrumentContexts.ts:44` → `InstrumentSpecialistService.ts:214` (`resolveSpecialist`/`buildSpecialistPromptBlock`/`validatePlanText`) → `progressRouters.ts:442,752,1029`
- **Assistente geral (a generalizar):** `server/utils/aiPrompts.ts:1` (`getSystemPrompt`), `server/utils/whatsapp.ts:1` (`sendWhatsAppMessage`), `server/utils/chatbotTools.ts:1` (`chatbotTools.test.ts`), `server/webhooks/whatsapp.ts:1`, `server/advancedAiRouter.ts:1` (`generateSmartLessonPlan`, `getPedagogicalMemory`), `server/utils/gemini.ts:1` (`callGemini`), `drizzle/schema.ts:642` (`chatbot_logs`, `school_knowledge_base`)
- **OpenCode já em uso:** `.opencode/skills/asaasauditor`, `layoutespecialista` etc. (`AGENTS.md:1`)
- **PRD base:** `PRD_IAS_ESPECIALISTAS_INSTRUMENTOS.md:1` (Fase 5 tabela) + `PRD_IAS_ESPECIALISTAS_INSTRUMENTOS.md:RF-010` (PlanEditor)

---

## 2. Usuários Envolvidos
- **Eng. Software / IA (ator principal):** edita skills (especialistas + assistente), roda `pnpm check`, valida `validatePlanText`
- **Gestor Pedagógico:** propõe glossário/exemplos por instrumento e políticas da assistente (sem codar)
- **Professor/Admin:** consome plano diário (especialista) e atendimento WhatsApp (assistente) — não vê OpenCode
- **Aluno/Lead (via WhatsApp):** interage com assistente recepção (`chatbotTools`/`school_knowledge_base`)
- **QA/Auditor (`asaasauditor`):** valida contaminação (teclado→canto) e alucinação da assistente (ex: assistente financeira não vaza dados pedagógicos)
- **Sistema (OpenCode agent):** carrega skill via `AiSkillService`/`InstrumentSpecialistService` em runtime

---

## 3. Escopo

### Incluído — Geral (Especialistas + Assistente)
- **Skills especialistas (7):** `.opencode/skills/ai-instrument-{id}/SKILL.md` (1 por `InstrumentCategory`: `teclado`, `voz`, `cordas_dedilhadas`, `percussao`, `sopro`, `cordas_arco`, `geral`) — cada skill com `systemPrompt.md`, `glossary.json`, `forbidden.json`, `fewshots.json`, `metadata.json` (conteúdo atual de `InstrumentSpecialistService.ts:30`)
- **Skills assistente geral (4):** 
  - `ai-assistant-receptionist` (WhatsApp recepção virtual: `whatsapp.ts` + `webhooks/whatsapp.ts` + `chatbotTools.ts` + `school_knowledge_base`) — `systemPrompt.md` com políticas de atendimento, `tools.json` (quais `chatbotTools` expor), `policy.json` (multi-tenant isolation, `conversationalMode`, `attendancePersonaName`)
  - `ai-assistant-pedagogical` (insights/planos: `progressRouters.ts:232,257,356` + `advancedAiRouter.ts:81` `getPedagogicalMemory`) — `systemPrompt.md` + `fewshots.json` por nível
  - `ai-assistant-scheduling` (otimização grade: `advancedAiRouter.ts:216` `generateSmartSchedule`) — `systemPrompt.md` + `constraints.json`
  - `ai-assistant-core` (prompt base `aiPrompts.ts` + `gemini.ts` wrapper) — `provider.json` (Gemini/Groq, `settings.aiProvider`)
- **Loader unificado:** `server/services/AiSkillService.ts` (novo) que encapsula `InstrumentSpecialistService.ts` + assistente; `loadAiSkill(skillId)` com cache memória, hot-reload `dev`, fallback registry TS se skill ausente/corrompida
- **CLI/Helper unificado:** `scripts/sync-ai-skills.ts` (substitui `sync-specialists.ts`) → `pnpm ai:validate` / `pnpm ai:sync` valida todas skills (glossary sem conflito, forbidden não vazio, tools permitidas, policy multi-tenant) e gera `server/services/ai-skills.snapshot.json` para `build` (prod sem acesso a `.opencode/`)
- **Integração especialista:** `progressRouters.ts:442` continua via `resolveSpecialist` (agora via `AiSkillService`)
- **Integração assistente:** `webhooks/whatsapp.ts:1` + `chatbotTools.ts:1` passam a carregar `ai-assistant-receptionist` skill; `advancedAiRouter.ts:1` carrega `assistant-pedagogical`/`scheduling`; sem mudar contrato tRPC (`AGENTS.md#3`)
- **Auditoria geral:** `pnpm ai:validate` roda `validatePlanText` (polissemia `voz`) + `validateAssistantPolicy` (isolamento `organizationId`, `chatbot_logs` sem vazamento)
- **Docs:** `ARCHITECTURE.md` + `AI_CONTEXT.md` seção "AI Skills via OpenCode — Especialistas + Assistente"

### Fora do escopo (Geral)
- Tabela `instrument_specialists` / `ai_skills` no Postgres — substituídas por skills em arquivo + snapshot; migração SQL não entra agora (Fase 5 original)
- UI de edição de prompts no frontend (professor/aluno não edita skill; edição é via skill/PR, não via tela — mantém `PlanEditor.tsx:1` só para `planText`, não para `systemPrompt`)
- Fine-tuning de modelo, RAG externo vetorial, ou troca de `callGemini` provider (`gemini.ts`) — apenas prompts via skill
- Alteração de `appRouter` keys (`AGENTS.md#3`); `ssh2` remoção (`AGENTS.md#5`)

---

## 4. Requisitos Funcionais

### RF-001 — Skills por Especialista
**Descrição:** Criar 7 skills em `.opencode/skills/instrument-{id}/` cada uma com `SKILL.md` (identidade), `systemPrompt.md`, `glossary.json`, `terminology.json`, `forbidden.json`, `fewshots.json`.
**Pré-condições:** `InstrumentCategory` existente
**Fluxo:** `teclado/SKILL.md` descreve missão "voz=polifonia/voicing", `glossary.json` contém `{"voz / vozes / voicing": "Em TECLADO ..."}` (mesmo de `InstrumentSpecialistService.ts:30`)
**Dados:** arquivos em `.opencode/skills/`

### RF-002 — Loader com Fallback
**Descrição:** `InstrumentSpecialistService.ts` tenta `loadSpecialistFromSkill(id)` (leitura `fs` síncrona em startup, async em dev com `watch`). Se falhar, usa `INSTRUMENT_SPECIALISTS[id]` em memória.
**Exceções:** JSON inválido → log `warn` + fallback; skill ausente → fallback
**Dados:** `specialists.snapshot.json` gerado no build

### RF-003 — Validação de Skill (CLI)
**Descrição:** `pnpm specialists:validate` verifica: `glossary` tem `voz` desambiguada por `teclado` vs `voz`; `forbidden` não vazio para `teclado` (deve conter `vocalise`, `respiração diafragmática`); `fewShots.direto` ≤ 3 itens.
**Atores:** CI / dev

### RF-004 — Snapshot para Build
**Descrição:** `scripts/sync-specialists.ts` lê todas skills e gera `server/services/specialists.snapshot.json` (usado em produção sem acesso a `.opencode/`). `InstrumentSpecialistService` carrega snapshot se `NODE_ENV=production`.
**Dependência:** `build` roda `sync` antes de `vite build` + `esbuild`

### RF-005 — Sem Quebra de Contrato tRPC
**Descrição:** `getSpecialist`/`resolveSpecialist` mantêm assinatura ` (name, category) => InstrumentSpecialist`; `progressRouters.ts` não muda `input/output` de `generateDailyStudyPlan`, `updateStudyPlan`, etc.

### RF-006 — Auditoria e Testes (Especialistas)
**Descrição:** Suite `server/services/InstrumentSpecialistService.test.ts` passa a carregar skills + registry e testar `validatePlanText` com dataset polissêmico (teclado `voicing` vs canto `vocalise`)

### RF-007 — Skills Assistente Geral (4)
**Descrição:** Criar skills `ai-assistant-receptionist`, `ai-assistant-pedagogical`, `ai-assistant-scheduling`, `ai-assistant-core` em `.opencode/skills/` cada uma com `SKILL.md`, `systemPrompt.md`, `policy.json` (isolation), `tools.json` (para receptionist) e `fewshots.json`.
**Fluxo:** `receptionist` contém `systemPrompt` que referencia `school_knowledge_base` (`drizzle/schema.ts:654`) e lista `tools` permitidas (`chatbotTools.ts`); `pedagogical` contém prompts de `generateAIInsight`/`suggestNextLessonTopic`

### RF-008 — Loader Geral AiSkillService
**Descrição:** `server/services/AiSkillService.ts` expõe `getAiSkill(skillId)`, `resolveSpecialist` (delega para `InstrumentSpecialistService`), `getAssistantPrompt(skillId, organizationId)` que aplica `policy.json` (ex: `conversationalMode`, `attendancePersonaName` de `settings:253`). Cache memória + snapshot fallback.
**Exceções:** skill ausente → fallback registry TS; `policy` inválida → `warn` + usa default

### RF-009 — CLI Geral ai:validate / ai:sync
**Descrição:** `scripts/sync-ai-skills.ts` valida todas skills (7 instrument + 4 assistant): `forbidden` não vazio, `tools` subset de `chatbotTools`, `policy` sem `apiKey`, `systemPrompt` ≤ 1200 chars. Gera `server/services/ai-skills.snapshot.json` (ou `specialists.snapshot.json` legado) para `prebuild`.
**Dependência:** `pnpm ai:sync` roda antes de `vite build` + `esbuild` (`AGENTS.md`)

### RF-010 — Integração Assistente sem Quebrar Contrato
**Descrição:** `webhooks/whatsapp.ts` e `advancedAiRouter.ts` passam a obter prompt via `AiSkillService.getAssistantPrompt(...)` mantendo `input/output` tRPC idênticos. Multi-tenant: `policy` aplica `organizationId` isolation (`chatbot_logs:642`).

### RF-011 — Auditoria Geral
**Descrição:** `pnpm ai:validate` roda além do `validatePlanText`, `validateAssistantIsolation` (verifica que `assistant-receptionist` nunca lê `paymentDues`/`fiscalCompanies` e que `assistant-pedagogical` nunca lê `chatbot_logs` de outra org)

---

## 5. Regras de Negócio

### RN-001 — Skill vence Registry, Registry é Fonte da Verdade em Falha
**Regra:** Se skill existe e valida, usa skill; senão usa registry TS. Nunca quebrar geração por skill corrompida.
**Exemplo válido:** skill `teclado/glossary.json` ausente → fallback `GLOSSARY_TECLADO` em código
**Consequência:** log `warn` + geração segue

### RN-002 — OpenCode não Expõe Segredos
**Regra:** Skills não podem conter `apiKey`, `prompt` não pode vazar `DATABASE_URL`. Validação bloqueia `apiKey` em `SKILL.md`
**Consequência:** `sync` falha se encontrar `apiKey|secret`

### RN-003 — Imutabilidade de `days.length===5` Mantida
**Regra:** Skills não alteram schema JSON (`daily_study_plans.planText` com 5 dias) — validador `progressRouters.ts:752` mantém check

---

## 6. Fluxos

### Fluxo Principal — Editar Especialista via OpenCode
```text
Eng. IA
↓
Edita .opencode/skills/instrument-teclado/glossary.json (ex: adiciona "vozes internas")
↓
Roda pnpm specialists:validate
↓
Roda pnpm specialists:sync → gera specialists.snapshot.json
↓
pnpm check (deve passar, sem novos erros vs baseline tsc_baseline.txt)
↓
Commit PR → CI roda validate + check + vitest especialista
↓
Deploy → InstrumentSpecialistService carrega snapshot em produção
↓
Professor gera plano teclado com "vozes internas" → especialista atualizado → validação passa
```

### Fluxo Alternativo — Skill Corrompida
```text
glossary.json inválido
↓
loadSpecialistFromSkill falha → log warn → fallback registry TS → geração não bloqueia
```

### Fluxo de Erro — Forbidden vazio em teclado
```text
pnpm specialists:validate detecta teclado.forbidden.length===0
↓
Falha CLI com "teclado.forbidden deve conter vocalise/respiração..."
↓
Build bloqueado
```

---

## 7. Casos Extremos
- Skill com JSON inválido, BOM, ou `Set-Content -Encoding utf8` com BOM (`AGENTS.md#7`) → loader detecta BOM `EF BB BF` e remove
- Skill com `glossary` duplicado (teclado vs voz com mesma chave e mesma definição) → `validate` alerta mas não bloqueia
- `specialists.snapshot.json` desatualizado vs skill → `sync` em `prebuild` garante frescor; se divergir em produção, log `warn`
- Dois devs editam mesma skill em branchs diferentes → merge conflict em JSON, resolvido via PR
- `pnpm build` sem `sync` → `InstrumentSpecialistService` loga "snapshot ausente, usando registry"
- Categoria nova `harpa` sem skill → cai em `geral` (comportamento atual `instrumentContexts.ts:532`)

---

## 8. Dados Envolvidos
| Entidade | Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|---|
| Skill file `systemPrompt.md` | texto | `string` | Sim | 200-800 chars, sem secrets |
| `glossary.json` | `Record<string,string>` | `json` | Sim | chave polissêmica (ex: `voz / vozes / voicing`), valor ≤ 300 chars |
| `forbidden.json` | `string[]` | `json` | Sim | `teclado` deve conter `vocalise`, `respiração diafragmática` |
| `fewshots.json` | `Record<PlanMode,string[]>` | `json` | Não | ≤3 por modo, cada ≤300 chars |
| `specialists.snapshot.json` | `Record<Category, Specialist>` | `json` | Gerado | `pnpm build` consome; não editar manualmente |

---

## 9. Permissões e Segurança
| Ação | Eng. IA | Pedagógico | Professor | SuperAdmin |
|---|:---:|:---:|:---:|:---:|
| Editar skill | Sim | Via PR (review) | Não | Sim |
| Rodar `specialists:validate/sync` | Sim | Não | Não | Sim |
| Gerar plano | — | — | Sim | Sim |

- Backend enforcement: `resolveSpecialist` nunca lê skill em request do professor; apenas em startup/sync
- Nunca expor `SKILL.md` cru ao cliente; apenas `buildSpecialistPromptBlock` injeta no prompt LLM
- Logs não incluem `planText` completo, só `specialistId` + `found` (`InstrumentSpecialistService.ts:286`)

---

## 10. Tratamento de Erros
- **Erro esperado:** skill inválida → fallback registry + `warn`, geração segue
- **Erro interno:** `sync` não encontra `.opencode/skills/instrument-*` → `error` CLI, build falha
- Mensagens ao usuário professor nunca expõem skill path/stack; só "Plano gerado com especialista atualizado"

---

## 11. Requisitos Não Funcionais
- **RNF-001 Performance:** loader cache em memória; `resolveSpecialist` O(1); `sync` < 1s
- **RNF-002 Compatibilidade:** `appRouter` imutável; `pnpm check` 0 novos erros vs `tsc_baseline.txt` (ignora `linha,col`)
- **RNF-003 Observabilidade:** `sync` e `validate` logam `skillId`, `found`, `snapshotVersion`
- **RNF-004 Manutenibilidade:** adicionar novo instrumento = criar pasta `instrument-{id}/` + 4 JSONs + `SKILL.md`, sem migração SQL

---

## 12. Critérios de Aceite

### CA-001
**Dado que** skill `instrument-teclado/glossary.json` contém `voz / vozes / voicing = polifonia`, **Quando** `InstrumentSpecialistService` carrega, **Então** `buildSpecialistPromptBlock(teclado)` contém `GLOSSÁRIO` com `voz` e `validatePlanText("vocalise", teclado)=failed`

### CA-002
**Dado que** skill `teclado/forbidden.json` é apagada, **Quando** `pnpm specialists:validate` roda, **Então** falha com "teclado.forbidden deve conter vocalise"

### CA-003
**Dado que** professor gera plano teclado com meta `voicing`, **Quando** `generateDailyStudyPlan` executa, **Então** `specialist.id=teclado` (resolvido via skill se existir, senão registry) e `specialist.snapshot` não altera contrato tRPC

### CA-004
**Dado que** skill corrompida (JSON inválido), **Quando** produção inicia, **Então** `getSpecialist(teclado)` retorna registry TS e log `warn` sem quebrar geração

---

## 13. Riscos e Dependências
- **Risco:** skill com BOM (PowerShell) quebra `JSON.parse` → mitigação: strip BOM `EF BB BF` (`AGENTS.md#7`)
- **Risco:** divergência snapshot vs skill em produção → mitigação: `prebuild` roda `sync`
- **Dependências:** `InstrumentSpecialistService.ts:1`, `instrumentContexts.ts:44`, `progressRouters.ts:442`, `AGENTS.md` comandos, `vitest`

---

## 14. Métricas de Sucesso
- `pnpm specialists:validate` 100% verde em CI
- `pnpm check` 0 novos erros
- Tempo `resolveSpecialist` p95 < 1ms
- 0 incidentes de skill corrompida bloquear geração (fallback funciona)

---

## 15. Plano de Implementação Sugerido (OpenCode)

### Fase 1 — Estrutura e Dados (0,75 dia) — Geral
- Criar `.opencode/skills/ai-instrument-teclado/SKILL.md` (+ 6 demais categorias) copiando `SYSTEM_TECLADO`, `GLOSSARY_TECLADO`, `forbidden`, `terminology`, `fewShots` de `InstrumentSpecialistService.ts:30,214`
- Criar `.opencode/skills/ai-assistant-receptionist|pedagogical|scheduling|core/SKILL.md` com `systemPrompt.md`/`policy.json`/`tools.json` extraídos de `aiPrompts.ts:1`, `whatsapp.ts:1`, `chatbotTools.ts:1`, `advancedAiRouter.ts:1`
- Criar `scripts/sync-ai-skills.ts` (Node, sem deps) que lê todas skills (7+4), valida e gera `server/services/ai-skills.snapshot.json` (mantém compat `specialists.snapshot.json`)
- Adicionar `package.json` scripts: `"ai:validate": "tsx scripts/sync-ai-skills.ts --validate"`, `"ai:sync": "tsx scripts/sync-ai-skills.ts --sync"`, `"specialists:validate" → alias ai:validate`, `"prebuild": "pnpm ai:sync"`

### Fase 2 — Backend/API (0,75 dia) — Geral
- Refatorar `InstrumentSpecialistService.ts:216` para `loadSpecialistFromSkill(id)` + criar `server/services/AiSkillService.ts` (wrapper geral que delega `resolveSpecialist` e expõe `getAssistantPrompt(skillId, orgId)`)
- `progressRouters.ts:442,232,257,356` continua via `resolveSpecialist` / `getAssistantPrompt` sem mudar contrato; `webhooks/whatsapp.ts` + `advancedAiRouter.ts` passam a carregar `ai-assistant-*` skills
- Garantir `AGENTS.md#5` — não remover `ssh2`

### Fase 3 — Frontend (0 dia)
- Nenhuma mudança; professor não vê skill

### Fase 4 — Integrações (0,25 dia) — Geral
- CI: adicionar step `pnpm ai:validate` (cobre especialistas + assistente) antes de `pnpm check` (`AGENTS.md`)

### Fase 5 — Testes (0,75 dia) — Geral
- Atualizar `server/services/InstrumentSpecialistService.test.ts` (especialistas) + criar `server/services/AiSkillService.test.ts` (assistente: isolation `organizationId`, `chatbot_logs` vs `paymentDues`)
- Datasets: `voz` polissemia + `assistant-receptionist` não lê `fiscalCompanies` + `assistant-pedagogical` não vaza entre orgs
- Rodar `pnpm vitest run server/services/InstrumentSpecialistService.test.ts server/services/AiSkillService.test.ts` + `pnpm check` + `pnpm build` (`AGENTS.md`)

### Checklist de Saída (Geral)
- [ ] `pnpm ai:validate` verde (7 instrument + 4 assistant)
- [ ] `pnpm check` verde (0 novos erros vs baseline `tsc_baseline.txt` path|code|msg)
- [ ] `pnpm test` verde (`InstrumentSpecialistService` + `AiSkillService`)
- [ ] `pnpm build` gera `ai-skills.snapshot.json` e `vite build` ok
- [ ] `teclado` skill editada → plano reflete glossário sem deploy TS
- [ ] `assistant-receptionist` skill editada → WhatsApp recepção reflete sem deploy TS, com `organizationId` isolation intacto
