FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    wget \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml pnpm-lock.expected.sha256 ./
COPY patches ./patches
COPY scripts/verify-lockfile.mjs ./scripts/verify-lockfile.mjs
COPY apps ./apps
COPY packages ./packages

RUN pnpm install:verified \
  && pnpm --filter @nnact/api build \
  && mkdir -p /uploads \
  && chown -R node:node /uploads /app/apps/api/dist

ENV NODE_ENV=production
ENV API_PORT=3001
ENV NNPUPLOAD_DIR=/uploads
EXPOSE 3001

USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O - http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

CMD ["pnpm", "--filter", "@nnact/api", "exec", "tsx", "src/server.ts"]
