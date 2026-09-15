// 📣 Changelog versionado do MusicPro (FONTE ÚNICA das "Novidades").
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
    version: "2026.09.15",
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
