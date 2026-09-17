/**
 * Запрашиваемая рендиция картинки. Имена полей совпадают с query-параметрами
 * `/media/thumbnail`, но это наш тип, а не форма провода: размер выбирает UI по DPR
 * (`pickThumbnailSize`), а `matrix/api` лишь перекладывает его в запрос.
 */
export interface ThumbnailSize {
  width: number
  height: number
}
