/**
 * AssinafyProvider.ts — Implementação da API da Assinafy.
 *
 * Documentação oficial: https://api.assinafy.com.br/v1/docs
 * Autenticação: header `X-Api-Key` (API Key permanente da escola — BYOK).
 * Ambientes: https://sandbox.assinafy.com.br/v1 (sandbox) | https://api.assinafy.com.br/v1 (produção)
 *
 * Fluxo de assinatura:
 *   1. POST /v1/accounts/{accountId}/documents (upload multipart do PDF)
 *   2. POST /v1/accounts/{accountId}/signers (cria o signatário)
 *   3. POST /v1/documents/{documentId}/assignments (solicita assinatura → signing_urls)
 */

import type { SignatureProvider, ProviderSignProcessInput, ProviderSignProcessResult, ProviderDocumentStatus } from "./SignatureProvider";

export const ASSINAFY_BASE_URLS = {
  sandbox: "https://sandbox.assinafy.com.br/v1",
  production: "https://api.assinafy.com.br/v1",
} as const;

const REQUEST_TIMEOUT_MS = 20_000;

interface Envelope<T = unknown> {
  status: number;
  message: string;
  data: T;
}

interface AssinafyAccount {
  id: string;
  name?: string;
}

interface AssinafyDocument {
  id: string;
  name?: string;
  status?: string;
  signing_url?: string | null;
  artifacts?: Record<string, string> | null;
  declined_by?: { id?: string; full_name?: string } | null;
}

interface AssinafySigner {
  id: string;
  full_name?: string;
  email?: string | null;
}

interface AssinafyAssignment {
  id: string;
  signing_urls?: Array<{ signer_id: string; url: string }> | null;
}

export class AssinafyError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "AssinafyError";
    this.status = status;
    this.body = body;
  }
}

// Retry para erros temporários (500/502/503/504/timeout) — máx. 3 tentativas
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isTemporary =
        err instanceof AssinafyError &&
        (err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504);
      const isTimeout = err?.name === "AbortError" || err?.code === "ECONNABORTED";
      if (!isTemporary && !isTimeout) throw err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }
  }
  throw lastError;
}

export class AssinafyProvider implements SignatureProvider {
  readonly name = "assinafy";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly accountId?: string | null;

  constructor(apiKey: string, environment: "sandbox" | "production", accountId?: string | null) {
    this.apiKey = apiKey.trim();
    this.baseUrl = ASSINAFY_BASE_URLS[environment] || ASSINAFY_BASE_URLS.production;
    this.accountId = accountId || null;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isFormData = false
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = { "X-Api-Key": this.apiKey };
    if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: isFormData && body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      const e = new AssinafyError(
        isTimeout ? "Timeout ao chamar a Assinafy" : `Falha de rede ao chamar a Assinafy: ${err?.message || ""}`,
        0
      );
      (e as any).name = isTimeout ? "AbortError" : "NetworkError";
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    let parsed: Envelope<T> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Envelope<T>) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      throw new AssinafyError(
        parsed?.message || `Erro na Assinafy (HTTP ${res.status})`,
        res.status,
        parsed ?? text
      );
    }
    return parsed?.data as T;
  }

  // ── Autenticação / conta ──────────────────────────────────────────────────
  async testConnection(): Promise<{ ok: boolean; accountId?: string | null }> {
    const accounts = await withRetry(() =>
      this.request<AssinafyAccount[]>("GET", "/accounts")
    );
    const list = Array.isArray(accounts) ? accounts : [];
    return { ok: true, accountId: list[0]?.id ?? null };
  }

  // ── Modelos (Templates Assinafy) ──────────────────────────────────────────
  async listTemplates(accountId?: string): Promise<Array<{ id: string; name: string; description?: string }>> {
    try {
      const accId = accountId || this.accountId;
      if (!accId) {
        const conn = await this.testConnection();
        if (!conn.ok || !conn.accountId) return [];
        (this as any).accountId = conn.accountId;
      }
      const targetId = accountId || this.accountId;

      // 1. Tenta buscar da rota de templates
      let list: any[] = [];
      try {
        const res = await withRetry(() =>
          this.request<any[]>("GET", `/accounts/${targetId}/templates`)
        );
        if (Array.isArray(res)) list = res;
      } catch {}

      // 2. Se /templates retornar vazio, busca dos /documents da conta (rascunhos/últimos documentos)
      if (list.length === 0) {
        try {
          const docsRes = await withRetry(() =>
            this.request<any[]>("GET", `/accounts/${targetId}/documents`)
          );
          if (Array.isArray(docsRes)) list = docsRes;
        } catch {}
      }

      return list.map((t: any) => ({
        id: t.id || t.template_id || String(t.name),
        name: t.name || t.title || t.original_name || "Documento Assinafy",
        description: t.status ? `Status na Assinafy: ${t.status}` : undefined,
      }));
    } catch (e) {
      console.error("[AssinafyProvider] Erro ao listar templates/documentos:", e);
      return [];
    }
  }

  // ── Documento ─────────────────────────────────────────────────────────────
  async uploadDocument(accountId: string, pdfBuffer: Buffer, name: string): Promise<AssinafyDocument> {
    const form = new FormData();
    // AUD-004 FIX: Uint8Array<ArrayBufferLike> não é BlobPart diretamente (tipos incompíveis com ArrayBuffer).
    // Usar Buffer.from para garantir compatibilidade de tipos com Blob no Node.js.
    const blob = new Blob([Buffer.from(pdfBuffer)], { type: "application/pdf" });
    form.append("file", blob, name);
    return withRetry(() =>
      this.request<AssinafyDocument>("POST", `/accounts/${accountId}/documents`, form, true)
    );
  }

  // ── Signatário ────────────────────────────────────────────────────────────
  async createSigner(accountId: string, input: { fullName: string; email?: string | null; phone?: string | null }): Promise<AssinafySigner> {
    const body: Record<string, string> = { full_name: input.fullName };
    if (input.email) body.email = input.email;
    if (input.phone) body.whatsapp_phone_number = input.phone;
    try {
      return await withRetry(() =>
        this.request<AssinafySigner>("POST", `/accounts/${accountId}/signers`, body)
      );
    } catch (err: any) {
      // Se o signatário já existir na Assinafy, busca o existente pelo e-mail
      if (input.email) {
        try {
          const list = await withRetry(() =>
            this.request<AssinafySigner[]>("GET", `/accounts/${accountId}/signers`)
          );
          const found = Array.isArray(list)
            ? list.find((s) => s.email?.toLowerCase() === input.email?.toLowerCase())
            : null;
          if (found?.id) return found;
        } catch {}
      }
      throw err;
    }
  }

  // ── Processo de assinatura ────────────────────────────────────────────────
  async createAssignment(
    documentId: string,
    signerId: string,
    opts: { message?: string; expiresAt?: Date | null } = {}
  ): Promise<AssinafyAssignment> {
    const body: Record<string, unknown> = {
      method: "virtual",
      signers: [
        {
          id: signerId,
          verification_method: "Email",
          notification_methods: ["Email"],
        },
      ],
    };
    if (opts.message) body.message = opts.message;
    if (opts.expiresAt) body.expires_at = opts.expiresAt.toISOString();
    return withRetry(() =>
      this.request<AssinafyAssignment>("POST", `/documents/${documentId}/assignments`, body)
    );
  }

  async getDocument(documentId: string): Promise<AssinafyDocument> {
    return withRetry(() => this.request<AssinafyDocument>("GET", `/documents/${documentId}`));
  }

  async downloadArtifact(documentId: string, artifactName: "original" | "certificated"): Promise<Buffer | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/documents/${documentId}/download/${artifactName}`, {
        method: "GET",
        headers: { "X-Api-Key": this.apiKey },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Interface SignatureProvider ───────────────────────────────────────────
  async createSignProcess(input: ProviderSignProcessInput): Promise<ProviderSignProcessResult> {
    if (!this.accountId) {
      const conn = await this.testConnection();
      if (!conn.ok || !conn.accountId) {
        throw new AssinafyError("Não foi possível identificar a conta na Assinafy", 401);
      }
      (this as any).accountId = conn.accountId;
    }
    const accountId = this.accountId!;

    const doc = await this.uploadDocument(accountId, input.pdfBuffer, input.documentName);
    if (!doc?.id) throw new AssinafyError("A Assinafy não retornou o ID do documento", 500);

    const signer = await this.createSigner(accountId, {
      fullName: input.signer.fullName,
      email: input.signer.email,
      phone: input.signer.phone,
    });
    if (!signer?.id) throw new AssinafyError("A Assinafy não retornou o ID do signatário", 500);

    const assignment = await this.createAssignment(doc.id, signer.id, {
      message: input.message,
      expiresAt: input.expiresAt,
    });

    const signUrl =
      assignment?.signing_urls?.[0]?.url ||
      assignment?.signing_urls?.[0]?.url ||
      null;

    if (!signUrl) {
      // Fallback: link genérico de assinatura do documento
      const fallback = doc.signing_url || null;
      if (!fallback) throw new AssinafyError("A Assinafy não retornou o link de assinatura", 500);
      return {
        providerDocumentId: doc.id,
        signUrl: fallback,
        sentAt: new Date(),
      };
    }

    return { providerDocumentId: doc.id, signUrl, sentAt: new Date() };
  }

  async getDocumentStatus(providerDocumentId: string): Promise<ProviderDocumentStatus> {
    const doc = await this.getDocument(providerDocumentId);
    const status = doc.status || "";
    const isSigned = status === "certificated" || status === "certificating";
    return {
      providerDocumentId: doc.id,
      status,
      isSigned,
      signedDocumentUrl: doc.artifacts?.certificated ?? null,
      declined: status === "rejected_by_signer" || status === "rejected_by_user",
    };
  }

  async downloadSignedDocument(providerDocumentId: string): Promise<Buffer | null> {
    return this.downloadArtifact(providerDocumentId, "certificated");
  }

  async resend(providerDocumentId: string): Promise<boolean> {
    try {
      const doc = await this.getDocument(providerDocumentId);
      const assignmentId = (doc as any).assignment?.id;
      const signerId = (doc as any).assignment?.signers?.[0]?.id;
      if (!assignmentId || !signerId) return false;
      await withRetry(() =>
        this.request<{ is_sent: boolean }>(
          "PUT",
          `/documents/${providerDocumentId}/assignments/${assignmentId}/signers/${signerId}/resend`
        )
      );
      return true;
    } catch {
      return false;
    }
  }

  async cancel(providerDocumentId: string): Promise<boolean> {
    try {
      await withRetry(() =>
        this.request<unknown>("DELETE", `/documents/${providerDocumentId}`)
      );
      return true;
    } catch (err: any) {
      // 400 = documento não deletável no status atual — tratar como não cancelável
      if (err instanceof AssinafyError && err.status === 400) return false;
      throw err;
    }
  }

  async configureWebhook(url: string): Promise<boolean> {
    try {
      if (!this.accountId) return false;
      const events = [
        "document_ready",
        "document_processing_failed",
        "signer_signed_document",
        "signer_rejected_document",
        "user_rejected_document",
        "assignment_created",
        "signature_requested",
      ];
      await this.request("PUT", `/accounts/${this.accountId}/webhooks/subscriptions`, {
        events,
        is_active: true,
        url,
        email: "",
      });
      return true;
    } catch {
      return false;
    }
  }
}
