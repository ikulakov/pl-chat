import type { KeyboardEvent } from 'react'
import { resolveRoot } from '../../utils/resolveRoot'

/** Навигация по пунктам меню: стрелки по кругу, Home и End — к краям. Вешается на `role="menu"`. */
export function handleMenuKeyDown(event: KeyboardEvent<HTMLElement>): void {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  if (items.length === 0) return

  // activeElement берём у корня меню: в shadow-embed у document он указывал бы на хост
  const current = items.indexOf(resolveRoot(event.currentTarget).activeElement as HTMLElement)

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      items[(current + 1) % items.length]?.focus()
      break
    case 'ArrowUp':
      event.preventDefault()
      items[(current - 1 + items.length) % items.length]?.focus()
      break
    case 'Home':
      event.preventDefault()
      items[0]?.focus()
      break
    case 'End':
      event.preventDefault()
      items[items.length - 1]?.focus()
      break
  }
}
