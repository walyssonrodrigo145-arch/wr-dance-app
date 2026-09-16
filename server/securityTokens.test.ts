import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { hashResetToken } from "./utils/securityTokens";

describe("Segurança — token de recuperação de senha", () => {
  it("gera hash SHA-256 em hexadecimal (64 chars) e nunca devolve o token cru", () => {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = hashResetToken(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
  });

  it("é determinístico (mesmo token → mesmo hash) — necessário para validar no reset", () => {
    const raw = "token-de-teste-1234567890";
    expect(hashResetToken(raw)).toBe(hashResetToken(raw));
  });

  it("tokens diferentes geram hashes diferentes", () => {
    expect(hashResetToken("token-a-1234567890")).not.toBe(hashResetToken("token-b-1234567890"));
  });

  it("não expõe o token em representação reversível (hash não contém o valor original)", () => {
    const raw = "meu-token-secreto-abcdef";
    expect(hashResetToken(raw).includes(raw)).toBe(false);
  });
});
