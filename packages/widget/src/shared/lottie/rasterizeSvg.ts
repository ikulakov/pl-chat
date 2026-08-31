/**
 * Растеризация SVG-разметки в PNG data-URL.
 *
 * Отдельный модуль, а не пара строк внутри `emojiBitmap`: `Image` в jsdom ресурсы не грузит и
 * `load` никогда не наступает, поэтому тесты подменяют именно этот шаг. Глобальная заглушка
 * `Image` вместо этого сломала бы компоненты, которые ждут честных `onLoad`/`onError`
 * (превью вложений в ленте).
 */
export function rasterizeSvg(markup: string, size: number): Promise<string> {
  // Экранирование, а не base64: разметка кадра живёт ровно до `drawImage`, кэшируется уже
  // готовый PNG — экономить на длине этой строки нечего.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

  return new Promise<string>((resolve, reject) => {
    const image = new Image(size, size)

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size

      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('[PLChat] canvas 2d context unavailable'))
        return
      }

      context.drawImage(image, 0, 0, size, size)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => reject(new Error('[PLChat] emoji svg decode failed'))
    image.src = source
  })
}
