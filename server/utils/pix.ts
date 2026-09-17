// ─── PIX BR Code (EMV® QRCPS-MPM) — gerador puro e testável ──────────────────
// Usado como fallback quando a escola NÃO tem gateway (Asaas) conectado: gera o
// "PIX copia e cola" a partir da chave PIX cadastrada nas configurações.
// Não substitui a cobrança com conciliação automática — apenas permite receber.

/** CRC16-CCITT (0xFFFF) exigido pelo padrão BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** Remove acentos e caracteres não suportados pelo BR Code (limite de tamanho incluso). */
export function sanitizePixText(value: string, maxLength: number): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

export interface PixPayloadInput {
  pixKey: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  txid?: string | null;
}

/**
 * Monta o payload PIX copia-e-cola (estático, com valor).
 * Retorna null se a chave ou o valor forem inválidos.
 */
export function buildPixPayload(input: PixPayloadInput): string | null {
  const key = (input.pixKey || "").trim();
  const amount = Number(input.amount);
  if (!key || !Number.isFinite(amount) || amount <= 0) return null;

  const name = sanitizePixText(input.merchantName || "ESCOLA", 25) || "ESCOLA";
  const city = sanitizePixText(input.merchantCity || "CIDADE", 15) || "CIDADE";
  // txid: alfanumérico, sem espaços, até 25 chars (usa "***" quando não informado)
  const txid = sanitizePixText(input.txid || "***", 25).replace(/[^A-Z0-9]/gi, "") || "***";

  const merchantAccount =
    field("00", "BR.GOV.BCB.PIX") +
    field("01", key);

  let payload =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    field("54", amount.toFixed(2)) +
    field("58", "BR") +
    field("59", name) +
    field("60", city) +
    field("62", field("05", txid));

  payload += "6304";
  return payload + crc16(payload);
}
