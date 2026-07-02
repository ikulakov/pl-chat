export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const id = setTimeout(onDone, ms)
    signal?.addEventListener('abort', onAbort, { once: true })

    function onDone(): void {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }

    function onAbort(): void {
      clearTimeout(id)
      onDone()
    }
  })
}
