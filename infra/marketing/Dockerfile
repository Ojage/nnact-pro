# Builds the public marketing site (nnact-webapp) for export to a host directory.
# Usage (on the VPS):
#   docker buildx build -f infra/marketing/Dockerfile \
#     --output "type=local,dest=${NNPMARKETING_ROOT:-/srv/nnact-webapp/dist}" .

FROM node:22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
ARG MARKETING_REPO=https://github.com/Ojage/nnact-webapp.git
ARG MARKETING_GIT_REF=main
RUN git clone --depth 1 --branch "${MARKETING_GIT_REF}" "${MARKETING_REPO}" .
RUN npm ci
RUN npm run build
RUN if [ -f google9f7ee614cc6527c5.html ]; then cp google9f7ee614cc6527c5.html dist/; fi

FROM scratch
COPY --from=build /src/dist /
