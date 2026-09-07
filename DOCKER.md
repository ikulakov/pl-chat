# Docker-образ bankchat

Монорепо собирается **внутри** образа (pnpm + turbo) и отдаётся через **nginx**.
Два артефакта в одном контейнере:

- **`/loader.js`** — IIFE-скрипт, хост вставляет `<script src="https://chat.otpbank.ru/loader.js">`
- **`/widget/`** — SPA виджета (React-приложение в iframe, base="/widget")

Образ отдаёт **только статику**: `/_matrix` маршрутизирует Ingress на сервис `matrixkc`
(`k8s/matrix-frontend/templates/ingress.yaml`). Локальная разработка идёт через `pnpm dev`,
где `/_matrix` проксирует Vite dev-server на mock (`tools/matrix-mock`) — образ для этого
не нужен.

## Сборка

```bash
docker build -t bankchat:<version> .
```

Build-аргументов нет: один и тот же образ едет на любой стенд. Фактически образ собирает
TeamCity; шаг сводится к `docker build` + `docker push`.

## Переменные окружения (runtime)

| Переменная   | Дефолт | Назначение                                                        |
| ------------ | ------ | ----------------------------------------------------------------- |
| `NGINX_PORT` | `8080` | Порт, который слушает nginx; совпадает с `containerPort` в чарте. |

Больше настраивать нечего. Зоны встраивания заданы **правилом**, а не списком: встроить
виджет может `otpbank.ru` и любой его поддомен. Правило записано в двух местах, и это два слоя
одной защиты:

1. `Content-Security-Policy: frame-ancestors https://otpbank.ru https://*.otpbank.ru` в
   [`default.conf.template`](docker/nginx/default.conf.template) — браузер не отрисует iframe
   на чужой странице;
2. регексп в `packages/widget/src/bridge.ts` — виджет не примет `postMessage` от чужого
   origin и не отправит ему `READY`.

**Менять их можно только вместе.** Новая зона встраивания на поддомене банка не требует ни
правки кода, ни пересборки: она подпадает под правило автоматически. Пересборка нужна лишь
для домена за пределами `otpbank.ru`.

Дополнительно nginx образа отдаёт `Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`; `server_tokens off`; редирект `/` → относительный
`/widget/` (без `http://` и `:8080`); любой `*.map` и корневой `/index.html` → 404.

## Что внутри

- **Stage 1** (`node:24-alpine`) — `pnpm install --frozen-lockfile` + `pnpm build`
  (turbo собирает `@bankchat/protocol` → `@bankchat/loader` → `@bankchat/widget`).
- **Stage 2** (`nginx:1.27-alpine`) — копирует артефакты в `/usr/share/nginx/html`:
  - `packages/widget/dist/` → `/widget/` (SPA + хешированные ассеты)
  - `packages/loader/dist/loader.js` → `/loader.js`
  - дефолтный `index.html` образа nginx удаляется
- Кеш (`map $uri $cache_control`): `/widget/assets/*` — `public, max-age=31536000, immutable`;
  всё остальное, включая `index.html` и `loader.js`, — `no-cache`.
- Корень `/` редиректит на `/widget/`.
- `absolute_redirect off` сохраняет внешний HTTPS при редиректах за Ingress.
- `location ~ \.map$` → 404: правило по маске, а не по одному пути, — `dist` виджета
  копируется в образ целиком, и включённый в сборке sourcemap иначе уехал бы наружу.
- `/healthz` — liveness-проба для оркестратора (в чарте пока не подключена).

Конфиг: [`docker/nginx/default.conf.template`](docker/nginx/default.conf.template)
(envsubst по `NGINX_*`). Entrypoint-скриптов у образа нет.

Общие заголовки задаются в [`security-headers.conf`](docker/nginx/security-headers.conf) и
подключаются `include`'ом **один раз**, на уровне `server`. Держится это на том, что ни в одном
`location` нет собственного `add_header`: кеш-политика вычисляется `map`'ом по `$uri`. Заводя в
`location` свой `add_header`, подключи файл там повторно — иначе серверные заголовки в этом
блоке пропадут (`add_header` не наследуется в блок, где объявлен свой).

## Проверка после выката

```bash
# security headers на встраиваемой странице
curl -sI https://<чат-домен>/widget/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy'

# cleartext Location и версия nginx не должны светиться
curl -skI https://<чат-домен>/ | grep -iE 'location|server'
curl -sk https://<чат-домен>/missing | grep -i nginx || true

# source map (и корневой, и ассетный) и welcome page закрыты — всюду 404
curl -sk -o /dev/null -w '%{http_code}\n' https://<чат-домен>/loader.js.map
curl -sk -o /dev/null -w '%{http_code}\n' https://<чат-домен>/widget/assets/probe.js.map
curl -sk -o /dev/null -w '%{http_code}\n' https://<чат-домен>/index.html
```
