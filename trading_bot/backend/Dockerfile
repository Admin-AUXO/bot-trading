# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV npm_config_update_notifier=false \
    npm_config_fund=false
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

FROM deps AS builder
COPY . .
RUN npm run db:generate
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

FROM base AS migrator
ENV NODE_ENV=production
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/prisma.config.ts ./
USER node
CMD ["npm", "run", "db:setup:dangerous"]

FROM base AS runner
ENV NODE_ENV=production
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/src ./src
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/.local ./.local
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./
RUN install -d -o node -g node /app/.local
USER node

EXPOSE 3101
CMD ["node", "dist/index.js"]
