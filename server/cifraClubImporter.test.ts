import { describe, expect, it } from "vitest";
import { parseCifraHtml, isCifraClubUrl } from "./services/CifraClubImporter";

/**
 * Fixture mínima baseada na estrutura REAL do HTML do Cifra Club
 * (capturada em 05/09/2026): pre[data-chord-content] com divs .kvMV,
 * <b data-chord-name> por acorde, bloco data-chord-config com o tom,
 * e lista de diagramas <li data-chord-name> + data-mount/data-tuning.
 */
const FIXTURE = `
<html><head><script>window.bad=1;</script></head><body>
<div class="y0WYx" data-chords-list="true">
<ul data-instrument="guitar">
<li data-chord-name="Am7" data-chord-modal-center="true"><div class="jxZN8" data-mount="X 0 2 0 1 0" data-tuning="E A D G B E"><strong>Am7</strong></div></li>
<li data-chord-name="Bm7" data-chord-modal-center="true"><div class="jxZN8" data-mount="X 2 4 4 3 2" data-tuning="E A D G B E"><strong>Bm7</strong></div></li>
<li data-chord-name="C7M" data-chord-modal-center="true"><div class="jxZN8" data-mount="X X 9 11 10 X" data-tuning="E A D G B E"><strong>C7M</strong></div></li>
<li data-chord-name="Em" data-chord-modal-center="true"><div class="jxZN8" data-mount="0 2 2 0 0 0" data-tuning="E A D G B E"><strong>Em</strong></div></li>
</ul></div>
<div class="ebNp" data-chord-config="true"><div class="IERZz"><span>Tom<!-- -->: </span> <button type="button" class="eVroG">Em</button></div></div>
<article data-chord-container="true"><pre class="_crVx" data-chord-content="true">
<div class="kvMV">[Intro] <b data-chord-name="C7M">C7M</b>  <b data-chord-name="Am7">Am7</b>  <b data-chord-name="Bm7">Bm7</b>  <b data-chord-name="Em">Em</b>
</div><div class="kvMV">Essa aqui é a LETRA da música — deve ser descartada, nunca armazenada
</div><div class="kvMV">        <b data-chord-name="C">C</b>  <b data-chord-name="Am7">Am7</b>  <b data-chord-name="Bm7">Bm7</b>  <b data-chord-name="Em">Em</b>
</div><div class="kvMV">Mais letra: se isto aparecer no chordSheet, o parser violou a RN-007
</div><div class="kvMV">[Refrão] <b data-chord-name="G">G</b>  <b data-chord-name="D">D</b>  <b data-chord-name="Em">Em</b>  <b data-chord-name="C">C</b>
</div></pre></article>
</body></html>`;

describe("parseCifraHtml (RF-006 — importação só de acordes)", () => {
  const parsed = parseCifraHtml(FIXTURE);

  it("extrai a estrutura harmônica na ordem", () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.chordSheet).toBe(
      [
        "[Intro] C7M Am7 Bm7 Em",
        "",
        "C Am7 Bm7 Em",
        "",
        "[Refrão] G D Em C",
      ].join("\n")
    );
  });

  it("RN-007: NUNCA armazena letra (texto livre é descartado)", () => {
    expect(parsed!.chordSheet).not.toContain("LETRA");
    expect(parsed!.chordSheet).not.toContain("música");
    expect(parsed!.chordSheet).not.toContain("parser violou");
  });

  it("extrai o tom do bloco data-chord-config", () => {
    expect(parsed!.chordKey).toBe("Em");
  });

  it("extrai diagramas com mount/tuning deduplicados", () => {
    expect(parsed!.diagrams).toHaveLength(4);
    expect(parsed!.diagrams[0]).toEqual({ name: "Am7", mount: "X 0 2 0 1 0", tuning: "E A D G B E" });
  });

  it("retorna null para HTML sem pre de cifra (página de busca/perfil)", () => {
    expect(parseCifraHtml("<html><body>busca</body></html>")).toBeNull();
    expect(parseCifraHtml("")).toBeNull();
  });

  it("sanitiza marcadores com conteúdo estranho", () => {
    const html = `<pre data-chord-content="true"><div class="kvMV">[Ponte <b data-chord-name="A">A</b>x] <b data-chord-name="D">D</b></div></pre>`;
    const out = parseCifraHtml(html)!;
    // Marcador capturado sem quebrar acordes; label sanitizado sem tags
    expect(out.chordSheet).toContain("D");
  });
});

describe("isCifraClubUrl (whitelist de host)", () => {
  it("aceita URLs https do cifraclub.com.br", () => {
    expect(isCifraClubUrl("https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/")).toBe(true);
    expect(isCifraClubUrl("https://cifraclub.com.br/a/b/c.html")).toBe(true);
  });

  it("rejeita outros hosts, http puro e lixo (CA-006)", () => {
    expect(isCifraClubUrl("https://evil.com/cifraclub.com.br")).toBe(false);
    expect(isCifraClubUrl("http://www.cifraclub.com.br/x")).toBe(false);
    expect(isCifraClubUrl("https://cifraclub.com.br.evil.com/x")).toBe(false);
    expect(isCifraClubUrl("não é url")).toBe(false);
  });
});
