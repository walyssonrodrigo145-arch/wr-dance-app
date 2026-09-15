import * as dotenv from 'dotenv';
dotenv.config();
import { getDb } from './server/db.ts';
import { sql } from 'drizzle-orm';

(async () => {
  const db = await getDb();
  if (!db) {
    console.error('No DB connection');
    process.exit(1);
  }

  try {
    await db.execute(sql`ALTER TABLE payment_dues ADD COLUMN IF NOT EXISTS "asaasId" text, ADD COLUMN IF NOT EXISTS "asaasPaymentLink" text, ADD COLUMN IF NOT EXISTS "asaasBillingType" varchar(30);`);
    console.log('Altered payment_dues.');
    
    await db.execute(sql`CREATE TABLE IF NOT EXISTS asaas_customers (id serial PRIMARY KEY, "organizationId" integer, "studentId" integer NOT NULL, "asaasCustomerId" text NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL);`);
    console.log('Created asaas_customers.');
  } catch (e) {
    console.error('Migration error:', e);
  }
  process.exit(0);
})();
