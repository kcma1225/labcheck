FROM node:22-bookworm-slim AS qa
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
FROM qa AS build
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/migrations ./migrations
RUN mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 8787
CMD ["node", "dist-server/server.js"]
