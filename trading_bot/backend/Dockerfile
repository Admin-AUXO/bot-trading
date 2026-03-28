# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS builder
ENV DATABASE_URL=postgresql://botuser:botpass@postgres:5432/trading_bot
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force

FROM base AS migrator
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/prisma.config.ts ./

CMD ["npm", "run", "db:setup"]

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
