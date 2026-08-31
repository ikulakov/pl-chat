/**
 * Очередь с потолком одновременно выполняемых задач.
 *
 * Нужна растеризации кадров эмодзи: цена одного кадра — загрузка Lottie-JSON, разбор,
 * `XMLSerializer`, декод `<img>` и `drawImage`. Видимая часть сетки пикера — это ~45 таких
 * задач разом, и без потолка прокрутка залипает на первом же экране.
 */
export interface TaskQueue {
  run: <T>(task: () => Promise<T>) => Promise<T>
  readonly pending: number
}

export function createTaskQueue(limit: number): TaskQueue {
  const waiting: (() => void)[] = []
  let active = 0

  function next(): void {
    active--
    waiting.shift()?.()
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const started =
        active < limit
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              waiting.push(resolve)
            })

      active++

      // finally, а не then: слот обязан освободиться и после отказа, иначе очередь встаёт
      // насмерть после первого же сбоя сети.
      return started.then(task).finally(next)
    },

    get pending() {
      return waiting.length
    },
  }
}
