FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
# These images never render PDFs; skip the browser that puppeteer (an API
# dependency) would otherwise download during install.
ENV PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY patches ./patches
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
RUN node scripts/verify-lockfile.mjs \
  && pnpm fetch --ignore-scripts

COPY packages ./packages
# The agent imports API modules directly (AI registry, WhatsApp transport and
# private media storage), so the API source tree must be present at runtime.
COPY apps/api ./apps/api
COPY apps/agents ./apps/agents
RUN pnpm install --frozen-lockfile --offline --reporter=silent

ENV NODE_ENV=production
USER node
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

CMD ["pnpm", "--filter", "@nnact/agents", "exec", "tsx", "src/index.ts"]
