import { describe, expect, it, vi } from 'vitest'
import { deferred, makeFile, makeMatrixApi } from '@/shared/testUtils/matrixFixtures'
import type { MatrixApi } from '../api/matrixApi'
import { MatrixError } from '../api/matrixError'
import { MatrixMedia } from './matrixMedia'

vi.mock(import('@/shared/utils/sleep'), () => ({ sleep: () => Promise.resolve() }))

type UploadMedia = MatrixApi['uploadMedia']
type UploadResponse = Awaited<ReturnType<UploadMedia>>

// Заливка, которая висит, пока тест её не завершит, и честно падает AbortError'ом на сигнале —
// как XHR в транспорте.
function controllableUploads() {
  const pending: { resolve: (value: UploadResponse) => void; signal: AbortSignal }[] = []

  const uploadMedia = vi.fn<UploadMedia>(
    (_file, options) =>
      new Promise<UploadResponse>((resolve, reject) => {
        const signal = options!.signal!
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        pending.push({ resolve, signal })
      }),
  )

  return { api: makeMatrixApi({ uploadMedia }), pending }
}

// Каждая заливка получает свой mxc, а сервер держит все файлы в карантине: так видно, чья
// локальная копия ещё жива.
function quarantinedUploads() {
  let uploaded = 0
  return makeMatrixApi({
    uploadMedia: vi.fn<UploadMedia>().mockImplementation(() => {
      uploaded += 1
      return Promise.resolve({ content_uri: `mxc://bank.ru/file${uploaded}` })
    }),
    downloadMedia: vi
      .fn<MatrixApi['downloadMedia']>()
      .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
  })
}

const MB = 1024 * 1024

// makeFile подменяет size, не создавая байтов: боевой потолок проверяется без 50 МБ в памяти.
const sized = (bytes: number) => makeFile('f.bin', bytes, 'application/octet-stream')

describe('MatrixMedia — заливка', () => {
  it('повторная заливка того же черновика рвёт прежнюю, а её поздний финал не снимает свежую', async () => {
    const { api, pending } = controllableUploads()
    const media = new MatrixMedia(api)

    const first = media.upload('m1', sized(1))
    const second = media.upload('m1', sized(1))

    await expect(first).resolves.toEqual({ status: 'aborted' })
    expect(pending[0]!.signal.aborted).toBe(true)

    // свежая попытка всё ещё числится живой: отмена до неё дотягивается
    media.cancel('m1')
    await expect(second).resolves.toEqual({ status: 'aborted' })
    expect(pending[1]!.signal.aborted).toBe(true)
  })

  it('отмена после ответа сервера, но до продолжения, всё равно даёт aborted', async () => {
    // пользователь нажал крестик, пока ответ ехал: файл на сервере есть, но отправлять его нельзя
    const { api, pending } = controllableUploads()
    const media = new MatrixMedia(api)

    const result = media.upload('m1', sized(1))
    pending[0]!.resolve({ content_uri: 'mxc://bank.ru/abc' })
    media.cancel('m1')

    await expect(result).resolves.toEqual({ status: 'aborted' })
  })

  it('abortAll рвёт все живые заливки и отдаёт их черновики в порядке старта', async () => {
    const { api, pending } = controllableUploads()
    const media = new MatrixMedia(api)

    const results = [media.upload('m1', sized(1)), media.upload('m2', sized(1))]

    expect(media.abortAll()).toEqual(['m1', 'm2'])
    expect(pending.every((p) => p.signal.aborted)).toBe(true)
    await expect(Promise.all(results)).resolves.toEqual([
      { status: 'aborted' },
      { status: 'aborted' },
    ])
    // после abortAll обрывать больше нечего
    expect(media.abortAll()).toEqual([])
  })

  it('потолок локальных копий считается по байтам: вытесняются старшие', async () => {
    const media = new MatrixMedia(quarantinedUploads())

    // три файла по 20 МБ не влезают в 50 МБ — первый уходит
    for (let i = 0; i < 3; i += 1) await media.upload(`m${i}`, sized(20 * MB))

    // самая давняя копия вытеснена — ошибка карантина дошла до UI
    await expect(media.downloadFile('mxc://bank.ru/file1')).rejects.toMatchObject({
      reason: 'pending',
    })
    await expect(media.downloadFile('mxc://bank.ru/file2')).resolves.toBeInstanceOf(Blob)
    await expect(media.downloadFile('mxc://bank.ru/file3')).resolves.toBeInstanceOf(Blob)
  })

  it('свежая копия больше потолка остаётся: свой файл важнее лимита', async () => {
    // иначе крупная картинка пропадала бы из ленты до вердикта CDR сразу после отправки
    const media = new MatrixMedia(quarantinedUploads())

    await media.upload('m1', sized(4 * MB))
    await media.upload('m2', sized(60 * MB))

    await expect(media.downloadFile('mxc://bank.ru/file1')).rejects.toMatchObject({
      reason: 'pending',
    })
    await expect(media.downloadFile('mxc://bank.ru/file2')).resolves.toBeInstanceOf(Blob)
  })
})

describe('MatrixMedia — превью и скачивание', () => {
  it('превью одной картинки качается один раз на все ряды, оригинал — каждый раз заново', async () => {
    const thumb = deferred<Blob>()
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockReturnValue(thumb.promise),
    })
    const media = new MatrixMedia(api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    // два ряда просят одно превью, пока первый запрос ещё в полёте
    const inFlight = Promise.all([media.loadPreview(mxcUrl, size), media.loadPreview(mxcUrl, size)])
    thumb.resolve(new Blob(['thumb']))
    const [first, second] = await inFlight
    const afterCache = await media.loadPreview(mxcUrl, size)

    expect(api.getThumbnail).toHaveBeenCalledOnce()
    expect(second).toBe(first)
    expect(afterCache).toBe(first)

    // оригинал в кэш не кладём: многомегабайтному blob'у незачем висеть до конца сессии
    await media.downloadFile('mxc://bank.ru/abc')
    await media.downloadFile('mxc://bank.ru/abc')
    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })

  it('упавший запрос превью не залипает в кэше — повтор идёт в сеть заново', async () => {
    const blob = new Blob(['thumb'])
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValueOnce(new MatrixError('M_UNKNOWN', 'timeout', undefined, 500))
        .mockResolvedValue(blob),
    })
    const media = new MatrixMedia(api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await expect(media.loadPreview(mxcUrl, size)).rejects.toMatchObject({ reason: 'failed' })

    // без выброса записи повтор вернул бы тот же отклонённый (а при зависании — вечный) промис
    await expect(media.loadPreview(mxcUrl, size)).resolves.toBe(blob)
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  // Локальная копия своего файла — не приоритет, а подмена на время карантина CDR: сервер
  // чистит файл (пересжатие, вычистка PDF), поэтому его версия важнее нашей везде, кроме 504.
  it('пока свой файл в карантине (504) показываем локальную копию', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
    })
    const media = new MatrixMedia(api)
    const file = makeFile('photo.png', 1, 'image/png')
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await media.upload('m1', file)

    // сначала спрашиваем сервер и только на «ещё не готово» подставляем свои байты
    await expect(media.loadPreview(mxcUrl, size)).resolves.toBe(file)
    expect(api.getThumbnail).toHaveBeenCalledOnce()

    // подмена живёт снаружи кэша: осядь локальный blob под ключом превью — за очищенной
    // сервером версией мы не сходили бы уже никогда
    await expect(media.loadPreview(mxcUrl, size)).resolves.toBe(file)
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  // Право на файл появляется вместе с записью привязки к комнате, и свой же файл может
  // получить 403 сразу после отправки. Отложенный повтор внутри — не гарантия: показать
  // отправителю ошибку по файлу, который лежит у нас в памяти, хуже, чем показать сам файл.
  it('403, переживший повтор, тоже подменяется локальной копией', async () => {
    const api = makeMatrixApi({
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_FORBIDDEN', 'no access', undefined, 403)),
    })
    const media = new MatrixMedia(api)
    const file = makeFile('doc.pdf', 1, 'application/pdf')

    await media.upload('m1', file)

    await expect(media.downloadFile('mxc://bank.ru/abc')).resolves.toBe(file)
  })

  // Оригинал на порядки тяжелее миниатюры: одна такая запись обесценила бы лимит,
  // посчитанный в записях, поэтому подмена превью оригиналом мимо кэша.
  it('оригинал, отданный вместо несгенерированного превью, в кэш не попадает', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'no thumbnail', undefined, 404)),
    })
    const media = new MatrixMedia(api)
    const size = { width: 320, height: 240 }

    await media.loadPreview('mxc://bank.ru/abc', size)
    await media.loadPreview('mxc://bank.ru/abc', size)

    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })

  it('отбракованный CDR свой файл не подменяем локальной копией — иначе отправитель не узнает об отказе', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'rejected', undefined, 404)),
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_NOT_FOUND', 'rejected', undefined, 404)),
    })
    const media = new MatrixMedia(api)

    await media.upload('m1', makeFile('photo.png', 1, 'image/png'))

    await expect(
      media.loadPreview('mxc://bank.ru/abc', { width: 320, height: 240 }),
    ).rejects.toMatchObject({ reason: 'rejected' })
  })

  it('после успешной отдачи с сервера локальная копия освобождается', async () => {
    const served = new Blob(['clean'])
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockResolvedValue(served),
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValue(new MatrixError('M_NOT_YET_UPLOADED', 'quarantine', undefined, 504)),
    })
    const media = new MatrixMedia(api)
    const mxcUrl = 'mxc://bank.ru/abc'

    await media.upload('m1', makeFile('photo.png', 1, 'image/png'))

    // вернулась очищенная сервером версия, а не наш оригинал
    await expect(media.loadPreview(mxcUrl, { width: 320, height: 240 })).resolves.toBe(served)

    // копии больше нет: даже на 504 подставлять нечего, ошибка доходит до UI
    await expect(media.downloadFile(mxcUrl)).rejects.toMatchObject({ reason: 'pending' })
  })

  it('reset() сбрасывает кэш превью: чужие байты в новой сессии недоступны', async () => {
    const api = makeMatrixApi()
    const media = new MatrixMedia(api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    await media.loadPreview(mxcUrl, size)
    media.reset()
    await media.loadPreview(mxcUrl, size)

    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  // Кэш превью хранит промис, и упавший запрос сам себя из него удаляет. Ключ при этом один
  // на файл и размер, поэтому поздний отказ запроса прежней сессии обязан проверить, его ли
  // запись лежит под ключом: иначе он выбрасывает уже начатый запрос новой сессии, и картинка
  // качается заново на каждый ремаунт ряда.
  it('поздний отказ прежней сессии не выбрасывает кэш новой', async () => {
    const stale = deferred<Blob>()
    const fresh = new Blob(['fresh'])
    const api = makeMatrixApi({
      getThumbnail: vi
        .fn<MatrixApi['getThumbnail']>()
        .mockReturnValueOnce(stale.promise)
        .mockResolvedValue(fresh),
    })
    const media = new MatrixMedia(api)
    const mxcUrl = 'mxc://bank.ru/abc'
    const size = { width: 320, height: 240 }

    const staleRequest = expect(media.loadPreview(mxcUrl, size)).rejects.toMatchObject({
      reason: 'failed',
    })
    media.reset()
    expect(await media.loadPreview(mxcUrl, size)).toBe(fresh)

    stale.reject(new MatrixError('M_UNKNOWN', 'timeout', undefined, 500))
    await staleRequest

    expect(await media.loadPreview(mxcUrl, size)).toBe(fresh)
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })
})

describe('MatrixMedia — ошибки сервера', () => {
  const MXC = 'mxc://bank.ru/abc'
  const SIZE = { width: 320, height: 240 }

  function mediaError(status: number): MatrixError {
    return new MatrixError('M_UNKNOWN', 'media', undefined, status)
  }

  it('404 у превью означает «это не изображение» — идём за оригиналом', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockRejectedValue(mediaError(404)),
    })
    const media = new MatrixMedia(api)

    await media.loadPreview(MXC, SIZE)

    expect(api.downloadMedia).toHaveBeenCalledOnce()
  })

  it('504 (файл ещё в карантине CDR) не подменяется скачиванием оригинала', async () => {
    const api = makeMatrixApi({
      getThumbnail: vi.fn<MatrixApi['getThumbnail']>().mockRejectedValue(mediaError(504)),
    })
    const media = new MatrixMedia(api)

    // наружу уходит доменная причина: коды провода за границу matrix/ не проходят
    await expect(media.loadPreview(MXC, SIZE)).rejects.toMatchObject({
      name: 'MediaUnavailableError',
      reason: 'pending',
    })
    expect(api.downloadMedia).not.toHaveBeenCalled()
  })

  it('403 повторяется ровно один раз — writer мог не успеть записать привязку файла', async () => {
    const api = makeMatrixApi({
      downloadMedia: vi
        .fn<MatrixApi['downloadMedia']>()
        .mockRejectedValueOnce(mediaError(403))
        .mockResolvedValue(new Blob(['bytes'])),
    })
    const media = new MatrixMedia(api)

    await media.downloadFile(MXC)

    expect(api.downloadMedia).toHaveBeenCalledTimes(2)
  })
})
