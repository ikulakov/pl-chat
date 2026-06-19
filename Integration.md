# Интеграция BankChat на хост-страницу

## Подключение

Добавьте скрипт в конец `<body>`:

```html
<script
  src="https://chat.bank.ru/loader.js"
  defer
></script>
```

## Инициализация

Вызовите `ChatSDK.init()` после загрузки скрипта:

```js
window.addEventListener('load', () => {
  ChatSDK.init({
    chatUrl: 'https://chat.bank.ru',
  })
})
```

`init` идемпотентен — повторные вызовы игнорируются.

## Управление виджетом

```js
ChatSDK.open() // открыть
ChatSDK.close() // закрыть
ChatSDK.toggle() // переключить
```

## События

```js
ChatSDK.on('INIT_ACK', () => {
  // handshake завершён, виджет готов принимать команды
})

ChatSDK.on('OPENED', () => {
  // виджет открылся — скройте свою FAB-кнопку или поменяйте иконку
})

ChatSDK.on('CLOSED', () => {
  // виджет закрылся — восстановите FAB-кнопку
})
```

`on()` возвращает функцию отписки:

```js
const off = ChatSDK.on('OPENED', handler)
off() // отписаться
```

## Пример FAB-кнопки

Виджет позиционируется в правом нижнем углу экрана (`bottom: 24px, right: 24px`).
Разместите кнопку там же:

```html
<button
  id="chat-fab"
  aria-label="Открыть чат поддержки"
>
  💬
</button>

<style>
  #chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #a06ec5;
    border: none;
    cursor: pointer;
    z-index: 9999;
  }
</style>

<script>
  document.getElementById('chat-fab').addEventListener('click', () => {
    ChatSDK.toggle()
  })
</script>
```

## Требования к хосту

| Требование         | Детали                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| HTTPS              | `chatUrl` должен быть `https://`                                                          |
| Разрешённый origin | `chat.bank.ru` должен разрешить ваш домен через `VITE_ALLOWED_PARENTS` на стороне сервера |

## Next.js

```tsx
import Script from 'next/script'

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Script
        src="https://chat.bank.ru/loader.js"
        strategy="afterInteractive"
      />
    </>
  )
}
```

## Безопасность

- Виджет живёт на отдельном origin — полная изоляция через same-origin policy.
