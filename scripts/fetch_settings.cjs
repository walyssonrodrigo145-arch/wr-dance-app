const { getDb } = require('./server/db');
async function test() {
  const db = await getDb();
  const res = await db.execute(`SELECT "whatsappBotUrl", "whatsappBotToken", "userId" FROM "settings" LIMIT 5`);
  console.log(res);
  process.exit(0);
}
test();
