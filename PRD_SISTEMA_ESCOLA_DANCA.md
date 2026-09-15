# PRD — Sistema de Gestão para Escolas de Dança (DancePro / DançaPro)

---

## 1. Visão Geral

### Problema
O **MusicPro** é uma plataforma madura e robusta de gestão para escolas de música (abrangendo financeiro Asaas, controle de planos diários/mensais, agenda de salas e professores, presença via QR Code, portal do aluno, avisos e cobrança automatizada). 
No entanto, o mercado de **escolas, academias e estúdios de dança** possui termos, dinâmicas de turmas, ensaios e vocabulário específicos (ex: "Modalidades / Ritmos", "Coreografias / Ensaios", "Turmas coletivas / Níveis", "Salas de Ensaio / Espelhos"), tornando estranho para um proprietário de estúdio de dança utilizar uma ferramenta com termos musicais ("Instrumentos", "Partituras", "Cifras", etc.). Além disso, a gestão de ambos os nichos deve ser 100% isolada e independente.

### Objetivo
Duplicar o projeto **MusicPro** em um novo repositório e infraestrutura autônoma (projeto novo, Docker isolado, banco de dados Postgres separado, domínio próprio e variáveis de ambiente distintas), mantendo toda a base sólida de código (React, Tailwind, Node.js, tRPC, Drizzle ORM, integração Asaas, Web Push, PWA), adaptando o vocabulário, branding, entidades de domínio e fluxos para atender perfeitamente **Escolas e Estúdios de Dança**.

### Contexto
- **Zero Interligação:** O novo sistema de dança operará de forma totalmente desacoplada do MusicPro original. Nenhuma tabela, banco de dados, sessão, webhook ou chave de API será compartilhada.
- **Aproveitamento de 90%+ da Engenharia:** Toda a esteira de CI/CD, deploy via Docker/VPS, scripts de automação (`automationJob.ts`), regras financeiras de juros/multa (`BillingEngine.ts`), e componentes UI já testados serão reutilizados.

---

## 2. Usuários Envolvidos

* **Administrador / Dono do Estúdio de Dança:** Gerencia turmas de modalidades (Ballet, Jazz, Dança de Salão, Hip Hop, etc.), mensalidades, professores/coreógrafos, eventos/apresentações de fim de ano e fluxo de caixa.
* **Professor / Coreógrafo:** Acessa agenda de aulas, faz chamada/presença dos alunos por turma, registra faltas e acompanha o plano de aula/evolução coreográfica.
* **Aluno / Dançarino / Responsável:** Acessa o portal/PWA para visualizar suas turmas, horários, pagamentos (Pix/Boleto Asaas), avisos da escola e materiais/vídeos das coreografias.
* **Recepcionista / Atendente:** Check-in via QR Code na portaria da academia de dança, cadastro de novos alunos e recebimento no balcão.

---

## 3. Escopo

### Incluído
1. **Estruturação do Novo Projeto:**
   - Criação de novo repositório isolado (ex: `wr-dance-app` / `dance-pro`).
   - Novo `docker-compose.yml`, `Dockerfile`, scripts de build e `.env.production` independentes.
   - Novo banco de dados PostgreSQL exclusivo (sem qualquer conexão com o banco do MusicPro).
   - Configuração de novo domínio (ex: `app.dancepro.com.br` ou subdomínio do cliente com SSL Nginx/Traefik).
2. **Branding e Design System:**
   - Novo logotipo, favicon, PWA icons e nome do sistema (DancePro / WR Dance).
   - Paleta de cores temática mantendo o padrão Dark / Modern / Glassmorphism sofisticado.
3. **Adaptação de Domínio e Terminologias:**
   - De *Instrumento* ➔ Para *Modalidade / Ritmo* (ex: Ballet Clássico, Dança Contemporânea, Jazz, Forró, Salsa, K-Pop).
   - De *Músicas / Repertório / Cifras* ➔ Para *Coreografias / Trilhas / Sequências*.
   - De *Professor de Música* ➔ Para *Professor / Coreógrafo*.
   - De *Sala de Estudo / Ensaio Musical* ➔ Para *Sala de Ensaio / Estúdio (ex: Sala 1 com Espelho, Sala de Tablado)*.
   - Ajuste nos formulários de cadastro de aula, planos de estudo e relatórios.
4. **Isolamento de Webhooks e Integrações:**
   - Configuração de conta/webhook Asaas dedicado para o novo sistema.
   - Configuração de Firebase Web Push independente (projeto FCM novo).

### Fora do Escopo
- Sincronização de dados entre MusicPro e DancePro (requisito explícito: sistemas totalmente isolados).
- Criação de recursos não existentes no core atual (ex: streaming próprio de vídeo em tempo real — será utilizado o padrão atual de links de vídeo/Google Drive/YouTube para trilhas/vídeos de ensaio).

---

## 4. Requisitos Funcionais

### RF-001 — Configuração e Desacoplamento do Ambiente
- **Descrição:** O novo repositório deve rodar independentemente, com seus próprios scripts de migração (`drizzle-kit push`/`migrate`), porta e contêineres Docker.
- **Atores:** DevOps / Sistema.
- **Pré-condições:** Servidor/VPS provisionado com portas e rede Docker livres.
- **Fluxo Principal:**
  1. O código é clonado em um diretório isolado do servidor.
  2. O arquivo `.env` próprio é preenchido com credenciais exclusivas (`DATABASE_URL`, `SESSION_SECRET`, `ASAAS_API_KEY`, `VITE_APP_NAME="DancePro"`).
  3. O build e contêiner sobem em porta dedicada (ex: `3001` ou via rede interna do proxy reverso).
  4. O Nginx direciona o domínio exclusivo para essa aplicação.

### RF-002 — Adaptação dos Cadastros Base (Modalidades de Dança)
- **Descrição:** Em vez de cadastrar instrumentos musicais (Guitarra, Bateria, Piano), o sistema deve permitir o cadastro de Modalidades de Dança e Níveis (Iniciante, Intermediário, Avançado, Infantil/Kids, Juvenil, Adulto).
- **Atores:** Administrador.
- **Pré-condições:** Usuário logado com perfil de administrador.
- **Fluxo Principal:**
  1. O usuário acessa a tela de configurações / modalidades.
  2. Cadastra uma nova modalidade (ex: "Ballet Clássico").
  3. Define níveis, faixa etária recomendada e cor de identificação na grade de horários.
  4. Salva o registro.
- **Dados Envolvidos:** Tabela adaptada de `instruments` ➔ `modalities` (ou mantida a compatibilidade com display `Modalidades`).

### RF-003 — Grade de Aulas e Salas de Ensaio
- **Descrição:** A agenda deve refletir estúdios/salas de dança com suporte a turmas com limite de capacidade física (lotação por m² de espelho/tablado).
- **Atores:** Administrador, Professor.
- **Fluxo Principal:**
  1. Na criação de aula/turma, seleciona-se a Sala de Ensaio e a Capacidade Máxima de alunos.
  2. O sistema bloqueia ou avisa quando o limite de alunos na turma for excedido.

### RF-004 — Diário de Classe e Evolução Coreográfica
- **Descrição:** Na tela do professor/aula, o registro de progresso foca nas sequências coreográficas, postura, flexibilidade e preparação para apresentações/espetáculos.
- **Atores:** Professor/Coreógrafo.

### RF-005 — Gestão Financeira com Asaas Isolada
- **Descrição:** Cada pagamento gerado para os alunos da escola de dança é enviado exclusivamente para a subconta/conta Asaas daquela instituição, com retornos de webhook tratados pela instância do DancePro.
- **Atores:** Sistema / Alunos.

---

## 5. Regras de Negócio

### RN-001 — Isolamento Total de Dados (Multi-Tenant Zero)
- **Regra:** Não existirá banco compartilhado nem roteamento compartilhado de banco entre MusicPro e DancePro.
- **Consequência:** Se o MusicPro for reiniciado, alterado ou sofrer manutenção, o DancePro não sofrerá nenhum impacto, e vice-versa.

### RN-002 — Terminologia Fiel ao Nicho de Dança
- **Regra:** Em nenhum local visível ao usuário (títulos, botões, modais, e-mails, push notifications, PDFs) deverão constar termos de instrumentos musicais ("partitura", "afinação", "cifra"). Devem ser substituídos por termos de dança ("coreografia", "modalidade", "trilha sonora", "ensaio").

### RN-003 — Capacidade Máxima de Turmas Coletivas
- **Regra:** Como na dança a maioria das aulas é coletiva e depende do espaço físico da sala, a validação de lotação de turma é mandatória no agendamento de novas matrículas.

---

## 6. Fluxos de Usuário

### Fluxo de Criação e Configuração da Nova Instância
```text
Desenvolvedor / DevOps
         ↓
Duplica repositório para wr-dance-app
         ↓
Executa script de substituição de branding e termos
         ↓
Gera novo banco PostgreSQL isolado
         ↓
Configura .env com novas chaves e novo domínio
         ↓
Executa migrações Drizzle (seed inicial adaptado para dança)
         ↓
Sobe contêiner Docker no servidor VPS com Nginx e SSL
         ↓
DancePro online e 100% operacional
```

---

## 7. Casos Extremos (Edge Cases)

1. **Colisão de Portas na Mesma VPS:** Se o DancePro rodar no mesmo servidor físico do MusicPro, ele DEVE utilizar portas de host diferentes (ex: MusicPro porta `3000`, DancePro porta `3002`) e nomes de contêineres Docker distintos (ex: `dancepro_app` vs `musicpro_app`).
2. **Tokens de Notificação Push (FCM):** Cada app deve ter seu próprio Service Worker e chave `vapidKey` para que um aviso do MusicPro nunca chegue no celular de um aluno de dança.
3. **Webhooks Asaas Duplicados:** A URL cadastrada no painel do Asaas para o DancePro deve apontar exclusivamente para o endpoint do domínio do DancePro (ex: `https://app.dancepro.com.br/api/asaas/webhook`).

---

## 8. Arquitetura e Estrutura de Pastas Proposta

```
wr-dance-app/
├── client/
│   ├── src/
│   │   ├── components/       # Componentes com nomes e ícones adaptados
│   │   ├── pages/            # Telas de Gestão de Dança, Aulas, Ensaios
│   │   └── lib/              # Utilitários de moeda, data e tema
├── server/
│   ├── routers/              # tRPC routers (modalities, lessons, rehearsals)
│   ├── services/             # BillingEngine, AsaasService, NotificationService
│   └── automationJob.ts      # Rotinas cron financeiras independentes
├── drizzle/                  # Migrações do banco de dados de dança
├── docker-compose.yml        # Docker compose independente (app + postgres + redis)
└── .env.example              # Exemplo de variáveis de ambiente do DancePro
```

---

## 9. Plano de Implementação Sugerido

### Fase 1 — Criação da Base do Projeto e Duplicação Limpa
- Criar a pasta do novo projeto (`wr-dance-app`).
- Limpar histórico git antigo e iniciar novo repositório limpo (`git init`).
- Configurar novo `package.json` com nome `dance-pro` / `wr-dance-app`.

### Fase 2 — Infraestrutura Docker e Banco de Dados
- Criar `docker-compose.yml` com nomes de containers e volumes isolados (`dance_db`, `dance_app`).
- Criar script de inicialização do banco de dados Postgres independente.
- Configurar arquivo de variáveis de ambiente com novos segredos.

### Fase 3 — Adaptação de Domínio, Banco de Dados e Types
- Refatorar o schema Drizzle (`shared/schema.ts` e `@shared/types`):
  - Alinhar tabelas ou aliases de `instruments` para `modalities`.
  - Configurar dados iniciais de seed (Ballet, Dança de Salão, Jazz, Dança Urbana, etc.).

### Fase 4 — Refatoração do Frontend (Branding e Telas)
- Atualizar textos da UI: menu lateral, cabeçalhos, diálogos de agendamento de ensaios/aulas.
- Atualizar identidade visual: logotipo, favicon, título da aba no navegador.
- Revisar modais de aula para destacar formato coletivo e lista de presença.

### Fase 5 — Configuração de Deploy e Domínio
- Configuração do proxy reverso (Nginx) e certificado Let's Encrypt para o novo domínio de dança.
- Testes end-to-end de cobrança Asaas e agendamento.
