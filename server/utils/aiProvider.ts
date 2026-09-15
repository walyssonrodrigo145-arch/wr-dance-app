/**
 * aiProvider — helper centralizado para resolver credenciais da IA
 * respeitando settings.aiProvider = gemini | groq | opencode
 * 
 * Garante que TODAS as IAs (especialistas + assistente) olhem a mesma
 * configuração da escola (settings), sem duplicar ternários `aiProvider === 'groq' ? ...`
 * espalhados em 12 arquivos.
 */

export type AiProvider = "gemini" | "groq" | "opencode";

export interface AiCredentials {
  provider: AiProvider;
  apiKey: string | null;
  model: string | null;
  apiUrl: string | null; // só para opencode (OpenAI-compatible baseURL)
}

export function resolveAiCredentials(settings: any): AiCredentials {
  const provider = (settings?.aiProvider || "gemini").toLowerCase() as AiProvider;
  if (provider === "groq") {
    return {
      provider: "groq",
      apiKey: settings?.groqApiKey || null,
      model: settings?.groqModel || "openai/gpt-oss-20b",
      apiUrl: null,
    };
  }
  if (provider === "opencode") {
    return {
      provider: "opencode",
      apiKey: (settings as any)?.opencodeApiKey || process.env.OPENCODE_API_KEY || null,
      model: (settings as any)?.opencodeModel || process.env.OPENCODE_MODEL || "opencode/muse-spark-1.2-contributor-free",
      apiUrl: (settings as any)?.opencodeApiUrl || process.env.OPENCODE_API_URL || null,
    };
  }
  // default gemini
  return {
    provider: "gemini",
    apiKey: settings?.geminiApiKey || null,
    model: settings?.geminiModel || "gemini-2.0-flash",
    apiUrl: null,
  };
}

/**
 * Totem para logs: não loga key, só provider/model
 */
export function aiCredentialsLogMeta(creds: AiCredentials) {
  return { provider: creds.provider, model: creds.model, hasKey: !!creds.apiKey };
}
