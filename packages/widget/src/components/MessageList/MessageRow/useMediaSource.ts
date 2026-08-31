import { useCallback, useEffect, useRef, useState } from 'react'
import { toMediaFailure } from '../../../domain/mediaError'
import type { ThumbnailSize } from '../../../matrix/api/matrixApi'
import { useChatActions } from '../../../hooks/useChatActions'
import { useChatStore } from '../../../hooks/useChatStore'
import { parseMxcUrl } from '../../../shared/utils/mxc'
import { selectMediaVerdicts } from '../../../store/selectors'

/**
 * `checking` и `rejected` — состояния конвейера проверки файла на сервере. Два источника:
 * код ответа download'а (504 / 404) — фолбэк, пока вердикта не было; и `kc.media.status` из
 * `/sync` — как только он приходит, читаем его напрямую (для `rejected` — вообще без сети) и
 * подталкиваем застрявший `checking` к повторной попытке.
 */
export type MediaSource =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'checking' }
  | { status: 'ready'; url: string }
  | { status: 'rejected' }
  | { status: 'error'; retry: () => void }

interface Options {
  mxcUrl: string
  size: ThumbnailSize
}

const IDLE: MediaSource = { status: 'idle' }
const LOADING: MediaSource = { status: 'loading' }
const CHECKING: MediaSource = { status: 'checking' }
const REJECTED: MediaSource = { status: 'rejected' }

/**
 * Байты держит кэш контроллера (общий на все ряды), а object-URL — этот хук: он живёт ровно
 * столько, сколько компонент, поэтому revoke всегда безопасен и не бьёт по чужой картинке.
 */
export function useMediaSource({ mxcUrl, size }: Options): MediaSource {
  const { width, height } = size

  const { loadPreview } = useChatActions()

  const verdicts = useChatStore(selectMediaVerdicts)
  const mediaId = mxcUrl ? parseMxcUrl(mxcUrl)?.mediaId : undefined
  const verdict = mediaId ? verdicts[mediaId] : undefined

  const isRejected = verdict?.status === 'rejected'

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  // Результат хранится вместе с ключом запроса: смена ключа сама возвращает нас в loading,
  // без setState в теле эффекта и лишнего рендера.
  const [result, setResult] = useState<{ key: string; source: MediaSource } | null>(null)
  const key = mxcUrl ? `${mxcUrl}#${width}x${height}#${attempt}` : ''

  useEffect(() => {
    // Вердикт уже отрицателен — сеть не нужна вовсе, сервер уже вынес финальное «нет».
    // Сам REJECTED вернётся ниже как производное значение — эффекту тут делать нечего.
    if (!key || isRejected) return

    let cancelled = false
    let objectUrl: string | null = null

    void loadPreview(mxcUrl, { width, height })
      .then((blob) => {
        if (cancelled) return

        objectUrl = URL.createObjectURL(blob)
        setResult({ key, source: { status: 'ready', url: objectUrl } })
      })
      .catch((err: unknown) => {
        if (cancelled) return

        const failure = toMediaFailure(err)
        const source =
          failure === 'pending'
            ? CHECKING
            : failure === 'rejected'
              ? REJECTED
              : { status: 'error' as const, retry }

        setResult({ key, source })
      })

    return () => {
      cancelled = true
      if (!objectUrl) return

      // Результат выбрасываем вместе с URL: `<Activity mode="hidden">` размонтирует эффекты,
      // но сохраняет состояние — иначе при возврате в панель первый рендер отдал бы в <img>
      // уже отозванный blob. Кэш контроллера вернёт байты микротактом, скелетон не заметен.
      URL.revokeObjectURL(objectUrl)
      setResult(null)
    }
    // В зависимостях isRejected, а не verdict?.status: перезапуск нужен только на переходе
    // в rejected — он гасит сеть и снимает картинку. На переходе undefined → ready эффект
    // перезапускаться не должен: его cleanup отозвал бы object-URL уже показанной картинки,
    // и пользователь увидел бы спиннер поверх того, на что он смотрит. Состояние ready и так
    // приходит производным значением ниже.
  }, [key, mxcUrl, width, height, loadPreview, retry, isRejected])

  // Вердикт ready подталкивает застрявший checking: 504 означал «файл ещё в карантине», после
  // вердикта его уже отдадут. Отдельным эффектом, а не зависимостью основного: там перезапуск
  // отозвал бы object-URL уже показанной картинки. Ref гарантирует ровно одну попытку на
  // приход вердикта — иначе повторный 504 крутил бы бесконечный цикл.
  const readyRetriedRef = useRef(false)
  useEffect(() => {
    if (verdict?.status !== 'ready') {
      readyRetriedRef.current = false
      return
    }
    if (readyRetriedRef.current) return
    if (result?.key !== key || result.source.status !== 'checking') return

    // Вердикт приходит из /sync, то есть из внешней системы, и единственная реакция на него
    // здесь — перезапустить запрос. Каскад ограничен ref'ом: ровно один повтор на вердикт.
    readyRetriedRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- см. комментарий выше
    retry()
  }, [verdict?.status, result, key, retry])

  if (!key) return IDLE
  // Вердикт приоритетнее любого сетевого результата — актуален и тогда, когда он пришёл
  // уже после того, как сеть успела вернуть что-то другое (например, ещё не 404).
  if (isRejected) return REJECTED

  return result?.key === key ? result.source : LOADING
}
