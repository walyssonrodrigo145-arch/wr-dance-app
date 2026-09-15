// Máscaras de entrada centralizadas — AUDIT FIX (elimina duplicações entre páginas)

/** Máscara de CPF: 000.000.000-00 */
export function maskCPF(value: string): string {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
}

/** Máscara de telefone brasileiro: (11) 99999-9999 — com suporte a DDI (+55 ...) */
export function maskPhone(value: string): string {
  if (!value) return "";
  if (value.startsWith("+")) {
    return value.replace(/[^\d+]/g, "");
  }

  let clean = value.replace(/\D/g, "");
  if (!clean) return "";

  let prefix = "";
  if (clean.startsWith("55") && clean.length > 11) {
    prefix = "+55 ";
    clean = clean.substring(2);
  }

  if (clean.length <= 2) {
    return prefix + clean;
  }

  if (clean.length <= 6) {
    return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  }

  if (clean.length <= 10) {
    return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }

  return prefix + `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
}