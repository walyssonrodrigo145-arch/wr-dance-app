import postgres from 'postgres';
import { config } from 'dotenv';
config();

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  console.log("Connected to DB.");
  try {
    await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hasSeenTutorial" boolean DEFAULT false NOT NULL;`;
    console.log("Column added successfully.");
  } catch (err) {
    console.error("Error adding column:", err);
  } finally {
    await sql.end();
  }
}

main();
