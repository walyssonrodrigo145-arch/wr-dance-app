// ─── Token assinado (HMAC) para URLs temporárias de arquivos locais ─────────
// Permite que iframes, <video> e <audio> acessem /uploads sem cookie de sessão.
//
// ANTIGA implementação: Map em memória (`fileTokenStore`) — os tokens morriam a
// cada restart do processo e não funcionavam com múltiplas instâncias, gerando
// 403 "Invalid or expired token" e bloqueando o preview de PDFs dos alunos.
//
// NOVA implementação: token stateless assinado com HMAC-SHA256 (segredo derivado
// de JWT_SECRET) no formato `{relKey base64url}.{exp}.{sig base64url}`.
// Válido por 30 minutos; valida assinatura + expiração + path traversal.
//
// Mantido em módulo separado para evitar import circular entre
// server/_core/index.ts (que registra a rota) e server/routers/portalRouters.ts
// (que gera os tokens via tRPC).

import crypto from "crypto";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutos

function getTokenSecret(): string {
  // JWT_SECRET já é obrigatório no ambiente (.env) e compartilhado por todas as
  // instâncias — garante que tokens gerados por um processo sejam válidos nos demais.
  return process.env.JWT_SECRET || process.env.DATABASE_URL || "musicpro-file-token-fallback";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input as any).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getTokenSecret()).update(payload).digest("base64url");
}

/** Cria um token assinado (30 min) para servir um arquivo local via /uploads-token. */
export function createFileToken(relKey: string): string {
  const safeKey = relKey.replace(/^\/+/, "").replace(/\\/g, "/");
  const payload = `${b64url(safeKey)}.${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Valida um token e retorna o relKey se for íntegro e não expirado; null caso contrário.
 */
export function verifyFileToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [keyB64, expStr, sig] = parts;
  const payload = `${keyB64}.${expStr}`;
  const expectedSig = sign(payload);

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    return null;
  }

  let relKey: string;
  try {
    relKey = Buffer.from(keyB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!relKey || relKey.includes("..") || relKey.includes("\0")) {
    return null;
  }
  return relKey;
}
