/**
 * SignatureProvider.ts — Abstração de provedores de assinatura digital.
 *
 * Permite trocar de provedor (Assinafy, ZapSign, Clicksign, Autentique...)
 * sem alterar o ContractService nem o restante do sistema.
 */

export interface ProviderSignerInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
}

export interface ProviderSignProcessInput {
  documentName: string;
  pdfBuffer: Buffer;
  signer: ProviderSignerInput;
  message?: string;
  expiresAt?: Date | null;
}

export interface ProviderSignProcessResult {
  providerDocumentId: string;
  signUrl: string;
  sentAt: Date;
}

export interface ProviderDocumentStatus {
  providerDocumentId: string;
  status: string;
  isSigned: boolean;
  signedDocumentUrl?: string | null;
  declined?: boolean;
}

export interface SignatureProvider {
  readonly name: string;
  /** Valida a credencial e retorna o identificador da conta no provedor. */
  testConnection(): Promise<{ ok: boolean; accountId?: string | null }>;
  /** Envia o documento e cria o processo de assinatura com 1 signatário. */
  createSignProcess(input: ProviderSignProcessInput): Promise<ProviderSignProcessResult>;
  /** Consulta o status atual do documento no provedor. */
  getDocumentStatus(providerDocumentId: string): Promise<ProviderDocumentStatus>;
  /** Baixa o documento assinado (certificado). */
  downloadSignedDocument(providerDocumentId: string): Promise<Buffer | null>;
  /** Reenvia a notificação de assinatura. */
  resend(providerDocumentId: string): Promise<boolean>;
  /** Cancela o documento no provedor (quando suportado). */
  cancel(providerDocumentId: string): Promise<boolean>;
  /** Configura o webhook de eventos da conta. */
  configureWebhook(url: string): Promise<boolean>;
}
