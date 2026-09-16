// ─── Tokens de segurança (helpers puros e testáveis) ─────────────────────────
import crypto from "crypto";

/**
 * Hash determinístico (SHA-256) para tokens de recuperação de senha.
 * O token CRU só existe no e-mail enviado ao usuário; o banco guarda apenas
 * este hash — vazamento do banco não permite redefinir a senha de ninguém.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
