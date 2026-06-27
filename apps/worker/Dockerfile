# OpenFieldPro background worker (recurring jobs + reminders).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY apps/api/src/recurrence.ts ./apps/api/src/recurrence.ts
RUN pnpm install --filter @ofp/worker... --frozen-lockfile=false

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ofp/worker", "exec", "tsx", "src/index.ts"]
