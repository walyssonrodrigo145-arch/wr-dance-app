// Blocos dos modelos de contrato — fonte única do editor visual.
// Usado pelo client (editor/prévia) e pelo server (persistência/render).
// `content` continua sendo o texto final enviado para assinatura; os blocos são
// a representação estruturada (tipo / título / texto).

export type ContractBlockType =
  | "titulo"
  | "contratante"
  | "contratada"
  | "clausula"
  | "paragrafo"
  | "texto"
  | "assinatura"
  | "data";

export interface ContractBlock {
  id?: string;
  type: ContractBlockType;
  title: string;
  text: string;
}

export const CONTRACT_BLOCK_LABELS: Record<ContractBlockType, string> = {
  titulo: "Título",
  contratante: "Contratante",
  contratada: "Contratada",
  clausula: "Cláusula",
  paragrafo: "Parágrafo Único",
  texto: "Texto",
  assinatura: "Assinaturas",
  data: "Data / Local",
};

const VALID_TYPES = new Set<string>(Object.keys(CONTRACT_BLOCK_LABELS));

export function isContractBlockType(value: unknown): value is ContractBlockType {
  return VALID_TYPES.has(String(value));
}

/** Bloco vazio padrão do editor. */
export function emptyContractBlock(type: ContractBlockType = "clausula"): ContractBlock {
  return { type, title: "", text: "" };
}

/**
 * Converte o texto legado (sem blocos) em blocos estruturados.
 * Heurística: parágrafos separados por linha em branco; a 1ª linha vira título
 * quando é CLÁUSULA/PARÁGRAFO/CONTRATANTE/CONTRATADA ou está toda em CAIXA ALTA.
 */
export function blocksFromContent(content: string | null | undefined): ContractBlock[] {
  const raw = String(content ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [emptyContractBlock("texto")];

  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks: ContractBlock[] = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n");
    const first = (lines[0] || "").trim();
    const rest = lines.slice(1).join("\n").trim();
    const upper = first.toUpperCase();

    let type: ContractBlockType = "texto";
    let title = "";
    let text = paragraph;

    if (/^CL[ÁA]USULA\b/.test(upper)) {
      type = "clausula"; title = first; text = rest;
    } else if (/^PAR[ÁA]GRAFO\b/.test(upper)) {
      type = "paragrafo"; title = first; text = rest;
    } else if (/^CONTRATANTE\b/.test(upper)) {
      type = "contratante"; title = first; text = rest;
    } else if (/^CONTRATADA\b/.test(upper)) {
      type = "contratada"; title = first; text = rest;
    } else if (/^(ASSINATURA|ASSINATURAS)\b/.test(upper)) {
      type = "assinatura"; title = first; text = rest;
    } else if (/^(DATA|LOCAL)\b/.test(upper)) {
      type = "data"; title = first; text = rest;
    } else if (
      first.length > 0 &&
      first.length <= 90 &&
      first === upper &&
      /[A-ZÀ-ÖØ-Þ]{3,}/.test(first) &&
      !/[a-zà-öø-ÿ]/.test(first)
    ) {
      type = "titulo"; title = first; text = rest;
    }

    blocks.push({ type, title, text });
  }

  return blocks.length > 0 ? blocks : [emptyContractBlock("texto")];
}

/** Lê os blocos salvos (JSON/array) ou converte do `content` legado. */
export function parseContractBlocks(blocks: unknown, content: string | null | undefined): ContractBlock[] {
  if (Array.isArray(blocks)) {
    const parsed = blocks
      .filter((b: any) => b && typeof b === "object")
      .map((b: any) => ({
        id: typeof b.id === "string" ? b.id : undefined,
        type: isContractBlockType(b.type) ? (b.type as ContractBlockType) : "texto",
        title: String(b.title ?? ""),
        text: String(b.text ?? ""),
      }));
    if (parsed.length > 0) return parsed;
  }
  if (typeof blocks === "string" && blocks.trim()) {
    try {
      const json = JSON.parse(blocks);
      if (Array.isArray(json)) return parseContractBlocks(json, content);
    } catch {
      // JSON inválido/corrompido → cai na conversão do content legado
    }
  }
  return blocksFromContent(content);
}

/** Renderiza o texto final (assinatura) a partir dos blocos, na ordem. */
export function renderContractBlocks(blocks: ContractBlock[]): string {
  return (blocks || [])
    .map((b) => {
      const title = String(b.title ?? "").trim();
      const text = String(b.text ?? "").trim();
      if (title && text) return `${title}\n${text}`;
      return title || text;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Serializa os blocos para a coluna `blocks` (text/JSON). */
export function serializeContractBlocks(blocks: ContractBlock[]): string {
  return JSON.stringify(
    (blocks || []).map(({ id, type, title, text }) => ({
      ...(id ? { id } : {}),
      type,
      title: String(title ?? ""),
      text: String(text ?? ""),
    }))
  );
}
