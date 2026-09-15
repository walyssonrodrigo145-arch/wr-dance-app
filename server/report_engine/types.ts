export interface ReportConfig {
  title: string;
  subtitle?: string;
  company?: string;
  period?: string;
  generated_by?: string;
  generated_at?: string;
  sheet_name?: string;
  columns: string[];
  rows: any[][];
  includeAiInsights?: boolean;
  aiInsightsText?: string;
}

export type ExportFormat = 'csv' | 'excel' | 'pdf';
