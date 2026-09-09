/** Отмена по AbortSignal — не ошибка операции: вызывающий тихо выходит. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Дедлайн на одну операцию: таймер снимается сразу, как она завершилась.
 *
 * Не `AbortSignal.timeout`: тот таймер не отменить, и на петле вроде `/sync` каждый удачный
 * запрос оставлял бы его тикать до конца окна — по одному живому таймеру на каждый тик, всю
 * сессию. Отмену вызывающего пробрасываем как есть, вместе с причиной: снаружи это по-прежнему
 * обычный AbortError, а не наш дедлайн.
 */
export async function withDeadline<T>(
  ms: number,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = new AbortController()
  const timer = setTimeout(() => {
    deadline.abort(new DOMException('Deadline exceeded', 'TimeoutError'))
  }, ms)

  const onAbort = () => deadline.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    if (signal?.aborted) onAbort()

    return await run(deadline.signal)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
