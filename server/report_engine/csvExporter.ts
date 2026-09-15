import { ReportConfig } from './types';
import { ReportEngineConfig } from './config';
import { escapeCSV } from './helpers';

export function generateCSV(config: ReportConfig): string {
  // Use semicolon by default for PT-BR Excel compatibility
  const separator = ';';
  const lines: string[] = [];

  // Add BOM for UTF-8 Excel compatibility
  const BOM = '\uFEFF';

  // Cabeçalhos
  const headerLine = config.columns.map((col) => escapeCSV(String(col))).join(separator);
  lines.push(headerLine);

  // Linhas de dados
  for (const row of config.rows) {
    const rowLine = row
      .map((val) => {
        if (val === null || val === undefined) return '';
        if (val instanceof Date) return escapeCSV(val.toISOString());
        // For CSV, ensure numbers with decimals are formatted with commas for PT-BR
        if (typeof val === 'number') {
          return escapeCSV(String(val).replace('.', ','));
        }
        return escapeCSV(String(val));
      })
      .join(separator);
    lines.push(rowLine);
  }

  return BOM + lines.join('\n');
}
