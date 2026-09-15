// Catálogo canônico dos cards do Dashboard (fonte única — client + server).
// `sensitive` = mascarado pelo botão "olhinho" (RF-004 / RN-013).
// A "trava" do professor usa estes IDs: permitidos(admin) \ ocultos(usuário).

export interface DashboardWidgetDef {
  id: string;
  label: string;
  desc: string;
  sensitive?: boolean;
}

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: "kpi_students", label: "Alunos Ativos", desc: "Total de alunos ativos" },
  { id: "kpi_lessons_done", label: "Aulas Realizadas", desc: "Aulas concluídas no mês" },
  { id: "kpi_lessons_scheduled", label: "Aulas Agendadas", desc: "Aulas agendadas" },
  { id: "kpi_revenue", label: "Receita do Mês", desc: "Faturamento do mês", sensitive: true },
  { id: "plan_usage", label: "Uso do Plano", desc: "Limite de alunos do plano" },
  { id: "chart_monthly", label: "Evolução Mensal", desc: "Gráfico de evolução", sensitive: true },
  { id: "today_summary", label: "Resumo do Dia", desc: "Aulas, check-ins e recebido hoje", sensitive: true },
  { id: "upcoming_lessons", label: "Próximas Aulas", desc: "Agenda dos próximos dias" },
  { id: "overdue_payments", label: "Inadimplentes", desc: "Pagamentos atrasados", sensitive: true },
  { id: "free_slots", label: "Horários Livres", desc: "Vagas livres de hoje" },
  { id: "live_rooms", label: "Salas ao Vivo (24h)", desc: "Status das salas de estúdio" },
];

export const ALL_WIDGET_IDS: string[] = DASHBOARD_WIDGETS.map((w) => w.id);

export const SENSITIVE_WIDGET_IDS: string[] = DASHBOARD_WIDGETS.filter((w) => w.sensitive).map((w) => w.id);

/** Aceita JSON array (padrão) ou CSV legado. */
export function parseWidgetList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Resolve os cards efetivamente visíveis.
 * `allowedRaw` vazio = todos permitidos (RN-009/RN-017).
 * Efetivo = permitidos \ ocultos (RN-016 — trava).
 */
export function resolveVisibleWidgets(allowedRaw: string | null | undefined, hiddenRaw: string | null | undefined): string[] {
  const allowed = parseWidgetList(allowedRaw).filter((id) => ALL_WIDGET_IDS.includes(id));
  const hidden = new Set(parseWidgetList(hiddenRaw));
  const base = allowed.length > 0 ? allowed : ALL_WIDGET_IDS;
  return base.filter((id) => !hidden.has(id));
}

export function isWidgetSensitive(id: string): boolean {
  return SENSITIVE_WIDGET_IDS.includes(id);
}
