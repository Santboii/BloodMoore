FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN npm ci --ignore-scripts

COPY shared/ ./shared/
COPY server/ ./server/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "server/src/index.ts"]
