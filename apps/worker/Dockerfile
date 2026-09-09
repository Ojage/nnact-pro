FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Lockfile-first: populate the pnpm store once (see apps/api/Dockerfile).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY patches ./patches
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
RUN node scripts/verify-lockfile.mjs \
  && pnpm fetch --ignore-scripts

# Source after deps: only apps/worker + packages invalidate this build.
COPY packages ./packages
# The worker imports api source modules directly (../../api/src/...), so the
# api tree must be present at runtime; its deps (drizzle/@nnact-*) are all in
# the worker's own dependency set and land in the node_modules linked below.
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --offline --reporter=silent

ENV NODE_ENV=production
USER node

# Warm the corepack cache for the runtime user (build-time cache lives under
# root, the container runs as node and would otherwise fetch pnpm on boot).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

CMD ["pnpm", "--filter", "@nnact/worker", "exec", "tsx", "src/index.ts"]