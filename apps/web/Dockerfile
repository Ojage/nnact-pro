FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
COPY apps ./apps
COPY packages ./packages

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install:verified \
  && pnpm --filter @ofp/web build \
  && chown -R node:node /app/apps/web/.next

ENV NODE_ENV=production
EXPOSE 3000
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["pnpm", "--filter", "@ofp/web", "start"]
