import { Cell } from 'exceljs';

export function formatCellByType(cell: Cell, value: any) {
  if (value === null || value === undefined || value === '') {
    cell.value = '';
    return;
  }

  // Detect and format Dates
  if (value instanceof Date) {
    cell.value = value;
    cell.numFmt = 'dd/mm/yyyy'; // requested format
    return;
  }

  if (typeof value === 'string') {
    // If it's a date string like YYYY-MM-DD or DD/MM/YYYY
    const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/;
    if (dateRegex.test(value)) {
      // Trying to parse
      let dt: Date;
      if (value.includes('/')) {
        const parts = value.split('/');
        dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      } else {
        dt = new Date(value);
      }
      if (!isNaN(dt.getTime())) {
        cell.value = dt;
        cell.numFmt = 'dd/mm/yyyy';
        return;
      }
    }

    // Checking if it's a percentage string (e.g. "35%")
    if (value.endsWith('%') && !isNaN(Number(value.replace('%', '').trim()))) {
      cell.value = Number(value.replace('%', '').trim()) / 100;
      cell.numFmt = '0.00%';
      return;
    }
  }

  // Detect and format Numbers
  if (typeof value === 'number') {
    cell.value = value;
    
    // Is it likely a currency? In our case, we might need a hint, but if it has decimals it could be currency. 
    // We will just use standard BRL accounting format for all floats by default, or regular numbers if no decimals.
    if (value % 1 !== 0 || value > 1000) {
      // Accounting format BRL
      cell.numFmt = '_-"R$ "* #,##0.00_-';
    } else {
      cell.numFmt = '0'; // Integer
    }
    
    // Apply conditional formatting for negative numbers
    if (value < 0) {
      cell.font = { color: { argb: 'FFFF0000' } }; // Red
    }
    return;
  }

  // Default String
  cell.value = String(value);

  // Status conditional formatting
  const strVal = String(value).toLowerCase().trim();
  if (strVal === 'pago' || strVal === 'concluída' || strVal === 'concluida') {
    cell.font = { color: { argb: 'FF10B981' }, bold: true }; // Emerald 500
  } else if (strVal === 'pendente') {
    cell.font = { color: { argb: 'FFF59E0B' }, bold: true }; // Amber 500
  } else if (strVal === 'cancelado' || strVal === 'inadimplente' || strVal === 'atrasado' || strVal === 'cancelada') {
    cell.font = { color: { argb: 'FFEF4444' }, bold: true }; // Red 500
  }
}
