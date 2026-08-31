import { describe, expect, it, vi } from 'vitest'
import { createTaskQueue } from './taskQueue'

/** Задача, которую тест завершает вручную: так видно, сколько их бежит одновременно. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: () => void } {
  let resolve!: () => void
  let reject!: () => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = () => rej(new Error('сбой'))
  })

  return { promise, resolve, reject }
}

/** Даёт отработать всей накопленной очереди микрозадач: их между слотами несколько. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('createTaskQueue', () => {
  it('держит не больше потолка задач одновременно', async () => {
    const queue = createTaskQueue(2)
    const tasks = [deferred(), deferred(), deferred()]
    const started = tasks.map((task) => vi.fn(() => task.promise))

    started.forEach((task) => void queue.run(task))
    await flush()

    expect(started[0]).toHaveBeenCalled()
    expect(started[1]).toHaveBeenCalled()
    expect(started[2]).not.toHaveBeenCalled()

    tasks[0]?.resolve()
    await flush()

    expect(started[2]).toHaveBeenCalled()
  })

  it('освобождает слот и после отказа', async () => {
    const queue = createTaskQueue(1)
    const first = deferred()
    const second = vi.fn(() => Promise.resolve('готово'))

    const failing = queue.run(() => first.promise)
    const queued = queue.run(second)

    first.reject()
    await expect(failing).rejects.toThrow('сбой')

    // Не освободили бы слот — очередь встала бы намертво после первого же сбоя сети.
    await expect(queued).resolves.toBe('готово')
  })

  it('отдаёт результат задачи вызывающему', async () => {
    const queue = createTaskQueue(1)

    await expect(queue.run(() => Promise.resolve(42))).resolves.toBe(42)
  })
})
