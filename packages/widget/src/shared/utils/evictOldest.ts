/**
 * Урезает Map до потолка `max`, выбрасывая самые старые записи.
 * Map хранит порядок вставки — он же порядок вытеснения.
 * Без `weigh` потолок считается в записях, с ним — в сумме весов (например, в байтах).
 * Самая свежая запись остаётся всегда, даже если она одна тяжелее потолка.
 */
export function evictOldest<T>(
  entries: Map<string, T>,
  max: number,
  weigh: (value: T) => number = () => 1,
): void {
  let total = 0
  entries.forEach((value) => (total += weigh(value)))

  for (const [key, value] of entries) {
    if (total <= max || entries.size <= 1) break

    entries.delete(key)
    total -= weigh(value)
  }
}
