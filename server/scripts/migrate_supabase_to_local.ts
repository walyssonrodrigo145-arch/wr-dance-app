import postgres from "postgres";

const sourceUrl = process.env.SUPABASE_URL!;
const targetUrl = process.env.DATABASE_URL!;

if (!sourceUrl) {
  console.error("Erro: Por favor, defina a variável de ambiente SUPABASE_URL.");
  process.exit(1);
}

if (!targetUrl) {
  console.error("Erro: Por favor, defina a variável de ambiente DATABASE_URL.");
  process.exit(1);
}

// AUD-014 FIX: Asserções explícitas para que o TS reconheça os valores como string após as guards
const sourceSql = postgres(sourceUrl);
const targetSql = postgres(targetUrl);

const tables = [
  "organizations",
  "users",
  "professores",
  "instruments",
  "students",
  "lessons",
  "monthly_stats",
  "settings",
  "reminder_templates",
  "payment_dues",
  "asaas_customers",
  "expenses",
  "student_goals",
  "student_timeline",
  "student_files",
  "announcements",
  "chat_messages",
  "reschedule_requests",
  "student_evolution",
  "daily_study_plans",
  "notifications",
  "ai_conversations",
  "ai_messages",
  "chatbot_sessions",
  "fcm_tokens",
  "reminders"
];

async function run() {
  console.log("=== INICIANDO MIGRAÇÃO SUPABASE -> VPS LOCAL ===");
  console.log(`Origem (Supabase): ${sourceUrl.split("@")[1] || "Supabase"}`);
  console.log(`Destino (Local): ${targetUrl.split("@")[1] || "Local"}`);

  // 1. Limpar as tabelas no banco local em ordem REVERSA de dependência
  console.log("\n1. Limpando dados existentes no banco local...");
  const reverseTables = [...tables].reverse();
  for (const table of reverseTables) {
    try {
      console.log(`   - Limpando tabela: ${table}`);
      await targetSql`DELETE FROM ${targetSql(table)}`;
    } catch (err: any) {
      console.warn(`   ⚠️ Aviso ao limpar ${table}: ${err.message}`);
    }
  }

  // 2. Copiar dados em ordem direta de dependência
  console.log("\n2. Copiando dados da origem para o destino...");
  for (const table of tables) {
    try {
      // Obter dados da origem
      const rows = await sourceSql`SELECT * FROM ${sourceSql(table)}`;
      if (rows.length === 0) {
        console.log(`   - Tabela ${table}: Vazia (0 registros)`);
        continue;
      }

      console.log(`   - Tabela ${table}: Copiando ${rows.length} registros...`);

      // Inserir no destino em lotes de 100 para evitar limites de tamanho de query
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        await targetSql`INSERT INTO ${targetSql(table)} ${targetSql(chunk)}`;
      }

      // Resetar a sequência de ID (auto-increment)
      try {
        const seqCheck = await targetSql`
          SELECT pg_get_serial_sequence(${table}, 'id') as seq
        `;
        if (seqCheck[0] && seqCheck[0].seq) {
          const seqName = seqCheck[0].seq;
          await targetSql`
            SELECT setval(${seqName}::regclass, COALESCE(MAX(id), 1)) FROM ${targetSql(table)}
          `;
        }
      } catch (seqErr: any) {
        console.warn(`     ⚠️ Não foi possível resetar sequência da tabela ${table}: ${seqErr.message}`);
      }

    } catch (err: any) {
      console.error(`   ❌ ERRO ao copiar tabela ${table}:`, err.message);
    }
  }

  console.log("\n=== MIGRAÇÃO CONCLUÍDA COM SUCESSO! ===");
  
  await sourceSql.end();
  await targetSql.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("Erro fatal durante a migração:", err);
  await sourceSql.end();
  await targetSql.end();
  process.exit(1);
});
