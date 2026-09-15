#!/usr/bin/env python3
import os
import subprocess
import sys

HOST = "179.197.76.174"
USER = "root"
PASSWORD = "Walysson2003@"

askpass_script = "/tmp/ssh_askpass.sh"
with open(askpass_script, "w") as f:
    f.write(f'#!/bin/sh\necho "{PASSWORD}"\n')
os.chmod(askpass_script, 0o755)

env = dict(os.environ)
env["SSH_ASKPASS"] = askpass_script
env["SSH_ASKPASS_REQUIRE"] = "force"
env["DISPLAY"] = "dummy:0"

MIGRATION_SQL = """
-- 1. student_pedagogical_memory
CREATE TABLE IF NOT EXISTS "student_pedagogical_memory" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "studentId" integer NOT NULL UNIQUE,
  "strongPoints" text DEFAULT '[]',
  "weakPoints" text DEFAULT '[]',
  "repertoireMastered" text DEFAULT '[]',
  "repertoireLearning" text DEFAULT '[]',
  "pedagogicalDirectives" text,
  "lastAiAnalysisAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_student_pedagogical_memory_student_org" ON "student_pedagogical_memory" ("studentId", "organizationId");

-- 2. schedule_optimization_logs
CREATE TABLE IF NOT EXISTS "schedule_optimization_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "userId" integer NOT NULL,
  "inputConstraints" text NOT NULL,
  "proposedSchedule" text NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "appliedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_schedule_optimization_logs_org_user" ON "schedule_optimization_logs" ("organizationId", "userId");

-- 3. landing_clients
CREATE TABLE IF NOT EXISTS "landing_clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "logoUrl" text NOT NULL,
  "websiteUrl" text,
  "testimonial" text,
  "order" integer DEFAULT 0 NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- 4. slot_offers
CREATE TABLE IF NOT EXISTS "slot_offers" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer,
  "originalLessonId" integer NOT NULL,
  "teacherId" integer NOT NULL,
  "slotDate" timestamp NOT NULL,
  "duration" integer DEFAULT 60 NOT NULL,
  "instrumentId" integer,
  "title" varchar(255),
  "status" varchar(20) DEFAULT 'aberta' NOT NULL,
  "acceptedByStudentId" integer,
  "acceptedLessonId" integer,
  "acceptedAt" timestamp,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "slot_offers_org_status_idx" ON "slot_offers" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "slot_offers_slot_date_idx" ON "slot_offers" ("slotDate");

-- 5. landing_hero_slides
CREATE TABLE IF NOT EXISTS "landing_hero_slides" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(255) NOT NULL,
  "highlight" varchar(255) NOT NULL,
  "subtitle" text NOT NULL,
  "points" text DEFAULT '[]' NOT NULL,
  "imageUrl" text NOT NULL,
  "bgTheme" varchar(50) DEFAULT 'slate-900' NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- 6. fiscal module
DO $$ BEGIN
  CREATE TYPE regime_tributario AS ENUM ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_emissao_nfse AS ENUM ('automatico', 'manual', 'desativado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fiscal_invoice_status AS ENUM ('draft', 'pending', 'authorized', 'cancelled', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fiscal_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "fiscal_companies" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL UNIQUE,
  "cnpj" varchar(25) NOT NULL,
  "razaoSocial" varchar(255) NOT NULL,
  "nomeFantasia" varchar(255),
  "inscricaoMunicipal" varchar(50),
  "inscricaoEstadual" varchar(50),
  "regimeTributario" regime_tributario DEFAULT 'simples_nacional' NOT NULL,
  "optanteSimplesNacional" boolean DEFAULT true NOT NULL,
  "tipoEmissaoNfse" tipo_emissao_nfse DEFAULT 'automatico' NOT NULL,
  "cep" varchar(20),
  "logradouro" varchar(255),
  "numero" varchar(50),
  "complemento" varchar(100),
  "bairro" varchar(100),
  "cidade" varchar(100),
  "uf" varchar(10),
  "codigoMunicipio" varchar(20),
  "telefone" varchar(30),
  "email" varchar(255),
  "focusCompanyId" varchar(100),
  "focusApiKey" text,
  "certificateA1Status" varchar(30) DEFAULT 'nao_configurado',
  "certificateExpiresAt" timestamp,
  "autoEmitOnPayment" boolean DEFAULT false NOT NULL,
  "emitTiming" varchar(20) DEFAULT 'imediato' NOT NULL,
  "autoEmailInvoice" boolean DEFAULT true NOT NULL,
  "autoRetryErrors" boolean DEFAULT true NOT NULL,
  "status" varchar(30) DEFAULT 'ativo' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fiscal_companies_org_idx" ON "fiscal_companies" ("organizationId");
CREATE INDEX IF NOT EXISTS "fiscal_companies_cnpj_idx" ON "fiscal_companies" ("cnpj");

CREATE TABLE IF NOT EXISTS "fiscal_services" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "nome" varchar(255) NOT NULL,
  "codigoServico" varchar(50) NOT NULL,
  "codigoTributacaoMunicipio" varchar(50),
  "aliquotaIss" numeric(5, 2) DEFAULT 0.00 NOT NULL,
  "naturezaOperacao" varchar(100) DEFAULT '1' NOT NULL,
  "descricaoPadrao" text DEFAULT 'Mensalidade referente a aulas de musica - Competencia {competencia}' NOT NULL,
  "itemListaServico" varchar(20) DEFAULT '08.01',
  "issRetido" boolean DEFAULT false NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fiscal_services_org_idx" ON "fiscal_services" ("organizationId");

CREATE TABLE IF NOT EXISTS "fiscal_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "studentId" integer,
  "paymentId" integer,
  "serviceId" integer,
  "reference" varchar(100) NOT NULL UNIQUE,
  "provider" varchar(50) DEFAULT 'focusnfe' NOT NULL,
  "providerId" varchar(100),
  "numero" varchar(50),
  "serie" varchar(20),
  "codigoVerificacao" varchar(100),
  "status" fiscal_invoice_status DEFAULT 'draft' NOT NULL,
  "valor" numeric(10, 2) NOT NULL,
  "competencia" varchar(30),
  "dataEmissao" timestamp,
  "customerName" varchar(255) NOT NULL,
  "customerTaxId" varchar(30) NOT NULL,
  "customerEmail" varchar(255),
  "customerPhone" varchar(30),
  "serviceDescription" text NOT NULL,
  "pdfUrl" text,
  "xmlUrl" text,
  "errorCode" varchar(100),
  "errorMessage" text,
  "cancelReason" text,
  "cancelledAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fiscal_invoices_org_idx" ON "fiscal_invoices" ("organizationId");
CREATE INDEX IF NOT EXISTS "fiscal_invoices_student_idx" ON "fiscal_invoices" ("studentId");
CREATE INDEX IF NOT EXISTS "fiscal_invoices_payment_idx" ON "fiscal_invoices" ("paymentId");
CREATE INDEX IF NOT EXISTS "fiscal_invoices_status_idx" ON "fiscal_invoices" ("status");
CREATE INDEX IF NOT EXISTS "fiscal_invoices_reference_idx" ON "fiscal_invoices" ("reference");

CREATE TABLE IF NOT EXISTS "fiscal_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "invoiceId" integer NOT NULL,
  "type" varchar(50) DEFAULT 'emit' NOT NULL,
  "status" fiscal_job_status DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "maxAttempts" integer DEFAULT 5 NOT NULL,
  "lastError" text,
  "nextAttemptAt" timestamp DEFAULT now() NOT NULL,
  "processedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fiscal_jobs_org_status_idx" ON "fiscal_jobs" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "fiscal_jobs_invoice_idx" ON "fiscal_jobs" ("invoiceId");
CREATE INDEX IF NOT EXISTS "fiscal_jobs_next_attempt_idx" ON "fiscal_jobs" ("nextAttemptAt");

CREATE TABLE IF NOT EXISTS "fiscal_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "invoiceId" integer,
  "event" varchar(100) NOT NULL,
  "payload" jsonb DEFAULT '{}',
  "userId" integer,
  "userName" varchar(255),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "fiscal_logs_org_idx" ON "fiscal_logs" ("organizationId");
CREATE INDEX IF NOT EXISTS "fiscal_logs_invoice_idx" ON "fiscal_logs" ("invoiceId");
CREATE INDEX IF NOT EXISTS "fiscal_logs_created_at_idx" ON "fiscal_logs" ("createdAt");

-- 7. webhook_events
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "gateway" varchar(50) NOT NULL,
  "gatewayEventId" varchar(255) NOT NULL UNIQUE,
  "eventType" varchar(100) NOT NULL,
  "organizationId" integer,
  "payload" jsonb DEFAULT '{}',
  "status" varchar(50) DEFAULT 'received' NOT NULL,
  "processedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "webhook_events_gateway_event_idx" ON "webhook_events" ("gateway", "gatewayEventId");
CREATE INDEX IF NOT EXISTS "webhook_events_org_idx" ON "webhook_events" ("organizationId");
CREATE INDEX IF NOT EXISTS "webhook_events_status_idx" ON "webhook_events" ("status");

-- 8. whatsapp_rate_limits
CREATE TABLE IF NOT EXISTS "whatsapp_rate_limits" (
  "id" serial PRIMARY KEY NOT NULL,
  "organizationId" integer NOT NULL,
  "userId" integer,
  "windowStart" timestamp NOT NULL,
  "messageCount" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_window_idx" ON "whatsapp_rate_limits" ("organizationId", "windowStart");
CREATE INDEX IF NOT EXISTS "whatsapp_rate_limits_org_idx" ON "whatsapp_rate_limits" ("organizationId");
"""

REMOTE_SCRIPT = f"""
set -e
echo "=========================================="
echo "📦 EXECUTANDO MIGRAÇÕES NO BANCO DE DADOS POSTGRES"
echo "=========================================="

DB_CONTAINER=$(docker ps --format "{{{{.Names}}}}" | grep -E "db|postgres" | head -n 1)
if [ -z "$DB_CONTAINER" ]; then
  echo "❌ Contêiner do banco de dados não encontrado!"
  exit 1
fi

echo "🐳 Contêiner identificado: $DB_CONTAINER"

echo "⚙️ Aplicando DDL / Migrações SQL..."
cat << 'SQL_EOF' | docker exec -i "$DB_CONTAINER" psql -U postgres -d wrmusic
{MIGRATION_SQL}
SQL_EOF

echo ""
echo "🔍 Verificando estrutura da tabela student_pedagogical_memory..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d wrmusic -c "\d student_pedagogical_memory"

echo ""
echo "🔍 Verificando tabelas recém-criadas..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d wrmusic -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('student_pedagogical_memory', 'schedule_optimization_logs', 'landing_clients', 'slot_offers', 'landing_hero_slides', 'fiscal_companies', 'fiscal_services', 'fiscal_invoices', 'fiscal_jobs', 'fiscal_logs', 'webhook_events', 'whatsapp_rate_limits') ORDER BY tablename;"

echo ""
echo "=========================================="
echo "✅ MIGRAÇÃO NO BANCO DE DADOS CONCLUÍDA COM SUCESSO!"
echo "=========================================="
"""

print(f"📡 Conectando à VPS {HOST} via SSH para aplicar migrações...")
ssh_cmd = [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    f"{USER}@{HOST}",
    REMOTE_SCRIPT
]

proc = subprocess.Popen(ssh_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for line in iter(proc.stdout.readline, ''):
    sys.stdout.write(line)
    sys.stdout.flush()

proc.stdout.close()
return_code = proc.wait()
sys.exit(return_code)
