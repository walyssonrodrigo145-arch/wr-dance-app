// 📣 Changelog versionado do DancePro (FONTE ÚNICA das "Novidades").
//
// COMO MANTER (100% automático — sem cadastro no sistema):
// Ao lançar uma funcionalidade, adicione um objeto `Release` NO TOPO da lista
// (mais recente primeiro). Use `version` única (recomendado: AAAA.MM.DD ou semver)
// e `date` no formato YYYY-MM-DD. O app lê daqui e mostra badge + modal + histórico.
//
// Nada precisa ser cadastrado no banco: o conteúdo é este arquivo; só o estado
// de "já vi" é persistido por usuário (users.lastSeenReleaseVersion).

export type ReleaseItemType = "novo" | "melhoria" | "correcao";

export interface ReleaseItem {
  type: ReleaseItemType;
  title: string;
  description?: string;
}

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  summary?: string;
  items: ReleaseItem[];
}

export const RELEASES: Release[] = [
  {
    version: "2026.10.02.2",
    date: "2026-10-02",
    title: "Eventos & Espetáculos renovados",
    summary: "Página de eventos com KPIs, filtros rápidos, cartões ricos com foto e métricas, publicação em 1 clique e duplicação de eventos.",
    items: [
      { type: "novo", title: "Painel de eventos com KPIs", description: "Total de eventos (com novos no mês), próximos 30 dias, realizados (% de conclusão) e total de participações." },
      { type: "novo", title: "Filtros rápidos com contadores", description: "Chips: Todos, Próximos, Realizados, Rascunhos e Cancelados — mais busca por nome, local ou descrição e filtro por tipo." },
      { type: "novo", title: "Cartões de evento completos", description: "Foto do evento com selo de data colorido por status, local, horário, tags e métricas ao vivo: participações, ingressos vendidos e receita." },
      { type: "novo", title: "Publicar em 1 clique", description: "Rascunhos ganham botão \"Publicar evento\" (avisando as participantes) e eventos realizados ganham \"Ver relatório\" e \"Duplicar evento\"." },
      { type: "novo", title: "Duplicar evento", description: "Recria o evento como rascunho mantendo programa, coreografias e convidando as mesmas alunas — ideal para temporadas seguintes." },
      { type: "melhoria", title: "Foto no evento", description: "Novo campo de URL de foto no cadastro do evento, exibido no cartão da lista." },
    ],
  },
  {
    version: "2026.10.02.1",
    date: "2026-10-02",
    title: "Loja completa: pedidos, promoções e analytics",
    summary: "A Loja virou um mini-ERP: KPIs de desempenho, fluxo de pedidos com separação/entrega, promoções, categorias e visão em grade ou tabela.",
    items: [
      { type: "novo", title: "Painel da Loja com KPIs", description: "Total de produtos, estoque crítico, vendas e faturamento do mês (com comparativo) e pedidos pendentes — tudo na entrada da Loja." },
      { type: "novo", title: "Fluxo completo de pedidos", description: "Nova aba Pedidos: pendente → em separação → pago → entregue, com busca por código, produto ou aluna e bloqueio de transições inválidas." },
      { type: "novo", title: "Código do pedido (VDA-XXXX)", description: "Cada venda ganha um número de pedido, visível para a escola e para a aluna no portal." },
      { type: "novo", title: "Promoções", description: "Defina preço promocional por produto — passa a ser o preço praticado nas vendas, com badge \"Promo\" e preço antigo riscado." },
      { type: "novo", title: "Visão em Grade ou Tabela", description: "Produtos com foto, SKU, categoria, estado do estoque (crítico/baixo/normal) e status, com busca, filtros, ordenação e paginação." },
      { type: "novo", title: "Categorias e rankings", description: "Breakdown por categoria com ticket médio, vendas recentes e produtos mais vendidos em tempo real." },
      { type: "melhoria", title: "Portal do aluno com entrega", description: "As compras da aluna no portal passam a mostrar o código do pedido e o status de entrega." },
    ],
  },
  {
    version: "2026.10.01.24",
    date: "2026-10-01",
    title: "Responsável pela escola nos contratos",
    summary: "Cadastre o responsável legal (nome, RG e CPF) em Configurações → Escola e o contrato qualifica a CONTRATADA automaticamente.",
    items: [
      { type: "novo", title: "Responsável pela Escola em Configurações", description: "Nome, RG e CPF do responsável legal, com validação de CPF — usados na qualificação da escola (CONTRATADA) nos contratos." },
      { type: "novo", title: "Variáveis do responsável no contrato", description: "\"Nome do Responsável pela Escola\", \"RG do Responsável pela Escola\" e \"CPF do Responsável pela Escola\" (também em versão técnica) disponíveis no editor de modelos." },
    ],
  },
  {
    version: "2026.10.01.23",
    date: "2026-10-01",
    title: "Endereço completo da aluna + variáveis de contrato simples",
    summary: "Cadastro da aluna agora tem endereço completo (CEP com busca automática) e o contrato preenche endereço, RG, prazos e valores — inclusive com variáveis de nome simples, no estilo Emusys.",
    items: [
      { type: "novo", title: "Endereço completo no cadastro da aluna", description: "CEP (busca automática em ViaCEP/BrasilAPI), logradouro, número, complemento, bairro, cidade e UF — usados no contrato e na nota fiscal. Fica no cadastro/edição da aluna (Alunos → Nova aluna / Editar)." },
      { type: "novo", title: "Contrato preenchido com endereço completo", description: "O endereço da aluna e da escola entram montados por extenso no contrato (logradouro, número, complemento, bairro, cidade/UF e CEP), no lugar de um texto solto." },
      { type: "novo", title: "Variáveis simples no editor de modelos", description: "Além das variáveis técnicas, agora existem atalhos com nome amigável (ex.: \"Nome do Contratante\", \"Cidade da Escola\", \"Data de hoje Por Extenso\", \"Valor da Parcela sem Desconto\", \"Meses de aula\", \"Quantidade de Aulas no Total\") — clique e insira." },
      { type: "novo", title: "Prazos e valores automáticos", description: "O contrato calcula meses de aula, quantidade de aulas no total (pelo plano da aluna), data inicial/final por extenso, número do contrato de adesão e data de hoje." },
      { type: "melhoria", title: "Busca de variáveis e grupos", description: "As variáveis do contrato ficaram organizadas por assunto (aluna, endereço, responsável, escola, valores/prazos) com campo de busca." },
    ],
  },
  {
    version: "2026.10.01.22",
    date: "2026-10-01",
    title: "Agenda mobile nova + Calendário Escolar",
    summary: "Agenda por mês, semana e dia no celular (com filtros e swipe) e o calendário de feriados/recessos/eventos aparece direto na agenda de toda a equipe.",
    items: [
      { type: "novo", title: "Agenda mobile repaginada", description: "No celular: visão por Mês/Semana/Dia, deslizar para trocar o período, pontinhos por status, filtros (professor, sala, modalidade, tipo e status) e botão flutuante para agendar no dia." },
      { type: "novo", title: "Calendário Escolar em Configurações → Calendário", description: "Marque férias, recessos, feriados (nacionais com um clique) e eventos da escola — ensaio geral, festival, apresentação. Aparece na agenda com aviso no dia." },
      { type: "novo", title: "Aula \"Em andamento\"", description: "A aula que está acontecendo agora ganha destaque na agenda e no modal do dia, com selo pulsante." },
      { type: "melhoria", title: "Filtro de professor corrigido na agenda", description: "O filtro por professor agora casa com o usuário correto (antes podia não filtrar)." },
    ],
  },
  {
    version: "2026.10.01.21",
    date: "2026-10-01",
    title: "Financeiro, aulas e portal mais confiáveis",
    summary: "Pagamento confirmado agora dispara todos os efeitos (recibo, lembretes, NFS-e), o professor vê as turmas dele, o aluno vê as presenças e o CRM parou de mostrar dados de exemplo.",
    items: [
      { type: "correcao", title: "Pagamento confirmado completo em todos os canais", description: "Webhooks (Asaas/Mercado Pago/InfinitePay) e o comprovante por IA agora cancelam lembretes de cobrança, salvam o recibo e emitem a NFS-e automática — e o comprovante cancela o link do gateway para ninguém pagar duas vezes." },
      { type: "correcao", title: "Professor vê as cobranças e as aulas das turmas dele", description: "Administradores operam qualquer fatura da escola; professores enxergam as dos seus alunos. As sessões de turma entram no dashboard do professor." },
      { type: "novo", title: "Aluno vê a frequência das turmas", description: "A chamada de turma aparece no portal: presenças recentes na Agenda e nos números do início (aulas feitas/frequência)." },
      { type: "correcao", title: "Um único jeito de fazer chamada", description: "Aula de turma só é marcada na Chamada da turma (por aluna) — acabou a duplicidade entre agenda e chamada; cancelar série cancela os lembretes." },
      { type: "correcao", title: "Excluir turma não deixa aula fantasma", description: "Sessões futuras são canceladas junto com a turma e exceções/presenças são limpas." },
      { type: "novo", title: "Loja pode cobrar junto com a mensalidade", description: "Vendas da Loja no modo \"junto com a mensalidade\" somam o valor na fatura aberta do aluno." },
      { type: "correcao", title: "CRM e Painel Comercial com dados reais", description: "Follow-ups, metas, propostas, performance e origens agora vêm dos seus leads de verdade (antes mostravam exemplos fixos). Relatórios exportam CSV de verdade." },
      { type: "correcao", title: "Super Admin e cupons", description: "Trial do Super Admin não bloqueia mais a escola, excluir escola cancela a assinatura no Asaas e limpa todos os dados, e cupons aplicam desconto real no checkout." },
      { type: "melhoria", title: "Fiscal em dia", description: "CNPJ validado de verdade, contagem real de notas emitidas e status do certificado honesto (gerenciado na Focus NFe)." },
    ],
  },
  {
    version: "2026.10.01.20",
    date: "2026-10-01",
    title: "Eventos & Espetáculos: convites, programa e confirmações",
    summary: "O evento agora avisa os participantes, traz o programa para o portal do aluno e o elenco da coreografia entra no evento com um clique.",
    items: [
      { type: "novo", title: "Convite e avisos automáticos", description: "Ao adicionar alunos ao evento (ou vincular uma coreografia), eles recebem o convite no portal e no WhatsApp (quando a escola usa o disparo automático). Confirmou? A escola é avisada. Cancelou o evento? Todos são avisados." },
      { type: "novo", title: "Importar elenco da coreografia", description: "Vincular uma coreografia já traz os alunos do elenco automaticamente — acabou o evento com \"0 alunos\". Há também o botão \"Importar elenco\" para trazer todos de uma vez." },
      { type: "novo", title: "Programa no portal do aluno", description: "O aluno vê a ordem das coreografias do evento na tela de Eventos e o próximo evento aparece direto no início do portal." },
      { type: "melhoria", title: "Reordenar o programa e ver detalhes", description: "Setas para subir/descer coreografias na ordem de apresentação, contagem de confirmados, endereço, horário de término e descrição visíveis no evento." },
      { type: "correcao", title: "Venda de figurino bloqueada em evento cancelado", description: "Se o evento for cancelado, a Loja impede novas vendas vinculadas a ele." },
    ],
  },
  {
    version: "2026.10.01.19",
    date: "2026-10-01",
    title: "Segurança reforçada em todo o sistema",
    summary: "Auditoria completa de permissões: ações administrativas agora são restritas de verdade no servidor, chaves de integração nunca chegam ao navegador e os pagamentos por webhook ficaram à prova de falha.",
    items: [
      { type: "correcao", title: "Permissões reforçadas no servidor", description: "Alunos e professores não conseguem mais executar ações administrativas (financeiro, comunicados, contratos, salas, planos) por chamadas diretas à API — inclusive quando o botão está escondido na tela." },
      { type: "correcao", title: "Suas chaves de integração ficaram invisíveis no navegador", description: "Chaves de Asaas, Mercado Pago, InfinitePay, IA e WhatsApp não são mais enviadas para o navegador. A tela indica \"configurada\" e você só digita uma nova chave se quiser trocar." },
      { type: "correcao", title: "Pagamento via InfinitePay nunca mais se perde", description: "Se a InfinitePay demorar para confirmar, o sistema tenta de novo automaticamente em vez de descartar a notificação — a baixa da mensalidade não fica presa." },
      { type: "correcao", title: "Notificações em tempo real protegidas", description: "O aviso de \"pagamento recebido\" em tempo real só chega para os administradores da própria escola." },
      { type: "correcao", title: "E-mail do perfil protegido", description: "Não é mais possível trocar o e-mail do perfil por um e-mail reservado ou já usado por outra conta." },
    ],
  },
  {
    version: "2026.09.29.18",
    date: "2026-09-29",
    title: "Logo DancePro em todo o sistema",
    summary: "A marca oficial do DancePro (o D com a bailarina) agora é a logo padrão do menu, do portal e dos ícones do app — mesmo quando a escola ainda não enviou a própria logo.",
    items: [
      { type: "correcao", title: "Logo padrão DancePro no menu e no portal", description: "O menu lateral (admin e aluno) e a tela de carregamento exibiam a marca antiga de ondas musicais. Agora mostram a logo oficial do DancePro quando a escola não tem logo própria." },
      { type: "correcao", title: "Ícone do app instalável (PWA) e favicon DancePro", description: "O ícone na tela inicial do celular, o favicon da aba e o badge de notificação agora usam a marca DancePro." },
      { type: "melhoria", title: "Cor do app instalado no azul da marca", description: "A barra do app instalado (PWA) passa a usar o azul DancePro no lugar do rosa antigo." },
    ],
  },
  {
    version: "2026.09.18.17",
    date: "2026-09-18",
    title: "Simulador de preço: quantas alunas tem a sua escola?",
    summary: "Na seção de preços da landing, a escola arrasta o número de alunas e vê na hora o plano ideal, o total com excedentes e quando vale uma proposta sob medida.",
    items: [
      { type: "novo", title: "Simulador interativo na landing", description: "Slider (ou digitar) do número de alunas ativas mostra: plano recomendado, total mensal calculado com excedentes a R$ 1,49/aluna e todos os planos com o valor para aquele tamanho de escola." },
      { type: "novo", title: "Proposta sob medida automática", description: "Acima de 1.200 alunas (limite do Dance Pro 1000 + excedentes), o simulador avisa e abre o WhatsApp da equipe para montar o plano personalizado." },
      { type: "melhoria", title: "Preços sempre vindos do sistema", description: "O simulador lê os planos do banco (Super Admin → Planos): mudou o preço ou o limite, o simulador acompanha na hora." },
    ],
  },
  {
    version: "2026.09.18.16",
    date: "2026-09-18",
    title: "Contratos em blocos: monte o modelo cláusula por cláusula",
    summary: "O editor de modelos de contrato agora é visual: título, cláusulas, assinaturas e local/data em blocos, com variáveis clicáveis e prévia — tudo pensado para escola de dança.",
    items: [
      { type: "novo", title: "Editor de contrato em blocos", description: "Adicione blocos de Título, Cláusula, Parágrafo, Contratante, Contratada, Assinaturas e Local/Data — reordene, duplique e remova. Cada bloco tem título e texto." },
      { type: "novo", title: "Variáveis clicáveis (com Modalidade)", description: "Clique para inserir dados da escola, responsável, aluna, modalidade, mensalidade, vencimento e datas do contrato. A variável {{modalidade}} agora é aceita no texto final." },
      { type: "melhoria", title: "Prévia com variáveis destacadas", description: "Veja o contrato final com as variáveis marcadas antes de salvar; e use Auto-identificar para transformar um texto colado em blocos." },
      { type: "melhoria", title: "Modelos antigos viram blocos ao abrir", description: "Os modelos que a escola já tinha são convertidos automaticamente no editor — nada quebra e o contrato continua sendo gerado igual." },
    ],
  },
  {
    version: "2026.09.18.15",
    date: "2026-09-18",
    title: "Site de dança no Google: funcionalidades, modalidades, blog e glossário",
    summary: "O DancePro agora tem páginas públicas indexáveis para cada tipo de escola de dança, comparativos, blog e glossário — com sitemap e robots para o Google encontrar.",
    items: [
      { type: "novo", title: "Páginas por funcionalidade", description: "Turmas e chamada, financeiro com PIX, rematrícula, figurino/espetáculo, portal da aluna e IA pedagógica — cada uma com página própria e link direto no site." },
      { type: "novo", title: "Páginas por modalidade", description: "Ballet, jazz, danças urbanas, dança de salão, sapateado, contemporâneo, dança infantil e ritmos/fitness — com a dor de cada tipo de escola e como o DancePro resolve." },
      { type: "novo", title: "Comparativos, blog e glossário", description: "DancePro x planilha e x sistema de academia; artigos sobre rematrícula, inadimplência e espetáculo; glossário com 20 termos da dança (barra, centro, diagonal, ensaio geral...)." },
      { type: "melhoria", title: "Sitemap e robots automáticos", description: "O endereço /sitemap.xml lista todas as páginas públicas e o /robots.txt aponta para ele — tudo gerado do próprio conteúdo, sem manutenção." },
      { type: "melhoria", title: "Título, descrição e link canônico por página", description: "Cada página pública define seu título e descrição para o Google e redes sociais, com dados estruturados (JSON-LD)." },
    ],
  },
  {
    version: "2026.09.18.14",
    date: "2026-09-18",
    title: "Indique e Ganhe + boleto na cobrança + ajustes da auditoria",
    summary: "A escola agora tem link de indicação para ganhar meses grátis, boleto junto de PIX/cartão no Asaas, e a inclusão de aluna extra na aula valida conflito de horário.",
    items: [
      { type: "novo", title: "Programa Indique e Ganhe", description: "Painel na escola com link/código exclusivo, botão de copiar e compartilhar no WhatsApp, lista das indicações (aguardando, convertida, prêmio aplicado) e contador de meses ganhos. Página pública de convite com cadastro da escola indicada." },
      { type: "novo", title: "Boleto na cobrança Asaas", description: "Além de PIX e cartão, agora dá para gerar boleto direto na cobrança da mensalidade." },
      { type: "correcao", title: "Aluna extra não entra em choque de horário", description: "Incluir uma aluna como extra na aula agora valida se ela já tem turma/matrícula no mesmo dia e horário (achado M1 da auditoria)." },
      { type: "melhoria", title: "Fatura avulsa confirmada na tela de Assinatura", description: "O card Sua Fatura já mostra a cobrança pendente/vencida (inclusive avulsa gerada pela equipe), com link para pagar." },
    ],
  },
  {
    version: "2026.09.18.13",
    date: "2026-09-18",
    title: "Meu Perfil do professor e carregamento sem tela branca",
    summary: "Professores e administradores ganharam uma página de perfil própria (foto, contato, PIX e senha) e o sistema abre com uma animação de carregamento em vez do flash branco.",
    items: [
      { type: "novo", title: "Meu Perfil (professor/admin)", description: "Página com foto (upload), nome, e-mail, telefone, chave PIX e apresentação. A troca de senha agora pede a senha atual para confirmar." },
      { type: "melhoria", title: "Acesso pelo menu do usuário", description: "O atalho Meu Perfil saiu de Configurações e abre a página dedicada (alunos continuam com o perfil do portal)." },
      { type: "melhoria", title: "Boot loader + loading unificado", description: "O app abre com a marca DancePro e um indicador de carregamento — sem mais tela branca antes do conteúdo; o mesmo visual vale para todas as rotas." },
    ],
  },
  {
    version: "2026.09.18.12",
    date: "2026-09-18",
    title: "Aula de turma: incluir e remover aluno na sessão + prévia no cadastro",
    summary: "A chamada ficou completa: dá para incluir uma aluna extra (reposição/visitante) só naquela aula ou nas próximas, e remover quem não participa — sem mexer na matrícula.",
    items: [
      { type: "novo", title: "Incluir aluno extra na aula", description: "Na chamada, o botão Adicionar à aula busca alunas fora da turma e inclui como Extra — para reposição, experimental ou visitante — só naquela aula ou nesta e nas próximas." },
      { type: "novo", title: "Remover aluno da aula", description: "Aluna da turma pode ser removida apenas daquela aula (a matrícula continua); aluna extra pode sair só da aula ou de todas as próximas. Com quem incluiu/removeu registrado." },
      { type: "novo", title: "Prévia ao salvar o cadastro", description: "Ao selecionar turmas no cadastro, o sistema mostra o que será criado: grade de cada turma, estimativa de aulas até o fim do período e quantas mensalidades serão geradas." },
    ],
  },
  {
    version: "2026.09.18.11",
    date: "2026-09-18",
    title: "Landing premium: números reais, pagamentos integrados e implantação",
    summary: "A página inicial agora mostra prova real, os pagamentos que a escola já usa e como a migração funciona — com navegação guiada e atalho para voltar ao topo.",
    items: [
      { type: "novo", title: "Números reais da plataforma", description: "A faixa de credibilidade mostra escolas, alunos, modalidades e aulas no mês direto da base (aparece quando a escola cresce)." },
      { type: "novo", title: "Logos oficiais dos pagamentos", description: "Asaas, Mercado Pago e InfinitePay aparecem na landing — os mesmos gateways que a escola já pode conectar." },
      { type: "novo", title: "Seção “Sua escola não foi feita para viver em planilha”", description: "As dores do dia a dia (chamada, mensalidade, figurino) com a solução do DancePro ao lado." },
      { type: "novo", title: "Implantação, migração e suporte", description: "Cards explicando a migração assistida por CSV, o checklist “Escola pronta em 10 minutos” e o suporte no WhatsApp." },
      { type: "melhoria", title: "Navegação guiada na landing", description: "Menu com destaque da seção atual (scrollspy), barra de progresso no topo e botão de voltar ao topo." },
      { type: "novo", title: "Aviso de assinatura no painel", description: "Administradores veem aviso quando o teste está terminando ou a fatura está pendente, com atalho para a tela de assinatura — sem bloquear o acesso." },
    ],
  },
  {
    version: "2026.09.18.10",
    date: "2026-09-18",
    title: "Migração de escola — Etapa 2: mensalidades em aberto com saldo de meses",
    summary: "Importe o financeiro da escola que está chegando: cada aluno com seu valor, vencimento e até quando já pagou — o sistema lança só o que está em aberto.",
    items: [
      { type: "novo", title: "Importar mensalidades com \"Pago até\"", description: "No Financeiro → Mensalidades, o botão Importar aceita CSV (Aluno; Valor; Vencimento; Pago até MM/AAAA). O sistema cria as cobranças do mês seguinte ao pago até o mês atual, sem duplicar nada e já atualizando valor/vencimento do cadastro." },
      { type: "novo", title: "Migração de turmas gera a agenda junto", description: "Ao importar turmas, você pode marcar para gerar automaticamente as aulas dos próximos 3 meses — a escola fica pronta em um passo." },
      { type: "melhoria", title: "Relatório claro da migração", description: "Ao final, a tela mostra quantos meses foram criados e quais alunos ficaram sem mudança (já quitados ou já lançados)." },
    ],
  },
  {
    version: "2026.09.18.9",
    date: "2026-09-18",
    title: "Migração de escola — Etapa 1: importar turmas e alunos já matriculados",
    summary: "Para escolas de dança que estão chegando de planilha ou outro sistema: crie a grade de turmas por CSV e importe os alunos já matriculados em cada turma.",
    items: [
      { type: "novo", title: "Importar turmas por CSV", description: "Em Turmas & Vagas, o botão Importar CSV cria a grade de uma vez (modalidade, professor, sala, dias, horário, duração, capacidade, faixa etária, turno e nível) com prévia, validação de nomes e relatório. Depois, o botão Gerar aulas cria as sessões do período." },
      { type: "novo", title: "Importar alunos já matriculados na turma", description: "No import de alunos, escolha uma Turma padrão para o lote ou use a coluna Turma no CSV. A matrícula respeita vaga, lista de espera e conflito de horário, com relatório do que ficou pendente." },
      { type: "melhoria", title: "Matrícula em massa consistente", description: "Toda matrícula em lote passa a usar a mesma regra do cadastro individual (vaga → ativa; lotada → fila; choque de horário bloqueado)." },
    ],
  },
  {
    version: "2026.09.18.8",
    date: "2026-09-18",
    title: "Checkout de plano sem cobrança não dá mais erro",
    summary: "Planos com valor R$ 0,00 (ex.: parceiro/ilimitado) não chamam mais o Asaas com valor inválido — o sistema orienta em vez de falhar.",
    items: [
      { type: "correcao", title: "Assinatura com valor zero bloqueada com aviso", description: "Ao tentar gerar pagamento de um plano sem cobrança, o sistema explica que não há valor a pagar (antes o Asaas retornava 'O parâmetro value deve ser informado')." },
      { type: "correcao", title: "Trocar/reativar para plano sem cobrança funciona", description: "Mudar para um plano gratuito aplica o plano na hora e encerra a assinatura antiga no Asaas, sem gerar cobrança." },
      { type: "correcao", title: "Sincronização protege contra valor inválido", description: "A atualização automática de assinatura ignora planos sem cobrança, evitando erros silenciosos no Asaas." },
    ],
  },
  {
    version: "2026.09.18.7",
    date: "2026-09-18",
    title: "Fluxo de dança — Fase 2: multi-turma, rematrícula e reposição de turma",
    summary: "O aluno agora entra em várias turmas pelo cadastro, a escola renova o período em lote e a falta em turma gera crédito de reposição por aluno.",
    items: [
      { type: "novo", title: "Aluno em várias turmas no cadastro", description: "No cadastro/edição, selecione quantas turmas quiser (ex.: Ballet + Jazz) com vagas em tempo real; sem vaga entra na lista de espera e choque de horário é avisado antes de salvar (bloqueado no servidor)." },
      { type: "novo", title: "Rematrícula do período", description: "Botão Rematrícula em Turmas & Vagas: escolha o período (3/6/12 meses), marque quem renova e o sistema gera as mensalidades do novo ciclo e as aulas da grade. Opcionalmente, quem não renovar é desativado e libera a vaga para a fila." },
      { type: "novo", title: "Reposição de falta em turma", description: "A falta em aula de turma gera crédito de reposição por aluno (com o motivo da escola), sem afetar os demais alunos da turma." },
      { type: "melhoria", title: "Modalidade agora é filtro, não eixo", description: "A lista de turmas aparece mesmo sem modalidade escolhida e turmas de outras modalidades já matriculadas continuam mantidas." },
    ],
  },
  {
    version: "2026.09.18.6",
    date: "2026-09-18",
    title: "Fluxo de dança: a grade da turma vira agenda (Fase 1)",
    summary: "A turma agora gera as aulas do período com 1 clique — mesmo sem alunos — e a chamada sai direto da lista de matriculados.",
    items: [
      { type: "novo", title: "Gerar aulas da turma pela grade", description: "No card da turma, o botão de calendário gera as aulas do período (1, 3, 6 ou 12 meses) a partir dos dias e horário da grade. A prévia mostra quantas serão criadas, quantas já existem e conflitos de sala/professor antes de confirmar." },
      { type: "novo", title: "Chamada da turma", description: "O botão de chamada abre a aula do dia com os alunos matriculados na turma: marque Presente, Ausente ou Justificado (ou 'Todos presentes') e salve — a presença fica registrada por aluno." },
      { type: "novo", title: "Cancelar aulas futuras", description: "Ao mudar a grade ou encerrar um período, é possível cancelar as aulas futuras ainda agendadas da turma, preservando o histórico do que já aconteceu." },
      { type: "melhoria", title: "Aluno vê as aulas das suas turmas no portal", description: "A agenda e o histórico do portal do aluno passam a incluir as sessões das turmas em que ele está matriculado, além das aulas particulares." },
      { type: "melhoria", title: "Professor vê as aulas das suas turmas no painel", description: "As próximas aulas do professor agora incluem as sessões de turma que ele conduz." },
    ],
  },
  {
    version: "2026.09.18.5",
    date: "2026-09-18",
    title: "Financeiro e integridade blindados: folha, bolsas, webhooks e exclusões",
    summary: "Segunda onda da auditoria pré-lançamento: corrigimos os itens residuais de folha, bolsa, webhooks, exclusões e consistência de indicadores.",
    items: [
      { type: "correcao", title: "Webhooks conferem valor e origem do pagamento", description: "Asaas e Mercado Pago agora validam referência e valor recebido (sinalizam pagamento abaixo do valor) e ignoram eventos repetidos. Estorno limpa a data de pagamento." },
      { type: "correcao", title: "Excluir cadastro não deixa mais pontas soltas", description: "Excluir aluno limpa turmas, eventos, rankings, avaliações, saúde e NPS; excluir professor limpa folha/regras e reatribui turmas e aulas — sem registros órfãos." },
      { type: "correcao", title: "Mensalidades sem cobrança indevida", description: "Aluno inativo não gera mensalidade, duplicidade é checada por escola inteira e a taxa de matrícula é lançada mesmo quando o mês já existe." },
      { type: "correcao", title: "Folha de professores mais fiel", description: "Sem regra própria, aplica a regra PADRÃO da escola; recalcular não apaga mais bônus/descontos manuais." },
      { type: "correcao", title: "Bolsa em atraso não subcobra mais", description: "O complemento de 'valor cheio' é controlado por fatura de origem e o valor já corrigido não é sobrescrito ao gerar link/baixa; o cache do cálculo é invalidado a cada edição." },
      { type: "correcao", title: "Indicadores consistentes", description: "Receita do mês = recebido no mês (igual ao 'Recebido Hoje'), check-ins contam leituras reais de QR e o histórico de alunos por mês não distorce meses passados." },
      { type: "correcao", title: "Projeção de 6 meses sem inflar", description: "Despesas recorrentes contam uma vez (não uma por mês gerado) e planos anuais/semestrais entram na receita mensal proporcionalizados." },
      { type: "novo", title: "Matrícula online aparece no Financeiro", description: "A 1ª mensalidade + taxa pagas no ato da matrícula online agora viram lançamento pago no Financeiro, entrando nos relatórios e no caixa." },
      { type: "correcao", title: "Links de cobrança com valor atualizado", description: "Cobranças geradas em lote e pelo portal do aluno passam a cobrar o valor atual (com juros/multa/desconto) em vez do valor antigo." },
      { type: "melhoria", title: "Limpeza de atalhos e textos", description: "Notas Fiscais ganharam item no menu, notificações de treino abrem a ficha certa do aluno, e botões/atalhos sem função foram removidos." },
    ],
  },
  {
    version: "2026.09.18.4",
    date: "2026-09-18",
    title: "Blindagem pré-lançamento: permissões, isolamento entre escolas e financeiro",
    summary: "Auditoria completa antes do lançamento: fechamos acessos indevidos no servidor, reforçamos o isolamento entre escolas e corrigimos efeitos da baixa de mensalidade.",
    items: [
      { type: "correcao", title: "Permissões validadas no servidor", description: "CRM, folha de pagamento, notas fiscais, integrações (pagamento, WhatsApp, IA), chatbot, base de conhecimento da IA e contratos agora exigem administrador no servidor — antes a proteção existia só no menu." },
      { type: "correcao", title: "Isolamento entre escolas reforçado", description: "NFS-e, cálculo de fatura, comprovantes enviados, contratos e dados do portal do aluno passam a filtrar pela escola do usuário — nenhuma escola vê dado de outra." },
      { type: "correcao", title: "Baixa de mensalidade pela edição agora completa", description: "Dar baixa editando a mensalidade cancela o link de pagamento ainda aberto (Asaas/MP/InfinitePay), cancela lembretes de cobrança e dispara a NFS-e automática — igual à baixa normal." },
      { type: "correcao", title: "Comprovante por IA não aceita valor menor", description: "O portal só confirma o pagamento quando o valor do comprovante cobre a mensalidade, e nunca rebaixa uma fatura já paga." },
      { type: "correcao", title: "Telas de CRM e Analytics só para quem pode", description: "A tela do CRM (admin) e o painel de Analytics (super admin) não abrem mais para outros perfis, mesmo por URL direta." },
      { type: "correcao", title: "Importação de alunos com permissão e cadastro protegidos", description: "Criar e importar alunos exige admin ou professor com permissão de editar alunos; dados fiscais e vínculos validados por escola." },
      { type: "correcao", title: "Sem cobrança duplicada por duplo clique", description: "Gerar PIX/boleto/cartão duas vezes na mesma mensalidade (clique duplo ou duas abas) agora é bloqueado com aviso para aguardar — evita dois links de pagamento ativos para a mesma fatura." },
    ],
  },
  {
    version: "2026.09.18.3",
    date: "2026-09-18",
    title: "Importação de alunos sem travar no professor",
    summary: "O professor responsável deixou de ser obrigatório na importação: sem escolher ninguém, os alunos entram no seu nome — igual ao cadastro individual.",
    items: [
      { type: "correcao", title: "Botão Importar sempre disponível", description: "Antes o botão ficava cinza até escolher um professor. Agora, sem professor selecionado, os alunos são importados com você como responsável (mesma regra do cadastro individual)." },
    ],
  },
  {
    version: "2026.09.18.2",
    date: "2026-09-18",
    title: "Importação de alunos: prévia responsiva no celular",
    summary: "A prévia da importação foi ajustada para telas pequenas: cartões empilhados no celular, grade compacta no computador — sem mais tabela cortada.",
    items: [
      { type: "correcao", title: "Modal de importação sem corte lateral", description: "A prévia não estoura mais a largura do modal: no celular cada aluno vira um cartão com nome, telefone, nascimento e e-mail; no desktop permanece a grade compacta." },
      { type: "melhoria", title: "Rodapé da prévia reorganizado", description: "O aviso sobre mensalidade zerada e os botões Cancelar/Importar agora ficam empilhados, sem texto espremido." },
    ],
  },
  {
    version: "2026.09.18.1",
    date: "2026-09-18",
    title: "Importação de alunos turbinada: prévia, modelo e relatório",
    summary: "Importar a carteira ficou à prova de planilha: aceita o arquivo exportado do DancePro e do Excel, mostra prévia editável com avisos por linha e um relatório do que ficou de fora.",
    items: [
      { type: "novo", title: "Prévia editável antes de importar", description: "Cada linha aparece com nome, telefone, e-mail, nascimento e status (pronto/aviso/erro). Dá para corrigir, remover, marcar/desmarcar e paginar antes de confirmar." },
      { type: "novo", title: "Reimporta o CSV exportado do sistema", description: "O arquivo do botão Exportar CSV (Excel/Sheets) agora é reconhecido pelo cabeçalho, sem depender da ordem das colunas — e o parser entende aspas, ponto-e-vírgula e BOM do Excel." },
      { type: "novo", title: "Deduplicação assistida", description: "E-mails já cadastrados e telefones repetidos são sinalizados na prévia. Telefone é aviso (irmãos compartilham); e-mail dá para importar sem o campo." },
      { type: "novo", title: "Modelo e relatório de importação", description: "Baixe um modelo pronto de CSV e, ao final, veja os não importados com o motivo — com download em .csv." },
      { type: "correcao", title: "Importação com permissão verificada", description: "Só administradores e professores com a permissão 'Editar dados dos alunos' podem importar — validado também no servidor, não só no botão." },
    ],
  },
  {
    version: "2026.09.18",
    date: "2026-09-18",
    title: "Escola no ar em 10 minutos: checklist, importação de alunos e Atenção Hoje",
    summary: "O painel agora guia a configuração da escola, importa alunos em massa por CSV e mostra em um só lugar o que precisa da sua atenção hoje.",
    items: [
      { type: "novo", title: "Checklist 'Escola pronta em 10 minutos'", description: "Card no painel com 6 passos calculados dos seus dados reais (dados da escola, modalidades, salas, turmas, professores e alunos). Cada passo abre direto a tela correspondente e o progresso é automático." },
      { type: "novo", title: "Importar alunos por CSV", description: "Na tela de Alunos, o botão Importar CSV aceita arquivo ou texto colado (Nome; Telefone; E-mail; Nascimento — opcionais), com professor e modalidade padrão. Os alunos entram como ativos com mensalidade zerada para ajustar depois." },
      { type: "novo", title: "Card 'Atenção hoje'", description: "Central de pendências do painel: pagamentos atrasados (com total em aberto), alunos na lista de espera e eventos próximos com autorização de imagem/participação pendente." },
      { type: "melhoria", title: "Adeus cifras e metrônomo", description: "As telas de coreografias não mostram mais abas, campos e badges de cifra — só vídeo/trilha e marcação de aprendida — e o componente de metrônomo foi removido do sistema." },
    ],
  },
  {
    version: "2026.09.17",
    date: "2026-09-17",
    title: "100% Dança: IA pedagógica, automações e identidade",
    summary: "O sistema deixou de 'parecer' de música: a IA agora é especialista em cada modalidade de dança, as mensagens automáticas falam a língua da dança e toda a identidade (e-mails, relatórios, salas) está DancePro.",
    items: [
      { type: "novo", title: "IA especialista por modalidade de dança", description: "O Plano Diário agora é gerado por especialistas em Ballet, Jazz, Danças Urbanas, Dança de Salão, Sapateado, Contemporâneo, Kids e Fitness — com terminologia, aquecimento e segurança corretos para cada técnica." },
      { type: "melhoria", title: "Plano diário com 'Musicalidade' e sem metrônomo", description: "O bloco 'Conceito Musical' virou 'Musicalidade' (tempo, contagem e expressão) e o sistema não pede mais BPM/metrônomo nos treinos de dança." },
      { type: "melhoria", title: "Mensagens e robô WhatsApp de dança", description: "Lembretes, aniversários, cobranças e o menu do robô agora falam de aulas de dança — e os links usam o endereço correto da plataforma." },
      { type: "melhoria", title: "CRM voltado para dança", description: "Leads e funil usam 'Modalidade' no lugar de instrumento e textos de captação para aulas de dança." },
      { type: "melhoria", title: "Identidade DancePro de ponta a ponta", description: "E-mails de verificação/recuperação, cabeçalho de relatórios exportados, salas (Sala de ensaio · Espelhos, Barra, Tablado) e descrição da NFS-e agora são de dança." },
      { type: "correcao", title: "Botão de metrônomo morto removido", description: "O portal do aluno não mostra mais o botão de metrônomo desativado nos exercícios do plano diário." },
      { type: "correcao", title: "Landing com estado vazio de planos", description: "Sem planos ativos, a página inicial mostra um convite para falar com a gente em vez de uma seção vazia." },
    ],
  },
  {
    version: "2026.09.16.7",
    date: "2026-09-16",
    title: "Saldo das contas de pagamento no Financeiro",
    summary: "Veja na hora quanto há na conta onde o checkout recebe — Asaas e Mercado Pago — direto no topo do Financeiro.",
    items: [
      { type: "novo", title: "Card Saldo nos gateways", description: "O Financeiro mostra o saldo disponível da conta Asaas (finance/balance) e do Mercado Pago, com botão de atualizar e horário da última consulta." },
      { type: "melhoria", title: "Transparência por gateway", description: "Quando um gateway não está conectado ou a consulta falha, o card explica (não configurado / indisponível). A InfinitePay não possui API pública de saldo — o card indica que ela oferece apenas conciliação." },
    ],
  },
  {
    version: "2026.09.16.6",
    date: "2026-09-16",
    title: "PIX na hora na Loja e Vendas da Loja no Financeiro",
    summary: "Gere o PIX copia-e-cola da venda e receba na hora — com Asaas, Mercado Pago ou InfinitePay — e acompanhe tudo na nova aba Vendas da Loja do Financeiro, entrando no saldo líquido.",
    items: [
      { type: "novo", title: "Cobrar a venda com PIX na hora", description: "Na aba Vendas da Loja, clique em Cobrar e gere o PIX copia e cola (com QR Code) para o aluno pagar na hora — pelos três gateways: Asaas, Mercado Pago e InfinitePay." },
      { type: "novo", title: "Chave PIX como alternativa", description: "Sem gateway conectado, a Loja gera o PIX copia e cola direto da chave PIX da escola (baixa manual)." },
      { type: "novo", title: "Baixa automática do pagamento", description: "Quando o PIX cai, o sistema marca a venda como paga sozinho (Asaas, Mercado Pago e InfinitePay) e avisa a escola." },
      { type: "novo", title: "Aba Vendas da Loja no Financeiro", description: "Tudo que é vendido entra automaticamente: total vendido, recebido e a receber do mês. As vendas pagas já somam no Saldo Geral Líquido." },
    ],
  },
  {
    version: "2026.09.16.5",
    date: "2026-09-16",
    title: "Venda direta na Loja e regras de venda configuráveis",
    summary: "A Loja agora vende (não só empresta) com estoque, desconto e pagamento, e a escola define as regras de venda em Configurações → Loja.",
    items: [
      { type: "novo", title: "Vender direto na Loja", description: "Botão Vender em cada produto e no topo da Loja: escolha o aluno, a quantidade, o desconto (se liberado) e a forma de pagamento. Estoque e total calculados na hora." },
      { type: "novo", title: "Aba Vendas na Loja", description: "Todas as vendas em um só lugar, com filtro de status, marcação de pago e cancelamento (cancelar devolve a peça ao estoque)." },
      { type: "novo", title: "Regras de venda (Configurações → Loja)", description: "Ligue/desligue: vender na Loja, vender no evento, pagar junto da mensalidade, cobrança avulsa, venda sob encomenda, vender só para aluno ativo e desconto máximo. O sistema aplica as regras em toda venda." },
      { type: "melhoria", title: "Venda sob encomenda", description: "Quando o estoque acaba, a venda pode ser registrada como sob encomenda (se a regra permitir) e fica sinalizada na lista." },
    ],
  },
  {
    version: "2026.09.16.4",
    date: "2026-09-16",
    title: "Loja do figurino dentro do evento",
    summary: "Cada evento agora tem a própria loja: venda figurinos do acervo para os participantes, com quantidade, estoque em tempo real e controle de pagamento.",
    items: [
      { type: "novo", title: "Loja do evento", description: "Dentro do evento, ofereça os produtos vendáveis da Loja para os participantes — com quantidade maior que 1 e estoque atualizado automaticamente." },
      { type: "novo", title: "Preço de venda na Loja", description: "Na Loja, cada produto ganhou preço de venda e a opção 'disponível para venda' (o que é só empréstimo fica fora da loja)." },
      { type: "melhoria", title: "Controle das vendas", description: "Acompanhe as vendas do evento com status (pendente, paga, cancelada), forma de pagamento (junto da mensalidade ou cobrança avulsa) e total vendido." },
      { type: "melhoria", title: "Minhas compras no portal", description: "O aluno vê no portal as compras feitas na Loja (inclusive as do evento) com status e valor." },
    ],
  },
  {
    version: "2026.09.16.3",
    date: "2026-09-16",
    title: "Turmas por faixa etária e turno, múltiplos planos e Loja",
    summary: "Turmas com idade recomendada e turnos personalizáveis, bloqueio de choque de horário do aluno, mais de um plano por aluno (individual + turma) e a aba Figurinos virou Loja.",
    items: [
      { type: "novo", title: "Turma por faixa etária", description: "Defina idade mínima e máxima na turma (ex.: 6 a 9 anos) e o sistema alerta no cadastro quando o aluno está fora da faixa." },
      { type: "novo", title: "Turnos personalizáveis", description: "Em Configurações → Escola, monte os turnos da sua escola (Manhã, Tarde, Noite…) e use-os nas turmas e matrículas." },
      { type: "novo", title: "Sem choque de horário do aluno", description: "O sistema bloqueia matricular o mesmo aluno em duas turmas/matrículas no mesmo dia e horário." },
      { type: "novo", title: "Mais de um plano ao mesmo tempo", description: "No cadastro do aluno, adicione matrículas extras (ex.: Ballet 2x + Jazz 1x + Aula Particular), com valor mensal somado automaticamente à mensalidade." },
      { type: "melhoria", title: "Aula individual + aula em turma", description: "Cada matrícula adicional pode ser em turma, individual ou online — permitindo as duas modalidades juntas." },
      { type: "melhoria", title: "Trazer alunos para o evento por filtro", description: "No evento, adicione participantes por turma, modalidade ou coreografia, com seleção em massa e aviso de quem já está no evento." },
      { type: "melhoria", title: "Aba Figurinos agora é Loja", description: "Menu da escola e do aluno renomeados para Loja — a base para venda de produtos e figurinos." },
    ],
  },
  {
    version: "2026.09.16.2",
    date: "2026-09-16",
    title: "Turma no cadastro do aluno e Rankings com linguagem de dança",
    summary: "Cadastre o aluno já escolhendo a turma da modalidade dele (com lista de espera automática) e o módulo de Rankings agora fala a língua da dança.",
    items: [
      { type: "novo", title: "Turma no cadastro do aluno", description: "Ao escolher a modalidade, aparecem só as turmas daquela dança, com vagas em tempo real. Turma lotada? O aluno entra automaticamente na lista de espera — e sobe sozinho quando abrir vaga." },
      { type: "melhoria", title: "Trocar ou remover turma pela edição", description: "No cadastro do aluno também é possível ver a turma atual, trocar de turma (libera a vaga e promove a fila) ou deixar 'Sem turma' para definir depois." },
      { type: "melhoria", title: "Rankings com linguagem de dança", description: "Critérios agora são Frequência, Metas, Ensaios em casa, Evolução técnica e Desafios — e a participação passa a ser 'Por modalidade', sem termos de escola de música." },
      { type: "melhoria", title: "Desafios de dança", description: "Exemplos e textos dos desafios atualizados: performance em vídeo da coreografia, quiz de passos e metas de ensaio (sem referências a instrumentos)." },
    ],
  },
  {
    version: "2026.09.16.1",
    date: "2026-09-16",
    title: "Menu do Portal do Aluno por categorias",
    summary: "O menu do aluno ficou compacto: agora tem as mesmas repartições com accordion do painel da escola, em vez de uma lista corrida e extensa.",
    items: [
      { type: "melhoria", title: "Menu organizado em repartições", description: "PRINCIPAL, MEU PROGRESSO, DANÇA & PALCO, RELACIONAMENTO, FINANCEIRO e CONTA — clique na categoria para abrir ou recolher, e a categoria da página atual abre automaticamente." },
      { type: "melhoria", title: "Preferência salva", description: "O aluno abre e fecha as categorias e o sistema lembra da próxima vez, igual ao menu da escola." },
    ],
  },
  {
    version: "2026.09.15.3",
    date: "2026-09-15",
    title: "Coreografias, Eventos, Figurinos, Turmas e mais",
    summary: "O DancePro agora cobre a operação completa de palco: coreografias com elenco, eventos/espetáculos com autorização de imagem, acervo de figurinos com empréstimos, turmas com vagas e lista de espera, saúde do bailarino e pesquisa de satisfação (NPS).",
    items: [
      { type: "novo", title: "Coreografias com elenco", description: "Cadastre cada coreografia com modalidade, nível, formação (solo/duo/grupo), trilha, vídeo de marcação do YouTube e escale os alunos. Acompanhe o % de domínio de cada bailarino. O aluno vê suas coreografias no portal." },
      { type: "novo", title: "Eventos & Espetáculos", description: "Organize recitais, festivais, competições e workshops: programa com ordem de apresentação, participantes e controle de autorização de imagem/participação (recomendado para menores). O aluno confirma presença pelo portal." },
      { type: "novo", title: "Figurinos & Estoque", description: "Acervo de figurinos com tipo, tamanho, cor, estado e custo. Empréstimo por aluno/coreografia com data de devolução, alerta de atrasados e disponibilidade em tempo real. O aluno vê os figurinos em sua posse." },
      { type: "novo", title: "Turmas & Vagas com lista de espera", description: "Turmas fixas com grade semanal (dias + horário), capacidade e fila de espera. Quando uma vaga abre, o próximo da fila é promovido automaticamente. O aluno acompanha suas turmas no portal." },
      { type: "novo", title: "Saúde & Condicionamento Físico", description: "Nas abas do Progresso do aluno: avaliações periódicas com peso, altura, flexibilidade, condicionamento e histórico de lesões/restrições." },
      { type: "novo", title: "Satisfação (NPS)", description: "O aluno responde de 0 a 10 pelo portal (com comentário opcional) e a escola acompanha o NPS, promotores/detratores e respostas — também é possível registrar respostas recebidas por WhatsApp ou presencialmente." },
      { type: "novo", title: "Mensagens no Portal do Aluno", description: "O aluno agora conversa diretamente com seu professor pela aba Mensagens, respeitando as permissões do portal." },
      { type: "correcao", title: "Menu do professor respeita permissões", description: "O menu lateral e a barra mobile agora ocultam as páginas que o professor não tem permissão de acessar (antes o item aparecia e só a página bloqueava)." },
      { type: "correcao", title: "Notas Fiscais acessíveis", description: "A tela de NFS-e (Focus NFe) aparecia apenas internamente — agora há a rota /notas-fiscais e as abas Salas & Tablados e Notas Fiscais em Configurações." },
      { type: "correcao", title: "Recuperação de senha por e-mail", description: "O botão 'Esqueceu?' agora funciona: o usuário informa o e-mail e recebe um link seguro (1h) para criar uma nova senha." },
      { type: "correcao", title: "Robustez dos novos módulos", description: "Editar coreografia/figurino não apaga mais descrição/foto, datas aparecem sem deslocamento de fuso, o slider de domínio não dispara requisições em excesso e o NPS tem limite anti-spam." },
    ],
  },
  {
    version: "2026.09.15.2",
    date: "2026-09-15",
    title: "✨ Especialização de Dança & Correção de Relatórios",
    summary: "Separação inteligente das abas de relatórios e especialização de metas corporais e coreográficas.",
    items: [
      { type: "correcao", title: "Separação das Abas de Relatórios", description: "Corrigida duplicidade das abas de Modalidades: agora divididas em 'Formato de Aula' (Individual vs Turma) e 'Estilos & Ritmos' (Ballet, Jazz, Forró, etc.)." },
      { type: "melhoria", title: "Metas de Dança & Objetivos Corporais", description: "Metas no painel de progresso agora focam em postura, piruetas, flexibilidade e domínio coreográfico." },
      { type: "melhoria", title: "Dashboard do Aluno 100% Dança", description: "Remoção de referências residuais e foco total em trilhas, coreografias e constância nos ensaios." },
    ],
  },
  {
    version: "2026.09.15",
    date: "2026-09-15",
    title: "🩰 DancePro — Rebranding Completo",
    summary: "O sistema foi totalmente adaptado para escolas de dança. Todos os textos, ícones e termos foram atualizados.",
    items: [
      { type: "novo", title: "Rebranding completo para DancePro", description: "Todos os textos, ícones e referências de escola de música foram substituídos pelo contexto de escola de dança." },
      { type: "melhoria", title: "Modalidades substituem Instrumentos", description: "Labels, filtros, relatórios e rankings agora usam 'Modalidade' no lugar de 'Instrumento'." },
      { type: "melhoria", title: "Portal do Aluno adaptado para dança", description: "Metrônomo e BPM removidos. Repertório virou Coreografias. Instrumento Principal virou Modalidade Principal." },
      { type: "melhoria", title: "Salas adaptadas para escola de dança", description: "Placeholders das salas agora refletem tablados, barras, espelhos e equipamentos de dança." },
      { type: "melhoria", title: "Leads e Marketing atualizados", description: "Modalidades de dança (Ballet, Forró, Zumba, Hip-Hop, Salsa) substituem instrumentos musicais nos funis de vendas." },
    ],
  },
  {
    version: "2026.09.16",
    date: "2026-09-15",
    title: "DancePro — Sistema de Gestão para Escolas e Estúdios de Dança",
    summary: "Plataforma especializada e desacoplada com vocabulário de ritmos, modalidades, coreografias, salas de ensaio e tablados.",
    items: [
      { type: "novo", title: "Modalidades & Ritmos", description: "Cadastro e gestão de modalidades de dança (Ballet, Jazz, Hip Hop, Dança de Salão, Dança Urbana, etc.) com cores e ícones na grade." },
      { type: "novo", title: "Salas de Ensaio & Tablados", description: "Espaços adaptados com controle de capacidade por m², salas com espelho, piso flutuante e relatórios de ocupação." },
      { type: "melhoria", title: "Portal do Aluno e Vocabulário", description: "Terminologia 100% voltada a dança: trilhas sonoras, desafios coreográficos e acompanhamento da evolução corporal e técnica." },
    ],
  },
  {
    version: "2026.09.15.1",
    date: "2026-09-15",
    title: "Renovação pelo portal e avaliações de professores",
    summary: "Aluno renova o contrato com 1 toque (vigência pelo plano) e pode avaliar seu professor — nota sigilosa para a administração.",
    items: [
      { type: "novo", title: "Renovar contrato pelo portal", description: "No portal do aluno, quando o contrato está perto do fim aparece o botão 'Renovar contrato' — o novo contrato já sai com a duração e o valor do plano cadastrado, sem trabalho manual para o professor." },
      { type: "novo", title: "Avalie seu professor", description: "De tempos em tempos o portal convida você a dar uma nota de 1 a 5 (com comentário opcional) ao seu professor. Sua avaliação é sigilosa: apenas a administração da escola tem acesso." },
      { type: "novo", title: "Relatório e ranking para a escola", description: "No painel do administrador (Professores → Avaliações): relatório completo com filtros e ranking dos professores, do melhor ao pior, para decisões de gestão." },
    ],
  },
  {
    version: "2026.09.14.2",
    date: "2026-09-14",
    title: "Nova aba Resultados no Portal do Aluno",
    summary: "Histórico completo de desafios, medalhas e rankings em um só lugar — e o painel do aluno mais limpo.",
    items: [
      { type: "novo", title: "Aba Resultados", description: "No portal do aluno, o menu agora tem a aba Resultados: todo o histórico de desafios avaliados (com feedback do professor), medalhas conquistadas e competições de ranking em que participou." },
      { type: "melhoria", title: "Painel do aluno mais limpo", description: "Desafios encerrados não poluem mais o painel do aluno — só os desafios ativos aparecem. O histórico completo ficou na aba Resultados." },
      { type: "melhoria", title: "Feedback no lugar certo", description: "A notificação de avaliação de desafio agora leva direto para a aba Resultados." },
    ],
  },
  {
    version: "2026.09.14.1",
    date: "2026-09-14",
    title: "Ajustes no Relatório de Salas (mobile)",
    summary: "Modal do relatório de ocupação com navegação corrigida no celular.",
    items: [
      { type: "correcao", title: "Botão X fixo no relatório", description: "O botão de fechar não rola junto com o conteúdo e não sobrepõe mais o título." },
      { type: "correcao", title: "Tabela com rolagem lateral", description: "No celular, arraste a tabela do relatório para o lado para ver todas as colunas (Agendadas e Ocupação), sem dados cortados." },
      { type: "correcao", title: "Trava de cards do dashboard", description: "No cadastro do professor, o admin agora vê e marca quais cards do dashboard o professor pode acessar (seção Cards do Dashboard)." },
      { type: "correcao", title: "Vídeo do desafio assistível", description: "O professor consegue assistir/ouvir o vídeo ou áudio enviado pelo aluno na resposta do desafio, direto no painel de respostas." },
      { type: "melhoria", title: "Limpeza automática de mídia", description: "Ao encerrar ou excluir um desafio, os vídeos/imagens enviados pelos alunos são removidos do servidor — economiza espaço sem perder pontos e feedback." },
    ],
  },
  {
    version: "2026.09.14",
    date: "2026-09-14",
    title: "Dashboard inteligente e Financeiro mais claro",
    summary: "Novos cards no painel, desconto antecipado registrado corretamente e controles de privacidade.",
    items: [
      { type: "novo", title: "Horários Livres do Dia", description: "Veja no dashboard as vagas de hoje, com filtro por professor e por sala." },
      { type: "novo", title: "Salas ao Vivo (24h)", description: "Status em tempo quase real das salas de estúdio: livre, ocupada, manutenção." },
      { type: "novo", title: "Dashboard personalizável", description: "Escolha, em Configurações → Aparência, quais cards quer ver." },
      { type: "novo", title: "Botão Olhinho", description: "Oculta os valores financeiros no Dashboard e no Financeiro com um clique." },
      { type: "novo", title: "Card Desconto Concedido", description: "No Financeiro, veja quanto de desconto por pagamento antecipado foi dado no mês." },
      { type: "melhoria", title: "Desconto registrado corretamente", description: "Ao dar baixa ou gerar a cobrança, o valor pago com desconto é gravado junto do valor cheio da mensalidade." },
      { type: "melhoria", title: "Configurações mais enxutas", description: "A aba Professores saiu das Configurações (já está no menu lateral)." },
    ],
  },
];

export const LATEST_RELEASE_VERSION: string = RELEASES[0]?.version ?? "";

/** Lançamento mais recente (ou null se não houver nenhum). */
export function getLatestRelease(): Release | null {
  return RELEASES[0] ?? null;
}

/** Versão que o usuário ainda não viu (última), ou null se está em dia. */
export function getUnseenRelease(lastSeenVersion: string | null | undefined): Release | null {
  const latest = getLatestRelease();
  if (!latest) return null;
  if (lastSeenVersion === latest.version) return null;
  return latest;
}

export function hasUnseenRelease(lastSeenVersion: string | null | undefined): boolean {
  return getUnseenRelease(lastSeenVersion) !== null;
}
