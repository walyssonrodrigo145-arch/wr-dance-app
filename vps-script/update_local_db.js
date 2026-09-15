const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS "methodologyFilename" varchar(255);`;
    await sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS "methodologyText" text;`;
    console.log("Local schema updated successfully!");
  } catch (err) {
    console.error("Error updating local schema:", err);
  } finally {
    process.exit(0);
  }
}

main();
