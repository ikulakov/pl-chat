# Docker-образ bankchat

Монорепо собирается **внутри** образа (pnpm + turbo) и отдаётся через **nginx**.
Два артефакта в одном контейнере:

- **`/loader.js`** — IIFE-скрипт, хост вставляет `<script src="https://chat.bank.com/loader.js">`
- **`/widget/`** — SPA виджета (React-приложение в iframe, base="/widget")

Образ self-contained и CI-agnostic — собирается одинаково локально, в GitHub Actions
или любом другом раннере.

## Сборка и запуск

```bash
# через pnpm-скрипты
pnpm run docker:build          # docker build -t bankchat:local .
pnpm run docker:run            # http://localhost:8080/widget/

# или напрямую
docker build -t bankchat:local .
docker run --rm -p 8080:8080 bankchat:local

# или compose (плюс healthcheck)
docker compose up --build
```

Открыть **http://localhost:8080/widget/** — виджет-SPA (корень `/` редиректит сюда).
Лоадер: **http://localhost:8080/loader.js**.

## Переменные окружения (runtime)

| Переменная       | Дефолт       | Назначение                                                                                                  |
| ---------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| `NGINX_PORT`     | `8080`       | Порт, который слушает nginx.                                                                                |
| `MATRIX_BACKEND` | _(пусто)_    | Если задан — nginx проксирует `/_matrix/*` сюда (напр. `http://matrixkc:8080`). Пусто → **только статика**. |
| `DNS_RESOLVER`   | `127.0.0.11` | DNS для резолва апстрима (`127.0.0.11` — встроенный DNS Docker; в k8s укажите свой).                        |

> **Почему прокси опционален.** nginx здесь — сервер отдачи статики. В проде
> `/_matrix` может обслуживать отдельный шлюз или ingress. Включается одной
> переменной, когда нужно запустить связку локально:
>
> ```bash
> docker run --rm -p 8080:8080 -e MATRIX_BACKEND=http://host.docker.internal:8080 bankchat:local
> ```

## Что внутри

- **Stage 1** (`node:22.16.0-alpine`) — `pnpm install --frozen-lockfile` + `pnpm build`
  (turbo собирает `@bankchat/protocol` → `@bankchat/loader` → `@bankchat/widget`).
- **Stage 2** (`nginx:1.27-alpine`) — копирует артефакты в `/usr/share/nginx/html`:
  - `packages/widget/dist/` → `/widget/` (SPA + хешированные ассеты)
  - `packages/loader/dist/loader.js` → `/loader.js`
- Кеш: `/widget/assets/*` — `immutable, 1y`; `index.html` и `loader.js` — `no-cache`.
- Корень `/` редиректит на `/widget/`.
- `/healthz` — liveness-проба для оркестратора.

Конфиг: [`docker/nginx/default.conf.template`](docker/nginx/default.conf.template)
(envsubst по `NGINX_*`) + [`docker/nginx/30-matrix-proxy.sh`](docker/nginx/30-matrix-proxy.sh)
(генерит snippet прокси при заданном `MATRIX_BACKEND`).

## Сборка в CI

Образ ничего не требует от конкретного раннера — достаточно Docker. Пример для
GitHub Actions:

```yaml
# .github/workflows/docker.yml
name: Docker
on:
  push:
    tags: ['v*']
jobs:
  image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/<org>/bankchat:${{ github.ref_name }}
```
