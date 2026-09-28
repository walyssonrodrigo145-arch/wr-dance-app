import { describe, it, expect } from "vitest";
import {
  SEO_FEATURES,
  SEO_SEGMENTS,
  SEO_COMPARISONS,
  SEO_BLOG,
  SEO_GLOSSARY,
  SEO_PATHS,
} from "../shared/seo";

describe("SEO público do DancePro", () => {
  it("slugs são únicos dentro de cada coleção", () => {
    for (const list of [SEO_FEATURES, SEO_SEGMENTS, SEO_COMPARISONS, SEO_BLOG]) {
      const slugs = list.map((item) => item.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("caminhos do sitemap são únicos e bem formados", () => {
    const unique = new Set(SEO_PATHS);
    expect(unique.size).toBe(SEO_PATHS.length);
    for (const path of SEO_PATHS) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.includes(" ")).toBe(false);
    }
  });

  it("sitemap cobre todas as páginas públicas de conteúdo", () => {
    for (const f of SEO_FEATURES) expect(SEO_PATHS).toContain(`/funcionalidades/${f.slug}`);
    for (const s of SEO_SEGMENTS) expect(SEO_PATHS).toContain(`/para/${s.slug}`);
    for (const c of SEO_COMPARISONS) expect(SEO_PATHS).toContain(`/comparar/${c.slug}`);
    for (const b of SEO_BLOG) expect(SEO_PATHS).toContain(`/blog/${b.slug}`);
    expect(SEO_PATHS).toContain("/glossario");
    expect(SEO_PATHS).toContain("/funcionalidades");
    expect(SEO_PATHS).toContain("/indique");
  });

  it("todo conteúdo tem descrição entre 60 e 220 caracteres", () => {
    for (const item of [...SEO_FEATURES, ...SEO_SEGMENTS, ...SEO_COMPARISONS]) {
      const description = "description" in item ? item.description : item.intro;
      expect(description.length).toBeGreaterThanOrEqual(60);
      expect(description.length).toBeLessThanOrEqual(220);
    }
    for (const post of SEO_BLOG) {
      expect(post.excerpt.length).toBeGreaterThanOrEqual(60);
      expect(post.excerpt.length).toBeLessThanOrEqual(220);
      expect(post.sections.length).toBeGreaterThan(0);
    }
  });

  it("glossário não tem termos duplicados e todos têm definição", () => {
    const terms = SEO_GLOSSARY.map((t) => t.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
    for (const t of SEO_GLOSSARY) {
      expect(t.definition.trim().length).toBeGreaterThan(10);
    }
  });

  it("comparativos têm linhas com critério, DancePro e alternativa", () => {
    for (const c of SEO_COMPARISONS) {
      expect(c.rows.length).toBeGreaterThanOrEqual(3);
      for (const row of c.rows) {
        expect(row.criterion.trim().length).toBeGreaterThan(0);
        expect(row.dancepro.trim().length).toBeGreaterThan(0);
        expect(row.other.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
