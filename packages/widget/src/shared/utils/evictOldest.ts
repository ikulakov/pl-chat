/**
 * Урезает Map до `max` записей, выбрасывая самые старые.
 * Map хранит порядок вставки — он же порядок вытеснения.
 */
export function evictOldest<T>(entries: Map<string, T>, max: number): void {
  for (const oldest of entries.keys()) {
    if (entries.size <= max) break
    entries.delete(oldest)
  }
}
