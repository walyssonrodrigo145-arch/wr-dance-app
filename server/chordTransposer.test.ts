import { describe, expect, it } from "vitest";
import {
  parseChordToken,
  transposeChordName,
  transposeChordSheet,
  extractChordNames,
} from "./services/ChordTransposer";

describe("parseChordToken", () => {
  it("reconhece acordes comuns e extensões", () => {
    for (const tk of ["C", "Em", "Am7", "C7M", "Bb", "F#m7", "Gsus4", "Dadd9", "Bm7(b5)", "C/G", "Bm7/F#"]) {
      expect(parseChordToken(tk), tk).not.toBeNull();
    }
  });

  it("rejeita palavras comuns (RN-007: letra nunca é transposta por engano)", () => {
    for (const tk of ["Abre", "Dado", "sempre", "amor", "123", "[Intro]", "", "Coração"]) {
      expect(parseChordToken(tk), tk).toBeNull();
    }
  });
});

describe("transposeChordName (CA-007 / edge cases do PRD)", () => {
  it("sobe 1 semitom com sustenidos", () => {
    expect(transposeChordName("Em", 1)).toBe("Fm");
    expect(transposeChordName("C", 1)).toBe("C#");
    expect(transposeChordName("Am7", 1)).toBe("A#m7");
  });

  it("desce 1 semitom", () => {
    expect(transposeChordName("C", -1)).toBe("B");
    expect(transposeChordName("F", -1)).toBe("E");
  });

  it("mantém preferência enarmônica de bemóis (Bb + 1 = B; Db + 2 = Eb)", () => {
    expect(transposeChordName("Bb", 1)).toBe("B");
    expect(transposeChordName("Bb", 2)).toBe("C"); // Bb→B→C (musicalmente correto)
    expect(transposeChordName("Db", 2)).toBe("Eb"); // preferência de bemol mantida
  });

  it("transpõe baixo invertido junto (C/G + 2 = D/A)", () => {
    expect(transposeChordName("C/G", 2)).toBe("D/A");
    expect(transposeChordName("Bm7/F#", -2)).toBe("Am7/E");
  });

  it("intervalos grandes: C + 11 = B, C - 11 = D#-like (cromática fechada)", () => {
    expect(transposeChordName("C", 11)).toBe("B");
    expect(transposeChordName("C", 12 - 12 + 12)).toBe("C"); // 12 clampado para 11..? 12 > 11 entra como 12 → mod 12 = 0 → C
  });

  it("semitons 0 = idempotente; token inválido passa intacto", () => {
    expect(transposeChordName("Em", 0)).toBe("Em");
    expect(transposeChordName("qualquer", 3)).toBe("qualquer");
  });
});

describe("transposeChordSheet (CA-002 — letra intacta)", () => {
  const cifra = [
    "[Intro] Em   A   C   G",
    "",
    "Todos os tempos que perdi",
    "     Em              C",
    "Hoje o futuro é meu",
  ].join("\n");

  it("transpõe linha de acordes e preserva letra e marcadores", () => {
    const out = transposeChordSheet(cifra, 2);
    expect(out).toContain("[Intro] F#m   B   D   A");
    // Linha com letra (maioria de palavras) NÃO é alterada
    expect(out).toContain("Todos os tempos que perdi");
    expect(out).toContain("Hoje o futuro é meu");
  });

  it("linha mista (acordes sobre a letra) só mexe nos acordes quando é linha de acordes", () => {
    const chordLine = "     Em              C";
    const out = transposeChordSheet(chordLine, 2);
    expect(out).toContain("F#m");
    expect(out).toContain("D");
  });

  it("cifra com acordes colados ao marcador: [Intro] conta como seção, não acorde", () => {
    const out = transposeChordSheet("[Refrão] G D Em C", 1);
    expect(out).toBe("[Refrão] G# D# Fm C#");
  });

  it("semitons 0 devolve o texto idêntico", () => {
    expect(transposeChordSheet(cifra, 0)).toBe(cifra);
  });
});

describe("extractChordNames (casamento com diagramas)", () => {
  it("extrai apenas tokens de acorde", () => {
    const names = extractChordNames("[Intro] Em   A\n\nG/B   Csus4  amor");
    expect(names).toEqual(["Em", "A", "G/B", "Csus4"]);
  });
});
