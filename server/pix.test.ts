import { describe, it, expect } from "vitest";
import { buildPixPayload, crc16, sanitizePixText } from "./utils/pix";

describe("PIX BR Code (copia e cola)", () => {
  it("CRC16-CCITT segue o vetor de teste padrão (123456789 → 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("gera payload com valor, chave, nome e cidade no formato EMV", () => {
    const payload = buildPixPayload({
      pixKey: "escola@dancepro.com",
      amount: 150.5,
      merchantName: "Escola DancePro",
      merchantCity: "São Paulo",
      txid: "venda123",
    });
    expect(payload).toBeTruthy();
    expect(payload!.startsWith("000201")).toBe(true);
    expect(payload).toContain("5406150.50");
    expect(payload).toContain("5303986");
    expect(payload).toContain("5802BR");
    expect(payload).toContain("SAO PAULO");
    // termina com o CRC de 4 dígitos
    expect(payload!.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it("remove acentos e caracteres inválidos do nome/cidade", () => {
    expect(sanitizePixText("Cia. Pé de Valsa — Ltda", 25)).toBe("CIA. PE DE VALSA LTDA");
  });

  it("retorna null para chave ou valor inválidos (nunca gera cobrança quebrada)", () => {
    expect(buildPixPayload({ pixKey: "", amount: 10, merchantName: "X", merchantCity: "Y" })).toBeNull();
    expect(buildPixPayload({ pixKey: "chave", amount: 0, merchantName: "X", merchantCity: "Y" })).toBeNull();
  });
});
