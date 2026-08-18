import { useCallback, useEffect, useRef, useState } from 'react'

/** Насколько глубоко секция должна зайти под верхнюю кромку, чтобы считаться текущей. */
const ACTIVE_EDGE_PX = 8

/** Отступ сверху после перехода: заголовок секции не должен упираться в кромку панели. */
const JUMP_PADDING_PX = 4

export interface CategoryNav {
  /** Категория, чья секция сейчас у верхней кромки; `null`, пока ни одна не зарегистрирована. */
  activeId: string | null
  registerSection: (categoryId: string, node: HTMLElement | null) => void
  scrollTo: (categoryId: string) => void
}

/**
 * Быстрый переход по категориям и подсветка текущей — лента прокрутки одна на все секции,
 * как в мессенджерах: панель категорий не переключает содержимое, а перематывает к нему.
 *
 * Позиции считаем по `getBoundingClientRect`, а не по `offsetTop`: ближайший позиционированный
 * предок здесь — сама панель, и `offsetTop` включал бы высоту вкладок с полоской категорий.
 * Секций меньше десятка, а замер идёт раз в кадр — на прокрутке это не заметно.
 *
 * `categoryIds` обязан быть стабильной ссылкой (мемо у вызывающего): его смена — это и смена
 * состава секций, и повод перемерить подсветку после догрузки категории.
 */
export function useCategoryNav(
  scrollRef: React.RefObject<HTMLElement | null>,
  categoryIds: string[],
): CategoryNav {
  const sections = useRef(new Map<string, HTMLElement>())
  const [activeId, setActiveId] = useState<string | null>(null)

  const registerSection = useCallback((categoryId: string, node: HTMLElement | null) => {
    if (node) sections.current.set(categoryId, node)
    else sections.current.delete(categoryId)
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    function measure() {
      if (!container) return
      const edge = container.getBoundingClientRect().top + ACTIVE_EDGE_PX

      // Порядок берём из каталога, а не из порядка вставки в Map: ref'ы могут
      // перерегистрироваться, и обход перестал бы совпадать с порядком секций на экране.
      let current: string | null = null
      for (const categoryId of categoryIds) {
        const node = sections.current.get(categoryId)
        if (!node) continue
        if (node.getBoundingClientRect().top > edge) break

        current = categoryId
      }

      // Прокрутка выше первой секции (пружина, отрицательный overscroll) не должна гасить
      // подсветку — в этом случае текущей остаётся первая.
      setActiveId(current ?? categoryIds[0] ?? null)
    }

    // Первый замер — сразу: без прокрутки подсветки иначе не было бы вовсе.
    measure()

    let frame: number | null = null
    function onScroll() {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [categoryIds, scrollRef])

  const scrollTo = useCallback(
    (categoryId: string) => {
      const container = scrollRef.current
      const node = sections.current.get(categoryId)
      if (!container || !node) return

      container.scrollTop +=
        node.getBoundingClientRect().top - container.getBoundingClientRect().top - JUMP_PADDING_PX

      // Подсветку двигаем сразу: обработчик прокрутки придёт только следующим кадром, и
      // до него нажатая кнопка выглядела бы неотзывчивой.
      setActiveId(categoryId)
    },
    [scrollRef],
  )

  return { activeId, registerSection, scrollTo }
}
