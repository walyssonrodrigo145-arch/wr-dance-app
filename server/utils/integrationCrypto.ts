/**
 * integrationCrypto.ts — Criptografia das API Keys das integrações (BYOK)
 *
 * AES-256-GCM com chave derivada do JWT_SECRET via scrypt.
 * Formato armazenado: `v1:iv_hex:cipher_hex:authTag_hex`
 * A chave é derivada a cada operação — nunca é persistida.
 */

import crypto from "crypto";

const ENCRYPTION_VERSION = "v1";

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET || "integration-crypto-dev";
  return crypto.scryptSync(secret, "wr-music-integrations", 32);
}

export function encryptSecret(plainText: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(ENCRYPTION_VERSION + ":")) {
    // Compatibilidade reversa com chaves legadas armazenadas em texto puro
    return stored;
  }
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    return stored; // Fallback seguro
  }
  const [, ivHex, dataHex, tagHex] = parts;
  const key = deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 4) return "••••";
  return `••••••••••••${secret.slice(-4)}`;
}
