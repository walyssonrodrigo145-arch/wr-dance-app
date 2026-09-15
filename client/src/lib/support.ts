// ─── Suporte MusicPro ─────────────────────────────────────────────────────────
// Canal oficial de atendimento ao cliente (escolas). Centralizado aqui para
// facilitar futuras trocas de número/serviço sem caçar strings no código.
export const SUPPORT_WHATSAPP_NUMBER = "5533984055949"; // +55 (33) 98405-5949
export const SUPPORT_WHATSAPP_DISPLAY = "+55 (33) 98405-5949";

export const SUPPORT_WHATSAPP_MESSAGE =
  "Olá! Sou cliente do MusicPro e gostaria de falar com o suporte.";

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  SUPPORT_WHATSAPP_MESSAGE
)}`;
