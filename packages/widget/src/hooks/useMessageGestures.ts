import { type RefObject, useEffect, useEffectEvent, useState } from 'react'

// Удержание дольше этого — долгое нажатие; короче остаётся обычным тапом.
export const LONG_PRESS_MS = 450
// Пока палец сдвинулся меньше, он «стоит»; дальше это прокрутка или свайп.
const TOUCH_SLOP_PX = 10
// Столько протянуть влево, чтобы отпускание включило ответ.
export const SWIPE_TRIGGER_PX = 56
// За порогом ряд тянется с сопротивлением и упирается сюда.
const SWIPE_MAX_PX = 80
const SWIPE_RESISTANCE = 0.3
const SETTLE_MS = 180

interface Options {
  onLongPress: () => void
  /** Нет колбэка — свайп выключен: на сообщение нельзя ответить. */
  onSwipe: (() => void) | undefined
}

function resist(distance: number): number {
  if (distance <= SWIPE_TRIGGER_PX) return distance

  return Math.min(SWIPE_MAX_PX, SWIPE_TRIGGER_PX + (distance - SWIPE_TRIGGER_PX) * SWIPE_RESISTANCE)
}

/**
 * Сенсорные жесты на ряду сообщения: долгое нажатие и свайп влево.
 *
 * Только `pointerType === 'touch'` — мышь и перо живут на hover-кнопке «…». Протяжка пишет
 * `transform` и `--swipe-progress` прямо в стиль элемента, минуя React: перерисовывать ряд на
 * каждый кадр незачем, React узнаёт только о начале и конце протяжки — через `isSwiping`.
 * `isSwiping` снимается, когда ряд уже вернулся на место, а не в момент отпускания пальца.
 *
 * Вертикальную прокрутку браузер забирает сам по `touch-action: pan-y` на ряду и присылает
 * `pointercancel` — отдельно различать её не нужно.
 */
export function useMessageGestures(
  ref: RefObject<HTMLElement | null>,
  options: Options,
): { isSwiping: boolean } {
  const [isSwiping, setIsSwiping] = useState(false)
  const fireLongPress = useEffectEvent(() => options.onLongPress())
  const getOnSwipe = useEffectEvent(() => options.onSwipe)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let swiping = false
    let offset = 0
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    // Жест уже отработал: click, который браузер пришлёт следом, открыл бы картинку или ссылку.
    let swallowClick = false

    const setOffset = (px: number) => {
      offset = px
      el.style.transform = px === 0 ? '' : `translateX(${-px}px)`
      el.style.setProperty('--swipe-progress', String(Math.min(1, px / SWIPE_TRIGGER_PX)))
    }

    const settle = () => {
      el.style.transition = `transform ${SETTLE_MS}ms var(--ease-standard)`
      setOffset(0)
      settleTimer = setTimeout(() => {
        el.style.transition = ''
        el.style.removeProperty('--swipe-progress')
        setIsSwiping(false)
      }, SETTLE_MS)
    }

    const onPointerDown = (event: PointerEvent) => {
      // Сброс до проверки типа: если click за долгим нажатием так и не пришёл, флаг не должен
      // съесть следующий клик мышью на гибридном устройстве.
      swallowClick = false
      if (event.pointerType !== 'touch' || !event.isPrimary) return

      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY

      clearTimeout(pressTimer)
      pressTimer = setTimeout(() => {
        pointerId = null
        swallowClick = true
        fireLongPress()
      }, LONG_PRESS_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return

      const dx = event.clientX - startX

      if (!swiping) {
        if (Math.hypot(dx, event.clientY - startY) < TOUCH_SLOP_PX) return

        clearTimeout(pressTimer)
        // Решаем один раз, на выходе из «стоячей» зоны: только влево и только если можно ответить.
        if (dx >= 0 || !getOnSwipe()) {
          pointerId = null
          return
        }

        swiping = true
        clearTimeout(settleTimer)
        el.style.transition = ''
        setIsSwiping(true)
      }

      setOffset(resist(Math.max(0, -dx)))
    }

    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return

      clearTimeout(pressTimer)
      pointerId = null
      if (!swiping) return

      swiping = false
      // Любая протяжка — уже не тап: иначе недотянутый свайп по ссылке, файлу или реакции
      // завершился бы click'ом, который браузер ещё может синтезировать.
      swallowClick = true
      if (event.type === 'pointerup' && offset >= SWIPE_TRIGGER_PX) {
        getOnSwipe()?.()
      }
      settle()
    }

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return

      swallowClick = false
      event.preventDefault()
      event.stopPropagation()
    }

    // Android показывает системное меню по долгому нажатию — наше его заменяет.
    const onContextMenu = (event: MouseEvent) => {
      if (swallowClick || pointerId !== null) event.preventDefault()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
    el.addEventListener('click', onClick, true)
    el.addEventListener('contextmenu', onContextMenu)

    return () => {
      clearTimeout(pressTimer)
      clearTimeout(settleTimer)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('contextmenu', onContextMenu)
      el.style.transform = ''
      el.style.transition = ''
      el.style.removeProperty('--swipe-progress')
    }
  }, [ref])

  return { isSwiping }
}
