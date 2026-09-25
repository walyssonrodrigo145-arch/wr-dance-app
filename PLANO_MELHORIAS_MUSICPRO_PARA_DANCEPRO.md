# PLANO — Porte das Melhorias do MusicPro para o DancePro (últimos 4 dias)

**Base analisada:** repositório `wr-music-app-main` · commits de **21/09/2026 a 25/09/2026** (~35 commits)
**Alvo:** `wr-dance-app` (DancePro) · **Foco:** landing page + sistema, 100% adaptado para escola de dança
**Natureza deste documento:** plano + mini-PRD por iniciativa (nada foi implementado ainda)

---

## 1. Visão Geral

### O que foi analisado
Nos últimos 4 dias o MusicPro investiu em três frentes:

1. **Landing + SEO** (maior volume): páginas públicas pré-renderizadas, conteúdo estruturado (funcionalidades, segmentos, comparativos, blog, glossário), imagens webp, capa editável, logos de integrações/escolas, números reais, anúncio de indicação.
2. **Crescimento (Indique e Ganhe)**: motor completo de indicação com conversão por pagamento e crédito na fatura.
3. **Operação da escola**: migração assistida (aulas/mensalidades em lote+CSV), gestão de alunos na aula de turma, cobrança por boleto/link, editor de contratos em blocos, Meu Perfil do professor, boot loader/loading unificado, assinatura (fatura avulsa, simulador de preços).

### Situação do DancePro (baseline verificado)
| Item | DancePro hoje |
| --- | --- |
| Landing page | Existe (`LandingPage.tsx`, 1.437 linhas) — sem SEO/prerender, sem números automáticos, sem logos |
| Páginas públicas de SEO | **Não existem** (sem `shared/seo`, `SeoSite`, sitemap, JSON-LD) |
| Indique e Ganhe | **Não existe** |
| Migração assistida | Só importação de alunos por CSV (Fase 1) — sem mensalidades/aulas/turmas |
| Gestão de alunos na sessão de turma | **Não existe** (sessões geradas pela grade, sem add/remove pontual) |
| Envio de cobrança por boleto/link | Parcial (PIX/link por gateway) — sem escolha boleto×link no envio |
| Editor de contratos em blocos | Editor antigo (`ModelosContratoTab.tsx`, 332 linhas) |
| Meu Perfil do professor | Não existe (perfil via Configurações) |
| Boot loader/LoadingScreen | Não existe |
| Assinatura (fatura avulsa, simulador) | Parcial (`Assinatura.tsx` existe; simulador e fatura avulsa não) |
| Fluxo de dança (turma→aulas→chamada) | ✅ Fases 1 e 2 já implementadas (mais avançado que o MusicPro aqui) |

**Conclusão:** o DancePro está à frente no **fluxo pedagógico de dança**, mas atrás em **aquisição (landing/SEO/indicação)** e em **onboarding de escolas (migração)**. É exatamente onde estão os maiores ganhos de portabilidade.

---

## 2. Inventário do MusicPro (o que mudou e onde)

| Tema | Commits de referência | Arquivos-chave | Vale para dança? |
| --- | --- | --- | --- |
| SEO/Prerender + conteúdo | `521f4d54`, `02ea1844`, `e3aee201` | `shared/seo/*` (features, segments, comparisons, blog, glossary), `SeoSite.tsx`, `useSeo.ts`, `scripts/prerender.ts`, sitemap, `server/seo.test.ts` | ✅ **Alto** (adaptar conteúdo) |
| Landing premium | `b4cffc21`, `af924721`, `94e86c41` | `LandingPage.tsx`, `PaymentBrandLogos.tsx`, logos `client/public/logos/*` | ✅ Alto |
| Capa + mídia por funcionalidade | `e4b13d8e`, `d667499c`, `75b10c07` | `SeoMediaManager.tsx`, `prerender`, showcase/print frames | ✅ Alto |
| Logos das escolas na landing | `4e22f50d` | `SuperAdmin.tsx`, `superAdminRouter`, schema | ✅ Alto |
| Indique e Ganhe | `ffefff1c`, `d26ad97c`, `2e82a347`, `e5571771` | `ReferralEngine.ts` (1.229 linhas), `ReferralProgram/Admin/PublicReferralPage`, schema+migrations, testes | ✅ **Alto** |
| Migração assistida | `272c0936`, `5bff5bd1`, `559bbad0`, `6ecbe2de` | `Migracao.tsx` (1.169 linhas), `financeiroRouters` (+233), `lessonsRouters` (+317), testes | ✅ **Altíssimo** |
| Gerenciar alunos na aula de turma | `5be081dc` | `LessonDetailModal` (+167), `lessonsRouters` (+242), PRD, testes | ✅ Alto (sessões) |
| Cobrança boleto/link + mês vencimento | `ded38235` | `comunicacaoRouters` (+106), `financeiroRouters`, `whatsappRouting` | ✅ Alto |
| Contratos em blocos | `ded38235` | `components/contratos/ModelosContratoTab.tsx` (+554), schema | ✅ Médio/Alto |
| Meu Perfil do professor + busca mobile | `f70b96a1` | `Perfil.tsx` (+343), `AppHeader`, `Alunos.tsx`, `plataformaRouters` | ✅ Médio |
| Boot loader + LoadingScreen | `7494defd`, `f8…` | `LoadingScreen.tsx`, `index.html`, `App.tsx` | ✅ Médio |
| Assinatura (fatura avulsa, avisos, simulador) | `7d855bd7`, `2e82a347`, `2b13c06c`, `7125d913`, `939533dd` | `Assinatura.tsx`, `SubscriptionAlerts`, `PlanSimulator`, `shared/planPricing.ts` | ✅ Médio |
| Agendamento visível (prévia/confirmação/painel) | `616e512c` | `shared/schedulePreview.ts`, `NovoAluno.tsx` (+310), `financeiro/MensalidadesTab` | ✅ Alto (adaptar à grade) |
| Analytics/estudo (cronômetro, snapshots) | `d634a9c6`, `71f1e982`, `8ed21f29` | progresso/analytics | ⚪ Opcional (vira "Diário de ensaio") |
| CSP/SW/preload | `5e4cedef` | `index.html`, SW | ✅ Baixo (higiene técnica) |

---

## 3. Plano Priorizado (ondas)

### 🟢 ONDA 1 — Aquisição e entrada de escolas (maior ROI)

#### 1.1 Migração assistida de escola de dança (CSV + lote)
**Problema:** escola de dança que já opera em planilha/outro sistema não consegue entrar sem retrabalho: precisa recriar turmas, alunos, mensalidades em aberto e aulas.
**Objetivo:** onboarding completo em 1 sessão — turmas, alunos por turma, mensalidades e aulas futuras.
**Requisitos (adaptados):**
- RF-101 Importar **turmas** por CSV (nome, modalidade, nível, faixa etária, professor, sala, dias, horário, duração, capacidade) com prévia e conflitos.
- RF-102 Importar **alunos por turma** (complementa o CSV de alunos atual, agora com coluna Turma) → matrícula automática (vaga/fila).
- RF-103 Importar **mensalidades em aberto** com **saldo de meses** por aluno (aluno que já pagou até dez/2026 não deve ser cobrado de novo) — inclui "plano do aluno" (valor/vencimento/periodicidade).
- RF-104 Importar **aulas já agendadas** como sessões (ou marcar turmas com "gerar a partir de X").
- RF-105 Relatório final: criados/ignorados com motivo + download dos não importados.
**Regras:** dedupe por aluno+e-mail; nunca duplicar mês/ano; mensalidade importada entra como `pendente` (ou `pago` quando marcada como quitada); período de saldo bloqueia geração de cobranças até a data.
**Impacto:** `Migracao` nova (turmas/alunos/duas fases), `financeiroRouters` (lote), `lessonsRouters`/`TurmaScheduleService`. Reusa nosso import CSV existente.
**Esforço:** Grande (2 ciclos). **Dependência:** Fases 1/2 do fluxo de dança (✅ prontas).

#### 1.2 SEO + páginas públicas de dança
**Problema:** o DancePro não é encontrado no Google; a landing é uma página só.
**Objetivo:** presença orgânica para "sistema para escola de dança", "software de ballet", etc.
**Requisitos (adaptados):**
- RF-110 `shared/seo/*` com conteúdo de dança: **funcionalidades** (turmas/chamada/figurino/espetáculo/financeiro), **segmentos** (ballet, jazz, urbanas, salão, sapateado, contemporâneo, infantil, ritmos/fitness), **comparativos** (planilha, sistemas genéricos, sistema de academia), **blog** (rematrícula, espetáculo, captação, retenção de alunos), **glossário** (barra, centro, diagonal, sapatilha, ensaio geral, figurino).
- RF-111 Prerender + meta por rota + JSON-LD + sitemap + robots.
- RF-112 Imagens webp das modalidades com molduras (celular/notebook).
- RF-113 SEO por escola parceira (páginas "para [tipo de escola]").
**Esforço:** Grande (2 ciclos). **Risco:** conteúdo precisa ser escrito (posso redigir versões de dança).

#### 1.3 Landing premium (números reais, logos, capa editável, Indique e Ganhe teaser)
**Problema:** landing sem prova social e sem atualização automática.
**Requisitos:**
- RF-120 Números automáticos (escolas, alunos, modalidades, aulas geradas/mês).
- RF-121 Logos oficiais de pagamento (Asaas/MP/InfinitePay) + **logos das escolas parceiras** (Super Admin escolhe quais aparecem).
- RF-122 Capa do hero editável no Super Admin (upload) — fim do flash de capa estática.
- RF-123 Scrollspy + barra de progresso + "voltar ao topo"; seção "Desafio" (dores da escola de dança) e cards de **implantação/suporte/migração**.
- RF-124 Banner de avisos da assinatura e anúncio "Indique e Ganhe" na área logada.
**Esforço:** Médio (1 ciclo). **Dependência:** 1.2 (estrutura de mídia) e superadmin.

### 🟠 ONDA 2 — Crescimento e retenção

#### 2.1 Indique e Ganhe (programa de indicação)
**Problema:** crescimento depende de esforço manual; escolas satisfeitas não têm canal de indicação.
**Objetivo:** cada escola vira canal de aquisição com recompensa real.
**Requisitos (porte fiel, copy de dança):**
- RF-130 Landing pública de indicação (link/código por escola) + página "Indique e Ganhe" da escola.
- RF-131 Conversão por **pagamento confirmado** da escola indicada (anti-indicação fantasma).
- RF-132 Crédito na fatura da assinatura (ou meses grátis) + painel no Super Admin para regras/valores.
- RF-133 Antiabuso: autoindicação, e-mail/CNPJ repetido, limite por escola, expiração do código.
- RF-134 Anúncio na área logada 2x/dia + e-mail/WhatsApp de acompanhamento.
**Esforço:** Grande (1–2 ciclos; motor tem ~1.200 linhas + schema + testes). **Dependência:** planos pagos ativos.

#### 2.2 Gestão de alunos na sessão de turma
**Problema:** na sessão de hoje, incluir uma aluna nova (ou de reposição) e remover quem saiu exige mexer na turma.
**Requisitos:**
- RF-140 Adicionar aluno à **sessão atual ou próximas** (aulas avulsas dentro da turma, sem alterar a matrícula).
- RF-141 Remover aluno de sessões futuras (humano: "esta aula só" × "todas as próximas").
- RF-142 Impacto na chamada: aluno incluído aparece na lista; removido não aparece.
- RF-143 Auditoria: quem incluiu/removeu e quando.
**Esforço:** Médio (1 ciclo; já temos sessões + `lesson_attendance`).

#### 2.3 Agendamento visível (prévia e confirmação) no cadastro
**Problema:** ao matricular/agendar, o usuário não vê o que será criado.
**Requisitos (adaptados):**
- RF-150 Prévia no cadastro: "Turma X (ter/qui 18h) → serão geradas N aulas até <data> + M mensalidades".
- RF-151 Confirmação com resumo após salvar + painel de aulas no modal do aluno.
- RF-152 Datas/fuso corretos (não criar aula em dia sem grade; ajuste de dia do vencimento).
**Esforço:** Médio (1 ciclo). Reusa `previewLessons` + `schedulePreview`.

#### 2.4 Cobrança por boleto ou link + mês do vencimento no financeiro
**Requisitos:**
- RF-160 No envio da cobrança: escolher **boleto** ou **link** (Asaas/MP), com fallback PIX.
- RF-161 Mês de competência explícito no financeiro (evita "paguei dezembro e baixou novembro").
- RF-162 Mensagem pronta no WhatsApp/e-mail com valores atualizados (juros/desconto).
**Esforço:** Médio (1 ciclo). **Dependência:** gateways já integrados.

### 🟡 ONDA 3 — Polimento profissional

#### 3.1 Meu Perfil do professor + busca de alunos no mobile
- RF-170 Página "Meu Perfil" (foto, dados, troca de senha) para professores.
- RF-171 Busca de alunos visível no mobile + menu do professor ajustado.
**Esforço:** Pequeno (meio ciclo).

#### 3.2 Boot loader + loading unificado
- RF-180 `LoadingScreen` global antes do conteúdo e nas rotas; imagens com loading.
**Esforço:** Pequeno.

#### 3.3 Contratos em blocos (variáveis de dança)
- RF-190 Editor de modelos por blocos (arrastar/ordenar) com variáveis: aluno, responsável, modalidade, turma, figurino, espetáculo, autorização de imagem, valor/vencimento.
- RF-191 Prévia + regeneração em lote na rematrícula (assinafy já integrado).
**Esforço:** Médio/Grande.

#### 3.4 Assinatura: fatura avulsa + simulador + avisos
- RF-200 Card "Sua Fatura" exibindo fatura avulsa pendente/vencida do Asaas.
- RF-201 Simulador de preços público (por nº de alunos/modalidades) — útil quando os planos pagos voltarem.
- RF-202 Avisos de trial/fatura na área logada (`SubscriptionAlerts`).
**Esforço:** Médio.

#### 3.5 (Opcional) Diário de ensaio — adaptação do cronômetro de estudo
- RF-210 Cronômetro de treino confiável (wake lock) no plano diário do aluno, tempo por modalidade e histórico.
**Esforço:** Médio. **Decisão:** só se quiser gamificar estudo em casa.

---

## 4. Impactos Transversais

| Área | Impacto | Risco | Mitigação |
| --- | --- | --- | --- |
| Banco | Novas tabelas (indicação, mídia SEO, migração), colunas (saldo de meses, mês competência) | Migrações idempotentes já são padrão (`migrate.ts`) | Migração aditiva + testes |
| Permissões | Programas/indicação e mídia são admin/superadmin | Vazamento de dados | Guards server-side (padrão da última auditoria) |
| Financeiro | Importação de mensalidades e saldo de meses; crédito de indicação | Valores errados | Idempotência por aluno/mês/ano + relatório de importação |
| Landing/SEO | Prerender precisa servir HTML antes do static (Caddy) | Regressão de rota | Reaproveitar solução do MusicPro (já validada) + testes de SEO |
| Performance | Muitas imagens webp | Peso da landing | Pipeline `optimize-images` |

---

## 5. Riscos e Dependências

- **Conteúdo de dança** (SEO/blog/glossário): depende de redação — posso gerar a primeira versão e você revisa.
- **Indique e Ganhe** depende de **planos pagos** ativos (hoje só existe o plano parceiro a R$ 0). Sem planos pagos, o crédito na fatura não tem onde aplicar — decidir se o prêmio vira "meses grátis" ou crédito futuro.
- **Migração assistida** é o item com maior chance de dado sujo (planilhas variadas) — exige prévia + relatório (mesmo padrão do import de alunos).
- **Prerender** exige ajuste no Caddy da VPS (já temos o script de deploy e o MusicPro tem a receita pronta).

---

## 6. Métricas de Sucesso

- Migração: escola nova com 100 alunos/turmas/mensalidades importada em < 30 min, sem cobrança duplicada.
- SEO: primeiras páginas indexadas em 30 dias; cliques orgânicos crescendo (Search Console).
- Landing: visitante → cadastro (meta: +30% após números/logos/capa).
- Indicação: ≥ 15% dos novos cadastros com código de indicação.
- Retenção: rematrícula concluída em 1 tela (já pronto) + redução de inadimplência com boleto/link.

---

## 7. Ordem Recomendada

1. **1.1 Migração assistida** (destrava a entrada das primeiras escolas reais — maior ROI).
2. **1.3 Landing premium** (rápido, melhora conversão já).
3. **2.2 Gestão de alunos na sessão** (fecha o fluxo de dança que já começamos).
4. **2.3 Agendamento visível** (polimento do cadastro).
5. **1.2 SEO público** (médio prazo, colhe em 60–90 dias).
6. **2.4 Cobrança boleto/link** + **3.1 Perfil professor** + **3.2 Loading**.
7. **2.1 Indique e Ganhe** (quando houver plano pago definido).
8. **3.3/3.4/3.5** conforme prioridade de produto.

---

## 8. Próximo Passo Sugerido

**Status de execução (18/09/2026):**
- ✅ **1.1 Migração — Etapa 1 concluída**: importação de **turmas por CSV** (`turmas.importBatch` + modal em Turmas & Vagas) e **alunos já matriculados** (coluna "Turma"/Turma padrão no import existente), com vaga/fila/conflito e relatório. Núcleo único de matrícula extraído (`enrollStudentInTurmaCore`) — usado pelo cadastro, multi-turma e importação.
- ✅ **1.1 Migração — Etapa 2 concluída**: **mensalidades em aberto com saldo de meses** (`paymentDues.importBatch` + modal no Financeiro → Mensalidades) e **geração automática da agenda** (3 meses) no import de turmas.
- ✅ **1.3 Landing premium concluída**: números reais (`publicData.getPublicStats`), **logos oficiais** (Asaas/MP/InfinitePay), seção Desafio, cards de **Implantação/Migração/Suporte**, scrollspy + barra de progresso + voltar ao topo e **aviso de assinatura/trial** no painel do admin. (Capa do hero editável **já existia** via Super Admin → HeroSlides + HeroSlider.)
- ✅ **Indique e Ganhe incluído no escopo** (decisão do dono): será implementado com prêmio **configurável** (meses grátis/crédito), para funcionar mesmo antes da precificação definitiva.
- ⏭️ Próximas etapas: **2.2 Gestão de alunos na sessão** → **2.3 Agendamento visível** → **1.2 SEO público** → **2.1 Indique e Ganhe** → **2.4/3.x**.
