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

| Сервис                     | URL                          |
| -------------------------- | ---------------------------- |
| host-demo (страница хоста) | http://localhost:5173        |
| widget (SPA виджета)       | http://localhost:5174/widget |
| matrix-mock (Matrix API)   | http://localhost:3001        |

## Локализация (i18n)

Переводы лежат в `packages/widget/src/i18n/locale/`:

```
ru.json   — русский (основной, источник ключей)
en.json   — английский
```

Ключи — flat с точечной группировкой: `"input.placeholder"`, `"chat.menu"`, `"status.connecting"`.

### Добавить новый ключ

1. Добавить в `ru.json` вручную или использовать плагин i18n Ally через выделение строки
2. Добавить в `en.json` — TypeScript выдаст ошибку на сборке, если забыть
3. Использовать в компоненте: `t('my.key')`

### Использование в компонентах

```tsx
import { t } from '../i18n'

// простой ключ
<p>{t('status.waiting')}</p>

// с плейсхолдером
<p>{t('chat.typing', { name: 'Оператор' })}</p>

```

## Сборка

```bash
pnpm build       # собирает protocol, loader, widget
pnpm typecheck   # проверка типов
pnpm lint        # линтер
```
