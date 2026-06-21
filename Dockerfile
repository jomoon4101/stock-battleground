FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY index.html styles.css app.js engine.js config.js server.mjs ./

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173

CMD ["node", "server.mjs"]
