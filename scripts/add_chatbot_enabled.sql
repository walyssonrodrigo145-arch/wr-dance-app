-- Migração: Adicionar campo chatbotEnabled na tabela settings
-- Execute este script diretamente no banco de produção (VPS)

ALTER TABLE settings ADD COLUMN IF NOT EXISTS "chatbotEnabled" INTEGER NOT NULL DEFAULT 0;

-- Confirmar:
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'settings' AND column_name = 'chatbotEnabled';
