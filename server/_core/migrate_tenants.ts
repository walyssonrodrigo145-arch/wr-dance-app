import { debugLog } from "./logger";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export async function runTenantMigrations() {
  debugLog("[Database] Verificando migrações de isolamento de dados (Multi-tenancy)...");
  const db = await getDb();
  if (!db) return;

  try {
    // 1. Obter um usuário administrador padrão para atribuir dados órfãos
    const adminUser = await db.execute(sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const defaultUserId = adminUser[0]?.id;

    if (!defaultUserId) {
      console.warn("[Database] Nenhum usuário administrador encontrado. Pulando migração de tenants.");
      return;
    }

    const tables = ["instruments", "students", "lessons", "monthly_stats", "payment_dues"];

    for (const table of tables) {
      // Adicionar coluna se não existir (como nullable primeiro)
      await db.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "userId" integer`));

      // Atribuir dados existentes ao administrador padrão
      await db.execute(sql.raw(`UPDATE "${table}" SET "userId" = ${defaultUserId} WHERE "userId" IS NULL`));

      // Tornar a coluna NOT NULL
      try {
        await db.execute(sql.raw(`ALTER TABLE "${table}" ALTER COLUMN "userId" SET NOT NULL`));
      } catch (e) {
        // Ignorar se já for NOT NULL
      }
    }

    debugLog("[Database] Migrações de isolamento concluídas!");
  } catch (error: any) {
    console.error("[Database] Erro na migração de tenants:", error.message);
  }
}
