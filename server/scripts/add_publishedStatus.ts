import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function run() {
  const db = await getDb();
  if (!db) return;

  try {
    await db.execute(sql`ALTER TABLE "daily_study_plans" ADD COLUMN "publishedStatus" text DEFAULT 'rascunho' NOT NULL;`);
    console.log("Column added successfully");
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("Column already exists");
    } else {
      console.error(e);
    }
  }
  process.exit(0);
}

run().catch(console.error);
