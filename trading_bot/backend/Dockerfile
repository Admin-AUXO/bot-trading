# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
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
RUN npm prune --omit=dev && npm cache clean --force

FROM base AS migrator
ENV NODE_ENV=production
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/prisma.config.ts ./
USER node
CMD ["npm", "run", "db:setup"]

FROM base AS runner
ENV NODE_ENV=production
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./
USER node

EXPOSE 3001
CMD ["node", "dist/index.js"]
