import { GoogleGenerativeAI } from "@google/generative-ai";

const defaultApiKey = process.env.GEMINI_API_KEY;

if (!defaultApiKey) {
  console.warn("GEMINI_API_KEY is not set globally. AI features will require per-user keys.");
}

// Deprecated: Avoid using this global instance directly.
// Pass customApiKey to callGemini functions or instantiate locally.
export const genAI = new GoogleGenerativeAI(defaultApiKey || "");
import Groq from "groq-sdk";
import type { AiCallMeta, AiUsage } from "./aiTelemetry";
import { logAiCall, classifyAiErrorCode } from "./aiTelemetry";

// Extrai o JSON de uma resposta de IA, mesmo com markdown, texto antes/depois ou truncamento.
export function extractJsonFromText(text: string): string {
  if (!text) return "";
  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

// Callback para telemetria: informa provider/model resolvidos e uso de tokens.
type ResolvedCb = (provider: string, model: string, usage?: AiUsage) => void;

// ── Implementação original (PRD_PROMPTS_IA_CONSOLIDADOS: body preservado; apenas
//    temperature parametrizada e telemetria via onResolved) ──
async function callGeminiImpl(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string | undefined,
  isJson: boolean,
  customApiKey: string | null | undefined,
  customModel: string | null | undefined,
  temperature: number,
  onResolved: ResolvedCb,
  meta?: AiCallMeta
): Promise<string> {
  const apiKeyToUse = customApiKey || defaultApiKey;

  if (!apiKeyToUse) {
    throw new Error("Chave da API não configurada. Por favor, adicione sua chave nas Configurações.");
  }

  // ── OpenCode provider (respeita settings.aiProvider = opencode) ──
  // Detecta via model prefix "opencode/" ou "opencode-go/", modelos zen free/conhecidos, prefixo de chave, ou chave informada
  const isOpencode =
    (customModel && (
      customModel.trim().startsWith("opencode/") ||
      customModel.trim().startsWith("opencode-go/") ||
      customModel.includes("-free") ||
      customModel.includes("spark") ||
      customModel.includes("deepseek") ||
      customModel.includes("nemotron") ||
      customModel.includes("mimo") ||
      customModel.includes("hy3") ||
      customModel.includes("laguna")
    )) ||
    apiKeyToUse.trim().startsWith("opencode-") ||
    apiKeyToUse.trim().startsWith("sk-opencode") ||
    (process.env.OPENCODE_API_KEY && apiKeyToUse.trim() === process.env.OPENCODE_API_KEY.trim());

  if (isOpencode) {
    // OpenAI-compatible via fetch (Groq SDK não suporta modelos opencode)
    let opencodeModel = customModel?.trim() || process.env.OPENCODE_MODEL || "deepseek-v4-flash-free";
    // ── OpenCode Go (assinatura, ex.: opencode-go/glm-5.3-flash) vs Zen (pay-as-you-go) ──
    const isOpencodeGo = opencodeModel.startsWith("opencode-go/");
    // Remove prefixos 'opencode/' ou 'opencode-go/' para envio à API (formato bare model-id)
    if (opencodeModel.startsWith("opencode/")) {
      opencodeModel = opencodeModel.replace("opencode/", "");
    }
    if (isOpencodeGo) {
      opencodeModel = opencodeModel.replace("opencode-go/", "");
    }
    onResolved("opencode", opencodeModel);
    // URL por gateway: modelos com prefixo opencode-go/ vão para /zen/go/v1;
    // OPENCODE_API_URL ainda prevalece se apontar explicitamente para um gateway /go/.
    const envOcUrl = (process.env.OPENCODE_API_URL as string) || "";
    const opencodeUrl = isOpencodeGo
      ? (envOcUrl.includes("/go/") ? envOcUrl : "https://opencode.ai/zen/go/v1/chat/completions")
      : (envOcUrl || "https://opencode.ai/zen/v1/chat/completions");
    const ocMessages: any[] = [];
    if (systemPrompt) ocMessages.push({ role: "system", content: systemPrompt });
    for (const m of messages) {
      ocMessages.push({ role: m.role === "assistant" || m.role === "model" ? "assistant" : "user", content: m.content });
    }
    const body: any = {
      model: opencodeModel,
      messages: ocMessages,
      temperature,
    };
    if (isJson) body.response_format = { type: "json_object" };
    // RF-007 (PRD_OTIMIZACAO_PLANO_DIARIO): reduz reasoning em chamadas JSON (GLM/gpt-oss)
    if (isJson) body.reasoning_effort = "low";
    // RF-008: timeout parametrizável por chamada (padrão 30s)
    const OC_TIMEOUT_MS = meta?.timeoutMs ?? 30000;
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("[OpenCode] Timeout em " + Math.round(OC_TIMEOUT_MS / 1000) + "s")), OC_TIMEOUT_MS));
    const ocPost = (reqBody: any) => fetch(opencodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKeyToUse.trim()}`,
      },
      body: JSON.stringify(reqBody),
    }).then(async (r) => {
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`[OpenCode] HTTP ${r.status}: ${txt.slice(0, 500)}`);
      }
      return r.json();
    });
    try {
      let res: any;
      try {
        res = await Promise.race([ocPost(body), timeoutPromise]);
      } catch (firstErr: any) {
        // Gateway pode rejeitar reasoning_effort — repete 1x sem o parâmetro (RF-007)
        const msg = String(firstErr?.message || "");
        if (isJson && msg.toLowerCase().includes("reasoning")) {
          console.warn("[OpenCode] reasoning_effort rejeitado, repetindo sem o parâmetro");
          const bodyNoReasoning: any = { ...body };
          delete bodyNoReasoning.reasoning_effort;
          res = await Promise.race([ocPost(bodyNoReasoning), timeoutPromise]);
        } else {
          throw firstErr;
        }
      }
      const ocUsageRaw = res?.usage || {};
      onResolved("opencode", opencodeModel, {
        inputTokens: typeof ocUsageRaw.prompt_tokens === "number" ? ocUsageRaw.prompt_tokens : null,
        outputTokens: typeof ocUsageRaw.completion_tokens === "number" ? ocUsageRaw.completion_tokens : null,
        cachedTokens: typeof ocUsageRaw.prompt_tokens_details?.cached_tokens === "number" ? ocUsageRaw.prompt_tokens_details.cached_tokens : null,
      });
      const content = res.choices?.[0]?.message?.content || res.choices?.[0]?.text || "";
      if (!content) throw new Error("[OpenCode] Resposta vazia");
      if (isJson) {
        const cleaned = extractJsonFromText(content);
        try {
          JSON.parse(cleaned);
          return cleaned;
        } catch {
          return content;
        }
      }
      return content;
    } catch (e: any) {
      console.error("[OpenCode API Error]:", e);
      if (e.message?.toLowerCase().includes("unauthorized") || e.message?.includes("401") || e.message?.includes("403")) {
        throw new Error("Chave OpenCode inválida. Verifique Configurações > Inteligência Artificial > OpenCode.");
      }
      throw new Error(`Erro no OpenCode: ${e.message || "Falha na comunicação"}`);
    }
  }

  const isGroq = apiKeyToUse.trim().startsWith("gsk_") || (customModel && (
    customModel.includes("llama") ||
    customModel.includes("mixtral") ||
    customModel.includes("gemma") ||
    customModel.includes("deepseek-r1") ||
    customModel.includes("qwen") ||
    customModel.startsWith("openai/gpt-oss")
  ));

  if (isGroq) {
    try {
      const groq = new Groq({ apiKey: apiKeyToUse.trim() });
      const groqMessages: any[] = messages.map(msg => ({
        role: msg.role === "assistant" || msg.role === "model" ? "assistant" : "user",
        content: msg.content,
      }));
      if (systemPrompt) {
        groqMessages.unshift({
          role: "system" as const,
          content: systemPrompt,
        });
      }
      // Modelos DESCONTINUADOS pela Groq — NÃO usar, causam erro 400 model_decommissioned
      const LEGACY_MODELS = ["llama3-70b-8192", "llama3-8b-8192", "llama-3.3-70b-specdec"];
      // Apenas substitui modelos legados/descontinuados. Modelos válidos selecionados pelo usuário
      // (ex: llama-3.3-70b-versatile, mixtral-8x7b-32768, deepseek-r1-distill-llama-70b) são usados diretamente.
      let safeModel = customModel || "openai/gpt-oss-20b";
      if (!safeModel || LEGACY_MODELS.includes(safeModel) || safeModel.includes("8192")) {
        safeModel = "openai/gpt-oss-20b";
      }
      onResolved("groq", safeModel);

      // Perf fix: 60s por tentativa + até 4 tentativas = plano pode demorar minutos.
      // 25s é suficiente para o GPT-OSS-20B e falha rápido em caso de pendência.
      // RF-008 (PRD_OTIMIZACAO_PLANO_DIARIO): timeout parametrizável via meta.timeoutMs.
      const GROQ_TIMEOUT_MS = meta?.timeoutMs ?? 25_000;
      const timeoutPromise = () => new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("[Groq] Timeout: A API não respondeu em " + Math.round(GROQ_TIMEOUT_MS / 1000) + " segundos.")), GROQ_TIMEOUT_MS)
      );

      let lastGroqUsage: AiUsage | undefined;
      const requestCompletion = async (jsonMode: boolean, maxTokens?: number, useReasoning?: boolean) => {
        const completion = await Promise.race([
          groq.chat.completions.create({
            messages: groqMessages,
            model: safeModel,
            temperature,
            max_tokens: maxTokens,
            response_format: jsonMode ? { type: "json_object" } : undefined,
            // RF-007: reasoning reduzido em chamadas JSON (modelos gpt-oss)
            ...(useReasoning ? { reasoning_effort: "low" as const } : {}),
          }),
          timeoutPromise(),
        ]) as any;
        const u: any = completion?.usage;
        lastGroqUsage = {
          inputTokens: typeof u?.prompt_tokens === "number" ? u.prompt_tokens : null,
          outputTokens: typeof u?.completion_tokens === "number" ? u.completion_tokens : null,
          cachedTokens: typeof u?.prompt_tokens_details?.cached_tokens === "number" ? u.prompt_tokens_details.cached_tokens : null,
        };
        return completion.choices[0]?.message?.content || "";
      };

      let rawContent = "";

      // Cota de saída compatível com tiers TPM 8000/6000 (ex.: gpt-oss-20b on_demand):
      // input (~1400 no plano diário) + max_tokens precisa ficar abaixo do limite TPM.
      // Planos diários reais têm até ~2.600 tokens de saída — 4096 é folgado e seguro.
      const MAX_OUTPUT_TOKENS = isJson ? 4096 : undefined;
      const MAX_OUTPUT_TOKENS_BAIXO = 3000;

      let needsJsonMode = isJson;
      let maxTokens = MAX_OUTPUT_TOKENS;
      let reasoningLow = isJson;
      let attemptCount = 0;

      while (attemptCount < 4) {
        attemptCount++;
        try {
          rawContent = await requestCompletion(needsJsonMode, maxTokens, reasoningLow);
          break;
        } catch (attemptError: any) {
          const msg = String(attemptError?.message || "");
          const lower = msg.toLowerCase();
          const jsonValidationFailed = needsJsonMode && (msg.includes("json_validate_failed") || msg.includes("Failed to validate JSON"));
          const maxTokensRejected = lower.includes("max_tokens");
          const reasoningRejected = lower.includes("reasoning");
          const tpmLimit = attemptError?.status === 413 || lower.includes("tokens per minute") || lower.includes("rate_limit_exceeded") || lower.includes("request too large");
          const isTimeout = lower.includes("timeout") || lower.includes("não respondeu") || lower.includes("api não responde");
          if ((!jsonValidationFailed && !maxTokensRejected && !tpmLimit && !isTimeout && !reasoningRejected) || (isTimeout && attemptCount >= 2)) throw attemptError;
          console.warn("[Groq] Tentativa falhou, ajustando requisição e tentando de novo:", msg);
          if (jsonValidationFailed) needsJsonMode = false;
          if (maxTokensRejected) maxTokens = undefined;
          if (reasoningRejected) reasoningLow = false;
          if (tpmLimit) maxTokens = maxTokens === undefined || maxTokens === MAX_OUTPUT_TOKENS ? MAX_OUTPUT_TOKENS_BAIXO : Math.max(1024, Math.floor(maxTokens / 2));
        }
      }

      onResolved("groq", safeModel, lastGroqUsage);

      if (!rawContent) {
        throw new Error("Limite de tokens do modelo Groq excedido. Tente novamente em instantes ou selecione um modelo maior (ex.: gpt-oss-120b) nas Configurações.");
      }

      if (isJson) {
        const cleaned = extractJsonFromText(rawContent);
        try {
          JSON.parse(cleaned);
          return cleaned;
        } catch (parseError) {
          console.warn("[Groq] JSON inválido recebido, regenerando sem response_format json_object.");
          rawContent = await requestCompletion(false, MAX_OUTPUT_TOKENS_BAIXO);
          const cleanedFallback = extractJsonFromText(rawContent);
          try {
            JSON.parse(cleanedFallback);
            return cleanedFallback;
          } catch (parseErrorFallback) {
            throw new Error("A IA retornou uma resposta que não é um JSON válido. Tente gerar novamente.");
          }
        }
      }

      return rawContent;
    } catch (groqError: any) {
      console.error("[Groq API Error]:", groqError);
      if (groqError.status === 401 || groqError.status === 403 || groqError.message?.toLowerCase().includes("api key") || groqError.message?.toLowerCase().includes("unauthorized")) {
        throw new Error("A chave da API do Groq está incorreta ou é inválida. Verifique a chave informada nas Configurações.");
      }
      if (groqError.status === 413 || groqError.message?.toLowerCase().includes("tokens per minute") || groqError.message?.toLowerCase().includes("rate_limit_exceeded") || groqError.message?.toLowerCase().includes("request too large")) {
        throw new Error("O modelo Groq atingiu o limite de tokens por minuto (a solicitação é grande demais para ele). Tente novamente em instantes ou selecione um modelo maior (ex.: gpt-oss-120b) nas Configurações.");
      }
      if (groqError.status === 429 || groqError.message?.toLowerCase().includes("rate limit") || groqError.message?.toLowerCase().includes("limit exceeded")) {
        throw new Error("Limite de requisições excedido no Groq. Tente novamente em instantes.");
      }
      throw new Error(`Erro no Groq: ${groqError.message || "Falha na comunicação"}`);
    }
  }

  try {
    const formattedMessages = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Sanitizar e mapear modelos válidos para a API do Google Generative AI
    // Correção 404: gemini-2.0-flash descontinuado → mapear para gemini-3.6-flash (recomendação oficial)
    let safeModel = customModel?.trim() || "gemini-3.6-flash";
    // Normaliza modelos legados/descontinuados para 3.6-flash
    if (
      safeModel === "gemini-3.1-pro-preview" ||
      safeModel === "gemini-3.5-flash" ||
      safeModel.includes("3.1") ||
      safeModel.includes("3.5") ||
      safeModel === "gemini-2.0-flash" ||
      safeModel === "gemini-2.0-flash-exp" ||
      safeModel.includes("2.0")
    ) {
      safeModel = "gemini-3.6-flash";
    } else if (safeModel === "gemini-2.5-pro" || safeModel === "gemini-1.5-pro" || safeModel.includes("2.5")) {
      safeModel = "gemini-1.5-pro";
    } else if (safeModel === "gemini-3.6-flash" || safeModel.includes("3.6")) {
      safeModel = "gemini-3.6-flash";
    } else if (safeModel.includes("flash")) {
      // mantém flash genérico como 3.6 se possível, fallback 1.5
      safeModel = safeModel.includes("3.6") ? "gemini-3.6-flash" : "gemini-1.5-flash";
    }
    onResolved("gemini", safeModel);

    // Gemini Handler com retry para modelos descontinuados (404 is no longer available → fallback 1.5)
    let lastGeminiError: any = null;
    for (let geminiAttempt = 0; geminiAttempt < 2; geminiAttempt++) {
      try {
        const localGenAI = new GoogleGenerativeAI(apiKeyToUse.trim());
        const model = localGenAI.getGenerativeModel({
          model: safeModel,
          systemInstruction: systemPrompt,
          generationConfig: { temperature, ...(isJson ? { responseMimeType: "application/json" as const } : {}) },
        });

        const chat = model.startChat({
          history: formattedMessages.slice(0, -1),
        });
        
        const lastMessage = formattedMessages[formattedMessages.length - 1];
        
        // RF-008: timeout parametrizável por chamada (padrão 60s)
        const GEMINI_TIMEOUT_MS = meta?.timeoutMs ?? 60_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("[Gemini] Timeout: A API não respondeu em " + Math.round(GEMINI_TIMEOUT_MS / 1000) + " segundos.")), GEMINI_TIMEOUT_MS)
        );
        
        const result = await Promise.race([
          chat.sendMessage(lastMessage.parts[0].text),
          timeoutPromise,
        ]);
        if (geminiAttempt > 0) console.warn(`[Gemini] Retry bem-sucedido com fallback ${safeModel}`);
        const gmMeta: any = (result.response as any)?.usageMetadata;
        onResolved("gemini", safeModel, {
          inputTokens: typeof gmMeta?.promptTokenCount === "number" ? gmMeta.promptTokenCount : null,
          outputTokens: typeof gmMeta?.candidatesTokenCount === "number" ? gmMeta.candidatesTokenCount : null,
          cachedTokens: typeof gmMeta?.cachedContentTokenCount === "number" ? gmMeta.cachedContentTokenCount : null,
        });
        return result.response.text();
      } catch (error: any) {
        lastGeminiError = error;
        const msg = String(error?.message || "");
        const lower = msg.toLowerCase();
        const is404NoLongerAvailable = lower.includes("is no longer available") || lower.includes("no longer available") || (error?.status === 404 && lower.includes("not found"));
        const isInteractionsApi = lower.includes("interactions api");
        const canRetry = geminiAttempt === 0 && (is404NoLongerAvailable || isInteractionsApi) && safeModel !== "gemini-1.5-flash";
        if (canRetry) {
          console.warn(`[Gemini] Modelo ${safeModel} descontinuado (404), tentando fallback gemini-1.5-flash. Erro:`, msg.slice(0, 400));
          safeModel = "gemini-1.5-flash";
          onResolved("gemini", safeModel);
          continue;
        }
        // Não é retryable — propaga para handlers abaixo
        if (
          error.status === 429 || 
          error.message?.includes("429") || 
          error.message?.toLowerCase().includes("quota") ||
          error.message?.toLowerCase().includes("limit")
        ) {
          throw new Error(
            "A chave da API do Gemini excedeu o limite de uso (Quota Exceeded / Limite Excedido). " +
            "Verifique sua conta no Google AI Studio."
          );
        }
        
        if (error.status === 403 || error.status === 400 || error.message?.includes("API key") || error.message?.toLowerCase().includes("api_key_invalid")) {
          throw new Error(
            "A chave da API do Gemini está incorreta ou é inválida. " +
            "Verifique a chave informada nas Configurações > Inteligência Artificial."
          );
        }

        // Mensagem orientativa para 404 descontinuado sem retry bem-sucedido
        if (is404NoLongerAvailable || isInteractionsApi) {
          throw new Error(
            `Modelo Gemini descontinuado (${safeModel}). O Google recomenda gemini-3.6-flash. Atualize em Configurações > Inteligência Artificial para gemini-3.6-flash e tente novamente. Detalhe: ${msg.slice(0, 300)}`
          );
        }

        throw new Error(`Erro no Gemini (${error.status || "Falha"}): ${error.message || "Falha ao comunicar com a inteligência artificial."}`);
      }
    }
    throw new Error(`Erro no Gemini (${lastGeminiError?.status || "Falha"}): ${lastGeminiError?.message || "Falha ao comunicar com a inteligência artificial."}`);
  } catch (outerErr: any) {
    // Outer try fallback (should not happen, inner loop already handled)
    throw outerErr;
  }
}

// ── Wrapper público com telemetria (PRD_PROMPTS_IA_CONSOLIDADOS — RF-009/RF-010) ──
// Comportamento idêntico ao anterior (temperature default 0.3). A telemetria é
// escrita de forma não-bloqueante (RN-002) e nunca contém segredos (RN-004).
export async function callGemini(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  isJson: boolean = false,
  customApiKey?: string | null,
  customModel?: string | null,
  temperature?: number,
  meta?: AiCallMeta
): Promise<string> {
  const startedAt = Date.now();
  let provider = "desconhecido";
  let model = customModel?.trim() || "desconhecido";
  let usage: AiUsage | undefined;
  const onResolved: ResolvedCb = (p, m, u) => {
    provider = p;
    model = m;
    if (u) usage = u;
  };
  try {
    const result = await callGeminiImpl(messages, systemPrompt, isJson, customApiKey, customModel, temperature ?? 0.3, onResolved, meta);
    void logAiCall(meta, {
      success: true,
      durationMs: Date.now() - startedAt,
      provider,
      model,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
    });
    return result;
  } catch (e: any) {
    void logAiCall(meta, {
      success: false,
      durationMs: Date.now() - startedAt,
      provider,
      model,
      errorCode: classifyAiErrorCode(e),
      errorMessage: String(e?.message || "").slice(0, 500),
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? null,
    });
    throw e;
  }
}

async function callGeminiWithFilesImpl(
  messages: { role: string; content: string }[], 
  files: { uri: string; mimeType: string }[],
  systemPrompt: string | undefined,
  customApiKey: string | null | undefined,
  customModel: string | null | undefined,
  temperature: number
): Promise<string> {
  const apiKeyToUse = customApiKey || defaultApiKey;

  if (!apiKeyToUse) {
    throw new Error("Chave da API do Gemini não configurada. Por favor, adicione sua chave nas Configurações.");
  }

  try {
    const localGenAI = new GoogleGenerativeAI(apiKeyToUse.trim());
    const model = localGenAI.getGenerativeModel({
      model: customModel || "gemini-3.1-pro-preview", 
      systemInstruction: systemPrompt,
      generationConfig: { temperature },
    });

    const formattedMessages = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
    
    // Add files to the last message
    const lastMessage = formattedMessages[formattedMessages.length - 1];
    
    const fileParts = files.map(f => ({
      fileData: {
        fileUri: f.uri,
        mimeType: f.mimeType
      }
    }));
    
    // Insert files before the text in the parts array
    lastMessage.parts = [...fileParts, ...lastMessage.parts] as any;

    const chat = model.startChat({
      history: formattedMessages.slice(0, -1),
    });

    const result = await chat.sendMessage(lastMessage.parts);
    return result.response.text();
  } catch (error: any) {
    console.error("[Gemini API Error with Files]:", error);
    
    if (error.status === 429 || error.message?.includes("429") || error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("limit")) {
      throw new Error("Limite de quota excedido no Gemini.");
    }
    
    if (error.status === 403 || error.status === 400 || error.message?.includes("API key")) {
      throw new Error("A chave da API do Gemini está incorreta ou é inválida.");
    }

    throw new Error("Falha ao comunicar com a inteligência artificial ao enviar arquivos. Tente novamente.");
  }
}

// Wrapper público com telemetria (PRD RF-009) — assinatura compatível.
export async function callGeminiWithFiles(
  messages: { role: string; content: string }[],
  files: { uri: string; mimeType: string }[],
  systemPrompt?: string,
  customApiKey?: string | null,
  customModel?: string | null,
  temperature?: number,
  meta?: AiCallMeta
): Promise<string> {
  const startedAt = Date.now();
  const modelUsed = customModel || "gemini-3.1-pro-preview";
  try {
    const result = await callGeminiWithFilesImpl(messages, files, systemPrompt, customApiKey, customModel, temperature ?? 0.3);
    void logAiCall(meta, { success: true, durationMs: Date.now() - startedAt, provider: "gemini", model: modelUsed });
    return result;
  } catch (e: any) {
    void logAiCall(meta, {
      success: false,
      durationMs: Date.now() - startedAt,
      provider: "gemini",
      model: modelUsed,
      errorCode: classifyAiErrorCode(e),
      errorMessage: String(e?.message || "").slice(0, 500),
    });
    throw e;
  }
}

