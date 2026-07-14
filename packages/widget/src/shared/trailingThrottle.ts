// trailingThrottle: серия вызовов схлопывается в один, отложенный на ms от ПЕРВОГО вызова серии.
// Лидирующего вызова нет — для «дорогих по чтению» реакций (layout-скан при скролле),
// где важен итог серии, а не мгновенный отклик.
export function trailingThrottle(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }

  run.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return run
}
