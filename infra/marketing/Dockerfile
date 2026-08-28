# Builds the public marketing site (nnact-webapp) for export to a host directory.
# Source is supplied as an additional build context (no git clone — repo is private).
#
# Usage:
#   docker buildx build -f infra/marketing/Dockerfile \
#     --build-context marketing=/path/to/nnact-webapp \
#     --output "type=local,dest=${NNPMARKETING_ROOT}" .

FROM node:22-alpine AS build
WORKDIR /src
COPY --from=marketing . .
RUN npm ci
RUN npm run build
RUN if [ -f google9f7ee614cc6527c5.html ]; then cp google9f7ee614cc6527c5.html dist/; fi

FROM scratch
COPY --from=build /src/dist /
