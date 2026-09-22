import type { ThumbnailSize } from '@/domain/media'
import { MediaUnavailableError } from '@/domain/mediaFailure'
import type { LocalId } from '@/shared/types/ids'
import { isAbortError } from '@/shared/utils/abort'
import { evictOldest } from '@/shared/utils/evictOldest'
import { parseMxcUrl, type ParsedMxcUrl } from '@/shared/utils/mxc'
import { sleep } from '@/shared/utils/sleep'
import type { MatrixApi } from '../api/matrixApi'
import { isForbiddenError, isMediaPendingError, isNotFoundError } from '../api/matrixError'
import { classifyMediaError } from '../mappers/mediaError'

// Право на файл появляется, когда writer запишет его привязку к комнате, а событие в /sync
// может обогнать её на доли секунды — отсюда один отложенный повтор на 403.
const FORBIDDEN_RETRY_DELAY_MS = 400

// Потолок кэша превью, в записях. Вытеснять безопасно: object-URL сам держит свой blob.
const MAX_CACHED_PREVIEWS = 40

// Потолок своих копий — в байтах, а не в штуках: пачка файлов иначе вытеснила бы свои же
// копии раньше вердикта CDR
const MAX_LOCAL_COPIES_BYTES = 50 * 1024 * 1024

/** Байты по mxc для компонентов; object-URL из них делает сам компонент. */
export interface MediaService {
  loadPreview: (mxcUrl: string, size: ThumbnailSize) => Promise<Blob>
  downloadFile: (mxcUrl: string) => Promise<Blob>
}

export type UploadOutcome =
  | { status: 'uploaded'; url: string }
  | { status: 'failed'; error: unknown }
  | { status: 'aborted' }

interface UploadRequest {
  contentType?: string
  onProgress?: (percent: number) => void
}

type MediaApi = Pick<MatrixApi, 'uploadMedia' | 'downloadMedia' | 'getThumbnail'>

/**
 * Байты по mxc в обе стороны: заливка своих файлов, превью и оригиналы с сервера.
 * Сессии, комнаты и стора не знает — как и `MatrixCatalog`: контроллер получает исход
 * заливки и сбрасывает медиа при смене сессии.
 *
 * Заливку и скачивание связывают свои копии: пока сервер не отдаёт только что отправленный
 * файл (карантин CDR — 504, привязка к комнате ещё не записана — 403), показываем свои байты.
 *
 * Одна запись заливки на черновик: мультизагрузка — это N черновиков, а очередь с лимитом
 * параллельности ляжет внутрь `upload()`, не меняя вызывающих.
 */
export class MatrixMedia implements MediaService {
  private readonly api: MediaApi

  // Живые заливки, по черновику.
  private readonly uploads = new Map<LocalId, AbortController>()
  // Свои залитые файлы, по mxc: подмена, пока сервер их не отдаёт.
  private readonly localCopies = new Map<string, Blob>()
  // Промисы байтов превью: заодно дедуп параллельных запросов одной картинки.
  private readonly previews = new Map<string, Promise<Blob>>()

  constructor(api: MediaApi) {
    this.api = api
  }

  /** Повторный вызов для того же черновика рвёт прежнюю попытку. */
  async upload(localId: LocalId, file: File, request: UploadRequest = {}): Promise<UploadOutcome> {
    this.uploads.get(localId)?.abort()

    const controller = new AbortController()
    this.uploads.set(localId, controller)

    try {
      const { content_uri } = await this.api.uploadMedia(file, {
        ...request,
        signal: controller.signal,
      })
      // Ответ мог приехать уже после отмены: файл на сервере есть, но отправлять его нельзя.
      if (controller.signal.aborted) return { status: 'aborted' }

      this.localCopies.set(content_uri, file)
      evictOldest(this.localCopies, MAX_LOCAL_COPIES_BYTES, (blob) => blob.size)

      return { status: 'uploaded', url: content_uri }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return { status: 'aborted' }

      return { status: 'failed', error }
    } finally {
      // По идентичности: финал прежней попытки не должен снять свежую.
      if (this.uploads.get(localId) === controller) this.uploads.delete(localId)
    }
  }

  cancel(localId: LocalId): void {
    this.uploads.get(localId)?.abort()
    this.uploads.delete(localId)
  }

  /** Возвращает черновики оборванных заливок в порядке старта. */
  abortAll(): LocalId[] {
    const localIds = [...this.uploads.keys()]

    this.uploads.forEach((controller) => controller.abort())
    this.uploads.clear()

    return localIds
  }

  /** Смена сессии — смена прав на медиа: чужие байты держать нельзя. */
  reset(): void {
    this.previews.clear()
    this.localCopies.clear()
  }

  loadPreview(mxcUrl: string, size: ThumbnailSize): Promise<Blob> {
    return this.withLocalFallback(mxcUrl, (parsed) => this.previewOrOriginal(parsed, size))
  }

  downloadFile(mxcUrl: string): Promise<Blob> {
    return this.withLocalFallback(mxcUrl, (parsed) => this.download(parsed))
  }

  private async withLocalFallback(
    mxcUrl: string,
    fetch: (parsed: ParsedMxcUrl) => Promise<Blob>,
  ): Promise<Blob> {
    const parsed = parseMxcUrl(mxcUrl)
    // Битую ссылку не вылечит ни повтор, ни ожидание вердикта.
    if (!parsed) throw new MediaUnavailableError('rejected')

    try {
      const blob = await fetch(parsed)
      // Сервер отдал файл сам — своя копия больше не нужна.
      this.localCopies.delete(mxcUrl)

      return blob
    } catch (err) {
      // 504 и 403 — ещё не вердикт «нет», а свои байты у нас есть.
      const local = this.localCopies.get(mxcUrl)
      if (local && (isMediaPendingError(err) || isForbiddenError(err))) return local

      throw new MediaUnavailableError(classifyMediaError(err), { cause: err })
    }
  }

  private async previewOrOriginal(parsed: ParsedMxcUrl, size: ThumbnailSize): Promise<Blob> {
    try {
      return await this.cachedPreview(parsed, size)
    } catch (err) {
      // 404 — превью не сгенерировано (нестандартный формат): отдаём оригинал, и мимо кэша,
      // потому что он на порядки тяжелее миниатюры.
      if (!isNotFoundError(err)) throw err

      return this.download(parsed)
    }
  }

  private cachedPreview(parsed: ParsedMxcUrl, size: ThumbnailSize): Promise<Blob> {
    const key = `${parsed.serverName}/${parsed.mediaId}#${size.width}x${size.height}`
    const cached = this.previews.get(key)
    if (cached) return cached

    const request = this.retryForbidden(() => this.api.getThumbnail(parsed, size)).catch(
      (err: unknown) => {
        // Упавший запрос в кэше не держим. Сверка по ссылке: поздний отказ запроса прежней
        // сессии не должен выбросить уже начатый запрос новой под тем же ключом.
        if (this.previews.get(key) === request) this.previews.delete(key)
        throw err
      },
    )

    this.previews.set(key, request)
    evictOldest(this.previews, MAX_CACHED_PREVIEWS)

    return request
  }

  private download(parsed: ParsedMxcUrl): Promise<Blob> {
    return this.retryForbidden(() => this.api.downloadMedia(parsed))
  }

  private async retryForbidden(call: () => Promise<Blob>): Promise<Blob> {
    try {
      return await call()
    } catch (err) {
      if (!isForbiddenError(err)) throw err

      await sleep(FORBIDDEN_RETRY_DELAY_MS)
      return call()
    }
  }
}
