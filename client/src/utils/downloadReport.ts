export function downloadBase64File(base64Data: string, type: 'csv' | 'excel', filename: string) {
  // Converte base64 para array de bytes
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  const mimeType = type === 'csv' 
    ? 'text/csv;charset=utf-8;' 
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const blob = new Blob([byteArray], { type: mimeType });

  const link = document.createElement('a');
  if (link.download !== undefined) { 
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const extension = type === 'csv' ? '.csv' : '.xlsx';
    // Se o filename já não tiver extensão
    const finalName = filename.endsWith(extension) ? filename : `${filename}${extension}`;
    link.setAttribute('download', finalName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
