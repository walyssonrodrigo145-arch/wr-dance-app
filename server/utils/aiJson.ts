// ─── Contrato padronizado para respostas JSON da IA ──────────────────────────
// (PRD_PROMPTS_IA_CONSOLIDADOS — RF-003)
// callGemini(isJson) → extração → validação zod → retry com feedback → erro
// orientativo. Orçamento de tempo global (budgetMs) impede retries infinitos.

import type { z } from "zod";
import type { AiCredentials } from "./aiProvider";
import { callGemini, extractJsonFromText } from "./gemini";

export interface CallAiJsonOptions<T> {
  prompt: string;
  schema: z.ZodType<T>;
  credentials: AiCredentials;
  feature: string;
  promptVersion?: string;
  organizationId?: number | null;
  userId?: number | null;
  budgetMs?: number;
  maxAttempts?: number;
  temperature?: number;
  /** Injeção de dependência para testes (substitui a chamada à IA). */
  invoke?: (attemptPrompt: string) => Promise<string>;
}

export class AiJsonError extends Error {
  attempts: number;
  lastIssues: string[];
  constructor(feature: string, attempts: number, lastIssues: string[]) {
    super(`A IA retornou um formato inesperado para ${feature}. Tente novamente.`);
    this.name = "AiJsonError";
    this.attempts = attempts;
    this.lastIssues = lastIssues;
  }
}

export async function callAiJson<T>(opts: CallAiJsonOptions<T>): Promise<T> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const startedAt = Date.now();
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // RF-001: orçamento de tempo — não inicia nova tentativa sem folga razoável.
    const elapsed = Date.now() - startedAt;
    if (attempt > 1 && elapsed + 25_000 > budgetMs) {
      throw new AiJsonError(opts.feature, attempt - 1, lastIssues);
    }

    const attemptPrompt =
      attempt === 1
        ? opts.prompt
        : `${opts.prompt}\n\nATENÇÃO: A tentativa anterior retornou um JSON inválido ou fora do schema esperado${
            lastIssues.length > 0 ? ` (problemas: ${lastIssues.slice(0, 3).join("; ")})` : ""
          }. Retorne APENAS um JSON válido no formato especificado, sem texto fora do JSON.`;

    const raw = opts.invoke
      ? await opts.invoke(attemptPrompt)
      : await callGemini(
          [{ role: "user", content: attemptPrompt }],
          undefined,
          true,
          opts.credentials.apiKey,
          opts.credentials.model,
          opts.temperature ?? 0.2,
          {
            organizationId: opts.organizationId ?? null,
            userId: opts.userId ?? null,
            feature: opts.feature,
            promptVersion: opts.promptVersion ?? null,
            isJson: true,
          }
        );

    const cleaned = extractJsonFromText(raw);
    let candidate: unknown;
    try {
      candidate = JSON.parse(cleaned);
    } catch {
      lastIssues = ["resposta não é JSON parseável"];
      continue;
    }

    const parsed = opts.schema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
    lastIssues = parsed.error.issues.map((i) => `${i.path.join(".") || "raiz"}: ${i.message}`);
  }

  throw new AiJsonError(opts.feature, maxAttempts, lastIssues);
}
