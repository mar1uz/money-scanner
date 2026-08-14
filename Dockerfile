# Multi-stage production Dockerfile for Money Scanner (Cloud Run)
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root manifests and workspace configs
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/money-line/package*.json ./packages/money-line/
COPY packages/money-line/tsconfig.json ./packages/money-line/
COPY packages/market-data/package*.json ./packages/market-data/
COPY packages/market-data/tsconfig.json ./packages/market-data/
COPY packages/social-analysis/package*.json ./packages/social-analysis/
COPY packages/social-analysis/tsconfig.json ./packages/social-analysis/
COPY packages/ai-analysis/package*.json ./packages/ai-analysis/
COPY packages/ai-analysis/tsconfig.json ./packages/ai-analysis/
COPY packages/notifications/package*.json ./packages/notifications/
COPY packages/notifications/tsconfig.json ./packages/notifications/
COPY apps/api/package*.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY apps/worker/tsconfig.json ./apps/worker/
COPY apps/web/package*.json ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/

RUN npm ci

# Copy full source code
COPY . .

# Build all packages and applications
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/money-line/package*.json ./packages/money-line/
COPY --from=builder /app/packages/money-line/dist ./packages/money-line/dist
COPY --from=builder /app/packages/market-data/package*.json ./packages/market-data/
COPY --from=builder /app/packages/market-data/dist ./packages/market-data/dist
COPY --from=builder /app/packages/social-analysis/package*.json ./packages/social-analysis/
COPY --from=builder /app/packages/social-analysis/dist ./packages/social-analysis/
COPY --from=builder /app/packages/ai-analysis/package*.json ./packages/ai-analysis/
COPY --from=builder /app/packages/ai-analysis/dist ./packages/ai-analysis/
COPY --from=builder /app/packages/notifications/package*.json ./packages/notifications/
COPY --from=builder /app/packages/notifications/dist ./packages/notifications/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/worker/package*.json ./apps/worker/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

RUN npm ci --omit=dev

EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
