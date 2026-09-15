# Documentação de Referência - Groq API & SDK

Esta documentação serve de base para o desenvolvimento e manutenção das integrações com a Groq usando o `groq-sdk` em TypeScript/Node.js.

## 1. Instalação e Inicialização

O SDK oficial deve ser instalado através do NPM:
```bash
npm install groq-sdk
```

Para inicializar o cliente:
```typescript
import Groq from "groq-sdk";

// Inicializa o cliente com a chave fornecida. 
// Em produção, a chave deve vir do banco de dados (por organização/usuário) ou de variáveis de ambiente.
const groq = new Groq({ 
  apiKey: "sua_chave_de_api"
});
```

## 2. Chamada Básica (Chat Completions)

A Groq segue o mesmo formato de request e response da OpenAI.

```typescript
async function main() {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Você é um assistente virtual prestativo.",
        },
        {
          role: "user",
          content: "Qual é a capital do Brasil?",
        },
      ],
      // Sempre garanta que o modelo selecionado é um modelo válido e atual.
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
    });

    console.log(chatCompletion.choices[0]?.message?.content);
  } catch (error: any) {
    console.error("Erro na integração com Groq:", error.message);
  }
}
```

## 3. Modelos Recomendados (Atualizados)

Sempre verifique a disponibilidade dos modelos. Não utilize modelos marcados como *Decommissioned* na [documentação oficial](https://console.groq.com/docs/models).

Modelos recomendados e velozes:
- `llama-3.3-70b-versatile` - Excelente para tarefas gerais, raciocínio avançado e programação.
- `llama-3.1-8b-instant` - Extremamente rápido, ideal para respostas leves, curtas e chats dinâmicos.
- `mixtral-8x7b-32768` - Bom para contextos maiores e Mixture of Experts.
- `gemma2-9b-it` - Alternativa leve do Google na infraestrutura da Groq.

**Nota Crítica de Erros**:
O modelo `llama3-70b-8192` e o `llama3-8b-8192` foram **descontinuados** (Decommissioned). Se eles forem chamados, a API retornará o erro 400 `model_decommissioned`.

## 4. Diferenças de Papéis (Roles) entre Groq e Gemini

Quando o MusicPro precisa alternar ou converter históricos de mensagens, atente-se a esta diferença:

- **Gemini**: Utiliza os papéis `user` e `model`.
- **Groq**: Utiliza os papéis `system`, `user` e `assistant`.

Se tentar enviar o papel `model` para a Groq, ocorrerá um erro de `invalid_request_error`. Faça o mapeamento correto antes de enviar o payload para a Groq:
```typescript
const groqMessages = history.map(msg => ({
  role: msg.role === 'model' ? 'assistant' : msg.role,
  content: msg.content
}));
```

## 5. Exemplo de Parsing de Erro

Se o usuário fornecer uma chave incorreta, a API pode falhar de diversas formas. Trate as exceções com cuidado para não derrubar a aplicação (Crash).

```typescript
try {
  // Chamada...
} catch (error: any) {
  if (error.status === 401) {
    throw new Error("A Chave da API do Groq informada está incorreta ou é inválida.");
  } else if (error.error?.code === 'model_decommissioned') {
    throw new Error("O modelo selecionado não está mais disponível. Atualize as configurações de IA.");
  } else {
    throw new Error(`Erro desconhecido na Groq: ${error.message}`);
  }
}
```
