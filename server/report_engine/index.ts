import { ReportConfig, ExportFormat } from './types';
import { generateCSV } from './csvExporter';
import { generateExcel } from './excelExporter';

export class ReportGenerator {
  private config: ReportConfig;

  constructor(config: ReportConfig) {
    this.config = config;
  }

  /**
   * Exporta o relatório em formato CSV.
   * Retorna uma string UTF-8.
   */
  public exportCSV(): string {
    return generateCSV(this.config);
  }

  /**
   * Exporta o relatório em formato XLSX.
   * Retorna um Buffer contendo o arquivo binário Excel.
   */
  public async exportExcel(): Promise<Buffer> {
    return await generateExcel(this.config);
  }
}

export * from './types';
export * from './config';
