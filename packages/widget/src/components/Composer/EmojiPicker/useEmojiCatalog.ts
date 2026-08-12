import { useCallback, useEffect, useRef, useState } from 'react'
import type { EmojiCatalog } from '../../../domain/emoji'
import { useChatActions } from '../../../hooks/useChatActions'

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
 * Хук живёт ровно столько, сколько открыта панель: перезагрузка при закрытии не нужна,
 * повторное открытие достанет анимации из общего кэша.
 */
export function useEmojiCatalog(): UseEmojiCatalogResult {
  const { loadEmojiCatalog, loadEmojiCategory } = useChatActions()
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Категории, по которым запрос уже ушёл: без этого пересечение сентинела при каждом
  // скролле слало бы повторные запросы.
  const requested = useRef(new Set<string>())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    requested.current.clear()

    loadEmojiCatalog()
      .then((catalog) => {
        if (alive.current) setState({ status: 'ready', catalog })
      })
      .catch((err: unknown) => {
        console.error('[PLChat] emoji catalog failed:', err)
        if (alive.current) setState({ status: 'error' })
      })

    return () => {
      alive.current = false
    }
  }, [attempt, loadEmojiCatalog])

  const loadCategory = useCallback(
    (categoryId: string) => {
      if (requested.current.has(categoryId)) return
      requested.current.add(categoryId)

      loadEmojiCategory(categoryId)
        .then((loaded) => {
          if (!alive.current) return

          setState((prev) =>
            prev.status === 'ready'
              ? {
                  ...prev,
                  catalog: {
                    ...prev.catalog,
                    categories: prev.catalog.categories.map((category) =>
                      category.id === loaded.id ? loaded : category,
                    ),
                  },
                }
              : prev,
          )
        })
        .catch((err: unknown) => {
          console.error('[PLChat] emoji category failed:', categoryId, err)
          // Снимаем отметку: следующее пересечение сентинела попробует ещё раз.
          requested.current.delete(categoryId)
        })
    },
    [loadEmojiCategory],
  )

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, loadCategory, retry }
}
