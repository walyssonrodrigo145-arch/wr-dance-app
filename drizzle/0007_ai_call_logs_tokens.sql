-- Migration 0007: telemetria de tokens em ai_call_logs (PRD_OTIMIZACAO_PLANO_DIARIO RF-009)
-- Idempotente (padrão do projeto: IF NOT EXISTS).

ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "inputTokens" integer;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "outputTokens" integer;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD COLUMN IF NOT EXISTS "cachedTokens" integer;
