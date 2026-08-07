/**
 * Почему сорвалась загрузка файла. Домену нужно ровно одно решение — предлагать повтор или нет:
 * детерминированный отказ сервера (fileguard, лимит размера, выключенный media-слой) повтором
 * не лечится, там вместо «повторить» даём убрать черновик из ленты.
 */
export type UploadFailure = 'network' | 'rejected' | 'rateLimited'

export function isRetryableFailure(failure: UploadFailure | undefined): boolean {
  return failure !== 'rejected'
}
