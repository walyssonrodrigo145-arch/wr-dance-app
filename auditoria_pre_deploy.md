# Auditoria Pré-Deploy — Resolução do Erro ao Gerar Plano Diário e Foco Estrito em Metas

**Data:** 26/08/2026  
**Auditor Responsável:** `wrauditor` (QA Sênior & Gerente de Projeto)  
**Escopo:** Correção da tabela `student_pedagogical_memory`, blindagem defensiva e reestruturação do prompt da IA para geração anônima (sem nome do aluno) e foco exclusivo nas metas cadastradas.

---

## 1. Diagnóstico da Falha e Causa Raiz Estrutural

- **Sintoma 1 (Erro de Banco):** Ao gerar plano diário na tela de Progresso, a aplicação disparava erro tRPC por tabela inexistente `student_pedagogical_memory`.
- **Causa Raiz 1:** A tabela foi definida no schema mas não sincronizada no boot via `ensureSchemaConsistency` em `server/db.ts`.
- **Sintoma 2 (Desvio Didático e Nome no Plano):** O prompt gerava textos contendo o nome do aluno e matérias dispersas não cadastradas nas metas da semana.
- **Causa Raiz 2:** O prompt injetava `${student.name}` no schema JSON e permitia que a IA alucinasse tópicos complementares fora do array `studentGoals`.

---

## 2. Alterações Realizadas

1. **Auto-Criação de Tabelas no Startup (`server/db.ts`):**
   - Inclusão com `safeExecute` de `student_pedagogical_memory` e seu índice `idx_student_pedagogical_memory_student_org`.
   - Inclusão de todas as tabelas e enums recentes do schema.
2. **Blindagem Defensiva na Geração do Plano Diário (`server/routers/progressRouters.ts`):**
   - Adicionado `.catch()` com fallback para `[]` na query de `studentPedagogicalMemory`.
   - Adicionado `try/catch` seguro ao deserializar `strongPoints`, `weakPoints` e `repertoireLearning`.
3. **Reengenharia de Prompt para Anonimização e Foco em Metas (`server/routers/progressRouters.ts`):**
   - Remoção de qualquer referência a `${student.name}` no prompt e no schema de saída.
   - Regra absoluta e inviolável proibindo nomes de pessoas no corpo do plano e forçando foco exclusivo nas metas ativas cadastradas em `studentGoals`.
4. **Blindagem no Router de IA Avançada (`server/advancedAiRouter.ts`):**
   - Proteção defensiva com `.catch()` e tratamento de JSON no `getPedagogicalMemory`.
5. **Migração Drizzle (`drizzle/0004_pedagogical_memory_and_missing_tables.sql`):**
   - Arquivo SQL de migração adicionado para conformidade com o histórico Drizzle.
6. **Especificação PRD (`PRD_PLANO_DIARIO_METAS.md`):**
   - PRD completo estruturado conforme o padrão `/prdspec`.

---

## 3. Validações e Conformidade

- **Regras de Negócio e Contratos de API:** Inalterados. Nenhuma assinatura de endpoint tRPC foi alterada.
- **Risco de Quebra:** Baixo / Nulo.
- **Testes de Banco:** Tabela `student_pedagogical_memory` e índices validados em produção.

---

## 4. Conclusão e Aval

Auditoria **APROVADA**. Sistema blindado e pronto para deploy seguro via `devopsmaster`.
