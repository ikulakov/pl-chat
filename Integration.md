# Подключение BankChat

## 1. Вставьте на страницу

```html
<script
  src="https://chat.bank.ru/loader.js"
  defer
></script>
<script>
  window.addEventListener('load', () => {
    ChatSDK.init({ chatUrl: 'https://chat.bank.ru' })
  })
</script>
```

Всё. Виджет готов, панель откроется по `ChatSDK.open()`.

## 2. Добавьте свою кнопку

Кнопку рисует хост — своей вёрсткой, в своём месте.

```html
<button
  id="chat-fab"
  aria-label="Чат поддержки"
>
  💬
</button>

<style>
  #chat-fab {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 2147483000;
    width: 56px;
    height: 56px;
    border: 0;
    border-radius: 50%;
    background: #a06ec5;
    cursor: pointer;
  }
</style>

<script>
  document.getElementById('chat-fab').onclick = () => ChatSDK.toggle()
</script>
```

## 3. Методы

```js
ChatSDK.init(config) // идемпотентен, вызывать один раз
ChatSDK.open()
ChatSDK.close()
ChatSDK.toggle()
ChatSDK.setAppearance({ offsetY: 160 })
ChatSDK.on(event, handler) // возвращает функцию отписки
```

Команды можно звать сразу после `init()` — они выполнятся, когда виджет загрузится.

## 4. События

```js
ChatSDK.on('INIT_ACK', () => {}) // виджет готов
ChatSDK.on('OPENED', () => {}) // панель открылась
ChatSDK.on('CLOSED', () => {}) // панель закрылась
```

## 5. Позиция панели

По умолчанию — правый нижний угол, выше кнопки. Меняется на `init()` или в любой момент через `ChatSDK.setAppearance()`.

```js
ChatSDK.init({
  chatUrl: 'https://chat.bank.ru',
  appearance: { corner: 'bottom-left', offsetX: 24, offsetY: 96 },
})
```

| Поле      | Тип                               | По умолчанию   | Что задаёт                      |
| --------- | --------------------------------- | -------------- | ------------------------------- |
| `corner`  | `'bottom-right' \| 'bottom-left'` | `bottom-right` | Угол экрана                     |
| `offsetX` | `number` (px)                     | `17`           | Отступ сбоку                    |
| `offsetY` | `number` (px)                     | `80`           | Отступ снизу — место под кнопку |
| `zIndex`  | `number`                          | `2147483000`   | Слой панели                     |

`setAppearance()` мержит поверх текущего конфига — передавайте только то, что меняете:

```js
cookieBanner.on('show', () => ChatSDK.setAppearance({ offsetY: 160 }))
cookieBanner.on('hide', () => ChatSDK.setAppearance({ offsetY: 80 }))
```

Размер, скругление и тень панели не настраиваются — виджет вёрстан под свои габариты.
Если нужна вёрстка за пределами полей выше, у контейнера есть стабильный селектор
`#plchat-frame`. Стили на нём инлайновые, поэтому потребуется `!important`.

```css
#bankchat-frame {
  width: 50vw !important;
}
```

## 6. Мобильный режим

Уже ниже 480px панель сама разворачивается на весь экран. `corner` и отступы там не применяются, работает только `zIndex`. Скройте свою кнопку по `OPENED` — она окажется под панелью.

## 7. Требования

- `chatUrl` — только `https://`.
- Ваш домен должен быть в allowlist на стороне команды чата — иначе виджет не запустится.
- В `<meta name="viewport">` вашей страницы нужен `viewport-fit=cover` — иначе на iPhone поедут отступы под чёлку:

  ```html
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  ```
