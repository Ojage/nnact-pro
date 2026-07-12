FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
COPY apps ./apps
COPY packages ./packages

RUN pnpm install:verified

ENV NODE_ENV=production
USER node

CMD ["node", "--experimental-strip-types", "apps/worker/src/index.ts"]
