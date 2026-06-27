# OpenFieldPro API. Runs the TS sources via tsx (clean workspace .ts resolution).
# ponytail: tsx-in-prod trades a slightly larger image for zero build friction
# across the pnpm workspace. Upgrade path: precompile with tsc for a slim image.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install deps using the whole workspace manifest set (cache-friendly).
COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @ofp/api... --frozen-lockfile=false

EXPOSE 3001
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ofp/api", "exec", "tsx", "src/server.ts"]
