type ClassValue = string | undefined | null | false | Record<string, boolean | undefined | null>

/**
 * Объединяет CSS-классы, отфильтровывая falsy-значения.
 * Принимает строки, undefined/null/false и объекты { [className]: condition }.
 *
 * @example
 * // Строки и условные классы через объект
 * cn(styles.bubble, { [styles.own]: isOwn, [styles.pending]: isPending })
 * // → 'bubble own' если isOwn=true, isPending=false
 *
 * @example
 * // Опциональный класс через boolean
 * cn(styles.panel, isOpen && styles.panelOpen)
 * // → 'panel panelOpen' если isOpen=true
 * // → 'panel'          если isOpen=false  (false отфильтрован)
 *
 * @example
 * // Несколько условий
 * cn(
 *   styles.button,
 *   { [styles.primary]: variant === 'primary' },
 *   { [styles.disabled]: disabled },
 *   className,          // внешний класс или undefined — оба варианта безопасны
 * )
 */
export function cn(...args: ClassValue[]): string {
  const result: string[] = []
  for (const arg of args) {
    if (!arg) continue
    if (typeof arg === 'string') {
      result.push(arg)
    } else {
      for (const [key, val] of Object.entries(arg)) {
        if (val) result.push(key)
      }
    }
  }
  return result.join(' ')
}
