import { describe, it, expect } from "vitest";
import {
  RELEASES,
  LATEST_RELEASE_VERSION,
  getLatestRelease,
  getUnseenRelease,
  hasUnseenRelease,
} from "@shared/releases";

describe("Novidades (shared/releases.ts)", () => {
  it("tem ao menos um lançamento e a versão mais recente é a do topo", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(LATEST_RELEASE_VERSION).toBe(RELEASES[0].version);
    expect(getLatestRelease()?.version).toBe(RELEASES[0].version);
  });

  it("versões são únicas", () => {
    const versions = RELEASES.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("está ordenado do mais recente para o mais antigo", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });

  it("cada lançamento tem title e itens com type válido", () => {
    const validTypes = ["novo", "melhoria", "correcao"];
    for (const r of RELEASES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) {
        expect(validTypes).toContain(item.type);
        expect(item.title.length).toBeGreaterThan(0);
      }
    }
  });

  it("usuário que nunca viu (null) tem novidade não vista", () => {
    expect(hasUnseenRelease(null)).toBe(true);
    expect(getUnseenRelease(null)?.version).toBe(LATEST_RELEASE_VERSION);
  });

  it("usuário em dia (última versão vista) NÃO tem novidade", () => {
    expect(hasUnseenRelease(LATEST_RELEASE_VERSION)).toBe(false);
    expect(getUnseenRelease(LATEST_RELEASE_VERSION)).toBeNull();
  });

  it("usuário com versão antiga recebe a última não vista", () => {
    expect(hasUnseenRelease("0.0.0")).toBe(true);
    expect(getUnseenRelease("0.0.0")?.version).toBe(LATEST_RELEASE_VERSION);
  });
});
