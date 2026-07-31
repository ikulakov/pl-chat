/** Отмена по AbortSignal — не ошибка операции: вызывающий тихо выходит. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
