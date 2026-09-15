# PRD — Geração de Plano Diário Focado em Metas (Sem Nome do Aluno)

## 1. Visão Geral

### Problema
Atualmente, o gerador de plano diário de estudo com Inteligência Artificial (`progress.generateDailyStudyPlan`) injeta o nome do aluno no prompt e no JSON de saída (ex.: `"weeklyGoal": "Resumo motivador para João..."`). Além disso, o prompt permite que a IA introduza conteúdos musicais genéricos, históricos passados e tópicos aleatórios que extrapolam o que o professor determinou como meta da semana. Isso gera dispersão didática e planos de estudo que não refletem com fidelidade o objetivo pedagógico cadastrado.

### Objetivo
Reformular a engenharia de prompt e a lógica de geração de planos diários para:
1. **Anonimizar o conteúdo gerado:** Não citar o nome do aluno em nenhum campo textual do plano (mantendo a linguagem direta, técnica, motivadora e impessoal/orientada à prática).
2. **Restringir o escopo didático exclusivamente às Metas cadastradas (`studentGoals`):** A IA deve explicar, destrinchar e criar exercícios baseando-se **única e exclusivamente** nas metas ativas cadastradas pelo professor para aquele aluno, garantindo fidelidade total ao cronograma pedagógico.

### Contexto
- **Módulo:** Progresso do Aluno / Geração de Planos de Estudo com IA.
- **Arquivos Envolvidos:** `server/routers/progressRouters.ts` (`generateDailyStudyPlan`), `client/src/pages/Progresso.tsx`.

---

## 2. Usuários Envolvidos

* **Professor / Educador:** Cadastra as metas pedagógicas do aluno e clica em "Gerar Plano Diário". Deseja que a IA atue como uma extensão da sua aula, explicando e detalhando exatamente o que ele prescreveu na meta.
* **Aluno / Estudante:** Visualiza no seu portal ou WhatsApp a rotina de 5 dias de treino, focada 100% no conteúdo da meta que deve dominar para a próxima aula.
* **Administrador da Escola:** Acompanha a adesão e qualidade pedagógica dos planos gerados.

---

## 3. Escopo

### Incluído
- Reestruturação do prompt em `server/routers/progressRouters.ts` (`generateDailyStudyPlan`).
- Proibição explícita no system prompt da IA sobre inclusão do nome do aluno no JSON gerado.
- Priorização e amarração estrita do conteúdo dos 5 dias de exercícios aos títulos e descrições das metas ativas (`studentGoals`).
- Reformulação do formato do `weeklyGoal` e `importantMessage` para orientações técnicas e conceituais puras sobre as metas.
- Tratamento para quando não existirem metas cadastradas (orientação imperativa ao professor).

### Fora do Escopo
- Alterações no schema de banco de dados (`student_goals`, `daily_study_plans`).
- Alterações no layout visual da página do aluno ou da aba de progresso.

---

## 4. Requisitos Funcionais

### RF-001 — Omissão Nominal do Aluno no Conteúdo do Plano
**Descrição:** O plano de estudo gerado não deve conter o nome próprio do aluno em nenhuma de suas propriedades textuais (`weeklyGoal`, `importantMessage`, `focus.title`, `focus.description`, `exercises.title`, `exercises.subtitle`, `exercises.points`).  
**Atores:** Professor, Sistema (IA).  
**Pré-condições:** Professor aciona a mutation `progress.generateDailyStudyPlan`.  
**Fluxo:** O sistema monta o prompt sem instruir o uso do nome e adiciona uma regra negativa estrita: *"NÃO inclua o nome do aluno em nenhum texto do plano."*  
**Resultado Esperado:** Todos os textos do plano utilizam tratamento direto (ex.: *"Pratique o exercício com metrônomo a 60 BPM"* em vez de *"João, pratique o exercício..."*).

### RF-002 — Foco Estrito e Exclusivo nas Metas Cadastradas
**Descrição:** 100% dos exercícios dos 5 dias devem explicar e desenvolver os tópicos presentes nas metas ativas (`studentGoals` com `status = 'pendente'`) do aluno.  
**Atores:** Professor, Sistema (IA).  
**Pré-condições:** O aluno possui uma ou mais metas cadastradas no sistema.  
**Fluxo:**
1. O backend busca as metas ativas do aluno (`studentGoals`).
2. O prompt instrui a IA a pegar cada meta (título + descrição) e criar a progressão dos 5 dias exclusivamente baseada nelas.
3. Se houver 1 meta, os 5 dias destrincham essa meta em: Dia 1 (fundamentos/postura), Dia 2 (execução lenta/precisão), Dia 3 (aumento gradual de tempo), Dia 4 (aplicação prática/musical), Dia 5 (revisão e consolidação).
4. Se houver 2 ou mais metas, a IA distribui as metas entre os dias sem adicionar tópicos externos.  
**Resultado Esperado:** O plano não aborda assuntos, técnicas ou repertórios que não constem nas metas cadastradas.

### RF-003 — Comportamento Sem Metas Cadastradas
**Descrição:** Se o aluno não tiver nenhuma meta cadastrada no momento da geração, o sistema deve informar claramente que o plano necessita de metas cadastradas para um direcionamento preciso.  
**Atores:** Professor, Sistema.  
**Fluxo:** No prompt, se `goals.length === 0`, o sistema instrui a IA a focar apenas na técnica base do instrumento e emitir aviso no `importantMessage`: *"Atenção: Nenhuma meta cadastrada para este aluno. Cadastre as metas na aba Progresso para um plano 100% personalizado."*

---

## 5. Regras de Negócio

### RN-001 — Proibição de Menção Nominal (Anonimização no Plano)
**Regra:** Em nenhuma hipótese o nome do aluno deve ser impresso nos campos de texto do plano gerado pela IA.
- **Exemplo Válido:** `"weeklyGoal": "Dominar a digitação da Escala Pentatônica Menor de Lá (Am) com palhetada alternada precisa."`
- **Exemplo Inválido:** `"weeklyGoal": "Resumo do plano de estudos para o aluno Carlos: dominar a escala..."`
- **Consequência:** A linguagem deve ser sempre impessoal, instrutiva e focada na execução técnica do instrumento.

### RN-002 — Alinhamento Restrito às Metas
**Regra:** A IA está estritamente proibida de inventar matérias ou introduzir tópicos não solicitados nas metas do aluno.
- **Exemplo Válido:** Meta cadastrada: *"Música Asa Branca - Primeiros 8 compassos"*. Exercícios: Aquecimento de digitação nas notas da introdução de Asa Branca, Prática dos compassos 1 a 4, Prática dos compassos 5 a 8.
- **Exemplo Inválido:** Meta cadastrada: *"Música Asa Branca"*, e a IA gera exercícios de *"Arpejos Diminutos"* e *"Teoria de Modos Gregos"*.
- **Consequência:** O aluno treina com foco cirúrgico no objetivo pedagógico real.

### RN-003 — Explicação Técnica Passo a Passo
**Regra:** Cada exercício deve conter instruções práticas de *como* executar a meta (postura, digitação, velocidade de metrônomo recomendada, o que ouvir e o que evitar).

---

## 6. Fluxos de Usuário

### Fluxo Principal (Geração com Metas)
```text
Professor acessa a aba "Progresso" do aluno
↓
Verifica as metas ativas ("Escala Maior em Dó", "Metrônomo a 80 bpm")
↓
Clica no botão "Gerar Plano Diário"
↓
Sistema busca instrumento, nível e metas ativas
↓
IA compila plano de 5 dias destrinchando unicamente as metas cadastradas (sem citar nome)
↓
Plano gerado é exibido como rascunho para conferência do professor
↓
Professor clica em "Liberar Plano" ou "Enviar via WhatsApp"
```

### Fluxo Alternativo (Sem Metas Cadastradas)
```text
Professor clica em "Gerar Plano Diário" para aluno sem metas
↓
Sistema identifica lista de metas vazia
↓
IA gera plano baseado nos fundamentos essenciais do instrumento e nível
↓
Campo "importantMessage" orienta o professor a cadastrar metas específicas
```

---

## 7. Casos Extremos (Edge Cases)

1. **Aluno com meta muito curta (ex: "Acorde C"):** A IA deve destrinchar a formação do acorde no Dia 1, troca lenta no Dia 2, ritmo constante no Dia 3, aplicação com playback no Dia 4, e teste de clareza das cordas no Dia 5.
2. **Aluno com 4 metas cadastradas simultaneamente:** A IA deve dedicar os Dias 1 a 4 para cada meta individual e o Dia 5 para a integração de todas.
3. **Meta com texto longo / observações do professor:** A IA prioriza as instruções contidas na descrição da meta para personalizar os exercícios.
4. **Metas com termos em inglês ou notação de cifras (ex.: "Bb7M", "Drop 2"):** A IA deve respeitar a notação musical e explicar a digitação no instrumento selecionado.

---

## 8. Dados Envolvidos

| Tabela / Entidade | Campo Utilizado | Finalidade no Prompt |
| :--- | :--- | :--- |
| `students` | `instrumentId`, `level`, `notes` | Contexto de instrumento e nível de dificuldade |
| `instruments` | `name`, `category` | Vocabulário e especificidades técnicas do instrumento |
| `student_goals` | `title`, `description`, `status` | **Fio condutor exclusivo** de todo o conteúdo gerado |
| `daily_study_plans` | `planText`, `publishedStatus` | Persistência do JSON estruturado |

---

## 9. Permissões e Segurança

- Apenas professores e administradores autenticados vinculados à mesma `organizationId` do aluno podem solicitar a geração do plano.
- O isolamento multitenant (`organizationId`) permanece rigorosamente obrigatório na busca das metas e na persistência do plano.

---

## 10. Tratamento de Erros

- **Erro de IA / JSON inválido:** Retentativa com fallback e mensagem amigável: *"A IA retornou um formato inválido. Clique em Gerar novamente."*
- **Aluno sem metas:** Geração não é bloqueada, mas exibe aviso instrutivo incentivando o cadastro de metas.
- **Falha de conexão com a API de IA:** Erro tratado informando se a chave de API (Groq/Gemini) está configurada corretamente.

---

## 11. Requisitos Não Funcionais

- **RNF-001 (Latência):** A resposta da IA deve ser gerada em até 8 segundos.
- **RNF-002 (Consistência):** O plano deve conter rigorosamente 5 dias em formato JSON válido compatível com os cards da interface.
- **RNF-003 (Clareza Textual):** Linguagem motivadora, técnica e em português do Brasil, sem gírias inadequadas ou metalinguagem desnecessária.

---

## 12. Critérios de Aceite

- **CA-001 (Sem Nome):** Dado um aluno de nome "Gabriel Silva", quando o plano for gerado, então o texto retornado não deve conter a palavra "Gabriel" nem "Silva".
- **CA-002 (Aderência às Metas):** Dado que o aluno possui a meta *"Dedilhado P-I-M-A na progressão Am - Dm - E7"*, quando o plano for gerado, então todos os 5 dias devem exercitar essa progressão e esse padrão de dedilhado.
- **CA-003 (Divisão de Tempo):** A soma dos minutos (Aquecimento + Prática + Desafio) deve totalizar exatamente o tempo diário configurado (ex: 30 minutos).
- **CA-004 (Validação JSON):** O payload retornado deve ser parseável sem erros e conter o array `days` com 5 elementos.

---

## 13. Riscos e Dependências

- **Risco:** A IA gerar termos de instrumentos divergentes se o instrumento não estiver associado ao aluno.
  - **Mitigação:** Validação prévia de `instrumentId` com alerta instrutivo.
- **Dependência:** Chave de API ativa no cadastro da escola (Gemini ou Groq).

---

## 14. Métricas de Sucesso

- 100% dos planos gerados sem nomes de pessoas no texto.
- 100% de aderência dos tópicos de exercícios às metas ativas cadastradas.
- Redução de edições manuais pós-geração pelos professores.

---

## 15. Plano de Implementação Sugerido

### Fase 1 — Backend & Prompt Engineering
- Atualizar o prompt em `server/routers/progressRouters.ts` (`generateDailyStudyPlan`).
- Remover `${student.name}` de todos os títulos, mensagens e schemas do prompt.
- Inserir a diretriz de ouro: *"Foco 100% fechado nas metas cadastradas. Não introduza assuntos que não estejam descritos nas metas."*

### Fase 2 — Validação e Testes
- Testar geração para alunos com 1 meta, múltiplas metas e sem metas.
- Validar ausência de nomes nos campos do JSON.
- Testar envio via WhatsApp e visualização no Portal do Aluno.
