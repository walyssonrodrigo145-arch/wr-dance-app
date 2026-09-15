# PRD — Correções da Aba de Aulas, Visualização de PDFs e Zoom de Mídia

> Origem: Auditoria completa da aba de aulas + materiais do aluno (31/08/2026)
> Status: Aguardando aprovação para implementação

---

## 1. Visão Geral

### Problema
1. **Remarcação de aula falha silenciosamente** quando o professor tenta remarcar aula criada pelo admin: o sistema mostra "Aula remarcada com sucesso!" mas a data não muda no banco.
2. **Alunos não conseguem ver PDFs** enviados pelos professores: preview em branco, sem mensagem de erro, ou 403 após expiração de token. No app Android (Capacitor) o iframe de PDF não renderiza de forma alguma.
3. **Imagens e vídeos aparecem pequenos** no portal do aluno: o modal de preview não tem zoom, nem tela cheia, nem ampliação por gesto/scroll.

### Objetivo
- Garantir que remarcação (e mudança de status) funcione para admin E professores, com erro explícito quando não houver permissão.
- Garantir que todo PDF/material enviado pelo professor seja visualizável pelo aluno em navegador e app, com mensagens claras quando o arquivo não existir.
- Adicionar um visualizador (lightbox) com zoom para imagens e tela cheia para vídeos no portal do aluno.

### Contexto
- Arquivos enviados pela Biblioteca Musical (`progressRouters.upload` → `storagePut`) ficam em **armazenamento local** (`/uploads/music-library/...`) — não há credenciais Forge no ambiente.
- A rota `/uploads` exige cookie de sessão; iframes/players recebem URL temporária `/uploads-token/{token}` (token em memória, 30 min).
- Professores visualizam aulas criadas por admins via `students.professorId`, mas `lessons.updateStatus` só considera `lessons.userId`.

---

## 2. Usuários Envolvidos

- **Admin/escola**: agenda e remarca qualquer aula da organização.
- **Professor**: remarca/muda status de aulas dos próprios alunos (criadas por ele OU pelo admin).
- **Aluno**: visualiza materiais (PDF, imagem, vídeo, áudio) e remarca aula própria pelo portal.

---

## 3. Escopo

### Incluído
- Correção de permissão e detecção de falha em `lessons.updateStatus` (server + client).
- Correção do preview de materiais no portal do aluno (`student/Materiais.tsx`): `fileNotFound`, categoria `documento`, fallback por extensão `.pdf`.
- Substituição do token em memória por token assinado (HMAC, stateless) nas rotas `/uploads-token`.
- Tratamento de PDF em ambientes sem renderizador nativo (fallback "abrir em nova aba / baixar" com aviso).
- Lightbox com zoom para imagens + botão de tela cheia para vídeos no portal do aluno.
- Cancelamento de lembretes pendentes no `studentPortal.autoReschedule`.

### Fora do escopo
- Migração para storage externo (S3/Forge).
- Alteração do fluxo de agendamento recorrente (séries).
- Alteração de regras de conflito de agenda.
- Chat/mensagens.

---

## 4. Requisitos Funcionais

### RF-001 — Remarcar aula com permissão correta (correção)
**Descrição:** `lessons.updateStatus` deve atualizar a aula quando o usuário for admin da org, criador da aula, ou professor do aluno vinculado; e deve retornar erro explícito caso contrário.
**Atores:** admin, professor.
**Pré-condições:** aula existe na organização.
**Fluxo principal:**
1. Usuário aciona "Remarcar" no modal de detalhes e escolhe data/hora.
2. Client envia `{ id, status: 'remarcada', scheduledAt }`.
3. Server valida permissão (org + criador OU professor do aluno).
4. Server valida conflito de horário considerando o professor EFETIVO (criador OU professor do aluno), como já faz `lessons.update`.
5. Server atualiza e retorna `{ success: true, updated: true }`.
**Exceções:** sem permissão → erro "Aula não encontrada ou você não tem permissão" (toast de erro no client); conflito → erro de conflito existente.
**Dados:** `lessons.scheduledAt`, `lessons.status`, `reminders` (cancelamento dos pendentes).

### RF-002 — Feedback honesto de sucesso/falha no client
**Descrição:** A mutation `updateStatus` no client deve tratar resposta sem alteração real como erro; toast de sucesso só quando `updated: true`.
**Atores:** admin, professor.
**Exceções:** se o server retornar `updated: false`, exibir "Não foi possível remarcar: você não tem permissão sobre esta aula."

### RF-003 — Preview de materiais resiliente no portal do aluno
**Descrição:** O modal de preview (`student/Materiais.tsx`) deve:
1. Tratar `fileNotFound: true` com mensagem "Arquivo não encontrado no servidor. Solicite o reenvio ao professor." (estado vazio, sem iframe vazio).
2. Renderizar categoria `documento` com iframe (mesmo tratamento de PDF), e usar fallback por extensão `.pdf` no nome do arquivo quando a categoria vier inconsistente.
3. Exibir estado de erro quando `getFileUrl` falhar (com botão "Baixar" como alternativa).

### RF-004 — Token de arquivo stateless (HMAC)
**Descrição:** Substituir o `Map` em memória (`fileTokens.ts`) por token assinado HMAC-SHA256 (`relKey + exp`) usando segredo existente do ambiente (derivado de `JWT_SECRET`). A rota `/uploads-token` valida assinatura e expiração sem depender de memória do processo.
**Atores:** sistema.
**Exceções:** token expirado/inválido → 403 com JSON (comportamento atual preservado).

### RF-005 — Fallback de PDF sem renderizador
**Descrição:** No preview de PDF, detectar falha do iframe (timeout de carregamento) e oferecer banner com ações: "Abrir em nova aba" e "Baixar". Isso cobre Android WebView/Capacitor, que não renderizam PDF em iframe.
**Atores:** aluno.

### RF-006 — Lightbox com zoom (imagens) e tela cheia (vídeos)
**Descrição:** Adicionar mecanismo de ampliação no preview do portal do aluno:
1. Imagem: clique duplo/botão "Ampliar" alterna modo tela cheia (fixed inset-0, z máximo); zoom por scroll/wheel e por pinça (touch), pan por arraste; botões +/−/reset e percentual; fechar com ESC/X.
2. Vídeo: botão "Tela cheia" usando Fullscreen API sobre o container do player; controles nativos preservados.
3. O mesmo lightbox deve ser aplicado também à miniatura do card (clicar na imagem abre o zoom direto).

### RF-007 — autoReschedule cancela lembretes antigos
**Descrição:** Ao remarcar pelo portal do aluno, cancelar lembretes pendentes da aula (mesma lógica de `lessons.updateStatus`).

---

## 5. Regras de Negócio

### RN-001 — Permissão sobre a aula
**Regra:** Professor só altera aula se for criador (`lessons.userId`) OU professor efetivo do aluno (`students.professorId`); admin altera qualquer aula da organização.
**Exemplo válido:** Admin cria aula do aluno X (professora Maria). Maria remarcou → atualiza.
**Exemplo inválido:** Professor José (não é professor do aluno X) tenta remarcar → erro explícito.
**Consequência:** sem permissão, nenhuma linha é alterada e o server retorna erro (nunca `success: true`).

### RN-002 — Status após remarcação
**Regra:** `status: 'remarcada'` + nova data → aula volta a `agendada` e lembretes pendentes antigos são cancelados (mantém comportamento atual de `updateStatus`).

### RN-003 — Arquivo inexistente nunca renderiza vazio
**Regra:** Se o arquivo físico não existir (`fileNotFound`), o modal exibe estado vazio explicativo; iframe/img/video nunca recebem `src` vazio.

### RN-004 — Token temporário
**Regra:** URL de token expira em 30 min e é válida apenas para o `relKey` assinado; não permite path traversal (`../` bloqueado como hoje).

---

## 6. Fluxos

### Fluxo principal (remarcar — professor)
```text
Professor → Aba Aulas → clica aula → modal detalhes → Remarcar → data/hora → Salvar
→ client updateStatus → server valida permissão (criador OU prof. do aluno)
→ valida conflito (professor efetivo) → UPDATE → { success, updated: true }
→ toast "Aula remarcada com sucesso!" → lista invalidada com nova data
```

### Fluxo de erro (sem permissão)
```text
Server valida → falha → TRPCError FORBIDDEN "Aula não encontrada ou você não tem permissão"
→ client toast.error → aula permanece inalterada
```

### Fluxo principal (PDF do aluno)
```text
Aluno → Meus Materiais → Visualizar
→ getFileUrl: local? existsSync? → sim → token HMAC → iframe
→ não existe → fileNotFound → estado vazio com orientação
→ iframe falha (app Android) → banner "Abrir em nova aba / Baixar"
```

### Fluxo principal (ampliar mídia)
```text
Aluno → Material (imagem) → Visualizar → botão Ampliar/clique duplo
→ lightbox fullscreen → wheel/pinça para zoom, arraste para pan
→ X/ESC fecha → volta ao modal normal
```

---

## 7. Casos Extremos

- Professor marca "Concluída/Falta/Cancelada" em aula criada pelo admin (mesma correção de permissão).
- Duplo clique em "Salvar Horário" → mutation idempotente, botão desabilitado com `isPending`.
- Aula removida por outro usuário durante a remarcação → `updated: false` → erro amigável.
- Token expirado com modal aberto > 30 min e reload do iframe → 403 → banner de fallback com botão reabrir (nova chamada `getFileUrl`).
- Arquivo apagado do disco (rebuild sem volume) → `fileNotFound` → estado vazio.
- `category: 'documento'` (Word/Excel/txt) → agora renderiza no modal (iframe) e aparece no filtro "Apostilas".
- PDF com `fileType` incorreto mas extensão `.pdf` → fallback por nome.
- Imagem gigante (10MB) no lightbox → zoom por transform CSS, sem re-fetch; loading preservado.
- Vídeo em navegador sem Fullscreen API → botão oculto (feature detection).
- ESC fecha zoom antes do modal; ESC no modal fecha modal (ordem de camadas).
- Horário de verão/virada de mês: data construída com `new Date(yyyy-MM-ddTHH:mm)` local (comportamento atual mantido).
- Dois usuários remarcando a mesma aula: última escrita vence (comportamento atual; fora do escopo lock otimista).

---

## 8. Dados Envolvidos

| Entidade | Uso | Observação |
|---|---|---|
| `lessons` | `scheduledAt`, `status` | nenhuma migração |
| `reminders` | cancelamento de pendentes | idem `updateStatus` atual |
| `studentFiles` | leitura `fileUrl`, `fileName`, `category` | nenhuma migração |
| `fileTokenStore` (memória) | substituído por token HMAC | sem tabela nova |

Sem alterações de schema.

---

## 9. Permissões e Segurança

- Matriz: admin = tudo na org; professor = aulas dos seus alunos (criadas por ele ou não); aluno = somente `studentPortal.*` nos próprios arquivos (já filtrado por `studentId` + `organizationId` em `getFileUrl`).
- Token HMAC: assinatura cobre `relKey + exp`; validação de path traversal mantida (`absPath.startsWith(uploadsDir)`).
- Nenhum stack trace/segredo exposto em erros; mensagens genéricas + log seguro (`debugLog`).
- CSP: `frameSrc 'self'` já permite `/uploads-token`; sem mudanças.

---

## 10. Tratamento de Erros

**Esperados (mensagem clara):**
- "Aula não encontrada ou você não tem permissão." (FORBIDDEN)
- "Conflito de horário: o professor já tem aula agendada para este período." (existente)
- "Arquivo não encontrado no servidor. Solicite o reenvio ao professor."
- "Não foi possível carregar o arquivo. Tente abrir em nova aba ou baixar."

**Internos:** falhas de disco/DB → log + mensagem genérica "Ocorreu um erro... Tente novamente."

---

## 11. Requisitos Não Funcionais

- **RNF-001 Performance:** token HMAC elimina lookup em memória; lightbox usa transform CSS (60fps), sem re-decodificação.
- **RNF-002 Segurança:** tokens não-falsificáveis; permissão validada no server (nunca só no client).
- **RNF-003 Responsividade:** lightbox funcional em touch (pinça/pan) e desktop (wheel/botões).
- **RNF-004 Compatibilidade:** fallback de PDF para WebView sem plugin (Android/Capacitor).
- **RNF-005 Logs:** falhas de permissão e arquivo ausente registrados via `debugLog`.

---

## 12. Critérios de Aceite

### CA-001 — Professor remarcA aula criada pelo admin
**Dado que** sou professor do aluno X e o admin criou a aula, **quando** remarcar pelo modal de detalhes, **então** a data muda no banco, a lista atualiza e o toast de sucesso aparece.

### CA-002 — Sem permissão retorna erro
**Dado que** não tenho vínculo com a aula, **quando** chamar `updateStatus`, **então** recebo erro "Aula não encontrada ou você não tem permissão" (nunca sucesso silencioso).

### CA-003 — Conflito validado para professor
**Dado que** sou professor e existe outra aula agendada (criada pelo admin) no mesmo período do meu aluno, **quando** remarcar para esse período, **então** recebo erro de conflito.

### CA-004 — PDF inexistente
**Dado que** o arquivo físico foi perdido, **quando** eu abrir o material, **então** vejo "Arquivo não encontrado no servidor..." (sem tela em branco).

### CA-005 — PDF de categoria 'documento'
**Dado que** um arquivo foi salvo com categoria `documento`, **quando** eu abrir, **então** o preview renderiza (iframe) ou oferece abrir/baixar.

### CA-006 — PDF no app Android
**Dado que** estou no app Android (WebView sem PDF viewer), **quando** o iframe não carregar, **então** aparece banner com "Abrir em nova aba" e "Baixar".

### CA-007 — Zoom de imagem
**Dado que** abro uma imagem no portal do aluno, **quando** clicar em Ampliar (ou duplo clique), **então** a imagem ocupa a tela inteira e posso dar zoom (wheel/pinça) e pan; ESC/X fecha.

### CA-008 — Vídeo em tela cheia
**Dado que** abro um vídeo, **quando** clicar em Tela cheia, **então** o player ocupa a tela com controles nativos.

### CA-009 — Remarcação pelo aluno cancela lembretes
**Dado que** o aluno remarcou pelo portal, **quando** a aula muda de data, **então** lembretes pendentes da data antiga ficam `cancelado`.

### CA-010 — Regressão
**Dado que** as correções foram aplicadas, **quando** rodar `pnpm check`, `pnpm test` e `pnpm build`, **então** não há erros novos vs. baseline (33–41 erros TS pré-existentes no client).

---

## 13. Riscos e Dependências

**Riscos:**
- Token HMAC precisa do mesmo segredo em todas as instâncias (usa `JWT_SECRET` já presente).
- Lightbox precisa de z-index acima dos modais existentes (usar portal + `z-[100]`).
- Mudança no retorno de `updateStatus` (`updated`) é aditiva — clients antigos ignoram.

**Dependências:**
- Nenhuma dependência nova (Fullscreen API nativa; touch events nativos).
- `JWT_SECRET` presente no ambiente (confirmado no `.env`).

---

## 14. Métricas de Sucesso

- 0 relatos de "remarcação não salva" após deploy.
- 0 previews em branco de PDF no portal do aluno.
- Adoção do zoom: alunos abrem materiais em tela cheia (evento observável via logs futuros — opcional).

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Server (remarcação)
1. `lessonsRouters.updateStatus`: buscar aula com permissão `or(userId, students.professorId)` (como `update`); lançar FORBIDDEN se não encontrada; incluir professor efetivo no conflito; retornar `{ success, updated }` com `rowCount` do update.

### Fase 2 — Server (arquivos)
2. `fileTokens.ts`: token HMAC stateless (`relKey.exp.sig` base64url) + validação; manter 30 min.
3. `portalRouters.autoReschedule`: cancelar lembretes pendentes.

### Fase 3 — Client (portal do aluno)
4. `student/Materiais.tsx`: tratar `fileNotFound`; renderizar `documento`; fallback `.pdf`; estados de erro; lightbox com zoom (novo componente `components/student/MediaLightbox.tsx`); tela cheia de vídeo.

### Fase 4 — Client (aba de aulas)
5. `Aulas.tsx` (`updateStatusMutation`): tratar `updated === false` como erro com toast.

### Fase 5 — Verificação
6. `pnpm check` (sem novos erros vs. baseline), `pnpm test` (focados: `server/critical.regression.test.ts`, `server/music.test.ts`), `pnpm build`.
7. Teste manual: remarcar aula como professor (aula criada por admin); abrir PDF/imagem/vídeo no portal do aluno.
