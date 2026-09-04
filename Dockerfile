# syntax=docker/dockerfile:1.7
#
# plchat — встраиваемый чат-виджет банка.
# Образ собирает монорепо (pnpm + turbo) и отдаёт два артефакта через nginx:
#   /loader.js  — IIFE-скрипт, который хост вставляет <script src="...">
#   /widget/    — SPA виджета (React-приложение в iframe, base="/widget")
#
# Env-переменные (runtime):
#   NGINX_PORT — порт nginx (default: 8080)
#
# Зоны встраивания заданы правилом в nginx-конфиге и в bridge.ts,
# /_matrix проксирует Ingress — образ отдаёт только статику.

# ── Stage 1: сборка ──────────────────────────────────────────────────────────
FROM nexus.isb/library/node:24-alpine-obru AS build
WORKDIR /app

ENV COREPACK_NPM_REGISTRY="https://nexus.isb/repository/npmjs-npm-proxy/"
ENV NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"
ENV npm_config_registry="https://nexus.isb/repository/npmjs-npm-proxy/"

# Версия из package.json#packageManager — воспроизводимая сборка.
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate

# Сначала только манифесты: слой pnpm install кешируется пока lock-файл не менялся.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/package.json  packages/protocol/
COPY packages/loader/package.json    packages/loader/
COPY packages/widget/package.json    packages/widget/
COPY tools/host-demo/package.json    tools/host-demo/
COPY tools/matrix-mock/package.json  tools/matrix-mock/

RUN pnpm install --frozen-lockfile

# Исходники + сборка prod-пакетов (только packages/*, tools/ не собирается).
COPY . .

RUN pnpm build

# ── Stage 2: runtime (nginx, отдача статики) ─────────────────────────────────
FROM nexus.isb/library/nginx:1.27-alpine-obru AS runtime

# Шаблон конфига: nginx прогоняет envsubst по /etc/nginx/templates/*.
# NGINX_ENVSUBST_FILTER ограничивает подстановку только NGINX_*-переменными,
# чтобы не затереть nginx-переменные $uri / $request_uri / $host.
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Виджет-SPA (index.html + assets/*) — под /widget/, как и ожидает widgetUrl() в loader.
COPY --from=build /app/packages/widget/dist /usr/share/nginx/html/widget

# Лоадер — один файл в корне без Sourcemap.
COPY --from=build /app/packages/loader/dist/loader.js /usr/share/nginx/html/loader.js

# Убрать дефолтный Welcome to nginx из root образа (PL-04).
RUN rm -f /usr/share/nginx/html/index.html

ENV NGINX_PORT=8080 \
    NGINX_ENVSUBST_FILTER=^NGINX_

EXPOSE 8080

# CMD/ENTRYPOINT наследуются от базового nginx-образа.
