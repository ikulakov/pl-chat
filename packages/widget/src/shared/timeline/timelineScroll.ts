import type { LocalId } from '@/domain/ids'
/**
 * Доступ к прокрутке ленты снаружи дерева React.
 *
 * Скроллом владеет `useChatScroll` внутри `MessageList`: только там есть ref контейнера и вся
 * логика прилипания к низу. Но прыгнуть к сообщению иногда просит код вне дерева — например
 * тост про отклонённый файл, который живёт в соседней ветке панели. Тащить `scrollToItem`
 * наверх через `ChatPanel` пришлось бы через половину дерева, а класть в `chatStore` нечего:
 * это не состояние чата, а разовое действие.
 *
 * Модульная переменная безопасна, потому что лента в виджете ровно одна.
 */
let scrollToItem: ((localId: LocalId) => void) | null = null

/** Вызывается лентой при монтировании; возвращает функцию отписки для cleanup эффекта. */
export function registerTimelineScroll(fn: (localId: LocalId) => void): () => void {
  scrollToItem = fn

  return () => {
    // проверка на случай, если новая лента успела зарегистрироваться до размонтирования старой
    if (scrollToItem === fn) scrollToItem = null
  }
}

/** Прокручивает ленту к сообщению. Молча ничего не делает, если ленты сейчас нет на экране. */
export function scrollTimelineTo(localId: LocalId): void {
  scrollToItem?.(localId)
}
