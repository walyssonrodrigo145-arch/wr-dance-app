// AUD-008: Script de diagnóstico standalone — verificar regras de automação e mensalidades.
// Mova para server/scripts/ se for usado regularmente.
import { getDb } from "./db";
import { messageAutomationRules, paymentDues } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("[checkRules] Banco de dados não disponível.");
    process.exit(1);
  }
  const rules = await db.select().from(messageAutomationRules);
  console.log("Rules:", rules.map(r => ({ id: r.id, trigger: r.trigger, offset: r.offsetDays })));
  const dues = await db.select().from(paymentDues).where(eq(paymentDues.status, "pendente"));
  console.log("Dues:", dues.map(d => ({ id: d.id, dueDate: d.dueDate })));
  process.exit(0);
}

main().catch(console.error);
