# AGENTS.md

Instruções para agentes de IA trabalhando neste repositório **MusicPro**.
Siga OS comandos de verificação e as regras de segurança abaixo ANTES de declarar tarefa concluída.

## Comandos de verificação (sempre rodar após mudanças)

```bash
pnpm check    # typecheck completo (tsc --noEmit) — client + server + shared
pnpm test     # suíte vitest completa
pnpm build    # vite build + bundle esbuild do server (mais lento; rode após check e testes)
```

Quando os 3 passarem (ou não introduzirem erros novos vs. o baseline), a tarefa está pronta.

### Testes focados rápidos (server)

```bash
pnpm vitest run server/critical.regression.test.ts server/settings.test.ts server/BillingEngine.test.ts server/music.test.ts server/reminders.test.ts
```

## Baseline de erros TS (importante)

- Existem **33–41 erros TS únicos pré-existentes**, TODOS no client, capturados em `tsc_baseline.txt` (em `%TEMP%/opencode/`).
- Regra: uma mudança NÃO pode **adicionar** erros novos. Compare normalizando: `path | código | mensagem` (ignorando `(linha,col)`); erros relocados por split de arquivo contam como iguais.
- Se o `pnpm check` mostrar erro num arquivo que você NÃO tocou, verifique se ele já existia no baseline antes de "corrigir".

## Regras de segurança e operação

1. **`rg -r` é PERIGOSO**: em ripgrep, `-r` = substituição (no output com `-rn`; **in-place com `-rln` — destrói arquivos**). Para "recursivo" use só `-l`/`-n`/sem flags de arquivo. Ex.: `rg -l "padrão"` (nunca `-rln`).
2. **Nunca** `git checkout`/`git restore`/`commit`/`push` sem pedido explícito do usuário. Trabalhe no working tree.
3. **Não reordene/renomeie chaves do `appRouter`** (`server/routers/index.ts`). O client tipa contra `AppRouter` — mudar contrato força migração em massa.
4. **Não altere regras de negócio** em refactors: mova código com copy-paste fiel (mesmas classes de erro, mensagens, SQL).
5. **Não remova `ssh2`** (deploy) nem dependências sem `rg -l` confirmando refs fora de node_modules.
6. **Formatação de moeda**: use `client/src/lib/money.ts` (`formatBRL`/`parseBRL`). **Juros/multa**: `server/services/BillingEngine.ts`. Não reimplemente.
7. **Encoding**: evite `Set-Content -Encoding utf8` do PowerShell (adiciona BOM). Prefira ferramentas Node/WWrite para gravar TS. Se um arquivo ganhar BOM, remova (3 primeiros bytes `EF BB BF`).
8. **Testes flaky**: alguns testes falham por timeout em execução paralela; rode isolados antes de concluir que quebraram.
9. **Prefira editar arquivos existentes** — só crie novos arquivos quando o padrão existente exigir (ex.: nova tab → novo arquivo em `components/settings/`).

## Onde colocar cada coisa

- Nova procedure tRPC → router de domínio em `server/routers/*.ts` (nunca no barrel `server/routers/index.ts`).
- Lógica duplicada de server → `server/services/**` ou `server/routers/helpers.ts`.
- Novo componente de página → `components/{domínio}/` (settings, progresso, aulas, alunos...).
- Utilidade pura do client → `client/src/lib/*.ts`.
- Tipo derivado de banco → importar de `@shared/types` (re-exporta drizzle/schema) — não redefinir local.
- Documentação de estrutura → `ARCHITECTURE.md`. Mapa para IA → `AI_CONTEXT.md`. Diagnóstico histórico/checklist → `ARCHITECTURE_AUDIT.md` (não apagar).

## Novidades (What's New) — manter sempre

- **Ao lançar qualquer funcionalidade, adicione uma entrada no TOPO de `shared/releases.ts`** (mais recente primeiro): `version` única (recomendado `AAAA.MM.DD` ou semver), `date` (`YYYY-MM-DD`), `title`, `summary?` e `items[]` com `type` (`novo` | `melhoria` | `correcao`).
- O conteúdo é 100% automático (sem cadastro no banco). O app lê daí e mostra **badge no menu + modal ao acessar + página `/novidades`**. Só o estado "já vi" é persistido (`users.lastSeenReleaseVersion`).
- Não é preciso criar UI de cadastro nem mexer em banco para publicar novidades.