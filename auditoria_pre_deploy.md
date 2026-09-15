# Auditoria Pré-Deploy — Resolução das Abas Duplicadas de Modalidades e Especialização DancePro

**Data:** 15/09/2026  
**Auditor Responsável:** `wrauditor` (QA Sênior & Braço Direito)  
**Escopo:** Correção da duplicidade de abas em `client/src/pages/Relatorios.tsx`, especialização de metas de dança em `client/src/components/progresso/MetasMusicais.tsx`, limpeza de referências no portal do aluno (`Dashboard.tsx`) e registro de novidades em `shared/releases.ts`.

---

## 1. Diagnóstico da Falha e Causa Raiz Estrutural

- **Sintoma:** Dois botões idênticos "Modalidades" na barra horizontal de navegação de relatórios (`/relatorios`).
- **Causa Raiz Estrutural:** Durante o processo inicial de renomeação de termos, o antigo `instrumentos` e o existente `modalidades` foram ambos mapeados para a mesma chave `key: 'modalidades'` e label `Modalidades` no `TAB_CONFIG` de `Relatorios.tsx`. No switch de renderização, o segundo caso de `modalidades` sobrescrevia o primeiro e impedia alternância correta.
- **Resolução:**
  - Separado semanticamente em:
    1. `formatos` ("Formato de Aula"): Distribuição e faturamento de matrículas *Individual vs Turma*.
    2. `modalidades` ("Estilos & Ritmos"): Distribuição de alunos por estilo/ritmo (Ballet, Jazz, Forró, Danças Urbanas, etc.).

---

## 2. Especialização DancePro Aplicada

1. **Metas Corporais & Técnicas (`MetasMusicais.tsx`):**
   - Título adaptado para "Metas de Dança & Coreografia".
   - Subtítulo ajustado para "Acompanhamento de Objetivos Corporais & Técnicos".
   - Placeholder com exemplos autênticos de dança (*"Ex: Pirueta dupla en dehors, abertura zerada, sequência coreográfica de Jazz"*).
2. **Dashboard do Aluno (`student/Dashboard.tsx`):**
   - Remoção de import residual de instrumento (`Guitar`).
   - Adaptação dos cards para foco em ensaios, presença e ritmo.
3. **Changelog Oficial (`shared/releases.ts`):**
   - Inclusão do release `2026.09.15.2` documentando as correções e especialização de dança.

---

## 3. Validações Técnicas

- **TypeScript (`pnpm check`):** Executado e finalizado com sucesso (código de saída 0).
- **Contratos tRPC:** Preservados rigorosamente sem alteração de assinaturas.

---

## 4. Conclusão e Aval

Auditoria **APROVADA**. Sistema limpo e pronto para commit, push e deploy na VPS via `devopsmaster`.
