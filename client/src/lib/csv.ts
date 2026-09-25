/**
 * Utilitários de CSV compartilhados (importação de alunos/turmas).
 * Parser real: aspas, escapes, BOM, CRLF e delimitador detectado.
 */
export const MAX_CSV_ROWS = 300;

export function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = line.split(c).length - 1;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const normalizeHeader = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function downloadCsv(filename: string, header: string[], data: string[][]) {
  const csv = "\uFEFF" + [header, ...data]
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
