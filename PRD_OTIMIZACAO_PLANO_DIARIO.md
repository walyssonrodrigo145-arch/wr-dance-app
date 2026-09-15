# PRD — Otimização de Tokens do Plano Diário (Prompt Enxuto + Telemetria de Uso)

## 1. Visão Geral

### Problema
A geração do plano diário custa **~6.000–7.400 tokens por chamada** (entrada ~2.700–3.400 + saída ~3.000–4.000, medidos em produção). Isso causa:
1. **Timeouts:** GLM 5.3 Flash (OpenCode Go) estourou o corte de 30s em 2/2 chamadas; gpt-oss-120b/20b e qwen estouraram 25s na Groq em 4 de 6 tentativas (telemetria `ai_call_logs`, 28/08);
2. **Custo/limite:** no free tier da Groq (8K TPM), a geração opera na borda do limite → 413/retries;
3. **Cegueira de custos:** a telemetria atual não registra tokens de entrada/saída/cache — impossível medir otimizações.

Análise de composição (medida real, violão/modo direto): bloco do especialista ~743 tokens, teoria ~245, terminologia extra ~208, exemplo JSON de dia completo ~583, dinâmicos (metas/histórico/memória) ~400–900, saída ~2.600–3.200.

### Objetivo
Reduzir **≥25% do total de tokens por geração** e **≥25% do tempo de saída**, SEM alterar a qualidade pedagógica (metas continuam sendo o fio condutor exclusivo; especialistas e validadores permanecem intactos), e adicionar telemetria de tokens para medir o resultado.

### Contexto
- `server/routers/progressRouters.ts` (prompt do `generateDailyStudyPlan`, linhas ~607–812)
- `server/utils/gemini.ts` (OpenCode/Groq — parâmetros de requisição)
- `server/utils/aiTelemetry.ts` + `drizzle/schema.ts` (`ai_call_logs`)
- `client/src/pages/Progresso.tsx` + `client/src/pages/student/Progresso.tsx` (ícones derivados do `icon` do JSON)
- Princípio (herdado de PRD_PROMPTS_IA_CONSOLIDADOS): bloco do especialista, glossário, termos proibidos e validadores **não são alterados**.

---

## 2. Usuários Envolvidos

* **Professor:** gera planos; percebe geração mais rápida e menos erros de timeout.
* **Aluno:** consome o plano; nenhuma mudança visual além dos ícones (mantidos por mapeamento).
* **Operador:** ganha métricas de tokens (input/output/cache) em `ai_call_logs`.

---

## 3. Escopo

### Incluído
1. Saída enxuta: subtítulos ≤8 palavras, points ≤12 palavras, campo `icon` removido do JSON (derivado no client pelo título do bloco).
2. Schema de saída compacto (spec + 1 exercício de exemplo em vez de dia completo).
3. Histórico reduzido: 5 aulas (era 10), 5 eventos de timeline (era 10), repertórios da memória pedagógica limitados a 5 itens cada.
4. Bloco fixo "Regras de Técnica por Instrumento" omitido quando há especialista mapeado (`specialist.id !== "geral"`).
5. Reordenação static-first: blocos estáticos antes, dinâmicos (metas, notas, memória, histórico) no final — habilita prompt caching; instrução de retry continua anexada ao fim (preserva o cache no retry).
6. `reasoning_effort: "low"` em chamadas JSON (Groq gpt-oss e OpenCode) com retry sem o parâmetro em erro 400.
7. Telemetria: colunas `inputTokens`, `outputTokens`, `cachedTokens` em `ai_call_logs` (Groq `usage`, OpenCode `usage`, Gemini `usageMetadata`).
8. Timeout parametrizável por chamada (OpenCode 30s → 120s para geração de plano; chat mantém 30s) — pré-requisito já diagnosticado.

### Fora do Escopo
- Alteração do sistema de especialistas, glossários, termos proibidos, `validatePlanText`, `validateMusicTheoryConcepts`.
- Mudança na estrutura de 5 dias × 6 blocos, na divisão de tempos ou no contrato do client (exceto derivação de ícone).
- Mudança de provedor/modelo padrão.

---

## 4. Requisitos Funcionais

### RF-001 — Saída enxuta do plano
**Descrição:** O prompt passa a instruir: `subtitle` com no máximo 8 palavras; cada item de `points` com no máximo 12 palavras; **sem campo `icon`** no JSON de saída. Quantidade de points mantida (Técnica 3, demais 2).
**Atores:** Sistema.
**Dados envolvidos:** `jsonSchemaFormat` + regras absolutas do prompt; validação estrutural ignora ausência de `icon`.

### RF-002 — Ícones derivados no client
**Descrição:** `ExerciseIcon` em `Progresso.tsx` (e portal do aluno, se aplicável) passa a derivar o ícone pelo `title` do exercício (Revisão→refresh, Aquecimento→music, Técnica→star, Conceito→book, Aplicação→headphones, Desafio→pen; fallback: `icon` do JSON se presente, senão BookOpen). Compatível com planos antigos que têm `icon`.
**Atores:** Sistema.

### RF-003 — Schema de saída compacto
**Descrição:** O `jsonSchemaFormat` é substituído por spec compacta: enumeração dos 6 blocos fixos com `duration` e ordem, 1 exercício de exemplo, e instrução "EXATAMENTE 5 objetos em days, blocos sempre nesta ordem, títulos dos blocos exatamente como listados". Redução alvo: ~583 → ≤300 tokens.

### RF-004 — Contexto dinâmico reduzido
**Descrição:** `pastLessons` limit 5 (era 10); `timeline` limit 5 (era 10); `repertoireLearning`/`strongPoints`/`weakPoints` truncados a 5 itens no bloco de memória pedagógica.

### RF-005 — Bloco fixo condicionado
**Descrição:** A seção fixa "REGRAS DE TÉCNICA POR INSTRUMENTO" é incluída somente quando `specialist.id === "geral"` (instrumento não mapeado).

### RF-006 — Static-first para prompt caching
**Descrição:** Ordem do prompt: [identidade + modo + especialista + teoria + terminologia + schema + regras absolutas] → [metas + notas + memória + histórico]. Requisito de igualdade: nenhum bloco dinâmico pode anteceder um estático. A instrução de retry é anexada ao FINAL do prompt (mantém prefixo cacheável).

### RF-007 — Reasoning reduzido em JSON
**Descrição:** Chamadas com `isJson=true` enviam `reasoning_effort: "low"` para Groq (modelos gpt-oss) e OpenCode (gateway Go/Zen). Em erro 400 citando o parâmetro, repete a chamada sem ele (uma vez).
**Atores:** Sistema.

### RF-008 — Timeout parametrizável
**Descrição:** `callGemini` aceita `timeoutMs` via `meta` (padrão atual: Groq 25s, OpenCode 30s, Gemini 60s). `generateDailyStudyPlan` envia 120.000ms para OpenCode e Groq. Chat do bot e demais fluxos inalterados.

### RF-009 — Telemetria de tokens
**Descrição:** `ai_call_logs` ganha `inputTokens`, `outputTokens`, `cachedTokens` (integer, nullable). Populados a partir de: Groq/OpenCode `usage` (`prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`); Gemini `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`). Falha de leitura não bloqueia (RN-002 vigente).

---

## 5. Regras de Negócio

### RN-001 — Pedagogia intocada
**Regra:** Metas continuam fio condutor exclusivo; especialistas, glossários, termos proibidos e validadores inalterados. Nenhum corte deste PRD se aplica a esses blocos.
**Consequência:** Taxa de contaminação não pode piorar (verificável por `validacao_retry` em `ai_call_logs`).

### RN-002 — Contrato do client preservado
**Regra:** O client continua parseando `days[].exercises[]` com `title/subtitle/duration/points`; `icon` passa a ser opcional (derivado).
**Exemplo válido:** plano novo sem `icon` renderiza com ícone correto por título.
**Exemplo inválido:** client quebrando por ausência de `icon`.

### RN-003 — Cache só com prefixo estável
**Regra:** Nenhum dado dinâmico (nome de aluno, metas, datas) pode entrar antes do último bloco estático.
**Consequência:** Retries e gerações consecutivas aproveitam cache (input com desconto no Groq/OpenCode).

### RN-004 — Timeout longo só onde importa
**Regra:** 120s apenas em `generateDailyStudyPlan`; demais fluxos mantêm timeouts atuais (chat do bot permanece responsivo).

### RN-005 — Medição obrigatória
**Regra:** Toda geração registra tokens; sem registro de tokens, a otimização não pode ser considerada concluída.

---

## 6. Fluxos

### Fluxo principal (pós-otimização)
```text
Professor gera plano
↓
Prompt montado: estáticos → dinâmicos (schema compacto, sem exemplo dia inteiro)
↓
Chamada com timeoutMs=120s + reasoning_effort low (JSON)
↓
Resposta parseada (validadores existentes) + usage capturado
↓
Persistência + ai_call_logs com tokens
↓
Client renderiza (ícone derivado do título)
```

### Fluxo de erro
- **400 por parâmetro reasoning:** retry 1× sem `reasoning_effort` (RF-007).
- **Timeout:** erro orientativo atual; com 120s a janela de conclusão sobe 4×.
- **Retry de validação:** prompt reenviado + instrução anexada ao fim (cache preservado, RF-006).

---

## 7. Casos Extremos

1. **Plano antigo com `icon`:** client usa o `icon` presente (compatibilidade retroativa).
2. **Exercício com título inesperado:** fallback BookOpen.
3. **`usage` ausente na resposta (alguns gateways):** colunas ficam `null` — sem crash.
4. **Instrumento não mapeado (`geral`):** bloco fixo de técnica é mantido (RF-005).
5. **Meta muito longa:** dinâmicos por último — meta longa não invalida cache dos estáticos.
6. **Gateway sem suporte a `reasoning_effort`:** retry sem o parâmetro, geração segue.
7. **Memória pedagógica com 50 itens:** truncada a 5 por lista.
8. **`cachedTokens` negativo/ausente:** gravado como null.
9. **Retry de contaminação:** anexo no fim — prefixo estático idêntico entre tentativas.
10. **Comparação antes/depois:** medições feitas SOMENTE por `ai_call_logs` (feature `plano_diario`, success=true).

---

## 8. Dados Envolvidos

### Alteração — `ai_call_logs` (migration idempotente 0007)
| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| inputTokens | integer | Não | `usage.prompt_tokens` / `usageMetadata.promptTokenCount` |
| outputTokens | integer | Não | `usage.completion_tokens` / `usageMetadata.candidatesTokenCount` |
| cachedTokens | integer | Não | `prompt_tokens_details.cached_tokens` / `cachedContentTokenCount` |

Sem novas tabelas; sem alteração em `daily_study_plans`.

---

## 9. Permissões e Segurança

- Nenhuma nova superfície pública; mudanças internas de prompt/telemetria.
- `usage` não contém PII; logs continuam sem segredos (RN-004 de PRD_PROMPTS_IA_CONSOLIDADOS).

---

## 10. Tratamento de Erros

| Situação | Resposta |
|---|---|
| 400 por `reasoning_effort` | Retry 1× sem o parâmetro; erro persistente → mensagem orientativa atual |
| `usage` indisponível | Telemetria com nulls; operação segue |
| Timeout em 120s | Mensagem atual ("A API não respondeu…") com código `timeout` |

---

## 11. Requisitos Não Funcionais

- **RNF-001 (Redução):** média de `outputTokens` por geração bem-sucedida ≤ 2.600; média de tokens totais ≤ 5.500 (medido em `ai_call_logs`, amostra ≥5 gerações pós-deploy).
- **RNF-002 (Qualidade):** 0 aumento na taxa de `validacao_retry`/falhas de validação vs. baseline atual.
- **RNF-003 (Compatibilidade):** `pnpm check` sem novos erros vs. baseline; suíte vitest verde.
- **RNF-004 (Latência):** tempo médio de geração cai ≥20% em provedor estável (mesmo modelo, antes/depois).

---

## 12. Critérios de Aceite

- **CA-001:** Dado o prompt otimizado, quando o plano é gerado, então o JSON de saída não contém a chave `icon` e o client exibe ícones corretos (derivados por título).
- **CA-002:** Dada uma geração bem-sucedida, quando consultado `ai_call_logs`, então `inputTokens` e `outputTokens` estão preenchidos (não-null) para provider groq e opencode.
- **CA-003:** Dado o prompt montado, quando inspecionado, então nenhum bloco dinâmico aparece antes dos blocos estáticos e a seção fixa de técnica está ausente para especialista mapeado.
- **CA-004:** Dado histórico com 10 aulas, quando o prompt é montado, então apenas 5 aulas e 5 eventos de timeline entram no prompt.
- **CA-005:** Dado modelo gpt-oss na Groq com `isJson=true`, quando a chamada é feita, então o corpo contém `reasoning_effort: "low"`; dado erro 400 citando o parâmetro, então há retry sem ele com sucesso.
- **CA-006:** Dado modelo opencode-go/glm-5.3-flash, quando o plano é gerado, então a chamada usa timeout de 120s (timeout anterior de 30s não dispara em geração que leve 30–120s).
- **CA-007:** Dado ≥5 gerações pós-deploy, quando comparadas ao baseline, então outputTokens médios caem ≥25% e a taxa de sucesso sobe ou se mantém.
- **CA-008:** Dado plano novo e plano antigo, quando abertos no client, então ambos renderizam 5 dias × 6 exercícios com ícones corretos.
- **CA-009:** Dado retry de contaminação, quando a 2ª tentativa é montada, então a correção está anexada ao fim (prefixo idêntico à 1ª tentativa).
- **CA-010:** Dado `pnpm check`/`pnpm test`/`pnpm build`, então 0 erros novos e suíte verde.

---

## 13. Riscos e Dependências

### Riscos
- **Qualidade pedagógica com points mais curtos:** mitigado por RN-001 (validadores) + amostragem manual de 3 planos pós-deploy.
- **Gateway rejeitar `reasoning_effort`:** retry sem o parâmetro (RF-007).
- **Cache inefetivo em algum provedor:** melhoria vira no-op (sem regressão).
- **Client de portal do aluno também usa `icon`:** verificar e aplicar mesma derivação se existir.

### Dependências
- `ai_call_logs` (implantada) para medição antes/depois.
- Suporte a prompt caching no Groq (gpt-oss) e OpenCode GLM — benéfico se presente, não obrigatório.
- Timeout parametrizável depende do wrapper `callGemini` atual (meta já existe).

---

## 14. Métricas de Sucesso

- outputTokens médios −25% (alvo ≤2.600); tokens totais ≤5.500.
- Tempo médio de geração −20% em provedor estável.
- 0 timeouts em gerações de 30–120s no OpenCode Go.
- Taxa de contaminação/validação igual ou melhor que baseline.

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Telemetria de tokens
- Migration 0007 (3 colunas idempotentes) + captura de `usage` nos 3 provedores + colunas no `aiTelemetry`.

### Fase 2 — Prompt
- Schema compacto (RF-003), reordenação static-first (RF-006), bloco condicionado (RF-005), histórico 5/5 + memória truncada (RF-004), instruções de concisão + sem `icon` (RF-001).

### Fase 3 — Client
- `ExerciseIcon` por título com fallback ao `icon` do JSON (RF-002), professor e portal.

### Fase 4 — Requisição
- `timeoutMs` via meta (RF-008) + `reasoning_effort` low com retry (RF-007).

### Fase 5 — Verificação
- Testes: schema compacto contém 6 blocos e 1 exemplo; sem `icon` no spec; ordem estático→dinâmico; timeout repassado.
- `pnpm check`/`pnpm test`/`pnpm build`; após deploy, coletar ≥5 gerações e comparar métricas (CA-007).
