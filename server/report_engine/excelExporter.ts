import ExcelJS from 'exceljs';
import { ReportConfig } from './types';
import { applyHeaderStyles, applyRowStyles, autoFitColumns, COLORS, FONT_BASE } from './styles';
import { formatCellByType } from './formatter';
import { ReportEngineConfig } from './config';
import fs from 'fs';
import path from 'path';

export async function generateExcel(config: ReportConfig): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.generated_by || ReportEngineConfig.defaultGenerator;
  workbook.created = new Date();

  const company = config.company || ReportEngineConfig.defaultCompany;
  const period = config.period || ReportEngineConfig.defaultPeriod;
  const totalRows = config.rows.length;
  
  // -- CALCULATE KPIs --
  // Find non-ID numeric columns and pick primary value column
  let primaryValueColIndex = -1;

  config.columns.forEach((col, idx) => {
    const name = String(col).toLowerCase().trim();
    if (name === 'id' || name.endsWith('_id') || name.startsWith('id ') || name === 'id') {
      return; // Ignore ID column
    }

    if (
      primaryValueColIndex === -1 &&
      (name.includes('mensalidade') ||
       name.includes('valor') ||
       name.includes('total') ||
       name.includes('preço') ||
       name.includes('preco') ||
       name.includes('pago') ||
       name.includes('despesa') ||
       name.includes('lucro'))
    ) {
      primaryValueColIndex = idx;
    }
  });

  // Fallback: pick first non-ID numeric column with number data
  if (primaryValueColIndex === -1) {
    config.columns.forEach((col, idx) => {
      const name = String(col).toLowerCase().trim();
      if (name === 'id' || name.endsWith('_id') || name === 'id') return;
      if (primaryValueColIndex === -1 && config.rows.some(r => typeof r[idx] === 'number')) {
        primaryValueColIndex = idx;
      }
    });
  }

  let sumAll = 0;
  let countAll = 0;

  if (primaryValueColIndex !== -1) {
    config.rows.forEach(row => {
      const val = row[primaryValueColIndex];
      if (typeof val === 'number') {
        sumAll += val;
        countAll++;
      }
    });
  }

  const avgAll = countAll > 0 ? sumAll / countAll : 0;

  // 1. ABA RESUMO (KPIs)
  const summarySheet = workbook.addWorksheet('Resumo', { properties: { tabColor: { argb: 'FFF59E0B' } } });
  
  summarySheet.mergeCells('A1:C2');
  const sumTitle = summarySheet.getCell('A1');
  sumTitle.value = `Resumo Executivo - ${config.title}`;
  sumTitle.font = { name: FONT_BASE.name, size: 16, bold: true, color: { argb: COLORS.textWhite } };
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' };

  let rIdx = 4;
  const addCard = (label: string, value: any, isCurrency: boolean = false) => {
    summarySheet.mergeCells(`B${rIdx}:C${rIdx}`);
    summarySheet.mergeCells(`B${rIdx+1}:C${rIdx+1}`);
    
    const lCell = summarySheet.getCell(`B${rIdx}`);
    lCell.value = label;
    lCell.font = { name: FONT_BASE.name, size: 10, color: { argb: 'FF6B7280' } };
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.secondary } };
    lCell.alignment = { horizontal: 'center' };
    lCell.border = { top: { style: 'thin', color: { argb: COLORS.border } }, left: { style: 'thin', color: { argb: COLORS.border } }, right: { style: 'thin', color: { argb: COLORS.border } } };

    const vCell = summarySheet.getCell(`B${rIdx+1}`);
    vCell.value = value;
    vCell.font = { name: FONT_BASE.name, size: 14, bold: true, color: { argb: COLORS.primary } };
    if (isCurrency) vCell.numFmt = '_-"R$ "* #,##0.00_-';
    vCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.secondary } };
    vCell.alignment = { horizontal: 'center' };
    vCell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } }, left: { style: 'thin', color: { argb: COLORS.border } }, right: { style: 'thin', color: { argb: COLORS.border } } };
    
    rIdx += 3;
  };

  addCard('Total de registros', totalRows);
  if (countAll > 0) {
    addCard('Valor Total', sumAll, true);
    addCard('Valor Médio', avgAll, true);
  }
  addCard('Período', period);
  addCard('Gerado em', config.generated_at || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  
  summarySheet.getColumn('B').width = 25;
  summarySheet.getColumn('C').width = 25;

  // 2. ABA DADOS
  const sheetName = config.sheet_name || ReportEngineConfig.defaultSheetName;
  const worksheet = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: COLORS.primary } } });

  // Cabeçalho Corporativo
  worksheet.mergeCells('A1:E4');
  const headerCell = worksheet.getCell('A1');
  headerCell.value = `${company}\n${config.title}\nPeríodo: ${period}\nGerado por: ${workbook.creator} em ${config.generated_at || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  headerCell.font = { name: FONT_BASE.name, size: 12, bold: true, color: { argb: COLORS.textWhite } };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
  headerCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  
  worksheet.addRow([]); // Linha 5 vazia

  // Tabela Principal
  const tableStartRowIndex = 6;
  const headerRow = worksheet.addRow(config.columns);
  
  // Aplica estilos do cabeçalho da tabela
  applyHeaderStyles(headerRow);
  
  // Adiciona os dados
  config.rows.forEach((row, index) => {
    const excelRow = worksheet.addRow([]);
    row.forEach((val, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      formatCellByType(cell, val);
    });
    // Aplica estilos zebrados e alinhamentos
    applyRowStyles(excelRow, index % 2 === 1);
  });

  // Congelar a linha do cabeçalho
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: tableStartRowIndex }
  ];
  
  // Adicionar Filtros à tabela nativamente se houver colunas
  if (config.columns.length > 0) {
    const endCol = String.fromCharCode(64 + config.columns.length); // Funciona até Z (26 colunas)
    worksheet.autoFilter = `A${tableStartRowIndex}:${endCol}${tableStartRowIndex + config.rows.length}`;
  }

  // Ajustar larguras das colunas
  autoFitColumns(worksheet);
  
  // Adicionar Rodapé (Footer nativo de impressão)
  worksheet.headerFooter.oddFooter = `&LRelatório gerado pelo MusicPro - ${company}&R&P`;

  // A aba de IA foi desativada permanentemente conforme solicitação do usuário.

  // Retorna como Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
