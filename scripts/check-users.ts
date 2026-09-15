import { db } from "./server/db";
import { users } from "./drizzle/schema";

async function main() {
  const result = await db.select({ id: users.id, name: users.name, orgId: users.organizationId }).from(users);
  console.log(result.filter(r => (r.name || "").toLowerCase().includes("demo")));
  process.exit(0);
}
main();
