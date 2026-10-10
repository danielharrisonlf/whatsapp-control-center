# Production image for the API.
# Build from the repository root: docker build -f apps/api/Dockerfile -t wacc-api .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat && corepack enable && corepack prepare pnpm@10.11.1 --activate
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true

# Only the workspace packages the API needs (turbo prune keeps the lockfile consistent).
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.6 prune @wacc/api --docker

# Build with all dependencies.
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
# pnpm patches (nestjs-zod OpenAPI fix) must exist before install.
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @wacc/api exec prisma generate && pnpm turbo run build --filter=@wacc/api

# Production dependencies only, with the generated Prisma client.
FROM base AS prod-deps
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter @wacc/api exec prisma generate

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl dumb-init
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo ./
COPY --from=builder --chown=node:node /repo/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=node:node /repo/apps/api/dist ./apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/health || exit 1
# dumb-init forwards SIGTERM so Nest shutdown hooks run.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
