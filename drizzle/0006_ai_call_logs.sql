-- Migration 0006: ai_call_logs — telemetria de chamadas de IA (PRD_PROMPTS_IA_CONSOLIDADOS RF-009)
-- Idempotente (padrão do projeto: IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer,
  "userId" integer,
  "feature" varchar(60) NOT NULL,
  "promptVersion" varchar(12),
  "provider" varchar(20) NOT NULL,
  "model" varchar(80) NOT NULL,
  "durationMs" integer NOT NULL,
  "success" boolean NOT NULL,
  "errorCode" varchar(30),
  "errorMessage" text,
  "isJson" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_org_created" ON "ai_call_logs" ("organizationId", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_call_logs_feature_created" ON "ai_call_logs" ("feature", "createdAt");
