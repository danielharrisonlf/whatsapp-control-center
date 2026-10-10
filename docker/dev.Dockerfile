# Development image shared by the setup, api and www services.
FROM node:22-alpine
RUN apk add --no-cache openssl libc6-compat wget \
  && corepack enable \
  && corepack prepare pnpm@10.11.1 --activate
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    CI=true
WORKDIR /workspace
