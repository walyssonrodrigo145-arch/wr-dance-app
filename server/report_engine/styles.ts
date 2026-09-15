import { Worksheet, Row } from 'exceljs';

export const COLORS = {
  primary: 'FF2563EB', // Azul
  secondary: 'FFF8FAFC', // Cinza claro
  textWhite: 'FFFFFFFF',
  textDark: 'FF1F2937',
  border: 'FFE5E7EB',
};

export const FONT_BASE = {
  name: 'Calibri',
  size: 11,
};

export function applyHeaderStyles(row: Row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.primary },
    };
    cell.font = {
      color: { argb: COLORS.textWhite },
      bold: true,
      name: FONT_BASE.name,
      size: 12, // Taller font
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.primary } },
      left: { style: 'thin', color: { argb: COLORS.primary } },
      bottom: { style: 'thin', color: { argb: COLORS.primary } },
      right: { style: 'thin', color: { argb: COLORS.primary } },
    };
  });
  // Altura maior
  row.height = 30;
}

export function applyRowStyles(row: Row, isAlternate: boolean) {
  row.eachCell((cell) => {
    // Preserva formatação condicional se já houver (ex: vermelho)
    const existingColor = cell.font?.color?.argb;
    const existingBold = cell.font?.bold;
    
    cell.font = { 
      name: FONT_BASE.name, 
      size: FONT_BASE.size,
      color: { argb: existingColor || COLORS.textDark },
      bold: existingBold || false
    };
    
    cell.alignment = { vertical: 'middle', wrapText: true };
    
    // Alinha texto à esquerda e números/dinheiro à direita
    if (typeof cell.value === 'number') {
      cell.alignment.horizontal = 'right';
    } else if (cell.value instanceof Date) {
      cell.alignment.horizontal = 'center';
    } else {
      cell.alignment.horizontal = 'left';
    }

    if (isAlternate) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.secondary },
      };
    }
    
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.border } },
      left: { style: 'thin', color: { argb: COLORS.border } },
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      right: { style: 'thin', color: { argb: COLORS.border } },
    };
  });
  
  // Altura automática / folga
  row.height = 20;
}

export function autoFitColumns(worksheet: Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    if (column && column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
    }
    column.width = Math.max(12, Math.min(50, maxLength + 3));
  });
}
