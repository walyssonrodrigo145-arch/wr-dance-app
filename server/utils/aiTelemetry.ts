// ─── Telemetria de IA (PRD_PROMPTS_IA_CONSOLIDADOS — RF-009) ─────────────────
// Grava metadados de cada chamada de IA em ai_call_logs (feature, provider,
// model, duração, sucesso, categoria de erro). RN-002: falha de escrita NUNCA
// bloqueia a operação principal. RN-004: nenhum segredo, prompt ou PII é gravado.

export interface AiCallMeta {
  organizationId?: number | null;
  userId?: number | null;
  feature: string;
  promptVersion?: string | null;
  isJson?: boolean;
  /** Timeout em ms para esta chamada (RF-008: geração pesada usa 120s; padrão mantém por provedor). */
  timeoutMs?: number;
}

export interface AiCallResult {
  success: boolean;
  durationMs: number;
  provider: string;
  model: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
}

/** Uso de tokens reportado pelo provedor (PRD_OTIMIZACAO_PLANO_DIARIO RF-009). */
export interface AiUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
}

export function classifyAiErrorCode(err: unknown): string {
  const msg = String((err as any)?.message || "").toLowerCase();
  if (msg.includes("não configurada") || msg.includes("nao configurada")) return "sem_chave";
  if (msg.includes("timeout") || msg.includes("não respondeu") || msg.includes("nao respondeu")) return "timeout";
  if (msg.includes("json") || msg.includes("formato") || msg.includes("valid")) return "json_invalido";
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("limite de uso") || msg.includes("limite de requisi")) return "rate_limit";
  if (msg.includes("401") || msg.includes("403") || msg.includes("api key") || msg.includes("api_key") || msg.includes("chave")) return "auth";
  return "api_error";
}

export async function logAiCall(meta: AiCallMeta | undefined, result: AiCallResult): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return;
    const { aiCallLogs } = await import("../../drizzle/schema");
    await db.insert(aiCallLogs).values({
      organizationId: meta?.organizationId ?? null,
      userId: meta?.userId ?? null,
      feature: (meta?.feature || "desconhecido").substring(0, 60),
      promptVersion: meta?.promptVersion ?? null,
      provider: (result.provider || "desconhecido").substring(0, 20),
      model: (result.model || "desconhecido").substring(0, 80),
      durationMs: Math.max(0, Math.round(result.durationMs)),
      success: result.success,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ? result.errorMessage.substring(0, 500) : null,
      isJson: meta?.isJson ? 1 : 0,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      cachedTokens: result.cachedTokens ?? null,
    });
  } catch (err: any) {
    console.warn("[AiTelemetry] Falha ao gravar ai_call_logs (não bloqueante):", err?.message || err);
  }
}
