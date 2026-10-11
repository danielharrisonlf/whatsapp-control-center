# Production image for the web app: static build served by nginx, /api proxied to the API.
# Build from the repository root: docker build -f apps/www/Dockerfile -t wacc-www .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.6 prune @wacc/www --docker

FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
# pnpm patches (nestjs-zod OpenAPI fix) must exist before install.
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@wacc/www

FROM nginx:1.29-alpine AS runner
COPY apps/www/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/www/dist /usr/share/nginx/html
# API_UPSTREAM is substituted into the nginx config at start (e.g. http://api:3000).
ENV API_UPSTREAM=http://api:3000
EXPOSE 80
