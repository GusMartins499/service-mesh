FROM node:26.5-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

FROM node:26.5-alpine AS build

WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

RUN npm run build

##########
# prod-deps: apenas dependências de produção
##########
FROM node:26.5-alpine AS prod-deps

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev

##########
# runner: imagem final, mínima e sem privilégios
##########
FROM node:26.5-alpine AS runner

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./

# roda como usuário não-root já presente na imagem oficial
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
