# PRD — Plano Diário de Estudo Direto, Curto e em Linguagem Simples (Zero Encheção de Linguiça)

## 1. Visão Geral

### Problema
O plano de estudo diário atual ainda é gerado com **excesso de texto, explicações longas e vocabulário formal/acadêmico**, gerando uma "parede de texto" cansativa tanto para o professor revisar quanto para o aluno praticar no dia a dia. Quando o aluno abre o WhatsApp ou o portal, ele não quer ler um ensaio pedagógico; ele quer um **checklist prático, rápido e direto ao ponto** com o que ele precisa tocar em cada minuto.

### Objetivo
Reformular completamente o tom, o tamanho e a densidade das instruções do gerador de planos de estudo, transformando-o em um **Roteiro de Treino Ultra Direto (Estilo Checklist Rápido)**:
1. **Menos explicativo, 100% acionável:** Substituir parágrafos explicativos por comandos curtos ("Faça X", "Toque Y a Z BPM", "Repita N vezes").
2. **Linguagem simples e acessível:** Qualquer pessoa (criança, jovem ou adulto iniciante) deve entender a instrução em 3 segundos.
3. **Frases curtas (máximo 1 linha por item):** Eliminar subtítulos redundantes e termos teóricos rebuscados.
4. **Formato enxuto e visualmente limpo:** Perfeito para visualização no WhatsApp e no Portal do Aluno.

### Contexto
- **Módulo:** Progresso do Aluno (`server/routers/progressRouters.ts` e `client/src/pages/Progresso.tsx`).

---

## 2. Usuários Envolvidos

* **Aluno:** Abre o plano no celular e entende imediatamente o que fazer sem preguiça de ler.
* **Professor:** Revisa o plano gerado em 5 segundos, sem textos prolixos para editar.

---

## 3. Comparativo de Tom: Antes vs Novo Padrão

| Seção | Como está gerando hoje (Prolixo/Denso) ❌ | Novo Padrão Direto e Simples (Checklist) ✅ |
| :--- | :--- | :--- |
| **Objetivo da Semana** | *"Praticar e consolidar os acordes de Ré maior e Dó maior, desenvolvendo postura, digitação e coordenação entre as mãos."* | *"Dominar os acordes Ré (D) e Dó (C) e fazer a troca sem parar o ritmo."* |
| **Foco do Dia** | *"Aprender a posição dos dedos para tocar Ré maior com a mão direita. Consolidar a postura e o toque firme."* | *"Montar e memorizar o acorde de Ré maior (D)."* |
| **Aquecimento** | *"Alongue os dedos e faça a escala de cinco dedos em D (D‑E‑F#‑G‑A) com a mão direita, usando os dedos 1‑5. Mantenha os ombros relaxados..."* | • Toque as notas D, E, F#, G, A subindo e descendo 5 vezes.<br>• Mantenha os ombros relaxados e pulso solto. |
| **Prática Principal** | *"Posicione os dedos 1‑3‑5 da mão direita nas teclas D, F# e A para formar o acorde de Ré maior. Toque o acorde em ritmo de 4 tempos a 60 BPM, contando 1‑2‑3‑4, e repita 8 vezes. Evite que os dedos se soltem..."* | • Mão direita: Dedo 1 no Ré, Dedo 3 no Fá# e Dedo 5 no Lá.<br>• Toque o acorde 10 vezes no metrônomo a 60 BPM (conte 1, 2, 3, 4).<br>• Mão esquerda: aperte a tecla Ré junto para fazer o baixo. |
| **Desafio do Dia** | *"Desafio: toque o acorde de Ré maior mantendo o pedal de sustain pressionado por 4 compassos sem mudar a pressão das teclas. Meta cumprida quando o som permanecer uniforme..."* | • Feche os olhos, solte a mão e monte o acorde de Ré de primeira.<br>• Meta: acertar 3 vezes seguidas sem errar nenhuma nota. |
| **Dica Final** | *"Mantenha os dedos levemente curvados, pressione as teclas com firmeza e use o pedal de sustain apenas para ligar as notas..."* | *"Se o som sair abafado, curve mais as pontas dos dedos e aperte até o fundo da tecla."* |

---

## 4. Requisitos Funcionais

### RF-001 — Regra de Frase Curta (Máximo 1 a 2 linhas por ponto)
- **Descrição:** Cada item em `points` deve conter no máximo 12 a 18 palavras.
- **Formato:** Iniciar sempre com verbo de ação no imperativo ("Toque", "Monte", "Aperte", "Conte", "Repita", "Aumente").

### RF-002 — Linguagem Popular e Musical Simples
- **Descrição:** Usar a nomenclatura prática do dia a dia da música (nome da nota + cifra, ex: *"Ré (D)"*, *"Dó (C)"*).
- **Proibição:** Não usar jargões acadêmicos como *"dinâmica mezzo-forte"*, *"falanges proximais"*, *"sustentação isócrona"*, etc.

### RF-003 — Exercícios em Formato Passo a Passo Numerado
- **Descrição:** A Prática Principal deve ser apresentada em 3 passos numéricos simples:
  - 1. Posição das mãos/dedos.
  - 2. Repetições no metrônomo com BPM definido.
  - 3. Aplicação prática (ritmo ou troca).

### RF-004 — Limpeza dos Subtítulos Intermediários no Formatador
- **Descrição:** O formatador de texto do WhatsApp (`formatPlanAsText` em `Progresso.tsx`) não deve imprimir subtítulos redundantes que poluem o visual. Deve formatar os exercícios de forma limpa:
  ```text
  📅 Dia 1: Montar o Acorde de Ré (D)
  
  🔹 Aquecimento (6 min)
  - Toque D-E-F#-G-A subindo e descendo 5 vezes.
  - Relaxe os ombros e respire fundo.
  
  🔹 Prática Principal (18 min)
  - Posição: Dedos 1(Ré), 3(Fá#) e 5(Lá) na mão direita.
  - Metrônomo: Toque o acorde 10x contando 1-2-3-4 a 60 BPM.
  - Mão esquerda: Adicione a nota Ré no baixo a cada compasso.
  
  🔹 Desafio (6 min)
  - Feche os olhos e monte o acorde de Ré de primeira.
  - Meta: Acertar 3 vezes seguidas sem olhar.
  ```

---

## 5. Regras de Negócio

### RN-001 — Proibição de Textos Longos (Zero Parágrafos)
- É estritamente proibido gerar parágrafos explicativos com mais de 2 frases. Toda instrução deve ser um ponto objetivo de ação.

### RN-002 — Foco 100% nas Metas Cadastradas
- Se a meta for "Acordes D e C", o treino só fala de D e C. Sem inventar escalas complexas, modos ou exercícios fora do foco.

### RN-003 — Valores Numéricos Claros (Metrônomo e Séries)
- Todo exercício de prática deve ter um número claro: quantos BPM, quantas repetições, quantos compassos ou minutos.

---

## 6. Critérios de Aceite

* [x] **CA-001:** O texto gerado para cada dia é lido em menos de 15 segundos.
* [x] **CA-002:** Todos os pontos utilizam linguagem simples, clara e sem jargões rebuscados.
* [x] **CA-003:** O formato no WhatsApp e na tela do sistema é limpo, organizado em tópicos curtos e visualmente leve.
* [x] **CA-004:** Nenhuma menção ao nome da pessoa e nenhuma matéria fora das metas cadastradas.

---

## 7. Plano de Implementação

1. **Ajuste de Prompt em `server/routers/progressRouters.ts`:**
   - Forçar estilo ultra conciso, checklist com verbos de ação, limite rigoroso de palavras por linha e simplificação de termos técnicos.
2. **Ajuste do Formatador em `client/src/pages/Progresso.tsx`:**
   - Otimizar `formatPlanAsText` para remover subtítulos repetitivos e gerar um layout super clean e escaneável.
