/**
 * Utilitário de segurança para validação de arquivos enviados via upload.
 * CRÍTICO-05: Verifica magic bytes (assinatura binária) para garantir que o
 * conteúdo real do arquivo corresponde ao tipo declarado (MIME type).
 *
 * Isso impede ataques onde um atacante envia um arquivo executável (PHP, EXE, etc.)
 * renomeado com extensão segura (.jpg, .pdf) para tentar bypassar filtros de extensão.
 */

/**
 * Definição de magic bytes por MIME type.
 * Cada entrada contém:
 *   - `bytes`: assinatura hexadecimal esperada no início do arquivo
 *   - `offset`: offset em bytes a partir do qual a assinatura começa (geralmente 0)
 */
const MAGIC_BYTES: Record<string, { bytes: Buffer; offset: number }[]> = {
  "image/jpeg": [{ bytes: Buffer.from([0xff, 0xd8, 0xff]), offset: 0 }],
  "image/jpg":  [{ bytes: Buffer.from([0xff, 0xd8, 0xff]), offset: 0 }],
  "image/png":  [{ bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), offset: 0 }],
  "image/gif":  [
    { bytes: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), offset: 0 },
    { bytes: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), offset: 0 },
  ],
  "image/webp": [{ bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), offset: 0 }],
  "image/svg+xml": [], // SVG é texto — validado pelo conteúdo, sem magic bytes binários

  // PDF: %PDF
  "application/pdf": [{ bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]), offset: 0 }],

  // Áudio MP3: ID3 ou frame sync
  "audio/mpeg": [
    { bytes: Buffer.from([0x49, 0x44, 0x33]), offset: 0 }, // ID3
    { bytes: Buffer.from([0xff, 0xfb]), offset: 0 },         // MPEG frame
  ],
  "audio/mp3": [
    { bytes: Buffer.from([0x49, 0x44, 0x33]), offset: 0 },
    { bytes: Buffer.from([0xff, 0xfb]), offset: 0 },
  ],
  "audio/wav": [{ bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), offset: 0 }], // RIFF
  "audio/ogg": [{ bytes: Buffer.from([0x4f, 0x67, 0x67, 0x53]), offset: 0 }], // OggS
  "audio/flac": [{ bytes: Buffer.from([0x66, 0x4c, 0x61, 0x43]), offset: 0 }], // fLaC

  // Vídeo MP4: ftyp box em offset 4
  "video/mp4": [{ bytes: Buffer.from([0x66, 0x74, 0x79, 0x70]), offset: 4 }], // ftyp

  // WebM: EBML
  "video/webm": [{ bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), offset: 0 }],

  // Office — baseados em ZIP (OOXML) ou OLE2
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    [{ bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset: 0 }], // PK
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    [{ bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset: 0 }],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    [{ bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset: 0 }],
  "application/msword":
    [{ bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), offset: 0 }], // OLE2
  "application/vnd.ms-excel":
    [{ bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), offset: 0 }],
};

/**
 * Verifica se um buffer possui a assinatura binária esperada para o MIME type declarado.
 *
 * @param buffer - Conteúdo binário do arquivo
 * @param mimeType - MIME type declarado pelo cliente (normalizado, sem parâmetros)
 * @returns `true` se a assinatura for válida ou não for verificável (ex.: texto, SVG, AAC, M4A),
 *          `false` se a assinatura não corresponder ao esperado.
 */
export function checkFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];

  // Se não temos assinatura definida para este MIME type, permitimos o arquivo.
  // Isso cobre: text/plain, image/svg+xml, audio/aac, audio/m4a, video/quicktime, etc.
  // O risco é baixo pois esses tipos já foram filtrados pela whitelist de extensão/MIME.
  if (!signatures) return true;

  // SVG: sem magic bytes binários — é texto XML. Validação por conteúdo opcional.
  if (signatures.length === 0) return true;

  // O arquivo precisa ter pelo menos bytes suficientes para as assinaturas
  if (buffer.length < 8) return false;

  // Suporte à norma ISO 32000-1 para PDF: o cabeçalho %PDF pode iniciar nos primeiros 1024 bytes
  if (mimeType === "application/pdf") {
    const searchLimit = Math.min(buffer.length, 1024);
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    return buffer.subarray(0, searchLimit).includes(pdfMagic);
  }

  // Verifica se pelo menos UMA das assinaturas é encontrada (OR lógico)
  return signatures.some(sig => {
    const { bytes, offset } = sig;
    if (buffer.length < offset + bytes.length) return false;
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[offset + i] !== bytes[i]) return false;
    }
    return true;
  });
}
