import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client);

async function run() {
  await client`TRUNCATE attendance_tokens`;
  console.log("Truncated attendance_tokens");
  process.exit(0);
}
run().catch(console.error);
