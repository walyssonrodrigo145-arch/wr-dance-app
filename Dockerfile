FROM node:20-alpine

WORKDIR /app

# Instalar dependências necessárias para o build
RUN apk add --no-cache python3 make g++ 

# Copiar arquivos de dependência
COPY package.json pnpm-lock.yaml ./

# Instalar pnpm v9 compatível com lockfileVersion 9
RUN npm install -g pnpm@9

# Instalar dependências do projeto
RUN pnpm install --shamefully-hoist

# Copiar o resto do código
COPY . .

# Declaração de argumentos de build para compilação do Vite
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY
ARG VITE_VAPID_PUBLIC_KEY

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

# Construir a aplicação
RUN pnpm run build

# Expor a porta que a aplicação usa (geralmente 5000)
EXPOSE 5000

# Script de inicialização
CMD ["pnpm", "start"]
