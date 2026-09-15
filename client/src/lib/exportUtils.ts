/**
 * exportUtils.ts — Utilitario para exportacao de dados em CSV / Excel (UTF-8 com BOM)
 */

export function exportToCSV(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  if (!rows || rows.length === 0) {
    alert("Nenhum dado disponível para exportação.");
    return;
  }

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = [
    headers.map(escapeCell).join(";"),
    ...rows.map(row => row.map(escapeCell).join(";"))
  ].join("\n");

  // UTF-8 BOM para garantir acentuacao perfeita no Excel no Brasil
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
