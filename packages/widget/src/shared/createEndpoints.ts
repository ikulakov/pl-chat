// Имена {param} из шаблона → union строковых литералов.
type TemplateParams<T extends string> = T extends `${string}{${infer P}}${infer R}`
  ? P | TemplateParams<R>
  : never

// Шаблон с параметрами становится типизированной функцией, без параметров — строкой.
type Endpoint<T extends string> =
  TemplateParams<T> extends never
    ? T
    : (params: { [K in TemplateParams<T>]: string | number }) => string

/**
 * Строит реестр эндпоинтов из шаблонов URL. Каждый {param} автоматически проходит
 * encodeURIComponent — забыть кодирование на call site невозможно. Отсутствие/опечатка
 * параметра ловится на этапе типов. Реестр обязан объявляться с `as const`, иначе
 * литералы шаблонов расширятся до string и типизация параметров потеряется.
 */
export function createEndpoints<T extends Record<string, string>>(
  endpoints: T,
): { [K in keyof T]: Endpoint<T[K]> } {
  const result = {} as { [K in keyof T]: Endpoint<T[K]> }

  for (const [key, url] of Object.entries(endpoints) as [keyof T, string][]) {
    const hasParams = /\{\w+\}/.test(url)
    const endpoint = hasParams
      ? (params: Record<string, string | number>): string =>
          url.replace(/\{(\w+)\}/g, (whole, name: string) =>
            encodeURIComponent(String(params[name] ?? whole)),
          )
      : url
    result[key] = endpoint as (typeof result)[keyof T]
  }

  return result
}
