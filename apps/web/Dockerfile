FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Lockfile-first: populate the pnpm store once (see apps/api/Dockerfile).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY patches ./patches
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
RUN node scripts/verify-lockfile.mjs \
  && pnpm fetch --ignore-scripts

ARG NEXT_PUBLIC_API_URL=http://localhost:3003
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Source after deps: only apps/web + packages invalidate this build.
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --offline --reporter=silent \
  && pnpm --filter @nnact/web build \
  && chown -R node:node /app/apps/web/.next

ENV NODE_ENV=production
EXPOSE 3000
USER node

# Warm the corepack cache for the runtime user (build-time cache lives under
# root, the container runs as node and would otherwise fetch pnpm on boot).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["pnpm", "--filter", "@nnact/web", "start"]