# PLChat

Встраиваемый чат-виджет банка.

## Состав

```
packages/
  protocol/        — типы протокола host ↔ iframe (@bankchat/protocol). Интегрируется в loader и widget после сборки.
  loader/          — хостовый скрипт loader.js (@bankchat/loader)
  widget/          — SPA виджета в iframe (@bankchat/widget)

tools/             — инструменты разработки
  host-demo/       — демо-страница хоста для отладки встраивания
  matrix-mock/     — mock Matrix-сервер
```

## Требования

- Node.js 24+
- pnpm 10+

## Установка

```bash
pnpm install
```

## Разработка

```bash
pnpm dev
```

Запускает все пакеты одновременно:

| Сервис | URL |
|--------|-----|
| host-demo (страница хоста) | http://localhost:5173 |
| widget (SPA виджета) | http://localhost:5174/widget |
| matrix-mock (Matrix API) | http://localhost:3001 |

## Сборка

```bash
pnpm build       # собирает protocol, loader, widget
pnpm typecheck   # проверка типов
pnpm lint        # линтер
```
