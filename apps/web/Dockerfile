# OpenFieldPro web (Next.js 15). Standard build → next start.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --filter @ofp/web... --frozen-lockfile=false
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @ofp/web build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ofp/web", "start"]
