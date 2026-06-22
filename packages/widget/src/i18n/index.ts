import en from './locale/en.json'
import ru from './locale/ru.json'

export type MessageKey = keyof typeof ru

// явная аннотация: TypeScript проверит, что en содержит все ключи из ru
const DICTS: Record<string, Record<MessageKey, string>> = { ru, en }

let activeLocale = 'ru'

export function setLocale(locale: string): void {
  activeLocale = locale
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const dict = DICTS[activeLocale] ?? ru
  let str: string = dict[key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}
