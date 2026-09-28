import { describe, it, expect } from "vitest";
import {
  blocksFromContent,
  parseContractBlocks,
  renderContractBlocks,
  serializeContractBlocks,
  isContractBlockType,
  emptyContractBlock,
} from "@shared/contractBlocks";

/**
 * Editor de modelos de contrato por blocos: conversão do texto legado, render
 * do texto final (assinatura) e round-trip JSON.
 */
describe("Modelos de contrato — blocos", () => {
  it("converte texto legado em blocos com títulos detectados", () => {
    const content = [
      "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DANÇA",
      "",
      "Pelo presente instrumento, {{school_name}} e {{student_name}} firmam o presente.",
      "",
      "CLÁUSULA 1ª — DO OBJETO",
      "O objeto é a prestação de aulas de {{modalidade}}.",
      "",
      "Parágrafo Único: o pagamento será mensal.",
    ].join("\n");

    const blocks = blocksFromContent(content);
    expect(blocks[0].type).toBe("titulo");
    expect(blocks[0].title).toBe("CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE DANÇA");
    expect(blocks[0].text).toBe("");
    expect(blocks[1].type).toBe("texto");
    expect(blocks[1].text).toContain("{{student_name}}");
    expect(blocks[2].type).toBe("clausula");
    expect(blocks[2].title).toContain("CLÁUSULA 1ª");
    expect(blocks[2].text).toContain("{{modalidade}}");
    expect(blocks[3].type).toBe("paragrafo");
  });

  it("renderContractBlocks devolve o texto final na ordem, ignorando vazios", () => {
    const text = renderContractBlocks([
      { type: "titulo", title: "CONTRATO", text: "" },
      { type: "clausula", title: "CLÁUSULA 1ª", text: "Texto da cláusula." },
      { type: "texto", title: "", text: "   " },
    ]);
    expect(text).toBe("CONTRATO\n\nCLÁUSULA 1ª\nTexto da cláusula.");
  });

  it("round-trip: serialize → parse mantém tipo/título/texto", () => {
    const blocks = [
      { id: "a", type: "contratante" as const, title: "CONTRATANTE", text: "{{student_name}}" },
      { id: "b", type: "paragrafo" as const, title: "Parágrafo Único", text: "Pagamento mensal." },
    ];
    const json = serializeContractBlocks(blocks);
    const parsed = parseContractBlocks(json, null);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ type: "contratante", title: "CONTRATANTE", text: "{{student_name}}" });
    expect(parsed[1].type).toBe("paragrafo");
  });

  it("parseContractBlocks cai no content quando o JSON é inválido/corrompido", () => {
    const parsed = parseContractBlocks("{json quebrado", "CONTRATO X\n\nTexto simples");
    expect(parsed[0].type).toBe("titulo");
    expect(parsed[0].title).toBe("CONTRATO X");
    expect(parsed[1].type).toBe("texto");
  });

  it("tipos desconhecidos viram texto e helpers básicos funcionam", () => {
    expect(isContractBlockType("clausula")).toBe(true);
    expect(isContractBlockType("qualquer")).toBe(false);
    const parsed = parseContractBlocks([{ type: "hacker", title: "", text: "x" }], null);
    expect(parsed[0].type).toBe("texto");
    expect(emptyContractBlock().type).toBe("clausula");
    expect(emptyContractBlock("titulo").type).toBe("titulo");
  });
});
