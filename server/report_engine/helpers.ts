export function sanitizeString(val: string): string {
  if (!val) return '';
  // Removes newlines for CSV compliance if needed, or replaces them
  return val.replace(/[\r\n]+/g, ' ').trim();
}

export function escapeCSV(val: string): string {
  // If the value contains comma, double quote or newline, quote it
  if (/[",\r\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
