# syntax=docker/dockerfile:1.7
#
# bankchat — встраиваемый чат-виджет банка.
# Образ собирает монорепо (pnpm + turbo) и отдаёт два артефакта через nginx:
#   /loader.js  — IIFE-скрипт, который хост вставляет <script src="...">
#   /widget/    — SPA виджета (React-приложение в iframe, base="/widget")
#
# Env-переменные (runtime):
#   NGINX_PORT      — порт nginx (default: 8080)
#   MATRIX_BACKEND  — если задан, nginx проксирует /_matrix/* сюда
#   DNS_RESOLVER    — DNS для резолва апстрима (default: 127.0.0.11 — Docker DNS)

# ── Stage 1: сборка ──────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

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
FROM nginx:1.27-alpine AS runtime

# Шаблон конфига: nginx прогоняет envsubst по /etc/nginx/templates/*.
# NGINX_ENVSUBST_FILTER ограничивает подстановку только NGINX_*-переменными,
# чтобы не затереть nginx-переменные $uri / $request_uri / $host.
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Скрипт включает прокси /_matrix только при заданном MATRIX_BACKEND.
COPY docker/nginx/30-matrix-proxy.sh /docker-entrypoint.d/30-matrix-proxy.sh

# Виджет-SPA (index.html + assets/*) — под /widget/, как и ожидает widgetUrl() в loader.
COPY --from=build /app/packages/widget/dist /usr/share/nginx/html/widget

# Лоадер — один файл в корне.
COPY --from=build /app/packages/loader/dist/loader.js     /usr/share/nginx/html/loader.js
COPY --from=build /app/packages/loader/dist/loader.js.map /usr/share/nginx/html/loader.js.map

RUN chmod +x /docker-entrypoint.d/30-matrix-proxy.sh \
    && mkdir -p /etc/nginx/snippets

ENV NGINX_PORT=8080 \
    NGINX_ENVSUBST_FILTER=^NGINX_ \
    MATRIX_BACKEND="" \
    DNS_RESOLVER=127.0.0.11

EXPOSE 8080

# CMD/ENTRYPOINT наследуются от nginx: docker-entrypoint.d → nginx -g "daemon off;"
