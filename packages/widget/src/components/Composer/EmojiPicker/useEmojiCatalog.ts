import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmojiCatalog } from '../../../domain/emoji'
import { useChatActions } from '../../../hooks/useChatActions'
import {
  readCachedCatalog,
  writeCachedCatalog,
  writeCachedCategory,
} from '../../../shared/emoji/emojiCatalogCache'
import { syncPackVersion } from '../../../shared/emoji/emojiDb'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: EmojiCatalog }
  | { status: 'error' }

export interface UseEmojiCatalogResult {
  state: CatalogState
  /** Догрузить состав вкладки. Повторные вызовы по той же категории игнорируются. */
  loadCategory: (categoryId: string) => void
  retry: () => void
}

/**
 * Каталог грузится в два шага, как задумано контрактом: сначала лёгкий список вкладок со
 * счётчиками (сетка сразу знает свою высоту), потом состав каждой вкладки по мере подхода
 * к вьюпорту. Тянуть весь пак разом нельзя: 580 позиций с силуэтами — это сотни килобайт,
 * из которых пользователь обычно смотрит первую вкладку.
 *
 * Поверх этого — stale-while-revalidate через IndexedDB: панель поднимается из кэша мгновенно и
 * без сети, а ответ сервера либо подтверждает версию (тогда уже показанный состав остаётся на
 * месте), либо приносит новую — и тогда показывается свежий каталог, а кадры прошлой версии
 * вычищаются (`syncPackVersion`).
 *
 * Хук живёт ровно столько, сколько открыта панель: перезагрузка при закрытии не нужна,
 * повторное открытие достанет каталог из того же кэша.
 */
export function useEmojiCatalog(): UseEmojiCatalogResult {
  const { loadEmojiCatalog, loadEmojiCategory } = useChatActions()
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Категории, по которым запрос уже ушёл: без этого пересечение сентинела при каждом
  // скролле слало бы повторные запросы.
  const requested = useRef(new Set<string>())
  const alive = useRef(true)
  // Показанный каталог рядом с состоянием: слияние с ответом сервера и запись состава в кэш
  // должны видеть его снаружи `setState` — обновляющая функция обязана оставаться чистой,
  // а в StrictMode она вызывается дважды.
  const shown = useRef<EmojiCatalog | null>(null)
  // Ответ сервера уже пришёл — данные из кэша больше не показываем, они старше.
  const revalidated = useRef(false)

  const show = useCallback((catalog: EmojiCatalog) => {
    shown.current = catalog
    setState({ status: 'ready', catalog })
  }, [])

  useEffect(() => {
    alive.current = true
    requested.current.clear()
    revalidated.current = false
    shown.current = null

    void readCachedCatalog().then((cached) => {
      if (!alive.current || !cached || revalidated.current || shown.current) return

      // Вкладки с составом из кэша повторно не запрашиваем: версия та же — значит и состав тот же.
      for (const category of cached.categories) {
        if (category.items) requested.current.add(category.id)
      }

      show(cached)
    })

    loadEmojiCatalog()
      .then((fresh) => {
        revalidated.current = true
        syncPackVersion(fresh.version)
        writeCachedCatalog(fresh)
        if (!alive.current) return

        const previous = shown.current
        // Версия та же — оставляем уже загруженный состав: он не мог измениться, а перерисовка
        // сетки с нуля дёрнула бы скролл. Версия другая — берём свежее целиком и забываем, что
        // успели запросить: состав прошлой версии больше не годится.
        if (!previous || previous.version !== fresh.version) {
          requested.current.clear()
          show(fresh)
          return
        }

        const loaded = new Map(previous.categories.map((category) => [category.id, category]))
        show({
          ...fresh,
          categories: fresh.categories.map((category) => loaded.get(category.id) ?? category),
        })
      })
      .catch((err: unknown) => {
        console.error('[PLChat] emoji catalog failed:', err)
        // Кэш уже показан — оставляем его: он старше ровно на одну версию пака, а пустая
        // панель с ошибкой полезнее не делает.
        if (alive.current && !shown.current) setState({ status: 'error' })
      })

    return () => {
      alive.current = false
    }
  }, [attempt, loadEmojiCatalog, show])

  const loadCategory = useCallback(
    (categoryId: string) => {
      if (requested.current.has(categoryId)) return
      requested.current.add(categoryId)

      loadEmojiCategory(categoryId)
        .then((loaded) => {
          const catalog = shown.current
          if (catalog) writeCachedCategory(catalog.version, loaded)
          if (!alive.current || !catalog) return

          show({
            ...catalog,
            categories: catalog.categories.map((category) =>
              category.id === loaded.id ? loaded : category,
            ),
          })
        })
        .catch((err: unknown) => {
          console.error('[PLChat] emoji category failed:', categoryId, err)
          // Снимаем отметку: следующее пересечение сентинела попробует ещё раз.
          requested.current.delete(categoryId)
        })
    },
    [loadEmojiCategory, show],
  )

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, loadCategory, retry }
}
